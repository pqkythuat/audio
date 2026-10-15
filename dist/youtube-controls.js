import {formatTime} from './core.js?v=8';

export function bindYouTubeControls(media,{play,seek,time,mute,canPlay=()=>media.readyState>0,onSeek=value=>{media.currentTime=value;},onPlay=()=>media.play(),onError=()=>{}}){
 let dragging=false;
 function render(){
  const ready=canPlay(),duration=Number.isFinite(media.duration)?media.duration:0;
  play.disabled=seek.disabled=mute.disabled=!ready;
  play.textContent=media.paused?'▶':'❚❚';play.setAttribute('aria-label',media.paused?'Phát':'Tạm dừng');
  play.setAttribute('aria-pressed',String(!media.paused));
  seek.max=String(duration);if(!dragging)seek.value=String(Math.min(duration,Math.max(0,media.currentTime||0)));
  const position=Number(seek.value)||0;time.textContent=`${formatTime(position)} / ${formatTime(duration)}`;seek.setAttribute('aria-valuetext',`${formatTime(position)} trên ${formatTime(duration)}`);
  seek.style.setProperty?.('--played',`${duration?position/duration*100:0}%`);
  mute.textContent=media.muted?'🔇':'🔊';mute.setAttribute('aria-label',media.muted?'Bật tiếng':'Tắt tiếng');mute.setAttribute('aria-pressed',String(!!media.muted));
 }
 play.onclick=async()=>{try{if(!canPlay())return;if(media.paused)await onPlay();else media.pause();render();}catch(e){onError(e.message);}};
 seek.oninput=()=>{dragging=true;render();};
 seek.onchange=()=>{const value=Number(seek.value);dragging=false;if(canPlay())onSeek(Math.max(0,Math.min(media.duration,value)));render();};
 seek.onblur=seek.onpointercancel=()=>{dragging=false;render();};
 mute.onclick=()=>{media.muted=!media.muted;render();};
 for(const event of ['timeupdate','loadedmetadata','play','pause','ended','volumechange','error','autoplayblocked'])media.addEventListener(event,render);
 render();return {render};
}
