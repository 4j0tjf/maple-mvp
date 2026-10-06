const { test } = require('node:test');
const assert = require('node:assert/strict');
const { solve, prepareSales, listingPrice } = require('../optimizer');

const settings = { saleDays: 7, sellShare: .1, tierWidth: .02, tierDrop: .2 };
const item = (extra = {}) => ({ name: 'A', c: 10, m: 100, cap: Infinity, earn: false, sellable: 100, ...extra });
const plan = (items, creditItems = [], declining = true) => solve({
  cash: 1000, credit: 100, earn: 0,
  items: prepareSales(items, settings, declining), creditItems: prepareSales(creditItems, settings, declining),
});
const total = markets => markets.reduce((sum, m) => sum + m.tiers.reduce((n, t) => n + t.count * t.m, 0), 0);

test('판매 현실 반영은 구성품별 구간 수량과 개당 단가를 내보낸다', () => {
  // 캐시·크레딧 두 경로가 같은 시장을 쓴다. 2개씩 100, 80, 60, 40, 20.
  const result = plan([item({ cap: 5 })], [item({ c: 0, k: 10, cap: 5 })]);
  assert.deepEqual(result.markets, [{ key: 'A', sold: 10, tiers: [
    { count: 2, m: 100 }, { count: 2, m: 80 }, { count: 2, m: 60 }, { count: 2, m: 40 }, { count: 2, m: 20 },
  ] }]);
  assert.equal(total(result.markets), result.meso);
});

test('단가를 낮추지 않는 계산은 한 가격으로 묶는다', () => {
  const result = plan([item()], [], false);
  assert.deepEqual(result.markets, [{ key: 'A', sold: 10, tiers: [{ count: 10, m: 100 }] }]);
});

test('패키지 구성품은 구성품 이름과 실제 수량으로 센다', () => {
  const component = { name: 'B', quantity: 2, price: 50, volume: 100, windowDays: 7 };
  const result = plan([item({ name: '묶음', cap: 3, components: [component] })], [], false);
  assert.equal(result.markets.length, 1);
  assert.equal(result.markets[0].key, 'B');
  assert.equal(result.markets[0].sold, result.lines[0].qty * 2);
  assert.equal(total(result.markets), result.meso);
});

test('판매량을 반영하지 않는 후보는 시장 정보가 없다', () => {
  const result = solve({ cash: 100, earn: 0, items: [{ name: 'A', c: 10, m: 100, cap: Infinity }] });
  assert.deepEqual(result.markets, []);
});

test('수수료를 되붙인 가격을 내면 수수료를 뗀 뒤 순수익이 남는다', () => {
  // 5억에 올리면 수수료 5%를 떼고 4.75억. 85% 구간은 4.25억이다.
  assert.equal(listingPrice(475000000, .05), 500000000);
  assert.equal(listingPrice(Math.floor(475000000 * .85 + 1e-7), .05), 425000000);
  assert.equal(listingPrice(100, 0), 100);
  for (const net of [1, 999, 316666666, 123456789]) {
    assert.ok(Math.floor(listingPrice(net, .05) * .95) >= net - 1, String(net));
  }
  assert.ok(Number.isNaN(listingPrice(100, 1)));
  assert.ok(Number.isNaN(listingPrice(NaN, .05)));
});
