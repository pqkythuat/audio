import test from 'node:test';
import assert from 'node:assert/strict';
import {bindAutoTitle} from '../dist/auto-title.js';
test('automatic titles preserve user text and ignore stale YouTube responses',async()=>{
 const control=value=>({value,files:[],addEventListener(){}});
 const name=control(''),file=control(''),url=control('https://youtu.be/M7lc1UVf-VE'),source=control('audio');
 file.files=[{name:'Bài nghe.mp3'}];const fill=bindAutoTitle({name,file,url,source});await fill();assert.equal(name.value,'Bài nghe');
 name.value='Tên tự đặt';await fill();assert.equal(name.value,'Tên tự đặt');
 const original=globalThis.fetch;let finish;
 globalThis.fetch=()=>new Promise(resolve=>{finish=resolve;});
 try{
  name.value='';source.value='youtube';const pending=fill();name.value='Tên đã sửa';finish({ok:true,json:async()=>({title:'YouTube title'})});await pending;assert.equal(name.value,'Tên đã sửa');
  name.value='';const stale=fill();url.value='https://youtu.be/abcdefghijk';finish({ok:true,json:async()=>({title:'Old title'})});await stale;assert.equal(name.value,'');
  globalThis.fetch=async()=>({ok:true,json:async()=>({title:'Tiêu đề YouTube'})});await fill();assert.equal(name.value,'Tiêu đề YouTube');
 }finally{globalThis.fetch=original;}
});
