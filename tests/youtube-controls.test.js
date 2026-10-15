import test from 'node:test';
import assert from 'node:assert/strict';
import {bindYouTubeControls} from '../dist/youtube-controls.js';
class Element{value='0';style={setProperty(){}};attributes={};setAttribute(key,value){this.attributes[key]=value;}}
test('compact YouTube audio controls play, seek, mute and preserve the timeline while dragging',async()=>{
 class Media extends EventTarget{
  paused=true;currentTime=12;duration=120;muted=false;
  async play(){this.paused=false;this.dispatchEvent(new Event('play'));}pause(){this.paused=true;this.dispatchEvent(new Event('pause'));}
 }
 const media=new Media(),play=new Element(),seek=new Element(),time=new Element(),mute=new Element();let ready=false,sought;
 bindYouTubeControls(media,{play,seek,time,mute,canPlay:()=>ready,onSeek:value=>{sought=value;media.currentTime=value;}});
 assert.equal(play.disabled,true);assert.equal(seek.disabled,true);
 ready=true;media.dispatchEvent(new Event('loadedmetadata'));assert.equal(play.disabled,false);assert.equal(seek.value,'12');assert.equal(seek.max,'120');
 await play.onclick();assert.equal(media.paused,false);assert.equal(play.attributes['aria-label'],'Tạm dừng');await play.onclick();assert.equal(media.paused,true);
 seek.value='75';seek.oninput();media.currentTime=20;media.dispatchEvent(new Event('timeupdate'));assert.equal(seek.value,'75');assert.match(time.textContent,/1:15/);
 seek.onchange();assert.equal(sought,75);assert.equal(media.currentTime,75);assert.equal(seek.attributes['aria-valuetext'],'1:15 trên 2:00');
 mute.onclick();assert.equal(media.muted,true);assert.equal(mute.attributes['aria-label'],'Bật tiếng');mute.onclick();assert.equal(media.muted,false);
 ready=false;media.dispatchEvent(new Event('error'));assert.equal(play.disabled,true);assert.equal(seek.disabled,true);
});
