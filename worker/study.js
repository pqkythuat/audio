import {hash,json,readJson} from './auth.js';
const kinds=new Set(['lesson','subtitle','draft','dictation','progress','vocab','recording','settings']);
const validId=id=>typeof id==='string'&&id.length>0&&id.length<=2048&&!['__proto__','constructor','prototype'].includes(id);
export async function studyApi(request,env,user){
 const url=new URL(request.url),path=url.pathname,bucket=env.BUCKET;
 if(path==='/api/admin/backup'&&request.method==='POST'){
  if(user.role!=='admin')return json({error:'Chỉ Admin được sao lưu dữ liệu dùng chung.'},403);
  const data=await readJson(request),backupId=data.backupId||crypto.randomUUID();if(!/^[a-f0-9-]{36}$/.test(backupId))return json({error:'ID bản sao không hợp lệ.'},400);
  const list=await bucket.list({cursor:data.cursor||undefined,limit:20});let copied=0;
  for(const item of list.objects)if(item.key.startsWith('accounts/')||item.key.startsWith('shared/')){const object=await bucket.get(item.key);if(object){await bucket.put('backups/'+backupId+'/'+item.key,object.body,{httpMetadata:object.httpMetadata});copied++;}}
  await bucket.put('backup-manifests/'+backupId+'.json',JSON.stringify({schema_version:1,backupId,created_by:user.id,at:new Date().toISOString(),complete:!list.truncated}));
  return json({backupId,copied,cursor:list.truncated?list.cursor:null});
 }
 if(!path.startsWith('/api/study'))return null;
 const prefix='private-study/'+await hash(user.id)+'/',key=prefix+'index.json';
 const read=async()=>{const o=await bucket.get(key);return {data:o?await o.json():{records:{},files:{}},etag:o?.etag};};
 const save=(data,etag)=>bucket.put(key,JSON.stringify(data),{onlyIf:etag?{etagMatches:etag}:{etagDoesNotMatch:'*'}});
 if(path==='/api/study'&&request.method==='GET'){const {data}=await read();return json({schema_version:1,records:Object.values(data.records),files:data.files,server_time:new Date().toISOString()});}
 if(path==='/api/study'&&request.method==='PUT'){
  const {record,base_revision,operation_id}=await readJson(request,6*1024*1024);
  if(!record||!validId(record.id)||!kinds.has(record.kind)||typeof operation_id!=='string'||operation_id.length>100||!Number.isInteger(base_revision)||base_revision<0)return json({error:'Bản ghi đồng bộ không hợp lệ.'},400);
  for(let retry=0;retry<5;retry++){
   const {data,etag}=await read(),old=data.records[record.id];if(old?.operation_id===operation_id)return json({record:old,replayed:true});
   if((old?.revision||0)!==base_revision)return json({error:'Xung đột phiên bản. Cả hai bản phải được giữ.',record:old||null},409);
   if(Object.keys(data.records).length>=5000&&!old)return json({error:'Tối đa 5.000 bản ghi đồng bộ/tài khoản.'},413);
   const next={...record,revision:(old?.revision||0)+1,updated_at:new Date().toISOString(),operation_id,deleted:!!record.deleted};delete next.blob;delete next.audio;delete next.dirty;delete next.local_revision;
   if(next.deleted)next.deleted_at=new Date().toISOString();Object.defineProperty(data.records,record.id,{value:next,enumerable:true,configurable:true,writable:true});
   if(new TextEncoder().encode(JSON.stringify(data)).length>10*1024*1024)return json({error:'Metadata đồng bộ tối đa 10 MB/tài khoản.'},413);
   if(await save(data,etag))return json({record:next});
  }return json({error:'Đang có thiết bị khác đồng bộ. Thử lại.'},409);
 }
 const fileMatch=path.match(/^\/api\/study\/files\/([a-f0-9]{64})$/);
 if(fileMatch){
  const id=fileMatch[1],fileKey=prefix+'files/'+id;
  if(request.method==='GET'){
   const {data}=await read();if(!data.files[id]?.ready)return json({error:'File chưa sẵn sàng.'},404);
   const object=await bucket.get(fileKey);if(!object)return json({error:'Không tìm thấy file.'},404);return new Response(object.body,{headers:{'Content-Type':data.files[id].type,'Cache-Control':'no-store','X-Content-Type-Options':'nosniff','Content-Disposition':'attachment'}});
  }
  if(request.method==='PUT'){
   const size=Number(request.headers.get('content-length')),type=request.headers.get('content-type')||'';
   if(!Number.isInteger(size)||size<1||size>90*1024*1024)return json({error:'File đồng bộ tối đa 90 MB.'},413);
   if(!/^audio\/[a-z0-9.+-]+(?:;.*)?$/i.test(type))return json({error:'Chỉ nhận định dạng audio.'},400);
   let reserved=false;
   for(let retry=0;retry<5;retry++){const {data,etag}=await read();if(data.files[id]?.ready)return json({ok:true,hash:id,replayed:true});const used=Object.values(data.files).reduce((n,f)=>n+f.size,0)-(data.files[id]?.size||0);if(used+size>500*1024*1024)return json({error:'Kho đồng bộ tài khoản tối đa 500 MB.'},413);data.files[id]={size,type,ready:false,updated_at:new Date().toISOString()};if(await save(data,etag)){reserved=true;break;}}
   if(!reserved)return json({error:'Kho đang bận. Thử lại.'},409);
   // Browser supplies SHA-256; verify the uploaded object before making it available.
   await bucket.put(fileKey,request.body,{httpMetadata:{contentType:type}});
   const object=await bucket.get(fileKey);
   // Digest is streamed by the platform; no full-file buffer is held in the Worker.
   const reader=object.body.getReader(),digestStream=new crypto.DigestStream('SHA-256'),writer=digestStream.getWriter();let signature=new Uint8Array();
   for(;;){const {done,value}=await reader.read();if(done)break;if(signature.length<16){const joined=new Uint8Array(Math.min(16,signature.length+value.length));joined.set(signature);joined.set(value.slice(0,joined.length-signature.length),signature.length);signature=joined;}await writer.write(value);}await writer.close();
   const ascii=(start,end)=>new TextDecoder().decode(signature.slice(start,end));const recognized=ascii(0,3)==='ID3'||signature[0]===255&&(signature[1]&224)===224||ascii(4,8)==='ftyp'||ascii(0,4)==='RIFF'&&ascii(8,12)==='WAVE'||ascii(0,4)==='OggS'||ascii(0,4)==='fLaC'||signature[0]===26&&signature[1]===69&&signature[2]===223&&signature[3]===163||ascii(0,4)==='FORM'||ascii(0,5)==='#!AMR';
   const digest=Array.from(new Uint8Array(await digestStream.digest),b=>b.toString(16).padStart(2,'0')).join('');
   if(!recognized||digest!==id||object.size!==size){await bucket.delete(fileKey);for(let retry=0;retry<5;retry++){const {data,etag}=await read();delete data.files[id];if(await save(data,etag))break;}return json({error:'Nội dung audio, checksum hoặc dung lượng file không hợp lệ.'},400);}
   for(let retry=0;retry<5;retry++){const {data,etag}=await read();if(!data.files[id])return json({error:'Dữ liệu đã bị xóa trong lúc tải.'},409);data.files[id]={size,type,ready:true,updated_at:new Date().toISOString()};if(await save(data,etag))return json({ok:true,hash:id});}
   return json({error:'Chưa xác nhận được file. Thử đồng bộ lại.'},409);
  }
 }
 if(path==='/api/study'&&request.method==='DELETE'){
  // Retain tombstones, remove file bodies. CAS prevents deleting a concurrent upload silently.
  for(let retry=0;retry<5;retry++){const {data,etag}=await read();const time=new Date().toISOString();for(const r of Object.values(data.records))Object.assign(r,{deleted:true,deleted_at:time,updated_at:time,revision:r.revision+1});const files=Object.keys(data.files);data.files={};if(await save(data,etag)){for(const id of files)await bucket.delete(prefix+'files/'+id);return json({ok:true});}}
  return json({error:'Có thay đổi đồng thời. Thử lại.'},409);
 }
 return json({error:'Thao tác không được hỗ trợ.'},405);
}
