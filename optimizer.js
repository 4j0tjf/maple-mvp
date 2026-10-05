/* Browser/Node shared engine. 2026-09-17 개편 기준 두 화폐를 함께 계산한다.
 * 캐시 상품: 넥슨캐시로만 결제하고 결제액의 일정 비율을 메이플크레딧으로 적립한다.
 * 크레딧샵 상품: 보유·적립 크레딧으로만 결제하며 적립은 없다.
 * 모든 전이는 결제 가능한 구매이며, 적립은 결제 이후에만 더해지고 수량은 정수다. */
(function (root) {
  'use strict';
  const MAX = 1e12;
  const integer = (n, name, max = MAX) => {
    if (!Number.isSafeInteger(n) || n < 0 || n > max) throw new Error(name + '은(는) 0 이상 ' + max.toLocaleString('ko-KR') + ' 이하의 정수여야 합니다.');
  };
  function solve(input, options = {}) {
    const { items = [], creditItems = [], cash, credit = 0,
      earn = .05, earnCap = Infinity, minEarnCash = 10 } = input;
    integer(cash, '가용 캐시', 10000000); integer(credit, '보유 크레딧', 10000000);
    if (!Number.isFinite(earn) || earn < 0 || earn > 1) throw new Error('적립률은 0~100%여야 합니다.');
    if (earnCap !== Infinity) integer(earnCap, '추가 적립 한도', 10000000);
    integer(minEarnCash, '적립 최소 결제액', 10000000);
    // 화면에 입력하는 상품은 표당 30개지만, '단가 하락 반영'은 상품 하나를 물량 구간으로
    // 쪼개 여러 후보로 넣는다. 그래서 엔진 한도는 입력 한도보다 훨씬 커야 한다.
    if (!Array.isArray(items) || !Array.isArray(creditItems) || items.length > 200 || creditItems.length > 200 || items.length + creditItems.length > 400) {
      throw new Error('계산 후보가 너무 많습니다. 상품 수나 물량 구간을 줄여주세요.');
    }
    const entries = [
      ...items.map(it => ({ ...it, kind: 'cash', k: 0 })),
      ...creditItems.map(it => ({ ...it, kind: 'credit', c: 0 })),
    ];
    entries.forEach(it => {
      integer(it.m, '수수료 차감 후 메소');
      if (it.cap !== Infinity) integer(it.cap, '최대 수량', 10000000);
      if (it.kind === 'cash') {
        integer(it.c, '아이템 가격', 10000000);
        if (!it.c) throw new Error('아이템 가격은 1 이상이어야 합니다.');
      } else {
        integer(it.k, '크레딧 가격', 10000000);
        if (!it.k) throw new Error('크레딧 가격은 1 이상이어야 합니다.');
      }
    });
    // 같은 옥션 아이템은 구매 경로/패키지와 무관하게 하나의 시장을 공유한다.
    const markets = new Map();
    entries.forEach(it => (it.sales || []).forEach(s => {
      integer(s.cap, '판매 가능량', 10000000);
      integer(s.quantity, '구성품 수량', 10000000);
      integer(s.m, '구성품 순수익');
      integer(s.step, '판매 가격 구간', 10000000);
      if (!s.key || !s.quantity || !s.step || !Number.isFinite(s.drop) || s.drop < 0 || s.drop > 1) throw new Error('판매 조건을 확인하세요.');
      const old = markets.get(s.key);
      if (old) {
        old.cap = Math.min(old.cap, s.cap);
        old.m = Math.min(old.m, s.m);
        old.step = Math.min(old.step, s.step);
        old.drop = Math.max(old.drop, s.drop);
      } else markets.set(s.key, { ...s, index: markets.size });
    }));
    const marketList = [...markets.values()];
    for (const market of marketList) {
      if (!market.m) market.cap = 0;
      else if (market.drop > 0) market.cap = Math.min(market.cap, Math.ceil(1 / market.drop) * market.step);
    }
    const saleUses = entries.map(it => {
      const uses = new Map();
      for (const s of it.sales || []) uses.set(s.key, (uses.get(s.key) || 0) + s.quantity);
      return [...uses].map(([key, quantity]) => ({ market: markets.get(key), quantity }));
    });
    const saleValue = (market, start, count) => {
      let value = 0;
      while (count > 0) {
        const tier = Math.floor(start / market.step);
        const factor = Math.max(0, 1 - market.drop * tier);
        if (!factor) break;
        const take = Math.min(count, market.step - start % market.step);
        value += take * Math.floor(market.m * factor + 1e-7);
        start += take; count -= take;
      }
      return value;
    };
    const modes = [];
    entries.forEach((it, i) => {
      if (!it.m || it.cap === 0) return;
      // 10캐시 미만 결제와 적립 제외 상품은 크레딧을 주지 않는다.
      const reward = it.kind === 'cash' && it.earn !== false && it.c >= minEarnCash ? Math.floor(it.c * earn + 1e-7) : 0;
      const sales = saleUses[i];
      const m = sales.length ? sales.reduce((sum, s) => sum + s.market.m * s.quantity, 0) : it.m;
      modes.push({ i, kind: it.kind, cc: it.c, kc: it.k, m, reward, sales });
    });
    const cashModes = modes.filter(md => md.kind === 'cash');
    const creditModes = modes.filter(md => md.kind === 'credit');
    // 완화 상한: 크레딧 1은 최고 효율 크레딧 상품, 캐시 1은 그 상품이 주는 적립분까지 포함한 최대 메소.
    const ratioCredit = Math.max(0, ...creditModes.map(md => md.m / md.kc));
    const ratioCash = Math.max(0, ...cashModes.map(md => (md.m + md.reward * ratioCredit) / md.cc));
    if (cash * ratioCash + credit * ratioCredit > Number.MAX_SAFE_INTEGER) {
      throw new Error('예상 메소 합계가 정수 계산 범위를 넘습니다. 예산이나 입력 시세를 줄여주세요.');
    }
    const initial = { cash, credit, earned: 0, meso: 0, counts: entries.map(() => 0), sold: marketList.map(() => 0), prev: null, step: null };
    let best = initial, exact = true, expanded = 0;
    const better = s => s.meso > best.meso || (s.meso === best.meso && (s.cash > best.cash || (s.cash === best.cash && s.credit > best.credit)));
    function advance(s, md, qty = 1) {
      const reward = Math.min(earnCap - s.earned, md.reward * qty);
      const counts = s.counts.slice(); counts[md.i] += qty;
      const sold = s.sold.slice();
      const meso = md.sales.length ? md.sales.reduce((sum, use) => {
        const count = use.quantity * qty;
        const value = saleValue(use.market, sold[use.market.index], count);
        sold[use.market.index] += count;
        return sum + value;
      }, 0) : md.m * qty;
      const next = { cash: s.cash - md.cc * qty, credit: s.credit - md.kc * qty + reward, earned: s.earned + reward,
        meso: s.meso + meso, counts, sold, prev: s, step: { i: md.i, kind: md.kind, qty, cc: md.cc, kc: md.kc, reward, meso } };
      if (better(next)) best = next;
      return next;
    }
    const quantity = (s, md) => Math.min(md.cc ? Math.floor(s.cash / md.cc) : Infinity,
      md.kc ? Math.floor(s.credit / md.kc) : Infinity, entries[md.i].cap - s.counts[md.i],
      ...md.sales.map(use => Math.floor((use.market.cap - s.sold[use.market.index]) / use.quantity)));
    const fits = (s, md) => quantity(s, md) >= 1;
    // 크레딧 구매는 어떤 캐시 구매도 열어 주지 않으므로 캐시 → 크레딧 순서가 언제나 실행 가능하다.
    // 적립 크레딧의 가치를 다르게 본 여러 탐욕 초기안을 만든다.
    for (const weight of [0, .5, 1]) {
      let s = initial;
      const density = md => {
        const value = md.sales.length ? md.sales.reduce((sum, use) => sum + saleValue(use.market, s.sold[use.market.index], use.quantity), 0) : md.m;
        return md.kind === 'cash' ? (value + weight * Math.min(earnCap - s.earned, md.reward) * ratioCredit) / md.cc : value / md.kc;
      };
      for (const phase of [[...cashModes], [...creditModes]]) {
        for (let k = 0; k < 20000; k++) {
          phase.sort((a, b) => density(b) - density(a));
          const md = phase.find(md => fits(s, md));
          if (!md) break;
          const chunk = Math.min(quantity(s, md), ...md.sales.filter(use => use.market.drop > 0)
            .map(use => Math.max(1, Math.floor((use.market.step - s.sold[use.market.index] % use.market.step) / use.quantity))));
          s = advance(s, md, chunk);
        }
      }
    }
    // Exhaustive for small instances. For larger ones retain a bounded beam
    // and explicitly report that global optimality has not been established.
    const beamWidth = options.beamWidth ?? 160;
    const nodeLimit = options.nodeLimit ?? 160000;
    const bound = s => s.meso + s.cash * ratioCash + s.credit * ratioCredit;
    const finite = entries.map((it, i) => it.cap === Infinity ? -1 : i).filter(i => i >= 0);
    let frontier = [initial];
    while (frontier.length) {
      const unique = new Map();
      for (const s of frontier) {
        if (bound(s) + 1e-6 < best.meso) continue;
        for (const md of modes) {
          if (++expanded > nodeLimit) { exact = false; break; }
          if (!fits(s, md)) continue;
          const next = advance(s, md);
          const key = [next.cash, next.credit, earnCap === Infinity ? 0 : next.earned, ...finite.map(i => next.counts[i]), ...next.sold].join(',');
          const old = unique.get(key);
          if (!old || next.meso > old.meso) unique.set(key, next);
        }
        if (expanded > nodeLimit) break;
      }
      if (expanded > nodeLimit) break;
      frontier = [...unique.values()];
      if (frontier.length > beamWidth) {
        exact = false;
        frontier.sort((a, b) => bound(b) - bound(a) || b.credit - a.credit);
        frontier.length = beamWidth;
      }
    }
    const sequence = [];
    for (let node = best; node.prev; node = node.prev) sequence.push({ ...node.step });
    sequence.reverse();
    // 캐시 구매를 모두 먼저 실행해도 계획은 그대로 실행 가능하다. 총 적립액은 순서와 무관하고
    // 크레딧 결제 시점의 잔액은 줄지 않는다. 같은 상품의 구매는 한 줄로 합친다.
    const merge = steps => {
      const byItem = new Map();
      for (const step of steps) {
        const prior = byItem.get(step.i);
        if (prior) { prior.qty += step.qty; prior.meso += step.meso; } else byItem.set(step.i, { ...step });
      }
      return [...byItem.values()];
    };
    const steps = [...merge(sequence.filter(s => s.kind === 'cash')), ...merge(sequence.filter(s => s.kind === 'credit'))];
    let runCash = cash, runCredit = credit, runEarned = 0;
    for (const step of steps) {
      const md = modes.find(md => md.i === step.i);
      step.reward = Math.min(earnCap - runEarned, md.reward * step.qty);
      runCash -= step.cc * step.qty;
      runCredit += step.reward - step.kc * step.qty;
      runEarned += step.reward;
      step.cashAfter = runCash; step.creditAfter = runCredit;
    }
    const lines = entries.map(it => ({ ...it, qty: 0, usedCash: 0, usedCredit: 0, meso: 0 }));
    for (const step of steps) {
      const line = lines[step.i];
      line.qty += step.qty;
      line.usedCash += step.cc * step.qty;
      line.usedCredit += step.kc * step.qty;
      line.meso += step.meso;
    }
    return { lines, steps, exact, expanded, meso: best.meso, earned: best.earned,
      usedCash: cash - best.cash, usedCredit: lines.reduce((n, l) => n + l.usedCredit, 0),
      leftCash: best.cash, leftCredit: best.credit };
  }
/** 한 상품을 몇 구간까지 쪼갤지. 너무 잘게 나누면 후보만 늘고 결과는 거의 같다. */
const TIER_MAX = 6;

/**
 * 물량이 늘수록 단가가 떨어지는 것을 구간으로 표현한다.
 *
 *   구간 폭   = floor(거래량 × 구간 폭)
 *   구간 단가 = floor(기본 단가 × (1 - 하락률 × 구간번호))
 *
 * 구간마다 별도 후보로 넣으면 엔진이 비싼 구간부터 채우고, 한계 수익이 다른 상품보다
 * 낮아지는 지점에서 스스로 멈춘다. 엔진은 손대지 않아도 된다.
 *
 * 하드 컷과 달리 "여기서부터는 못 판다"가 아니라 "여기서부터는 싸게 팔린다"로 본다.
 * 거래량을 모르는 상품은 나누지 않는다. 모르는 것과 안 팔리는 것은 다르다.
 *
 * @param base 구간 이름 -> 원래 상품 이름. 결과를 다시 합칠 때 쓴다.
 */
function expandTiers(cands, s, base) {
  return cands.flatMap(it => {
    const volume = typeof it.sellable === 'number' && Number.isFinite(it.sellable) ? it.sellable : null;
    const step = volume === null ? 0 : Math.floor(volume * s.tierWidth);
    if (step < 1) return [it];
    const out = [];
    // 사용자가 적은 한도(크레딧샵은 월 구매 한도)는 구간에 나눠 준다. 합계가 한도를 넘지 않는다.
    let left = it.cap;
    for (let i = 0; i < TIER_MAX && left > 0; i += 1) {
      const factor = 1 - s.tierDrop * i;
      if (factor <= 0) break;
      const cap = Math.min(step, left);
      const name = i ? it.name + ' (' + Math.round(factor * 100) + '%가)' : it.name;
      base.set(name, it.name);
      out.push({ ...it, name, m: Math.floor(it.m * factor), cap });
      if (Number.isFinite(left)) left -= cap;
    }
    return out.length ? out : [it];
  });
}

/** 구간으로 쪼갠 결과를 원래 상품 단위로 다시 합친다. 화면에는 상품 하나로 보여야 한다. */
function mergeTiers(result, base) {
  if (!base.size) return result;
  const merged = new Map();
  for (const line of result.lines) {
    const name = base.get(line.name) || line.name;
    const key = name + '|' + line.kind;
    const found = merged.get(key);
    if (found) {
      found.qty += line.qty; found.usedCash += line.usedCash;
      found.usedCredit += line.usedCredit; found.meso += line.meso;
    } else merged.set(key, { ...line, name });
  }
  return { ...result, lines: [...merged.values()] };
}

  /** 기간 내 판매량과 구성품별 가격 하락을 계산 후보에 연결한다. */
  function prepareSales(items, s, declining = false) {
    if (!Number.isFinite(s.saleDays) || s.saleDays < 1 || s.saleDays > 365 ||
        !Number.isFinite(s.sellShare) || s.sellShare <= 0 || s.sellShare > 1 ||
        !Number.isFinite(s.tierWidth) || s.tierWidth <= 0 || s.tierWidth > 1 ||
        !Number.isFinite(s.tierDrop) || s.tierDrop < 0 || s.tierDrop > 1) throw new Error('판매기간과 판매량 조건을 확인하세요.');
    return items.map(it => {
      if (it.mm) return it;
      const components = it.components?.length ? it.components : [
        { name: it.name, quantity: 1, price: it.m, volume: it.sellable, windowDays: 7 },
      ];
      const known = components.every(c => typeof c.name === 'string' && c.name.trim() &&
        Number.isSafeInteger(c.quantity) && c.quantity > 0 &&
        Number.isFinite(c.price) && c.price > 0 &&
        Number.isSafeInteger(c.volume) && c.volume >= 0 &&
        Number.isFinite(c.windowDays) && c.windowDays > 0);
      if (!known) return { ...it, cap: 0, sales: [], salesUnknown: true };
      const gross = components.reduce((sum, c) => sum + c.price * c.quantity, 0);
      const sales = components.map(c => {
        const periodVolume = c.volume / c.windowDays * s.saleDays;
        return {
          key: c.name.trim(), quantity: c.quantity,
          cap: Math.min(10000000, Math.floor(periodVolume * s.sellShare + 1e-9)),
          step: Math.min(10000000, Math.max(1, Math.floor(periodVolume * s.tierWidth + 1e-9))),
          drop: declining ? s.tierDrop : 0,
          m: Math.floor(it.m * (c.price / gross) + 1e-7),
        };
      });
      return { ...it, sales };
    });
  }

  /** 선물형 가격은 MVP 1만원 기준으로 입력한다. */
  const GIFT_UNIT = 10000;
  /**
   * 같은 MVP 금액을 선물형으로 채웠을 때와 비교한다.
   *
   * 선물형은 MVP 1만원을 giftWon원에 채우고 끝난다. 받은 상품을 팔지 않아 회수 현금이 없고,
   * 선물 결제라 크레딧도 적립되지 않는다. 그 비용 전부가 손실이다.
   * 일반 MVP작은 같은 MVP를 사용 캐시 × 충전 비율로 채운 뒤 일부를 회수하므로 실비용은 원가 - 회수다.
   *
   * rate는 선물형 비용을 계산기의 회수율 척도(회수 현금 ÷ 사용 캐시 × 충전 비율)로 옮긴 값이다.
   * 계획의 회수율이 이보다 높으면 같은 MVP를 일반 MVP작으로 채우는 쪽이 싸다.
   */
  function giftCompare({ mvp, spentWon, gotWon, giftWon, r }) {
    if (!Number.isFinite(giftWon) || giftWon < 0 || !Number.isFinite(r) || r <= 0) throw new Error('선물형 비용과 충전 비율을 확인하세요.');
    const giftCost = mvp * giftWon / GIFT_UNIT;
    const planCost = spentWon - gotWon;
    return {
      rate: (1 - giftWon / (GIFT_UNIT * r)) * 100,
      giftCost, planCost, saving: giftCost - planCost,
      planPerUnit: mvp > 0 ? planCost / mvp * GIFT_UNIT : NaN,
    };
  }

  root.MvpOptimizer = { solve, expandTiers, mergeTiers, prepareSales, giftCompare, TIER_MAX };
  if (typeof module !== 'undefined') module.exports = { solve, expandTiers, mergeTiers, prepareSales, giftCompare, TIER_MAX };
})(typeof self !== 'undefined' ? self : globalThis);
