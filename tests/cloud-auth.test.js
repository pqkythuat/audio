import test from 'node:test';
import assert from 'node:assert/strict';
import {createCloudAuth} from '../worker/auth.js';
class Bucket{
 objects=new Map();
 async get(key){const item=this.objects.get(key);return item?{etag:item.etag,json:async()=>JSON.parse(item.value)}:null;}
 async put(key,value,options={}){const old=this.objects.get(key);if(options.onlyIf?.etagDoesNotMatch==='*'&&old||options.onlyIf?.etagMatches&&old?.etag!==options.onlyIf.etagMatches)return null;const item={etag:crypto.randomUUID(),value:String(value)};this.objects.set(key,item);return item;}
 async delete(key){this.objects.delete(key);}
 async list({prefix}){return {objects:[...this.objects.keys()].filter(k=>k.startsWith(prefix)).map(key=>({key})),truncated:false};}
}
const origin='https://audio.ttpq.net';
test('cloud Google sessions persist and enforce account roles, nonce and logout',async()=>{
 const env={BUCKET:new Bucket(),GOOGLE_CLIENT_ID:'test-client',APP_ORIGINS:origin,ADMIN_EMAILS:'admin@example.com'};
 const options={verify:async credential=>JSON.parse(credential)};let auth=createCloudAuth(options);
 const call=(path,{cookie,method='GET',data,requestOrigin=origin}={})=>auth.handle(new Request(origin+path,{method,headers:{Origin:requestOrigin,...(cookie?{Cookie:cookie}:{}),'Content-Type':'application/json'},...(data?{body:JSON.stringify(data)}:{})}),env);
 const signIn=async(email,sub)=>{
  const start=await call('/api/session'),state=await start.json(),nonceCookie=start.headers.getSetCookie()[0].split(';')[0];
  const data={credential:JSON.stringify({sub,email,email_verified:true,name:email,nonce:state.nonce,role:'admin'})};
  const response=await call('/api/login',{method:'POST',cookie:nonceCookie,data});
  return {response,user:(await response.clone().json()).user,cookie:response.headers.getSetCookie().find(s=>s.startsWith('__Host-ln_session='))?.split(';')[0],data,nonceCookie};
 };
 const admin=await signIn('admin@example.com','admin'),member=await signIn('member@example.com','member');
 assert.equal(admin.user.role,'admin');assert.equal(member.user.role,'member');assert.match(admin.response.headers.getSetCookie().join(';'),/HttpOnly/);assert.match(admin.response.headers.getSetCookie().join(';'),/Secure/);
 assert.equal((await (await call('/api/session',{cookie:member.cookie})).json()).user.id,'member');
 assert.equal((await call('/api/accounts',{cookie:member.cookie})).status,403);assert.equal((await call('/api/accounts')).status,401);
 assert.equal((await call('/api/accounts/member',{cookie:member.cookie,method:'PATCH',data:{role:'admin',disabled:false}})).status,403);
 assert.equal((await call('/api/accounts/admin',{cookie:admin.cookie,method:'PATCH',data:{role:'member',disabled:true}})).status,400);
 assert.equal((await call('/api/login',{method:'POST',cookie:admin.nonceCookie,data:admin.data})).status,401);
 assert.equal((await call('/api/login',{method:'POST',data:admin.data})).status,401);
 assert.equal((await call('/api/login',{method:'POST',cookie:member.nonceCookie,data:member.data,requestOrigin:'https://evil.example'})).status,403);
 assert.equal((await call('/api/accounts/member',{cookie:admin.cookie,method:'PATCH',data:{role:'member',disabled:true}})).status,200);
 assert.equal((await (await call('/api/session',{cookie:member.cookie})).json()).user,null);
 assert.equal((await signIn('member@example.com','member')).response.status,403);
 assert.equal((await call('/api/accounts/member',{cookie:admin.cookie,method:'PATCH',data:{role:'admin',disabled:false}})).status,200);
 const promoted=await signIn('member@example.com','member');assert.equal(promoted.user.role,'admin');
 auth=createCloudAuth(options);assert.equal((await (await call('/api/session',{cookie:promoted.cookie})).json()).user.role,'admin');
 assert.equal((await (await call('/api/accounts',{cookie:admin.cookie})).json()).accounts.length,2);
 await call('/api/logout',{cookie:promoted.cookie,method:'POST'});assert.equal((await (await call('/api/session',{cookie:promoted.cookie})).json()).user,null);
});
