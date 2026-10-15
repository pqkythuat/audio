import test from 'node:test';
import assert from 'node:assert/strict';
import {indexedDB} from 'fake-indexeddb';
import {parseHTML} from 'linkedom';
import {openStudyStore} from '../dist/study-store.js';
import {createStudySync} from '../dist/study-sync.js';
import {studyApi} from '../worker/study.js';
class Bucket{
 objects=new Map();
 async get(key){const item=this.objects.get(key);return item?{etag:item.etag,json:async()=>JSON.parse(item.value)}:null;}
 async put(key,value,options={}){const old=this.objects.get(key);if(options.onlyIf?.etagDoesNotMatch==='*'&&old||options.onlyIf?.etagMatches&&old?.etag!==options.onlyIf.etagMatches)return null;const item={etag:crypto.randomUUID(),value:String(value)};this.objects.set(key,item);return item;}
 async delete(key){this.objects.delete(key);}
}
test('two devices sync and retain both sides of a subtitle conflict without silent overwrite',async()=>{
 globalThis.indexedDB=indexedDB;const {document}=parseHTML('<html><body></body></html>');globalThis.document=document;
 const env={BUCKET:new Bucket()},user={id:'same-owner',role:'member'};
 const original=globalThis.fetch;globalThis.fetch=(path,options={})=>studyApi(new Request('https://audio.ttpq.net'+path,options),env,user);
 const a=await openStudyStore('device-a'),b=await openStudyStore('device-b');
 const app={studySnapshot:async()=>({books:[],files:[],settings:{}}),studySettings:async()=>{}};
 const conflictsA=document.createElement('div'),conflictsB=document.createElement('div');
 const client=(store,conflicts)=>createStudySync({store,app,user,status:()=>{},conflicts,audio:()=>false,recordings:()=>false});const ca=client(a,conflictsA),cb=client(b,conflictsB);
 try{
  await a.put('subtitle',{id:'version-one',lesson_id:'lesson',cues:[{text:'First',start:0,end:1}]});await ca.run();await cb.run();assert.equal((await b.get('version-one')).cues[0].text,'First');
  await a.put('subtitle',{...(await a.get('version-one')),cues:[{text:'Device A',start:0,end:1}]});await b.put('subtitle',{...(await b.get('version-one')),cues:[{text:'Device B',start:0,end:1}]});
  await ca.run();await cb.run();assert.ok(conflictsB.children.length>=1);assert.equal((await b.get('version-one')).cues[0].text,'Device B');assert.ok((await b.all('subtitle')).some(r=>r.conflict_of==='version-one'));
  const server=await studyApi(new Request('https://audio.ttpq.net/api/study'),env,user);assert.equal((await server.json()).records.find(r=>r.id==='version-one').cues[0].text,'Device A');
  const row=[...conflictsB.children].find(r=>r.querySelector('p').textContent.includes('subtitle'));await row.querySelectorAll('button')[0].onclick();assert.equal((await b.get('version-one')).cues[0].text,'Device A');
 }finally{globalThis.fetch=original;}
});
