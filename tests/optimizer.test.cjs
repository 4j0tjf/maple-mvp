const {test} = require('node:test');
const assert = require('node:assert/strict');
const {solve} = require('../optimizer');
const item=(c,m,extra={})=>({c,m,cap:Infinity,earn:true,...extra});
const creditItem=(k,m,extra={})=>({k,m,cap:Infinity,...extra});
const input=(items,extra={})=>({items,creditItems:[],cash:100,credit:0,earn:.05,minEarnCash:0,...extra});
const all=p=>[...p.items.map(it=>({...it,kind:'cash'})),...p.creditItems.map(it=>({...it,kind:'credit'}))];
const rewardOf=(p,it,earned)=>it.kind!=='cash'||it.earn===false||it.c<(p.minEarnCash??10)
  ? 0 : Math.min((p.earnCap??Infinity)-earned,Math.floor(it.c*p.earn+1e-7));

function replay(p,r) {
  const entries=all(p);
  let cash=p.cash,credit=p.credit,earned=0,meso=0;
  const counts=entries.map(()=>0);
  for(const step of r.steps) {
    const it=entries[step.i];
    let stepEarned=0;
    assert.ok(Number.isInteger(step.qty)&&step.qty>0);
    for(let n=0;n<step.qty;n++) {
      if(it.kind==='cash') {
        assert.ok(cash>=it.c,'cash before payment');
        cash-=it.c;
        const reward=rewardOf(p,it,earned);
        earned+=reward;stepEarned+=reward;credit+=reward;
      } else {
        assert.ok(credit>=it.k,'credit before payment');
        credit-=it.k;
      }
      meso+=it.m;
      assert.ok(++counts[step.i]<=it.cap,'item cap');
    }
    assert.equal(step.reward,stepEarned);assert.equal(step.cashAfter,cash);assert.equal(step.creditAfter,credit);
  }
  assert.equal(r.meso,meso);assert.equal(r.earned,earned);assert.equal(r.usedCash,p.cash-cash);
  assert.equal(r.leftCash,cash);assert.equal(r.leftCredit,credit);
  assert.equal(r.usedCredit,p.credit+earned-credit);
}
function brute(p) {
  const entries=all(p);
  let best=0;
  function visit(cash,credit,earned,meso,counts) {
    best=Math.max(best,meso);
    entries.forEach((it,i)=> {
      if(counts[i]>=it.cap)return;
      const next=counts.slice();next[i]++;
      if(it.kind==='cash') {
        if(cash<it.c)return;
        const reward=rewardOf(p,it,earned);
        visit(cash-it.c,credit+reward,earned+reward,meso+it.m,next);
      } else {
        if(credit<it.k)return;
        visit(cash,credit-it.k,earned,meso+it.m,next);
      }
    });
  }
  visit(p.cash,p.credit,0,0,entries.map(()=>0));return best;
}

