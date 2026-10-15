import test from 'node:test';
import assert from 'node:assert/strict';
import {studyApi} from '../worker/study.js';
class Bucket{
 objects=new Map();
 async get(key){const item=this.objects.get(key);return item?{etag:item.etag,json:async()=>JSON.parse(item.value)}:null;}
 async put(key,value,options={}){const old=this.objects.get(key);if(options.onlyIf?.etagDoesNotMatch==='*'&&old||options.onlyIf?.etagMatches&&old?.etag!==options.onlyIf.etagMatches)return null;const item={etag:crypto.randomUUID(),value:String(value)};this.objects.set(key,item);return item;}
 async delete(key){this.objects.delete(key);}
}
test('private sync isolates accounts including Admin, retries idempotently and rejects stale revisions',async()=>{
 const env={BUCKET:new Bucket()},alice={id:'alice',role:'member'},bob={id:'bob',role:'admin'};
 const call=(user,method='GET',data)=>studyApi(new Request('https://audio.ttpq.net/api/study',{method,...(data?{body:JSON.stringify(data)}:{})}),env,user);
 const data={record:{id:'vocab-1',kind:'vocab',term:'hello'},operation_id:'op-1',base_revision:0};
 let r=await call(alice,'PUT',data);assert.equal(r.status,200);assert.equal((await r.json()).record.revision,1);
 assert.equal((await (await call(bob)).json()).records.length,0);
 assert.equal((await (await call(alice,'PUT',data)).json()).replayed,true);
 r=await call(alice,'PUT',{...data,operation_id:'op-other',record:{...data.record,term:'changed'}});assert.equal(r.status,409);assert.equal((await r.json()).record.term,'hello');
 r=await call(alice,'PUT',{...data,base_revision:1,operation_id:'op-2',record:{...data.record,term:'changed'}});assert.equal((await r.json()).record.revision,2);
 assert.equal((await call(alice,'PUT',{...data,record:{id:'__proto__',kind:'vocab'}})).status,400);
 assert.equal((await call(alice,'DELETE')).status,200);const deleted=(await (await call(alice)).json()).records[0];assert.equal(deleted.deleted,true);assert.equal(deleted.revision,3);
});
