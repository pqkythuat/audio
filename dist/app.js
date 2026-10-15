import {bindAutoTitle} from './auto-title.js?v=31';
import {identifyLesson} from './study-core.js?v=35';
import {sentenceBlocks,nextRepeat} from './practice.js?v=12';
import {parseCaptions,parseRange,formatTime,cleanCaption,captionNeighbors} from './core.js?v=8';
import {toIPA} from './ipa.js?v=8';
import {estimateWords,currentWord} from './word-timing.js?v=8';
import {parseYouTubeLink,createMediaController} from './youtube.js?v=29';
import {createCaptionPicker} from './caption-picker.js?v=27';
import {bindYouTubeControls} from './youtube-controls.js?v=29';
const $=id=>document.getElementById(id),audio=createMediaController($('audio'),{container:$('youtubePanel')});
const youtubeCaptions=createCaptionPicker({prefix:'ytCaption',urlInput:$('youtubeUrl'),fileInput:$('captionFile'),sourceInput:$('sourceType'),onSelected:cues=>{++previewSequence;$('removeCaption').checked=false;showCaptionPreview(cues);$('formError').textContent='';},onReset:()=>showCaptionPreview(null)});
let db,books=[],active=null,url=null,selection=[],mode=null,A=null,B=null,blocks=[],editing=null,lastSave=0,lastCue=-1,busy=false,openSequence=0,mediaReady=false;
const fillTitle=bindAutoTitle({name:$('name'),file:$('audioFile'),url:$('youtubeUrl'),source:$('sourceType')});
let sharedEntries=[],sharedRow;
export function setSharedLibrary(entries,row){sharedEntries=entries;sharedRow=row;renderLibrary();}
const youtubeBar=bindYouTubeControls(audio,{play:$('youtubePlay'),seek:$('youtubeSeek'),time:$('youtubeTime'),mute:$('youtubeMute'),canPlay:()=>mediaReady,onPlay:playAudio,onSeek:value=>{resetLoop();audio.currentTime=value;updateCaption();safe(saveProgress);},onError:message=>toast(message)});
const toast=message=>{$('toast').textContent=message;$('toast').style.display='block';clearTimeout(toast.timer);toast.timer=setTimeout(()=>$('toast').style.display='none',5000);};
const size=n=>`${(n/1024/1024).toFixed(1)} MB`;
let timelines=[],cueWordViews=[],mainWordView={english:[],ipa:[]},highlightedNodes=[],lastWord=-1;
let contextKey='';
let repeatIndex=0,repeatPlayed=1,restTimer=null,restTicker=null,captionsHidden=false;
$('repeatCount').value='3';$('repeatRest').value='0';
for(const [id,key,allowed] of [['repeatCount','lang-nghe-repeat',[0,2,3,5]],['repeatRest','lang-nghe-rest',[0,1,2,3,5]]]){
 try{const saved=localStorage.getItem(key);if(saved!==null&&allowed.includes(Number(saved)))$(id).value=saved;}catch{}
 $(id).onchange=()=>{try{localStorage.setItem(key,$(id).value);}catch{}resetLoop();};
}
function updatePracticeProgress(index=lastCue){
 let text='';
 if(active&&mediaReady){
  const practicing=(mode==='sentence'||mode==='replay'||mode==='item')&&blocks.length;
  const cueIndex=practicing?blocks[repeatIndex].index:index;
  if(cueIndex>=0){
   text=`Câu ${cueIndex+1}/${active.cues.length}`;
   if(mode==='sentence')text+=` · Lượt ${repeatPlayed}/${Number($('repeatCount').value)||'∞'}`;
   if(mode==='replay')text+=' · Nghe lại';if(mode==='item')text+=` · Lượt ${repeatPlayed}/∞`;
   text+=restTimer!==null?' · Chuẩn bị':audio.paused?' · Tạm dừng':' · Đang phát';
  }
 }
 if($('practiceProgress').textContent!==text)$('practiceProgress').textContent=text;
}
function cancelRest(){clearTimeout(restTimer);clearInterval(restTicker);restTimer=null;restTicker=null;$('cancelRest').hidden=true;$('practiceStatus').textContent='';updatePracticeProgress();}
function applyCaptionVisibility(){
 for(const id of ['currentCard','nextCard'])$(id).hidden=captionsHidden;
 $('captionReveal').textContent=captionsHidden?'Hiện phụ đề':'Ẩn phụ đề';
 $('captionReveal').setAttribute('aria-pressed',String(captionsHidden));measureDock();
}
$('captionReveal').onclick=()=>{captionsHidden=!captionsHidden;applyCaptionVisibility();};
$('cancelRest').onclick=()=>{resetLoop();audio.pause();};
$('replayCue').onclick=()=>{
 if(!active||!mediaReady)return;
 const time=audio.currentTime-(active.offset||0);
 const index=active.cues.findIndex(c=>time>=c.start&&time<c.end);
 if(index<0){toast('Hãy phát đến câu muốn nghe lại.');return;}
 if(selection.length&&!selection.includes(index)){toast('Câu này chưa được chọn. Hãy chọn câu trước khi phát.');return;}
 resetLoop();blocks=sentenceBlocks(active.cues,[index],active.offset||0,active.duration);
 if(!blocks.length)return;mode='replay';audio.currentTime=blocks[0].start;updateCaption();safe(playAudio);
};
function repeatTransition(target){
 const wait=Number($('repeatRest').value)||0;
 if(!wait){audio.currentTime=target;updateCaption();if(audio.paused)safe(playAudio);return;}
 audio.pause();$('cancelRest').hidden=false;
 const deadline=Date.now()+wait*1000;
 const countdown=()=>{const text=`Nghe tiếp sau ${Math.max(1,Math.ceil((deadline-Date.now())/1000))} giây`;
 if($('practiceStatus').textContent!==text)$('practiceStatus').textContent=text;};
 countdown();restTicker=setInterval(countdown,200);
 const id=active.id;
 restTimer=setTimeout(()=>{cancelRest();if(active?.id!==id||!mode||!mediaReady)return;audio.currentTime=target;updateCaption();safe(playAudio);},wait*1000);
 updatePracticeProgress();
}
function practiceEnd(){
 if(mode==='item'&&blocks.length){repeatPlayed++;repeatTransition(blocks[0].start);return;}
 if(mode==='replay'){const end=blocks[0]?.end;audio.pause();resetLoop();if(end!==undefined)audio.currentTime=end;return;}
 if(mode==='sentence'&&blocks.length){const next=nextRepeat(repeatIndex,repeatPlayed,Number($('repeatCount').value),blocks.length);repeatIndex=next.index;repeatPlayed=next.played;repeatTransition(blocks[repeatIndex].start);}
}
function measureDock(){const height=$('listeningDock').hidden?0:$('listeningDock').getBoundingClientRect().height;document.documentElement?.style?.setProperty?.('--dock-height',`${height||0}px`);}
function setSentencePanel(open,scroll=true){$('sentencePanel').hidden=!open;$('openSentences').setAttribute('aria-expanded',String(open));$('openSentences').textContent=open?'Đóng danh sách':'Chọn câu';if(open&&scroll)$('sentencePanel').scrollIntoView?.({behavior:'smooth',block:'start'});}
function updateABButton(){const looping=mode==='ab';$('abQuick').textContent=looping?'Tắt A–B':A!==null?`Đặt B · A ${formatTime(A)}`:'Lặp A–B';$('abQuick').classList.toggle('loop-on',looping);$('abQuick').setAttribute('aria-pressed',String(looping));}
function showLibrary(show=true){$('libraryDialog').hidden=!show;$('player').hidden=show||!active;$('empty').hidden=true;$('closeLibrary').hidden=!active;$('openLibrary').setAttribute('aria-expanded',String(show));}
$('openLibrary').onclick=()=>showLibrary();$('closeLibrary').onclick=()=>showLibrary(false);
$('openSettings').onclick=()=>$('settingsDialog').showModal();$('closeSettings').onclick=()=>$('settingsDialog').close();
$('openSentences').onclick=()=>{if(!$('libraryDialog').hidden){showLibrary(false);setSentencePanel(true);}else setSentencePanel($('sentencePanel').hidden);};$('closeSentences').onclick=()=>setSentencePanel(false);
$('collapseDock').onclick=()=>{const collapsed=$('collapseDock').getAttribute('aria-expanded')!=='false';$('listeningDock').classList.toggle('dock-collapsed',collapsed);$('collapseDock').setAttribute('aria-expanded',String(!collapsed));$('collapseDock').textContent=collapsed?'Mở rộng ↓':'Thu gọn ↑';measureDock();};
$('abQuick').onclick=()=>{if(mode==='ab')$('clearAB').click();else if(A===null)$('markA').click();else $('markB').click();};
if(typeof ResizeObserver!=='undefined'){const dockObserver=new ResizeObserver(measureDock);dockObserver.observe($('listeningDock'));}
if(typeof window!=='undefined')window.addEventListener('resize',measureDock);
function updateContext(index,time){if(!active)return;let previous=-1,next=-1;if(index>=0)({previous,next}=captionNeighbors(active.cues,index,selection,mode==='sentence'));else{for(let i=0;i<active.cues.length;i++){const cue=active.cues[i];if(!cue.text)continue;if(cue.end<=time)previous=i;else if(cue.start>=time&&next<0)next=i;}}const key=[active.id,index,previous,next,$('ipaToggle').checked].join(':');if(key===contextKey)return;contextKey=key;$('currentTimeHint').textContent=index>=0?`${index+1} / ${active.cues.length} · ${formatTime(active.cues[index].start)}`:'';for(const [prefix,idx]of [['previous',previous],['next',next]]){const cue=active.cues[idx];$(prefix+'Text').textContent=cue?.text||'';$(prefix+'IPA').textContent='';$(prefix+'IPA').hidden=true;$(prefix+'Time').textContent=cue?`${idx+1} · ${formatTime(cue.start)} – ${formatTime(cue.end)}`:'';$(prefix+'Card').classList.toggle('context-empty',!cue);}}
function drawWordLine(container,parts,ipa){container.replaceChildren();const words=[];const addText=text=>{const span=document.createElement('span');span.textContent=text;container.append(span);};if(ipa&&parts.some(p=>p.ipa.trim()))addText('/');for(const part of parts){const value=ipa?part.ipa:part.text;if(!value)continue;const span=document.createElement('span');span.textContent=value;if(part.index>=0){span.className='word';words[part.index]=span;}container.append(span);}if(ipa&&parts.some(p=>p.ipa.trim()))addText('/');return words;}
function clearWordHighlight(){for(const node of highlightedNodes){node.classList.remove('word-current');node.setAttribute('aria-current','false');}highlightedNodes=[];lastWord=-1;}
function updateWordHighlight(time){const next=$('wordToggle').checked&&lastCue>=0?currentWord(timelines[lastCue]?.words||[],time):-1;if(next===lastWord)return;clearWordHighlight();lastWord=next;if(next<0)return;const row=cueWordViews[lastCue];highlightedNodes=[mainWordView.english[next],mainWordView.ipa[next],row?.english[next],row?.ipa[next]].filter(Boolean);for(const node of highlightedNodes){node.classList.add('word-current');node.setAttribute('aria-current','true');}}
function setSpeed(rate,persist=true){const value=[1,.75,.5].includes(Number(rate))?Number(rate):1;audio.playbackRate=value;const chosen=audio.playbackRate;for(const [id,speed]of [['speedDefault',1],['speed075',.75],['speed050',.5]]){const pressed=chosen===speed;$(id).setAttribute('aria-pressed',String(pressed));$(id).classList.toggle('speed-selected',pressed);}if(persist)safe(saveProgress);}
function request(store,operation,value){return new Promise((resolve,reject)=>{const tx=db.transaction(store,operation==='get'||operation==='getAll'?'readonly':'readwrite');const req=tx.objectStore(store)[operation](value);let result;req.onsuccess=()=>result=req.result;tx.oncomplete=()=>resolve(result);tx.onerror=()=>reject(tx.error);tx.onabort=()=>reject(tx.error||Error('Không thể lưu dữ liệu.'));});}
function writeBoth(book,blob){return new Promise((resolve,reject)=>{const tx=db.transaction(['books','files'],'readwrite');tx.objectStore('books').put(book);if(blob)tx.objectStore('files').put({id:book.id,blob});else if(book.source==='youtube')tx.objectStore('files').delete(book.id);tx.oncomplete=resolve;tx.onerror=()=>reject(tx.error);tx.onabort=()=>reject(tx.error||Error('Không đủ dung lượng lưu trữ.'));});}
export async function addSharedToPersonal(shared,blob){
 if(!db)throw Error('Thư viện cá nhân chưa sẵn sàng.');
 const existing=books.find(b=>b.sharedSourceId===shared.id);
 if(existing){await openBook(existing.id);return;}
 const book={id:'shared-copy-'+shared.id,sharedSourceId:shared.id,name:shared.name,filename:shared.filename,type:shared.source==='youtube'?'youtube':blob?.type||shared.type,size:blob?.size||0,duration:shared.duration,caption:shared.caption,cues:shared.cues.map(c=>({...c})),created:Date.now(),position:0,speed:1,selected:[],offset:0,...(shared.source==='youtube'?{source:'youtube',youtubeId:shared.youtubeId,youtubeUrl:shared.youtubeUrl}:{})};
 await writeBoth(book,blob);await refresh();await openBook(book.id);
}
async function refresh(){books=(await request('books','getAll')).sort((a,b)=>b.created-a.created);for(const book of books){let parsed;try{parsed=typeof book.caption==='string'&&book.caption.trim()?parseCaptions(book.caption):book.cues.map(c=>({...c,text:cleanCaption(c.text)})).filter(c=>c.text);}catch{parsed=book.cues.map(c=>({...c,text:cleanCaption(c.text)})).filter(c=>c.text);}parsed=parsed.map(c=>{const old=book.cues.find(x=>x.start===c.start&&x.end===c.end&&x.text===c.text);return old?.segment_id?{...old,...c}:c;});if(JSON.stringify(parsed)===JSON.stringify(book.cues))continue;const sameTiming=parsed.length===book.cues.length&&parsed.every((c,i)=>c.start===book.cues[i].start&&c.end===book.cues[i].end);if(!sameTiming)book.selected=(book.selected||[]).map(i=>{const old=book.cues[i];return old?parsed.findIndex(c=>c.start===old.start&&c.end===old.end&&c.text===cleanCaption(old.text)):-1;}).filter(i=>i>=0);book.cues=parsed;await request('books','put',book);}renderLibrary();await storage();}
function renderLibrary(){const q=$('search').value.toLocaleLowerCase('vi'),onlyPinned=$('pinFilter').checked,sharedIds=new Set(sharedEntries.map(b=>b.id)),personal=books.filter(b=>!sharedIds.has(b.sharedSourceId));$('count').textContent=personal.length+sharedEntries.length;$('library').replaceChildren();const filtered=personal.map(b=>({...b,shared:false})).concat(sharedEntries.map(b=>({...b,shared:true}))).filter(b=>b.name.toLocaleLowerCase('vi').includes(q)&&(!onlyPinned||b.pinned)).sort((a,b)=>Number(!!b.pinned)-Number(!!a.pinned)||(b.created||0)-(a.created||0));if(!filtered.length){const p=document.createElement('p');p.style.fontSize='12px';p.textContent=q?'Không tìm thấy bài nghe.':'Thư viện đang chờ bài nghe đầu tiên.';$('library').append(p);}for(const b of filtered){if(b.shared){$('library').append(sharedRow(b));continue;}const row=document.createElement('div');row.className='book'+(active?.id===b.id?' active':'');const button=document.createElement('button');button.className='book-open';const title=document.createElement('b');title.textContent=(b.pinned?'📌 ':'')+b.name;const details=document.createElement('small');details.textContent=`Của tôi · ♫ ${formatTime(b.duration)} · ${b.source==='youtube'?'YouTube':size(b.size)} · ${b.cues.length?b.cues.length+' đoạn':'Chưa có phụ đề'}`;const progress=document.createElement('div');progress.className='progress';const bar=document.createElement('span');bar.style.width=`${Math.min(100,(b.position||0)/b.duration*100)||0}%`;progress.append(bar);button.append(title,details,progress);button.onclick=()=>safe(()=>openBook(b.id));const actions=document.createElement('div');actions.className='book-actions';const edit=document.createElement('button');edit.textContent='Chỉnh sửa';edit.setAttribute('aria-label',`Chỉnh sửa ${b.name}`);edit.onclick=()=>showForm(true,b);const remove=document.createElement('button');remove.textContent='Xóa';remove.className='danger';remove.setAttribute('aria-label',`Xóa ${b.name}`);remove.onclick=()=>safe(()=>deleteBook(b));const pin=document.createElement('button');pin.textContent=b.pinned?'Bỏ ghim':'Ghim';pin.setAttribute('aria-pressed',String(!!b.pinned));pin.onclick=()=>safe(async()=>{const original=books.find(x=>x.id===b.id);original.pinned=!original.pinned;if(active?.id===b.id)active.pinned=original.pinned;await request('books','put',original);renderLibrary();});actions.append(edit,remove,pin);row.append(button,actions);$('library').append(row);}}
async function storage(){const total=books.reduce((n,b)=>n+b.size,0);$('usage').textContent=`${books.length} bài · ${size(total)} đã lưu`;try{const info=await navigator.storage?.estimate();if(info?.quota)$('usage').textContent+=` · Quota trình duyệt ${size(info.quota)}`;}catch{}}
async function saveProgress(){if(!active||!mediaReady)return;const book={...active};book.position=audio.currentTime||0;book.speed=audio.playbackRate;book.selected=[...selection];book.offset=Number($('offset').value)||0;Object.assign(active,book);await request('books','put',book);const index=books.findIndex(b=>b.id===book.id);if(index>=0)books[index]=book;}
function updateItemButtons(){for(let i=0;i<(active?.cues.length||0);i++){const button=$('cue-'+i)?.children[2];if(!button)continue;const looping=mode==='item'&&blocks[0]?.index===i;button.textContent=looping?'■':'▶';button.setAttribute('aria-label',looping?'Dừng lặp câu '+(i+1):'Lặp câu '+(i+1));button.setAttribute('aria-pressed',String(looping));}}
function setLoopButton(playing){updateItemButtons();const label=playing?'Dừng lặp':'Bắt đầu lặp';$('loop').textContent=playing?'■':'▶';$('loop').setAttribute('aria-label',label);$('loop').setAttribute('title',label);$('loop').setAttribute('aria-pressed',String(playing));}
function resetLoop(){cancelRest();repeatIndex=0;repeatPlayed=1;mode=null;A=null;B=null;blocks=[];$('abText').textContent='Chọn điểm bắt đầu và kết thúc khi nghe.';setLoopButton(false);updateABButton();updatePracticeProgress();}
async function openBook(id){
 cancelRest();const sequence=++openSequence;await saveProgress();
 const book=books.find(b=>b.id===id);if(!book)throw Error('Không tìm thấy bài nghe.');
 const file=book.source==='youtube'?null:await request('files','get',id);
 if(sequence!==openSequence)return;if(book.source!=='youtube'&&!file?.blob&&!book.sharedSourceId)throw Error('Không tìm thấy audio. Hãy khôi phục từ bản sao lưu.');
 mediaReady=false;audio.pause();audio.clearYouTube();resetLoop();if(url){URL.revokeObjectURL(url);url=null;}
 active=book;$('range').value='';selection=(active.selected||[]).filter(i=>i>=0&&i<active.cues.length);clearWordHighlight();timelines=active.cues.map(estimateWords);lastCue=-1;
 if(book.source!=='youtube'){if(file?.blob){url=URL.createObjectURL(file.blob);audio.src=url;}else audio.src='/api/shared/'+book.sharedSourceId+'/audio';setSpeed(active.speed||1,false);}
 $('offset').value=active.offset||0;$('title').textContent=active.name;$('details').textContent=book.source==='youtube'?'YouTube · Cần kết nối mạng':`${formatTime(active.duration)} · ${size(active.size)} · ${active.filename}`;
 $('youtubeControls').hidden=book.source!=='youtube';youtubeBar.render();$('youtubeExternal').hidden=book.source!=='youtube';$('youtubeExternal').href=book.source==='youtube'?book.youtubeUrl:'';$('empty').hidden=true;$('player').hidden=false;$('listeningDock').hidden=false;showLibrary(false);measureDock();$('subtitle').textContent='Bấm phát để bắt đầu nghe.';$('mainIPA').textContent='';$('mainIPA').hidden=true;contextKey='';updateContext(-1,0);$('captionTools').hidden=!active.cues.length;renderCues();renderLibrary();setSentencePanel(true,false);
 audio.onloadedmetadata=()=>{if(sequence!==openSequence||active?.id!==book.id)return;
  if(book.source==='youtube'){book.duration=audio.duration;setSpeed(book.speed||1,false);renderLibrary();}
  audio.currentTime=Math.min(book.position||0,Math.max(0,audio.duration-.05));mediaReady=true;updateCaption();
 };
 if(book.source==='youtube'){const {youtubeId}=parseYouTubeLink(book.youtubeUrl);await audio.loadYouTube(youtubeId);measureDock();}
}
function renderCues(){clearWordHighlight();cueWordViews=[];lastCue=-2;$('cues').replaceChildren();if(!active.cues.length){const p=document.createElement('p');p.textContent='Bài này chưa có phụ đề. Bạn vẫn có thể lặp A–B, hoặc thêm SRT/VTT trong Chỉnh sửa.';$('cues').append(p);}active.cues.forEach((cue,index)=>{const row=document.createElement('div');row.className='cue'+(selection.includes(index)?' selected':'');row.id='cue-'+index;const check=document.createElement('input');check.type='checkbox';check.checked=selection.includes(index);check.setAttribute('aria-label',`Chọn đoạn ${index+1}`);check.onchange=()=>{resetLoop();$('range').value='';selection=check.checked?[...selection,index].sort((a,b)=>a-b):selection.filter(n=>n!==index);row.classList.toggle('selected',check.checked);selectionChanged();};const content=document.createElement('div');const timestamp=document.createElement('small');timestamp.textContent=`${index+1} · ${formatTime(cue.start)} – ${formatTime(cue.end)}`;const text=document.createElement('p');const englishWords=drawWordLine(text,timelines[index].parts,false);content.append(timestamp,text);const ipa=document.createElement('p');ipa.className='cue-ipa';const converted=toIPA(cue.text);const ipaWords=drawWordLine(ipa,timelines[index].parts,true);cueWordViews[index]={english:englishWords,ipa:ipaWords};ipa.title=converted.missing.length?`Chưa có phiên âm: ${converted.missing.join(', ')}`:'Phiên âm từng từ theo CMUdict';ipa.hidden=true;content.append(ipa);const play=document.createElement('button');play.textContent='▶';play.setAttribute('aria-label',`Nghe đoạn ${index+1}`);play.onclick=()=>{if(!mediaReady)return;if(mode==='item'&&blocks[0]?.index===index){audio.pause();resetLoop();return;}resetLoop();blocks=sentenceBlocks(active.cues,[index],active.offset||0,active.duration);if(!blocks.length){toast('Câu này nằm ngoài thời lượng audio.');return;}mode='item';updateItemButtons();audio.currentTime=blocks[0].start;updateCaption();safe(playAudio);};row.append(check,content,play);$('cues').append(row);});$('selectedCount').textContent=`${selection.length}/${active.cues.length}`;updateItemButtons();updateCaption();}
function loopBlocks(){return sentenceBlocks(active.cues,selection,active.offset||0,active.duration);}
function selectionChanged(){cancelRest();repeatIndex=0;repeatPlayed=1;blocks=loopBlocks();if(!blocks.length&&mode==='sentence'){resetLoop();toast('Không có đoạn hợp lệ để lặp với độ lệch hiện tại.');}$('selectedCount').textContent=`${selection.length}/${active.cues.length}`;safe(saveProgress);}
function constrainSelectedPlayback(){
 if(!active||!mediaReady||!selection.length||mode==='sentence'||mode==='replay'||mode==='item'||mode==='study')return true;
 let allowed=loopBlocks();
 if(mode==='ab'&&B>A)allowed=allowed.map(b=>({...b,start:Math.max(b.start,A),end:Math.min(b.end,B)})).filter(b=>b.end>b.start);
 if(!allowed.length){audio.pause();return false;}
 const time=audio.currentTime;
 if(!allowed.some(b=>time>=b.start&&time<b.end))audio.currentTime=(allowed.find(b=>b.start>time)||allowed[0]).start;
 return true;
}
async function playAudio(){if(!mediaReady)throw Error('Audio đang tải. Vui lòng chờ một chút.');if(!constrainSelectedPlayback())return;try{await audio.play();}catch{resetLoop();throw Error('Không thể phát audio. Hãy kiểm tra định dạng file hoặc bấm phát lại.');}}
function updateCaption(){if(!active||!mediaReady)return;const t=audio.currentTime-(active.offset||0);const index=active.cues.findIndex(c=>t>=c.start&&t<c.end);updatePracticeProgress(index);if(index===lastCue){updateWordHighlight(t);updateContext(index,t);return;}clearWordHighlight();if(lastCue>=0)$('cue-'+lastCue)?.classList.remove('current');lastCue=index;if(index>=0){mainWordView.english=drawWordLine($('subtitle'),timelines[index].parts,false);const ipa=toIPA(active.cues[index].text);mainWordView.ipa=drawWordLine($('mainIPA'),timelines[index].parts,true);$('mainIPA').hidden=!$('ipaToggle').checked||!ipa.text;$('mainIPA').title=ipa.missing.length?`Chưa có phiên âm: ${ipa.missing.join(', ')}`:'';const row=$('cue-'+index);row?.classList.add('current');if(row&&!audio.paused){const parent=$('cues');parent.scrollTop+=row.getBoundingClientRect().top-parent.getBoundingClientRect().top-parent.clientHeight/2+row.clientHeight/2;}}else {$('subtitle').textContent=active.cues.length?'♪ Khoảng nghỉ ♪':'Nghe theo nhịp riêng của bạn.';$('mainIPA').textContent='';$('mainIPA').hidden=true;}updateWordHighlight(t);updateContext(index,t);measureDock();}
function enforceLoop(){if(active&&mediaReady&&!audio.paused&&!audio.seeking&&restTimer===null){if(!constrainSelectedPlayback())return;const t=audio.currentTime;if(mode==='ab'&&B>A&&(t>=B||t<A-.1))audio.currentTime=A;else if((mode==='sentence'||mode==='replay'||mode==='item')&&blocks.length){const block=blocks[repeatIndex];if(t>=block.end)practiceEnd();else if(t<block.start-.1)audio.currentTime=block.start;}}}

