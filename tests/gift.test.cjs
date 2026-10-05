const { test } = require('node:test');
const assert = require('node:assert/strict');
const { giftCompare } = require('../optimizer');

const close = (actual, expected) => assert.ok(Math.abs(actual - expected) < 1e-9, actual + ' ≠ ' + expected);

test('선물형 환산 회수율은 회수 0인 비용을 충전 비율 기준 회수율로 옮긴 값이다', () => {
  // 7,000원으로 MVP 1만원. 일반은 1만 캐시 = 9,300원이므로 2,300원을 회수한 것과 같다.
  close(giftCompare({ mvp: 0, spentWon: 0, gotWon: 0, giftWon: 7000, r: .93 }).rate, 2300 / 9300 * 100);
  // 선물형이 일반 원가보다 비싸면 음수, 무료면 100%.
  assert.ok(giftCompare({ mvp: 0, spentWon: 0, gotWon: 0, giftWon: 9500, r: .93 }).rate < 0);
  close(giftCompare({ mvp: 0, spentWon: 0, gotWon: 0, giftWon: 0, r: .93 }).rate, 100);
});

test('같은 MVP를 선물형으로 채우는 비용과 계획의 실비용을 비교한다', () => {
  // 10만 캐시 사용, 원가 93,000원, 회수 74,400원(80%).
  const g = giftCompare({ mvp: 100000, spentWon: 93000, gotWon: 74400, giftWon: 7000, r: .93 });
  close(g.giftCost, 70000);
  close(g.planCost, 18600);
  close(g.saving, 51400);
  close(g.planPerUnit, 1860);
});

test('회수율이 환산 회수율과 같으면 두 방식의 비용이 같다', () => {
  const { rate } = giftCompare({ mvp: 0, spentWon: 0, gotWon: 0, giftWon: 7000, r: .93 });
  const spentWon = 100000 * .93;
  const g = giftCompare({ mvp: 100000, spentWon, gotWon: spentWon * rate / 100, giftWon: 7000, r: .93 });
  close(g.saving, 0);
});

test('잘못된 비용이나 충전 비율은 거절한다', () => {
  assert.throws(() => giftCompare({ mvp: 1, spentWon: 1, gotWon: 0, giftWon: NaN, r: .93 }));
  assert.throws(() => giftCompare({ mvp: 1, spentWon: 1, gotWon: 0, giftWon: -1, r: .93 }));
  assert.throws(() => giftCompare({ mvp: 1, spentWon: 1, gotWon: 0, giftWon: 7000, r: 0 }));
});
