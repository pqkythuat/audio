import {json,readJson} from './auth.js';
import {parseCaptions} from '../dist/core.js';
import {parseYouTubeLink} from '../dist/youtube.js';
export async function sharedApi(request,env,user){
 const path=new URL(request.url).pathname;if(!path.startsWith('/api/shared'))return null;
 const bucket=env.BUCKET,admin=user.role==='admin';
 if(!['GET','HEAD'].includes(request.method)&&!admin)return json({error:'Chỉ Admin được tải lên, ghim hoặc xóa bài dùng chung.'},403);
 const read=async id=>{const object=await bucket.get('shared/meta/'+id+'.json');return object?{book:await object.json(),etag:object.etag}:null;};
 const write=(book,etag)=>bucket.put('shared/meta/'+book.id+'.json',JSON.stringify(book),{onlyIf:etag?{etagMatches:etag}:{etagDoesNotMatch:'*'}});
 if(path==='/api/shared'&&request.method==='GET'){
  const books=[];let cursor;do{const result=await bucket.list({prefix:'shared/meta/',cursor,limit:500});for(const item of result.objects){const object=await bucket.get(item.key);if(object){const book=await object.json();if(book.ready)books.push(book);}}cursor=result.truncated?result.cursor:undefined;}while(cursor);
  return json({books:books.sort((a,b)=>Number(b.pinned)-Number(a.pinned)||b.created-a.created)});
 }
 if(path==='/api/shared'&&request.method==='POST'){
  const data=await readJson(request,6*1024*1024),youtube=data?.source==='youtube';
  if(!data||typeof data.name!=='string'||!data.name.trim()||data.name.length>150||typeof data.caption!=='string'||new TextEncoder().encode(data.caption).length>5*1024*1024||!Number.isFinite(data.duration)||(youtube?data.duration<0:data.duration<=0)||typeof data.pinned!=='boolean')return json({error:'Tên bài hoặc phụ đề không hợp lệ.'},400);
  let link,cues;try{link=youtube?parseYouTubeLink(data.youtubeUrl):{};cues=data.caption.trim()?parseCaptions(data.caption):[];}catch{return json({error:'Link hoặc phụ đề không hợp lệ.'},400);}
  if(data.duration>0&&cues.some(c=>c.start>=data.duration+.5))return json({error:'Phụ đề nằm ngoài thời lượng audio.'},400);
  const book={id:crypto.randomUUID(),name:data.name.trim(),filename:typeof data.filename==='string'?data.filename.slice(0,255):'audio',source:youtube?'youtube':'audio',...link,type:youtube?'youtube':'application/octet-stream',duration:data.duration,caption:data.caption,cues,pinned:data.pinned,created:Date.now(),size:0,ready:youtube};await write(book);return json({book},201);
 }
 const match=path.match(/^\/api\/shared\/([a-f0-9-]{36})(\/audio)?$/);if(!match)return json({error:'Không tìm thấy bài.'},404);
 const [,id,audio]=match,record=await read(id);if(!record)return json({error:'Không tìm thấy bài.'},404);const book=record.book;
 if(audio&&request.method==='PUT'){
  if(book.source==='youtube')return json({error:'Bài YouTube không nhận file audio.'},400);
  const length=Number(request.headers.get('content-length'));if(!length||length>90*1024*1024)return json({error:'Audio trên web tối đa 90 MB.'},413);
  const type=request.headers.get('content-type')||'application/octet-stream';await bucket.put('shared/audio/'+id,request.body,{httpMetadata:{contentType:type.startsWith('audio/')?type:'application/octet-stream'}});
  const current=await read(id);if(!current)return json({error:'Bài đã bị xóa.'},404);
  const updated={...current.book,ready:true,size:length,type:type.startsWith('audio/')?type:'application/octet-stream'};if(!await write(updated,current.etag))return json({error:'Bài vừa thay đổi. Thử lại.'},409);return json({book:updated});
 }
 if(audio&&['GET','HEAD'].includes(request.method)){
  if(!book.ready||book.source==='youtube')return json({error:'Audio chưa sẵn sàng.'},404);
  const object=await bucket.get('shared/audio/'+id,{range:request.headers});if(!object)return json({error:'Không tìm thấy audio.'},404);
  const headers=new Headers({'Content-Type':book.type,'Cache-Control':'no-store','Accept-Ranges':'bytes','X-Content-Type-Options':'nosniff'});let status=200;
  if(object.range){const start=object.range.offset||0,end=start+object.range.length-1;headers.set('Content-Range',`bytes ${start}-${end}/${object.size}`);headers.set('Content-Length',String(object.range.length));status=206;}else headers.set('Content-Length',String(object.size));
  return new Response(request.method==='HEAD'?null:object.body,{status,headers});
 }
 if(!audio&&request.method==='PATCH'){
  const data=await readJson(request);if(typeof data?.pinned!=='boolean')return json({error:'Trạng thái ghim không hợp lệ.'},400);
  const updated={...book,pinned:data.pinned};if(!await write(updated,record.etag))return json({error:'Bài vừa thay đổi. Thử lại.'},409);return json({book:updated});
 }
 if(!audio&&request.method==='DELETE'){await bucket.delete('shared/meta/'+id+'.json');await bucket.delete('shared/audio/'+id);return json({ok:true});}
 return json({error:'Thao tác không được hỗ trợ.'},405);
}
