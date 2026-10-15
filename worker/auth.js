import {createRemoteJWKSet,jwtVerify} from 'jose';

const googleKeys=createRemoteJWKSet(new URL('https://www.googleapis.com/oauth2/v3/certs'));
const encoder=new TextEncoder();
export const hash=async value=>Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',encoder.encode(value))),b=>b.toString(16).padStart(2,'0')).join('');
const token=()=>Array.from(crypto.getRandomValues(new Uint8Array(32)),b=>b.toString(16).padStart(2,'0')).join('');
export const json=(data,status=200,headers={})=>Response.json(data,{status,headers:{'Cache-Control':'no-store',...headers}});
const cookie=(name,value,age)=>`${name}=${value}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=${age}`;
const readCookie=(req,name)=>(req.headers.get('cookie')||'').split(';').map(s=>s.trim()).find(s=>s.startsWith(name+'='))?.slice(name.length+1);
const publicUser=user=>({id:user.id,email:user.email,name:user.name,role:user.role,disabled:user.disabled});
export async function readJson(request,limit=16384){
 const reader=request.body?.getReader();if(!reader)return {};let bytes=0;const chunks=[];
 try{for(;;){const {value,done}=await reader.read();if(done)break;bytes+=value.length;if(bytes>limit){await reader.cancel();throw Object.assign(Error('Yêu cầu quá lớn.'),{status:413});}chunks.push(value);}}finally{reader.releaseLock();}
 const data=new Uint8Array(bytes);let offset=0;for(const chunk of chunks){data.set(chunk,offset);offset+=chunk.length;}
 try{return JSON.parse(new TextDecoder().decode(data)||'{}');}catch{throw Object.assign(Error('Dữ liệu không hợp lệ.'),{status:400});}
}
export function createCloudAuth({verify=async(credential,clientId)=>(await jwtVerify(credential,googleKeys,{algorithms:['RS256'],audience:clientId,issuer:['https://accounts.google.com','accounts.google.com'],clockTolerance:10})).payload,now=Date.now}={}){
 const attempts=new Map();
 const accountKey=async id=>'accounts/'+await hash(id)+'.json';
 async function readUser(env,id){const object=await env.BUCKET.get(await accountKey(id));return object?{user:await object.json(),etag:object.etag}:null;}
 async function saveUser(env,user,etag){return env.BUCKET.put(await accountKey(user.id),JSON.stringify(user),{onlyIf:etag?{etagMatches:etag}:{etagDoesNotMatch:'*'},httpMetadata:{contentType:'application/json'}});}
 async function sessionUser(request,env){
  const value=readCookie(request,'__Host-ln_session');if(!value||!/^[a-f0-9]{64}$/.test(value))return null;
  const key='sessions/'+await hash(value)+'.json',object=await env.BUCKET.get(key);if(!object)return null;
  const session=await object.json();if(session.expires<=now()){await env.BUCKET.delete(key);return null;}
  const account=await readUser(env,session.id);if(!account||account.user.disabled||account.user.revision!==session.revision)return null;return account.user;
 }
 async function handle(request,env){
  const path=new URL(request.url).pathname;
  if(path==='/api/session'){
   const user=env.BUCKET?await sessionUser(request,env):null;
   const nonce=token();return json({configured:!!env.GOOGLE_CLIENT_ID,demo:false,clientId:env.GOOGLE_CLIENT_ID||'',nonce,user:user?publicUser(user):null,sharedUploadMaxBytes:90*1024*1024},200,user?{}:{'Set-Cookie':cookie('__Host-ln_nonce',nonce,600)});
  }
  if(!env.BUCKET)return json({error:'Dịch vụ tài khoản chưa sẵn sàng.'},503);
  if(!['GET','HEAD'].includes(request.method)){
   const allowed=(env.APP_ORIGINS||env.APP_ORIGIN||'').split(',').map(s=>s.trim());
   if(!allowed.includes(request.headers.get('origin')))return json({error:'Nguồn yêu cầu không hợp lệ.'},403);
  }
  if(path==='/api/login'&&request.method==='POST'){
   if(!env.GOOGLE_CLIENT_ID)return json({error:'Chưa cấu hình Google.'},503);
   const key=request.headers.get('CF-Connecting-IP')||'unknown';let rate=attempts.get(key);if(!rate||now()-rate.start>60000)attempts.set(key,rate={start:now(),count:0});if(++rate.count>20)return json({error:'Vui lòng thử lại sau một phút.'},429);
   if(attempts.size>1000)for(const [id,value]of attempts)if(now()-value.start>60000)attempts.delete(id);
   const data=await readJson(request);if(typeof data?.credential!=='string')return json({error:'Thiếu thông tin Google.'},400);
   let identity;try{identity=await verify(data.credential,env.GOOGLE_CLIENT_ID);}catch{return json({error:'Đăng nhập Google không hợp lệ hoặc đã hết hạn.'},401);}
   const nonce=readCookie(request,'__Host-ln_nonce');if(!nonce||identity.nonce!==nonce)return json({error:'Phiên đăng nhập đã thay đổi. Tải lại trang rồi thử lại.'},401);
   if(!identity.sub||typeof identity.sub!=='string'||!identity.email||identity.email_verified!==true)return json({error:'Tài khoản Google chưa xác minh email.'},401);
   const used=await env.BUCKET.put('nonces/'+await hash(nonce),String(now()+600000),{onlyIf:{etagDoesNotMatch:'*'}});if(!used)return json({error:'Phiên đăng nhập đã được sử dụng. Tải lại trang.'},401);
   let record=await readUser(env,identity.sub);
   if(!record){const admins=(env.ADMIN_EMAILS||'').split(',').map(s=>s.trim().toLowerCase());const user={id:identity.sub,email:identity.email,name:identity.name||identity.email,role:admins.includes(identity.email.toLowerCase())?'admin':'member',disabled:false,revision:crypto.randomUUID()};await saveUser(env,user);record=await readUser(env,identity.sub);}
   if(!record||record.user.disabled)return json({error:'Tài khoản đã bị khóa.'},403);
   const value=token(),expires=now()+7*86400000;await env.BUCKET.put('sessions/'+await hash(value)+'.json',JSON.stringify({id:record.user.id,revision:record.user.revision,expires}));
   const response=json({user:publicUser(record.user)});response.headers.append('Set-Cookie',cookie('__Host-ln_session',value,7*86400));response.headers.append('Set-Cookie',cookie('__Host-ln_nonce','',0));return response;
  }
  if(path==='/api/logout'&&request.method==='POST'){
   const value=readCookie(request,'__Host-ln_session');if(value)await env.BUCKET.delete('sessions/'+await hash(value)+'.json');return json({ok:true},200,{'Set-Cookie':cookie('__Host-ln_session','',0)});
  }
  const user=await sessionUser(request,env);if(!user)return json({error:'Vui lòng đăng nhập.'},401);
  if(path==='/api/accounts'&&request.method==='GET'){
   if(user.role!=='admin')return json({error:'Chỉ Admin được quản lý tài khoản.'},403);
   const accounts=[];let cursor;
   do{const list=await env.BUCKET.list({prefix:'accounts/',cursor,limit:500});for(const item of list.objects){const object=await env.BUCKET.get(item.key);if(object)accounts.push(publicUser(await object.json()));}cursor=list.truncated?list.cursor:undefined;}while(cursor);
   return json({accounts});
  }
  if(path.startsWith('/api/accounts/')&&request.method==='PATCH'){
   if(user.role!=='admin')return json({error:'Không có quyền quản lý tài khoản.'},403);
   const id=decodeURIComponent(path.slice('/api/accounts/'.length));if(id===user.id)return json({error:'Không thể tự đổi quyền hoặc khóa tài khoản của mình.'},400);
   const data=await readJson(request);if(!data||!['admin','member'].includes(data.role)||typeof data.disabled!=='boolean')return json({error:'Quyền hoặc trạng thái không hợp lệ.'},400);
   const old=await readUser(env,id);if(!old)return json({error:'Không tìm thấy tài khoản.'},404);
   const updated={...old.user,role:data.role,disabled:data.disabled,revision:crypto.randomUUID()};if(!await saveUser(env,updated,old.etag))return json({error:'Tài khoản vừa thay đổi. Tải lại danh sách.'},409);return json({user:publicUser(updated)});
  }
  return {user};
 }
 return {handle};
}
