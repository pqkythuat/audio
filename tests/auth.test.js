import test from 'node:test';
import assert from 'node:assert/strict';
import {createServer} from 'node:http';
import {mkdtemp,rm,readFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {createAuth} from '../auth.mjs';
import {createSharedLibrary} from '../shared-library.mjs';
import {createYouTubeCaptions} from '../youtube-captions.mjs';

async function fixture(t,options={}){
 const dir=await mkdtemp(join(tmpdir(),'lang-nghe-auth-'));let clock=Date.now();
 const tokens={admin:{sub:'admin-id',email:'admin@example.com',name:'Admin',email_verified:true},member:{sub:'member-id',email:'member@example.com',name:'Member',email_verified:true},other:{sub:'other-id',email:'other@example.com',name:'Other',email_verified:true},unverified:{sub:'bad',email:'bad@example.com',email_verified:false}};
 let handler,origin;
 const server=createServer((req,res)=>handler(req,res,new URL(req.url,origin).pathname));
 await new Promise(r=>server.listen(0,'127.0.0.1',r));origin=`http://127.0.0.1:${server.address().port}`;
 const file=join(dir,'accounts.json');
 let shared=createSharedLibrary({directory:join(dir,'shared')});
 handler=createAuth({clientId:'test-client',origin,adminEmails:['admin@example.com'],file,verify:async token=>{if(!tokens[token])throw Error('Invalid token');return tokens[token];},now:()=>clock,shared:(...args)=>shared(...args),...options});
 t.after(async()=>{await new Promise(r=>server.close(r));await rm(dir,{recursive:true,force:true});});
 const call=async(path,{cookie,method='GET',data,requestOrigin=origin,raw,headers={}}={})=>{
  const response=await fetch(origin+path,{method,headers:{Origin:requestOrigin,...(cookie?{Cookie:cookie}:{}),'Content-Type':'application/json',...headers},...(raw!==undefined?{body:raw}:data?{body:JSON.stringify(data)}:{})});
  return {status:response.status,body:response.headers.get('content-type')?.includes('application/json')?await response.json():await response.text(),cookie:response.headers.get('set-cookie')?.split(';')[0],headers:response.headers};
 };
 const login=token=>call('/api/login',{method:'POST',data:{credential:token,role:'admin'}});
 return {call,login,file,reopenShared:()=>{shared=createSharedLibrary({directory:join(dir,'shared')});},advance:ms=>{clock+=ms;}};
}

test('Google identity, role enforcement, session revocation and account persistence',async t=>{
 const f=await fixture(t);
 assert.equal((await f.call('/api/accounts')).status,401);
 assert.equal((await f.login('forged')).status,401);
 assert.equal((await f.login('unverified')).status,401);
 assert.equal((await f.call('/api/login',{method:'POST',data:{credential:'admin'},requestOrigin:'https://evil.example'})).status,403);
 const admin=await f.login('admin'),member=await f.login('member'),other=await f.login('other');
 assert.equal(admin.body.user.role,'admin');assert.equal(member.body.user.role,'member');
 assert.match(admin.headers.get('set-cookie'),/HttpOnly/);assert.match(admin.headers.get('set-cookie'),/SameSite=Lax/);
 assert.equal((await f.call('/api/accounts',{cookie:member.cookie})).status,403);
 assert.equal((await f.call('/api/accounts/other-id',{cookie:member.cookie,method:'PATCH',data:{role:'admin',disabled:false}})).status,403);
 assert.equal((await f.call('/api/accounts/admin-id',{cookie:admin.cookie,method:'PATCH',data:{role:'member',disabled:true}})).status,400);
 assert.equal((await f.call('/api/accounts/other-id',{cookie:admin.cookie,method:'PATCH',data:{role:'owner',disabled:false}})).status,400);
 assert.equal((await f.call('/api/accounts/other-id',{cookie:admin.cookie,method:'PATCH',data:{role:'admin',disabled:false}})).status,200);
 assert.equal((await f.call('/api/session',{cookie:other.cookie})).body.user,null);
 const promoted=await f.login('other');assert.equal(promoted.body.user.role,'admin');
 await f.call('/api/accounts/member-id',{cookie:admin.cookie,method:'PATCH',data:{role:'member',disabled:true}});
 assert.equal((await f.call('/api/session',{cookie:member.cookie})).body.user,null);
 assert.equal((await f.login('member')).status,403);
 await f.call('/api/accounts/member-id',{cookie:admin.cookie,method:'PATCH',data:{role:'member',disabled:false}});
 const again=await f.login('member');assert.equal(again.status,200);
 await f.call('/api/logout',{cookie:again.cookie,method:'POST'});
 assert.equal((await f.call('/api/session',{cookie:again.cookie})).body.user,null);
 const persisted=JSON.parse(await readFile(f.file,'utf8'));assert.equal(persisted.length,3);assert.equal(persisted.find(u=>u.id==='other-id').role,'admin');
 assert.ok(!JSON.stringify(persisted).includes('credential'));
 f.advance(8*86400000);const expired=await f.call('/api/session',{cookie:admin.cookie});assert.equal(expired.body.user,null);assert.equal(expired.headers.get('cache-control'),'no-store');
});

test('demo accounts work locally and cannot bypass Google login mode',async t=>{
 const f=await fixture(t,{clientId:'',demo:true});
 assert.equal((await f.call('/api/session')).body.demo,true);
 const admin=await f.call('/api/demo-login',{method:'POST',data:{account:'admin'}});
 assert.equal(admin.body.user.role,'admin');
 const member=await f.call('/api/demo-login',{method:'POST',data:{account:'member'}});
 assert.equal(member.body.user.role,'member');assert.notEqual(member.body.user.id,admin.body.user.id);
 assert.equal((await f.call('/api/demo-login',{method:'POST',data:{account:'invented'}})).status,400);
 assert.equal((await f.login('admin')).status,503);
 const real=await fixture(t,{demo:true});assert.equal((await real.call('/api/demo-login',{method:'POST',data:{account:'admin'}})).status,503);
 const deployed=await fixture(t,{clientId:'',demo:true,origin:'https://example.com'});
 assert.equal((await deployed.call('/api/session')).body.demo,false);
});

test('service worker never caches account API responses',async()=>{
 const source=await readFile(new URL('../dist/sw.js',import.meta.url),'utf8');
 assert.match(source,/pathname\.startsWith\('\/api\/'\)\)return/);
});

