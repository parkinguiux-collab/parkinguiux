(() => {
  'use strict';
  const root = document.getElementById('parking-app');
  const $ = (selector) => root.querySelector(selector);
  const $$ = (selector) => [...root.querySelectorAll(selector)];
  const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
  const CARD_NAMES = ['블루카드', '옐로카드'];
  const STORE_KEY = 'parking-demo-v2';
  const EXIT_GRACE_MS = 3 * 60 * 1000;
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
        vehicle: typeof value.vehicle === 'string' && /^\d{2,3}[가-힣]\d{4}$/.test(value.vehicle.replace(/\s/g, '')) ? value.vehicle.replace(/\s/g, '') : '32가4321',
        card: CARD_NAMES.includes(value.card) ? value.card : CARD_NAMES[0],
        motion: value.motion !== false,
        notifications: value.notifications !== false,
        favorites: Array.isArray(value.favorites) ? [...new Set(value.favorites.filter(id => LOTS.some(lot => lot.id === id)))] : [],
        parkingSession: value.parkingSession && ['active', 'paid', 'exited'].includes(value.parkingSession.stage) && LOTS.some(lot => lot.id === value.parkingSession.lotId) && Number.isFinite(value.parkingSession.startedAt) && value.parkingSession.startedAt > 0 && value.parkingSession.startedAt <= Date.now() && Number.isFinite(value.parkingSession.settledFee) && value.parkingSession.settledFee >= 0 && (value.parkingSession.stage !== 'paid' || Number.isFinite(value.parkingSession.paidAt) && value.parkingSession.paidAt > 0) ? value.parkingSession : null,
        parkingSpot: Object.fromEntries(['floor', 'zone', 'pillar', 'note'].map(key => [key, typeof value.parkingSpot?.[key] === 'string' ? value.parkingSpot[key].slice(0, key === 'note' ? 120 : 20) : ''])),
        history: Array.isArray(value.history) ? value.history.filter(item => item && typeof item.name === 'string' && Number.isFinite(item.amount) && typeof item.date === 'string' && !Number.isNaN(Date.parse(item.date))).slice(0, 30) : []
      };
    } catch { return { name: '주차 메이트', vehicle: '32가4321', card: CARD_NAMES[0], motion: true, notifications: true, favorites: [], parkingSpot: { floor: '', zone: '', pillar: '', note: '' }, history: [] }; }
  }
  const preferences = readStored();
  let currentScreen = 'home';
  let selectedLot = LOTS[0];
  let sessionLot = LOTS[0];
  let stage = 'exited';
  let sessionStartedAt = 0;
  let settledFee = 0;
  let exitedAt = 0;
  let entrySimulationTimer;
  let entryNoticeTimer;
  let entrySimulationDone = false;
  try { entrySimulationDone = sessionStorage.getItem('parking-entry-simulated-v2') === 'done'; } catch { /* Optional preview preference. */ }
  let paidAt = 0;
  let busy = false;
  let areaName = '서울시청 주변';
  let center = DEFAULT_CENTER.slice();
  if (preferences.parkingSession) {
    const saved = preferences.parkingSession;
    sessionLot = LOTS.find(lot => lot.id === saved.lotId); stage = saved.stage;
    sessionStartedAt = saved.startedAt; settledFee = saved.settledFee; paidAt = saved.paidAt || 0; exitedAt = Number.isFinite(saved.exitedAt) ? saved.exitedAt : 0;
  }
  function saveSession() {
    preferences.parkingSession = stage === 'exited' && !exitedAt ? null : { lotId: sessionLot.id, stage, startedAt: sessionStartedAt, settledFee, paidAt, exitedAt };
    savePreferences();
  }
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
    if (!['home', 'map', 'payment', 'profile', 'benefits'].includes(screen)) return;
    const oldScreen = currentScreen;
    currentScreen = screen;
    $$('.screen').forEach(section => { section.hidden = section.dataset.view !== screen; });
    const navScreen = ['map', 'payment'].includes(screen) ? 'home' : screen;
    $$('.bottom-nav [data-screen]').forEach(button => {
      const active = button.dataset.screen === navScreen;
      button.classList.toggle('active', active);
      if (active) button.setAttribute('aria-current', 'page'); else button.removeAttribute('aria-current');
    });
    renderProfile();
    renderSession();
    if (oldScreen !== screen) window.scrollTo({ top: 0, behavior: 'instant' });
    if (screen === 'map') ensureMap('full');
    if (screen === 'home') scheduleEntrySimulation();
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
  function renderHomeTitle() {
    $('#home-title').innerHTML = stage === 'exited'
      ? '오늘은 어디에<br>주차하시나요?'
      : `${escape(formatVehicle())}<br>주차 중이에요`;
  }
  function renderProfile() {
    renderHomeTitle();
    $('#profile-name').textContent = preferences.name;
    $$('[data-vehicle]').forEach(element => { element.textContent = formatVehicle(); });
    $$('[data-card-name]').forEach(element => { element.textContent = preferences.card; });
    $('#history-count').textContent = preferences.history.length;
    $('#profile-saved-count').textContent = `${preferences.favorites.length}곳 저장`;
    const recent = preferences.history[0];
    $('#profile-recent-label').textContent = recent ? '최근 이용' : '이용 기록';
    $('#profile-recent-name').textContent = recent ? recent.name : '아직 이용 기록이 없어요';
    $('#profile-recent-detail').textContent = recent ? `${new Date(recent.date).toLocaleDateString('ko-KR', { month: '2-digit', day: '2-digit' })} · ${money(recent.amount)}원` : '주차 이용을 마치면 여기에서 확인할 수 있어요.';
    root.classList.toggle('motion-disabled', !preferences.motion);
  }
  function currentFee() {
    if (stage !== 'active') return settledFee;
    const minutes = Math.floor(Math.max(0, Date.now() - sessionStartedAt) / 60000);
    return minutes ? Math.ceil(minutes / 30) * sessionLot.price : 0;
  }
  function formatDuration() {
    const minutes = Math.floor(Math.max(0, Date.now() - sessionStartedAt) / 60000);
    return minutes >= 60 ? `${Math.floor(minutes / 60)}시간 ${minutes % 60}분` : `${minutes}분`;
  }
  function renderSession() {
    renderHomeTitle();
    $$('[data-duration]').forEach(element => { element.textContent = sessionStartedAt ? formatDuration() : '0분'; });
    $$('[data-entry-time]').forEach(element => { element.textContent = sessionStartedAt ? new Date(sessionStartedAt).toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit', hour12: false }) : '—'; });
    $('#parking-active').hidden = stage !== 'active';
    const completed = stage === 'exited' && exitedAt > 0;
    $('#parking-paid').hidden = stage !== 'paid' && !completed;
    $('#parking-empty').hidden = stage !== 'exited' || completed;
    $('#paid-result-title').innerHTML = completed ? '출차가<br>완료됐어요!' : '출차 준비가<br>끝났어요!';
    $('#paid-result-description').textContent = completed ? '이용해주셔서 감사해요. 안전하게 이동하세요.' : '주차장 출구로 이동해주세요.';
    $('#paid-result-badge').textContent = completed ? '이용 종료' : '정산 완료';
    $('#parking-paid .exit-countdown').hidden = completed;
    $('#exit-button').hidden = completed;
    $('#paid-result-note').textContent = completed ? '지난 이용 내역은 마이페이지에서 확인할 수 있어요.' : '출차 가능 시간을 확인하고 출구로 이동해주세요.';
    $('#home-idle-title').textContent = completed ? '출차가 완료됐어요' : '현재 이용 중인 주차장이 없어요';
    $('#home-idle-description').innerHTML = completed ? '주차 이용이 종료되었어요.<br>지난 이용은 마이페이지에서 확인하세요.' : '제휴 주차장에 입차하면<br>이곳에서 이용 현황을 확인할 수 있어요.';
    $$('[data-fee]').forEach(element => { element.textContent = money(currentFee()); });
    $$('[data-session-name]').forEach(element => { element.textContent = sessionLot.name; });
    $('[data-pay-label]').textContent = `${money(currentFee())}원 결제하기`;
    $('#home-parking-caption').textContent = stage === 'paid' ? '정산 완료' : stage === 'exited' ? (exitedAt ? '출차 완료' : '주차 전') : '주차 중';
    $('#home-parking-action').textContent = stage === 'paid' ? '출차 화면 보기' : stage === 'exited' ? '주변 주차장 보기' : '이용 중';
    $('#home-session-details').hidden = stage === 'exited';
    $('#home-active-metrics').hidden = stage !== 'active';
    $('#home-paid-message').hidden = stage !== 'paid';
    $('#home-idle-message').hidden = stage !== 'exited';
    $('#home-session-button').dataset.screen = stage === 'exited' ? 'map' : 'payment';
    $('.home-parking-card').dataset.stage = stage;
    updateDeadline();
  }
  function updateDeadline() {
    if (stage !== 'paid' || !paidAt) {
      ['#exit-deadline', '#exit-time-left', '#home-exit-deadline', '#home-exit-note'].forEach(selector => { $(selector).textContent = ''; });
      return;
    }
    const deadline = paidAt + EXIT_GRACE_MS;
    const remaining = Math.max(0, deadline - Date.now());
    $('#exit-deadline').textContent = `${new Date(deadline).toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit', hour12: false })}까지`;
    $('#exit-time-left').textContent = remaining > 0 ? `${Math.ceil(remaining / 60000)}분 안에 출차해주세요` : '출차 확인을 기다리고 있어요';
    $('#exit-button').textContent = '출차하기';
    $('#home-exit-deadline').textContent = remaining > 0 ? `${$('#exit-deadline').textContent} 출차해주세요` : '출차 확인 중이에요';
    $('#home-exit-note').textContent = $('#exit-time-left').textContent;
  }
  function chooseLot(lot) {
    selectedLot = lot;
    const web = new URL('https://m.map.naver.com/route.nhn');
    web.search = new URLSearchParams({ menu: 'route', ename: lot.name, ex: String(lot.lon), ey: String(lot.lat), pathType: '0', showMap: 'true' });
    const query = new URLSearchParams({ dlat: String(lot.lat), dlng: String(lot.lon), dname: lot.name, appname: 'https://parkinguiux.vercel.app' });
    const directions = $('#parking-directions');
    const android = /Android/i.test(navigator.userAgent);
    const ios = /iPhone|iPad|iPod/i.test(navigator.userAgent) || navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1;
    directions.href = android ? `intent://route/car?${query}#Intent;scheme=nmap;action=android.intent.action.VIEW;category=android.intent.category.BROWSABLE;package=com.nhn.android.nmap;S.browser_fallback_url=${encodeURIComponent(web.href)};end` : ios ? `nmap://route/car?${query}` : web.href;
    if (android || ios) directions.removeAttribute('target'); else directions.target = '_blank';
    directions.dataset.webFallback = web.href;
    renderFavoriteToggle();
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
  function renderFavoriteToggle() {
    const saved = preferences.favorites.includes(selectedLot.id);
    $('#favorite-toggle').setAttribute('aria-pressed', String(saved));
    $('#favorite-toggle-label').textContent = saved ? '즐겨찾기 저장됨' : '즐겨찾기에 저장';
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
      toast('현재는 서울시청 주변 주차장을 제공하고 있어요.');
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
      await withLoading('주차요금을 정산하고 있어요', '잠시만 기다려주세요.', () => {}, 780);
      settledFee = currentFee(); stage = 'paid'; paidAt = Date.now(); saveSession();
      renderSession();
      playExit();
      window.scrollTo({ top: 0, behavior: 'instant' });
    } finally { button.disabled = false; }
  }
  function playExit() {
    const scene = $('.exit-scene');
    scene.classList.remove('is-driving');
    if (allowMotion()) { void scene.offsetWidth; scene.classList.add('is-driving'); }
  }
  function completeExit() {
    if (stage !== 'paid') return;
    exitedAt = Date.now();
    preferences.history.unshift({ name: sessionLot.name, amount: settledFee, date: new Date(exitedAt).toISOString() });
    preferences.history = preferences.history.slice(0, 30);
    stage = 'exited';
    entrySimulationDone = true;
    try { sessionStorage.setItem('parking-entry-simulated-v2', 'done'); } catch { /* Optional preview flag. */ }
    saveSession();
    show('home');
    if (!root.classList.contains('is-welcome')) toast('출차가 확인되어 이용을 종료했어요.');
  }
  function openDialog(kind, opener) {
    const dialog = $('#app-dialog');
    dialogOpener = opener || document.activeElement;
    const content = $('#dialog-content');
    const titles = { favorites: '즐겨찾기', 'parking-spot': '주차 위치', benefit: '혜택 이용 안내', vehicle: '내 차량 관리', payment: '결제수단 관리', history: '이용·결제 내역', notice: '알림', settings: '설정', nickname: '프로필 수정', help: '이용 안내', about: '앱 정보·아이콘' };
    $('#dialog-title').textContent = titles[kind] || '안내';
    if (kind === 'favorites') {
      const savedLots = LOTS.filter(lot => preferences.favorites.includes(lot.id));
      content.innerHTML = savedLots.length ? `<p class="dialog-description">자주 가는 주차장을 모아두고 바로 찾아보세요.</p><div class="favorite-list">${savedLots.map(lot => `<article class="favorite-item"><button class="favorite-open" type="button" data-open-lot="${escape(lot.id)}"><img src="assets/team-icons/nearby.png" alt=""><span><strong>${escape(lot.name)}</strong><small>서울시청 인근 · 지도에서 보기</small></span></button><button class="favorite-remove" type="button" data-remove-favorite="${escape(lot.id)}" aria-label="${escape(lot.name)} 즐겨찾기 해제">해제</button></article>`).join('')}</div><p class="fine-print">즐겨찾기는 이 브라우저에 저장돼요.</p>` : '<div class="history-empty"><img src="assets/team-icons/favorite.png" alt=""><h3>자주 가는 주차장을 저장해보세요</h3><p>주차장 정보에서 즐겨찾기를 누르면<br>이곳에서 바로 확인할 수 있어요.</p><button class="primary-button favorite-find" type="button" id="find-favorite-parking">주변 주차장 보기</button></div>';
    }
    if (kind === 'parking-spot') {
      const spot = preferences.parkingSpot;
      content.innerHTML = `<p class="dialog-description">내 차를 찾기 쉽게 층·구역·기둥 번호를 기록해요.<br>직접 남기는 메모이며 자동 위치 추적은 하지 않아요.</p><form id="parking-spot-form"><div class="spot-fields"><label class="field-label">층<input class="field-input" name="floor" placeholder="예: B2" maxlength="20" value="${escape(spot.floor)}"></label><label class="field-label">구역<input class="field-input" name="zone" placeholder="예: C구역" maxlength="20" value="${escape(spot.zone)}"></label></div><label class="field-label">기둥 번호<input class="field-input" name="pillar" placeholder="예: 12번 기둥" maxlength="20" value="${escape(spot.pillar)}"></label><label class="field-label">추가 메모<textarea class="field-input spot-note" name="note" placeholder="예: 엘리베이터 오른쪽" maxlength="120" rows="3">${escape(spot.note)}</textarea></label><button class="primary-button" type="submit">주차 위치 저장하기</button><button class="text-button centered" id="clear-parking-spot" type="button">메모 비우기</button></form><p class="fine-print">이 브라우저에 저장되며 출차 후에도 직접 지우기 전까지 유지돼요.</p>`;
    }
    if (kind === 'vehicle') content.innerHTML = `<p class="dialog-description">주차요금 확인에 사용할 차량을 등록해요.</p><form id="vehicle-form"><label class="field-label" for="vehicle-input">차량 번호<input class="field-input" id="vehicle-input" autocomplete="off" value="${escape(formatVehicle())}" maxlength="12" required></label><p class="field-error" role="alert" id="vehicle-error" hidden>차량 번호를 확인해주세요. 예: 12가 3456</p><button class="primary-button" type="submit">차량 저장하기</button></form><p class="fine-print">차량 번호는 이 브라우저에 저장됩니다.</p>`;
    if (kind === 'nickname') content.innerHTML = `<form id="nickname-form"><label class="field-label" for="nickname-input">닉네임<input class="field-input" id="nickname-input" value="${escape(preferences.name)}" maxlength="12" required></label><button class="primary-button" type="submit">프로필 저장하기</button></form>`;
    if (kind === 'payment') content.innerHTML = `<p class="dialog-description">정산에 사용할 결제수단을 선택해주세요.</p><form id="card-form">${CARD_NAMES.map((name, index) => `<label class="choice-row"><input type="radio" name="demo-card" value="${index}" ${preferences.card === name ? 'checked' : ''}><span>${name}<small>등록된 결제수단</small></span></label>`).join('')}<button class="primary-button" type="submit">선택한 카드로 설정</button></form>`;
    if (kind === 'benefit') content.innerHTML = '<p class="dialog-description">제휴 주차장 할인 혜택을 보여주는 디자인 예시입니다. 실제로 발급하거나 사용할 수 있는 쿠폰은 아닙니다.</p><div class="notice-item"><img src="assets/team-icons/benefits.png" alt=""><div><h3>정산할 때 혜택을 확인해요</h3><p>실제 서비스에서는 참여 주차장, 사용 기간, 최소 결제 금액 등 혜택별 조건을 안내할 예정이에요.</p></div></div>';
    if (kind === 'history') content.innerHTML = preferences.history.length ? `<p class="dialog-description">이용을 마친 주차 기록을 확인하세요.</p><div class="dialog-list">${preferences.history.map(item => `<article class="history-item"><header><span>${escape(item.name)}</span><strong>${money(item.amount)}원</strong></header><p>${new Date(item.date).toLocaleString('ko-KR')} · 이용 종료</p></article>`).join('')}</div>` : '<div class="history-empty"><img src="assets/ui-icons/history.svg" alt=""><h3>아직 이용 내역이 없어요</h3><p>주차 이용을 마치면<br>여기에서 다시 확인할 수 있어요.</p></div>';
    if (kind === 'notice') content.innerHTML = `<div class="notice-item"><img src="assets/ui-icons/bell.svg" alt=""><div><h3>${stage === 'paid' ? '출차 준비가 끝났어요' : '쿼카와 편안하게 주차해요'}</h3><p>${stage === 'paid' ? '이용 현황에서 출차 가능 시간을 확인해주세요.' : '주변 주차장을 선택하고 이용 정보를 확인하세요.'}</p></div></div><p class="fine-print">주차 및 정산 관련 안내를 확인하세요.</p>`;
    if (kind === 'settings') content.innerHTML = `<form id="settings-form"><label class="toggle-row">캐릭터·아이콘 모션<input type="checkbox" name="motion" ${preferences.motion ? 'checked' : ''}></label><label class="toggle-row">앱 내 안내 표시<input type="checkbox" name="notifications" ${preferences.notifications ? 'checked' : ''}></label><p class="dialog-description">휴대폰에서 ‘동작 줄이기’를 사용하면 모션은 자동으로 생략돼요.</p><button class="primary-button" type="submit">설정 저장하기</button></form>`;
    if (kind === 'help') content.innerHTML = '<div class="help-list"><div><span><strong>주변 주차장 위치 확인</strong><p>지도에서 원형 표시를 눌러 주차장을 골라요. 현재는 서울시청 주변 위치를 제공합니다.</p></span></div><div><span><strong>현장 방식으로 입차·주차</strong><p>앱에서 QR을 찍을 필요가 없어요. 등록된 차량이 입차하면 이용 현황이 자동으로 연결돼요.</p></span></div><div><span><strong>출차 전에 앱에서 정산</strong><p>이용 현황에서 주차요금을 확인하고 정산해요.</p></span></div><div><span><strong>출차 확인</strong><p>실제 서비스의 출차 확인은 제휴 시스템 연동이 필요해요. 현재 시안에서는 정산 후 ‘출차하기’를 누르면 이용이 종료돼요.</p></span></div></div>';
    if (kind === 'about') content.innerHTML = '<div class="about-content"><img class="about-icon" src="assets/app-icons/icon-192.png" alt="쿼카와 P로 만든 앱 아이콘"><h3>주차 서비스</h3><p>쿼카와 함께, 편안한 주차의 시작.<br>모바일 프로토타입 v0.2<br>앱 이름과 아이콘은 팀 검토용입니다.</p><a href="assets/app-icons/icon-512.png" download="parking-app-icon.png">앱 아이콘 원본 저장</a></div><p class="fine-print">지도: <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener">OpenStreetMap</a> · 라이브러리: Leaflet, Lucide<br>실제 결제·제휴 시스템·실시간 자리 정보는 연결되지 않습니다.<br>홈 진입 약 10초 후 입차 이벤트를 한 번 보여주고, 정산 후 출차하기 버튼으로 이용을 종료합니다. 위치 확인이나 길찾기로 입차가 확정되지는 않습니다.</p>';
    if (kind === 'notice' && !preferences.notifications) content.innerHTML = '<p class="dialog-description">앱 내 안내 표시가 꺼져 있어요. 마이페이지 설정에서 변경할 수 있습니다.</p>';
    icons();
    if (!dialog.open) dialog.showModal();
    else $('#close-dialog').focus();
  }
  function receiveEntry(lot, entryTime) {
    if (stage !== 'exited') return;
    sessionLot = lot; sessionStartedAt = entryTime; settledFee = 0; paidAt = 0; exitedAt = 0; stage = 'active';
    saveSession(); renderSession();
    $('#entry-notice-detail').textContent = `${lot.name} · ${formatVehicle()}`;
    $('#entry-notice').hidden = false;
    $('.home-parking-card').classList.remove('has-new-entry');
    if (allowMotion()) { void $('.home-parking-card').offsetWidth; $('.home-parking-card').classList.add('has-new-entry'); }
    clearTimeout(entryNoticeTimer);
    entryNoticeTimer = setTimeout(() => { $('#entry-notice').hidden = true; }, 12000);
  }
  function scheduleEntrySimulation() {
    clearTimeout(entrySimulationTimer);
    if (stage !== 'exited' || entrySimulationDone || root.classList.contains('is-welcome') || currentScreen !== 'home') return;
    entrySimulationTimer = setTimeout(() => {
      if (stage !== 'exited' || root.classList.contains('is-welcome') || currentScreen !== 'home' || $('#app-dialog').open) return;
      entrySimulationDone = true;
      try { sessionStorage.setItem('parking-entry-simulated-v2', 'done'); } catch { /* Once per page without storage. */ }
      // Preview only: a real service must receive an authenticated partner entry event.
      // Looking at a lot or requesting directions never starts a parking session.
      receiveEntry(LOTS[0], Date.now());
    }, 10000);
  }
  document.addEventListener('visibilitychange', () => { if (!document.hidden) scheduleEntrySimulation(); });
  function closeDialog() {
    $('#app-dialog').close();
    if (dialogOpener?.isConnected) dialogOpener.focus({ preventScroll: true });
    scheduleEntrySimulation();
  }
  root.addEventListener('click', event => {
    const button = event.target.closest('button');
    if (!button || button.disabled || busy) return;
    tap(button);
    if (button.id === 'favorite-toggle') {
      const saved = preferences.favorites.includes(selectedLot.id);
      preferences.favorites = saved ? preferences.favorites.filter(id => id !== selectedLot.id) : [...preferences.favorites, selectedLot.id];
      savePreferences(); renderFavoriteToggle(); renderProfile(); toast(saved ? '즐겨찾기를 해제했어요.' : '즐겨찾기에 저장했어요.'); return;
    }
    if (button.dataset.removeFavorite) {
      preferences.favorites = preferences.favorites.filter(id => String(id) !== button.dataset.removeFavorite);
      savePreferences(); renderFavoriteToggle(); renderProfile(); openDialog('favorites', dialogOpener); toast('즐겨찾기를 해제했어요.'); return;
    }
    if (button.dataset.openLot) {
      const lot = LOTS.find(item => String(item.id) === button.dataset.openLot);
      if (lot) { closeDialog(); chooseLot(lot); show('map'); } return;
    }
    if (button.id === 'find-favorite-parking') { closeDialog(); show('map'); return; }
    if (button.id === 'clear-parking-spot') {
      preferences.parkingSpot = { floor: '', zone: '', pillar: '', note: '' };
      savePreferences(); openDialog('parking-spot', dialogOpener); toast('주차 위치 메모를 비웠어요.'); return;
    }
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
    if (button.id === 'dismiss-entry-notice') { $('#entry-notice').hidden = true; return; }
    if (button.hasAttribute('data-retry-map')) {
      maps.forEach((record, kind) => { $(`[data-map-fallback="${kind}"]`).hidden = true; record.map.invalidateSize(); });
      if (!window.L) toast('지도 라이브러리가 준비되지 않았어요. 페이지를 새로고침해주세요.');
    }
  });
  // NAVER's documented nmap route/car scheme; web fallback keeps the destination.
  $('#parking-directions').addEventListener('click', event => {
    const link = event.currentTarget;
    if (!link.href.startsWith('nmap:')) return;
    const started = Date.now();
    let fallback;
    const cancel = () => {
      clearTimeout(fallback);
      document.removeEventListener('visibilitychange', onVisibility);
      window.removeEventListener('pagehide', cancel);
    };
    const onVisibility = () => { if (document.hidden) cancel(); };
    document.addEventListener('visibilitychange', onVisibility);
    window.addEventListener('pagehide', cancel, { once: true });
    fallback = setTimeout(() => {
      cancel();
      if (!document.hidden && Date.now() - started < 3500) window.location.assign(link.dataset.webFallback);
    }, 1800);
  });
  $('#destination-search').addEventListener('submit', searchDestination);
  $('#dialog-content').addEventListener('submit', event => {
    event.preventDefault();
    const form = event.target;
    if (form.id === 'parking-spot-form') {
      preferences.parkingSpot = Object.fromEntries(['floor', 'zone', 'pillar', 'note'].map(key => [key, form.elements[key].value.trim().slice(0, key === 'note' ? 120 : 20)]));
    } else if (form.id === 'vehicle-form') {
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
  setInterval(() => { if (stage === 'active') renderSession(); else updateDeadline(); }, 10000);
  function playWelcome() {
    const quokka = $('.home-quokka');
    if (!allowMotion() || currentScreen !== 'home' || root.classList.contains('is-welcome')) return;
    animate(quokka, [
      { transform: 'translateX(155px) rotate(5deg)', opacity: 0 },
      { transform: 'translateX(-7px) rotate(-2deg)', opacity: 1, offset: .78 },
      { transform: 'translateX(2px) rotate(1deg)', opacity: 1, offset: .9 },
      { transform: 'translateX(0) rotate(0)', opacity: 1 }
    ], 1700);
  }
  icons(); renderProfile(); chooseLot(LOTS[0]); show('home');
  root.addEventListener('parking-preview-enter', () => { show('home'); requestAnimationFrame(playWelcome); });
  if ($('.home-quokka').complete) requestAnimationFrame(playWelcome);
  else $('.home-quokka').addEventListener('load', playWelcome, { once: true });
})();
