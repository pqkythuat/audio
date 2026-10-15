import {parseYouTubeLink} from './youtube.js?v=27';
import {parseCaptions} from './core.js?v=8';

export function createCaptionPicker({prefix,urlInput,fileInput,sourceInput,onSelected=()=>{},onReset=()=>{},saveLabel='Lưu'}){
 const $=suffix=>document.getElementById(prefix+suffix);let selected=null,sequence=0,controller;
 const videoId=()=>parseYouTubeLink(urlInput.value).youtubeId;
 const reset=()=>{++sequence;controller?.abort();selected=null;$('Tracks').replaceChildren();$('Choices').hidden=true;$('Status').textContent=globalThis.langNgheStaticHosting?'Lấy phụ đề YouTube cần kết nối máy chủ. Bạn có thể tải file SRT/VTT bên dưới.':'';$('Find').disabled=!!globalThis.langNgheStaticHosting;$('Use').disabled=false;};
 const current=()=>{if(!selected||sourceInput.value!=='youtube')return null;try{return selected.videoId===videoId()?selected:null;}catch{return null;}};
 async function request(id,track){const activeController=new AbortController();controller=activeController;const timeout=setTimeout(()=>activeController.abort(),45000);try{const response=await fetch('/api/youtube/captions?videoId='+encodeURIComponent(id)+(track?'&track='+encodeURIComponent(track):''),{cache:'no-store',signal:activeController.signal});const data=await response.json();if(!response.ok)throw Error(data.error||'Chưa lấy được phụ đề YouTube.');return data;}finally{clearTimeout(timeout);}}
 $('Find').onclick=async()=>{
  const token=++sequence;controller?.abort();$('Find').disabled=true;$('Choices').hidden=true;$('Status').textContent='Đang tìm phụ đề YouTube…';
  try{const id=videoId(),data=await request(id);if(token!==sequence)return;$('Tracks').replaceChildren();for(const track of data.tracks){const option=document.createElement('option');option.value=track.id;option.textContent=`${track.name} (${track.language})${track.automatic?' · Tự động':''}`;$('Tracks').append(option);}$('Tracks').value=data.tracks[0]?.id||'';$('Choices').hidden=!data.tracks.length;$('Status').textContent='Chọn ngôn ngữ rồi bấm Dùng phụ đề này.';}
  catch(e){if(token===sequence)$('Status').textContent=e.name==='AbortError'?'Lấy phụ đề quá lâu. Hãy thử lại hoặc tải SRT/VTT lên.':e.message;}
  finally{if(token===sequence)$('Find').disabled=false;}
 };
 $('Use').onclick=async()=>{
  const token=++sequence;controller?.abort();$('Use').disabled=true;$('Find').disabled=true;$('Status').textContent='Đang tải nội dung phụ đề…';
  try{const id=videoId(),track=$('Tracks').value;if(!track)throw Error('Chọn một bản phụ đề.');const data=await request(id,track);if(token!==sequence||videoId()!==id)return;const cues=parseCaptions(data.caption);selected={videoId:id,text:data.caption};fileInput.value='';onSelected(cues);$('Status').textContent=`Đã lấy ${cues.length} đoạn · ${data.language}${data.automatic?' · Phụ đề tự động':''}. Bấm ${saveLabel} để áp dụng.`;}
  catch(e){if(token===sequence)$('Status').textContent=e.name==='AbortError'?'Lấy phụ đề quá lâu. Hãy thử lại hoặc tải SRT/VTT lên.':e.message;}
  finally{if(token===sequence){$('Use').disabled=false;$('Find').disabled=false;}}
 };
 urlInput.addEventListener('input',()=>{const had=!!selected;reset();if(had)onReset();});
 sourceInput.addEventListener('change',()=>{const had=!!selected;reset();if(had)onReset();});
 fileInput.addEventListener('change',reset);
 if(globalThis.langNgheStaticHosting)reset();
 return {reset,current};
}
