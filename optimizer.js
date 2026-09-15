/* Browser/Node shared engine. Every transition is an affordable purchase;
 * rewards are credited only AFTER payment and integer quantities are enforced. */
(function (root) {
  'use strict';
  const MAX = 1e12;
  const integer = (n, name, max = MAX) => {
    if (!Number.isSafeInteger(n) || n < 0 || n > max) throw new Error(name + '은(는) 0 이상 ' + max.toLocaleString('ko-KR') + ' 이하의 정수여야 합니다.');
  };
  function solve(input, options = {}) {
    const { items, cash, mile, mrate = .3, earn = .05, reuse = false,
      earnOnCashOnly = true, earnCap = Infinity } = input;
    integer(cash, '가용 캐시', 10000000); integer(mile, '보유 마일리지', 10000000);
    if (!Number.isFinite(mrate) || mrate < 0 || mrate >= 1) throw new Error('마일리지 사용률은 0% 이상 100% 미만이어야 합니다.');
    if (!Number.isFinite(earn) || earn < 0 || earn > 1) throw new Error('적립률은 0~100%여야 합니다.');
    if (earnCap !== Infinity) integer(earnCap, '추가 적립 한도', 10000000);
    if (!Array.isArray(items) || items.length > 30) throw new Error('아이템은 최대 30개까지 계산할 수 있습니다.');
    items.forEach(it => {
      integer(it.c, '아이템 가격', 10000000);
      if (!it.c) throw new Error('아이템 가격은 1 이상이어야 합니다.');
      integer(it.m, '수수료 차감 후 메소');
      if (it.cap !== Infinity) integer(it.cap, '최대 수량', 10000000);
    });
    const modes = [];
    items.forEach((it, i) => {
      if (!it.m || it.cap === 0) return;
      const add = (mc, kind) => {
        const cc = it.c - mc;
        modes.push({ i, mc, cc, kind, m:it.m,
          reward:it.earn ? Math.floor((earnOnCashOnly ? cc : it.c) * earn + 1e-7) : 0 });
      };
      add(0, 'cash');
      const mc = Math.floor(it.c * mrate + 1e-7);
      if (it.el && mc > 0) add(mc, 'mile');
    });
    if (cash * Math.max(0,...modes.map(md=>md.m/md.cc)) > Number.MAX_SAFE_INTEGER) {
      throw new Error('예상 메소 합계가 정수 계산 범위를 넘습니다. 예산이나 입력 시세를 줄여주세요.');
    }
    const initial = { cash, mile, earned:0, meso:0, counts:items.map(() => 0), prev:null, step:null };
    let best = initial, exact = true, expanded = 0;
    const better = s => s.meso > best.meso || (s.meso === best.meso && s.cash > best.cash);
    function advance(s, md, qty = 1) {
      const reward = Math.min(earnCap - s.earned, md.reward * qty);
      const counts = s.counts.slice(); counts[md.i] += qty;
      const next = { cash:s.cash - md.cc * qty, mile:s.mile - md.mc * qty + (reuse ? reward : 0),
        earned:s.earned + reward, meso:s.meso + md.m * qty, counts, prev:s, step:{i:md.i,kind:md.kind,qty,cc:md.cc,mc:md.mc,reward} };
      if (better(next)) best = next;
      return next;
    }
    const fits = (s, md) => s.cash >= md.cc && s.mile >= md.mc && s.counts[md.i] < items[md.i].cap;
    // Fast complete feasible seeds. Discounted purchases are limited to the
    // mileage ALREADY held. Bulk cash purchases credit their reward afterwards.
    for (const penalty of [0, .25, .5, 1, 2]) {
      let s = initial;
      const ordered = [...modes].sort((a,b) => b.m/(b.cc+penalty*b.mc) - a.m/(a.cc+penalty*a.mc));
      for (let k = 0; k < 20000; k++) {
        const md = ordered.find(md => fits(s,md));
        if (!md) break;
        let qty = Math.min(Math.floor(s.cash/md.cc), items[md.i].cap-s.counts[md.i], md.mc ? Math.floor(s.mile/md.mc) : Infinity);
        // Cash seeds buy just enough to unlock a higher-ranked mileage mode.
        if (reuse && md.reward > 0 && s.earned < earnCap) {
          for (const next of ordered.slice(0, ordered.indexOf(md))) {
            if (next.mc > s.mile && s.counts[next.i] < items[next.i].cap) {
              qty = Math.min(qty, Math.max(1, Math.ceil((next.mc-s.mile)/md.reward)));
            }
          }
        }
        s = advance(s,md,qty);
      }
    }
    // Exhaustive for small instances. For larger ones retain a bounded beam
    // and explicitly report that global optimality has not been established.
    const beamWidth = options.beamWidth ?? 160;
    const nodeLimit = options.nodeLimit ?? 160000;
    const optimisticRatio = Math.max(0, ...modes.map(md => md.m/md.cc));
    const finite = items.map((it,i) => it.cap === Infinity ? -1 : i).filter(i => i >= 0);
    let frontier = [initial];
    while (frontier.length) {
      const unique = new Map();
      for (const s of frontier) {
        if (s.meso + s.cash * optimisticRatio + 1e-6 < best.meso) continue;
        for (const md of modes) {
          if (++expanded > nodeLimit) { exact = false; break; }
          if (!fits(s,md)) continue;
          const next = advance(s,md);
          const key = [next.cash,next.mile, earnCap === Infinity ? 0 : next.earned,...finite.map(i=>next.counts[i])].join(',');
          const old = unique.get(key);
          if (!old || next.meso > old.meso) unique.set(key,next);
        }
        if (expanded > nodeLimit) break;
      }
      if (expanded > nodeLimit) break;
      frontier = [...unique.values()];
      if (frontier.length > beamWidth) {
        exact = false;
        frontier.sort((a,b) => (b.meso+b.cash*optimisticRatio)-(a.meso+a.cash*optimisticRatio) || b.mile-a.mile);
        frontier.length = beamWidth;
      }
    }
    const sequence = [];
    for (let node = best; node.prev; node = node.prev) sequence.push({ ...node.step, cashAfter:node.cash, mileAfter:node.mile });
    sequence.reverse();
    // All full-cash purchases can be made first: total plan cash already fits
    // the initial budget, and earlier rewards cannot reduce mileage available.
    // Preserve the relative order of discounted purchases (including custom
    // reward rates where their own rewards may unlock subsequent purchases).
    const cashSteps = new Map();
    for (const step of sequence.filter(s => s.kind === 'cash')) {
      const prior = cashSteps.get(step.i);
      if (prior) prior.qty += step.qty;
      else cashSteps.set(step.i,{...step});
    }
    const orderedSteps = [...cashSteps.values(), ...sequence.filter(s => s.kind === 'mile')];
    let scheduleCash=cash, scheduleMile=mile, scheduleEarned=0;
    for (const step of orderedSteps) {
      const md=modes.find(md=>md.i===step.i && md.kind===step.kind);
      step.reward=Math.min(earnCap-scheduleEarned,md.reward*step.qty);
      scheduleCash-=step.cc*step.qty;
      scheduleMile-=step.mc*step.qty;
      if(reuse) scheduleMile+=step.reward;
      scheduleEarned+=step.reward;
      step.cashAfter=scheduleCash; step.mileAfter=scheduleMile;
    }
    const steps = [];
    for (const step of orderedSteps) {
      const last = steps.at(-1);
      if (last && last.i === step.i && last.kind === step.kind) {
        last.qty += step.qty; last.reward += step.reward; last.cashAfter = step.cashAfter; last.mileAfter = step.mileAfter;
      } else steps.push({...step});
    }
    const lines = items.map(it => ({...it,cashQty:0,mileQty:0,qty:0,usedCash:0,usedMile:0,meso:0}));
    for (const step of steps) {
      const l = lines[step.i]; l[step.kind+'Qty'] += step.qty; l.qty += step.qty;
      l.usedCash += step.cc*step.qty; l.usedMile += step.mc*step.qty; l.meso += step.qty*l.m;
    }
    return {lines,steps,exact,expanded,meso:best.meso,earned:best.earned,
      usedCash:cash-best.cash,usedMile:lines.reduce((n,l)=>n+l.usedMile,0),
      leftCash:best.cash,leftMile:best.mile+(reuse?0:best.earned),reuse};
  }
  root.MvpOptimizer = { solve };
  if (typeof module !== 'undefined') module.exports = { solve };
})(typeof self !== 'undefined' ? self : globalThis);
