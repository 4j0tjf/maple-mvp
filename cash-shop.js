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
  // 실제 판매되는 구성품 이름을 보존해 단품/묶음/결제 수단 사이의 수요를 합산한다.
  function saleComponents(product, depths) {
    const selected = product.variants.find(v => v.label === product.selected) || product.variants[0];
    return (selected?.components || []).map(c => {
      const depth = depths.find(d => d.name === c.name);
      return { name: c.name, quantity: c.quantity, price: Number(c.quote?.price),
        volume: depth ? (depth.recentQuantity ?? depth.recentSales) : null,
        windowDays: depth?.windowDays ?? 7 };
    });
  }
  function productRows(products, depths = []) {
    return tradable(products).map(p => ({
      cashShopId: p.id,
      name: p.name + (p.variants.length > 1 && p.selected ? ' · ' + p.selected : ''),
      cash: p.cashPrice == null ? '' : String(p.cashPrice),
      meso: p.price != null && /^\d+$/.test(p.price) && Number.isSafeInteger(Number(p.price)) && Number(p.price)>0 ? p.price : '', cap: '',
      earn: p.creditEarns === true,
      depth: p.depth || null,
      components: saleComponents(p, depths),
      metadataPending: p.cashPrice == null || p.creditEarns == null,
      comparisonComplete: p.comparisonComplete,
    }));
  }
  function creditRows(products, depths = []) {
    return tradable(products).map(p => ({
      cashShopId: 'credit-' + p.id,
      name: p.name + (p.variants.length > 1 && p.selected ? ' · ' + p.selected : ''),
      credit: p.creditPrice == null ? '' : String(p.creditPrice),
      meso: p.price != null && /^\d+$/.test(p.price) && Number.isSafeInteger(Number(p.price)) && Number(p.price)>0 ? p.price : '',
      // 월 구매 한도는 규칙이라 모드와 무관하게 늘 적용된다. 거래량 상한은 계산할 때 따로 건다.
      cap: typeof p.monthlyLimit === 'number' ? String(p.monthlyLimit) : '',
      metadataPending: p.creditPrice == null,
      depth: p.depth || null,
      components: saleComponents(p, depths),
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
  /** 아직 오늘 결과가 없어 수집을 시작해 볼 만한 상태인지. 실제 판단은 서버가 한다. */
  const needsCollection = data => !['SUCCESS', 'PARTIAL', 'RUNNING'].includes(data.status);

  /**
   * 그날 첫 방문이면 수집을 시작한다. 계산 버튼을 누르지 않아도 된다.
   *
   * 워커의 정해진 시각에만 돌리면 그때 크롬이 꺼져 있을 때 하루를 날린다. 사람이
   * 사이트를 보는 시점은 그 PC가 켜져 있다는 뜻이라 성공 확률이 높다.
   *
   * 시작해도 되는지는 서버가 정한다(식힘 시간, 횟수 상한). 여기서는 눌러 보기만 하고,
   * 서버가 아직 아니라고 하면 저장된 결과가 그대로 돌아온다. 실패해도 조용히 넘어간다.
   * 보기만 하러 온 사람에게 오류를 띄울 이유가 없다.
   */
  async function startIfNeeded(data, fetcher = fetch) {
    if (!needsCollection(data)) return null;
    try {
      const response = await fetcher('/api/cash-shop', { method: 'POST', cache: 'no-store', signal: AbortSignal.timeout(10000) });
      const started = await response.json();
      return response.ok || response.status === 409 ? started : null;
    } catch { return null; }
  }

  const api = {productRows, creditRows, thin, fetchToday, readToday, startIfNeeded, needsCollection, fixedProducts, defaultPolicy};
  if(typeof module === 'object') module.exports = api;
  else root.CashShop = api;
})(typeof window === 'undefined' ? globalThis : window);
