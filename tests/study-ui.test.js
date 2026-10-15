import test from 'node:test';
import assert from 'node:assert/strict';
import {parseHTML} from 'linkedom';
import {indexedDB} from 'fake-indexeddb';
import {initStudy} from '../dist/study-ui.js';
import {openStudyStore} from '../dist/study-store.js';
test('study UI edits, undoes, saves versions, resumes dictation, stores words and handles mic denial',async()=>{
 const {window,document}=parseHTML('<html><body><div id="libraryDialog"></div><div id="player"></div></body></html>');
 globalThis.window=window;globalThis.document=document;globalThis.indexedDB=indexedDB;
 globalThis.localStorage={values:new Map(),getItem(k){return this.values.get(k)||null;},setItem(k,v){this.values.set(k,v);}};
 Object.defineProperty(window.HTMLSelectElement.prototype,'value',{get(){return this._value??this.querySelector('option')?.value??'';},set(value){this._value=String(value);},configurable:true});
 window.HTMLElement.prototype.showModal=function(){this.open=true;};window.HTMLElement.prototype.close=function(){this.open=false;this.dispatchEvent(new window.Event('close'));};
 Object.defineProperty(globalThis,'navigator',{value:{mediaDevices:{getUserMedia:async()=>{throw Error('Microphone denied');}}},configurable:true});globalThis.MediaRecorder=class {};
 const interval=globalThis.setInterval;globalThis.setInterval=(fn,ms)=>interval(fn,ms).unref();
 const $=id=>document.getElementById(id);let played=[],applied,hide=false;
 let book={id:'lesson-ui',name:'UI lesson',duration:20,source:'youtube',youtubeUrl:'https://youtu.be/M7lc1UVf-VE',cues:[{start:1,end:2,text:'Hello world'},{start:3,end:4,text:'Practice makes progress'}]};
 const snapshot=async()=>({schema_version:1,books:[book],files:[],settings:{}});
 const app={studyContext:()=>({book,selection:[0,1],cueIndex:0}),studySnapshot:snapshot,studyHideAnswers:value=>hide=value,studyPlay:async cues=>{played=cues;},studyPause:async()=>{},studyApply:async next=>{applied=next;book=next;},studyPublish:async()=>{},studyTransport:async()=>{},studyOpenLesson:async()=>{}};
 try{
  await initStudy({app,user:{id:'ui-user',email:'user@example.com',role:'member'}});
  await $('libraryDialog').querySelector('button').onclick();assert.equal($('studyDialog').open,true);assert.equal($('edRows').children.length,2);
  const text=$('edRows').children[0].querySelector('textarea');text.value='Hello corrected world';text.onchange();assert.equal($('edUndo').disabled,false);
  $('edUndo').onclick();assert.equal($('edRows').children[0].querySelector('textarea').value,'Hello world');$('edRedo').onclick();
  await $('edSave').onclick();assert.equal(applied.cues[0].text,'Hello corrected world');assert.ok(applied.cues[0].segment_id);assert.ok(applied.subtitle_version_id);
  document.querySelector('[data-tab="dictation"]').onclick();assert.equal(hide,true);await $('dictPlay').onclick();assert.equal(played.length,1);
  $('dictAnswer').value='hello corrected world';await $('dictAnswer').oninput();await $('dictCheck').onclick();assert.match($('studyStatus').textContent,/100\/100/);
  await $('dictNext').onclick();assert.equal($('dictSegment').value,'1');$('studyClose').onclick();await $('libraryDialog').querySelector('button').onclick();assert.equal($('dictSegment').value,'1');
  document.querySelector('[data-tab="vocab"]').onclick();$('vocabTerm').value='practice';$('vocabMeaning').value='luyện tập';await $('vocabSave').onclick();assert.match($('vocabList').textContent,/practice/);
  await $('vocabReview').onclick();assert.equal($('vocabCard').hidden,false);$('vocabFlip').onclick();assert.equal($('vocabBack').hidden,false);await document.querySelector('[data-rating="2"]').onclick();
  document.querySelector('[data-tab="speaking"]').onclick();await $('speakRecord').onclick();assert.match($('studyStatus').textContent,/denied/);assert.equal($('studyDialog').open,true);
  const store=await openStudyStore('ui-user');assert.equal((await store.all('subtitle')).length,2);assert.equal((await store.all('dictation'))[0].result.score,100);assert.ok((await store.all('vocab'))[0].due_at);assert.equal((await store.backups()).length,1);
  const originalUrl=URL.createObjectURL;let exported;URL.createObjectURL=blob=>{exported=blob;return originalUrl(blob);};
  try{
   app.studyValidateSnapshot=()=>{};await $('studyBackup').onclick();const envelope=JSON.parse(await exported.text());assert.equal(JSON.parse(envelope.payload).account,'ui-user');assert.equal(envelope.checksum.length,64);
   let restored=false;app.studyValidateSnapshot=()=>{};app.studyRestore=async()=>{restored=true;};
   $('studyBackupFile').files=[{text:async()=>JSON.stringify({...envelope,checksum:'tampered'})}];await $('studyBackupFile').onchange();assert.equal(restored,false);assert.match($('studyStatus').textContent,/Checksum/);
   $('studyBackupFile').files=[{text:async()=>JSON.stringify(envelope)}];await $('studyBackupFile').onchange();assert.equal(restored,true);assert.match($('studyStatus').textContent,/Đã khôi phục/);
  }finally{URL.createObjectURL=originalUrl;}
  $('studyClose').onclick();assert.equal(hide,false);
 }finally{globalThis.setInterval=interval;}
});
