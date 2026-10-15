import {randomUUID} from 'node:crypto';
import {readFile,mkdir,writeFile,rename,unlink,stat} from 'node:fs/promises';
import {createReadStream,createWriteStream} from 'node:fs';
import {join} from 'node:path';
import {pipeline} from 'node:stream/promises';
import {Transform} from 'node:stream';
import {parseCaptions} from './dist/core.js';
import {parseYouTubeLink} from './dist/youtube.js';

const MAX_AUDIO=200*1024*1024,MAX_JSON=6*1024*1024;
export function createSharedLibrary({directory='data/shared'}={}){
 const index=join(directory,'catalog.json');let books=[],queue=Promise.resolve();
 const ready=readFile(index,'utf8').then(s=>{books=JSON.parse(s);}).catch(e=>{if(e.code!=='ENOENT')throw e;});
 const mutate=fn=>{const result=queue.then(fn);queue=result.catch(()=>{});return result;};
 async function persist(next){await mkdir(directory,{recursive:true});await writeFile(index+'.tmp',JSON.stringify(next));await rename(index+'.tmp',index);books=next;}
 const view=book=>{const {audioFile,...publicBook}=book;return publicBook;};
 return async(req,res,path,user)=>{
  if(!path.startsWith('/api/shared'))return false;
  const reply=(status,data)=>{res.writeHead(status,{'Content-Type':'application/json; charset=utf-8'});res.end(JSON.stringify(data));return true;};
  if(!user)return reply(401,{error:'Vui lòng đăng nhập.'});
  if(!['GET','HEAD'].includes(req.method)&&user.role!=='admin')return reply(403,{error:'Chỉ Admin được tải lên, ghim hoặc xóa bài dùng chung.'});
  await ready;
  const body=async()=>{let size=0;const chunks=[];for await(const chunk of req){size+=chunk.length;if(size>MAX_JSON)throw Object.assign(Error('Phụ đề hoặc dữ liệu quá lớn.'),{status:413});chunks.push(chunk);}try{return JSON.parse(Buffer.concat(chunks).toString('utf8'));}catch{throw Object.assign(Error('Dữ liệu không hợp lệ.'),{status:400});}};
  try{
   if(path==='/api/shared'&&req.method==='GET')return reply(200,{books:books.filter(b=>b.audioFile||b.source==='youtube').sort((a,b)=>Number(b.pinned)-Number(a.pinned)||b.created-a.created).map(view)});
   if(path==='/api/shared'&&req.method==='POST'){
    const data=await body();
    const youtube=data?.source==='youtube';let link;
    if(youtube){try{link=parseYouTubeLink(data.youtubeUrl);}catch{return reply(400,{error:'Link YouTube không hợp lệ.'});}}
    if(!data||typeof data.name!=='string'||!data.name.trim()||data.name.length>150||!Number.isFinite(data.duration)||(youtube?data.duration<0:data.duration<=0)||typeof data.caption!=='string'||Buffer.byteLength(data.caption)>5*1024*1024||typeof data.pinned!=='boolean')return reply(400,{error:'Tên bài, thời lượng hoặc phụ đề không hợp lệ.'});
    let cues;try{cues=data.caption.trim()?parseCaptions(data.caption):[];}catch{return reply(400,{error:'Không đọc được phụ đề SRT/VTT.'});}
    if(data.duration>0&&cues.some(c=>c.start>=data.duration+.5))return reply(400,{error:'Phụ đề nằm ngoài thời lượng audio.'});
    const book={id:randomUUID(),name:data.name.trim(),filename:typeof data.filename==='string'?data.filename.slice(0,255):'audio',source:youtube?'youtube':'audio',...(link||{}),type:youtube?'youtube':'application/octet-stream',duration:data.duration,caption:data.caption,cues,pinned:data.pinned,created:Date.now(),size:0};
    await mutate(()=>persist([...books,book]));return reply(201,{book:view(book)});
   }
   const match=path.match(/^\/api\/shared\/([a-f0-9-]{36})(\/audio)?$/);
   if(!match)return reply(404,{error:'Không tìm thấy bài dùng chung.'});
   const [,id,audioPath]=match;let book=books.find(b=>b.id===id);
   if(!book||(!book.audioFile&&book.source!=='youtube'&&user.role!=='admin'&&req.method==='GET'))return reply(404,{error:'Không tìm thấy bài dùng chung.'});
   if(audioPath&&req.method==='PUT'){
    if(book.source==='youtube')return reply(400,{error:'Bài YouTube không nhận file audio.'});
    const expected=Number(req.headers['content-length']);if(expected>MAX_AUDIO)return reply(413,{error:'Audio tối đa 200 MB.'});
    const token=randomUUID(),temporary=join(directory,token+'.tmp'),filename=token+'.audio';let size=0;
    await mkdir(directory,{recursive:true});
    try{
     await pipeline(req,new Transform({transform(chunk,encoding,callback){size+=chunk.length;callback(size>MAX_AUDIO?Object.assign(Error('Audio tối đa 200 MB.'),{status:413}):null,chunk);}}),createWriteStream(temporary,{flags:'wx'}));
     if(!size)throw Object.assign(Error('File audio trống.'),{status:400});
     await rename(temporary,join(directory,filename));
     await mutate(async()=>{book=books.find(b=>b.id===id);if(!book)throw Object.assign(Error('Bài đã bị xóa.'),{status:404});const old=book.audioFile;const updated={...book,size,type:['audio/mpeg','audio/mp3','audio/mp4','audio/x-m4a','audio/wav','audio/x-wav','audio/ogg','audio/flac','audio/aac','audio/webm'].includes(req.headers['content-type'])?req.headers['content-type']:'application/octet-stream',audioFile:filename};await persist(books.map(b=>b.id===id?updated:b));book=updated;if(old)await unlink(join(directory,old)).catch(()=>{});});
     return reply(200,{book:view(book)});
    }catch(e){await unlink(temporary).catch(()=>{});await unlink(join(directory,filename)).catch(()=>{});throw e;}
   }
   if(audioPath&&(req.method==='GET'||req.method==='HEAD')){
    if(!book.audioFile)return reply(404,{error:'Audio chưa được tải lên.'});
    const file=join(directory,book.audioFile),info=await stat(file);let start=0,end=info.size-1,status=200;
    if(req.headers.range){const range=req.headers.range.match(/^bytes=(\d*)-(\d*)$/);if(!range||(!range[1]&&!range[2])){res.writeHead(416,{'Content-Range':`bytes */${info.size}`}).end();return true;}
     if(!range[1]){start=Math.max(0,info.size-Number(range[2]));}else{start=Number(range[1]);if(range[2])end=Math.min(end,Number(range[2]));}
     if(start>end||start>=info.size){res.writeHead(416,{'Content-Range':`bytes */${info.size}`}).end();return true;}status=206;
    }
    res.writeHead(status,{'Content-Type':book.type,'Content-Length':end-start+1,'Accept-Ranges':'bytes','Content-Disposition':`attachment; filename="audio-${id}"`,'X-Content-Type-Options':'nosniff',...(status===206?{'Content-Range':`bytes ${start}-${end}/${info.size}`}:{})});
    if(req.method==='HEAD')res.end();else await pipeline(createReadStream(file,{start,end}),res);return true;
   }
   if(!audioPath&&req.method==='PATCH'){
    const data=await body();if(!data||typeof data.pinned!=='boolean')return reply(400,{error:'Trạng thái ghim không hợp lệ.'});
    await mutate(async()=>{book=books.find(b=>b.id===id);if(!book)throw Object.assign(Error('Bài đã bị xóa.'),{status:404});book={...book,pinned:data.pinned};await persist(books.map(b=>b.id===id?book:b));});return reply(200,{book:view(book)});
   }
   if(!audioPath&&req.method==='DELETE'){
    await mutate(async()=>{book=books.find(b=>b.id===id);await persist(books.filter(b=>b.id!==id));if(book?.audioFile)await unlink(join(directory,book.audioFile)).catch(()=>{});});return reply(200,{ok:true});
   }
   return reply(405,{error:'Thao tác không được hỗ trợ.'});
  }catch(e){if(res.headersSent){res.destroy();return true;}return reply(e.status||500,{error:e.status?e.message:'Không thể xử lý thư viện dùng chung.'});}
 };
}
