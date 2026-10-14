export function parseCaptions(text) {
 const cues=[];
 for(const block of text.replace(/^\uFEFF/,'').replace(/\r/g,'').split(/\n\s*\n/)) {
  const lines=block.trim().split('\n'), i=lines.findIndex(l=>l.includes('-->'));
  if(i<0) continue;
  const m=lines[i].match(/((?:\d+:)?\d{2}:\d{2}[.,]\d{3})\s*-->\s*((?:\d+:)?\d{2}:\d{2}[.,]\d{3})/);
  if(!m) throw Error('Mốc thời gian phụ đề không hợp lệ.');
  const seconds=s=>s.replace(',','.').split(':').reduce((a,n)=>a*60+Number(n),0);
  const start=seconds(m[1]),end=seconds(m[2]);
  const content=lines.slice(i+1).join(' ').replace(/<[^>]*>/g,'').trim();
  if(end<=start) throw Error('Thời gian kết thúc phải sau thời gian bắt đầu.');
  if(content) cues.push({start,end,text:content});
 }
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
export function continuousBlocks(cues,selected,offset=0) {
 const blocks=[];
 for(const index of [...selected].sort((a,b)=>a-b)) {
  const cue=cues[index];if(!cue) continue;
  const start=Math.max(0,cue.start+offset),end=Math.max(0,cue.end+offset);
  const prev=blocks.at(-1);
  if(prev&&index===prev.last+1) {prev.end=Math.max(prev.end,end);prev.last=index;}
  else blocks.push({start,end,last:index});
 }
 return blocks;
}
export const formatTime=s=>{s=Math.max(0,Number(s)||0);return `${Math.floor(s/60)}:${String(Math.floor(s%60)).padStart(2,'0')}`;};
