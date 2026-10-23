// Adapted from the onboarding reference supplied by the user:
// https://parking-onboarding-preview.breezywolf3.chatgpt.site/
(() => {
  'use strict';
  const app = document.getElementById('parking-app');
  const root = document.getElementById('parking-first-visit');
  const $ = selector => root.querySelector(selector);
  const slides = [...root.querySelectorAll('[data-page]')];
  const dots = [...root.querySelectorAll('.pv-dot')];
  const ACCESS_KEY = 'parking-preview-access-v1';
  const SEEN_KEY = 'parking-onboarding-seen-v1';
  const read = (storage, key) => { try { return storage.getItem(key); } catch { return null; } };
  let slideTimer;
  const scheduleSlides = () => {
    clearTimeout(slideTimer);
    if (view !== 'intro' || !app.classList.contains('is-welcome') || document.hidden) return;
    slideTimer = setTimeout(() => { page = (page + 1) % slides.length; render(); }, page === 0 ? 6500 : 4500);
  };
  let page = 0;
  let view = read(localStorage, SEEN_KEY) ? 'auth' : 'intro';
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
    $('#pv-next').textContent = '시작하기';
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
    try { sessionStorage.setItem(ACCESS_KEY, 'preview'); } catch { /* Current page still works without storage. */ }
    app.classList.remove('is-welcome');
    document.getElementById('app-main').inert = false;
    app.querySelector('.bottom-nav').inert = false;
    app.dispatchEvent(new Event('parking-preview-enter'));
    window.scrollTo({ top: 0, behavior: 'instant' });
  };
  $('#pv-next').addEventListener('click', () => {
    view = 'auth';
    try { localStorage.setItem(SEEN_KEY, 'seen'); } catch { /* Optional preference. */ }
    render();
  });
  $('#pv-prev').addEventListener('click', () => { page = Math.max(0, page - 1); render(); });
  $('#pv-auth-back').addEventListener('click', () => { view = 'intro'; page = 3; render(); });
  $('#pv-review').addEventListener('click', () => { view = 'intro'; page = 0; render(); });
  $('#pv-connection-back').addEventListener('click', () => { view = 'auth'; render(); });
  root.querySelectorAll('[data-auth]').forEach(button => button.addEventListener('click', () => {
    const signup = button.dataset.auth === 'signup';
    $('#pv-connection-label').textContent = signup ? '회원가입' : '로그인';
    $('#pv-connection-title').innerHTML = signup ? '회원가입 연결을<br>준비하고 있어요' : '로그인 연결을<br>준비하고 있어요';
    view = 'connection'; render();
  }));
  root.querySelectorAll('[data-preview-enter]').forEach(button => button.addEventListener('click', enterPreview));
  app.querySelector('[data-preview-exit]').addEventListener('click', () => {
    try { sessionStorage.removeItem(ACCESS_KEY); } catch { /* Return works without storage. */ }
    view = 'auth'; gate();
  });
  document.addEventListener('visibilitychange', scheduleSlides);
  if (read(sessionStorage, ACCESS_KEY) === 'preview') enterPreview(); else gate();
})();
