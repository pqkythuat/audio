import test from 'node:test';
import assert from 'node:assert/strict';
import {captionTracks,decodeYouTubeCaptions,captionsToSrt,downloadTrack} from '../youtube-captions.mjs';
import {parseCaptions} from '../dist/core.js';
test('caption tracks include manual and automatic language choices',()=>{
 const format={ext:'json3',url:'https://www.youtube.com/api/timedtext',name:'English'};
 const tracks=captionTracks({subtitles:{vi:[{...format,name:'Vietnamese'}],en:[format],live_chat:[format]},automatic_captions:{en:[format],fr:[{ext:'vtt',url:format.url}]}});
 assert.equal(tracks[0].id,'manual:en');assert.ok(tracks.some(t=>t.id==='auto:en'));assert.ok(!tracks.some(t=>t.language==='live_chat'));
});
test('YouTube JSON captions preserve timing, merge duplicates and produce valid SRT',()=>{
 const json=JSON.stringify({events:[{tStartMs:1000,dDurationMs:3000,segs:[{utf8:'Hello '},{utf8:'world'}]},{tStartMs:2000,dDurationMs:2000,segs:[{utf8:'Hello world'}]},{tStartMs:4000,dDurationMs:1500,segs:[{utf8:'Next &amp; final'}]},{tStartMs:6000,dDurationMs:1000,segs:[{utf8:'[Music]'}]}]});
 const cues=decodeYouTubeCaptions(json,'json3');assert.deepEqual(cues,[{start:1,end:4,text:'Hello world'},{start:4,end:5.5,text:'Next & final'}]);
 assert.deepEqual(parseCaptions(captionsToSrt(cues)),cues);
 assert.throws(()=>decodeYouTubeCaptions('{"events":[]}','json3'));
 assert.throws(()=>decodeYouTubeCaptions(' '.repeat(5*1024*1024+1),'json3'),/5 MB/);
 assert.deepEqual(decodeYouTubeCaptions('WEBVTT\n\n00:01.000 --> 00:03.000\nHello','vtt'),[{start:1,end:3,text:'Hello'}]);
});
test('caption downloads cannot request arbitrary internal or external URLs',async()=>{
 for(const url of ['http://127.0.0.1/admin','https://evil.example/api/timedtext','https://www.youtube.com/redirect?x=1','https://www.youtube.com:8443/api/timedtext'])await assert.rejects(()=>downloadTrack({url}));
});
