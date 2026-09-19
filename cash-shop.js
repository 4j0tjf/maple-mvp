(function(root) {
  const fixedProducts = ['메이플 로얄 스타일','플래티넘 카르마의 가위','프리미엄 마스터피스','위습의 원더베리'].map((name,i) => ({
    id:'fixed-'+i, name, cashPrice:[2200,5900,1900,5400][i], creditEarns:true, price:null, variants:[{label:'단품',components:[]}], comparisonComplete:false,
  }));
  // 공식 개편(2026-09-17): 결제액 5%가 메이플크레딧으로 적립되고 크레딧샵에서만 사용한다.
  const defaultPolicy = {earnRate:0.05, minCashForEarn:10};
  // 서버가 붙인 거래량 판정. excluded면 계산에서 아예 뺀다.
  //
  // sellable은 '최대 수량' 칸에 미리 넣지 않는다. 계산이 두 가지이기 때문이다.
  //   1. 최고 효율      — 거래량으로 수량을 묶지 않는다
  //   2. 판매량 고려    — sellable × 판매 점유율을 상한으로 쓴다
  // 칸에 넣어 버리면 1번까지 거래량에 묶인다. 판정은 row.depth로 그대로 넘겨
  // 계산할 때 모드별로 쓴다. '최대 수량' 칸은 사용자가 직접 정하는 한도로 남긴다.
  const tradable = products => (products || []).filter(p => !(p.depth && p.depth.excluded));
  const thin = products => (products || []).filter(p => p.depth && p.depth.excluded)
    .map(p => ({ name: p.name, reason: p.depth.reason }));
  function productRows(products) {
    return tradable(products).map(p => ({
      cashShopId: p.id,
      name: p.name + (p.variants.length > 1 && p.selected ? ' · ' + p.selected : ''),
      cash: p.cashPrice == null ? '' : String(p.cashPrice),
      meso: p.price != null && /^\d+$/.test(p.price) && Number.isSafeInteger(Number(p.price)) && Number(p.price)>0 ? p.price : '', cap: '',
      earn: p.creditEarns === true,
      depth: p.depth || null,
      metadataPending: p.cashPrice == null || p.creditEarns == null,
      comparisonComplete: p.comparisonComplete,
    }));
  }
  function creditRows(products) {
    return tradable(products).map(p => ({
      cashShopId: 'credit-' + p.id,
      name: p.name + (p.variants.length > 1 && p.selected ? ' · ' + p.selected : ''),
      credit: p.creditPrice == null ? '' : String(p.creditPrice),
      meso: p.price != null && /^\d+$/.test(p.price) && Number.isSafeInteger(Number(p.price)) && Number(p.price)>0 ? p.price : '',
      // 월 구매 한도는 규칙이라 모드와 무관하게 늘 적용된다. 거래량 상한은 계산할 때 따로 건다.
      cap: typeof p.monthlyLimit === 'number' ? String(p.monthlyLimit) : '',
      metadataPending: p.creditPrice == null,
      depth: p.depth || null,
      comparisonComplete: p.comparisonComplete,
    }));
  }
  async function readToday(fetcher = fetch) {
    const response = await fetcher('/api/cash-shop', {method:'GET',cache:'no-store',signal:AbortSignal.timeout(10000)});
    const data = await response.json();
    if(!response.ok) throw new Error(data.error || '상품 목록을 불러오지 못했습니다.');
    return data;
  }
  const DONE = ['SUCCESS','PARTIAL','FAIL','INTERRUPTED'];
  /**
   * 오늘 시세를 확보한다. 이미 있으면 그대로 쓰고, 없을 때만 수집을 시작한다.
   *
   * 예전에는 무조건 POST부터 했다. 외부 공개 주소에서는 서버가 그 POST를 막는데
   * (검색 횟수를 외부인이 대신 쓰지 못하게 한다), 오늘 결과가 이미 저장돼 있어도
   * 그 거절을 그대로 오류로 올려 계산 자체가 멈췄다. 수집은 워커가 하루 1회 돌리므로
   * 읽기가 먼저다.
   */
  async function fetchToday({fetcher = fetch, wait = ms => new Promise(r => setTimeout(r, ms)), onStatus = () => {}, stillCurrent = () => true} = {}) {
    const started = Date.now();
    let data = await readToday(fetcher);
    if (DONE.includes(data.status)) return data;

    // 오늘 수집이 아직 없다. 시작을 요청한다. 409는 이미 돌고 있다는 뜻이라 오류가 아니다.
    if (data.status === 'NOT_REQUESTED') {
      const response = await fetcher('/api/cash-shop', {method: 'POST', cache: 'no-store', signal: AbortSignal.timeout(10000)});
      const started_ = await response.json();
      if (!response.ok && response.status !== 409) throw new Error(started_.error || '옥션 수집 서버에 연결할 수 없습니다.');
      if (DONE.includes(started_.status)) return started_;
    }

    while (Date.now() - started < 15 * 60 * 1000) {
      if (!stillCurrent()) throw new Error('입력이 변경되었습니다. 다시 계산해주세요.');
      onStatus(data.status === 'BUSY' ? '기존 옥션 수집이 끝나기를 기다리고 있습니다…' : '오늘의 캐시 상품과 구성품 시세를 확인하고 있습니다…');
      await wait(2500);
      data = await readToday(fetcher);
      if (DONE.includes(data.status)) return data;
    }
    throw new Error('수집이 진행 중입니다. 잠시 후 계산을 다시 요청해주세요. 진행 중인 작업은 중복 실행되지 않습니다.');
  }
  const api = {productRows, creditRows, thin, fetchToday, readToday, fixedProducts, defaultPolicy};
  if(typeof module === 'object') module.exports = api;
  else root.CashShop = api;
})(typeof window === 'undefined' ? globalThis : window);
