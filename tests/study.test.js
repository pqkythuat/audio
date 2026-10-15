import test from 'node:test';
import assert from 'node:assert/strict';
import {indexedDB} from 'fake-indexeddb';
import {identifyLesson,mergeSegments,splitSegment,subtitleFile,validateSegments,gradeWords,scheduleReview} from '../dist/study-core.js';
import {parseCaptions} from '../dist/core.js';
import {openStudyStore} from '../dist/study-store.js';
globalThis.indexedDB=indexedDB;
test('100-segment editing preserves identity, source lineage and millisecond SRT/VTT round trips',()=>{
 const original={id:'existing-id',name:'Original',cues:Array.from({length:100},(_,i)=>({start:i*2+.123,end:i*2+1.456,text:'Line '+i}))};
 const lesson=identifyLesson(original);assert.equal(lesson.id,original.id);assert.equal(lesson.lesson_id,original.id);assert.equal(original.cues[0].segment_id,undefined);
 const renamed=identifyLesson({...lesson,name:'Renamed'});assert.equal(renamed.lesson_id,lesson.lesson_id);assert.equal(renamed.cues[0].segment_id,lesson.cues[0].segment_id);
 const merged=mergeSegments(lesson.cues,[0,1]);assert.equal(merged.length,99);assert.equal(merged[0].text,'Line 0 Line 1');assert.equal(merged[0].start,.123);assert.equal(merged[0].end,3.456);assert.deepEqual(merged[0].source_segment_ids,['original-0','original-1']);
 assert.throws(()=>mergeSegments(lesson.cues,[0,2]));const split=splitSegment(merged,0,6,2);assert.equal(split.length,100);assert.equal(split[0].end,split[1].start);assert.notEqual(split[0].segment_id,merged[0].segment_id);
 const millis=cues=>cues.map(({start,end,text})=>({start:Math.round(start*1000),end:Math.round(end*1000),text}));
 for(const format of ['srt','vtt'])assert.deepEqual(millis(parseCaptions(subtitleFile(split,format))),millis(split));
 assert.equal(validateSegments(split,201).errors.length,0);assert.ok(validateSegments([{start:-1,end:0,text:''}],10).errors.length>=2);assert.ok(validateSegments([{start:0,end:2,text:'A'},{start:1,end:3,text:'B'}]).warnings.length);
});
test('word alignment reports substitutions, omissions and insertions with WER',()=>{
 assert.equal(gradeWords('Practice makes progress.','practice MAKES progress').score,100);
 assert.equal(gradeWords('one two three','one three').D,1);assert.equal(gradeWords('one two','one extra two').I,1);assert.equal(gradeWords('one two','one six').S,1);
 assert.equal(gradeWords('one two','one').score,50);assert.equal(gradeWords('Hello','hello',{caseSensitive:true}).S,1);assert.equal(gradeWords('','').score,100);
 assert.throws(()=>gradeWords('word '.repeat(2001),'word'));
});
test('versioned SRS uses explicit timestamps and persists deterministic next dates',()=>{
 const now=Date.parse('2026-10-15T00:00:00Z');const next=scheduleReview({id:'word'},2,now);assert.equal(next.due_at,'2026-10-17T00:00:00.000Z');assert.equal(next.reviews,1);assert.equal(next.algorithm_version,'simple-srs-1');assert.equal(scheduleReview(next,0,now).due_at,'2026-10-15T00:10:00.000Z');
});
test('additive account stores retain audio backups, tombstones and concurrent local edits after ack',async()=>{
 const a=await openStudyStore('test-a'),b=await openStudyStore('test-b');
 const first=await a.put('vocab',{id:'same',term:'hello'});assert.equal(await b.get('same'),undefined);
 const newer=await a.put('vocab',{id:'same',term:'hello again'});await a.acknowledge('same',first.local_revision,{revision:1,updated_at:'server'});assert.equal((await a.get('same')).term,'hello again');assert.equal((await a.get('same')).dirty,true);assert.equal((await a.get('same')).revision,1);
 await a.acknowledge('same',newer.local_revision,{revision:2,updated_at:'server'});assert.equal((await a.get('same')).dirty,false);
 const snapshot={books:[{id:'old'}],files:[{id:'old',blob:new Blob(['audio'],{type:'audio/mpeg'})}]};await a.backup('schema-1',snapshot);await a.backup('schema-1',{books:[]});assert.equal((await a.backups())[0].snapshot.books.length,1);assert.equal(await (await a.backups())[0].snapshot.files[0].blob.text(),'audio');
 await a.remove('same');assert.equal((await a.all('vocab')).length,0);assert.equal((await a.get('same')).deleted,true);
 const dump=await a.dump();await assert.rejects(b.restore(dump));assert.equal((await a.logs())[0].schema_version,1);
});
