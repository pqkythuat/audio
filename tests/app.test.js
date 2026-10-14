import test from 'node:test';
import assert from 'node:assert/strict';
import {indexedDB} from 'fake-indexeddb';
import {readFileSync} from 'node:fs';
const elements=new Map();
class Element {
 constructor(){this.children=[];this.listeners={};this.style={};this.value='';this.files=[];this.checked=false;this.paused=true;this.hidden=false;this.className='';this.clientHeight=400;this.scrollTop=0;this.classList={add:c=>this.className+=' '+c,remove:c=>this.className=this.className.split(' ').filter(x=>x!==c).join(' '),toggle:(c,b)=>b?this.classList.add(c):this.classList.remove(c)};}
 set id(v){this._id=v;elements.set(v,this);}get id(){return this._id;}
 append(...children){this.children.push(...children);for(const c of children)c.parentElement=this;}
 replaceChildren(...children){for(const c of this.children)if(c.id)elements.delete(c.id);this.children=[];this.append(...children);}
 setAttribute(k,v){this[k]=v;}
 addEventListener(type,fn){(this.listeners[type]||=[]).push(fn);}
 emit(type){for(const fn of this.listeners[type]||[])fn();}
 getBoundingClientRect(){return {top:100};}
 showModal(){this.open=true;}close(){this.open=false;}reset(){}click(){return this.onclick?.();}
}
class MockAudio extends Element {
 constructor(){super();this.currentTime=0;this.duration=20;this.readyState=0;this.playbackRate=1;this.seeking=false;}
 set src(v){this._src=v;this.readyState=0;this.currentTime=0;setTimeout(()=>{this.emit('timeupdate');this.readyState=1;this.onloadedmetadata?.();},0);}get src(){return this._src;}
 pause(){if(!this.paused){this.paused=true;setTimeout(()=>this.emit('pause'),0);}}
 async play(){this.paused=false;}
 removeAttribute(){this._src='';this.readyState=0;this.currentTime=0;}load(){}
}
const html=readFileSync(new URL('../dist/index.html',import.meta.url),'utf8');
for(const [,id]of html.matchAll(/id="([^"]+)"/g)){const e=id==='audio'?new MockAudio():new Element();e.id=id;}
elements.get('removeCaption').parentElement=new Element();elements.get('speed').value='1';elements.get('offset').value='0';
globalThis.document={getElementById:id=>elements.get(id),createElement:()=>new Element(),querySelectorAll:()=>[],addEventListener(){}};
globalThis.Audio=MockAudio;globalThis.indexedDB=indexedDB;globalThis.requestAnimationFrame=()=>{};
Object.defineProperty(globalThis,'navigator',{value:{storage:{estimate:async()=>({quota:1e9})}},configurable:true});globalThis.confirm=()=>true;
const delay=()=>new Promise(r=>setTimeout(r,20));
const db=await new Promise((resolve,reject)=>{const r=indexedDB.open('lang-nghe',1);r.onupgradeneeded=()=>{r.result.createObjectStore('books',{keyPath:'id'});r.result.createObjectStore('files',{keyPath:'id'});};r.onsuccess=()=>resolve(r.result);r.onerror=()=>reject(r.error);});
const read=id=>new Promise(resolve=>{const r=db.transaction('books').objectStore('books').get(id);r.onsuccess=()=>resolve(r.result);});
const all=()=>new Promise(resolve=>{const r=db.transaction('books').objectStore('books').getAll();r.onsuccess=()=>resolve(r.result);});
await new Promise(resolve=>{const tx=db.transaction(['books','files'],'readwrite');for(const [id,position]of [['one',8],['two',12]]){tx.objectStore('books').put({id,name:id,filename:id+'.mp3',type:'audio/mpeg',duration:20,size:20,position,speed:1,offset:0,created:id==='one'?2:1,caption:'1\n00:00:01,000 --> 00:00:04,000\nHello\n\n2\n00:00:18,000 --> 00:00:20,000\nLast',cues:[{start:1,end:4,text:'Hello'},{start:18,end:20,text:'Last'}],selected:[0]});tx.objectStore('files').put({id,blob:new Blob(['audio'])});}tx.oncomplete=resolve;});
await import('../dist/app.js');
const $=id=>elements.get(id),audio=$('audio');
test('application lifecycle regressions',async t=>{
 await t.test('stored merged captions repair automatically on refresh',async()=>{const original=await read('one');await new Promise(resolve=>{const tx=db.transaction('books','readwrite');tx.objectStore('books').put({...original,id:'legacy',name:'Legacy',created:0,caption:'1\n00:00:01,000 --> 00:00:04,000\nHello\n2\n00:00:18,000 --> 00:00:20,000\nLast',cues:[{start:1,end:4,text:'Hello 2 00:00:18,000 --> 00:00:20,000 Last'}],selected:[0]});tx.oncomplete=resolve;});$('backupFile').files=[{text:async()=>JSON.stringify({format:'lang-nghe',version:1,books:[{...original,name:'Repair trigger',audio:Buffer.from('audio').toString('base64')}]})}];await $('backupFile').onchange();const repaired=await read('legacy');assert.equal(repaired.cues.length,2);assert.deepEqual(repaired.selected,[]);});
 await t.test('switching playing audio keeps the new book saved position',async()=>{await $('library').children.find(b=>b.children[0]?.textContent==='one').click();await delay();assert.equal(audio.currentTime,8);await audio.play();audio.currentTime=9;await $('library').children.find(b=>b.children[0]?.textContent==='two').click();await delay();assert.equal(audio.currentTime,12);assert.equal((await read('two')).position,12);assert.equal((await read('one')).position,9);});
 await t.test('editing a playing book cannot be overwritten by queued pause events',async()=>{await audio.play();audio.currentTime=13;$('edit').click();$('name').value='Renamed';await $('uploadForm').onsubmit({preventDefault(){}});await delay();assert.equal((await read('two')).name,'Renamed');assert.equal(audio.currentTime,13);assert.equal($('title').textContent,'Renamed');});
 await t.test('new audio with empty MIME type can be saved',async()=>{$('add').click();$('name').value='New audio';const file=new Blob(['test']);Object.defineProperty(file,'name',{value:'new.mp3'});$('audioFile').files=[file];$('captionFile').files=[];$('removeCaption').checked=false;await $('uploadForm').onsubmit({preventDefault(){}});await delay();assert.equal($('formError').textContent,'');const saved=(await all()).find(b=>b.name==='New audio');assert.ok(saved);assert.equal(saved.type,'audio/mpeg');assert.equal($('title').textContent,'New audio');});
 await t.test('delete with pending metadata does not recreate a deleted book',async()=>{await $('delete').click();await delay();assert.ok(!(await all()).some(b=>b.name==='New audio'));assert.equal($('player').hidden,true);});
 await t.test('selection rerender restores current caption highlight',async()=>{await $('library').children[0].click();await delay();audio.currentTime=2;audio.emit('timeupdate');assert.match($('cue-0').className,/current/);$('all').click();assert.match($('cue-0').className,/current/);});
 await t.test('changing offset disables loop if all selected cues are outside audio',async()=>{$('range').value='2';await $('choose').click();$('loop').click();await delay();assert.equal($('loop').textContent,'Dừng lặp');$('offset').value='30';$('offset').onchange();assert.equal($('loop').textContent,'Bắt đầu lặp');});
 await t.test('timeupdate enforces looping without animation frames',async()=>{$('offset').value='0';$('offset').onchange();$('range').value='1';await $('choose').click();$('loop').click();await delay();audio.currentTime=4.5;audio.emit('timeupdate');assert.equal(audio.currentTime,1);});
 await t.test('malformed backup is rejected without partial writes',async()=>{const count=(await all()).length;$('backupFile').files=[{text:async()=>JSON.stringify({format:'lang-nghe',version:1,books:[null]})}];await $('backupFile').onchange();assert.equal((await all()).length,count);assert.match($('toast').textContent,/không hợp lệ/);});
 await t.test('restore preserves audio and removes duplicate selected indices',async()=>{const seed=await read('one');$('backupFile').files=[{text:async()=>JSON.stringify({format:'lang-nghe',version:1,books:[{...seed,name:'Restored',caption:undefined,filename:undefined,selected:[0,0],audio:Buffer.from('audio').toString('base64')}]})}];await $('backupFile').onchange();const restored=(await all()).find(b=>b.name==='Restored');assert.ok(restored);assert.deepEqual(restored.selected,[0]);assert.equal(restored.filename,'audio');});
 await t.test('renaming restored captions without source text preserves cues',async()=>{const button=$('library').children.find(b=>b.children[0]?.textContent==='Restored');await button.click();await delay();$('audioFile').files=[];$('captionFile').files=[];$('removeCaption').checked=false;$('edit').click();$('name').value='Restored renamed';await $('uploadForm').onsubmit({preventDefault(){}});await delay();const updated=(await all()).find(b=>b.name==='Restored renamed');assert.equal(updated.cues.length,2);});
});
