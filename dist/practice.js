export function sentenceBlocks(cues, selected, offset, duration) {
 return [...new Set(selected)].sort((a,b)=>a-b).flatMap(index=>{
  const cue=cues[index];if(!cue)return [];
  const start=Math.max(0,cue.start+offset),end=Math.min(duration,cue.end+offset);
  return end>start?[{start,end,index}]:[];
 });
}
export function nextRepeat(index, played, count, length) {
 return !count||played<count?{index,played:played+1}:{index:(index+1)%length,played:1};
}
