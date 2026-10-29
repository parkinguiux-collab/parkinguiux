(() => {
  'use strict';
  const root = document.getElementById('parking-app');
  const $ = id => document.getElementById(id);
  const form = $('account-form');
  const searchInput = $('account-vehicle-search');
  let mode = 'login', verified = null, editing = false, requested = false, pending = false;
  let config = null, catalog = null, matches = [], shown = 40, active = -1;
  let widget = null, captchaToken = '', retryAt = 0;
  let authenticated = null;
  const message = (text = '', error = false) => { $('account-message').textContent = text; $('account-message').classList.toggle('is-error', error); };
  async function api(body) {
    const response = await fetch('/api/account' + (body ? '' : '?action=session'), { method: body ? 'POST' : 'GET', credentials: 'same-origin', cache: 'no-store', headers: body ? {'Content-Type':'application/json'} : {}, ...(body ? {body:JSON.stringify(body)} : {}), signal:AbortSignal.timeout(20000) });
    const result = await response.json();
    if (!response.ok) throw Object.assign(new Error(result.error || '다시 시도해 주세요.'), {status:response.status});
    return result;
  }
  function profileValues() { return Object.fromEntries(['name','birthYear','email','plate','vehicleId'].map(name => [name, form.elements[name].value.trim()])); }
  function updateFields() {
    const showProfile = mode === 'signup' || !!verified || editing;
    $('account-profile-fields').hidden = !showProfile;
    for (const id of ['account-name','account-birth-year','account-email','account-plate','account-vehicle-search']) $(id).required = showProfile;
    $('account-code-field').hidden = !requested;
    $('account-code').required = requested;
    $('account-phone').readOnly = requested || !!verified || editing;
    $('account-submit').textContent = editing ? '변경사항 저장' : verified ? '회원가입 완료' : requested ? '인증하고 계속하기' : '인증번호 받기';
    $('account-submit').disabled = pending;
    $('account-captcha').hidden = editing || !!verified || requested || !config?.ready;
    $('account-step').textContent = editing ? '내 정보 수정' : requested ? '휴대폰 인증' : mode === 'signup' ? '회원정보 등록' : '휴대폰 인증';
    $('pv-connection-title').textContent = editing ? '내 정보를 관리해요' : mode === 'signup' || verified ? '반가워요, 주차 메이트' : '휴대폰 번호로 간편하게 로그인';
    $('account-description').textContent = editing ? '등록한 정보와 차량을 변경할 수 있어요.' : '문자로 받은 인증번호로 안전하게 시작해요.';
    $('pv-connection-label').textContent = editing ? '내 정보 수정' : mode === 'signup' ? '회원가입' : '로그인';
  }
  async function loadCatalog() {
    if (!catalog) {
      const response = await fetch('assets/vehicle-catalog.json');
      if (!response.ok) throw new Error('차종 목록을 불러오지 못했어요. 다시 시도해 주세요.');
      catalog = window.ParkingVehicleSearch.prepare((await response.json()).vehicles);
    }
    return catalog;
  }
  function renderMatches() {
    $('vehicle-result-count').textContent = `${matches.length.toLocaleString('ko-KR')}개 · 가나다순`;
    const list = $('account-vehicle-results'); list.replaceChildren();
    matches.slice(0,shown).forEach((v,i) => {
      const li = document.createElement('li'); li.setAttribute('role','presentation');
      const button = document.createElement('button'); button.type='button'; button.className='vehicle-option'; button.id=`vehicle-option-${i}`; button.setAttribute('role','option'); button.setAttribute('aria-selected', String(active === i)); button.tabIndex=-1;
      const title=document.createElement('strong'); title.textContent=`${v.brand} ${v.model}`;
      const subtitle=document.createElement('small'); subtitle.textContent=[v.type,v.year && `${v.year}년 출시`].filter(Boolean).join(' · ');
      button.append(title,subtitle); button.addEventListener('click',()=>selectVehicle(v)); li.append(button); list.append(li);
    });
    $('vehicle-load-more').hidden = shown >= matches.length;
    if (!matches.length) { const li=document.createElement('li'); li.textContent='검색 결과가 없어요. 브랜드나 모델명을 다시 입력해 주세요.'; list.append(li); }
  }
  function selectVehicle(v) {
    $('account-vehicle-id').value=v.id; searchInput.value=`${v.brand} ${v.model}`; searchInput.setCustomValidity('');
    $('vehicle-selection').textContent=`선택한 차종: ${v.brand} ${v.model}`;
    closeOptions(); searchInput.focus({preventScroll:true});
  }
  function closeOptions() { $('vehicle-options').hidden=true; searchInput.setAttribute('aria-expanded','false'); searchInput.removeAttribute('aria-activedescendant'); active=-1; }
  async function findVehicles() {
    const q=searchInput.value;
    try {
      const rows=await loadCatalog(); if(searchInput.value!==q)return;
      matches=window.ParkingVehicleSearch.search(rows,q); shown=40; active=-1;
      $('vehicle-options').hidden=false; searchInput.setAttribute('aria-expanded','true'); renderMatches();
    } catch(error){message(error.message,true);}
  }
  searchInput.addEventListener('input',()=>{ $('account-vehicle-id').value=''; searchInput.setCustomValidity(''); $('vehicle-selection').textContent='목록에서 내 차종을 선택해 주세요.'; findVehicles(); });
  searchInput.addEventListener('focus',()=>{if(!$('account-vehicle-id').value)findVehicles()});
  searchInput.addEventListener('keydown',event=>{
    if(event.key==='Escape'){closeOptions();return;}
    if(!['ArrowDown','ArrowUp','Enter'].includes(event.key)||$('vehicle-options').hidden)return;
    if(event.key==='Enter'&&active<0)return;
    event.preventDefault();
    if(event.key==='Enter'){if(matches[active])selectVehicle(matches[active]);return;}
    active=Math.max(0,Math.min(Math.min(shown,matches.length)-1,active+(event.key==='ArrowDown'?1:-1)));
    renderMatches();const option=$(`vehicle-option-${active}`);if(option){searchInput.setAttribute('aria-activedescendant',option.id);option.scrollIntoView({block:'nearest'});}
  });
  $('vehicle-load-more').addEventListener('click',()=>{shown+=40;renderMatches()});
  document.addEventListener('click',event=>{if(!event.target.closest('.vehicle-picker'))closeOptions()});
  function resetCaptcha() { captchaToken='';if(widget!==null)window.hcaptcha?.reset(widget); }
  async function initCaptcha() {
    if (!config?.ready) return;
    if(!window.hcaptcha) await new Promise((resolve,reject)=>{
      const script=document.createElement('script');script.src='https://js.hcaptcha.com/1/api.js?render=explicit';script.async=true;script.onload=resolve;script.onerror=()=>reject(new Error('보안 확인을 불러오지 못했어요. 새로고침해 주세요.'));document.head.append(script);
    });
    if(widget===null)widget=window.hcaptcha.render('account-captcha',{sitekey:config.captchaSitekey,size:'compact',callback:token=>{captchaToken=token},'expired-callback':()=>{captchaToken=''},'error-callback':()=>message('보안 확인을 다시 진행해 주세요.',true)});
    else resetCaptcha();
  }
  function enter(result) {
    authenticated=result; root.dispatchEvent(new CustomEvent('parking-account-change',{detail:result.profile}));
    root.querySelector('[data-preview-exit]').textContent='로그아웃';
    root.dispatchEvent(new Event('parking-account-enter'));
    form.reset();verified=null;requested=false;editing=false;closeOptions();message();
  }
  async function requestCode() {
    if(!config?.ready)throw new Error('문자 인증 서비스를 연결 중이에요. 연결이 완료되면 이용할 수 있어요.');
    if(Date.now()<retryAt)throw new Error('잠시 후 인증번호를 다시 요청해 주세요.');
    if(!captchaToken)throw new Error('자동입력 방지 확인을 완료해 주세요.');
    const result=await api({action:'request',phone:$('account-phone').value,mode,captchaToken});
    retryAt=Date.now()+result.retryAfter*1000;requested=true;resetCaptcha();message('인증번호를 요청했어요. 문자로 받은 6자리를 입력해 주세요.');
  }
  async function saveProfile() {
    const result=await api({action:'profile',...profileValues()});enter(result);
  }
  form.addEventListener('submit',async event=>{
    event.preventDefault();if(pending)return;
    if(!$('account-profile-fields').hidden&&!$('account-vehicle-id').value){searchInput.setCustomValidity('검색 목록에서 차종을 선택해 주세요.');searchInput.reportValidity();return;}
    pending=true;updateFields();message();
    try {
      if(editing||verified) await saveProfile();
      else if(!requested){ await requestCode();updateFields();$('account-code').focus(); }
      else {
        const result=await api({action:'verify',phone:$('account-phone').value,code:$('account-code').value});
        if(result.profile)enter(result);
        else {verified=result.user;requested=false;mode='signup';updateFields();message('휴대폰 인증이 완료됐어요. 회원정보를 확인해 주세요.');$('account-name').focus();}
      }
    } catch(error){message(error.message,true);if(error.status===401){verified=null;requested=false;editing=false;}resetCaptcha();}
    finally{pending=false;updateFields();}
  });
  $('account-resend').addEventListener('click',async()=>{
    if(pending||Date.now()<retryAt)return;
    requested=false;$('account-code').value='';updateFields();message('보안 확인 후 인증번호 받기를 눌러 주세요.');await initCaptcha().catch(e=>message(e.message,true));
  });
  $('account-change-phone').addEventListener('click',()=>{requested=false;$('account-code').value='';updateFields();message();$('account-phone').focus();initCaptcha().catch(e=>message(e.message,true));});
  setInterval(()=>{
    const seconds=Math.max(0,Math.ceil((retryAt-Date.now())/1000));
    $('account-resend').disabled=seconds>0||pending;
    $('account-code-status').textContent=seconds?`${seconds}초 후 재요청 가능`:'';
  },1000);
  async function open(nextMode) {
    form.reset();closeOptions();message();mode=nextMode;verified=null;requested=false;editing=false;captchaToken='';
    $('vehicle-selection').textContent='브랜드명이나 모델명으로 찾을 수 있어요.';updateFields();
    try {
      if(!config){const r=await fetch('/api/account?action=config',{cache:'no-store'});if(!r.ok)throw Error();config=await r.json();}
      if(!config.ready)message('문자 인증 서비스를 연결 중이에요. 연결이 완료되면 이용할 수 있어요.');
      else {
        const session=await api();
        if(session.profile){enter(session);return;}
        if(session.user){verified=session.user;mode='signup';$('account-phone').value='0'+session.user.phone.replace(/^\+?82/,'');updateFields();}
        await initCaptcha();
      }
    } catch{message('인증 서비스에 연결하지 못했어요. 잠시 후 다시 시도해 주세요.',true);}
  }
  root.addEventListener('click',async event=>{
    if(!authenticated)return;
    const edit=event.target.closest('[data-dialog="nickname"],[data-dialog="vehicle"]');
    if(!edit)return;
    event.stopImmediatePropagation();root.dispatchEvent(new Event('parking-account-edit'));
    editing=true;verified=authenticated.user;mode='signup';requested=false;message();
    const p=authenticated.profile;form.reset();
    for(const [key,value] of Object.entries({name:p.name,email:p.contact_email,birthYear:p.birth_year,plate:p.plate,vehicleId:p.vehicle_id}))form.elements[key].value=value;
    $('account-phone').value='0'+authenticated.user.phone.replace(/^\+?82/,'');
    searchInput.value=`${p.vehicle_brand} ${p.vehicle_model}`;$('vehicle-selection').textContent='등록한 차종';updateFields();
  },true);
  window.ParkingAccount={open,async logout(){
    await api({action:'logout'});authenticated=null;verified=null;form.reset();root.dispatchEvent(new CustomEvent('parking-account-change',{detail:null}));root.querySelector('[data-preview-exit]').textContent='시작 화면으로';
  },get signedIn(){return !!authenticated},get editing(){return editing},get pending(){return pending}};
})();
