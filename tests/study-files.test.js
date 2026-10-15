import test from 'node:test';
import assert from 'node:assert/strict';
import {studyApi} from '../worker/study.js';
import {ensureUpgradeBackup} from '../worker/upgrade-backup.js';
import {hash} from '../worker/auth.js';
class Bucket{
 objects=new Map();
 async get(key){const item=this.objects.get(key);if(!item)return null;return {etag:item.etag,size:item.bytes.length,body:new Blob([item.bytes]).stream(),json:async()=>JSON.parse(new TextDecoder().decode(item.bytes))};}
 async put(key,value,options={}){const old=this.objects.get(key);if(options.onlyIf?.etagDoesNotMatch==='*'&&old||options.onlyIf?.etagMatches&&old?.etag!==options.onlyIf.etagMatches)return null;const bytes=new Uint8Array(await new Response(value).arrayBuffer());const item={etag:crypto.randomUUID(),bytes};this.objects.set(key,item);return item;}
 async delete(key){this.objects.delete(key);}
 async list({prefix,limit=1000,cursor}){const keys=[...this.objects.keys()].filter(k=>k.startsWith(prefix)).sort(),offset=Number(cursor)||0;return {objects:keys.slice(offset,offset+limit).map(key=>({key})),truncated:offset+limit<keys.length,cursor:String(offset+limit)};}
}
test('upgrade backup is resumable and excludes session credentials and private study data',async()=>{
 const bucket=new Bucket();await bucket.put('accounts/a.json','{"role":"admin"}');await bucket.put('shared/audio/a','audio');await bucket.put('sessions/secret.json','secret');await bucket.put('private-study/private.json','private');
 assert.equal(await ensureUpgradeBackup(bucket),null);assert.ok(await bucket.get('upgrade-backups/pre-v35/accounts/a.json'));assert.ok(await bucket.get('upgrade-backups/pre-v35/shared/audio/a'));assert.equal(await bucket.get('upgrade-backups/pre-v35/sessions/secret.json'),null);assert.equal(await bucket.get('upgrade-backups/pre-v35/private-study/private.json'),null);const size=bucket.objects.size;assert.equal(await ensureUpgradeBackup(bucket),null);assert.equal(bucket.objects.size,size);
});
test('cloud audio validates content, checksum, size, per-account access and deletion',async()=>{
 const original=crypto.DigestStream;
 crypto.DigestStream=class extends WritableStream{
  constructor(algorithm){const chunks=[];let resolve,reject;const digest=new Promise((a,b)=>{resolve=a;reject=b;});super({write(c){chunks.push(c);},async close(){try{resolve(await crypto.subtle.digest(algorithm,await new Blob(chunks).arrayBuffer()));}catch(e){reject(e);}}});this.digest=digest;}
 };
 const env={BUCKET:new Bucket()},user={id:'file-owner',role:'member'},other={id:'other',role:'admin'};
 const call=(id,method,body,userArg=user)=>studyApi(new Request('https://audio.ttpq.net/api/study/files/'+id,{method,headers:{'Content-Type':'audio/mpeg',...(body?{'Content-Length':String(body.length)}:{})},...(body?{body}:{} )}),env,userArg);
 try{
  const bytes=new TextEncoder().encode('ID3small-test-audio'),id=await hash('ID3small-test-audio');assert.equal((await call(id,'PUT',bytes)).status,200);assert.equal((await call(id,'GET')).status,200);assert.equal((await call(id,'GET',null,other)).status,404);
  assert.equal((await call('a'.repeat(64),'PUT',bytes)).status,400);const invalid=new TextEncoder().encode('<html>not audio</html>');assert.equal((await call(await hash('<html>not audio</html>'),'PUT',invalid)).status,400);
  await studyApi(new Request('https://audio.ttpq.net/api/study',{method:'DELETE'}),env,user);assert.equal((await call(id,'GET')).status,404);
 }finally{if(original)crypto.DigestStream=original;else delete crypto.DigestStream;}
});
