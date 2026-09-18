(function(root) {
  const fixedProducts = ['메이플 로얄 스타일','플래티넘 카르마의 가위','프리미엄 마스터피스','위습의 원더베리'].map((name,i) => ({
    id:'fixed-'+i, name, cashPrice:[2200,5900,1900,5400][i], creditEarns:true, price:null, variants:[{label:'단품',components:[]}], comparisonComplete:false,
  }));
  // 공식 개편(2026-09-17): 결제액 5%가 메이플크레딧으로 적립되고 크레딧샵에서만 사용한다.
  const defaultPolicy = {earnRate:0.05, minCashForEarn:10};
  // 서버가 붙인 거래량 판정. excluded면 계산에서 빼고, sellable이 있으면 최대 수량 기본값으로 쓴다.
  const depthCap = p => p.depth && typeof p.depth.sellable === 'number' ? String(p.depth.sellable) : '';
  const tradable = products => (products || []).filter(p => !(p.depth && p.depth.excluded));
  const thin = products => (products || []).filter(p => p.depth && p.depth.excluded)
    .map(p => ({ name: p.name, reason: p.depth.reason }));
  function productRows(products) {
    return tradable(products).map(p => ({
      cashShopId: p.id,
      name: p.name + (p.variants.length > 1 && p.selected ? ' · ' + p.selected : ''),
      cash: p.cashPrice == null ? '' : String(p.cashPrice),
      meso: p.price != null && /^\d+$/.test(p.price) && Number.isSafeInteger(Number(p.price)) && Number(p.price)>0 ? p.price : '', cap: depthCap(p),
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
      // 월 구매 한도와 최근 거래량 중 작은 쪽이 실제 상한이다.
      cap: [p.monthlyLimit, p.depth && p.depth.sellable].filter(v => typeof v === 'number').length
        ? String(Math.min(...[p.monthlyLimit, p.depth && p.depth.sellable].filter(v => typeof v === 'number'))) : '',
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
  async function fetchToday({fetcher = fetch, wait = ms => new Promise(r => setTimeout(r, ms)), onStatus = () => {}, stillCurrent = () => true} = {}) {
    const started = Date.now(); let trigger = true;
    while (Date.now() - started < 15 * 60 * 1000) {
      if (!stillCurrent()) throw new Error('입력이 변경되었습니다. 다시 계산해주세요.');
      const response = await fetcher('/api/cash-shop', {method: trigger ? 'POST' : 'GET', cache: 'no-store', signal: AbortSignal.timeout(10000)});
      const data = await response.json();
      if (!response.ok && response.status !== 409) throw new Error(data.error || '옥션 수집 서버에 연결할 수 없습니다.');
      if (['SUCCESS','PARTIAL','FAIL','INTERRUPTED'].includes(data.status)) return data;
      trigger = data.status === 'BUSY' || data.status === 'NOT_REQUESTED';
      onStatus(data.status === 'BUSY' ? '기존 옥션 수집이 끝나기를 기다리고 있습니다…' : '오늘의 캐시 상품과 구성품 시세를 확인하고 있습니다…');
      await wait(2500);
    }
    throw new Error('수집이 진행 중입니다. 잠시 후 계산을 다시 요청해주세요. 진행 중인 작업은 중복 실행되지 않습니다.');
  }
  const api = {productRows, creditRows, thin, fetchToday, readToday, fixedProducts, defaultPolicy};
  if(typeof module === 'object') module.exports = api;
  else root.CashShop = api;
})(typeof window === 'undefined' ? globalThis : window);
