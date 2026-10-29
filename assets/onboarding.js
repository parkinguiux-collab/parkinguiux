// Adapted from the onboarding reference supplied by the user:
// https://parking-onboarding-preview.breezywolf3.chatgpt.site/
(() => {
  'use strict';
  const app = document.getElementById('parking-app');
  const root = document.getElementById('parking-first-visit');
  const $ = selector => root.querySelector(selector);
  const slides = [...root.querySelectorAll('[data-page]')];
  const dots = [...root.querySelectorAll('.pv-dot')];
  let slideTimer;
  const scheduleSlides = () => {
    clearTimeout(slideTimer);
    if (view !== 'intro' || !app.classList.contains('is-welcome') || document.hidden || page === slides.length - 1) return;
    slideTimer = setTimeout(() => { page += 1; render(); }, 4500);
  };
  let page = 0;
  let view = 'intro';
  const render = () => {
    const intro = view === 'intro';
    $('#pv-onboarding').hidden = !intro;
    $('#pv-background').hidden = !intro;
    $('#pv-auth').hidden = view !== 'auth';
    $('#pv-auth-connection').hidden = view !== 'connection';
    slides.forEach((slide, index) => { slide.hidden = index !== page; });
    dots.forEach((dot, index) => { if (index === page) dot.setAttribute('aria-current', 'step'); else dot.removeAttribute('aria-current'); });
    $('.pv-dots').setAttribute('aria-label', `안내 4장 중 ${page + 1}번째`);
    $('.pv-dialog').setAttribute('aria-labelledby', `pv-title-${page}`);
    $('#pv-count').textContent = `${page + 1} / 4`;
    $('#pv-prev').disabled = page === 0;
    $('#pv-slide-next').disabled = page === slides.length - 1;
    $('#pv-next').textContent = page === slides.length - 1 ? '시작하기' : '다음';
    scheduleSlides();
  };
  const gate = () => {
    app.classList.add('is-welcome');
    document.getElementById('app-main').inert = true;
    app.querySelector('.bottom-nav').inert = true;
    render();
    window.scrollTo({ top: 0, behavior: 'instant' });
  };
  const enterPreview = () => {
    clearTimeout(slideTimer);
    app.classList.remove('is-welcome');
    document.getElementById('app-main').inert = false;
    app.querySelector('.bottom-nav').inert = false;
    app.dispatchEvent(new Event('parking-preview-enter'));
    window.scrollTo({ top: 0, behavior: 'instant' });
  };
  $('#pv-next').addEventListener('click', () => {
    if (page < slides.length - 1) {
      page += 1;
      render();
      return;
    }
    view = 'auth';
    render();
  });
  $('#pv-slide-next').addEventListener('click', () => { page = Math.min(slides.length - 1, page + 1); render(); });
  $('#pv-prev').addEventListener('click', () => { page = Math.max(0, page - 1); render(); });
  $('#pv-auth-back').addEventListener('click', () => { view = 'intro'; page = 3; render(); });
  $('#pv-review').addEventListener('click', () => { view = 'intro'; page = 0; render(); });
  $('#pv-connection-back').addEventListener('click', () => { if (window.ParkingAccount.pending) return; if (window.ParkingAccount.editing) { enterPreview(); return; } view = 'auth'; render(); });
  root.querySelectorAll('[data-auth]').forEach(button => button.addEventListener('click', () => {
    view = 'connection'; render();
    window.ParkingAccount.open(button.dataset.auth);
  }));
  root.querySelectorAll('[data-preview-enter]').forEach(button => button.addEventListener('click', enterPreview));
  app.addEventListener('parking-account-enter', enterPreview);
  app.addEventListener('parking-account-edit', () => { view = 'connection'; gate(); });
  app.querySelector('[data-preview-exit]').addEventListener('click', async () => {
    try { if (window.ParkingAccount.signedIn) await window.ParkingAccount.logout(); view = 'auth'; gate(); }
    catch { const toast = document.getElementById('toast'); toast.textContent = '로그아웃하지 못했어요. 다시 시도해 주세요.'; toast.hidden = false; }
  });
  document.addEventListener('visibilitychange', scheduleSlides);
  const callback = new URL(window.location.href);
  const authCode = callback.searchParams.get('code');
  const authError = callback.searchParams.get('error_description');
  if (authCode || authError) {
    callback.searchParams.delete('code'); callback.searchParams.delete('error'); callback.searchParams.delete('error_code'); callback.searchParams.delete('error_description');
    history.replaceState(null, '', callback.pathname + callback.search + callback.hash);
    view = 'connection'; gate();
    if (authCode) window.ParkingAccount.resume(authCode);
    else { window.ParkingAccount.open('login'); document.getElementById('account-message').textContent = '인증 링크가 만료됐어요. 새 인증메일을 요청해 주세요.'; }
  } else gate();
})();
