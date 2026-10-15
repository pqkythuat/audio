export const SCHEMA_VERSION=1;
export const uid=()=>crypto.randomUUID();
export function identifyLesson(book){
 return {...book,lesson_id:book.lesson_id||book.sharedSourceId||book.id,subtitle_version_id:book.subtitle_version_id||'original-'+(book.sharedSourceId||book.id),cues:book.cues.map((cue,i)=>({...cue,segment_id:cue.segment_id||'original-'+i}))};
}
export function validateSegments(cues,duration=0){
 const errors=[],warnings=[];
 cues.forEach((c,i)=>{
  const line=i+1;if(!Number.isFinite(c.start)||!Number.isFinite(c.end)||c.start<0||c.end<=c.start)errors.push(`Câu ${line}: thời gian không hợp lệ.`);
  if(!c.text.trim())errors.push(`Câu ${line}: nội dung rỗng.`);
  if(duration>0&&c.end>duration+.001)errors.push(`Câu ${line}: vượt thời lượng audio.`);
  if(c.end-c.start<.1)warnings.push(`Câu ${line}: thời lượng dưới 100 ms.`);
  for(let j=0;j<i;j++)if(c.start<cues[j].end&&c.end>cues[j].start)warnings.push(`Câu ${j+1} và ${line}: chồng lấn thời gian.`);
 });return {errors,warnings};
}
export function mergeSegments(cues,indexes){
 const ordered=[...new Set(indexes)].sort((a,b)=>a-b);if(ordered.length<2||ordered.some((x,i)=>i&&x!==ordered[i-1]+1))throw Error('Chọn ít nhất hai câu liền kề.');
 const selected=ordered.map(i=>cues[i]);if(selected.some(c=>!c))throw Error('Câu không tồn tại.');
 const merged={segment_id:uid(),source_segment_ids:selected.map(c=>c.segment_id),start:Math.min(...selected.map(c=>c.start)),end:Math.max(...selected.map(c=>c.end)),text:selected.map(c=>c.text).join(' ')};
 return [...cues.slice(0,ordered[0]),merged,...cues.slice(ordered.at(-1)+1)];
}
export function splitSegment(cues,index,position,time){
 const c=cues[index];if(!c||!Number.isInteger(position)||position<=0||position>=c.text.length||time<=c.start||time>=c.end)throw Error('Chọn vị trí văn bản và thời gian nằm giữa câu.');
 const text=[c.text.slice(0,position).trim(),c.text.slice(position).trim()];if(text.some(t=>!t))throw Error('Hai câu sau tách phải có nội dung.');
 return [...cues.slice(0,index),...text.map((t,i)=>({segment_id:uid(),source_segment_ids:[c.segment_id],start:i?time:c.start,end:i?c.end:time,text:t})),...cues.slice(index+1)];
}
export function subtitleFile(cues,format='srt'){
 const stamp=n=>{const ms=Math.round(n*1000),h=Math.floor(ms/3600000),m=Math.floor(ms/60000)%60,s=Math.floor(ms/1000)%60;return [h,m,s].map(x=>String(x).padStart(2,'0')).join(':')+(format==='srt'?',':'.')+String(ms%1000).padStart(3,'0');};
 return (format==='vtt'?'WEBVTT\n\n':'')+cues.map((c,i)=>(format==='srt'?`${i+1}\n`:'')+`${stamp(c.start)} --> ${stamp(c.end)}\n${c.text}`).join('\n\n')+'\n';
}
export function tokens(text,{caseSensitive=false,punctuation=false}={}){
 let value=String(text).normalize('NFKC').replace(/[’‘]/g,"'");if(!caseSensitive)value=value.toLocaleLowerCase();if(!punctuation)value=value.replace(/[^\p{L}\p{N}'\s]/gu,' ');return value.trim().split(/\s+/).filter(Boolean);
}
export function gradeWords(reference,answer,options={}){
 const a=tokens(reference,options),b=tokens(answer,options);
 if(a.length>2000||b.length>2000)throw Error('Mỗi lượt tối đa 2.000 từ.');
 const dp=Array.from({length:a.length+1},()=>new Uint16Array(b.length+1));
 for(let i=0;i<=a.length;i++)dp[i][0]=i;for(let j=0;j<=b.length;j++)dp[0][j]=j;
 for(let i=1;i<=a.length;i++)for(let j=1;j<=b.length;j++)dp[i][j]=Math.min(dp[i-1][j]+1,dp[i][j-1]+1,dp[i-1][j-1]+(a[i-1]!==b[j-1]));
 const aligned=[];let i=a.length,j=b.length,S=0,D=0,I=0;
 while(i||j){if(i&&j&&dp[i][j]===dp[i-1][j-1]+(a[i-1]!==b[j-1])){const type=a[i-1]===b[j-1]?'correct':'substitution';if(type==='substitution')S++;aligned.unshift({type,expected:a[--i],actual:b[--j]});}else if(i&&dp[i][j]===dp[i-1][j]+1){D++;aligned.unshift({type:'missing',expected:a[--i],actual:''});}else{I++;aligned.unshift({type:'extra',expected:'',actual:b[--j]});}}
 const N=a.length,wer=N?(S+D+I)/N:I?1:0;return {S,D,I,N,wer,score:Math.max(0,Math.round(100*(1-wer))),aligned};
}
export function scheduleReview(card,rating,now=Date.now()){
 if(![0,1,2,3].includes(rating))throw Error('Đánh giá không hợp lệ.');
 const days=rating===0?0:rating===1?1:rating===2?Math.max(2,(card.interval_days||1)*2):Math.max(4,(card.interval_days||1)*3);
 return {...card,last_reviewed_at:new Date(now).toISOString(),due_at:new Date(now+(rating===0?600000:days*86400000)).toISOString(),interval_days:days,reviews:(card.reviews||0)+1,rating,state:rating===0?'learning':'review',algorithm_version:'simple-srs-1'};
}
