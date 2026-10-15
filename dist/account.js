const el=id=>document.getElementById(id);
const api=async(path,options={})=>{
 const response=await fetch(path,{...options,headers:{'Content-Type':'application/json',...options.headers},cache:'no-store'});
 const data=await response.json();if(!response.ok)throw Error(data.error||'Yêu cầu chưa thành công.');return data;
};
const message=text=>{el('accountMessage').textContent=text;};
let state;
async function loadAccounts(){
 const {accounts}=await api('/api/accounts');el('accountList').replaceChildren();
 for(const user of accounts){
  const row=document.createElement('div');row.className='account-row';
  const info=document.createElement('div'),name=document.createElement('b'),email=document.createElement('small');name.textContent=user.name;email.textContent=user.email;info.append(name,email);
  const role=document.createElement('select');role.setAttribute('aria-label',`Quyền của ${user.email}`);
  for(const [value,label]of [['member','Thành viên'],['admin','Quản trị viên']]){const option=document.createElement('option');option.value=value;option.textContent=label;role.append(option);}role.value=user.role;
  const lock=document.createElement('button');lock.textContent=user.disabled?'Mở khóa':'Khóa';lock.className=user.disabled?'':'danger';
  const save=document.createElement('button');save.textContent='Lưu quyền';
  for(const control of [role,save,lock])control.disabled=user.id===state.user.id;
  const update=async disabled=>{save.disabled=lock.disabled=true;try{await api('/api/accounts/'+encodeURIComponent(user.id),{method:'PATCH',body:JSON.stringify({role:role.value,disabled})});await loadAccounts();message('Đã cập nhật tài khoản. Người dùng cần đăng nhập lại.');}catch(e){message(e.message);save.disabled=lock.disabled=false;}};
  save.onclick=()=>update(user.disabled);lock.onclick=()=>update(!user.disabled);row.append(info,role,save,lock);el('accountList').append(row);
 }
}
el('accountButton').onclick=()=>el('accountDialog').showModal();
el('closeAccount').onclick=()=>el('accountDialog').close();
el('logout').onclick=async()=>{try{await api('/api/logout',{method:'POST'});globalThis.google?.accounts.id.disableAutoSelect();location.reload();}catch(e){message(e.message);}};
el('manageAccounts').onclick=async()=>{try{el('accountAdmin').hidden=false;await loadAccounts();}catch(e){message(e.message);}};
async function init(){
 const staticHosting=document.querySelector?.('meta[name="app-runtime"]')?.content==='static';
 if(staticHosting){globalThis.langNgheStaticHosting=true;state={configured:false,demo:false,user:null};}
 else try{state=await api('/api/session');}catch{el('accountButton').textContent='Tài khoản';message('Không kết nối được dịch vụ tài khoản.');el('authGate').hidden=false;el('authGateMessage').textContent='Không kết nối được máy chủ. Kết nối mạng và tải lại để đăng nhập.';return;}
 if(!state.configured&&!state.demo){
  el('accountButton').textContent=staticHosting?'Trên thiết bị':'Tài khoản';el('accountSummary').textContent=staticHosting?'Thư viện trên thiết bị này':'Chưa cấu hình đăng nhập Google';message(staticHosting?'Bản công khai hiện lưu bài trên thiết bị. Đăng nhập, quản lý tài khoản và thư viện chung cần kết nối máy chủ.':'Cần cấu hình Google Client ID trên máy chủ để bật đăng nhập.');
 }else if(!state.user){
  el('authGate').hidden=false;el('appMain').hidden=true;el('openLibrary').hidden=true;
  el('accountButton').textContent='Đăng nhập';el('accountSummary').textContent='Đăng nhập với Google';
  if(state.demo){
   el('accountSummary').textContent='Tài khoản dùng thử';
   el('authGateMessage').textContent='Chế độ dùng thử trên máy này. Đăng nhập Google sẽ bật sau khi cấu hình Client ID.';
   for(const id of ['googleSignIn','accountGoogleSignIn']){
    for(const [account,label]of [['admin','Dùng thử Admin'],['member','Dùng thử Thành viên 1'],['member2','Dùng thử Thành viên 2']]){
     const button=document.createElement('button');button.textContent=label;button.onclick=async()=>{button.disabled=true;try{await api('/api/demo-login',{method:'POST',body:JSON.stringify({account})});location.reload();}catch(e){el('authGateMessage').textContent=e.message;message(e.message);button.disabled=false;}};el(id).append(button);
    }
   }
   return;
  }
  const script=document.createElement('script');script.src='https://accounts.google.com/gsi/client';script.async=true;
  script.onload=()=>{google.accounts.id.initialize({client_id:state.clientId,...(state.nonce?{nonce:state.nonce}:{}),callback:async({credential})=>{el('authGateMessage').textContent='Đang đăng nhập…';try{await api('/api/login',{method:'POST',body:JSON.stringify({credential})});location.reload();}catch(e){el('authGateMessage').textContent=e.message;}}});for(const id of ['googleSignIn','accountGoogleSignIn'])google.accounts.id.renderButton(el(id),{theme:'outline',size:'large',text:'signin_with',locale:'vi'});};
  script.onerror=()=>{el('authGateMessage').textContent='Không tải được đăng nhập Google. Kiểm tra kết nối và tải lại.';};document.head.append(script);return;
 }else{
  el('accountButton').textContent=state.user.name;el('accountSummary').textContent=state.user.name;el('accountEmail').textContent=state.user.email;el('accountRole').textContent=state.user.role==='admin'?'Quản trị viên':'Thành viên';el('logout').hidden=false;el('manageAccounts').hidden=state.user.role!=='admin';
  globalThis.langNgheAccountId=state.user.id;globalThis.langNgheSharedUploadMaxBytes=state.sharedUploadMaxBytes;
  if(state.demo)message('Đang dùng tài khoản thử nghiệm trên máy này. Chưa kết nối Google.');
  // Recheck account status when returning to the app and invalidate disabled sessions.
  const recheck=async()=>{try{const next=await api('/api/session');if(!next.user||next.user.id!==state.user.id)location.reload();}catch{}};
  document.addEventListener('visibilitychange',()=>{if(!document.hidden)recheck();});setInterval(recheck,60000);
 }
 const app=await import('./app.js?v=31');
 if(state.user){const {initSharedLibrary}=await import('./shared-library.js?v=31');await initSharedLibrary({user:state.user,addToPersonal:app.addSharedToPersonal,setSharedLibrary:app.setSharedLibrary});}
}
init().catch(e=>message(e.message));
