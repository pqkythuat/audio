export function cleanCaption(text){return String(text).replace(/\[[^\]]*\]/g,'').replace(/>>/g,'').replace(/<[^>]*>/g,'').replace(/&quot;/g,'"').replace(/&apos;|&#39;/g,"'").replace(/&amp;/g,'&').split('\n').map(line=>line.replace(/[ \t]+/g,' ').trim()).filter(Boolean).join('\n').trim();}
export function captionNeighbors(cues,index,selected=[],loop=false){const order=loop?[...new Set(selected)].filter(i=>cues[i]?.text).sort((a,b)=>a-b):cues.map((c,i)=>c.text?i:-1).filter(i=>i>=0);const position=order.indexOf(index);if(position<0)return {previous:-1,next:-1};const wrap=loop&&order.length>1;return {previous:position>0?order[position-1]:wrap?order.at(-1):-1,next:position<order.length-1?order[position+1]:wrap?order[0]:-1};}
export function parseCaptions(text) {
 const cues=[];
 let current=null,skip=false;
 const flush=()=>{if(!current)return;const content=cleanCaption(current.lines.join('\n'));if(content)cues.push({start:current.start,end:current.end,text:content});current=null;};
 for(const raw of text.replace(/^\uFEFF/,'').replace(/\r\n?/g,'\n').split('\n')) {
  const line=raw.trim();
  if(!line){flush();skip=false;continue;}
  if(skip)continue;
  if(!current&&/^(NOTE|STYLE|REGION)(\s|$)/.test(line)){skip=true;continue;}
  if(!line.includes('-->')){if(current)current.lines.push(line);continue;}
  // Cue timestamps delimit entries even when their separating blank lines are missing.
  if(current&&current.lines.length>1&&/^\d+$/.test(current.lines.at(-1)))current.lines.pop();
  flush();
  const m=line.match(/^((?:\d+:)?\d{2}:\d{2}[.,]\d{3})\s*-->\s*((?:\d+:)?\d{2}:\d{2}[.,]\d{3})(?:\s+.*)?$/);
  if(!m) throw Error('Mốc thời gian phụ đề không hợp lệ.');
  for(const stamp of [m[1],m[2]]){const parts=stamp.replace(',','.').split(':');if(Number(parts.at(-1))>=60||Number(parts.at(-2))>=60)throw Error('Phút và giây trong mốc phụ đề phải nhỏ hơn 60.');}
  const seconds=s=>s.replace(',','.').split(':').reduce((a,n)=>a*60+Number(n),0);
  const start=seconds(m[1]),end=seconds(m[2]);
  if(end<=start) throw Error('Thời gian kết thúc phải sau thời gian bắt đầu.');
  current={start,end,lines:[]};
 }
 flush();
 if(!cues.length) throw Error('Không tìm thấy phụ đề hợp lệ trong file SRT/VTT.');
 return cues.sort((a,b)=>a.start-b.start);
}
export function parseRange(value,count) {
 if(!value.trim()) return [];
 if(value.trim()==='*') return Array.from({length:count},(_,i)=>i);
 const found=new Set();
 for(const token of value.trim().split(/[\s,;]+/)) {
  const m=token.match(/^(\d+)(?:-(\d+))?$/);
  if(!m) throw Error('Nhập dạng 1-5,8,10 hoặc * để chọn tất cả.');
  let a=Number(m[1]),b=Number(m[2]||m[1]);
  if(a<1||b<1||a>count||b>count) throw Error(`Số câu phải từ 1 đến ${count}.`);
  if(a>b) [a,b]=[b,a];
  for(let n=a;n<=b;n++) found.add(n-1);
 }
 return [...found].sort((a,b)=>a-b);
}
export function continuousBlocks(cues,selected,offset=0,duration=Infinity) {
 const blocks=[];
 for(const index of [...new Set(selected)].sort((a,b)=>a-b)) {
  const cue=cues[index];if(!cue) continue;
  const start=Math.max(0,cue.start+offset),end=Math.min(duration,Math.max(0,cue.end+offset));
  if(end<=start) continue;
  const prev=blocks.at(-1);
  if(prev&&index===prev.last+1) {prev.end=Math.max(prev.end,end);prev.last=index;}
  else blocks.push({start,end,last:index});
 }
 return blocks;
}
export const formatTime=s=>{s=Math.max(0,Number(s)||0);return `${Math.floor(s/60)}:${String(Math.floor(s%60)).padStart(2,'0')}`;};
