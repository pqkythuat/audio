import {parseYouTubeLink} from './youtube.js?v=29';
export function bindAutoTitle({name,file,url,source}){
 let sequence=0;
 async function fill(){
  const ticket=++sequence;
  if(name.value.trim())return;
  if(source.value!=='youtube'){
   const selected=file.files[0];if(selected)name.value=selected.name.replace(/\.[^.]+$/,'').slice(0,150);return;
  }
  let link;try{link=parseYouTubeLink(url.value);}catch{return;}
  try{
   const response=await fetch('/api/youtube/title?url='+encodeURIComponent(link.youtubeUrl),{signal:AbortSignal.timeout(8000)});
   if(!response.ok)return;const data=await response.json();
   if(ticket===sequence&&!name.value.trim()&&source.value==='youtube'&&parseYouTubeLink(url.value).youtubeId===link.youtubeId)name.value=data.title.slice(0,150);
  }catch{}
 }
 file.addEventListener('change',fill);url.addEventListener('input',fill);source.addEventListener('change',fill);
 return fill;
}
