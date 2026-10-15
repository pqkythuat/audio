import test from 'node:test';
import assert from 'node:assert/strict';
import {sentenceBlocks,nextRepeat} from '../dist/practice.js';
test('adjacent selected sentences stay separate and respect offset and audio bounds',()=>{
 assert.deepEqual(sentenceBlocks([{start:0,end:2},{start:2,end:5},{start:8,end:10}],[1,0,1,2],-1,6),[{start:0,end:1,index:0},{start:1,end:4,index:1}]);
});
test('repeat each sentence exactly three times then advance and wrap',()=>{
 let state={index:0,played:1};const sequence=[state.index];
 for(let i=0;i<6;i++){state=nextRepeat(state.index,state.played,3,2);sequence.push(state.index);}
 assert.deepEqual(sequence,[0,0,0,1,1,1,0]);
 assert.deepEqual(nextRepeat(1,10,0,2),{index:1,played:11});
});
