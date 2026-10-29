(() => {
  'use strict';
  const root = document.getElementById('parking-app');
  const $ = id => document.getElementById(id);
  const form = $('account-form'), searchInput = $('account-vehicle-search');
  const STORE = 'parking-mock-accounts-v1';
  let mode = 'login', ready = false, editing = false, pending = false, authenticated = null;
  let catalog = null, matches = [], shown = 40, active = -1, timer = null;
  const message = (text = '', error = false) => { $('account-message').textContent = text; $('account-message').classList.toggle('is-error', error); };
  function accounts() {
    try { const rows=JSON.parse(localStorage.getItem(STORE)||'[]'); return Array.isArray(rows)?rows:[]; }
    catch { throw new Error('브라우저 저장 공간을 확인해 주세요.'); }
  }
  function save(rows) { localStorage.setItem(STORE, JSON.stringify(rows)); }
  async function passwordHash(password, salt) {
    const key=await crypto.subtle.importKey('raw',new TextEncoder().encode(password),'PBKDF2',false,['deriveBits']);
    const bits=await crypto.subtle.deriveBits({name:'PBKDF2',salt:new TextEncoder().encode(salt),iterations:100000,hash:'SHA-256'},key,256);
    return Array.from(new Uint8Array(bits),n=>n.toString(16).padStart(2,'0')).join('');
  }
  function updateFields() {
    const profile = editing || mode === 'signup' && ready;
    const credentials = !editing && (mode === 'login' || ready);
    $('account-phone-check').hidden = mode !== 'signup' || ready || editing;
    $('account-credentials').hidden = !credentials;
    $('account-profile-fields').hidden = !profile;
    for(const id of ['account-id','account-password']) $(id).required=credentials;
    for(const id of ['account-name','account-phone','account-plate','account-vehicle-search']) $(id).required=profile;
    $('account-password').autocomplete=mode==='signup'?'new-password':'current-password';
    $('account-submit').hidden=mode==='signup'&&!ready&&!editing;
    $('account-submit').disabled=pending;
    $('account-submit').textContent=pending?'처리 중…':editing?'변경사항 저장':mode==='signup'?'회원가입 완료':'로그인';
    $('pv-connection-label').textContent=editing?'내 정보 수정':mode==='signup'?'회원가입':'로그인';
    $('account-step').textContent=editing?'내 정보 수정':mode==='signup'?(ready?'회원정보 등록':'휴대폰 인증'):'아이디 로그인';
    $('pv-connection-title').textContent=editing?'내 정보를 관리해요':mode==='signup'?(ready?'반가워요, 주차 메이트':'안전한 시작을 준비해요'):'다시 만나서 반가워요';
    $('account-description').textContent='체험용 계정은 이 브라우저에만 저장돼요. 실제 휴대폰 인증은 진행하지 않아요.';
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
  function cancel() { clearInterval(timer); timer=null; }
  function enter(record) {
    cancel(); authenticated=record;
    root.dispatchEvent(new CustomEvent('parking-account-change',{detail:record.profile}));
    root.dispatchEvent(new Event('parking-account-enter'));
    form.reset(); editing=false; closeOptions(); message();
  }
  function open(nextMode) {
    cancel(); form.reset(); closeOptions(); message(); mode=nextMode; ready=false; editing=false;
    $('vehicle-selection').textContent='브랜드명이나 모델명으로 찾을 수 있어요.';
    updateFields();
    if(mode==='signup') {
      const deadline=Date.now()+5000;
      $('account-check-status').textContent='5초 후 회원정보를 입력할 수 있어요.';
      timer=setInterval(()=>{
        const seconds=Math.max(0,Math.ceil((deadline-Date.now())/1000));
        $('account-check-status').textContent=`${seconds}초 후 회원정보를 입력할 수 있어요.`;
        if(!seconds){cancel();ready=true;updateFields();message('회원정보를 입력해 주세요.');}
      },100);
    }
  }
  form.addEventListener('submit',async event=>{
    event.preventDefault(); if(pending || mode==='signup'&&!ready&&!editing)return;
    const username=$('account-id').value.trim().toLowerCase(), password=$('account-password').value;
    if((editing||mode==='signup')&&!$('account-vehicle-id').value){searchInput.setCustomValidity('검색 목록에서 차종을 선택해 주세요.');searchInput.reportValidity();return;}
    pending=true; updateFields(); message();
    try {
      const rows=accounts();
      if(!editing && mode==='login') {
        const record=rows.find(row=>row.username===username);
        if(!record || await passwordHash(password,record.salt)!==record.hash)throw new Error('아이디 또는 비밀번호를 확인해 주세요.');
        enter(record);return;
      }
      if(!editing&&rows.some(row=>row.username===username))throw new Error('이미 사용 중인 아이디예요. 다른 아이디를 입력해 주세요.');
      const plate=$('account-plate').value.replace(/\s/g,'');
      if(!/^[0-9]{2,3}[가-힣][0-9]{4}$/.test(plate))throw new Error('차량 번호를 확인해 주세요. 예: 32가 4321');
      const vehicle=(await loadCatalog()).find(v=>v.id===$('account-vehicle-id').value);
      if(!vehicle)throw new Error('차종을 다시 선택해 주세요.');
      const profile={name:$('account-name').value.trim(),phone:$('account-phone').value.replace(/-/g,''),plate,vehicle_id:vehicle.id,vehicle_brand:vehicle.brand,vehicle_model:vehicle.model};
      if(!profile.name)throw new Error('이름을 입력해 주세요.');
      let record;
      if(editing) { record={...authenticated,profile}; const index=rows.findIndex(row=>row.username===record.username);if(index<0)throw new Error('계정을 찾지 못했어요. 다시 로그인해 주세요.');rows[index]=record; }
      else {const salt=crypto.randomUUID();record={username,salt,hash:await passwordHash(password,salt),profile};rows.push(record);}
      save(rows);enter(record);
    } catch(error){message(error.message||'저장하지 못했어요. 다시 시도해 주세요.',true);}
    finally{pending=false;updateFields();}
  });
  root.addEventListener('click',event=>{
    if(!authenticated || !event.target.closest('[data-dialog="nickname"],[data-dialog="vehicle"]'))return;
    event.stopImmediatePropagation(); cancel(); form.reset(); editing=true; ready=true; message();
    const p=authenticated.profile;
    for(const [key,value] of Object.entries({name:p.name,phone:p.phone,plate:p.plate,vehicleId:p.vehicle_id}))form.elements[key].value=value;
    searchInput.value=`${p.vehicle_brand} ${p.vehicle_model}`; $('vehicle-selection').textContent='등록한 차종';
    updateFields(); root.dispatchEvent(new Event('parking-account-edit'));
  },true);
  window.ParkingAccount={open,cancel,resume(){open('login');message('아이디와 비밀번호로 로그인해 주세요.');},async logout(){
    cancel();authenticated=null;editing=false;form.reset();root.dispatchEvent(new CustomEvent('parking-account-change',{detail:null}));
  },get signedIn(){return !!authenticated},get editing(){return editing},get pending(){return pending}};
})();
