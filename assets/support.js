(() => {
  'use strict';
  const root = document.getElementById('parking-app');
  const launcher = document.getElementById('support-launcher');
  const panel = document.getElementById('support-dialog');
  const log = document.getElementById('support-log');
  const input = document.getElementById('support-input');
  let started = false;
  let topic = '', lastQuestion = '';
  const topics = [
    ['정산 버튼을 눌러도 정산이 되지 않아요', 'payment'],
    ['주차금액이 추가로 결제됐어요', 'extra'],
    ['쿠폰이 적용되지 않아요', 'coupon'],
    ['정산했는데 출차가 안 돼요', 'exit']
  ];
  function add(text, user = false) {
    const item = document.createElement('div'); item.className = user ? 'support-message is-user' : 'support-message';
    const p = document.createElement('p'); p.textContent = text; item.append(p); log.append(item);
    while (log.children.length > 60) log.firstElementChild.remove();
    log.scrollTop = log.scrollHeight;
  }
  function options(items) {
    const group = document.createElement('div'); group.className = 'support-options';
    items.forEach(([label, action]) => {const button = document.createElement('button'); button.type = 'button'; button.textContent = label; button.dataset.supportAction = action; group.append(button);});
    log.append(group); log.scrollTop = log.scrollHeight;
  }
  const finish = () => options([['도움이 됐어요', 'resolved'], ['아직 해결되지 않았어요', 'unresolved'], ['다른 문의 보기', 'topics']]);
  function welcome() { add('안녕하세요! 주차 도우미 쿼카예요.\n어떤 점이 불편하신가요?\n아래에서 선택하거나 짧게 적어주세요.'); options(topics); }
  function answer(action) {
    if (action === 'topics') { add('어떤 도움이 필요하세요?'); options(topics); return; }
    if (action === 'payment') {
      topic = '정산 오류'; add('먼저 결제 내역을 확인해 주세요. 승인 내역이 있다면 중복 결제를 막기 위해 정산 버튼을 다시 누르지 마세요.\n카드 승인 또는 앱 이용 기록이 있나요?');
      options([['이용·결제 내역 확인', 'history'], ['승인 내역이 있어요', 'approved'], ['승인 내역이 없어요', 'not-approved'], ['잘 모르겠어요', 'unknown-payment']]); return;
    }
    if (action === 'approved') { add('카드 승인은 됐지만 앱에 반영이 늦을 수 있어요. 잠시 후 이용 현황을 확인하고, 계속 정산 전으로 보이면 주차장 관리자에게 승인 시각과 금액을 알려 확인해 주세요.\n추가 결제는 먼저 하지 않는 것이 좋아요.'); options([['홈에서 이용 현황 확인', 'home']]); finish(); return; }
    if (action === 'not-approved') { add('인터넷 연결과 선택한 결제수단을 확인해 주세요. 승인 내역이 없는 것을 확인했다면 이용 현황에서 다시 정산할 수 있어요. 같은 오류가 반복되면 화면에 나온 오류 문구를 남겨주세요.'); options([['홈으로 이동', 'home'], ['문의 내용 정리', 'summary']]); return; }
    if (action === 'unknown-payment') { add('앱 이용 기록과 카드사 앱의 승인 내역을 함께 확인해 주세요. 승인 여부가 불분명하면 반복 결제보다 주차장 관리자에게 먼저 확인하는 것이 좋아요.'); options([['이용·결제 내역 확인', 'history']]); finish(); return; }
    if (action === 'extra') {
      topic = '추가 결제'; add('추가된 금액을 함께 확인해볼게요. 어떤 상황인가요?');
      options([['같은 금액이 두 번 결제됐어요', 'duplicate'], ['정산 후 출차가 늦었어요', 'late-exit'], ['금액이 예상과 달라요', 'unexpected'], ['이용·결제 내역 확인', 'history']]); return;
    }
    if (action === 'duplicate') { add('카드사 앱에서 두 건 모두 실제 승인인지, 한 건은 취소 또는 승인 대기인지 확인해 주세요. 모두 승인 상태라면 두 건의 시각과 금액을 정리해 주차장 관리자 또는 결제 고객센터에 중복 승인 확인을 요청해 주세요.\n이 채팅에서는 승인 취소나 환불을 직접 처리할 수 없어요.'); options([['이용·결제 내역 확인', 'history'], ['문의 내용 정리', 'summary']]); return; }
    if (action === 'late-exit') { add('앱의 출차 안내 시간은 정산 후 3분이에요. 안내 시간을 넘긴 경우에는 주차장 요금 기준에 따라 추가 요금이 생길 수 있어요.\n출차가 이미 완료됐다면 추가 결제를 반복하지 말고 출차 시각과 승인 내역을 관리자에게 확인해 주세요.'); finish(); return; }
    if (action === 'unexpected') { add('이용 기록의 주차 시간, 기본 요금, 쿠폰 할인 금액을 확인해 주세요. 카드 승인 금액과 앱 정산 금액이 다르거나 출차 후 추가 승인이 생겼다면 주차장 관리자에게 확인을 요청해 주세요.'); options([['이용·결제 내역 확인', 'history'], ['문의 내용 정리', 'summary']]); return; }
    if (action === 'coupon') { topic = '쿠폰 적용'; add('혜택에서 쿠폰이 발급완료 상태인지 확인한 다음, 이용 현황의 쿠폰 선택에서 사용할 쿠폰을 골라주세요. 할인 금액이 표시되면 적용된 상태예요.\n첫 이용 여부, 평일 여부, 최소 정산 금액에 따라 적용이 달라지고, 이미 사용했거나 만료된 쿠폰은 적용되지 않아요.'); options([['혜택에서 쿠폰 확인', 'benefits']]); finish(); return; }
    if (action === 'exit') { topic = '출차 문제'; add('홈에서 정산 완료 상태를 확인해 주세요. 정산 후 3분 안에 출차 안내를 따라주세요. 차단기가 열리지 않으면 현장의 호출 버튼으로 관리자에게 차량 번호와 정산 내역을 알려주세요.\n이 시안에서는 출차하기 버튼으로 이용을 마칠 수 있어요.'); options([['홈에서 출차 상태 확인', 'home']]); finish(); return; }
    if (action === 'resolved') { add('도움이 되어서 기뻐요! 안전하게 이동하세요.'); options([['다른 문의 보기', 'topics']]); return; }
    if (action === 'unresolved' || action === 'summary') { add('문의 내용을 기기에 저장해 상담할 때 참고할 수 있어요. 실제 고객센터에 접수되거나 전송되지는 않아요.\n주차장 이름, 발생 시각, 승인 금액, 오류 문구를 함께 준비해 주세요. 비밀번호나 카드 전체 번호는 적지 마세요.'); options([['문의 내용 파일로 저장', 'download'], ['다른 문의 보기', 'topics']]); return; }
    if (action === 'download') {
      const report = ['주차 서비스 문의 메모', `문의 유형: ${topic || '일반 문의'}`, `문의 내용: ${lastQuestion || topic || '상담 필요'}`, '', '주차장 이름:', '발생 시각:', '승인 금액:', '오류 문구:', '', '개인 참고용 메모이며 고객센터에 접수되지 않았습니다.'].join('\n');
      const url = URL.createObjectURL(new Blob([report], {type:'text/plain;charset=utf-8'}));
      const a = document.createElement('a'); a.href = url; a.download = '주차-문의-메모.txt'; a.click(); setTimeout(() => URL.revokeObjectURL(url), 1000);
      add('문의 메모 파일을 준비했어요. 다운로드한 내용을 상담할 때 참고해 주세요.'); return;
    }
    if (['history','home','benefits'].includes(action)) {
      close();
      const target = action === 'history' ? root.querySelector('[data-dialog="history"]') : root.querySelector(`[data-screen="${action}"]`);
      target?.click(); return;
    }
    add('조금 더 구체적으로 알려주세요. 아래 항목에서 골라주셔도 돼요.'); options(topics);
  }
  function close() { panel.close(); launcher.setAttribute('aria-expanded','false'); launcher.focus({preventScroll:true}); }
  launcher.addEventListener('click', () => { if (!started) {welcome(); started = true;} panel.showModal(); launcher.setAttribute('aria-expanded','true'); log.scrollTop = log.scrollHeight; });
  document.getElementById('support-open-footer').addEventListener('click', () => launcher.click());
  document.getElementById('support-close').addEventListener('click', close);
  panel.addEventListener('cancel', event => {event.preventDefault(); close();});
  document.getElementById('support-restart').addEventListener('click', () => {log.replaceChildren(); topic = ''; lastQuestion = ''; welcome();});
  log.addEventListener('click', event => {const button = event.target.closest('[data-support-action]'); if (!button) return; add(button.textContent, true); answer(button.dataset.supportAction);});
  document.getElementById('support-form').addEventListener('submit', event => {
    event.preventDefault(); const text = input.value.trim(); if (!text) return; input.value = ''; lastQuestion = text; add(text, true);
    const action = /추가|두 번|두번|중복|더 결제/.test(text) ? 'extra' : /쿠폰|할인/.test(text) ? 'coupon' : /출차|차단기/.test(text) ? 'exit' : /정산|결제|승인/.test(text) ? 'payment' : /문의|상담원|상담/.test(text) ? 'summary' : 'fallback';
    answer(action);
  });
})();
