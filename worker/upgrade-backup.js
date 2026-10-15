import {json} from './auth.js';
// Runs before the new server-side features can change existing shared content.
// The lease serializes backup batches; no session credentials are copied.
export async function ensureUpgradeBackup(bucket){
 const key='upgrade-manifests/pre-v35.json',object=await bucket.get(key),state=object?await object.json():{schema_version:1,phase:0,cursor:null,copied:0};
 if(state.complete)return null;
 if(state.lease_until>Date.now())return json({error:'Đang tạo bản sao an toàn máy chủ. Thử lại sau ít giây.'},503);
 const lease={...state,lease_until:Date.now()+60000};
 const acquired=await bucket.put(key,JSON.stringify(lease),{onlyIf:object?{etagMatches:object.etag}:{etagDoesNotMatch:'*'}});
 if(!acquired)return json({error:'Một tiến trình sao lưu đang chạy. Thử lại.'},503);
 try{
  const prefixes=['accounts/','shared/'];
  for(let batch=0;batch<2&&state.phase<prefixes.length;batch++){
   const list=await bucket.list({prefix:prefixes[state.phase],cursor:state.cursor||undefined,limit:5});
   for(const item of list.objects){const source=await bucket.get(item.key);if(source){await bucket.put('upgrade-backups/pre-v35/'+item.key,source.body,{httpMetadata:source.httpMetadata});state.copied++;}}
   if(list.truncated)state.cursor=list.cursor;else{state.phase++;state.cursor=null;}
  }
  state.complete=state.phase>=prefixes.length;state.lease_until=0;state.updated_at=new Date().toISOString();
  if(state.complete)state.completed_at=state.updated_at;
  await bucket.put(key,JSON.stringify(state),{onlyIf:{etagMatches:acquired.etag}});
  return state.complete?null:json({error:'Đang sao lưu dữ liệu trước nâng cấp ('+state.copied+' mục). Thực hiện lại để tiếp tục; dữ liệu gốc chưa thay đổi.'},503);
 }catch(e){state.lease_until=0;await bucket.put(key,JSON.stringify(state),{onlyIf:{etagMatches:acquired.etag}});throw e;}
}