function tick(){enforceLoop();if(active&&mediaReady&&!audio.paused)updateCaption();requestAnimationFrame(tick);}
audio.addEventListener('timeupdate',()=>{enforceLoop();updateCaption();if(Date.now()-lastSave>2000){lastSave=Date.now();safe(saveProgress);}});audio.addEventListener('pause',()=>{updatePracticeProgress();safe(saveProgress);});audio.addEventListener('play',()=>{cancelRest();constrainSelectedPlayback();});audio.addEventListener('seeked',()=>{if(!audio.paused)constrainSelectedPlayback();});audio.addEventListener('seeking',()=>{if(restTimer!==null)resetLoop();});audio.addEventListener('ended',()=>{if(!mediaReady)return;if(mode==='ab'){audio.currentTime=A;safe(playAudio);}else if((mode==='sentence'||mode==='replay'||mode==='item')&&blocks.length&&restTimer===null&&audio.currentTime>=blocks[repeatIndex].end)practiceEnd();else if(selection.length&&mode===null)safe(playAudio);else safe(saveProgress);});audio.addEventListener('error',()=>{if(active){mediaReady=false;youtubeBar.render();resetLoop();toast(active.source==='youtube'?audio.errorMessage:'Trình duyệt không đọc được audio này. Hãy thử file MP3 hoặc WAV.');}});
async function safe(fn){try{await fn();}catch(error){toast(error?.name==='QuotaExceededError'?'Thiết bị không đủ dung lượng. Hãy sao lưu và xóa bớt bài.':error.message||'Thao tác chưa thành công.');}}
function updateSourceForm(){const youtube=$('sourceType').value==='youtube';$('audioFileBox').hidden=youtube;$('ytCaptionBox').hidden=!youtube;$('youtubeField').hidden=!youtube;$('audioFile').required=!youtube&&!editing;$('youtubeUrl').required=youtube;$('sourceNotice').textContent=youtube?'Video phát trực tuyến qua YouTube. Thêm SRT/VTT nếu cần luyện theo câu; bạn có thể lấy phụ đề từ YouTube hoặc tải SRT/VTT lên.':'Audio được lưu trong trình duyệt này. Hãy sao lưu định kỳ để tránh mất dữ liệu.';}
$('sourceType').onchange=updateSourceForm;
function showForm(edit=false,book=active){editing=edit?book:null;++previewSequence;showCaptionPreview(edit?editing.cues:null);$('uploadForm').reset();youtubeCaptions.reset();$('dialogTitle').textContent=edit?'Chỉnh sửa bài nghe':'Thêm bài nghe';$('name').value=editing?.name||'';$('sourceType').value=editing?.source==='youtube'?'youtube':'audio';$('youtubeUrl').value=editing?.youtubeUrl||'';updateSourceForm();$('audioHint').textContent=edit?'Để trống để giữ audio hiện tại · Tối đa 200 MB':'Chọn file từ thiết bị · Tối đa 200 MB/bài';$('removeCaption').parentElement.hidden=!edit;$('formError').textContent='';$('dialog').showModal();}
let previewSequence=0;
function showCaptionPreview(cues){$('captionPreview').replaceChildren();if(!cues)return;const summary=document.createElement('b');summary.textContent=`Đọc được ${cues.length} đoạn phụ đề riêng biệt`;$('captionPreview').append(summary);for(const [index,cue]of cues.slice(0,5).entries()){const line=document.createElement('p');line.textContent=`${index+1}. ${cue.start.toFixed(3)} → ${cue.end.toFixed(3)} giây\n${cue.text}`;$('captionPreview').append(line);}}
$('captionFile').onchange=async()=>{const sequence=++previewSequence,file=$('captionFile').files[0];showCaptionPreview(null);$('formError').textContent='';if(!file)return;try{if(file.size>5*1024*1024)throw Error('File phụ đề vượt quá 5 MB.');const cues=parseCaptions(await file.text());if(sequence===previewSequence)showCaptionPreview(cues);}catch(error){if(sequence===previewSequence)$('formError').textContent=error.message;}};
$('pinFilter').onchange=renderLibrary;
$('add').onclick=$('emptyAdd').onclick=()=>showForm();$('edit').onclick=()=>showForm(true);$('close').onclick=()=>{if(!busy)$('dialog').close();};$('dialog').addEventListener('cancel',e=>{if(busy)e.preventDefault();});$('audioFile').onchange=()=>{const f=$('audioFile').files[0];if(f&&!$('name').value)$('name').value=f.name.replace(/\.[^.]+$/,'');};
async function durationOf(file){return new Promise((resolve,reject)=>{const a=new Audio(),u=URL.createObjectURL(file);const cleanup=()=>{clearTimeout(timer);a.onloadedmetadata=null;a.onerror=null;a.removeAttribute('src');a.load();URL.revokeObjectURL(u);};const timer=setTimeout(()=>{cleanup();reject(Error('Không đọc được thông tin audio. Hãy thử file khác.'));},15000);a.onloadedmetadata=()=>{const d=a.duration;cleanup();Number.isFinite(d)&&d>0?resolve(d):reject(Error('Thời lượng audio không hợp lệ.'));};a.onerror=()=>{cleanup();reject(Error('Định dạng audio không được trình duyệt hỗ trợ.'));};a.src=u;});}
$('uploadForm').onsubmit=async e=>{
 e.preventDefault();if(busy)return;busy=true;$('save').disabled=true;$('save').textContent='Đang lưu…';$('formError').textContent='';
 try{
  await saveProgress();const youtube=$('sourceType').value==='youtube',file=youtube?null:$('audioFile').files[0],caption=$('captionFile').files[0];
  const link=youtube?parseYouTubeLink($('youtubeUrl').value):null;
  if(!youtube&&!file&&(!editing||editing.source==='youtube'))throw Error('Chọn file audio từ thiết bị.');
  if(file?.size>200*1024*1024)throw Error('File audio vượt quá 200 MB.');if(caption?.size>5*1024*1024)throw Error('File phụ đề vượt quá 5 MB.');
  await fillTitle();const name=$('name').value.trim();if(!name)throw Error('Vui lòng nhập tên bài nghe.');
  const changed=youtube?editing?.youtubeId!==link.youtubeId:!!file||editing?.source==='youtube';
  const duration=youtube?(changed?0:editing?.duration||0):file?await durationOf(file):editing.duration;
  const downloaded=youtubeCaptions.current();
  const retained=changed&&youtube?null:editing;
  const text=caption?await caption.text():$('removeCaption').checked?'':downloaded?.text??retained?.caption??'';
  const cues=caption||downloaded&&!$('removeCaption').checked?parseCaptions(text):$('removeCaption').checked?[]:retained?.cues||[];
  if(duration>0&&cues.some(c=>c.start>=duration+.5))throw Error('Phụ đề có đoạn bắt đầu sau khi bài kết thúc. Kiểm tra lại file.');
  const book={...(editing||{}),id:editing?.id||crypto.randomUUID(),name,created:editing?.created||Date.now(),source:youtube?'youtube':'audio',filename:youtube?'YouTube':file?.name||editing?.filename,type:youtube?'youtube':file?.type||(editing?.source==='youtube'?'audio/mpeg':editing?.type)||'audio/mpeg',size:youtube?0:file?.size||editing?.size,duration,caption:text,cues,position:changed?0:editing?.position||0,speed:editing?.speed||1,selected:caption||downloaded||changed||$('removeCaption').checked?[]:editing?.selected||[],offset:editing?.offset||0};
  if(editing?.subtitle_version_id&&(caption||downloaded||$('removeCaption').checked)){book.subtitle_version_id=crypto.randomUUID();book.cues=book.cues.map(c=>({...c,segment_id:c.segment_id||crypto.randomUUID()}));}
  if(file||changed)book.audio_revision=crypto.randomUUID();if(youtube)Object.assign(book,link);else{delete book.youtubeId;delete book.youtubeUrl;}
  const updating=active?.id===book.id,wasPlaying=updating&&!audio.paused;
  if(updating){mediaReady=false;audio.pause();book.position=changed?0:audio.currentTime;}
  try{await writeBoth(book,file);}catch(error){if(updating){mediaReady=true;if(wasPlaying)safe(playAudio);}throw error;}
  if(updating)active=null;await refresh();$('dialog').close();await openBook(book.id);toast('Đã lưu bài nghe và '+book.cues.length+' đoạn phụ đề.');
 }catch(error){$('formError').textContent=error.name==='QuotaExceededError'?'Không đủ dung lượng để lưu audio.':error.message;}finally{busy=false;$('save').disabled=false;$('save').textContent='Lưu bài nghe';}
};
$('search').oninput=renderLibrary;$('speedDefault').onclick=()=>setSpeed(1);$('speed075').onclick=()=>setSpeed(.75);$('speed050').onclick=()=>setSpeed(.5);$('back').onclick=()=>{resetLoop();audio.currentTime=Math.max(0,audio.currentTime-10);};$('forward').onclick=()=>{resetLoop();audio.currentTime=Math.min(audio.duration||0,audio.currentTime+10);};
$('markA').onclick=()=>{if(!mediaReady){toast('Audio đang tải. Vui lòng chờ.');return;}resetLoop();A=audio.currentTime;$('abText').textContent=`A: ${formatTime(A)} · Nghe tiếp rồi đặt B.`;updateABButton();};$('markB').onclick=()=>{if(A===null){toast('Hãy đặt mốc A trước.');return;}if(audio.currentTime<=A+.1){toast('Mốc B phải sau A ít nhất 0,1 giây.');return;}B=audio.currentTime;mode='ab';updateABButton();$('abText').textContent=`Đang lặp ${formatTime(A)} ↔ ${formatTime(B)}`;audio.currentTime=A;safe(playAudio);};$('clearAB').onclick=resetLoop;
$('range').oninput=()=>{if(mode==='sentence')resetLoop();};
$('loop').onclick=()=>safe(()=>{if(mode==='sentence'){audio.pause();resetLoop();return;}if(!active)return;if(!mediaReady){toast('Audio đang tải. Vui lòng chờ.');return;}if($('range').value.trim()){const parsed=parseRange($('range').value,active.cues.length);selection=parsed;selectionChanged();renderCues();}if(!selection.length){toast('Chọn ít nhất một câu để lặp.');return;}if(!mediaReady){toast('Audio đang tải. Vui lòng chờ.');return;}resetLoop();blocks=loopBlocks();if(!blocks.length){toast('Khoảng câu nằm ngoài thời lượng audio.');return;}mode='sentence';setLoopButton(true);audio.currentTime=blocks[0].start;updateCaption();safe(playAudio);});$('clear').onclick=()=>{resetLoop();$('range').value='';selection=[];selectionChanged();renderCues();};$('choose').onclick=()=>safe(()=>{selection=parseRange($('range').value,active.cues.length);selectionChanged();renderCues();});$('all').onclick=()=>{resetLoop();$('range').value='';selection=active.cues.map((_,i)=>i);selectionChanged();renderCues();};$('offset').onchange=()=>{active.offset=Math.max(-120,Math.min(120,Number($('offset').value)||0));$('offset').value=active.offset;selectionChanged();lastCue=-2;document.querySelectorAll('.cue.current').forEach(el=>el.classList.remove('current'));updateCaption();safe(saveProgress);};
async function deleteBook(book){if(!confirm(`Xóa “${book.name}” và audio trên thiết bị này? Hãy sao lưu nếu cần giữ lại.`))return;const id=book.id;const deletingActive=active?.id===id;if(deletingActive){++openSequence;mediaReady=false;audio.onloadedmetadata=null;audio.pause();audio.clearYouTube();active=null;audio.removeAttribute('src');audio.load();if(url){URL.revokeObjectURL(url);url=null;}}await new Promise((resolve,reject)=>{const tx=db.transaction(['books','files'],'readwrite');tx.objectStore('books').delete(id);tx.objectStore('files').delete(id);tx.oncomplete=resolve;tx.onerror=()=>reject(tx.error);});if(deletingActive){$('player').hidden=true;$('listeningDock').hidden=true;setSentencePanel(false);measureDock();showLibrary();resetLoop();}await refresh();toast('Đã xóa bài nghe.');}
$('delete').onclick=()=>safe(()=>deleteBook(active));
const toBase64=blob=>new Promise((resolve,reject)=>{const r=new FileReader();r.onload=()=>resolve(r.result.split(',')[1]);r.onerror=()=>reject(r.error);r.readAsDataURL(blob);});
function fromBase64(value,type){const raw=atob(value),bytes=new Uint8Array(raw.length);for(let i=0;i<raw.length;i++)bytes[i]=raw.charCodeAt(i);return new Blob([bytes],{type});}
$('export').onclick=()=>safe(async()=>{if(!books.length){toast('Thư viện chưa có bài để sao lưu.');return;}$('export').disabled=true;try{await saveProgress();toast('Đang tạo bản sao lưu gồm cả audio…');const rows=[];for(const book of books){if(book.source==='youtube'){rows.push({...book,audio:''});continue;}const file=await request('files','get',book.id);if(!file?.blob)throw Error('Thiếu audio của bài '+book.name);rows.push({...book,audio:await toBase64(file.blob)});}const blob=new Blob([JSON.stringify({format:'lang-nghe',version:1,books:rows})],{type:'application/json'});const link=document.createElement('a'),u=URL.createObjectURL(blob);link.href=u;link.download='lang-nghe-sao-luu-'+new Date().toISOString().slice(0,10)+'.json';link.click();setTimeout(()=>URL.revokeObjectURL(u),1000);toast('Đã xuất bản sao lưu. Giữ file này ở nơi an toàn.');}finally{$('export').disabled=false;}});
$('import').onclick=()=>$('backupFile').click();$('backupFile').onchange=()=>safe(async()=>{const file=$('backupFile').files[0];if(!file)return;$('import').disabled=true;try{const data=JSON.parse(await file.text());if(data.format!=='lang-nghe'||data.version!==1||!Array.isArray(data.books)||!data.books.length)throw Error('File sao lưu không hợp lệ.');const imported=[];for(const b of data.books){if(!b||typeof b.name!=='string'||!b.name.trim()||typeof b.audio!=='string'||!Array.isArray(b.cues)||b.cues.some(c=>!c||typeof c.text!=='string'||!Number.isFinite(c.start)||!Number.isFinite(c.end)||c.start<0||c.end<=c.start))throw Error('Dữ liệu bài nghe trong bản sao lưu không hợp lệ.');b.cues=b.cues.map(c=>({...c,text:cleanCaption(c.text)}));const youtube=b.source==='youtube',link=youtube?parseYouTubeLink(b.youtubeUrl):null;const blob=youtube?null:fromBase64(b.audio,b.type||'audio/mpeg');if(blob?.size>200*1024*1024)throw Error('Có audio vượt quá 200 MB.');const duration=youtube?(Number.isFinite(b.duration)?Math.max(0,b.duration):0):await durationOf(blob);if(duration>0&&b.cues.some(c=>c.start>=duration))throw Error('Phụ đề trong bản sao lưu nằm ngoài thời lượng audio.');const {audio:ignored,...book}=b;if(typeof book.caption!=='string')book.caption='';if(typeof book.filename!=='string')book.filename='audio';imported.push({book:{...book,...(link||{}),id:crypto.randomUUID(),created:Date.now(),duration,size:blob?.size||0,position:Math.max(0,Math.min(Number(book.position)||0,duration)),speed:[.5,.75,1].includes(book.speed)?book.speed:1,offset:Math.max(-120,Math.min(120,Number(book.offset)||0)),selected:Array.isArray(book.selected)?[...new Set(book.selected.filter(i=>Number.isInteger(i)&&i>=0&&i<book.cues.length))].sort((a,b)=>a-b):[]},blob});}await new Promise((resolve,reject)=>{const tx=db.transaction(['books','files'],'readwrite');for(const item of imported){tx.objectStore('books').put(item.book);if(item.blob)tx.objectStore('files').put({id:item.book.id,blob:item.blob});}tx.oncomplete=resolve;tx.onerror=()=>reject(tx.error);tx.onabort=()=>reject(tx.error||Error('Không đủ dung lượng.'));});await refresh();toast(`Đã khôi phục ${imported.length} bài. Các bài hiện có được giữ lại.`);}finally{$('import').disabled=false;$('backupFile').value='';}});
$('persist').onclick=()=>safe(async()=>{const ok=await navigator.storage?.persist?.();toast(ok?'Trình duyệt đã cho phép giữ dữ liệu lâu dài. Vẫn nên sao lưu.':'Trình duyệt chưa cấp quyền giữ dữ liệu lâu dài. Hãy dùng Sao lưu.');});
$('wordToggle').onchange=()=>{try{localStorage.setItem('lang-nghe-words',$('wordToggle').checked?'on':'off');}catch{}clearWordHighlight();if(active)updateCaption();};
try{$('wordToggle').checked=localStorage.getItem('lang-nghe-words')!=='off';}catch{}
try{$('ipaToggle').checked=localStorage.getItem('lang-nghe-ipa')!=='off';}catch{}
$('ipaToggle').onchange=()=>{try{localStorage.setItem('lang-nghe-ipa',$('ipaToggle').checked?'on':'off');}catch{}if(active)renderCues();};
document.addEventListener('visibilitychange',()=>{if(document.hidden)safe(saveProgress);});
try{db=await new Promise((resolve,reject)=>{const r=indexedDB.open(globalThis.langNgheAccountId?'lang-nghe-account-'+globalThis.langNgheAccountId:'lang-nghe',1);r.onupgradeneeded=()=>{r.result.createObjectStore('books',{keyPath:'id'});r.result.createObjectStore('files',{keyPath:'id'});};r.onsuccess=()=>resolve(r.result);r.onerror=()=>reject(r.error);r.onblocked=()=>reject(Error('Hãy đóng các tab Lắng nghe khác rồi tải lại.'));});db.onversionchange=()=>{db.close();toast('Dữ liệu đã thay đổi. Hãy tải lại trang.');};await refresh();showLibrary();tick();}catch(e){toast('Không mở được kho dữ liệu: '+e.message);$('add').disabled=$('emptyAdd').disabled=true;}
if('serviceWorker'in navigator){navigator.serviceWorker.register('./sw.js').then(async()=>{await navigator.serviceWorker.ready;$('offline').textContent='✓ Giao diện đã sẵn sàng offline.';}).catch(()=>$('offline').textContent='Offline chưa sẵn sàng; bạn vẫn có thể dùng khi có mạng.');}else $('offline').textContent='Trình duyệt này không hỗ trợ offline.';

