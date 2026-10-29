(() => {
  'use strict';
  const root = document.getElementById('parking-app');
  const $ = (selector) => root.querySelector(selector);
  const $$ = (selector) => [...root.querySelectorAll(selector)];
  const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
  const CARD_NAMES = ['블루카드', '옐로카드'];
  const benefits = window.ParkingBenefits;
  let benefitTab = 'available';
  const STORE_KEY = 'parking-demo-v2';
  const EXIT_GRACE_MS = 3 * 60 * 1000;
  const DEFAULT_CENTER = [37.5665, 126.9780];
  const national = window.NationalParking;
  let nearbyLots = [];
  let mapRequest = 0;
  let roadController;
  let gpsLocation = null;
  const mapCache = new Map();
  const mapData = window.PARKING_MAP_DATA;
  const LOTS = mapData.parking.map((lot, index) => ({ ...lot,
    name: lot.name === '이름 미등록 주차장' ? `시청 인근 주차장 ${index + 1}` : lot.name,
    price: 2000, status: '위치 정보'
  }));
  function readStored() {
    try {
      const value = JSON.parse(localStorage.getItem(STORE_KEY) || '{}');
      return {
        coupons: Array.isArray(value.coupons) ? benefits.catalog.flatMap(offer => { const c = value.coupons.find(item => item?.id === offer.id && Number.isFinite(item.issuedAt) && Number.isFinite(item.expiresAt) && item.expiresAt > item.issuedAt); return c ? [{ id: offer.id, issuedAt: c.issuedAt, expiresAt: c.expiresAt, usedAt: Number.isFinite(c.usedAt) ? c.usedAt : 0 }] : []; }) : [],
        name: typeof value.name === 'string' ? value.name.slice(0, 12) : '주차 메이트',
        vehicle: typeof value.vehicle === 'string' && /^\d{2,3}[가-힣]\d{4}$/.test(value.vehicle.replace(/\s/g, '')) ? value.vehicle.replace(/\s/g, '') : '32가4321',
        vehicleModel: typeof value.vehicleModel === 'string' ? value.vehicleModel.slice(0, 200) : '',
        card: CARD_NAMES.includes(value.card) ? value.card : CARD_NAMES[0],
        motion: value.motion !== false,
        notifications: value.notifications !== false,
        savedLots: Array.isArray(value.savedLots) ? value.savedLots.filter(lot => lot && typeof lot.id === 'string' && typeof lot.name === 'string' && Number.isFinite(lot.lat) && Number.isFinite(lot.lon)).slice(0,200) : [],
        favorites: Array.isArray(value.favorites) ? [...new Set(value.favorites.filter(id => typeof id === 'string'))].slice(0,200) : [],
        parkingSession: value.parkingSession && ['active', 'paid', 'exited'].includes(value.parkingSession.stage) && LOTS.some(lot => lot.id === value.parkingSession.lotId) && Number.isFinite(value.parkingSession.startedAt) && value.parkingSession.startedAt > 0 && value.parkingSession.startedAt <= Date.now() && Number.isFinite(value.parkingSession.settledFee) && value.parkingSession.settledFee >= 0 && (value.parkingSession.stage !== 'paid' || Number.isFinite(value.parkingSession.paidAt) && value.parkingSession.paidAt > 0) ? value.parkingSession : null,
        parkingSpot: Object.fromEntries(['floor', 'zone', 'pillar', 'note'].map(key => [key, typeof value.parkingSpot?.[key] === 'string' ? value.parkingSpot[key].slice(0, key === 'note' ? 120 : 20) : ''])),
        history: Array.isArray(value.history) ? value.history.filter(item => item && typeof item.name === 'string' && Number.isFinite(item.amount) && typeof item.date === 'string' && !Number.isNaN(Date.parse(item.date))).slice(0, 30) : []
      };
    } catch { return { savedLots: [], coupons: [], name: '주차 메이트', vehicle: '32가4321', vehicleModel: '', card: CARD_NAMES[0], motion: true, notifications: true, favorites: [], parkingSpot: { floor: '', zone: '', pillar: '', note: '' }, history: [] }; }
  }
  const preferences = readStored();
  const knownLots = new Map([...LOTS,...preferences.savedLots].map(lot=>[lot.id,lot]));
  let currentScreen = 'home';
  let selectedLot = LOTS[0];
  let sessionLot = LOTS[0];
  let stage = 'exited';
  let sessionStartedAt = 0;
  let settledFee = 0;
  let selectedCouponId = null;
  let settlement = null;
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
    selectedCouponId = benefits.catalog.some(offer => offer.id === saved.couponId) ? saved.couponId : null;
    settlement = saved.settlement && Number.isFinite(saved.settlement.fee) && Number.isFinite(saved.settlement.discount) && saved.settlement.discount >= 0 && saved.settlement.fee - saved.settlement.discount === saved.settledFee ? saved.settlement : null;
    sessionStartedAt = saved.startedAt; settledFee = saved.settledFee; paidAt = saved.paidAt || 0; exitedAt = Number.isFinite(saved.exitedAt) ? saved.exitedAt : 0;
  }
  function saveSession() {
    preferences.parkingSession = stage === 'exited' && !exitedAt ? null : { lotId: sessionLot.id, stage, startedAt: sessionStartedAt, settledFee, paidAt, exitedAt, couponId: selectedCouponId, settlement };
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
  let accountActive = false;
  function savePreferences() {
    if (accountActive) return;
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
    renderBenefits();
    if (oldScreen !== screen) window.scrollTo({ top: 0, behavior: 'instant' });
    if (screen === 'map') { ensureMap('full'); if (!nearbyLots.length && !mapRequest) loadNearby(center, areaName); }
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
      : `${escape(formatVehicle())}<br><span class="home-parking-title-status">주차 중이에요</span>`;
  }
  function renderProfile() {
    renderHomeTitle();
    $('#profile-name').textContent = preferences.name;
    $('#profile-vehicle-model').textContent = preferences.vehicleModel || '테슬라 사이버트럭';
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
  let activeBenefitId = 'welcome';
  let receiptIndex = 0;
  function couponDate(value) {
    return new Date(value).toLocaleDateString('ko-KR', { timeZone: 'Asia/Seoul', month: 'numeric', day: 'numeric' });
  }
  function couponStatus(coupon) {
    return coupon.usedAt ? '사용 완료' : coupon.expiresAt <= Date.now() ? '기간 만료' : '보유 중';
  }
  function availableCoupons() {
    return preferences.coupons.filter(c => !c.usedAt && c.expiresAt > Date.now() && (c.id !== 'welcome' || preferences.history.length === 0));
  }
  function paymentQuote() {
    return benefits.quote(currentFee(), preferences.coupons.find(c => c.id === selectedCouponId), preferences.history.length);
  }
  function renderSettlement() {
    const quote = paymentQuote();
    $('#summary-fee').textContent = `${money(quote.fee)}원`;
    $('#summary-discount').textContent = quote.discount ? `−${money(quote.discount)}원` : '0원';
    $('#summary-total').textContent = `${money(quote.total)}원`;
    const offer = benefits.catalog.find(o => o.id === quote.couponId);
    $('#payment-coupon-label').textContent = offer ? `${offer.title} · ${money(quote.discount)}원 할인` : `사용할 쿠폰 선택 · 보유 ${availableCoupons().length}장`;
    $('[data-pay-label]').textContent = quote.total ? `${money(quote.total)}원 정산하기` : '0원으로 정산 완료하기';
    $('#settled-receipt').textContent = settlement ? `${money(settlement.fee)}원 − 쿠폰 ${money(settlement.discount)}원 = ${money(settledFee)}원 정산 완료` : `${money(settledFee)}원 정산 완료`;
  }
  function renderBenefits() {
    const count = availableCoupons().length;
    $('#coupon-count').textContent = count;
    $('#benefits-count-label').textContent = `내 쿠폰 ${count}`;
    $('#profile-coupon-count').textContent = `보유 쿠폰 ${count}장`;
    $$('[data-benefit-tab]').forEach(button => button.setAttribute('aria-pressed', String(button.dataset.benefitTab === benefitTab)));
    const unavailableOffer = offer => {
      const coupon = preferences.coupons.find(c => c.id === offer.id);
      return Boolean(coupon && (coupon.usedAt || coupon.expiresAt <= Date.now()) || offer.id === 'welcome' && preferences.history.length > 0);
    };
    const offers = benefits.catalog.filter(o => benefitTab === 'available' || preferences.coupons.some(c => c.id === o.id))
      .sort((a, b) => Number(unavailableOffer(a)) - Number(unavailableOffer(b)));
    $('#benefit-list').innerHTML = offers.length ? offers.map(offer => {
      const coupon = preferences.coupons.find(c => c.id === offer.id);
      const unavailable = unavailableOffer(offer);
      const status = coupon ? couponStatus(coupon) : offer.id === 'welcome' && preferences.history.length > 0 ? '첫 이용 대상 아님' : '받을 수 있어요';
      const action = coupon ? '쿠폰 사용' : '쿠폰 받기';
      return `<article class="benefit-coupon"><div class="benefit-coupon-main"><span class="benefit-label${offer.id === 'weekend' ? ' yellow' : ''}">${escape(offer.label)} · ${status}</span><h3>${escape(offer.title)}</h3><strong>${offer.amount ? money(offer.amount) : 10}<small>${offer.amount ? '원 할인' : '% 할인'}</small></strong><p>${escape(offer.description)}</p><button class="text-button coupon-details" type="button" data-benefit-details="${offer.id}">사용 방법 보기 ›</button></div><button type="button" ${coupon ? 'data-use-coupon' : 'data-claim-coupon'}="${offer.id}" ${unavailable ? 'disabled' : ''}>${unavailable ? coupon ? couponStatus(coupon) : '대상 아님' : action}<i data-lucide="${coupon ? 'ticket-check' : 'download'}" aria-hidden="true"></i></button></article>`;
    }).join('') : '<div class="history-empty"><img src="assets/team-icons/benefits.png" alt=""><h3>아직 받은 쿠폰이 없어요</h3><p>받을 수 있는 혜택에서 쿠폰을 받아보세요.</p><button class="primary-button" type="button" data-benefit-tab="available">혜택 둘러보기</button></div>';
    icons();
  }
  function claimCoupon(id) {
    if (preferences.coupons.some(c => c.id === id)) { toast('이미 받은 쿠폰이에요. 내 쿠폰에서 확인해주세요.'); return; }
    if (id === 'welcome' && (preferences.history.length || stage === 'paid')) { toast('첫 정산 전 받을 수 있는 혜택이에요.'); return; }
    const coupon = benefits.issue(id);
    if (!coupon) return;
    preferences.coupons.push(coupon); savePreferences(); renderBenefits(); renderSettlement();
    if ($('#app-dialog').open) renderBenefitDetails($('#dialog-content'));
    toast('쿠폰을 받았어요. 정산 화면에서 선택해 사용하세요.');
  }
  function renderBenefitDetails(content) {
    const offer = benefits.catalog.find(o => o.id === activeBenefitId) || benefits.catalog[0];
    const coupon = preferences.coupons.find(c => c.id === offer.id);
    const unavailable = coupon && (coupon.usedAt || coupon.expiresAt <= Date.now()) || offer.id === 'welcome' && preferences.history.length > 0;
    content.innerHTML = `<div class="coupon-detail-intro"><img src="assets/team-icons/benefits.png" alt=""><h3>${escape(offer.title)}</h3><p>${escape(offer.description)}</p></div><ol class="benefit-steps"><li><strong>쿠폰 받기</strong><p>받은 쿠폰은 내 쿠폰에 저장돼요.</p></li><li><strong>정산 전에 쿠폰 선택</strong><p>홈의 ‘이용 중’ → 쿠폰 선택에서 사용할 쿠폰을 골라요.</p></li><li><strong>할인 금액 확인 후 정산</strong><p>최종 금액에서 할인이 빠졌는지 확인하고 정산해요. 정산 완료 시 쿠폰은 사용 처리돼요.</p></li></ol><button class="primary-button" type="button" ${coupon ? 'data-use-coupon' : 'data-claim-coupon'}="${offer.id}" ${unavailable ? 'disabled' : ''}>${unavailable ? '사용할 수 없는 혜택이에요' : coupon ? '정산 화면에서 사용하기' : '쿠폰 받기'}</button>`;
  }
  function renderCouponPicker(content) {
    const fee = currentFee();
    content.innerHTML = `<p class="dialog-description">한 번 정산할 때 쿠폰 1장을 사용할 수 있어요.<br>현재 주차요금 ${money(fee)}원 기준입니다.</p><button class="coupon-option" type="button" data-select-coupon="" aria-pressed="${!selectedCouponId}"><strong>쿠폰 사용 안 함</strong><span>할인 없이 정산</span></button>${preferences.coupons.map(coupon => {
      const offer = benefits.catalog.find(o => o.id === coupon.id);
      const reason = benefits.reason(offer, coupon, fee, preferences.history.length);
      const quote = benefits.quote(fee, coupon, preferences.history.length);
      return `<button class="coupon-option" type="button" data-select-coupon="${offer.id}" aria-pressed="${selectedCouponId === offer.id}" ${reason ? 'disabled' : ''}><strong>${escape(offer.title)}</strong><span>${reason || `${money(quote.discount)}원 할인`}</span></button>`;
    }).join('')}<button class="text-button centered" type="button" id="get-more-coupons">받을 수 있는 혜택 보러 가기</button>`;
  }
  function receiptText(item) {
    const details = item.settlement;
    return ['주차 서비스 · 시안 정산 내역', item.name, new Date(item.date).toLocaleString('ko-KR'), `차량: ${details?.vehicle || item.vehicle || '기록 없음'}`, ...(details ? [`주차요금: ${money(details.fee)}원`, `쿠폰 할인: ${money(details.discount)}원`, `정산수단: ${details.card || '기록 없음'}`] : []), `최종 정산: ${money(item.amount)}원`, '실제 결제 또는 증빙용 영수증이 아닙니다.'].join('\n');
  }
  function renderReceipt(content) {
    const item = preferences.history[receiptIndex];
    if (!item) { content.innerHTML = '<p>이용 기록을 찾지 못했어요.</p>'; return; }
    const details = item.settlement;
    content.innerHTML = `<h3 class="receipt-title">${escape(item.name)}</h3><p class="dialog-description">${new Date(item.date).toLocaleString('ko-KR')} · 이용 종료</p><div class="settlement-summary">${details ? `<div><span>차량</span><strong>${escape(details.vehicle || item.vehicle || '기록 없음')}</strong></div><div><span>주차요금</span><strong>${money(details.fee)}원</strong></div><div><span>쿠폰 할인</span><strong>−${money(details.discount)}원</strong></div><div><span>정산수단</span><strong>${escape(details.card || '기록 없음')}</strong></div>` : '<p class="dialog-description">이전 이용 기록은 최종 금액만 저장되어 있어요.</p>'}<div class="settlement-total"><span>최종 정산 금액</span><strong>${money(item.amount)}원</strong></div></div><button class="primary-button" type="button" id="download-receipt">정산 내역 저장</button><p class="fine-print">시안 내 이용 기록이며 실제 결제 증빙용 영수증이 아닙니다.</p>`;
  }
  function downloadReceipt() {
    const item = preferences.history[receiptIndex];
    if (!item) return;
    const url = URL.createObjectURL(new Blob(['\ufeff' + receiptText(item)], { type: 'text/plain;charset=utf-8' }));
    const link = document.createElement('a'); link.href = url; link.download = `주차-정산내역-${item.date.slice(0, 10)}.txt`;
    document.body.append(link); link.click(); link.remove(); setTimeout(() => URL.revokeObjectURL(url), 1000);
    toast('정산 내역을 파일로 저장했어요.');
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
    renderSettlement();
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
    renderParkingPager(lot);
    renderParkingCover(lot);
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
    $('#selected-lot-price').textContent = lot.feeType === '무료' ? '무료' : lot.basicFee && lot.basicMinutes ? `${money(Number(lot.basicFee))}원 / ${lot.basicMinutes}분` : '현장 확인';
    $('#selected-lot-address').textContent = lot.address || '등록된 주소 없음';
    $('#selected-lot-hours').textContent = lot.weekdayOpen && lot.weekdayClose ? `평일 ${lot.weekdayOpen}–${lot.weekdayClose} · 주말은 현장 확인` : '운영시간·이용 가능 여부 현장 확인';
    $('#selected-lot-status').textContent = lot.status;
    $('#selected-lot-status').classList.toggle('is-busy', lot.status === '보통');
    maps.forEach(record => record.markers.forEach((marker, index) => {
      const element = marker.getElement();
      element?.classList.toggle('is-selected', marker.parkingId === lot.id);
      element?.setAttribute('aria-pressed', String(marker.parkingId === lot.id));
    }));
    animate($('#map-selection'), [{ transform: 'translateY(3px)', opacity: .85 }, { transform: 'translateY(0)', opacity: 1 }], 220);
  }
  function renderParkingPager(lot) {
    const index=nearbyLots.findIndex(item=>item.id===lot.id);
    $('#parking-pager').hidden=index<0;
    $('#parking-rank').textContent=index===0?'가장 가까운 주차장':`${index+1}번째로 가까운 주차장`;
    $('#parking-page-count').textContent=`${index+1} / ${nearbyLots.length}`;
    $('#previous-parking').disabled=index<=0;
    $('#next-parking').disabled=index<0||index>=nearbyLots.length-1;
  }
  function renderParkingCover(lot) {
    $('.parking-cover').innerHTML=window.ParkingScenes.render(lot.id);
  }
  function browseParking(direction) {
    const index=nearbyLots.findIndex(lot=>lot.id===selectedLot.id);
    const next=nearbyLots[index+direction];if(!next)return;
    chooseLot(next);
    maps.forEach(record=>record.map.panTo([next.lat,next.lon],{animate:allowMotion(),duration:.35}));
  }
  function locationIcon() {
    return L.divIcon({className:'gps-navigation-point',html:'<svg viewBox="0 0 32 32" aria-hidden="true"><path d="M16 3 28 27 16 22 4 27Z" fill="#ffd447" stroke="#ffffff" stroke-width="2" stroke-linejoin="round"/></svg>',iconSize:[26,26],iconAnchor:[13,13]});
  }
  function renderFavoriteToggle() {
    const saved = preferences.favorites.includes(selectedLot.id);
    $('#favorite-toggle').setAttribute('aria-pressed', String(saved));
    $('#favorite-toggle-label').textContent = saved ? '즐겨찾기 저장됨' : '즐겨찾기에 저장';
  }
  function mapFailure(kind) { $(`[data-map-fallback="${kind}"]`).hidden = false; }
  function drawRoads(record, geometry) {
    record.layers.forEach(layer=>record.map.removeLayer(layer));
    const major = f => /primary|secondary|tertiary|trunk|motorway/.test(f.properties.class);
    record.layers = [
      L.geoJSON(geometry,{interactive:false,filter:f=>f.properties.kind==='park',style:{color:'#e5eee9',weight:1,fillColor:'#e5eee9',fillOpacity:.85}}).addTo(record.map),
      L.geoJSON(geometry,{interactive:false,filter:f=>f.properties.kind==='road',style:f=>({color:'#dce4ee',weight:major(f)?10:5,opacity:.9,lineCap:'round'})}).addTo(record.map),
      L.geoJSON(geometry,{interactive:false,filter:f=>f.properties.kind==='road',style:f=>({color:'#fff',weight:major(f)?7:3,opacity:1,lineCap:'round'})}).addTo(record.map)
    ];
  }
  function ensureMap(kind) {
    if (!window.L) { mapFailure(kind); return; }
    if (maps.has(kind)) { requestAnimationFrame(()=>maps.get(kind).map.invalidateSize({pan:false})); return; }
    const map=L.map($('#full-map'),{zoomControl:true,attributionControl:false,scrollWheelZoom:false,minZoom:14,maxZoom:18,maxBounds:[[32.8,123.8],[39.1,132.1]],zoomSnap:.25,zoomAnimation:allowMotion(),fadeAnimation:allowMotion()}).setView(center,15);
    const credits=L.control({position:'bottomright'});
    credits.onAdd=()=>{const box=L.DomUtil.create('div','map-source-control');box.innerHTML='<details><summary aria-label="지도 출처 보기">ⓘ</summary><span><a href="https://openfreemap.org" target="_blank" rel="noopener">OpenFreeMap</a> · © <a href="https://openmaptiles.org" target="_blank" rel="noopener">OpenMapTiles</a> · © <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener">OpenStreetMap</a></span></details>';L.DomEvent.disableClickPropagation(box);return box;};credits.addTo(map);
    const point=L.marker(gpsLocation||center,{interactive:false,keyboard:false,zIndexOffset:2000,icon:locationIcon()}).addTo(map);
    const record={map,point,markers:[],layers:[]};maps.set(kind,record);drawRoads(record,mapData.geometry);
    map.on('dragend',()=>{$('#search-this-area').hidden=false;});
    requestAnimationFrame(()=>map.invalidateSize({pan:false}));
  }
  async function loadNearby(location, label) {
    let parkingLoaded=false;
    if(!location.every(Number.isFinite)||location[0]<33||location[0]>39||location[1]<124||location[1]>132){toast('대한민국 내 지역을 선택해주세요.');return;}
    const request=++mapRequest;
    roadController?.abort(); roadController=new AbortController();
    $('#map-load-status').textContent='주변 주차장을 불러오고 있어요…';$('#search-this-area').disabled=true;
    try {
      const lots=await national.nearby(location); if(request!==mapRequest)return;
      center=location;areaName=label;nearbyLots=lots;parkingLoaded=true;lots.forEach(lot=>knownLots.set(lot.id,lot));
      $$('[data-area-label]').forEach(e=>e.textContent=areaName);
      $('#map-selection').hidden=!lots.length;$('#map-empty').hidden=!!lots.length;
      $('#map-load-status').textContent=`반경 2.5km · 등록 주차장 ${lots.length}곳 · 공영·민영 포함`;
      maps.forEach(record=>{
        record.map.setView(center,15,{animate:false});
        if(gpsLocation)record.point.setLatLng(gpsLocation);
        else record.point.setLatLng(center);
        record.markers.forEach(marker=>record.map.removeLayer(marker));
        record.markers=lots.map(lot=>{
          const marker=L.marker([lot.lat,lot.lon],{title:lot.name,alt:lot.name,icon:L.divIcon({className:'lot-pin',html:'<span class="parking-orbit"><span class="parking-core"></span></span>',iconSize:[66,66],iconAnchor:[33,33]})}).addTo(record.map);
          marker.parkingId=lot.id;marker.on('click',()=>chooseLot(lot));marker.getElement()?.setAttribute('aria-label',`${lot.name} · ${lot.category} · 약 ${lot.distance}m`);return marker;
        });
      });
      if(lots.length)chooseLot(lots[0]);
      $('#search-this-area').hidden=true;
      const key=location.map(n=>n.toFixed(2)).join(',');
      const record=maps.get('full');
      if(!record)return;
      if(mapCache.has(key)){drawRoads(record,mapCache.get(key));return;}
      // Never show Seoul's roads under a different city's parking markers.
      if(national.distance(location,DEFAULT_CENTER)>2000)drawRoads(record,{type:'FeatureCollection',features:[]});
      const response=await fetch(`/api/map?lat=${location[0].toFixed(3)}&lon=${location[1].toFixed(3)}`,{signal:roadController.signal});
      if(!response.ok)throw Error('roads');const geometry=await response.json();if(request!==mapRequest)return;
      if(!Array.isArray(geometry.features))throw Error('roads');
      mapCache.set(key,geometry);drawRoads(record,geometry);
    } catch(error) {
      if(request!==mapRequest||error.name==='AbortError')return;
      $('#map-load-status').textContent=parkingLoaded?`등록 주차장 ${nearbyLots.length}곳 · 도로 연결 지연 · 다시 조회 가능`:'데이터를 불러오지 못했어요. 다시 조회해주세요.';
      $('#search-this-area').hidden=false;
    } finally {if(request===mapRequest)$('#search-this-area').disabled=false;}
  }
  async function searchDestination(event) {
    event.preventDefault();if(busy)return;const searchForm=event.currentTarget;const query=searchForm.querySelector('input').value.trim();
    if(query.length<2){toast('지역·주소·주차장 이름을 2글자 이상 입력해주세요.');return;}
    const button=searchForm.querySelector('button');button.disabled=true;
    try {
      const matches=await national.search(query);
      if(!matches.length){toast('등록된 주차장을 찾지 못했어요. 시·구 이름이나 도로명으로 검색해주세요.');return;}
      matches.forEach(lot=>knownLots.set(lot.id,lot));
      openDialog('national-search',button);$('#dialog-title').textContent='주차장 검색 결과';
      $('#dialog-content').innerHTML=`<p class="dialog-description">‘${escape(query)}’ 검색 · 최대 12곳 표시</p><div class="dialog-list">${matches.map(lot=>`<button type="button" class="national-search-result" data-national-lot="${escape(lot.id)}"><strong>${escape(lot.name)}</strong><span>${escape(lot.category)} · ${escape(lot.address)}</span></button>`).join('')}</div>`;
    }catch{toast('전국 주차장 데이터를 불러오지 못했어요. 잠시 후 다시 시도해주세요.');}
    finally{button.disabled=false;}
  }
  async function locate() {
    if(!navigator.geolocation||!window.isSecureContext){toast('현재 위치는 HTTPS에서 이용할 수 있어요.');return;}
    $('#locate-button').disabled=true;
    try {
      const p=await new Promise((resolve,reject)=>navigator.geolocation.getCurrentPosition(resolve,reject,{timeout:12000,maximumAge:30000,enableHighAccuracy:true}));
      const location=[p.coords.latitude,p.coords.longitude];
      if(location[0]<33||location[0]>39||location[1]<124||location[1]>132){toast('대한민국 내 주차장 정보를 제공해요. 지역 검색을 이용해주세요.');return;}
      gpsLocation=location;
      maps.forEach(r=>r.point.setIcon(locationIcon()));
      await loadNearby(location,'내 위치 주변');
    } catch(error){toast(error.code===1?'위치 권한이 꺼져 있어요. 지역 검색으로도 이용할 수 있어요.':'현재 위치를 확인하지 못했어요. 지역 검색을 이용해주세요.');}
    finally{$('#locate-button').disabled=false;}
  }
  async function pay() {
    if (busy || stage !== 'active') return;
    const button = $('#pay-button'); button.disabled = true;
    try {
      await withLoading('주차요금을 정산하고 있어요', '잠시만 기다려주세요.', () => {}, 780);
      const quote = paymentQuote();
      if (selectedCouponId && !quote.couponId) {
        selectedCouponId = null; saveSession(); renderSession();
        toast('쿠폰 사용 조건이 변경됐어요. 정산 금액을 다시 확인해주세요.');
        return;
      }
      paidAt = Date.now();
      settlement = { ...quote, vehicle: formatVehicle(), card: preferences.card, paidAt };
      if (quote.couponId) preferences.coupons.find(c => c.id === quote.couponId).usedAt = paidAt;
      settledFee = quote.total; stage = 'paid'; saveSession();
      renderBenefits();
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
    preferences.history.unshift({ name: sessionLot.name, amount: settledFee, date: new Date(exitedAt).toISOString(), settlement, startedAt: sessionStartedAt, vehicle: formatVehicle() });
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
    const titles = { favorites: '즐겨찾기', 'parking-spot': '주차 위치', benefit: '혜택 이용 안내', coupons: '정산에 사용할 쿠폰', receipt: '정산 상세', vehicle: '내 차량 관리', payment: '결제수단 관리', history: '이용·결제 내역', notice: '알림', settings: '설정', nickname: '프로필 수정', help: '이용 안내', about: '앱 정보·아이콘' };
    $('#dialog-title').textContent = titles[kind] || '안내';
    if (kind === 'favorites') {
      const savedLots = preferences.favorites.map(id=>knownLots.get(id)).filter(Boolean);
      content.innerHTML = savedLots.length ? `<p class="dialog-description">자주 가는 주차장을 모아두고 바로 찾아보세요.</p><div class="favorite-list">${savedLots.map(lot => `<article class="favorite-item"><button class="favorite-open" type="button" data-open-lot="${escape(lot.id)}"><img src="assets/team-icons/nearby.png" alt=""><span><strong>${escape(lot.name)}</strong><small>${escape(lot.category || '주차장')} · 지도에서 보기</small></span></button><button class="favorite-remove" type="button" data-remove-favorite="${escape(lot.id)}" aria-label="${escape(lot.name)} 즐겨찾기 해제">해제</button></article>`).join('')}</div><p class="fine-print">즐겨찾기는 이 브라우저에 저장돼요.</p>` : '<div class="history-empty"><img src="assets/team-icons/favorite.png" alt=""><h3>자주 가는 주차장을 저장해보세요</h3><p>주차장 정보에서 즐겨찾기를 누르면<br>이곳에서 바로 확인할 수 있어요.</p><button class="primary-button favorite-find" type="button" id="find-favorite-parking">주변 주차장 보기</button></div>';
    }
    if (kind === 'parking-spot') {
      const spot = preferences.parkingSpot;
      content.innerHTML = `<p class="dialog-description">내 차를 찾기 쉽게 층·구역·기둥 번호를 기록해요.<br>직접 남기는 메모이며 자동 위치 추적은 하지 않아요.</p><form id="parking-spot-form"><div class="spot-fields"><label class="field-label">층<input class="field-input" name="floor" placeholder="예: B2" maxlength="20" value="${escape(spot.floor)}"></label><label class="field-label">구역<input class="field-input" name="zone" placeholder="예: C구역" maxlength="20" value="${escape(spot.zone)}"></label></div><label class="field-label">기둥 번호<input class="field-input" name="pillar" placeholder="예: 12번 기둥" maxlength="20" value="${escape(spot.pillar)}"></label><label class="field-label">추가 메모<textarea class="field-input spot-note" name="note" placeholder="예: 엘리베이터 오른쪽" maxlength="120" rows="3">${escape(spot.note)}</textarea></label><button class="primary-button" type="submit">주차 위치 저장하기</button><button class="text-button centered" id="clear-parking-spot" type="button">메모 비우기</button></form><p class="fine-print">이 브라우저에 저장되며 출차 후에도 직접 지우기 전까지 유지돼요.</p>`;
    }
    if (kind === 'vehicle') content.innerHTML = `<p class="dialog-description">주차요금 확인에 사용할 차량을 등록해요.</p><form id="vehicle-form"><label class="field-label" for="vehicle-input">차량 번호<input class="field-input" id="vehicle-input" autocomplete="off" value="${escape(formatVehicle())}" maxlength="12" required></label><p class="field-error" role="alert" id="vehicle-error" hidden>차량 번호를 확인해주세요. 예: 12가 3456</p><button class="primary-button" type="submit">차량 저장하기</button></form><p class="fine-print">차량 번호는 이 브라우저에 저장됩니다.</p>`;
    if (kind === 'nickname') content.innerHTML = `<form id="nickname-form"><label class="field-label" for="nickname-input">닉네임<input class="field-input" id="nickname-input" value="${escape(preferences.name)}" maxlength="12" required></label><button class="primary-button" type="submit">프로필 저장하기</button></form>`;
    if (kind === 'payment') content.innerHTML = `<p class="dialog-description">정산에 사용할 결제수단을 선택해주세요.</p><form id="card-form">${CARD_NAMES.map((name, index) => `<label class="choice-row"><input type="radio" name="demo-card" value="${index}" ${preferences.card === name ? 'checked' : ''}><span>${name}<small>등록된 결제수단</small></span></label>`).join('')}<button class="primary-button" type="submit">선택한 카드로 설정</button></form>`;

    if (kind === 'history') content.innerHTML = preferences.history.length ? `<p class="dialog-description">이용 기록을 눌러 할인과 정산 상세를 확인하세요.</p><div class="dialog-list">${preferences.history.map((item, index) => `<button type="button" class="history-receipt" data-receipt="${index}"><span><strong>${escape(item.name)}</strong><small>${new Date(item.date).toLocaleDateString('ko-KR')} · 이용 종료</small></span><span><strong>${money(item.amount)}원</strong><small>정산 상세 ›</small></span></button>`).join('')}</div>` : '<div class="history-empty"><img src="assets/ui-icons/history.svg" alt=""><h3>아직 이용 내역이 없어요</h3><p>주차 이용을 마치면<br>여기에서 다시 확인할 수 있어요.</p><button class="primary-button" type="button" id="find-favorite-parking">주변 주차장 보기</button></div>';
    if (kind === 'notice') content.innerHTML = `<div class="notice-item"><img src="assets/ui-icons/bell.svg" alt=""><div><h3>${stage === 'paid' ? '출차 준비가 끝났어요' : '쿼카와 편안하게 주차해요'}</h3><p>${stage === 'paid' ? '이용 현황에서 출차 가능 시간을 확인해주세요.' : '주변 주차장을 선택하고 이용 정보를 확인하세요.'}</p></div></div><p class="fine-print">주차 및 정산 관련 안내를 확인하세요.</p>`;
    if (kind === 'settings') content.innerHTML = `<form id="settings-form"><label class="toggle-row">캐릭터·아이콘 모션<input type="checkbox" name="motion" ${preferences.motion ? 'checked' : ''}></label><label class="toggle-row">앱 내 안내 표시<input type="checkbox" name="notifications" ${preferences.notifications ? 'checked' : ''}></label><p class="dialog-description">휴대폰에서 ‘동작 줄이기’를 사용하면 모션은 자동으로 생략돼요.</p><button class="primary-button" type="submit">설정 저장하기</button></form><button class="text-button centered" type="button" data-preview-exit>${window.ParkingAccount?.signedIn ? '로그아웃' : '시작 화면으로'}</button>`;
    if (kind === 'help') content.innerHTML = '<div class="help-list"><div><span><strong>주변 주차장 위치 확인</strong><p>지도에서 원형 표시를 눌러 주차장을 골라요. 전국 공영·민영 주차장을 지역·주소로 검색하거나 현재 위치 주변에서 찾아보세요.</p></span></div><div><span><strong>현장 방식으로 입차·주차</strong><p>앱에서 QR을 찍을 필요가 없어요. 등록된 차량이 입차하면 이용 현황이 자동으로 연결돼요.</p></span></div><div><span><strong>출차 전에 앱에서 정산</strong><p>이용 현황에서 주차요금을 확인하고 정산해요.</p></span></div><div><span><strong>출차 확인</strong><p>실제 서비스의 출차 확인은 제휴 시스템 연동이 필요해요. 현재 시안에서는 정산 후 ‘출차하기’를 누르면 이용이 종료돼요.</p></span></div></div>';
    if (kind === 'about') content.innerHTML = '<div class="about-content"><img class="about-icon" src="assets/app-icons/icon-192.png" alt="쿼카와 P로 만든 앱 아이콘"><h3>주차 서비스</h3><p>쿼카와 함께, 편안한 주차의 시작.<br>모바일 프로토타입 v0.2<br>앱 이름과 아이콘은 팀 검토용입니다.</p><a href="assets/app-icons/icon-512.png" download="parking-app-icon.png">앱 아이콘 원본 저장</a></div><p class="fine-print">지도: <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener">OpenStreetMap</a> · 라이브러리: Leaflet, Lucide<br>실제 결제·제휴 시스템·실시간 자리 정보는 연결되지 않습니다.<br>홈 진입 약 10초 후 입차 이벤트를 한 번 보여주고, 정산 후 출차하기 버튼으로 이용을 종료합니다. 위치 확인이나 길찾기로 입차가 확정되지는 않습니다.</p>';
    if (kind === 'notice' && !preferences.notifications) content.innerHTML = '<p class="dialog-description">앱 내 안내 표시가 꺼져 있어요. 마이페이지 설정에서 변경할 수 있습니다.</p>';
    if (kind === 'benefit') renderBenefitDetails(content);
    if (kind === 'coupons') renderCouponPicker(content);
    if (kind === 'receipt') renderReceipt(content);
    icons();
    if (!dialog.open) dialog.showModal();
    else $('#close-dialog').focus();
  }
  function receiveEntry(lot, entryTime) {
    if (stage !== 'exited') return;
    selectedCouponId = null; settlement = null;
    sessionLot = lot; sessionStartedAt = entryTime; settledFee = 0; paidAt = 0; exitedAt = 0; stage = 'active';
    saveSession(); renderSession();
    $('#entry-notice-detail').textContent = `${lot.name} · ${formatVehicle()}`;
    $('#entry-notice').hidden = !preferences.notifications;
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
    if (button.hasAttribute('data-preview-exit')) { closeDialog(); root.dispatchEvent(new Event('parking-account-exit')); return; }
    if(button.id==='previous-parking'){browseParking(-1);return;}
    if(button.id==='next-parking'){browseParking(1);return;}
    if(button.id==='search-this-area'){const p=maps.get('full')?.map.getCenter();if(p)loadNearby([p.lat,p.lng],'지도 중심 주변');return;}
    if(button.dataset.nationalLot){const lot=knownLots.get(button.dataset.nationalLot);if(lot){closeDialog();show('map');loadNearby([lot.lat,lot.lon],lot.name).then(()=>{if(nearbyLots.some(item=>item.id===lot.id))chooseLot({...lot,distance:0});});}return;}
    if (button.dataset.benefitTab) { benefitTab = button.dataset.benefitTab; renderBenefits(); return; }
    if (button.hasAttribute('data-open-wallet')) { benefitTab = 'wallet'; show('benefits'); return; }
    if (button.dataset.benefitDetails) { activeBenefitId = button.dataset.benefitDetails; openDialog('benefit', button); return; }
    if (button.dataset.claimCoupon) { claimCoupon(button.dataset.claimCoupon); return; }
    if (button.dataset.useCoupon) {
      if (stage !== 'active') { if ($('#app-dialog').open) closeDialog(); show('home'); toast('입차 후 이용 중 화면에서 쿠폰을 적용할 수 있어요.'); return; }
      if ($('#app-dialog').open) closeDialog(); show('payment'); openDialog('coupons', $('#payment-coupon-button')); return;
    }
    if (button.id === 'payment-coupon-button' || button.id === 'open-payment-coupons') { openDialog('coupons', button); return; }
    if (button.hasAttribute('data-select-coupon')) {
      const id = button.dataset.selectCoupon;
      const coupon = preferences.coupons.find(c => c.id === id);
      if (id && !benefits.quote(currentFee(), coupon, preferences.history.length).couponId) { toast('사용 조건을 다시 확인해주세요.'); openDialog('coupons', dialogOpener); return; }
      selectedCouponId = id || null; saveSession(); renderSession(); closeDialog(); toast(id ? '쿠폰 할인을 적용했어요.' : '쿠폰 적용을 해제했어요.'); return;
    }
    if (button.id === 'get-more-coupons') { closeDialog(); benefitTab = 'available'; show('benefits'); return; }
    if (button.hasAttribute('data-receipt')) { receiptIndex = Number(button.dataset.receipt); openDialog('receipt', button); return; }
    if (button.id === 'download-receipt') { downloadReceipt(); return; }
    if (button.id === 'favorite-toggle') {
      const saved = preferences.favorites.includes(selectedLot.id);
      preferences.favorites = saved ? preferences.favorites.filter(id => id !== selectedLot.id) : [...preferences.favorites, selectedLot.id];
      preferences.savedLots=preferences.favorites.map(id=>knownLots.get(id)).filter(Boolean);
      savePreferences(); renderFavoriteToggle(); renderProfile(); toast(saved ? '즐겨찾기를 해제했어요.' : '즐겨찾기에 저장했어요.'); return;
    }
    if (button.dataset.removeFavorite) {
      preferences.favorites = preferences.favorites.filter(id => String(id) !== button.dataset.removeFavorite);
      savePreferences(); renderFavoriteToggle(); renderProfile(); openDialog('favorites', dialogOpener); toast('즐겨찾기를 해제했어요.'); return;
    }
    if (button.dataset.openLot) {
      const lot = knownLots.get(button.dataset.openLot);
      if (lot) { closeDialog(); show('map'); loadNearby([lot.lat,lot.lon],lot.name).then(()=>{if(nearbyLots.some(item=>item.id===lot.id))chooseLot({...lot,distance:0});}); } return;
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
  $('#map-location-search').addEventListener('submit', searchDestination);
  $('#map-location-edit').addEventListener('click', () => {
    const form = $('#map-location-search'); form.hidden = !form.hidden;
    $('#map-location-edit').setAttribute('aria-expanded', String(!form.hidden));
    if (!form.hidden) $('#map-location-input').focus();
  });
  $('#map-location-input').addEventListener('keydown', event => {
    if (event.key === 'Escape') { $('#map-location-search').hidden = true; $('#map-location-edit').setAttribute('aria-expanded','false'); $('#map-location-edit').focus(); }
  });
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
  $('#app-dialog').addEventListener('cancel', event => { event.preventDefault(); closeDialog(); });
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
  root.addEventListener('parking-account-change', event => {
    clearTimeout(entrySimulationTimer); clearTimeout(entryNoticeTimer);
    accountActive = !!event.detail;
    const fresh = accountActive ? { savedLots: [], coupons: [], name: event.detail.name, vehicle: event.detail.plate, vehicleModel: [event.detail.vehicle_brand, event.detail.vehicle_model].filter(Boolean).join(' '), card: CARD_NAMES[0], motion: true, notifications: true, favorites: [], parkingSpot: { floor: '', zone: '', pillar: '', note: '' }, history: [] } : readStored();
    Object.keys(preferences).forEach(key => delete preferences[key]); Object.assign(preferences, fresh);
    stage = 'exited'; sessionStartedAt = 0; settledFee = 0; paidAt = 0; exitedAt = 0; settlement = null; selectedCouponId = null;
    knownLots.clear(); [...LOTS, ...preferences.savedLots].forEach(lot => knownLots.set(lot.id, lot));
    renderProfile(); renderSession(); renderBenefits();
  });
  root.addEventListener('parking-preview-enter', () => { show('home'); requestAnimationFrame(playWelcome); });
  if ($('.home-quokka').complete) requestAnimationFrame(playWelcome);
  else $('.home-quokka').addEventListener('load', playWelcome, { once: true });
})();
