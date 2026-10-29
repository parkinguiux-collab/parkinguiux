/* Shared coupon rules for browser interactions and deterministic verification. */
(function (scope) {
  'use strict';
  const DAY = 86400000;
  const catalog = [
    { id: 'welcome', title: '첫 주차를 가볍게', label: '첫 이용 혜택', amount: 2000, minimum: 2000, description: '첫 정산 시 2,000원 할인', conditions: '2,000원 이상 첫 정산에 사용 · 발급 후 7일 · 다른 쿠폰과 중복 사용 불가' },
    { id: 'weekend', title: '주말에도 편안한 주차', label: '주말 혜택', rate: .1, maximum: 3000, minimum: 1000, description: '주말 정산 시 10% 할인, 최대 3,000원', conditions: '토·일요일 1,000원 이상 정산에 사용 · 최대 3,000원 · 발급 후 7일 · 중복 사용 불가' }
  ];
  function reason(offer, coupon, fee, completedCount, now = Date.now()) {
    if (!coupon) return '쿠폰을 먼저 받아주세요';
    if (coupon.usedAt) return '이미 사용한 쿠폰이에요';
    if (coupon.expiresAt <= now) return '사용 기간이 지났어요';
    if (offer.id === 'welcome' && completedCount > 0) return '첫 정산에만 사용할 수 있어요';
    if (offer.id === 'weekend' && !['Sat', 'Sun'].includes(new Intl.DateTimeFormat('en-US', { timeZone: 'Asia/Seoul', weekday: 'short' }).format(now))) return '토·일요일에 사용할 수 있어요';
    if (fee < offer.minimum) return `${offer.minimum.toLocaleString('ko-KR')}원 이상 정산 시 사용할 수 있어요`;
    return '';
  }
  function quote(fee, coupon, completedCount, now = Date.now()) {
    const offer = catalog.find(item => item.id === coupon?.id);
    if (!offer || reason(offer, coupon, fee, completedCount, now)) return { fee, discount: 0, total: fee, couponId: null };
    const discount = Math.min(fee, offer.amount || Math.min(offer.maximum, Math.floor(fee * offer.rate)));
    return { fee, discount, total: fee - discount, couponId: offer.id };
  }
  function issue(id, now = Date.now()) {
    if (!catalog.some(item => item.id === id)) return null;
    return { id, issuedAt: now, expiresAt: now + 7 * DAY, usedAt: 0 };
  }
  const api = { catalog, reason, quote, issue };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else scope.ParkingBenefits = api;
})(typeof window !== 'undefined' ? window : globalThis);
