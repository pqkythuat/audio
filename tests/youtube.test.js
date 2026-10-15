import test from 'node:test';
import assert from 'node:assert/strict';
import {parseYouTubeLink,createMediaController} from '../dist/youtube.js';

test('YouTube links accept video forms and reject other hosts or executable URLs',()=>{
 for(const link of ['https://www.youtube.com/watch?v=M7lc1UVf-VE&t=20s','https://youtu.be/M7lc1UVf-VE?si=x','https://m.youtube.com/watch?v=M7lc1UVf-VE','https://youtube.com/shorts/M7lc1UVf-VE','https://youtube.com/embed/M7lc1UVf-VE','https://youtube.com/live/M7lc1UVf-VE'])assert.deepEqual(parseYouTubeLink(link),{youtubeId:'M7lc1UVf-VE',youtubeUrl:'https://www.youtube.com/watch?v=M7lc1UVf-VE'});
 for(const link of ['javascript:alert(1)','https://youtube.com.evil.test/watch?v=M7lc1UVf-VE','https://youtube.com@evil.test/watch?v=M7lc1UVf-VE','https://youtube.com/playlist?list=x','https://youtu.be/short','https://example.com/M7lc1UVf-VE','https://youtube.com:8080/watch?v=M7lc1UVf-VE'])assert.throws(()=>parseYouTubeLink(link));
});

class Native extends EventTarget{
 hidden=false;currentTime=0;duration=30;playbackRate=1;paused=true;
 async play(){this.paused=false;this.dispatchEvent(new Event('play'));}
 pause(){this.paused=true;}removeAttribute(){}load(){}
}
const delay=ms=>new Promise(r=>setTimeout(r,ms));
test('embedded player forwards timing, seeks, controls and errors without leaking into the next source',async t=>{
 const oldDocument=globalThis.document;globalThis.document={createElement:()=>({})};t.after(()=>{globalThis.document=oldDocument;});
 const container={hidden:true,append(){},replaceChildren(){}};let yt;
 class Player{
  time=0;duration=30;rate=1;destroyed=false;
  constructor(mount,options){this.events=options.events;yt=this;queueMicrotask(()=>this.events.onReady({target:this}));}
  getDuration(){return this.duration;}getCurrentTime(){return this.time;}seekTo(time){this.time=time;}
  getAvailablePlaybackRates(){return [.5,1,1.5,2];}setPlaybackRate(rate){this.rate=rate;}
  playVideo(){this.events.onStateChange({data:1});}pauseVideo(){this.events.onStateChange({data:2});}destroy(){this.destroyed=true;}
 }
 const native=new Native(),media=createMediaController(native,{container,loadAPI:async()=>({Player})});t.after(()=>media.clearYouTube());
 let metadata=0,ticks=0,errors=0,blocked=0;media.onloadedmetadata=()=>metadata++;media.addEventListener('timeupdate',()=>ticks++);media.addEventListener('error',()=>errors++);media.addEventListener('autoplayblocked',()=>blocked++);
 await media.loadYouTube('M7lc1UVf-VE');await delay(120);assert.equal(metadata,1);assert.equal(native.hidden,true);assert.equal(container.hidden,false);assert.equal(media.duration,30);assert.ok(ticks>0);
 media.currentTime=8;assert.equal(yt.time,8);assert.equal(media.currentTime,8);media.playbackRate=.5;assert.equal(yt.rate,.5);media.playbackRate=.75;assert.equal(media.playbackRate,1);
 await media.play();assert.equal(media.paused,false);media.pause();assert.equal(media.paused,true);
 yt.events.onAutoplayBlocked();assert.equal(blocked,1);yt.events.onError({data:101});assert.equal(errors,1);assert.match(media.errorMessage,/Video/);
 const old=yt;media.clearYouTube();assert.equal(old.destroyed,true);assert.equal(native.hidden,false);assert.equal(container.hidden,true);assert.equal(media.duration,30);old.events.onError({data:100});assert.equal(errors,1);
 await media.play();assert.equal(native.paused,false);
});

test('switching source cancels an in-flight YouTube API load',async()=>{
 const native=new Native(),container={hidden:true,replaceChildren(){},append(){}};let resolve;
 const media=createMediaController(native,{container,loadAPI:()=>new Promise(r=>{resolve=r;})});
 const pending=media.loadYouTube('M7lc1UVf-VE');media.clearYouTube();resolve({Player:class{constructor(){throw Error('Stale player must not be created');}}});await pending;assert.equal(native.hidden,false);assert.equal(container.hidden,true);
});