test('shared uploads, pinning, media and deletion require admin; all members can read',async t=>{
 const f=await fixture(t);const admin=await f.login('admin'),member=await f.login('member'),other=await f.login('other');
 const data={name:'Shared lesson',filename:'lesson.mp3',duration:20,caption:'1\n00:00:01,000 --> 00:00:04,000\nHello',pinned:false};
 assert.equal((await f.call('/api/shared')).status,401);
 assert.equal((await f.call('/api/shared',{cookie:member.cookie,method:'POST',data})).status,403);
 assert.equal((await f.call('/api/shared',{cookie:admin.cookie,method:'POST',data:{...data,duration:-1}})).status,400);
 const created=await f.call('/api/shared',{cookie:admin.cookie,method:'POST',data});assert.equal(created.status,201);const id=created.body.book.id,path='/api/shared/'+id;
 assert.deepEqual((await f.call('/api/shared',{cookie:member.cookie})).body.books,[]);
 assert.equal((await f.call(path+'/audio',{cookie:member.cookie,method:'PUT',raw:'private'})).status,403);
 assert.equal((await f.call(path+'/audio',{cookie:admin.cookie,method:'PUT',raw:''})).status,400);
 const upload=await f.call(path+'/audio',{cookie:admin.cookie,method:'PUT',raw:'audio-content',headers:{'Content-Type':'audio/mpeg'}});assert.equal(upload.status,200);assert.equal(upload.body.book.size,13);assert.equal(upload.body.book.audioFile,undefined);
 const list=(await f.call('/api/shared',{cookie:member.cookie})).body.books;assert.equal(list.length,1);assert.equal(list[0].cues[0].text,'Hello');
 assert.equal((await f.call(path,{cookie:member.cookie,method:'PATCH',data:{pinned:true}})).status,403);
 assert.equal((await f.call(path,{cookie:member.cookie,method:'DELETE'})).status,403);
 assert.equal((await f.call(path,{cookie:admin.cookie,method:'PATCH',data:{pinned:true}})).status,200);
 const second=await f.call('/api/shared',{cookie:admin.cookie,method:'POST',data:{...data,name:'Second'}});
 await f.call('/api/shared/'+second.body.book.id+'/audio',{cookie:admin.cookie,method:'PUT',raw:'second'});
 assert.equal((await f.call('/api/shared',{cookie:other.cookie})).body.books[0].id,id);
 const audio=await f.call(path+'/audio',{cookie:other.cookie});assert.equal(audio.body,'audio-content');assert.equal(audio.headers.get('cache-control'),'no-store');
 const range=await f.call(path+'/audio',{cookie:member.cookie,headers:{Range:'bytes=0-4'}});assert.equal(range.status,206);assert.equal(range.body,'audio');assert.equal(range.headers.get('content-range'),'bytes 0-4/13');
 assert.equal((await f.call(path+'/audio',{cookie:member.cookie,headers:{Range:'bytes=-7'}})).body,'content');
 assert.equal((await f.call(path+'/audio',{cookie:member.cookie,headers:{Range:'bytes=99-100'}})).status,416);
 assert.equal((await f.call(path+'/audio')).status,401);
 f.reopenShared();assert.equal((await f.call('/api/shared',{cookie:member.cookie})).body.books[0].pinned,true);
 await f.call(path,{cookie:admin.cookie,method:'DELETE'});
 assert.equal((await f.call(path+'/audio',{cookie:member.cookie})).status,404);assert.equal((await f.call('/api/shared',{cookie:member.cookie})).body.books.length,1);
});