audio.addEventListener('autoplayblocked',()=>toast('Bấm nút phát trên thanh nghe để tiếp tục. Nếu vẫn bị chặn, hãy mở link trên YouTube.'));
audio.addEventListener('ratechange',()=>{for(const [id,rate]of [['speedDefault',1],['speed075',.75],['speed050',.5]]){const selected=audio.playbackRate===rate;$(id).setAttribute('aria-pressed',String(selected));$(id).classList.toggle('speed-selected',selected);}safe(saveProgress);});

let studyRanges=[],studyRangeIndex=0,studyAnswerVisibility=null;
export function studyContext(){return {book:active?identifyLesson(active):null,selection:[...selection],cueIndex:lastCue,position:audio.currentTime,duration:active?.duration||0,paused:audio.paused};}
export async function studyTransport(action,value){if(action==='seek'){studyRanges=[];resetLoop();audio.currentTime=Math.max(0,Math.min(value,active?.duration||0));}else if(action==='speed')setSpeed(value);else if(action==='toggle'){if(audio.paused)await playAudio();else audio.pause();}}
export async function studyPause(){audio.pause();studyRanges=[];resetLoop();await saveProgress();}
export async function studyPlay(cues){
 if(!active||!mediaReady)throw Error('Audio đang tải hoặc chưa mở bài.');resetLoop();mode='study';studyRanges=cues.map(c=>({start:Math.max(0,c.start+(active.offset||0)),end:Math.min(active.duration||Infinity,c.end+(active.offset||0))})).filter(c=>c.end>c.start);studyRangeIndex=0;
 if(!studyRanges.length)throw Error('Câu nằm ngoài thời lượng với độ lệch hiện tại.');audio.currentTime=studyRanges[0].start;await playAudio();
}
audio.addEventListener('timeupdate',()=>{if(mode!=='study'||!studyRanges.length||audio.paused)return;const range=studyRanges[studyRangeIndex];if(audio.currentTime>=range.end){if(++studyRangeIndex<studyRanges.length)audio.currentTime=studyRanges[studyRangeIndex].start;else{audio.pause();studyRanges=[];resetLoop();}}});
export function studyHideAnswers(hide){if(hide){if(studyAnswerVisibility===null)studyAnswerVisibility=captionsHidden;captionsHidden=true;}else if(studyAnswerVisibility!==null){captionsHidden=studyAnswerVisibility;studyAnswerVisibility=null;}applyCaptionVisibility();}
const studySettingKeys=['lang-nghe-repeat','lang-nghe-rest','lang-nghe-words','lang-nghe-ipa'];
export async function studySnapshot({includeShared=false}={}){
 await saveProgress();const list=await request('books','getAll'),files=await request('files','getAll'),settings={};for(const key of studySettingKeys)try{settings[key]=localStorage.getItem(key);}catch{}
 if(includeShared)for(const book of list)if(book.source!=='youtube'&&book.sharedSourceId&&!files.some(f=>f.id===book.id)){const response=await fetch('/api/shared/'+book.sharedSourceId+'/audio');if(!response.ok)throw Error('Không sao lưu được audio dùng chung: '+book.name);files.push({id:book.id,blob:await response.blob()});}
 return {schema_version:1,books:list,files,settings};
}
export async function studySettings(values={}){for(const key of studySettingKeys)if(Object.hasOwn(values,key))try{if(values[key]===null)localStorage.removeItem(key);else localStorage.setItem(key,String(values[key]));}catch{}for(const [id,key]of [['repeatCount','lang-nghe-repeat'],['repeatRest','lang-nghe-rest']])if(values[key]!==null&&values[key]!==undefined)$(id).value=values[key];if(values['lang-nghe-words']!==undefined)$('wordToggle').checked=values['lang-nghe-words']!=='off';if(values['lang-nghe-ipa']!==undefined)$('ipaToggle').checked=values['lang-nghe-ipa']!=='off';if(active)renderCues();}
export async function studyApply(book){
 await saveProgress();const existing=books.find(b=>b.id===book.id);if(!existing)throw Error('Không tìm thấy bài nghe.');audio.pause();resetLoop();const next={...existing,lesson_id:book.lesson_id,subtitle_version_id:book.subtitle_version_id,cues:book.cues.map(c=>({...c})),caption:book.caption,selected:[]};await request('books','put',next);if(active?.id===next.id){active=next;selection=[];timelines=active.cues.map(estimateWords);contextKey='';renderCues();}await refresh();
}
export async function studyOpenLesson(lessonId){const book=books.find(b=>(b.lesson_id||b.sharedSourceId||b.id)===lessonId);if(!book)throw Error('Bài nguồn chưa có trên thiết bị này.');await openBook(book.id);if(!mediaReady)await new Promise((resolve,reject)=>{const start=Date.now();const timer=setInterval(()=>{if(mediaReady){clearInterval(timer);resolve();}else if(Date.now()-start>15000){clearInterval(timer);reject(Error('Không tải được audio nguồn.'));}},100);});}
export async function studyReceiveLesson(record,blob){
 const {kind,revision,operation_id,dirty,owner,book_id,...rest}=record;const book={...rest,id:book_id||record.id};delete book.audio_hash;const updating=active?.id===book.id;if(updating){await studyPause();active=null;}
 if(!Array.isArray(book.cues)||typeof book.name!=='string')throw Error('Metadata bài nghe không hợp lệ.');await writeBoth(book,blob);await refresh();if(updating)await openBook(book.id);
}
export function studyValidateSnapshot(snapshot){
 if(snapshot?.schema_version!==1||!Array.isArray(snapshot.books)||!Array.isArray(snapshot.files))throw Error('Bản sao thư viện không hợp lệ.');
 for(const b of snapshot.books)if(typeof b.id!=='string'||typeof b.name!=='string'||!Array.isArray(b.cues)||b.cues.some(c=>!Number.isFinite(c.start)||!Number.isFinite(c.end)||c.start<0||c.end<=c.start||typeof c.text!=='string'))throw Error('Bài nghe trong bản sao không hợp lệ.');
 for(const f of snapshot.files)if(typeof f.id!=='string'||!(f.blob instanceof Blob)||f.blob.size>200*1024*1024)throw Error('Audio trong bản sao không hợp lệ hoặc quá 200 MB.');
 for(const b of snapshot.books){if(b.source==='youtube')parseYouTubeLink(b.youtubeUrl);else if(!b.sharedSourceId&&!snapshot.files.some(f=>f.id===b.id))throw Error('Bản sao bị thiếu audio.');}
}
export async function studyRestore(snapshot){studyValidateSnapshot(snapshot);
 const existing=new Map(books.map(b=>[b.id,b]));const rows=snapshot.books.map(b=>{const old=existing.get(b.id),conflict=old&&JSON.stringify(old)!==JSON.stringify(b);return {book:{...b,id:conflict?crypto.randomUUID():b.id},blob:snapshot.files.find(f=>f.id===b.id)?.blob};});
 if(rows.some(r=>r.book.source!=='youtube'&&!r.blob&&!r.book.sharedSourceId))throw Error('Bản sao bị thiếu audio.');
 await new Promise((resolve,reject)=>{const tx=db.transaction(['books','files'],'readwrite');for(const {book,blob}of rows){tx.objectStore('books').put(book);if(blob)tx.objectStore('files').put({id:book.id,blob});}tx.oncomplete=resolve;tx.onerror=()=>reject(tx.error);tx.onabort=()=>reject(tx.error);});await studySettings(snapshot.settings);await refresh();
}
export async function studyPublish(id,cues){const response=await fetch('/api/shared/'+id,{method:'PATCH',headers:{'Content-Type':'application/json'},body:JSON.stringify({caption:subtitleFromStudy(cues),cues})});const result=await response.json();if(!response.ok)throw Error(result.error);}
function subtitleFromStudy(cues){return cues.map((c,i)=>{const stamp=t=>{const ms=Math.round(t*1000);return [Math.floor(ms/3600000),Math.floor(ms/60000)%60,Math.floor(ms/1000)%60].map(n=>String(n).padStart(2,'0')).join(':')+','+String(ms%1000).padStart(3,'0');};return `${i+1}\n${stamp(c.start)} --> ${stamp(c.end)}\n${c.text}`;}).join('\n\n');}
