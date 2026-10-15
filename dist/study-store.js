import {SCHEMA_VERSION,uid} from './study-core.js?v=35';
export async function openStudyStore(account){
 if(!account)throw Error('Cần tài khoản để mở dữ liệu luyện tập.');
 const db=await new Promise((resolve,reject)=>{const r=indexedDB.open('lang-nghe-study-'+account,SCHEMA_VERSION);r.onupgradeneeded=()=>{
  for(const name of ['records','backups','logs'])if(!r.result.objectStoreNames.contains(name))r.result.createObjectStore(name,{keyPath:'id'});
  r.transaction.objectStore('logs').put({id:'schema-1',schema_version:1,status:'complete',at:new Date().toISOString()});
 };r.onsuccess=()=>resolve(r.result);r.onerror=()=>reject(r.error);r.onblocked=()=>reject(Error('Đóng tab cũ để hoàn tất nâng cấp dữ liệu.'));});
 db.onversionchange=()=>db.close();
 const query=(store,method,value)=>new Promise((resolve,reject)=>{const tx=db.transaction(store,['get','getAll'].includes(method)?'readonly':'readwrite'),r=tx.objectStore(store)[method](value);let result;r.onsuccess=()=>result=r.result;tx.oncomplete=()=>resolve(result);tx.onerror=()=>reject(tx.error);tx.onabort=()=>reject(tx.error||Error('Không lưu được dữ liệu.'));});
 const store={
  account,
  all:async(kind)=> (await query('records','getAll')).filter(r=>!r.deleted&&(!kind||r.kind===kind)),
  raw:()=>query('records','getAll'),get:id=>query('records','get',id),
  async put(kind,value){const id=value.id||uid(),old=await store.get(id);const next={...value,id,kind,updated_at:new Date().toISOString(),local_revision:uid(),revision:old?.revision||0,dirty:true,operation_id:uid(),deleted:!!value.deleted};await query('records','put',next);return next;},
  async remove(id){const old=await store.get(id);if(old)await store.put(old.kind,{...old,deleted:true}).then(async r=>{r.deleted=true;await query('records','put',r);});},
  async accept(record){await query('records','put',{...record,dirty:false});},
  async acknowledge(id,localRevision,server){const current=await store.get(id);if(current?.local_revision===localRevision)await store.accept({...current,revision:server.revision,updated_at:server.updated_at});else if(current)await query('records','put',{...current,revision:server.revision});},
  async backup(id,snapshot){const old=await query('backups','get',id);if(old)return old;const entry={id,account,schema_version:SCHEMA_VERSION,at:new Date().toISOString(),snapshot};await query('backups','put',entry);return entry;},
  backups:()=>query('backups','getAll'),logs:()=>query('logs','getAll'),
  async dump(){return {schema_version:SCHEMA_VERSION,account,records:await query('records','getAll'),backups:await query('backups','getAll'),logs:await query('logs','getAll')};},
  async restore(data){if(data.schema_version!==1||data.account!==account||!Array.isArray(data.records)||data.records.some(r=>!r||typeof r.id!=='string'||typeof r.kind!=='string')||(data.backups||[]).some(b=>!b||typeof b.id!=='string'||!b.snapshot))throw Error('Bản sao lưu luyện tập không thuộc tài khoản này hoặc không hợp lệ.');for(const row of data.records){const old=await store.get(row.id);if(old&&JSON.stringify(old)!==JSON.stringify(row))await store.put(row.kind,{...row,id:'restored-'+uid(),restored_from:row.id});else if(!old)await store.put(row.kind,row);}for(const b of data.backups||[])await store.backup(b.id,b.snapshot);},
 };
 return store;
}
