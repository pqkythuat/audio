export function parseYouTubeLink(value){
 let url;try{url=new URL(String(value).trim());}catch{throw Error('Nhập link YouTube hợp lệ.');}
 if(!['https:','http:'].includes(url.protocol)||url.username||url.password||url.port)throw Error('Nhập link YouTube hợp lệ.');
 const host=url.hostname.toLowerCase().replace(/^www\./,'');let id;
 if(host==='youtu.be')id=url.pathname.split('/')[1];
 else if(['youtube.com','m.youtube.com','music.youtube.com','youtube-nocookie.com'].includes(host)){
  const parts=url.pathname.split('/').filter(Boolean);
  id=parts[0]==='watch'?url.searchParams.get('v'):['embed','shorts','live'].includes(parts[0])?parts[1]:null;
 }
 if(!id||!/^[-\w]{11}$/.test(id))throw Error('Link phải trỏ tới một video YouTube cụ thể.');
 return {youtubeId:id,youtubeUrl:'https://www.youtube.com/watch?v='+id};
}

let apiPromise;
export function loadYouTubeAPI(){
 if(globalThis.YT?.Player)return Promise.resolve(globalThis.YT);
 if(apiPromise)return apiPromise;
 apiPromise=new Promise((resolve,reject)=>{
  const script=document.createElement('script');let timer;
  const previous=globalThis.onYouTubeIframeAPIReady;
  const fail=()=>{clearTimeout(timer);script.remove();apiPromise=null;reject(Error('Không tải được YouTube. Kiểm tra kết nối mạng và mở lại bài.'));};
  globalThis.onYouTubeIframeAPIReady=()=>{clearTimeout(timer);try{previous?.();}finally{resolve(globalThis.YT);}};
  script.src='https://www.youtube.com/iframe_api';script.onerror=fail;timer=setTimeout(fail,20000);document.head.append(script);
 });return apiPromise;
}

// Keep the existing audio controls, subtitle timing and practice engine for both sources.
export function createMediaController(native,{container,loadAPI=loadYouTubeAPI}={}){
 const listeners=new Map();let youtube=false,player=null,sequence=0,timer,ready=false,paused=true,rate=1,muted=!!native.muted,metadata=null,pending=null,errorMessage='';
 const emit=type=>{if(type==='loadedmetadata')metadata?.();for(const fn of listeners.get(type)||[])fn();};
 const cleanup=()=>{++sequence;clearInterval(timer);player?.destroy();player=null;ready=false;pending=null;if(container){container.hidden=true;container.replaceChildren();}native.hidden=false;youtube=false;};
 function setRate(value){rate=Number(value)||1;if(ready){const available=player.getAvailablePlaybackRates?.()||[1];if(!available.includes(rate))rate=1;player.setPlaybackRate(rate);}}
 const controls={
  addEventListener(type,fn){if(!listeners.has(type))listeners.set(type,[]);listeners.get(type).push(fn);native.addEventListener(type,()=>{if(!youtube)fn();});},
  clearYouTube:cleanup,
  async loadYouTube(id){
   cleanup();native.pause();native.removeAttribute('src');native.load();youtube=true;native.hidden=true;container.hidden=false;paused=true;errorMessage='';rate=1;const current=sequence;
   try{
    const YT=await loadAPI();if(current!==sequence)return;
    const mount=document.createElement('div');container.append(mount);let started=Date.now();
    const fail=message=>{if(current!==sequence)return;errorMessage=message;paused=true;clearInterval(timer);emit('error');};
    player=new YT.Player(mount,{width:200,height:200,videoId:id,playerVars:{playsinline:1,origin:globalThis.location?.origin,controls:0,disablekb:1,autoplay:0,rel:0},events:{
     onReady:()=>{if(current!==sequence)return;started=Date.now();const frame=player?.getIframe?.();frame?.setAttribute('tabindex','-1');if(muted)player?.mute?.();},
     onStateChange:event=>{if(current!==sequence)return;const state=event.data;if(state===1){paused=false;emit('play');}else if(state===2){paused=true;emit('pause');}else if(state===0){paused=true;emit('ended');}},
     onPlaybackRateChange:event=>{if(current!==sequence)return;rate=event.data;emit('ratechange');},
     onAutoplayBlocked:()=>{if(current!==sequence)return;paused=true;emit('autoplayblocked');},
     onError:event=>fail([101,150].includes(event.data)?'Video không cho phép phát trong app. Hãy mở trên YouTube hoặc chọn video khác.':event.data===100?'Video không còn tồn tại hoặc đang ở chế độ riêng tư.':'Không phát được YouTube. Kiểm tra mạng hoặc mở video trên YouTube.')
    }});
    timer=setInterval(()=>{
     if(current!==sequence)return;
     if(!ready){const duration=player.getDuration?.()||0;if(duration>0){ready=true;setRate(rate);emit('loadedmetadata');}else if(Date.now()-started>20000){fail('Chưa đọc được thời lượng YouTube. Hãy mở lại bài hoặc kiểm tra link trên YouTube.');}}
     if(ready)emit('timeupdate');
    },100);
   }catch(e){if(current!==sequence)return;errorMessage=e.message;paused=true;emit('error');}
  },
  async play(){if(!youtube)return native.play();if(!ready)throw Error('YouTube đang tải.');player.playVideo();},
  pause(){if(!youtube)return native.pause();player?.pauseVideo?.();paused=true;},
  removeAttribute(name){if(name==='src'&&youtube)cleanup();native.removeAttribute(name);},
  load(){if(!youtube)native.load();}
 };
 return new Proxy(native,{
  get(target,key){
   if(key in controls)return controls[key];
   if(key==='onloadedmetadata')return metadata;
   if(key==='errorMessage')return errorMessage;
   if(youtube){
    if(key==='currentTime'){const actual=player?.getCurrentTime?.()||0;if(pending&&(Math.abs(actual-pending.time)<.4||Date.now()>pending.until))pending=null;return pending?pending.time:actual;}
    if(key==='duration')return player?.getDuration?.()||0;
    if(key==='paused')return paused;
    if(key==='muted')return player?.isMuted?.()??muted;
    if(key==='playbackRate')return rate;
    if(key==='readyState')return ready?1:0;
   }
   const value=Reflect.get(target,key,target);return typeof value==='function'?value.bind(target):value;
  },
  set(target,key,value){
   if(key==='onloadedmetadata'){metadata=value;target.onloadedmetadata=()=>{if(!youtube)metadata?.();};return true;}
   if(youtube&&key==='currentTime'){pending={time:Math.max(0,Number(value)||0),until:Date.now()+1500};player?.seekTo?.(pending.time,true);return true;}
   if(youtube&&key==='playbackRate'){setRate(value);return true;}
   if(youtube&&key==='muted'){muted=!!value;if(muted)player?.mute?.();else player?.unMute?.();emit('volumechange');return true;}
   return Reflect.set(target,key,value,target);
  }
 });
}