test('크레딧 상품은 적립 전에 미리 살 수 없다',()=>{
  const p=input([item(100,10)],{creditItems:[creditItem(6,1000)],cash:100,credit:0,earn:.05});
  const r=solve(p);
  // 100캐시 구매로 5크레딧만 적립되므로 6크레딧 상품은 살 수 없다.
  assert.equal(r.lines[1].qty,0);assert.equal(r.meso,10);replay(p,r);
  const enough=input([item(100,10)],{creditItems:[creditItem(5,1000)],cash:100,earn:.05});
  const got=solve(enough);assert.equal(got.lines[1].qty,1);assert.equal(got.meso,1010);replay(enough,got);
});
test('적립 크레딧이 캐시 구매 자체의 가치를 바꾼다',()=>{
  // 캐시 상품 자체 효율은 낮지만 적립 크레딧으로 사는 상품이 훨씬 좋다.
  const p=input([item(10,1,{earn:true}),item(10,5,{earn:false})],{creditItems:[creditItem(1,100)],cash:100,earn:.5});
  const r=solve(p);
  assert.equal(r.lines[0].qty,10);assert.equal(r.lines[1].qty,0);
  assert.equal(r.earned,50);assert.equal(r.lines[2].qty,50);
  assert.equal(r.meso,10*1+50*100);replay(p,r);
});
test('적립 제외 상품과 최소 결제액 미만은 크레딧을 주지 않는다',()=>{
  const p=input([item(9,1),item(10,1,{earn:false}),item(10,1)],{creditItems:[creditItem(1,1000)],cash:29,earn:.5,minEarnCash:10});
  const r=solve(p);
  // 10캐시 상품(적립)만 두 번 사는 쪽이 낫다. 9캐시와 적립 제외 상품은 크레딧을 주지 않는다.
  assert.equal(r.earned,10);assert.equal(r.lines[0].qty,1);replay(p,r);
  assert.equal(brute(p),r.meso);
});
test('구매 순서는 캐시 전액 결제를 먼저 실행한다',()=>{
  const p=input([item(100,10)],{creditItems:[creditItem(5,1000)],cash:300,credit:5,earn:.05});
  const r=solve(p);
  assert.deepEqual(r.steps.map(s=>s.kind),['cash','credit']);
  assert.equal(r.steps[0].qty,3);assert.equal(r.steps[1].qty,4);replay(p,r);
});
test('정수 조합이 최고 비율 탐욕을 이긴다',()=>{
  const p=input([item(6,13),item(5,10)],{cash:10,earn:0});
  const r=solve(p);assert.equal(r.meso,20);assert.ok(r.exact);replay(p,r);
});
test('수량 0 한도와 적립 한도 0을 지킨다',()=>{
  const p=input([item(10,1000,{cap:0}),item(100,1000,{cap:2})],{creditItems:[creditItem(10,500)],cash:300,earnCap:0,earn:.3});
  const r=solve(p);
  assert.equal(r.lines[0].qty,0);assert.equal(r.lines[1].qty,2);assert.equal(r.earned,0);assert.equal(r.lines[2].qty,0);
  replay(p,r);
});
test('크레딧샵 상품의 월 구매 한도를 지킨다',()=>{
  const p=input([item(10,1)],{creditItems:[creditItem(1,1000,{cap:3}),creditItem(1,900)],cash:100,earn:.5});
  const r=solve(p);
  assert.equal(r.lines[1].qty,3);assert.equal(r.lines[2].qty,47);replay(p,r);
});
test('입력 검증은 정수·비율·무한 예산을 거부한다',()=>{
  assert.throws(()=>solve(input([item(10,100,{cap:.5})])));
  assert.throws(()=>solve(input([item(10,100)],{earn:1.5})));
  assert.throws(()=>solve(input([item(10,100)],{cash:Infinity})));
  assert.throws(()=>solve(input([item(0,100)])));
  assert.throws(()=>solve(input([],{creditItems:[creditItem(0,100)],cash:10})));
  assert.throws(()=>solve(input([item(10,100)],{credit:-1})));
});
test('작은 입력 120개를 독립 전수 탐색과 대조한다',()=>{
  let seed=373;const rand=n=>(seed=(seed*16807)%2147483647)%n;
  for(let k=0;k<120;k++) {
    const p=input(Array.from({length:2},()=>item(3+rand(7),1+rand(20),{cap:rand(4),earn:!!rand(2)})),
      {creditItems:Array.from({length:1+rand(2)},()=>creditItem(1+rand(4),1+rand(30),{cap:rand(4)})),
       cash:rand(16),credit:rand(7),earn:[0,.05,.3,.5][rand(4)],minEarnCash:rand(2)?0:5,
       earnCap:rand(2)?Infinity:rand(5)});
    const r=solve(p,{beamWidth:100000,nodeLimit:2000000});
    assert.ok(r.exact);assert.equal(r.meso,brute(p),JSON.stringify(p));replay(p,r);
  }
});
test('실제 규모 입력은 제한된 탐색 안에서 실행 가능한 계획을 낸다',()=>{
  const p=input([item(3300,475000000),item(1600,218500000,{cap:50}),item(2200,323000000),item(2200,100000000,{earn:false})],
    {creditItems:[creditItem(10000,450000000,{cap:5}),creditItem(4900,150000000),creditItem(9900,380000000)],
     cash:1075268,credit:3500,earn:.05,minEarnCash:10});
  const r=solve(p);
  assert.ok(r.meso>0);assert.ok(r.usedCredit>0);replay(p,r);
  assert.ok(r.expanded<=160001);
});
test('탐색을 절단하면 최적해를 주장하지 않는다',()=>{
  const p=input([item(6,13),item(5,10)],{creditItems:[creditItem(2,7)],cash:100,credit:30});
  const r=solve(p,{beamWidth:1,nodeLimit:1});assert.equal(r.exact,false);replay(p,r);
});
