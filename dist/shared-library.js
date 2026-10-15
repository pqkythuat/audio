import {parseCaptions,formatTime} from './core.js?v=8';
import {parseYouTubeLink} from './youtube.js?v=27';
import {createCaptionPicker} from './caption-picker.js?v=27';

export async function initSharedLibrary({user,addToPersonal}){
 const $=id=>document.getElementById(id);let books=[];
 const uploadLimit=globalThis.langNgheSharedUploadMaxBytes||200*1024*1024;const admin=user.role==='admin';$('sharedPanel').hidden=false;$('sharedUploadToggle').hidden=!admin;
 const status=text=>{$('sharedStatus').textContent=text;};
 const youtubeCaptions=createCaptionPicker({prefix:'sharedYtCaption',urlInput:$('sharedYouTubeUrl'),fileInput:$('sharedCaption'),sourceInput:$('sharedSource'),saveLabel:'Tải lên',onSelected:cues=>{status('Đã lấy '+cues.length+' đoạn phụ đề. Bấm Tải lên để đăng bài.');showPreview(cues);},onReset:()=>showPreview([])});
 function showPreview(cues){$('sharedCaptionPreview').replaceChildren();for(const cue of cues.slice(0,5)){const line=document.createElement('p');line.textContent=`${formatTime(cue.start)} → ${formatTime(cue.end)} · ${cue.text}`;$('sharedCaptionPreview').append(line);}}
 $('sharedCaption').onchange=async()=>{try{const file=$('sharedCaption').files[0];if(file?.size>5*1024*1024)throw Error('Phụ đề tối đa 5 MB.');showPreview(file?parseCaptions(await file.text()):[]);}catch(e){status(e.message);showPreview([]);}};
 async function api(path,options={}){
  const response=await fetch(path,{cache:'no-store',...options});
  if(!response.ok){const error=await response.json().catch(()=>({}));throw Error(error.error||'Không kết nối được thư viện dùng chung.');}
  return response.json();
 }
 function render(){
  const q=$('sharedSearch').value.trim().toLocaleLowerCase('vi');$('sharedList').replaceChildren();
  const filtered=books.filter(b=>b.name.toLocaleLowerCase('vi').includes(q));
  if(!filtered.length){const empty=document.createElement('p');empty.className='muted';empty.textContent=q?'Không tìm thấy bài dùng chung.':'Chưa có bài dùng chung. Admin có thể tải bài lên tại đây.';$('sharedList').append(empty);}
  for(const book of filtered){
   const row=document.createElement('div');row.className='shared-book'+(book.pinned?' shared-pinned':'');
   const info=document.createElement('div'),title=document.createElement('b'),detail=document.createElement('small');title.textContent=(book.pinned?'📌 ':'')+book.name;detail.textContent=`${book.source==='youtube'?'YouTube':formatTime(book.duration)+' · '+(book.size/1024/1024).toFixed(1)+' MB'} · ${book.cues.length} đoạn`;info.append(title,detail);
   const actions=document.createElement('div');actions.className='book-actions';
   const add=document.createElement('button');add.textContent='Thêm vào của tôi';add.onclick=async()=>{add.disabled=true;status('Đang thêm bài vào danh sách của bạn…');try{let blob=null;if(book.source!=='youtube'){const response=await fetch('/api/shared/'+book.id+'/audio',{cache:'no-store'});if(!response.ok)throw Error('Không tải được audio. Bài có thể đã bị xóa hoặc phiên đăng nhập đã hết hạn.');blob=await response.blob();}await addToPersonal(book,blob);status('Bài đã có trong danh sách của bạn. Tiến độ và chỉnh sửa được lưu riêng.');}catch(e){status(e.message);}finally{add.disabled=false;}};actions.append(add);
   if(admin){
    const pin=document.createElement('button');pin.textContent=book.pinned?'Bỏ ghim':'Ghim';pin.setAttribute('aria-pressed',String(book.pinned));pin.onclick=async()=>{pin.disabled=true;try{await api('/api/shared/'+book.id,{method:'PATCH',headers:{'Content-Type':'application/json'},body:JSON.stringify({pinned:!book.pinned})});await refresh();status(book.pinned?'Đã bỏ ghim.':'Đã ghim bài lên đầu cho mọi người.');}catch(e){status(e.message);pin.disabled=false;}};
    const remove=document.createElement('button');remove.className='danger';remove.textContent='Xóa bài chung';remove.onclick=async()=>{if(!confirm(`Xóa bài dùng chung “${book.name}”? Các bản đã thêm vào danh sách riêng vẫn được giữ.`))return;remove.disabled=true;try{await api('/api/shared/'+book.id,{method:'DELETE'});await refresh();status('Đã xóa bài khỏi thư viện dùng chung.');}catch(e){status(e.message);remove.disabled=false;}};actions.append(pin,remove);
   }
   row.append(info,actions);$('sharedList').append(row);
  }
 }
 async function refresh(){const data=await api('/api/shared');books=data.books;render();}
 $('sharedSearch').oninput=render;
 $('sharedRefresh').onclick=async()=>{try{await refresh();status('Đã cập nhật thư viện dùng chung.');}catch(e){status(e.message);}};
 $('sharedUploadToggle').onclick=()=>{$('sharedUploadForm').hidden=!$('sharedUploadForm').hidden;};
 $('sharedSource').onchange=()=>{const youtube=$('sharedSource').value==='youtube';$('sharedYouTubeField').hidden=!youtube;$('sharedYtCaptionBox').hidden=!youtube;$('sharedAudioField').hidden=youtube;$('sharedAudio').required=!youtube;$('sharedYouTubeUrl').required=youtube;};
 function durationOf(file){return new Promise((resolve,reject)=>{const audio=new Audio(),url=URL.createObjectURL(file);const cleanup=()=>{clearTimeout(timer);audio.onloadedmetadata=audio.onerror=null;audio.removeAttribute('src');audio.load();URL.revokeObjectURL(url);};const timer=setTimeout(()=>{cleanup();reject(Error('Không đọc được thời lượng audio.'));},15000);audio.onloadedmetadata=()=>{const value=audio.duration;cleanup();value>0&&Number.isFinite(value)?resolve(value):reject(Error('Thời lượng audio không hợp lệ.'));};audio.onerror=()=>{cleanup();reject(Error('Trình duyệt không đọc được audio này.'));};audio.src=url;});}
 $('sharedUploadForm').onsubmit=async event=>{
  event.preventDefault();if(!admin||$('sharedSave').disabled)return;$('sharedSave').disabled=true;let draftId;
  try{
   const youtube=$('sharedSource').value==='youtube',link=youtube?parseYouTubeLink($('sharedYouTubeUrl').value):null,file=youtube?null:$('sharedAudio').files[0],subtitle=$('sharedCaption').files[0],name=$('sharedName').value.trim();
   if(!name||name.length>150)throw Error('Nhập tên bài, tối đa 150 ký tự.');
   if(!youtube&&(!file||!file.size||file.size>uploadLimit))throw Error('Chọn audio có dung lượng tối đa '+Math.floor(uploadLimit/1024/1024)+' MB.');
   if(subtitle?.size>5*1024*1024)throw Error('Phụ đề tối đa 5 MB.');
   const duration=youtube?0:await durationOf(file),caption=subtitle?await subtitle.text():youtubeCaptions.current()?.text||'';if(caption.trim())parseCaptions(caption);
   status('Đang tải bài lên cho mọi người…');
   const draft=await api('/api/shared',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({name,source:youtube?'youtube':'audio',...(link||{}),filename:file?.name||'YouTube',duration,caption,pinned:$('sharedPinned').checked})});draftId=draft.book.id;
   if(!youtube)await api('/api/shared/'+draftId+'/audio',{method:'PUT',headers:{'Content-Type':file.type||'application/octet-stream'},body:file});draftId=null;
   $('sharedUploadForm').reset();youtubeCaptions.reset();showPreview([]);$('sharedSource').onchange();$('sharedPinned').checked=true;$('sharedUploadForm').hidden=true;await refresh();status('Đã thêm bài vào thư viện dùng chung.');
  }catch(e){if(draftId)await api('/api/shared/'+draftId,{method:'DELETE'}).catch(()=>{});status(e.message);}finally{$('sharedSave').disabled=false;}
 };
 try{await refresh();}catch(e){status(e.message);}
}
