'use strict';
(() => {
  const account = window.SNSAccount;
  const base = account.BASE, key = account.PUBLIC_KEY;
  const $ = id => document.getElementById(id);
  const errors = {
    LOGIN_REQUIRED:'Google 계정으로 먼저 로그인해 주세요.',
    PAYMENT_REQUIRED:'웹·확장 공통 이용권이 필요합니다.',
    INVALID_POST_URL:'Instagram, X, Threads의 올바른 게시물 링크를 입력해 주세요.',
    PUBLIC_POST_UNAVAILABLE:'SNS에서 공개 페이지를 제공하지 않거나 요청을 제한했습니다. 로그인된 브라우저의 확장 프로그램을 이용해 주세요.',
    MEDIA_UNAVAILABLE:'공개 페이지에서 원본 미디어를 찾지 못했습니다. Chrome 확장 프로그램을 이용해 주세요.',
    UPSTREAM_UNAVAILABLE:'SNS에 연결하지 못했습니다. 잠시 후 다시 시도해 주세요.',
    POST_TOO_LARGE:'이 게시물은 웹에서 처리할 수 있는 크기를 초과했습니다.',
  };
  let session = null, media = [], busy = false, license = {active:false};
  function message(text, error = false) {
    $('message').textContent = text;
    $('message').classList.toggle('error',error);
    $('message').hidden = !text;
  }
  function detectPlatform() {
    const value = $('url').value.trim();
    let name = '';
    try {
      const url = new URL(value);
      if (url.protocol === 'https:' && !url.username && !url.password && !url.port) {
        const host = url.hostname.replace(/^www\./,'');
        if (host === 'instagram.com') name = 'Instagram';
        if (host === 'x.com' || host === 'twitter.com') name = 'X / Twitter';
        if (host === 'threads.com' || host === 'threads.net') name = 'Threads';
      }
    } catch { /* Partial typing is expected. */ }
    $('detected-platform').textContent = name ? `${name} 링크 인식됨` :
      value ? 'Instagram, X, Threads의 게시물 링크를 입력해 주세요' :
      'Instagram · X / Twitter · Threads 링크 자동 인식';
  }
  $('url').addEventListener('input', detectPlatform);
  $('paste').addEventListener('click',async()=>{
    try {$('url').value = await navigator.clipboard.readText();$('url').dispatchEvent(new Event('input'));$('url').focus();}
    catch {message('입력창에서 붙여넣기 단축키(Ctrl+V 또는 ⌘V)를 사용해 주세요.');$('url').focus();}
  });
  function validPost(value) {
    try {
      const u = new URL(value);
      if(u.protocol!=='https:' || u.port || u.username || u.password) return false;
      const h=u.hostname.replace(/^www\./,'');
      return ((h==='x.com'||h==='twitter.com') && /^\/[\w]{1,15}\/status\/\d+(?:\/(?:photo|video)\/\d+)?\/?$/.test(u.pathname)) ||
        (h==='instagram.com' && /^\/(?:[\w.]+\/)?(?:p|reels?)\/[\w-]+\/?$/.test(u.pathname)) ||
        ((h==='threads.com'||h==='threads.net') && /^\/@[\w.]+\/post\/[\w-]+\/?$/.test(u.pathname));
    } catch {return false;}
  }
  function safeMedia(value) {
    try { const u = new URL(value);return u.protocol==='https:' && !u.username && !u.password && !u.port &&
      ['pbs.twimg.com','video.twimg.com','cdninstagram.com','fbcdn.net'].some(h=>u.hostname===h||u.hostname.endsWith('.'+h)); }catch{return false;}
  }
  function render(items) {
    media=items.filter(item=>safeMedia(item.url)&&['image','video'].includes(item.kind)).slice(0,40);
    $('gallery').replaceChildren();
    for(const [index,item] of media.entries()) {
      const card=document.createElement('article');card.className='media-card';
      const preview=document.createElement(item.kind==='video'?'video':'img');
      preview.src=item.url;preview.referrerPolicy='no-referrer';
      if(item.kind==='video'){preview.controls=true;preview.preload='metadata';}else{preview.alt=`사진 ${index+1}`;preview.loading='lazy';}
      const label=document.createElement('label'),check=document.createElement('input');check.type='checkbox';check.checked=true;check.dataset.index=index;check.addEventListener('change',selection);
      label.append(check,document.createTextNode(`${item.kind==='video'?'영상':'사진'} ${index+1}`));
      const link=document.createElement('a');link.href=item.url;link.target='_blank';link.rel='noopener noreferrer';link.textContent='원본 열기 ↗';
      card.append(preview,label,link);$('gallery').append(card);
    }
    $('select-all').checked=true;$('results').hidden=!media.length;selection();
    message(media.length?`${media.length}개의 미디어를 찾았습니다.`:errors.MEDIA_UNAVAILABLE,!media.length);
  }
  function selection(){const checks=[...$('gallery').querySelectorAll('input')],count=checks.filter(c=>c.checked).length;$('download').disabled=!count;$('download').textContent=`선택한 ${count}개 저장`;$('select-all').checked=count===checks.length&&count>0;$('select-all').indeterminate=count>0&&count<checks.length;}
  $('select-all').addEventListener('change',()=>{for(const c of $('gallery').querySelectorAll('input'))c.checked=$('select-all').checked;selection();});
  function authMessage(text){$('auth-message').textContent=text;$('auth-message').hidden=!text;}
  function showAccount(){if(!$('auth-dialog').open)$('auth-dialog').showModal();}
  async function refreshLicense(){
    $('account').textContent=session?'계정·이용권':'로그인 ↗';
    $('account-title').textContent=session?'내 계정과 이용권':'Google로 시작하세요';
    $('account-email').textContent=session?.user?.email || '웹과 확장에서 같은 Google 계정을 사용하세요.';
    $('google-login').hidden=!!session;$('sign-out').hidden=!session;
    $('refresh-license').hidden=!session;$('manage-billing').hidden=!session;
    $('purchase').disabled=true;license={active:false};
    if(!session){$('license-status').textContent='로그인 후 이용권을 확인하세요.';return;}
    try{
      const result=await account.billing();license=result.access;
      $('license-status').textContent=license.active?`이용권 활성${license.expiresAt?' · '+new Date(license.expiresAt).toLocaleDateString()+'까지':''}`:
        result.checkoutReady?'활성 이용권이 없습니다. 결제 후 웹과 확장에서 사용할 수 있습니다.':'결제 서비스를 준비 중입니다. 아직 결제할 수 없습니다.';
      $('purchase').disabled=license.active||!result.checkoutReady;
    }catch(error){$('license-status').textContent=error.message;}
  }
  $('account').addEventListener('click',showAccount);$('plans').addEventListener('click',showAccount);
  $('close-auth').addEventListener('click',()=>{$('auth-dialog').close();});
  $('google-login').addEventListener('click',async()=>{
    $('google-login').disabled=true;authMessage('Google 로그인으로 이동합니다.');
    try{sessionStorage.setItem('sns-open-account','1');await account.google();}
    catch(error){authMessage(error.message);$('google-login').disabled=false;}
  });
  $('sign-out').addEventListener('click',async()=>{
    const {error}=await account.client.auth.signOut();if(error){authMessage(error.message);return;}
    session=null;license={active:false};$('results').hidden=true;$('gallery').replaceChildren();await refreshLicense();authMessage('로그아웃했습니다.');
  });
  $('refresh-license').addEventListener('click',()=>refreshLicense());
  $('manage-billing').addEventListener('click',()=>account.portal().catch(error=>authMessage(error.message)));
  $('purchase').addEventListener('click',async()=>{
    $('purchase').disabled=true;authMessage('Paddle 결제창을 준비합니다.');
    try{await account.checkout(async()=>{
      authMessage('결제를 확인하고 있습니다. 서버 검증 후 이용권이 활성화됩니다.');
      for(let i=0;i<12&&session;i++){
        await new Promise(resolve=>setTimeout(resolve,2500));await refreshLicense();
        if(license.active){authMessage('이용권이 활성화되었습니다.');return;}
      }
      authMessage('결제 확인이 지연되고 있습니다. 잠시 후 이용권을 새로고침해 주세요.');
    });authMessage('결제를 완료하면 서버에서 이용권을 확인합니다.');}
    catch(error){authMessage(error.message);}
    finally{await refreshLicense();}
  });
  account.client.auth.onAuthStateChange((_event,next)=>{
    session=next;setTimeout(()=>refreshLicense(),0);
  });
  account.client.auth.getSession().then(async({data,error})=>{
    session=data.session;await refreshLicense();if(error)authMessage('로그인을 완료하지 못했습니다. 다시 시도해 주세요.');
    if(new URL(location.href).searchParams.get('purchase')==='1'||sessionStorage.getItem('sns-open-account')){
      sessionStorage.removeItem('sns-open-account');showAccount();
    }
  }).catch(error=>authMessage(error.message));
  $('resolve-form').addEventListener('submit',async event=>{
    event.preventDefault();if(busy)return;
    const url=$('url').value.trim();
    detectPlatform();
    if(!validPost(url)){message(errors.INVALID_POST_URL,true);$('url').focus();return;}
    message('');
    const current=await account.client.auth.getSession();session=current.data.session;
    if(!session){showAccount();return;}
    await refreshLicense();
    if(!license.active){showAccount();return;}
    busy=true;$('resolve').disabled=true;$('resolve').textContent='미디어 확인 중…';$('results').hidden=true;message('공개 게시물에서 미디어를 확인하고 있습니다.');
    try {
      const response=await fetch(`${base}/functions/v1/media-resolve`,{method:'POST',headers:{apikey:key,Authorization:`Bearer ${key}`,'x-user-authorization':`Bearer ${session.access_token}`,'Content-Type':'application/json'},body:JSON.stringify({url}),signal:AbortSignal.timeout(25000)});
      const result=await response.json();
      if(response.status===401){session=null;$('account').textContent='로그인 ↗';throw Error(errors.LOGIN_REQUIRED);}
      if(!response.ok)throw Error(errors[result.error]||'미디어를 찾지 못했습니다. 잠시 후 다시 시도해 주세요.');
      render(Array.isArray(result.media)?result.media:[]);
    }catch(error){message(error.name==='TimeoutError'?'요청 시간이 초과되었습니다. 잠시 후 다시 시도해 주세요.':error.message,true);}
    finally{busy=false;$('resolve').disabled=false;$('resolve').innerHTML='미디어 찾기 <span aria-hidden="true">↓</span>';}
  });
  $('download').addEventListener('click',async()=>{
    const selected=[...$('gallery').querySelectorAll('input:checked')].map(c=>media[Number(c.dataset.index)]);
    $('download').disabled=true;let saved=0;
    for(const [index,item] of selected.entries()){
      try{
        const response=await fetch(item.url,{credentials:'omit',referrerPolicy:'no-referrer',signal:AbortSignal.timeout(30000)});
        if(!response.ok)throw Error('CDN_DENIED');
        const blob=await response.blob(),url=URL.createObjectURL(blob),link=document.createElement('a');
        link.href=url;link.download=`anvel-${Date.now()}-${index+1}.${item.kind==='video'?'mp4':(blob.type==='image/png'?'png':blob.type==='image/webp'?'webp':'jpg')}`;
        link.click();setTimeout(()=>URL.revokeObjectURL(url),60000);saved++;
      }catch{ /* Cross-origin downloads depend on the source CDN; original links remain available. */ }
    }
    message(saved===selected.length?`${saved}개 파일의 저장을 브라우저에 요청했습니다.`:`${saved}개 저장 요청. 직접 저장이 제한된 항목은 ‘원본 열기’에서 브라우저의 저장 기능을 이용해 주세요.`,saved!==selected.length);selection();
  });
})();
