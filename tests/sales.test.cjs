const { test } = require('node:test');
const assert = require('node:assert/strict');
const { solve, prepareSales } = require('../optimizer');
const { productRows, creditRows } = require('../cash-shop');

const settings = { saleDays: 7, sellShare: .1, tierWidth: .02, tierDrop: .2 };
const item = (extra = {}) => ({ name: 'A', c: 10, m: 100, cap: Infinity, earn: false, sellable: 100, ...extra });
const plan = (items, creditItems = [], s = settings, declining = true, extra = {}) => solve({
  cash: 1000, credit: 100, earn: 0,
  items: prepareSales(items, s, declining), creditItems: prepareSales(creditItems, s, declining), ...extra,
});
const qty = r => r.lines.reduce((sum, l) => sum + l.qty, 0);

test('판매기간에 맞게 수량을 환산하고 내림한다', () => {
  assert.equal(qty(plan([item()], [], settings, false)), 10);
  assert.equal(qty(plan([item()], [], { ...settings, saleDays: 1 }, false)), 1);
  assert.equal(qty(plan([item()], [], { ...settings, saleDays: 14 }, false)), 20);
  assert.equal(qty(plan([item()], [], { ...settings, sellShare: .001 }, false)), 0);
});

test('캐시와 크레딧 경로가 판매 한도와 가격 구간을 공유한다', () => {
  const cash = item({ cap: 5 });
  const credit = item({ c: 0, k: 10, cap: 5 });
  const result = plan([cash], [credit]);
  assert.equal(qty(result), 10);
  // 2개씩 100, 80, 60, 40, 20. 경로별로 100부터 다시 시작하면 안 된다.
  assert.equal(result.meso, 600);
  assert.equal(result.lines.reduce((sum, l) => sum + l.meso, 0), result.meso);
  assert.equal(result.steps.reduce((sum, step) => sum + step.meso, 0), result.meso);
  assert.ok(result.exact);
});

test('패키지와 단품은 실제 구성품 수량을 합산한다', () => {
  const component = { name: 'A', quantity: 2, price: 100, volume: 100, windowDays: 7 };
  const pack = item({ name: '묶음', m: 200, cap: 3, components: [component] });
  const result = plan([pack], [item({ k: 10 })], settings, false);
  const sold = result.lines[0].qty * 2 + result.lines[1].qty;
  assert.equal(sold, 10);
  assert.equal(result.meso, 1000);
});

test('한 패키지 안에 같은 구성품이 두 번 나와도 합산한다', () => {
  const c = { name: 'A', quantity: 1, price: 100, volume: 100, windowDays: 7 };
  const result = plan([item({ m: 200, components: [c, c] })], [], settings, false);
  assert.equal(qty(result), 5);
});

test('미확인 거래량은 제외하고 메소마켓 및 구매 한도는 유지한다', () => {
  const result = plan([item({ sellable: null }), item({ name: '메소마켓', mm: true, cap: 2 })]);
  assert.equal(result.lines[0].qty, 0);
  assert.equal(result.lines[0].salesUnknown, true);
  assert.equal(result.lines[1].qty, 2);
  assert.equal(qty(plan([], [item({ k: 10, cap: 3 })], settings, false)), 3);
  assert.equal(qty(plan([item({ components: [{ name: 'A', quantity: 1, price: 100, volume: null, windowDays: 7 }] })])), 0);
});

test('좁은 가격 구간에서도 제한이 풀리지 않고 하락률 0은 판매량 모드와 같다', () => {
  assert.equal(qty(plan([item()], [], { ...settings, tierWidth: .0001 }, false)), 10);
  const constant = plan([item()], [], { ...settings, tierDrop: 0 });
  assert.equal(constant.meso, plan([item()], [], settings, false).meso);
  assert.equal(qty(constant), 10);
  assert.ok(plan([item()], [], { ...settings, tierWidth: .0001 }).meso <= constant.meso);
});

test('구성품별 가격과 관측기간을 API에서 추천 후보까지 보존한다', () => {
  const product = { id: 'p', name: '묶음', cashPrice: 10, creditPrice: 5, price: '200', creditEarns: false,
    selected: '선택', variants: [{ label: '선택', components: [{ name: 'A', quantity: 2, quote: { price: '100' } }] }] };
  const depths = [{ name: 'A', recentQuantity: 200, recentSales: 10, windowDays: 14 }];
  const cash = productRows([product], depths)[0];
  const credit = creditRows([product], depths)[0];
  assert.deepEqual(cash.components, credit.components);
  assert.deepEqual(cash.components[0], { name: 'A', quantity: 2, price: 100, volume: 200, windowDays: 14 });
  assert.equal(qty(plan([item({ m: 200, components: cash.components })], [], settings, false)), 5);
});

test('공유 수요와 가격 하락을 적용한 작은 문제 100개를 독립 전수 탐색과 비교한다', () => {
  let seed = 137;
  const rand = max => (seed = seed * 16807 % 2147483647) % max;
  for (let run = 0; run < 100; run++) {
    const cash = 10 + rand(30), credit = rand(10), cost = 2 + rand(5), k = 1 + rand(3);
    const cashCap = rand(6), creditCap = rand(6);
    const result = plan([item({ c: cost, cap: cashCap, earn: true })], [item({ k, cap: creditCap })], settings, true,
      { cash, credit, earn: .5, minEarnCash: 0 });
    let expected = 0;
    for (let a = 0; a <= cashCap; a++) for (let b = 0; b <= creditCap; b++) {
      if (a * cost > cash || b * k > credit + a * Math.floor(cost * .5) || a + b > 10) continue;
      let meso = 0;
      for (let i = 0; i < a + b; i++) meso += 100 - 20 * Math.floor(i / 2);
      expected = Math.max(expected, meso);
    }
    assert.ok(result.exact);
    assert.equal(result.meso, expected, JSON.stringify({ cash, credit, cost, k, cashCap, creditCap }));
    assert.ok(result.usedCash <= cash);
    assert.ok(result.usedCredit <= credit + result.earned);
  }
});
