import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {existsSync} from 'node:fs';
import {resolve} from 'node:path';
import {parseCaptions,cleanCaption} from './dist/core.js';

const execute=promisify(execFile),MAX_BYTES=5*1024*1024;
const failure=(message,status=502)=>Object.assign(Error(message),{status});
export async function extractVideo(videoId){
 const local=resolve('.tools',process.platform==='win32'?'yt-dlp.exe':process.platform==='darwin'?'yt-dlp_macos':'yt-dlp_linux');
 const command=process.env.YTDLP_PATH||(existsSync(local)?local:'yt-dlp');
 try{
  const {stdout}=await execute(command,['--ignore-config','--no-plugin-dirs','--no-cache-dir','--skip-download','--dump-single-json','--no-playlist','--ignore-no-formats-error','--socket-timeout','8','--retries','0','--extractor-retries','0','--js-runtimes','node','--no-warnings','--',`https://www.youtube.com/watch?v=${videoId}`],{timeout:35000,maxBuffer:16*1024*1024,windowsHide:true});
  return JSON.parse(stdout);
 }catch(e){
  if(e.code==='ENOENT')throw failure('Máy chủ chưa bật lấy phụ đề YouTube. Bạn vẫn có thể tải SRT/VTT lên.',503);
  throw failure('Chưa lấy được phụ đề từ YouTube. Video có thể bị hạn chế hoặc YouTube đang chặn truy cập. Hãy thử lại hoặc tải SRT/VTT lên.');
 }
}
export function captionTracks(info){
 const tracks=[];
 for(const [automatic,group]of [[false,info.subtitles],[true,info.automatic_captions]])for(const [language,formats]of Object.entries(group||{})){
  if(language==='live_chat'||!Array.isArray(formats))continue;
  const format=formats.find(f=>f.ext==='json3')||formats.find(f=>f.ext==='vtt');if(!format?.url)continue;
  tracks.push({id:(automatic?'auto:':'manual:')+language,language,name:format.name||language,automatic,url:format.url,format:format.ext});
 }
 return tracks.sort((a,b)=>Number(a.automatic)-Number(b.automatic)||Number(!/^en(?:-|$)/.test(a.language))-Number(!/^en(?:-|$)/.test(b.language))||a.language.localeCompare(b.language));
}
export async function downloadTrack(track){
 const url=new URL(track.url);
 if(url.protocol!=='https:'||!['www.youtube.com','youtube.com','video.google.com'].includes(url.hostname)||!['/api/timedtext','/timedtext'].includes(url.pathname)||url.username||url.password||url.port)throw failure('Địa chỉ phụ đề YouTube không hợp lệ.');
 const response=await fetch(url,{redirect:'error',signal:AbortSignal.timeout(15000),headers:{'User-Agent':'Mozilla/5.0','Referer':'https://www.youtube.com/'}});
 if(!response.ok)throw failure('YouTube chưa cho tải phụ đề này. Hãy chọn bản khác hoặc tải SRT/VTT lên.');
 let length=0;const chunks=[];
 for await(const chunk of response.body){length+=chunk.length;if(length>MAX_BYTES)throw failure('Phụ đề vượt quá 5 MB.',413);chunks.push(Buffer.from(chunk));}
 const text=Buffer.concat(chunks).toString('utf8');if(!text.trim())throw failure('YouTube trả về phụ đề trống. Hãy chọn bản khác hoặc tải SRT/VTT lên.');return text;
}
export function decodeYouTubeCaptions(text,format){
 if(Buffer.byteLength(text)>MAX_BYTES)throw failure('Phụ đề vượt quá 5 MB.',413);
 if(format==='vtt')return parseCaptions(text);
 const data=JSON.parse(text),events=(data.events||[]).filter(e=>Array.isArray(e.segs)&&Number.isFinite(e.tStartMs)).sort((a,b)=>a.tStartMs-b.tStartMs);
 const cues=[],nextTimes=[];let future;
 for(let i=events.length-1;i>=0;i--){if(events[i+1]?.tStartMs>events[i].tStartMs)future=events[i+1].tStartMs/1000;nextTimes[i]=future;}
 for(let i=0;i<events.length;i++){
  const event=events[i],content=cleanCaption(event.segs.map(s=>typeof s.utf8==='string'?s.utf8:'').join(''));if(!content)continue;
  const start=Math.max(0,event.tStartMs/1000),next=nextTimes[i];
  let end=start+(event.dDurationMs>0?event.dDurationMs/1000:2);if(next>start)end=Math.min(end,next);
  if(end<=start)continue;const previous=cues.at(-1);
  if(previous?.text===content&&start<=previous.end+.1)previous.end=Math.max(previous.end,end);else cues.push({start,end,text:content});
 }
 if(!cues.length)throw failure('Không có nội dung phụ đề hợp lệ. Hãy tải SRT/VTT lên.',404);
 return cues;
}
export function captionsToSrt(cues){
 const time=value=>{const ms=Math.round(value*1000);return [Math.floor(ms/3600000),Math.floor(ms/60000)%60,Math.floor(ms/1000)%60].map(v=>String(v).padStart(2,'0')).join(':')+','+String(ms%1000).padStart(3,'0');};
 return cues.map((c,i)=>`${i+1}\n${time(c.start)} --> ${time(c.end)}\n${c.text}`).join('\n\n');
}
export function createYouTubeCaptions({extract=extractVideo,download=downloadTrack,now=Date.now}={}){
 const cache=new Map(),pending=new Map(),rates=new Map();let running=0;
 async function metadata(id){
  const old=cache.get(id);if(old&&old.expires>now())return old;
  if(pending.has(id))return pending.get(id);
  const promise=extract(id).then(info=>{const value={tracks:captionTracks(info),title:info.title||'',expires:now()+600000};if(cache.size>=32)cache.delete(cache.keys().next().value);cache.set(id,value);return value;}).finally(()=>pending.delete(id));pending.set(id,promise);return promise;
 }
 return async(req,res,path,user)=>{
  if(path!=='/api/youtube/captions')return false;
  const reply=(status,data)=>{res.writeHead(status,{'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store'});res.end(JSON.stringify(data));return true;};
  if(!user)return reply(401,{error:'Vui lòng đăng nhập.'});if(req.method!=='GET')return reply(405,{error:'Thao tác không hợp lệ.'});
  const url=new URL(req.url,'http://localhost'),id=url.searchParams.get('videoId'),trackId=url.searchParams.get('track');
  if(!/^[-\w]{11}$/.test(id||''))return reply(400,{error:'Link YouTube không hợp lệ.'});
  let rate=rates.get(user.id);if(!rate||now()-rate.start>60000)rates.set(user.id,rate={start:now(),count:0});
  if(++rate.count>12)return reply(429,{error:'Bạn lấy phụ đề quá nhanh. Vui lòng chờ một phút.'});
  if(rates.size>1000)for(const [key,value]of rates)if(now()-value.start>60000)rates.delete(key);
  if(running>=2)return reply(429,{error:'Máy chủ đang lấy phụ đề. Hãy thử lại sau ít giây.'});
  running++;
  try{
   const info=await metadata(id);if(!info.tracks.length)return reply(404,{error:'Video này không có phụ đề có thể lấy. Bạn có thể tải SRT/VTT lên.'});
   if(!trackId)return reply(200,{title:info.title,tracks:info.tracks.map(({url,format,...track})=>track)});
   const track=info.tracks.find(t=>t.id===trackId);if(!track)return reply(404,{error:'Không tìm thấy bản phụ đề đã chọn.'});
   const cues=decodeYouTubeCaptions(await download(track),track.format),caption=captionsToSrt(cues);
   if(Buffer.byteLength(caption)>MAX_BYTES)throw failure('Phụ đề vượt quá 5 MB.',413);
   return reply(200,{videoId:id,caption,language:track.language,automatic:track.automatic,count:cues.length});
  }catch(e){return reply(e.status||502,{error:e.status?e.message:'Chưa đọc được phụ đề YouTube. Hãy chọn bản khác hoặc tải SRT/VTT lên.'});}finally{running--;}
 };
}
