const {test} = require('node:test');
const assert = require('node:assert/strict');
const {solve} = require('../optimizer');
const item=(c,m,extra={})=>({c,m,cap:Infinity,el:true,earn:true,...extra});
const input=(items,extra={})=>({items,cash:100,mile:0,mrate:.3,earn:.05,reuse:false,...extra});

function replay(p,r) {
  let cash=p.cash,mile=p.mile,earned=0,meso=0;
  const counts=p.items.map(()=>0);
  for(const step of r.steps) {
    const it=p.items[step.i];
    let stepEarned=0;
    for(let n=0;n<step.qty;n++) {
      assert.ok(Number.isInteger(step.qty));
      const mc=step.kind==='mile'?Math.floor(it.c*p.mrate+1e-7):0;
      const cc=it.c-mc;
      assert.ok(cash>=cc,'cash before payment');assert.ok(mile>=mc,'mileage before payment');
      cash-=cc;mile-=mc;meso+=it.m;
      const reward=it.earn?Math.min((p.earnCap??Infinity)-earned,Math.floor((p.earnOnCashOnly===false?it.c:cc)*p.earn+1e-7)):0;
      earned+=reward;stepEarned+=reward;if(p.reuse)mile+=reward;
      assert.ok(++counts[step.i]<=it.cap,'shared item cap');
    }
    assert.equal(step.reward,stepEarned);assert.equal(step.cashAfter,cash);assert.equal(step.mileAfter,mile);
  }
  assert.equal(r.meso,meso);assert.equal(r.earned,earned);assert.equal(r.usedCash,p.cash-cash);
  assert.equal(r.leftCash,cash);assert.equal(r.leftMile,mile+(p.reuse?0:earned));
}
function brute(p) {
  let best=0;
  function visit(cash,mile,earned,meso,counts) {
    best=Math.max(best,meso);
    p.items.forEach((it,i)=> {
      if(counts[i]>=it.cap)return;
      for(const discounted of [false,true]) {
        if(discounted&&(!it.el||!p.mrate))continue;
        const mc=discounted?Math.floor(it.c*p.mrate+1e-7):0,cc=it.c-mc;
        if(cash<cc||mile<mc)continue;
        const reward=it.earn?Math.min((p.earnCap??Infinity)-earned,Math.floor((p.earnOnCashOnly===false?it.c:cc)*p.earn+1e-7)):0;
        const next=counts.slice();next[i]++;
        visit(cash-cc,mile-mc+(p.reuse?reward:0),earned+reward,meso+it.m,next);
      }
    });
  }
  visit(p.cash,p.mile,0,0,p.items.map(()=>0));return best;
}
test('cannot borrow reward from an unaffordable first purchase',()=>{
  const p=input([item(100,1000)],{cash:70,mile:27,reuse:true});
  const r=solve(p);assert.equal(r.meso,0);replay(p,r);
});
test('integer combination beats the highest-ratio greedy item',()=>{
  const p=input([item(6,13,{el:false}),item(5,10,{el:false})],{cash:10,earn:0});
  const r=solve(p);assert.equal(r.meso,20);assert.ok(r.exact);replay(p,r);
});
test('reuse option changes the feasible plan',()=>{
  const base=input([item(100,1000)],{cash:270,earn:.3});
  assert.equal(solve(base).lines[0].qty,2);
  const p={...base,reuse:true};const r=solve(p);assert.equal(r.lines[0].qty,3);replay(p,r);
});
test('zero cap forbids an item and zero reward cap prevents new mileage',()=>{
  const p=input([item(10,1000,{cap:0}),item(100,1000,{cap:2})],{cash:300,reuse:true,earnCap:0,earn:.3});
  const r=solve(p);assert.equal(r.lines[0].qty,0);assert.equal(r.lines[1].qty,2);assert.equal(r.earned,0);replay(p,r);
});
test('discount and full cash purchases share a quantity cap',()=>{
  const p=input([item(100,1000,{cap:2})],{cash:1000,mile:30,reuse:true});const r=solve(p);
  assert.equal(r.lines[0].qty,2);replay(p,r);
});
test('validation rejects fractional counts, invalid rates and infinite budgets',()=>{
  assert.throws(()=>solve(input([item(10,100,{cap:.5})])));
  assert.throws(()=>solve(input([item(10,100)],{mrate:1})));
  assert.throws(()=>solve(input([item(10,100)],{cash:Infinity})));
  assert.throws(()=>solve(input([item(0,100)])));
});
test('exhaustive comparison on 120 deterministic small inputs in both modes',()=>{
  let seed=373;const rand=n=>(seed=(seed*16807)%2147483647)%n;
  for(let k=0;k<120;k++) {
    const p=input(Array.from({length:2},()=>item(3+rand(7),1+rand(20),{cap:rand(4),el:!!rand(2),earn:!!rand(2)})),
      {cash:rand(16),mile:rand(7),earn:[0,.05,.3][rand(3)],mrate:[0,.3,.5][rand(3)],reuse:!!rand(2),earnCap:rand(2)?Infinity:rand(5),earnOnCashOnly:!!rand(2)});
    const r=solve(p,{beamWidth:100000,nodeLimit:2000000});
    assert.ok(r.exact);assert.equal(r.meso,brute(p),JSON.stringify(p));replay(p,r);
  }
});
test('production-sized example produces a feasible bounded search',()=>{
  for(const reuse of [false,true]) {
    const p=input([item(3300,475000000),item(1600,218500000,{cap:50}),item(2200,323000000,{el:false}),item(2200,100000000,{el:false,earn:false})],{cash:1075268,mile:3500,reuse});
    const r=solve(p);assert.ok(r.meso>0);replay(p,r);
    assert.ok(r.expanded<=160001);
  }
});
test('search truncation must not claim exact optimality',()=>{
  const p=input([item(6,13),item(5,10)],{cash:100,mile:30});
  const r=solve(p,{beamWidth:1,nodeLimit:1});assert.equal(r.exact,false);replay(p,r);
});
