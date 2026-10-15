import {randomBytes,createHash} from 'node:crypto';
import {readFile,mkdir,writeFile,rename} from 'node:fs/promises';
import {dirname} from 'node:path';
import {OAuth2Client} from 'google-auth-library';

export function createAuth({clientId='',origin='http://127.0.0.1:4173',adminEmails=[],file='data/accounts.json',verify,now=Date.now,demo=false,shared,captions}={}){
 const sessions=new Map(),attempts=new Map(),google=new OAuth2Client(clientId);
 let accounts=[],queue=Promise.resolve();
 const ready=readFile(file,'utf8').then(s=>{accounts=JSON.parse(s);}).catch(e=>{if(e.code!=='ENOENT')throw e;});
 const admins=new Set(adminEmails.map(s=>s.trim().toLowerCase()).filter(Boolean));
 const demoEnabled=demo&&!clientId&&['localhost','127.0.0.1'].includes(new URL(origin).hostname);
 const hash=s=>createHash('sha256').update(s).digest('hex');
 const publicUser=u=>({id:u.id,email:u.email,name:u.name,role:u.role,disabled:u.disabled});
 const commit=async()=>{await mkdir(dirname(file),{recursive:true});await writeFile(file+'.tmp',JSON.stringify(accounts,null,2));await rename(file+'.tmp',file);};
 const mutate=fn=>{const result=queue.then(fn);queue=result.catch(()=>{});return result;};
 const cookie=(token,age)=>`ln_session=${token}; HttpOnly; SameSite=Lax; Path=/; Max-Age=${age}${origin.startsWith('https:')?'; Secure':''}`;
 return async function handle(req,res,path){
  if(!path.startsWith('/api/'))return false;
  res.setHeader('Cache-Control','no-store');
  const reply=(status,data)=>{res.writeHead(status,{'Content-Type':'application/json; charset=utf-8'});res.end(JSON.stringify(data));return true;};
  try{
   await ready;
   if(!['GET','HEAD'].includes(req.method)&&req.headers.origin!==origin)return reply(403,{error:'Nguồn yêu cầu không hợp lệ.'});
   const raw=(req.headers.cookie||'').split(';').map(s=>s.trim()).find(s=>s.startsWith('ln_session='))?.slice(11);
   const session=raw?sessions.get(hash(raw)):null;
   const user=session&&session.expires>now()?accounts.find(u=>u.id===session.id&&!u.disabled):null;
   if(path==='/api/session'&&req.method==='GET')return reply(200,{configured:!!clientId,demo:demoEnabled,clientId,user:user?publicUser(user):null});
   const body=async()=>{let text='';for await(const chunk of req){text+=chunk;if(Buffer.byteLength(text)>16384)throw Error('Yêu cầu quá lớn.');}return JSON.parse(text||'{}');};
   if((path==='/api/login'||path==='/api/demo-login')&&req.method==='POST'){
    const isDemo=path==='/api/demo-login';
    if(isDemo?!demoEnabled:!clientId)return reply(503,{error:'Phương thức đăng nhập chưa được bật.'});
    const key=req.socket.remoteAddress,stamp=now();
    if(attempts.size>10000)for(const [k,v]of attempts)if(stamp-v.start>60000)attempts.delete(k);
    let rate=attempts.get(key);if(!rate||stamp-rate.start>60000)attempts.set(key,rate={start:stamp,count:0});
    if(++rate.count>20)return reply(429,{error:'Vui lòng thử lại sau một phút.'});
    const data=await body(),credential=data.credential;
    let payload;
    if(isDemo){
     const profiles={admin:['Admin dùng thử','admin'],member:['Thành viên 1','member'],member2:['Thành viên 2','member']};
     const profile=profiles[data.account];if(!profile)return reply(400,{error:'Tài khoản dùng thử không hợp lệ.'});
     payload={sub:'demo-'+data.account,name:profile[0],email:data.account+'@demo.local',email_verified:true,demoRole:profile[1]};
    }else{
     if(typeof credential!=='string')return reply(400,{error:'Thiếu thông tin đăng nhập.'});
     try{payload=verify?await verify(credential):(await google.verifyIdToken({idToken:credential,audience:clientId})).getPayload();}catch{return reply(401,{error:'Đăng nhập Google không hợp lệ hoặc đã hết hạn.'});}
    }
    if(!payload?.sub||!payload.email||payload.email_verified!==true)return reply(401,{error:'Tài khoản Google chưa xác minh email.'});
    const account=await mutate(async()=>{let u=accounts.find(u=>u.id===payload.sub);if(!u){u={id:payload.sub,email:payload.email,name:payload.name||payload.email,role:isDemo?payload.demoRole:admins.has(payload.email.toLowerCase())?'admin':'member',disabled:false};accounts.push(u);}else{u.email=payload.email;u.name=payload.name||payload.email;}await commit();return u;});
    if(account.disabled)return reply(403,{error:'Tài khoản đã bị khóa.'});
    if(raw)sessions.delete(hash(raw));for(const [k,v]of sessions)if(v.expires<=now())sessions.delete(k);
    const token=randomBytes(32).toString('base64url');sessions.set(hash(token),{id:account.id,expires:now()+7*86400000});res.setHeader('Set-Cookie',cookie(token,7*86400));return reply(200,{user:publicUser(account)});
   }
   if(path==='/api/logout'&&req.method==='POST'){if(raw)sessions.delete(hash(raw));res.setHeader('Set-Cookie',cookie('',0));return reply(200,{ok:true});}
   if(!user)return reply(401,{error:'Vui lòng đăng nhập.'});
   if(captions&&await captions(req,res,path,user))return true;
   if(shared&&await shared(req,res,path,user))return true;
   if(path==='/api/accounts'&&req.method==='GET'){if(user.role!=='admin')return reply(403,{error:'Chỉ quản trị viên được quản lý tài khoản.'});return reply(200,{accounts:accounts.map(publicUser)});}
   if(path.startsWith('/api/accounts/')&&req.method==='PATCH'){
    if(user.role!=='admin')return reply(403,{error:'Không có quyền quản lý tài khoản.'});
    const id=decodeURIComponent(path.slice('/api/accounts/'.length)),data=await body();
    return await mutate(async()=>{
     const target=accounts.find(u=>u.id===id);if(!target)return reply(404,{error:'Không tìm thấy tài khoản.'});
     if(id===user.id)return reply(400,{error:'Không thể tự đổi quyền hoặc khóa tài khoản của mình.'});
     if(!['admin','member'].includes(data.role)||typeof data.disabled!=='boolean')return reply(400,{error:'Quyền hoặc trạng thái không hợp lệ.'});
     target.role=data.role;target.disabled=data.disabled;await commit();
     for(const [k,v]of sessions)if(v.id===id)sessions.delete(k);
     return reply(200,{user:publicUser(target)});
    });
   }
   return reply(404,{error:'Không tìm thấy chức năng.'});
  }catch{return reply(500,{error:'Không thể xử lý yêu cầu tài khoản.'});}
 };
}
