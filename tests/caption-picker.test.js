import test from 'node:test';
import assert from 'node:assert/strict';
import {createCaptionPicker} from '../dist/caption-picker.js';
class Element{
 value='';hidden=false;disabled=false;children=[];listeners={};textContent='';
 append(child){this.children.push(child);}replaceChildren(){this.children=[];}
 addEventListener(type,fn){(this.listeners[type]??=[]).push(fn);}emit(type){for(const fn of this.listeners[type]||[])fn();}
}
test('caption picker previews selected captions and discards results for an old video or uploaded file',async t=>{
 const oldDocument=globalThis.document,oldFetch=globalThis.fetch;t.after(()=>{globalThis.document=oldDocument;globalThis.fetch=oldFetch;});
 const elements=new Map(['Tracks','Choices','Status','Find','Use'].map(id=>['test'+id,new Element()]));
 globalThis.document={getElementById:id=>elements.get(id),createElement:()=>new Element()};
 const url=new Element(),file=new Element(),source=new Element();url.value='https://youtu.be/M7lc1UVf-VE';source.value='youtube';
 let preview;
 const picker=createCaptionPicker({prefix:'test',urlInput:url,fileInput:file,sourceInput:source,onSelected:cues=>{preview=cues;}});
 const payload={caption:'1\n00:00:01,000 --> 00:00:03,000\nHello',language:'en',automatic:false};
 globalThis.fetch=async path=>({ok:true,json:async()=>path.includes('&track=')?payload:{tracks:[{id:'manual:en',name:'English',language:'en',automatic:false}]}});
 await elements.get('testFind').onclick();assert.equal(elements.get('testChoices').hidden,false);assert.equal(picker.current(),null);
 await elements.get('testUse').onclick();assert.equal(picker.current().text,payload.caption);assert.equal(preview[0].text,'Hello');
 file.emit('change');assert.equal(picker.current(),null);
 await elements.get('testFind').onclick();await elements.get('testUse').onclick();url.value='https://youtu.be/abcdefghijk';url.emit('input');assert.equal(picker.current(),null);
 let complete;globalThis.fetch=()=>new Promise(r=>{complete=r;});
 const pending=elements.get('testFind').onclick();url.value='https://youtu.be/M7lc1UVf-VE';url.emit('input');complete({ok:true,json:async()=>({tracks:[{id:'manual:fr',name:'French',language:'fr'}]})});await pending;
 assert.equal(elements.get('testChoices').hidden,true);assert.equal(picker.current(),null);assert.equal(elements.get('testFind').disabled,false);
});
