(() => {
  'use strict';
  const root = document.getElementById('parking-app');
  const $ = (selector) => root.querySelector(selector);
  const $$ = (selector) => [...root.querySelectorAll(selector)];
  const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
  const CARD_NAMES = ['샘플 블루카드', '샘플 옐로카드'];
  const STORE_KEY = 'parking-demo-v2';
  const DEFAULT_CENTER = [37.5665, 126.9780];
  const mapData = window.PARKING_MAP_DATA;
  const LOTS = mapData.parking.map((lot, index) => ({ ...lot,
    name: lot.name === '이름 미등록 주차장' ? `시청 인근 주차장 ${index + 1}` : lot.name,
    price: 2000, status: '위치 정보'
  }));
  function readStored() {
    try {
      const value = JSON.parse(localStorage.getItem(STORE_KEY) || '{}');
      return {
        name: typeof value.name === 'string' ? value.name.slice(0, 12) : '주차 메이트',
        vehicle: typeof value.vehicle === 'string' && /^\d{2,3}[가-힣]\d{4}$/.test(value.vehicle.replace(/\s/g, '')) ? value.vehicle.replace(/\s/g, '') : '12가3456',
        card: CARD_NAMES.includes(value.card) ? value.card : CARD_NAMES[0],
        motion: value.motion !== false,
        notifications: value.notifications !== false,
        history: Array.isArray(value.history) ? value.history.filter(item => item && typeof item.name === 'string' && Number.isFinite(item.amount) && typeof item.date === 'string' && !Number.isNaN(Date.parse(item.date))).slice(0, 30) : []
      };
    } catch { return { name: '주차 메이트', vehicle: '12가3456', card: CARD_NAMES[0], motion: true, notifications: true, history: [] }; }
  }
  const preferences = readStored();
  let currentScreen = 'home';
  let selectedLot = LOTS[0];
  let sessionLot = LOTS[0];
  let stage = 'active';
  let paidAt = 0;
  let busy = false;
  let areaName = '서울시청 주변';
  let center = DEFAULT_CENTER.slice();
  const maps = new Map();
  let toastTimer;
  let dialogOpener;
  const icons = () => window.lucide?.createIcons();
  const escape = value => String(value).replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char]);
  const money = amount => amount.toLocaleString('ko-KR');
  const formatVehicle = () => preferences.vehicle.replace(/(\d{2,3}[가-힣])(\d{4})/, '$1 $2');
  const allowMotion = () => !reducedMotion.matches && preferences.motion;
  const delay = milliseconds => new Promise(resolve => setTimeout(resolve, milliseconds));
  function savePreferences() {
    try { localStorage.setItem(STORE_KEY, JSON.stringify(preferences)); }
    catch { toast('브라우저 저장 공간을 사용할 수 없어 이번 이용에만 반영돼요.'); }
  }
  function toast(message) {
    clearTimeout(toastTimer);
    $('#toast').textContent = message;
    $('#toast').hidden = false;
    toastTimer = setTimeout(() => { $('#toast').hidden = true; }, 3100);
  }
  function animate(element, frames, duration) {
    if (!allowMotion() || !element?.animate) return Promise.resolve();
    return element.animate(frames, { duration, easing: 'cubic-bezier(.22,.8,.35,1)' }).finished.catch(() => {});
  }
  function tap(button) {
    if (!allowMotion()) return;
    button.classList.remove('is-tapped');
    void button.offsetWidth;
    button.classList.add('is-tapped');
    setTimeout(() => button.classList.remove('is-tapped'), 330);
  }
  function show(screen) {
    if (!['home', 'map', 'payment', 'profile', 'exit'].includes(screen)) return;
    const oldScreen = currentScreen;
    currentScreen = screen;
    $$('.screen').forEach(section => { section.hidden = section.dataset.view !== screen; });
    const navScreen = screen === 'map' ? 'home' : screen === 'exit' ? 'payment' : screen;
    $$('.bottom-nav [data-screen]').forEach(button => {
      const active = button.dataset.screen === navScreen;
      button.classList.toggle('active', active);
      if (active) button.setAttribute('aria-current', 'page'); else button.removeAttribute('aria-current');
    });
    renderProfile();
    renderSession();
    if (oldScreen !== screen) window.scrollTo({ top: 0, behavior: 'instant' });
    if (screen === 'home') ensureMap('home');
    if (screen === 'map') ensureMap('full');
    if (screen === 'exit') playExit();
  }
  async function withLoading(title, description, task, duration = 500) {
    if (busy) return;
    busy = true;
    const focused = document.activeElement;
    $('#loading-title').textContent = title;
    $('#loading-description').textContent = description;
    $('#loading-overlay').hidden = false;
    $('#app-main').inert = true;
    $('.bottom-nav').inert = true;
    try { await Promise.all([Promise.resolve().then(task), delay(allowMotion() ? duration : 180)]); }
    finally {
      $('#loading-overlay').hidden = true;
      $('#app-main').inert = false;
      $('.bottom-nav').inert = false;
      busy = false;
      if (focused?.isConnected && !focused.closest('[hidden]')) focused.focus({ preventScroll: true });
    }
  }
  function renderProfile() {
    $('#profile-name').textContent = preferences.name;
    $$('[data-vehicle]').forEach(element => { element.textContent = formatVehicle(); });
    $$('[data-card-name]').forEach(element => { element.textContent = preferences.card; });
    $('#history-count').textContent = preferences.history.length;
    root.classList.toggle('motion-disabled', !preferences.motion);
  }
  function renderSession() {
    $('#parking-active').hidden = stage !== 'active';
    $('#parking-paid').hidden = stage !== 'paid';
    $('#parking-empty').hidden = stage !== 'exited';
    $$('[data-fee]').forEach(element => { element.textContent = money(sessionLot.price * 4); });
    $$('[data-session-name]').forEach(element => { element.textContent = sessionLot.name; });
    $('[data-pay-label]').textContent = `${money(sessionLot.price * 4)}원 결제 체험하기`;
    $('#home-parking-caption').textContent = stage === 'paid' ? '정산이 끝났어요' : stage === 'exited' ? '다음 주차도 편하게' : '주차 중이신가요?';
    $('#home-parking-action').textContent = stage === 'paid' ? '출차 가능 시간 확인' : stage === 'exited' ? '주변 주차장 찾아보기' : '이용 요금 바로 확인';
    updateDeadline();
  }
  function updateDeadline() {
    if (stage !== 'paid' || !paidAt) return;
    const deadline = paidAt + 10 * 60 * 1000;
    const remaining = Math.max(0, deadline - Date.now());
    $('#exit-deadline').textContent = `${new Date(deadline).toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit', hour12: false })}까지`;
    $('#exit-time-left').textContent = remaining > 0 ? `${Math.ceil(remaining / 60000)}분 안에 출차해주세요` : '유예 시간이 지났어요 · 추가 정산이 필요해요';
    $('#exit-button').textContent = remaining > 0 ? '출차 완료 체험' : '추가 정산 체험하기';
  }
  function chooseLot(lot) {
    selectedLot = lot;
    $('#selected-lot-name').textContent = lot.name;
    $('#selected-lot-distance').textContent = `약 ${lot.distance}m`;
    $('#selected-lot-price').textContent = `${money(lot.price)}원`;
    $('#selected-lot-status').textContent = lot.status;
    $('#selected-lot-coordinates').textContent = `${lot.lat.toFixed(5)}, ${lot.lon.toFixed(5)}`;
    $('#selected-lot-status').classList.toggle('is-busy', lot.status === '보통');
    maps.forEach(record => record.markers.forEach((marker, index) => {
      const element = marker.getElement();
      element?.classList.toggle('is-selected', LOTS[index].id === lot.id);
      element?.setAttribute('aria-pressed', String(LOTS[index].id === lot.id));
    }));
    animate($('#map-selection'), [{ transform: 'translateY(3px)', opacity: .85 }, { transform: 'translateY(0)', opacity: 1 }], 220);
  }
  function mapFailure(kind) { $(`[data-map-fallback="${kind}"]`).hidden = false; }
  function ensureMap(kind) {
    if (!window.L) { mapFailure(kind); return; }
    if (maps.has(kind)) { requestAnimationFrame(() => maps.get(kind).map.invalidateSize({ pan: false })); return; }
    const mapElement = kind === 'home' ? $('#home-map') : $('#full-map');
    const map = L.map(mapElement, { zoomControl: kind !== 'home', scrollWheelZoom: false, dragging: kind !== 'home', touchZoom: kind !== 'home', doubleClickZoom: false, keyboard: kind !== 'home', minZoom:14, maxZoom:18, maxBounds:mapData.bounds, maxBoundsViscosity:1, zoomSnap:.25, zoomAnimation: allowMotion(), fadeAnimation: allowMotion() }).setView(center, 15);
    const major = feature => /primary|secondary|tertiary/.test(feature.properties.class);
    L.geoJSON(mapData.geometry, { interactive:false, filter:feature=>feature.properties.kind==='park', style:{color:'#e5eee9',weight:1,fillColor:'#e5eee9',fillOpacity:.85} }).addTo(map);
    L.geoJSON(mapData.geometry, { interactive:false, filter:feature=>feature.properties.kind==='road', style:feature=>({color:'#dce4ee',weight:major(feature)?10:5,opacity:.9,lineCap:'round'}) }).addTo(map);
    L.geoJSON(mapData.geometry, { interactive:false, filter:feature=>feature.properties.kind==='road', style:feature=>({color:'#fff',weight:major(feature)?7:3,opacity:1,lineCap:'round'}) }).addTo(map);
    map.attributionControl.setPrefix(false);
    map.attributionControl.setPosition('topright');
    map.attributionControl.addAttribution('&copy; <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener">OpenStreetMap</a>');
    const point = L.marker(center, { interactive: false, keyboard: false, icon: L.divIcon({ className: 'center-point', iconSize: [14, 14], iconAnchor: [7, 7] }) }).addTo(map);
    const markers = LOTS.map(lot => {
      const marker = L.marker([lot.lat, lot.lon], { title: lot.name, alt: lot.name, icon: L.divIcon({ className: `lot-pin${lot.id === selectedLot.id ? ' is-selected' : ''}`, html: '<span class="parking-orbit"><span class="parking-core"></span></span>', iconSize: [66, 66], iconAnchor: [33, 33] }) }).addTo(map);
      marker.on('click', () => { chooseLot(lot); if (kind === 'home') show('map'); });
      marker.getElement()?.setAttribute('aria-label', `${lot.name} · 직선거리 약 ${lot.distance}m · OSM 주차장 위치`);
      marker.getElement()?.setAttribute('aria-pressed', String(lot.id === selectedLot.id));
      return marker;
    });
    maps.set(kind, { map, markers, point });
    requestAnimationFrame(() => { map.invalidateSize({ pan:false }); map.fitBounds([DEFAULT_CENTER,...LOTS.map(lot=>[lot.lat,lot.lon])],{padding:[32,38],maxZoom:16,animate:false}); });
  }
  function repositionMaps() {
    $$('[data-area-label]').forEach(element => { element.textContent = areaName; });
    maps.forEach(record => {
      record.map.setView(center, 15, { animate: false });
      record.point.setLatLng(center);
    });
  }
  async function searchDestination(event) {
    event.preventDefault();
    if (busy) return;
    const query = $('#destination-input').value.trim();
    if (query && !/시청|서울|광화문/.test(query)) {
      toast('지금은 서울시청 주변만 체험할 수 있어요.');
      $('#destination-input').focus();
      return;
    }
    const button = $('#destination-search button');
    button.disabled = true;
    try {
      await animate($('.home-quokka'), [{ transform: 'translateX(0)' }, { transform: 'translateX(5px) rotate(2deg)', offset: .25 }, { transform: 'translateX(-34px)', opacity: .5 }], 330);
      await withLoading('가까운 주차장을 찾고 있어요', '서울시청 주변의 주차장 위치를 확인해요.', () => { center = DEFAULT_CENTER.slice(); areaName = '서울시청 주변'; repositionMaps(); }, 480);
      show('map');
    } finally { button.disabled = false; }
  }
  async function locate() {
    if (!navigator.geolocation || !window.isSecureContext) { toast('현재 위치는 HTTPS 사이트에서 확인할 수 있어요.'); return; }
    $('#locate-button').disabled = true;
    try {
      const position = await new Promise((resolve, reject) => navigator.geolocation.getCurrentPosition(resolve, reject, { timeout: 8000, maximumAge: 60000 }));
      const location = [position.coords.latitude, position.coords.longitude];
      if(location[0]<mapData.bounds[0][0]||location[0]>mapData.bounds[1][0]||location[1]<mapData.bounds[0][1]||location[1]>mapData.bounds[1][1]){toast('현재는 서울시청 주변의 주차장 위치를 지원해요.');return;}
      center = location;
      areaName = '내 위치 주변';
      repositionMaps();
      toast('내 위치로 이동했어요. 주차장 핀은 실제 등록 좌표를 유지해요.');
    } catch { toast('위치를 확인하지 못했어요. 서울시청 주변 지도를 이용해 주세요.'); }
    finally { $('#locate-button').disabled = false; }
  }
  async function pay() {
    if (busy || stage !== 'active') return;
    const button = $('#pay-button'); button.disabled = true;
    try {
      await withLoading('주차요금을 정산하고 있어요', '결제 체험 중이에요. 실제로 청구되지 않아요.', () => {}, 780);
      stage = 'paid'; paidAt = Date.now();
      renderSession();
      animate($('#parking-paid .completion-check'), [{ transform: 'scale(.8)', opacity: .3 }, { transform: 'scale(1.04)', opacity: 1, offset: .7 }, { transform: 'scale(1)' }], 360);
      window.scrollTo({ top: 0, behavior: 'instant' });
    } finally { button.disabled = false; }
  }
  function playExit() {
    const scene = $('.exit-scene');
    scene.classList.remove('is-driving');
    if (allowMotion()) { void scene.offsetWidth; scene.classList.add('is-driving'); }
  }
  function completeExit() {
    if (busy || stage !== 'paid') return;
    if (Date.now() > paidAt + 600000) {
      withLoading('추가 정산을 체험하고 있어요', '체험용으로 출차 유예 시간을 다시 안내해요.', () => {}, 650).then(() => { paidAt = Date.now(); updateDeadline(); toast('추가 정산 체험 완료 · 실제 청구 없음'); });
      return;
    }
    preferences.history.unshift({ name: sessionLot.name, amount: sessionLot.price * 4, date: new Date().toISOString() });
    preferences.history = preferences.history.slice(0, 30);
    stage = 'exited'; savePreferences(); show('exit');
  }
  function openDialog(kind, opener) {
    const dialog = $('#app-dialog');
    dialogOpener = opener || document.activeElement;
    const content = $('#dialog-content');
    const titles = { vehicle: '내 차량 관리', payment: '결제수단 관리', history: '이용·결제 내역', notice: '알림', settings: '설정', nickname: '프로필 수정', help: '이용 안내', about: '앱 정보·아이콘' };
    $('#dialog-title').textContent = titles[kind] || '안내';
    if (kind === 'vehicle') content.innerHTML = `<p class="dialog-description">주차요금 확인에 사용할 차량을 등록해요.</p><form id="vehicle-form"><label class="field-label" for="vehicle-input">차량 번호<input class="field-input" id="vehicle-input" autocomplete="off" value="${escape(formatVehicle())}" maxlength="12" required></label><p class="field-error" role="alert" id="vehicle-error" hidden>차량 번호를 확인해주세요. 예: 12가 3456</p><button class="primary-button" type="submit">차량 저장하기</button></form><p class="fine-print">이 브라우저에만 저장되는 체험용 설정입니다.</p>`;
    if (kind === 'nickname') content.innerHTML = `<form id="nickname-form"><label class="field-label" for="nickname-input">닉네임<input class="field-input" id="nickname-input" value="${escape(preferences.name)}" maxlength="12" required></label><button class="primary-button" type="submit">프로필 저장하기</button></form>`;
    if (kind === 'payment') content.innerHTML = `<p class="dialog-description">실제 카드 정보 없이 결제수단 선택을 체험해요.</p><form id="card-form">${CARD_NAMES.map((name, index) => `<label class="choice-row"><input type="radio" name="demo-card" value="${index}" ${preferences.card === name ? 'checked' : ''}><span>${name}<small>체험 전용 · 실제 청구 없음</small></span></label>`).join('')}<button class="primary-button" type="submit">선택한 카드로 설정</button></form>`;
    if (kind === 'history') content.innerHTML = preferences.history.length ? `<p class="dialog-description">출차까지 마친 체험 기록이에요. 실제 결제 내역이 아닙니다.</p><div class="dialog-list">${preferences.history.map(item => `<article class="history-item"><header><span>${escape(item.name)}</span><strong>${money(item.amount)}원</strong></header><p>${new Date(item.date).toLocaleString('ko-KR')} · 출차 체험 완료</p></article>`).join('')}</div>` : '<div class="history-empty"><img src="assets/ui-icons/history.svg" alt=""><h3>아직 이용 내역이 없어요</h3><p>결제와 출차 체험을 마치면<br>여기에서 다시 확인할 수 있어요.</p></div>';
    if (kind === 'notice') content.innerHTML = `<div class="notice-item"><img src="assets/ui-icons/bell.svg" alt=""><div><h3>${stage === 'paid' ? '출차 준비가 끝났어요' : '쿼카와 편안하게 주차해요'}</h3><p>${stage === 'paid' ? '이용 현황에서 출차 가능 시간을 확인해주세요.' : '주변 주차장 위치를 확인하고, 앱 정산을 체험해보세요.'}</p></div></div><p class="fine-print">현재는 체험용 안내만 표시됩니다.</p>`;
    if (kind === 'settings') content.innerHTML = `<form id="settings-form"><label class="toggle-row">캐릭터·아이콘 모션<input type="checkbox" name="motion" ${preferences.motion ? 'checked' : ''}></label><label class="toggle-row">앱 내 안내 표시<input type="checkbox" name="notifications" ${preferences.notifications ? 'checked' : ''}></label><p class="dialog-description">휴대폰에서 ‘동작 줄이기’를 사용하면 모션은 자동으로 생략돼요.</p><button class="primary-button" type="submit">설정 저장하기</button></form>`;
    if (kind === 'help') content.innerHTML = '<div class="help-list"><div><span><strong>주변 주차장 위치 확인</strong><p>지도에서 P 핀을 눌러 주차장을 골라요. 현재는 서울시청 주변 위치를 제공합니다.</p></span></div><div><span><strong>현장 방식으로 입차·주차</strong><p>앱에서 QR을 찍을 필요가 없어요. 선택한 주차장의 이용 체험을 시작해보세요.</p></span></div><div><span><strong>출차 전에 앱에서 정산</strong><p>이용 현황에서 샘플 요금을 확인하고 결제 체험을 해요.</p></span></div><div><span><strong>출차 완료 체험</strong><p>실제 서비스의 출차 확인은 제휴 시스템 연동이 필요해요. 현재는 버튼으로 체험합니다.</p></span></div></div>';
    if (kind === 'about') content.innerHTML = '<div class="about-content"><img class="about-icon" src="assets/app-icons/icon-192.png" alt="쿼카와 P로 만든 앱 아이콘"><h3>주차 서비스</h3><p>쿼카와 함께, 편안한 주차의 시작.<br>모바일 프로토타입 v0.2<br>앱 이름과 아이콘은 팀 검토용입니다.</p><a href="assets/app-icons/icon-512.png" download="parking-app-icon.png">앱 아이콘 원본 저장</a></div><p class="fine-print">지도: <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener">OpenStreetMap</a> · 라이브러리: Leaflet, Lucide<br>실제 결제·실시간 자리 정보·예약 기능은 포함되지 않습니다.</p>';
    if (kind === 'notice' && !preferences.notifications) content.innerHTML = '<p class="dialog-description">앱 내 안내 표시가 꺼져 있어요. 마이페이지 설정에서 변경할 수 있습니다.</p>';
    icons();
    if (!dialog.open) dialog.showModal();
  }
  function closeDialog() {
    $('#app-dialog').close();
    if (dialogOpener?.isConnected) dialogOpener.focus({ preventScroll: true });
  }
  root.addEventListener('click', event => {
    const button = event.target.closest('button');
    if (!button || button.disabled || busy) return;
    tap(button);
    if (button.dataset.dialog) { openDialog(button.dataset.dialog, button); return; }
    if (button.dataset.screen) {
      if (button.classList.contains('parking-shortcut') && stage === 'exited') show('map');
      else show(button.dataset.screen);
      return;
    }
    if (button.id === 'close-dialog') closeDialog();
    if (button.id === 'locate-button') locate();
    if (button.id === 'pay-button') pay();
    if (button.id === 'exit-button') completeExit();
    if (button.id === 'replay-exit') playExit();
    if (button.id === 'use-parking') {
      if (stage === 'paid') { toast('현재 정산한 주차장의 출차 체험을 먼저 마쳐주세요.'); show('payment'); return; }
      sessionLot = selectedLot; stage = 'active'; show('payment'); toast('선택한 주차장 이용을 체험해요.');
    }
    if (button.hasAttribute('data-retry-map')) {
      maps.forEach((record, kind) => { $(`[data-map-fallback="${kind}"]`).hidden = true; record.map.invalidateSize(); });
      if (!window.L) toast('지도 라이브러리가 준비되지 않았어요. 페이지를 새로고침해주세요.');
    }
  });
  $('#destination-search').addEventListener('submit', searchDestination);
  $('#dialog-content').addEventListener('submit', event => {
    event.preventDefault();
    const form = event.target;
    if (form.id === 'vehicle-form') {
      const vehicle = $('#vehicle-input').value.replace(/\s/g, '');
      if (!/^\d{2,3}[가-힣]\d{4}$/.test(vehicle)) { $('#vehicle-error').hidden = false; $('#vehicle-input').setAttribute('aria-invalid', 'true'); $('#vehicle-input').focus(); return; }
      preferences.vehicle = vehicle;
    } else if (form.id === 'nickname-form') {
      const name = $('#nickname-input').value.trim();
      if (!name) { $('#nickname-input').focus(); return; }
      preferences.name = name.slice(0, 12);
    } else if (form.id === 'card-form') {
      const selected = new FormData(form).get('demo-card');
      preferences.card = CARD_NAMES[Number(selected)] || CARD_NAMES[0];
    } else if (form.id === 'settings-form') {
      preferences.motion = form.elements.motion.checked;
      preferences.notifications = form.elements.notifications.checked;
    } else return;
    savePreferences(); renderProfile(); closeDialog(); toast('저장했어요.');
  });
  $('#app-dialog').addEventListener('click', event => { if (event.target === $('#app-dialog')) { const rect = event.target.getBoundingClientRect(); if (event.clientX < rect.left || event.clientX > rect.right || event.clientY < rect.top || event.clientY > rect.bottom) closeDialog(); } });
  setInterval(updateDeadline, 10000);
  function playWelcome() {
    const quokka = $('.home-quokka');
    if (!allowMotion() || currentScreen !== 'home') return;
    animate(quokka, [
      { transform: 'translateX(155px) rotate(5deg)', opacity: 0 },
      { transform: 'translateX(-7px) rotate(-2deg)', opacity: 1, offset: .78 },
      { transform: 'translateX(2px) rotate(1deg)', opacity: 1, offset: .9 },
      { transform: 'translateX(0) rotate(0)', opacity: 1 }
    ], 1700);
  }
  icons(); renderProfile(); chooseLot(LOTS[0]); show('home');
  if ($('.home-quokka').complete) requestAnimationFrame(playWelcome);
  else $('.home-quokka').addEventListener('load', playWelcome, { once: true });
})();
