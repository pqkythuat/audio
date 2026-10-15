import {uid,identifyLesson} from './study-core.js?v=35';
const clean=r=>{const {blob,audio,dirty,local_revision,...data}=r;return data;};
const equivalent=(a,b)=>{const omit=r=>{const {revision,updated_at,operation_id,...data}=clean(r);return data;};return JSON.stringify(omit(a))===JSON.stringify(omit(b));};
export function createStudySync({store,app,user,status,conflicts,recordings,audio}){
 let running=false;
 const api=async(path,options={})=>{const response=await fetch(path,{cache:'no-store',...options});const data=await response.json();if(!response.ok){const e=Error(data.error||'Đồng bộ thất bại.');e.status=response.status;e.data=data;throw e;}return data;};
 async function digest(blob){return Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',await blob.arrayBuffer())),b=>b.toString(16).padStart(2,'0')).join('');}
 async function upload(blob){if(blob.size>90*1024*1024)throw Error('Audio vượt 90 MB vẫn giữ trên thiết bị; chưa được đồng bộ.');const id=await digest(blob);await api('/api/study/files/'+id,{method:'PUT',headers:{'Content-Type':blob.type?.startsWith('audio/')?blob.type:'audio/mpeg'},body:blob});return id;}
 async function download(hash){const response=await fetch('/api/study/files/'+hash,{cache:'no-store'});if(!response.ok)throw Error('Không tải được audio đồng bộ.');const blob=await response.blob();if(await digest(blob)!==hash)throw Error('Checksum audio tải về không đúng.');return blob;}
 async function conflict(local,remote){
  const fork={...local,id:'conflict-'+local.operation_id,conflict_of:local.id,revision:0};await store.put(local.kind,fork);
  const row=document.createElement('div');row.className='study-card';const p=document.createElement('p');p.textContent='Xung đột '+(local.name||local.term||local.kind)+'. Bản thiết bị đã được giữ riêng; bản máy chủ chưa bị ghi đè.';row.append(p);
  for(const [label,choice]of [['Giữ bản máy chủ','server'],['Dùng bản thiết bị','local']]){const b=document.createElement('button');b.textContent=label;b.onclick=async()=>{try{if(choice==='server'){await store.accept(remote);if(local.kind==='lesson'&&!remote.deleted)await app.studyReceiveLesson(remote,null);}else{await store.accept({...local,revision:remote.revision});await store.put(local.kind,{...local,revision:remote.revision});}await store.remove(fork.id);row.remove();status('Đã chọn bản cần giữ. Nhấn Đồng bộ ngay để tiếp tục.');}catch(e){status(e.message);}};row.append(b);}conflicts.append(row);
 }
 return {
  async run(){if(running)return;running=true;let conflictCount=0;
   try{
    status('Đang đồng bộ… Dữ liệu trên thiết bị được giữ nguyên.');conflicts.replaceChildren();
    const snapshot=await app.studySnapshot();
    // Explicit account confirmation is checked by the UI before this method runs.
    for(const original of snapshot.books){const b=identifyLesson(original),id='lesson-'+b.id,old=await store.get(id);if(old?.deleted)continue;const record={...b,id,book_id:b.id,kind:'lesson',owner:user.id};if(old?.audio_hash&&old.audio_revision===b.audio_revision)record.audio_hash=old.audio_hash;if(audio()&&b.source!=='youtube'&&!b.sharedSourceId){const file=snapshot.files.find(f=>f.id===b.id);if(file?.blob&&!record.audio_hash)record.audio_hash=await upload(file.blob);}if(!old||!equivalent({...old,...record},old))await store.put('lesson',record);}
    const lessonIds=new Set(snapshot.books.map(b=>'lesson-'+b.id));for(const old of await store.all('lesson'))if(!old.conflict_of&&!lessonIds.has(old.id)&&old.owner===user.id)await store.remove(old.id);
    const settings={id:'settings-device',values:snapshot.settings};const oldSettings=await store.get(settings.id);if(!oldSettings||JSON.stringify(oldSettings.values)!==JSON.stringify(settings.values))await store.put('settings',settings);
    const before=await api('/api/study'),remote=new Map(before.records.map(r=>[r.id,r]));
    for(const local of await store.raw()){
     if(local.conflict_of)continue;if(local.kind==='recording'&&!recordings())continue;
     if(!local.dirty)continue;
     if(local.kind==='recording'&&local.blob&&!local.deleted&&!local.audio_hash){const audio_hash=await upload(local.blob);await store.put('recording',{...local,audio_hash});Object.assign(local,await store.get(local.id));}
     const server=remote.get(local.id);
     if(server&&server.revision!==local.revision&&server.operation_id!==local.operation_id){await conflict(local,server);conflictCount++;continue;}
     try{const result=await api('/api/study',{method:'PUT',headers:{'Content-Type':'application/json'},body:JSON.stringify({record:clean(local),base_revision:local.revision,operation_id:local.operation_id})});await store.acknowledge(local.id,local.local_revision,result.record);remote.set(local.id,result.record);}catch(e){if(e.status===409&&e.data.record){await conflict(local,e.data.record);conflictCount++;}else throw e;}
    }
    for(const server of remote.values()){
     const local=await store.get(server.id);if(local?.dirty||local?.revision>=server.revision)continue;
     // Do not remove local audio or recordings because a remote tombstone arrives.
     if(server.deleted){await store.accept(server);continue;}
     if(server.kind==='recording'&&!recordings())continue;
     const merged={...server};if(server.kind==='recording'&&server.audio_hash){merged.blob=local?.blob||await download(server.audio_hash);}
     if(server.kind==='lesson'){
      let blob=null;if(server.audio_hash&&audio())blob=await download(server.audio_hash);
      if(server.source!=='youtube'&&!server.sharedSourceId&&!blob&&!snapshot.files.some(f=>f.id===server.book_id)){status('Bài '+server.name+' có metadata trên máy chủ, cần bật đồng bộ audio để tải file.');continue;}
      
      await app.studyReceiveLesson(server,blob);
     }
     if(server.kind==='settings')await app.studySettings(server.values);
     await store.accept(merged);
    }
    status(conflictCount?`Có ${conflictCount} xung đột cần chọn. Cả hai bản được giữ.`:'Đã đồng bộ · '+new Date().toLocaleString('vi')+' · Dữ liệu trên thiết bị vẫn được giữ.');
   }catch(e){status(e.status===401?'Phiên đăng nhập đã hết hạn. Dữ liệu đã lưu trên thiết bị; đăng nhập lại để đồng bộ.':'Đã lưu trên thiết bị · Đồng bộ chưa hoàn tất: '+e.message);throw e;}finally{running=false;}
  },
  async clear(){await api('/api/study',{method:'DELETE'});status('Đã xóa dữ liệu và file trên máy chủ, giữ dấu xóa để ngăn phục hồi ngoài ý muốn. Dữ liệu thiết bị vẫn còn.');},
 };
}
