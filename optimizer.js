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
    if (!Array.isArray(items) || !Array.isArray(creditItems) || items.length > 30 || creditItems.length > 30 || items.length + creditItems.length > 40) {
      throw new Error('캐시 상품과 크레딧샵 상품을 합쳐 최대 40개까지 계산할 수 있습니다.');
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
    const modes = [];
    entries.forEach((it, i) => {
      if (!it.m || it.cap === 0) return;
      // 10캐시 미만 결제와 적립 제외 상품은 크레딧을 주지 않는다.
      const reward = it.kind === 'cash' && it.earn !== false && it.c >= minEarnCash ? Math.floor(it.c * earn + 1e-7) : 0;
      modes.push({ i, kind: it.kind, cc: it.c, kc: it.k, m: it.m, reward });
    });
    const cashModes = modes.filter(md => md.kind === 'cash');
    const creditModes = modes.filter(md => md.kind === 'credit');
    // 완화 상한: 크레딧 1은 최고 효율 크레딧 상품, 캐시 1은 그 상품이 주는 적립분까지 포함한 최대 메소.
    const ratioCredit = Math.max(0, ...creditModes.map(md => md.m / md.kc));
    const ratioCash = Math.max(0, ...cashModes.map(md => (md.m + md.reward * ratioCredit) / md.cc));
    if (cash * ratioCash + credit * ratioCredit > Number.MAX_SAFE_INTEGER) {
      throw new Error('예상 메소 합계가 정수 계산 범위를 넘습니다. 예산이나 입력 시세를 줄여주세요.');
    }
    const initial = { cash, credit, earned: 0, meso: 0, counts: entries.map(() => 0), prev: null, step: null };
    let best = initial, exact = true, expanded = 0;
    const better = s => s.meso > best.meso || (s.meso === best.meso && (s.cash > best.cash || (s.cash === best.cash && s.credit > best.credit)));
    function advance(s, md, qty = 1) {
      const reward = Math.min(earnCap - s.earned, md.reward * qty);
      const counts = s.counts.slice(); counts[md.i] += qty;
      const next = { cash: s.cash - md.cc * qty, credit: s.credit - md.kc * qty + reward, earned: s.earned + reward,
        meso: s.meso + md.m * qty, counts, prev: s, step: { i: md.i, kind: md.kind, qty, cc: md.cc, kc: md.kc, reward } };
      if (better(next)) best = next;
      return next;
    }
    const fits = (s, md) => s.cash >= md.cc && s.credit >= md.kc && s.counts[md.i] < entries[md.i].cap;
    const quantity = (s, md) => Math.min(md.cc ? Math.floor(s.cash / md.cc) : Infinity,
      md.kc ? Math.floor(s.credit / md.kc) : Infinity, entries[md.i].cap - s.counts[md.i]);
    // 크레딧 구매는 어떤 캐시 구매도 열어 주지 않으므로 캐시 → 크레딧 순서가 언제나 실행 가능하다.
    // 적립 크레딧의 가치를 다르게 본 여러 탐욕 초기안을 만든다.
    for (const weight of [0, .5, 1]) {
      let s = initial;
      const density = md => md.kind === 'cash' ? (md.m + weight * md.reward * ratioCredit) / md.cc : md.m / md.kc;
      for (const phase of [[...cashModes], [...creditModes]]) {
        phase.sort((a, b) => density(b) - density(a));
        for (let k = 0; k < 20000; k++) {
          const md = phase.find(md => fits(s, md));
          if (!md) break;
          s = advance(s, md, quantity(s, md));
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
          const key = [next.cash, next.credit, earnCap === Infinity ? 0 : next.earned, ...finite.map(i => next.counts[i])].join(',');
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
        if (prior) prior.qty += step.qty; else byItem.set(step.i, { ...step });
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
      line.meso += step.qty * line.m;
    }
    return { lines, steps, exact, expanded, meso: best.meso, earned: best.earned,
      usedCash: cash - best.cash, usedCredit: lines.reduce((n, l) => n + l.usedCredit, 0),
      leftCash: best.cash, leftCredit: best.credit };
  }
  root.MvpOptimizer = { solve };
  if (typeof module !== 'undefined') module.exports = { solve };
})(typeof self !== 'undefined' ? self : globalThis);
