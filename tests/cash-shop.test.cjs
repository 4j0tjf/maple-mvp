const test=require('node:test');
const assert=require('node:assert/strict');
const {fetchToday,productRows,creditRows,thin,readToday,fixedProducts}=require('../cash-shop.js');
test('cached day returns without triggering repeated search',async()=>{
  // 오늘 결과가 이미 있으면 수집을 시작하지 않는다. 읽기 한 번으로 끝난다.
  const methods=[];const result=await fetchToday({fetcher:async(_url,opts)=>{methods.push(opts.method);return {ok:true,json:async()=>({status:'SUCCESS',products:[]})};}});
  assert.equal(result.status,'SUCCESS');assert.deepEqual(methods,['GET']);
});
test('running job is polled read-only and failed day is not retried',async()=>{
  const methods=[];const responses=['RUNNING','RUNNING','FAIL'];
  const result=await fetchToday({fetcher:async(_url,opts)=>{methods.push(opts.method);return {ok:true,json:async()=>({status:responses.shift(),products:fixedProducts})};},wait:async()=>{}});
  assert.equal(result.status,'FAIL');assert.equal(productRows(result.products).length,4);
  assert.deepEqual(methods,['GET','GET','GET']);
});
test('오늘 수집이 없을 때만 시작을 요청한다',async()=>{
  const methods=[];const responses=['NOT_REQUESTED','RUNNING','SUCCESS'];
  const result=await fetchToday({fetcher:async(_url,opts)=>{methods.push(opts.method);return {ok:true,json:async()=>({status:responses.shift(),products:[]})};},wait:async()=>{}});
  assert.equal(result.status,'SUCCESS');
  // 읽고 -> 없으니 시작 요청 -> 끝날 때까지 읽기
  assert.deepEqual(methods,['GET','POST','GET']);
});
test('외부에서 수집이 막혀도 저장된 오늘 결과로 계산한다',async()=>{
  // 터널로 열면 서버가 POST를 403으로 막는다. 이미 오늘 결과가 있으면 POST 자체를 하지 않는다.
  const methods=[];
  const result=await fetchToday({fetcher:async(_url,opts)=>{
    methods.push(opts.method);
    if(opts.method==='POST') return {ok:false,status:403,json:async()=>({error:'외부에서는 오늘 시세 수집을 시작할 수 없습니다.'})};
    return {ok:true,json:async()=>({status:'PARTIAL',products:fixedProducts})};
  }});
  assert.equal(result.status,'PARTIAL');
  assert.deepEqual(methods,['GET']);
});
test('오늘 결과가 없는데 외부라 수집도 못 하면 이유를 그대로 알린다',async()=>{
  await assert.rejects(
    fetchToday({fetcher:async(_url,opts)=>opts.method==='POST'
      ? {ok:false,status:403,json:async()=>({error:'외부에서는 오늘 시세 수집을 시작할 수 없습니다.'})}
      : {ok:true,json:async()=>({status:'NOT_REQUESTED',products:[]})},wait:async()=>{}}),
    /외부에서는 오늘 시세 수집을 시작할 수 없습니다/,
  );
});
test('no-listing never becomes a zero price and missing purchase metadata stays pending',()=>{
  const p={id:'fixed-0',name:'테스트',variants:[{}],price:'100',cashPrice:null,creditEarns:null,comparisonComplete:true};
  assert.equal(productRows([p])[0].metadataPending,true);assert.equal(productRows([{...p,price:null}])[0].meso,'');
  assert.equal(productRows([{...p,cashPrice:2200,creditEarns:false}])[0].earn,false);
});
test('credit shop rows carry the credit price and monthly limit',()=>{
  const rows=creditRows([
    {id:'c1',name:'프라임 큐브',creditPrice:10000,monthlyLimit:5,price:'450000000',variants:[{}],comparisonComplete:true},
    {id:'c2',name:'묶음',creditPrice:4900,monthlyLimit:null,price:null,selected:'남',variants:[{},{}],comparisonComplete:false},
  ]);
  assert.deepEqual(rows.map(r=>[r.cashShopId,r.name,r.credit,r.meso,r.cap]),[
    ['credit-c1','프라임 큐브','10000','450000000','5'],
    ['credit-c2','묶음 · 남','4900','',''],
  ]);
  assert.ok(rows.every(r=>r.metadataPending===false));
  assert.deepEqual(creditRows(undefined),[]);
});
test('거래가 적은 상품은 행을 만들지 않고 남은 상품은 거래량이 수량 상한이 된다',()=>{
  const base={cashPrice:2200,creditEarns:true,price:'100000000',variants:[{}],comparisonComplete:true};
  const products=[
    {...base,id:'a',name:'잘팔림',depth:{sellable:250,excluded:false,reason:'최근 거래 250건 · 최대 수량 250개로 제한'}},
    {...base,id:'b',name:'안팔림',depth:{sellable:12,excluded:true,reason:'최근 거래 12건 · 기준 100건 미만으로 제외'}},
    {...base,id:'c',name:'미확인',depth:{sellable:null,excluded:false,reason:'거래량 미확인 · 제외하지 않음'}},
  ];
  const rows=productRows(products);
  assert.deepEqual(rows.map(r=>r.name),['잘팔림','미확인']);
  assert.equal(rows[0].cap,'250');
  assert.equal(rows[1].cap,'');
  assert.deepEqual(thin(products).map(t=>t.name),['안팔림']);
});
test('크레딧샵은 월 구매 한도와 거래량 중 작은 쪽을 상한으로 쓴다',()=>{
  const base={creditPrice:10000,price:'450000000',variants:[{}],comparisonComplete:true};
  const rows=creditRows([
    {...base,id:'x',name:'한도가 작음',monthlyLimit:5,depth:{sellable:250,excluded:false,reason:''}},
    {...base,id:'y',name:'거래량이 작음',monthlyLimit:500,depth:{sellable:120,excluded:false,reason:''}},
    {...base,id:'z',name:'둘 다 없음',monthlyLimit:null,depth:{sellable:null,excluded:false,reason:''}},
  ]);
  assert.deepEqual(rows.map(r=>r.cap),['5','120','']);
});
test('initial catalog read shows fixed products without triggering collection',async()=>{
  const methods=[];
  const data=await readToday(async(_url,opts)=>{methods.push(opts.method);return {ok:true,json:async()=>({status:'NOT_REQUESTED',products:fixedProducts})};});
  assert.deepEqual(methods,['GET']);
  const rows=productRows(data.products);assert.equal(rows.length,4);
  assert.ok(rows.every(r=>r.meso===''&&!r.metadataPending&&r.earn===true));
  assert.deepEqual(rows.map(r=>r.cash),['2200','5900','1900','5400']);
});
test('automatic product controls and script are included once',()=>{
  const html=require('node:fs').readFileSync(require('node:path').join(__dirname,'../index.html'),'utf8');
  for(const id of ['cashShopControls','cashShopStatus','autoCashShop','cashShopPending','creditRows','creditShopStatus','creditExcluded','creditValue','ownCredit','minEarnCash']) assert.equal(html.split('id="'+id+'"').length-1,1);
  assert.equal(html.split('src="cash-shop.js"').length-1,1);
  // 폐지된 마일리지 병용 입력이 남아 있지 않아야 한다.
  for(const id of ['ownMileage','mileRate','reuseMileage','earnOnCashOnly','marketMile']) assert.equal(html.includes('id="'+id+'"'),false);
});
