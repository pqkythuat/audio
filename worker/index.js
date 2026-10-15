import assets from '#site-assets';
import {createCloudAuth,json} from './auth.js';
import {sharedApi} from './shared.js';
const auth=createCloudAuth();
export default {
 async fetch(request,env){
  const path=new URL(request.url).pathname;
  try{
   if(path.startsWith('/api/')){
    const result=await auth.handle(request,env);if(result instanceof Response)return result;
    const shared=await sharedApi(request,env,result.user);if(shared)return shared;
    if(path==='/api/youtube/captions')return json({error:'Lấy phụ đề trực tiếp cần dịch vụ xử lý YouTube riêng. Bạn có thể tải SRT/VTT lên.'},503);
    return json({error:'Không tìm thấy chức năng.'},404);
   }
   if(!['GET','HEAD'].includes(request.method))return new Response('Method not allowed',{status:405});
   const file=path==='/'?'index.html':decodeURIComponent(path.slice(1));const asset=Object.hasOwn(assets,file)?assets[file]:null;
   if(!asset)return new Response('Not found',{status:404});
   return new Response(request.method==='HEAD'?null:asset.body,{headers:{'Content-Type':asset.type,'Cache-Control':'no-cache','X-Content-Type-Options':'nosniff','Cross-Origin-Opener-Policy':'same-origin-allow-popups'}});
  }catch(e){return json({error:e.status?e.message:'Dịch vụ tạm thời chưa sẵn sàng. Vui lòng thử lại.'},e.status||500);}
 }
};
