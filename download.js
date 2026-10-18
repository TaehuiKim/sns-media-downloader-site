'use strict';
(() => {
  const base = 'https://nstmmxgtxtfigkjzkogj.supabase.co';
  // Public project identifier, never a service_role key. Filled during site build.
  const key = 'sb_publishable_lb3eAU0OxPQT07ukIUP87g_9vJFyhsg';
  const $ = id => document.getElementById(id);
  const errors = {
    LOGIN_REQUIRED:'Anvel 테스트 계정으로 먼저 로그인해 주세요.',
    INVALID_POST_URL:'Instagram, X, Threads의 올바른 게시물 링크를 입력해 주세요.',
    PUBLIC_POST_UNAVAILABLE:'SNS에서 공개 페이지를 제공하지 않거나 요청을 제한했습니다. 로그인된 브라우저의 확장 프로그램을 이용해 주세요.',
    MEDIA_UNAVAILABLE:'공개 페이지에서 원본 미디어를 찾지 못했습니다. Chrome 확장 프로그램을 이용해 주세요.',
    UPSTREAM_UNAVAILABLE:'SNS에 연결하지 못했습니다. 잠시 후 다시 시도해 주세요.',
    POST_TOO_LARGE:'이 게시물은 웹에서 처리할 수 있는 크기를 초과했습니다.',
  };
  let session = null, media = [], busy = false, pending = false;
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
  $('account').addEventListener('click',()=>{
    if(session){session=null;$('account').textContent='로그인 ↗';message('로그아웃했습니다.');return;}
    $('auth-dialog').showModal();
  });
  $('close-auth').addEventListener('click',()=>{$('auth-dialog').close();pending=false;});
  $('auth-dialog').addEventListener('cancel',()=>{pending=false;});
  $('login-form').addEventListener('submit',async event=>{
    event.preventDefault();$('login-submit').disabled=true;$('auth-message').hidden=true;
    try {
      const response=await fetch(`${base}/auth/v1/token?grant_type=password`,{method:'POST',headers:{apikey:key,'Content-Type':'application/json'},body:JSON.stringify({email:$('email').value.trim(),password:$('password').value}),signal:AbortSignal.timeout(15000)});
      const result=await response.json();
      if(!response.ok||!result.access_token)throw Error('이메일과 비밀번호를 확인해 주세요. 테스트 계정이 없다면 운영자에게 문의해 주세요.');
      session=result;$('password').value='';$('account').textContent='로그아웃';$('auth-dialog').close();
      if(pending){pending=false;$('resolve-form').requestSubmit();}else message('로그인했습니다. 게시물 링크를 입력해 주세요.');
    }catch(error){$('auth-message').textContent=error.name==='TimeoutError'?'로그인 요청 시간이 초과되었습니다.':error.message;$('auth-message').hidden=false;}
    finally{$('login-submit').disabled=false;}
  });
  $('resolve-form').addEventListener('submit',async event=>{
    event.preventDefault();if(busy)return;
    const url=$('url').value.trim();
    detectPlatform();
    if(!validPost(url)){message(errors.INVALID_POST_URL,true);$('url').focus();return;}
    message('');
    if(!session){pending=true;$('auth-dialog').showModal();return;}
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
