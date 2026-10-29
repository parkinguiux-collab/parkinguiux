const { test } = require('node:test');
const assert = require('node:assert/strict');
const benefits = require('../assets/benefits.js');
const saturday = Date.parse('2026-10-31T12:00:00+09:00');
const thursday = Date.parse('2026-10-29T12:00:00+09:00');
test('welcome discount applies to first qualifying settlement and never below zero', () => {
  const c = benefits.issue('welcome', thursday);
  assert.deepEqual(benefits.quote(2000, c, 0, thursday), { fee: 2000, discount: 2000, total: 0, couponId: 'welcome' });
  assert.equal(benefits.quote(8000, c, 0, thursday).total, 6000);
  assert.equal(benefits.quote(1000, c, 0, thursday).discount, 0);
  assert.equal(benefits.quote(2000, c, 1, thursday).discount, 0);
});
test('used, expired and missing coupons cannot reduce settlement', () => {
  const c = benefits.issue('welcome', thursday);
  assert.equal(benefits.quote(4000, { ...c, usedAt: thursday }, 0, thursday).discount, 0);
  assert.equal(benefits.quote(4000, c, 0, c.expiresAt).discount, 0);
  assert.equal(benefits.quote(4000, undefined, 0, thursday).total, 4000);
});
test('weekend discount uses Korea time, minimum amount, rounding and cap', () => {
  const c = benefits.issue('weekend', thursday);
  assert.equal(benefits.quote(4000, c, 1, thursday).discount, 0);
  assert.equal(benefits.quote(4000, c, 1, saturday).discount, 400);
  assert.equal(benefits.quote(50000, c, 1, saturday).discount, 3000);
  assert.equal(benefits.quote(999, c, 1, saturday).discount, 0);
  assert.equal(benefits.quote(1999, c, 1, saturday).discount, 199);
  const fridayUtcSaturdayKorea = Date.parse('2026-10-30T15:00:00Z');
  assert.equal(benefits.quote(4000, c, 1, fridayUtcSaturdayKorea).discount, 400);
});