test('admins publish pinned YouTube links without audio uploads',async t=>{
 const f=await fixture(t),admin=await f.login('admin'),member=await f.login('member');
 const data={name:'YouTube lesson',source:'youtube',youtubeUrl:'https://youtu.be/M7lc1UVf-VE?t=10',duration:0,caption:'1\n00:00:01,000 --> 00:00:04,000\nHello',pinned:true};
 assert.equal((await f.call('/api/shared',{cookie:member.cookie,method:'POST',data})).status,403);
 assert.equal((await f.call('/api/shared',{cookie:admin.cookie,method:'POST',data:{...data,youtubeUrl:'https://evil.example/video'}})).status,400);
 const created=await f.call('/api/shared',{cookie:admin.cookie,method:'POST',data});assert.equal(created.status,201);const book=created.body.book;
 assert.equal(book.youtubeId,'M7lc1UVf-VE');assert.equal(book.youtubeUrl,'https://www.youtube.com/watch?v=M7lc1UVf-VE');
 assert.equal((await f.call('/api/shared',{cookie:member.cookie})).body.books[0].id,book.id);
 assert.equal((await f.call('/api/shared/'+book.id+'/audio',{cookie:member.cookie})).status,404);
 assert.equal((await f.call('/api/shared/'+book.id+'/audio',{cookie:admin.cookie,method:'PUT',raw:'audio'})).status,400);
 f.reopenShared();assert.equal((await f.call('/api/shared',{cookie:member.cookie})).body.books[0].source,'youtube');
});

test('members can fetch YouTube captions with authentication, bounded requests and no exposed download URLs',async t=>{
 let extractionCount=0;
 const captions=createYouTubeCaptions({extract:async()=>{extractionCount++;return {title:'Sample',subtitles:{en:[{ext:'json3',name:'English',url:'https://www.youtube.com/api/timedtext?secret=token'}]},automatic_captions:{en:[{ext:'json3',url:'https://www.youtube.com/api/timedtext?secret=other'}]}};},download:async()=>JSON.stringify({events:[{tStartMs:1000,dDurationMs:2000,segs:[{utf8:'Hello'}]}]})});
 const f=await fixture(t,{captions}),member=await f.login('member');const path='/api/youtube/captions?videoId=M7lc1UVf-VE';
 assert.equal((await f.call(path)).status,401);
 assert.equal((await f.call('/api/youtube/captions?videoId=invalid',{cookie:member.cookie})).status,400);
 const listed=await f.call(path,{cookie:member.cookie});assert.equal(listed.status,200);assert.equal(listed.body.tracks.length,2);assert.equal(listed.body.tracks[0].id,'manual:en');assert.ok(!JSON.stringify(listed.body).includes('secret'));assert.equal(listed.headers.get('cache-control'),'no-store');
 const downloaded=await f.call(path+'&track=manual%3Aen',{cookie:member.cookie});assert.equal(downloaded.status,200);assert.equal(downloaded.body.count,1);assert.match(downloaded.body.caption,/00:00:01,000 --> 00:00:03,000\nHello/);assert.equal(extractionCount,1);
 assert.equal((await f.call(path+'&track=missing',{cookie:member.cookie})).status,404);
 for(let i=0;i<9;i++)await f.call(path,{cookie:member.cookie});
 assert.equal((await f.call(path,{cookie:member.cookie})).status,429);
});

test('YouTube captions API reports unavailable captions and extraction failures',async t=>{
 const empty=await fixture(t,{captions:createYouTubeCaptions({extract:async()=>({})})});const member=await empty.login('member');
 assert.equal((await empty.call('/api/youtube/captions?videoId=M7lc1UVf-VE',{cookie:member.cookie})).status,404);
 const blocked=await fixture(t,{captions:createYouTubeCaptions({extract:async()=>{throw Error('blocked');}})});const other=await blocked.login('other');
 const result=await blocked.call('/api/youtube/captions?videoId=M7lc1UVf-VE',{cookie:other.cookie});assert.equal(result.status,502);assert.match(result.body.error,/SRT\/VTT/);
});
