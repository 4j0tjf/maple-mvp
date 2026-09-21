const $ = s => document.querySelector(s);
const num = v => { const value = String(v ?? '').trim().replace(/,/g,''); return value === '' ? 0 : /^-?\d+(?:\.\d+)?$/.test(value) ? Number(value) : NaN; };
const comma = n => Math.round(n).toLocaleString('ko-KR');
const fx = (n, d = 2) => Number.isFinite(n) ? n.toFixed(d) : '—';
const esc = s => String(s).replace(/[&<>"']/g, m => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[m]));

function bindNum(el, live = false){
  if (!el) return;
  if (live) {
    const format = () => {
      const before = el.value, raw = before.replace(/,/g,'');
      // Preserve incomplete decimals and invalid input for normal validation.
      if (!/^-?\d+(?:\.\d*)?$/.test(raw)) return;
      const [integer, fraction] = raw.split('.');
      const formatted = integer.replace(/\B(?=(\d{3})+(?!\d))/g,',') + (fraction === undefined ? '' : '.'+fraction);
      if (formatted === before) return;
      const start = before.slice(0,el.selectionStart ?? before.length).replace(/,/g,'').length;
      const end = before.slice(0,el.selectionEnd ?? before.length).replace(/,/g,'').length;
      const position = count => {
        let i=0, seen=0;
        while(i<formatted.length && seen<count) { if(formatted[i]!==',') seen++; i++; }
        return i;
      };
      el.value = formatted;
      if (document.activeElement === el) el.setSelectionRange(position(start),position(end));
    };
    format();
    el.addEventListener('input', event => { if(!event.isComposing) format(); });
    el.addEventListener('compositionend', format);
    el.addEventListener('blur', format);
    el.addEventListener('focus', () => el.select());
    return;
  }
  el.addEventListener('focus', () => { el.value = el.value.trim() === '' || !Number.isFinite(num(el.value)) ? el.value : String(num(el.value)); el.select(); });
  el.addEventListener('blur',  () => { el.value = el.value.trim() === '' || !Number.isFinite(num(el.value)) ? el.value : num(el.value).toLocaleString('ko-KR',{maximumFractionDigits:10}); });
}
['chargeWon','ownCash','ownCredit','mesoPrice','mesoMarket','marketCap'].forEach(id => bindNum($('#'+id)));

const SET_IDS = ['chargeRatio','chargeWon','ownCash','ownCredit','earnRate','minEarnCash','fee','mesoPrice','mesoMarket','marketCap','earnCap','sellShare','tierWidth','tierDrop'];
const CHK_IDS = ['useMarket','marketEarn'];

function settings(){
  return {
    r: num($('#chargeRatio').value) / 100,
    earn: num($('#earnRate').value) / 100,
    minEarnCash: num($('#minEarnCash').value),
    fee: num($('#fee').value) / 100,
    chargeWon: num($('#chargeWon').value),
    ownCash: num($('#ownCash').value),
    ownCredit: num($('#ownCredit').value),
    mesoPrice: num($('#mesoPrice').value),
    mesoMarket: num($('#mesoMarket').value),
    marketCap: $('#marketCap').value.trim() === '' ? Infinity : num($('#marketCap').value),
    useMarket: $('#useMarket').checked,
    marketEarn: $('#marketEarn').checked,
    earnCap: $('#earnCap').value.trim() === '' ? Infinity : num($('#earnCap').value),
    // 최근 7일 거래량 중 내가 차지할 수 있다고 보는 몫. 판매량 고려 모드에서만 쓴다.
    sellShare: num($('#sellShare').value) / 100,
    // 단가 하락 반영 모드의 물량 구간 폭과 구간당 하락률.
    tierWidth: num($('#tierWidth').value) / 100,
    tierDrop: num($('#tierDrop').value) / 100
  };
}

const mesoToWon = (meso, s) => meso / 1e8 * s.mesoPrice;
function recovery(c, m, s){
  const inWon = c * s.r;
  return inWon > 0 ? mesoToWon(m, s) / inWon * 100 : NaN;
}
function baseline(s){
  if (!(s.mesoMarket > 0) || !(s.r > 0) || !(s.mesoPrice > 0)) return NaN;
  return recovery(s.mesoMarket, 1e8, s);
}

/* ===================== 아이템 행 ===================== */
const EXAMPLE = [
  { name:'예시 A · 고가 가위템',   cash:'3,300', meso:'500,000,000', cap:''   },
  { name:'예시 B · 중가 소모품',   cash:'1,600', meso:'230,000,000', cap:'50' },
  { name:'예시 C · 적립 제외 상품', cash:'2,200', meso:'340,000,000', cap:'', earn:false }
];
const CREDIT_EXAMPLE = [
  { name:'예시 · 크레딧샵 상품 A', credit:'10,000', meso:'450,000,000', cap:'5' },
  { name:'예시 · 크레딧샵 상품 B', credit:'4,900',  meso:'150,000,000', cap:''  }
];

function autoNote(tr, d){
  if (!d.cashShopId) return;
  tr.dataset.cashShopId = d.cashShopId;
  tr.dataset.metadataPending = d.metadataPending === false ? 'false' : 'true';
  // 판매량 고려 모드가 쓰는 값. 칸에 넣지 않고 행에 붙여 둔다.
  if (d.depth && typeof d.depth.sellable === 'number') tr.dataset.sellable = String(d.depth.sellable);
  const note = document.createElement('small'); note.className = 'f-auto-status';
  note.style.display = 'block'; note.style.fontSize = '13px';
  note.textContent = d.rowStatus || '자동 상품'; tr.cells[0].appendChild(note);
  tr.querySelector('.f-meso').placeholder = d.meso ? '' : (d.pricePlaceholder || '시세 미수집');
}

function addRow(d = {}){
  if ($('#rows').children.length >= 30) { showError('캐시 상품은 최대 30개까지 입력할 수 있습니다.'); return null; }
  const tr = document.createElement('tr');
  tr.innerHTML =
    '<td><input type="text" class="name f-name" placeholder="아이템 이름"></td>' +
    '<td><input type="text" class="f-cash" placeholder="3,300"></td>' +
    '<td><input type="text" class="f-meso" placeholder="500,000,000"></td>' +
    '<td><input type="text" class="f-cap" placeholder="무제한"></td>' +
    '<td><input type="checkbox" class="f-earn" checked aria-label="크레딧 적립 대상"></td>' +
    '<td class="effcell bad">—</td>' +
    '<td class="f-rr">—</td>' +
    '<td><button class="del" title="행 삭제">×</button></td>';
  tr.querySelector('.f-name').value = d.name ?? '';
  tr.querySelector('.f-cash').value = d.cash ?? '';
  tr.querySelector('.f-meso').value = d.meso ?? '';
  tr.querySelector('.f-cap').value  = d.cap  ?? '';
  tr.querySelector('.f-earn').checked = d.earn !== false;
  autoNote(tr, d);
  if (d.cashShopId) tr.querySelector('.f-cash').placeholder = '원가 확인 필요';
  [['.f-name','아이템 이름'],['.f-cash','캐시 원가'],['.f-meso','경매장 예상가'],['.f-cap','최대 수량']].forEach(([sel,label])=>tr.querySelector(sel).setAttribute('aria-label',label));
  ['.f-cash','.f-meso'].forEach(sel => bindNum(tr.querySelector(sel),true));
  bindNum(tr.querySelector('.f-cap'));
  tr.querySelector('.del').onclick = () => { tr.remove(); if(!$('#rows').children.length) addRow(); refresh(); };
  tr.addEventListener('input', refresh);
  $('#rows').appendChild(tr);
  return tr;
}

function addCreditRow(d = {}){
  if ($('#creditRows').children.length >= 30) { showError('크레딧샵 상품은 최대 30개까지 입력할 수 있습니다.'); return null; }
  const tr = document.createElement('tr');
  tr.innerHTML =
    '<td><input type="text" class="name f-name" placeholder="크레딧샵 상품 이름"></td>' +
    '<td><input type="text" class="f-credit" placeholder="10,000"></td>' +
    '<td><input type="text" class="f-meso" placeholder="450,000,000"></td>' +
    '<td><input type="text" class="f-cap" placeholder="무제한"></td>' +
    '<td class="effcell bad">—</td>' +
    '<td><button class="del" title="행 삭제">×</button></td>';
  tr.querySelector('.f-name').value   = d.name ?? '';
  tr.querySelector('.f-credit').value = d.credit ?? '';
  tr.querySelector('.f-meso').value   = d.meso ?? '';
  tr.querySelector('.f-cap').value    = d.cap ?? '';
  autoNote(tr, d);
  if (d.cashShopId) tr.querySelector('.f-credit').placeholder = '크레딧 가격 확인 필요';
  [['.f-name','상품 이름'],['.f-credit','크레딧 가격'],['.f-meso','경매장 예상가'],['.f-cap','월 구매 한도']].forEach(([sel,label])=>tr.querySelector(sel).setAttribute('aria-label',label));
  ['.f-credit','.f-meso'].forEach(sel => bindNum(tr.querySelector(sel),true));
  bindNum(tr.querySelector('.f-cap'));
  tr.querySelector('.del').onclick = () => { tr.remove(); refresh(); };
  tr.addEventListener('input', refresh);
  $('#creditRows').appendChild(tr);
  return tr;
}

const readRows = () => [...$('#rows').children].map(tr => ({
  tr,
  name: tr.querySelector('.f-name').value.trim() || '(이름 없음)',
  c:    num(tr.querySelector('.f-cash').value),
  gross:num(tr.querySelector('.f-meso').value),
  cap:  tr.querySelector('.f-cap').value.trim() === '' ? Infinity : num(tr.querySelector('.f-cap').value),
  sellable: tr.dataset.sellable ? Number(tr.dataset.sellable) : null,
  earn: tr.querySelector('.f-earn').checked,
  ready: !tr.dataset.cashShopId || (tr.dataset.metadataPending === 'false' && num(tr.querySelector('.f-cash').value)>0 && num(tr.querySelector('.f-meso').value)>0)
}));
const readCreditRows = () => [...$('#creditRows').children].map(tr => ({
  tr,
  name: tr.querySelector('.f-name').value.trim() || '(이름 없음)',
  k:    num(tr.querySelector('.f-credit').value),
  gross:num(tr.querySelector('.f-meso').value),
  cap:  tr.querySelector('.f-cap').value.trim() === '' ? Infinity : num(tr.querySelector('.f-cap').value),
  sellable: tr.dataset.sellable ? Number(tr.dataset.sellable) : null,
  ready: !tr.dataset.cashShopId || (tr.dataset.metadataPending === 'false' && num(tr.querySelector('.f-credit').value)>0 && num(tr.querySelector('.f-meso').value)>0)
}));

/* ===================== 실시간 갱신 ===================== */
function refresh(){
  inputVersion++;
  if (activeWorker) { cancelCalculation(); }
  $('#result').style.display = 'none';
  $('#calcStatus').textContent = '';
  $('#chargeHint').textContent = '1,000캐시 = ' + comma(num($('#chargeRatio').value)*10) + '원';
  const s = settings(), base = baseline(s);

  if (Number.isFinite(base)){
    const buyWon = s.mesoMarket * s.r, sellWon = mesoToWon(1e8, s), diff = sellWon - buyWon;
    $('#effVal').textContent = fx(base, 1) + '%';
    $('#effVal').style.color = base >= 100 ? 'var(--green)' : 'var(--orange)';
    $('#effA').textContent = comma(buyWon) + '원';
    $('#effB').textContent = comma(sellWon) + '원';
    $('#effC').textContent = (diff >= 0 ? '+' : '') + comma(diff) + '원';
    $('#effC').style.color = diff >= 0 ? 'var(--green)' : 'var(--red)';
  } else {
    ['#effVal','#effA','#effB','#effC'].forEach(k => $(k).textContent = '—');
  }

  const bar = s.useMarket && Number.isFinite(base) ? base : 100;
  readRows().forEach(it => {
    const ec = it.tr.querySelector('.effcell'), rc = it.tr.querySelector('.f-rr');
    if (it.c > 0 && it.gross > 0){
      const m = it.gross * (1 - s.fee);
      ec.textContent = comma(m / it.c); ec.className = 'effcell';
      const pure = recovery(it.c, m, s);
      const credit = it.earn && it.c >= s.minEarnCash ? Math.floor(it.c * s.earn + 1e-7) : 0;
      rc.innerHTML = '<span class="rr" style="color:' + (pure >= bar ? 'var(--green)' : 'var(--red)') + '">' +
        fx(pure, 1) + '%</span>' + (credit > 0 ? '<small>적립 ' + comma(credit) + ' 크레딧</small>' : '<small>적립 없음</small>');
    } else {
      ec.textContent = '—'; ec.className = 'effcell bad'; rc.textContent = '—';
    }
  });
  // 크레딧 상품의 효율은 캐시 회수율이 아니라 메소/크레딧으로 비교한다.
  let bestCredit = 0;
  readCreditRows().forEach(it => {
    const ec = it.tr.querySelector('.effcell');
    if (it.k > 0 && it.gross > 0){
      const value = it.gross * (1 - s.fee) / it.k;
      bestCredit = Math.max(bestCredit, value);
      ec.textContent = comma(value); ec.className = 'effcell';
    } else { ec.textContent = '—'; ec.className = 'effcell bad'; }
  });
  $('#creditValue').textContent = bestCredit > 0
    ? '최고 효율 ' + comma(bestCredit) + ' 메소/크레딧 · 1,000크레딧 ≈ ' + comma(mesoToWon(bestCredit*1000, s)) + '원'
    : '크레딧샵 상품의 시세를 입력하면 적립 크레딧의 가치를 계산합니다.';
  save();
}

/* ===================== 계산 ===================== */
function applyCashShop(data) {
  const rows = CashShop.productRows(data.products || CashShop.fixedProducts);
  const creditRows = CashShop.creditRows(data.creditProducts);
  const thin = [...CashShop.thin(data.products), ...CashShop.thin(data.creditProducts)];
  const previous = new Map([...$('#rows').children,...$('#creditRows').children].filter(tr => tr.dataset.cashShopId).map(tr => [tr.dataset.cashShopId,tr.querySelector('.f-cap').value]));
  const manual = [...$('#rows').children].filter(tr => !tr.dataset.cashShopId && [...tr.querySelectorAll('input[type=text]')].some(i => i.value.trim()));
  const manualCredit = [...$('#creditRows').children].filter(tr => !tr.dataset.cashShopId && [...tr.querySelectorAll('input[type=text]')].some(i => i.value.trim()));
  if (manual.length + rows.length > 30) throw new Error('자동 상품과 직접 입력 상품이 30개를 넘습니다. 직접 입력 상품을 줄여주세요.');
  if (manualCredit.length + creditRows.length > 30) throw new Error('크레딧샵 상품이 30개를 넘습니다. 직접 입력 상품을 줄여주세요.');
  [...$('#rows').children].filter(tr => !manual.includes(tr)).forEach(tr => tr.remove());
  [...$('#creditRows').children].filter(tr => !manualCredit.includes(tr)).forEach(tr => tr.remove());
  const failed = ['FAIL','INTERRUPTED'].includes(data.status);
  const priceStatus = row => [!row.meso ? (failed ? '시세 수집 실패' : data.status==='RUNNING' ? '시세 수집 중' : ['SUCCESS','PARTIAL'].includes(data.status) ? '시세 없음' : '첫 계산 시 시세 조회') : !row.comparisonComplete ? '일부 선택지 시세 없음' : ''].filter(Boolean);
  rows.forEach(r => addRow({...r, cap:previous.get(r.cashShopId) || r.cap || '',
    rowStatus: [r.metadataPending ? '원가·적립 확인 필요' : '자동 상품', ...priceStatus(r), r.depth && typeof r.depth.sellable === 'number' ? '최근 ' + r.depth.sellable.toLocaleString('ko-KR') + '건 거래' : ''].filter(Boolean).join(' · '),
    pricePlaceholder:failed ? '시세 수집 실패' : '시세 미수집',
  }));
  creditRows.forEach(r => addCreditRow({...r, cap:previous.get(r.cashShopId) ?? r.cap ?? '',
    rowStatus: [r.metadataPending ? '크레딧 가격 확인 필요' : '오늘 구매 대상', ...priceStatus(r), r.depth && typeof r.depth.sellable === 'number' ? '최근 ' + r.depth.sellable.toLocaleString('ko-KR') + '건 거래' : ''].filter(Boolean).join(' · '),
    pricePlaceholder:failed ? '시세 수집 실패' : '시세 미수집',
  }));
  refresh();
  if (data.depthPolicy) {
    if (typeof data.depthPolicy.minRecentSales === 'number') depthMin = data.depthPolicy.minRecentSales;
    if (typeof data.depthPolicy.windowDays === 'number') depthWindow = data.depthPolicy.windowDays;
  }
  const ready = rows.filter(r => !r.metadataPending && r.meso);
  const screening = data.creditScreening;
  $('#cashShopStatus').textContent = `${rows.length}개 상품 등록 · 계산 가능 ${ready.length}개` +
    (data.capturedAt ? ` · ${new Date(data.capturedAt).toLocaleString('ko-KR')} 조회` : '') +
    (data.pending?.length ? ` · 판매 공지 ${data.pending.length}건 구성 확인 대기` : '') +
    (failed ? ' · 오늘 시세 수집에 실패했습니다. 목록은 유지하며 자동 재검색하지 않습니다.' : data.status==='NOT_REQUESTED' ? ' · 계산 버튼을 누르면 오늘 시세를 조회합니다.' : '') +
    (thin.length ? ` · 최근 거래 부족으로 ${thin.length}개 제외` : '') +
    (data.depthPolicy ? ` · 최근 ${data.depthPolicy.windowDays}일 ${data.depthPolicy.minRecentSales}건 미만 제외` : '');
  $('#creditShopStatus').textContent = data.creditCatalogError ? data.creditCatalogError
    : screening ? `크레딧샵 ${screening.day} 효율 확정 · 전체 ${screening.entries.length}종 중 상위 ${screening.keptCount}종이 오늘 구매 대상입니다.`
    : data.creditCatalogCount ? `크레딧샵 ${data.creditCatalogCount}종 등록 · 오늘 효율 순위가 아직 확정되지 않았습니다. 다음 수집에서 전 상품을 조회합니다.`
    : '등록된 크레딧샵 상품이 없습니다. 관리자 화면에서 목록을 넣으면 매일 1회 전수 조회 후 상위 절반을 구매 대상으로 추립니다.';
  const excluded = (screening?.entries || []).filter(e => !e.kept);
  $('#creditExcluded').replaceChildren();
  excluded.forEach(e => { const li = document.createElement('li'); li.textContent = `${e.name} · ${e.creditPrice.toLocaleString('ko-KR')} 크레딧 · ${e.reason}`; $('#creditExcluded').appendChild(li); });
  const thinBox = $('#thinMarket'); thinBox.replaceChildren();
  $('#thinMarketBox').hidden = !thin.length;
  thin.forEach(t => { const li = document.createElement('li'); li.textContent = t.name + ' — ' + t.reason; thinBox.appendChild(li); });
  const pending = $('#cashShopPending'); pending.replaceChildren();
  (data.pending || []).forEach(p => { const li = document.createElement('li'); li.textContent=p.title+' — '+(p.reasons?.join(' / ') || '구성 확인 대기'); pending.appendChild(li); });
  return ready.length;
}
async function calculate(){
  if (activeWorker || loadingCashShop) return;
  if ($('#autoCashShop').checked) {
    loadingCashShop = true;
    $('#bCalc').disabled = true;
    const versionBeforeFetch = inputVersion;
    try {
      const data = await CashShop.fetchToday({ onStatus: text => $('#cashShopStatus').textContent = text, stillCurrent: () => inputVersion === versionBeforeFetch && $('#autoCashShop').checked });
      if (inputVersion !== versionBeforeFetch) throw new Error('입력이 변경되었습니다. 다시 계산해주세요.');
      applyCashShop(data);
      if (['FAIL','INTERRUPTED'].includes(data.status)) throw new Error(data.error || '오늘 시세 수집에 실패했습니다. 자동 재검색하지 않습니다.');
    } catch(error) { showError(error.message); return; }
    finally { loadingCashShop = false; $('#bCalc').disabled = false; }
  }
  let s, raw, rawCredit;
  try {
    validateInputs(); s = settings();
    raw = readRows().filter(it => it.ready && it.c > 0 && it.gross > 0);
    rawCredit = readCreditRows().filter(it => it.ready && it.k > 0 && it.gross > 0);
  }
  catch(error) { showError(error.message); return; }
  const cashCands = raw.map(it => ({ name:it.name, mm:false, kind:'cash', earn:it.earn, c:it.c, m:Math.floor(it.gross*(1-s.fee)), cap:it.cap, sellable:it.sellable }));
  if (s.useMarket) cashCands.push({ name:'메소마켓 (메포 → 1억 메소)', mm:true, kind:'cash', earn:s.marketEarn, c:s.mesoMarket, m:1e8, cap:s.marketCap, sellable:null });
  const creditCands = rawCredit.map(it => ({ name:it.name, mm:false, kind:'credit', k:it.k, m:Math.floor(it.gross*(1-s.fee)), cap:it.cap, sellable:it.sellable }));
  if (!cashCands.length && !creditCands.length) { showError('아이템을 입력하거나 메소마켓을 활성화하세요.'); return; }
  const chargeCash = Math.floor(s.chargeWon/s.r);
  const totalCash = s.ownCash + chargeCash;
  const version = inputVersion;
  let results;
  try {
    $('#calcStatus').textContent = '구매 가능한 조합과 순서를 계산하고 있습니다…';
    $('#bCalc').disabled = true;
    const shared = { cash:totalCash, credit:s.ownCredit, earn:s.earn, minEarnCash:s.minEarnCash, earnCap:s.earnCap };
    // 1. 최고 효율 — 입력한 한도만 지키고 거래량으로는 수량을 묶지 않는다.
    const efficiency = await runOptimizer({ ...shared, items:cashCands, creditItems:creditCands });
    if (version !== inputVersion) { $('#calcStatus').textContent = '입력이 변경되었습니다. 다시 계산해주세요.'; return; }
    // 2. 판매량 고려 — 7일 거래량 중 판매 점유율만큼만 실제로 팔 수 있다고 본다.
    $('#calcStatus').textContent = '판매량을 반영한 조합을 계산하고 있습니다…';
    const volume = await runOptimizer({ ...shared, items:cashCands.map(capBySales(s)), creditItems:creditCands.map(capBySales(s)) });
    if (version !== inputVersion) { $('#calcStatus').textContent = '입력이 변경되었습니다. 다시 계산해주세요.'; return; }
    // 3. 단가 하락 반영 — 못 파는 지점이 아니라 싸게 팔리는 지점으로 본다.
    $('#calcStatus').textContent = '물량에 따른 단가 하락을 반영하고 있습니다…';
    const tierBase = new Map();
    // 구간 분할은 계산 모델이라 엔진(optimizer.js)에 있다. 화면은 그것을 부르기만 한다.
    const { expandTiers, mergeTiers } = MvpOptimizer;
    const tiered = mergeTiers(
      await runOptimizer({ ...shared, items: expandTiers(cashCands, s, tierBase), creditItems: expandTiers(creditCands, s, tierBase) }),
      tierBase,
    );
    results = { efficiency, volume, tiered };
  } catch(error) { showError(error.message); return; }
  finally { $('#bCalc').disabled = false; }
  if (version !== inputVersion) { $('#calcStatus').textContent = '입력이 변경되었습니다. 다시 계산해주세요.'; return; }
  lastRun = { results, s };
  renderMode(activeMode);
  $('#result').scrollIntoView({ behavior:'smooth', block:'start' });
}

/** 두 모드의 결과를 나란히 비교한다. 탭을 바꾸지 않아도 차이를 볼 수 있게 한다. */
function renderCompare({ results, s }) {
  const won = r => mesoToWon(r.meso, s);
  const rate = r => { const spent = r.usedCash * s.r; return spent > 0 ? won(r) / spent * 100 : NaN; };
  // 세 결과를 한 줄로 늘어놓아 어느 쪽이 얼마나 낙관적인지 바로 보이게 한다.
  $('#modeCompare').innerHTML = MODES.map(([key, label]) =>
    '<div><div class="k">' + label + '</div><div class="n ' + (key === activeMode ? 'c-org' : '') + '">'
    + fx(rate(results[key]), 2) + '<small>% · 회수 ' + comma(won(results[key])) + '원</small></div></div>'
  ).join('');
  const note = {
    efficiency: '<b>최고 효율</b>: 메소/캐시 효율만 봅니다. 수량을 거래량으로 묶지 않고 입력한 한도까지 삽니다. '
      + '실제로 그만큼 팔 수 있는지는 직접 확인해야 합니다. <b>상한선</b>으로 보세요.',
    volume: '<b>판매량 고려</b>: 최근 ' + depthWindow + '일 거래량의 <b>' + fx(s.sellShare * 100, 0)
      + '%</b>까지만 팔 수 있다고 보고 거기서 끊습니다. 그 지점을 넘는 물량은 아예 없는 것으로 칩니다.',
    tiered: '<b>단가 하락 반영</b>: 못 파는 지점이 아니라 <b>싸게 팔리는 지점</b>으로 봅니다. 거래량의 '
      + fx(s.tierWidth * 100, 0) + '%마다 단가가 ' + fx(s.tierDrop * 100, 0) + '%씩 떨어진다고 보고, '
      + '엔진이 한계 수익이 떨어지는 지점에서 스스로 멈춥니다. 세 모드 중 가장 현실에 가깝습니다.',
  }[activeMode];
  $('#modeNote').innerHTML = note + ' 최근 ' + depthWindow + '일 거래 ' + comma(depthMin)
    + '건 미만 상품은 세 모드 모두에서 제외합니다.';
}

/** 탭에 맞는 결과를 아래 카드들에 그린다. 계산은 이미 끝나 있어 즉시 바뀐다. */
function renderMode(mode) {
  activeMode = mode;
  for (const [key, , id] of MODES) {
    $('#' + id).classList.toggle('on', mode === key);
    $('#' + id).setAttribute('aria-selected', String(mode === key));
  }
  if (!lastRun) return;
  renderCompare(lastRun);
  renderPlan(lastRun.results[mode], lastRun);
}

function renderPlan(r, { s }) {
  $('#calcStatus').textContent = r.exact ? '입력한 조건에서 최대 메소 조합을 확인했습니다.' : '탐색 범위에서 찾은 추천 조합입니다. 전역 최적해는 보장하지 않습니다.';

  const chargeUsed = Math.max(0, r.usedCash - s.ownCash);
  const spentWon = r.usedCash * s.r;
  const newChargeWon = chargeUsed * s.r;
  const gotWon = mesoToWon(r.meso, s);
  const rate = spentWon > 0 ? gotWon / spentWon * 100 : NaN;
  const profit = gotWon - spentWon;
  const base = baseline(s);

  /*
   * 결론부터 놓고, 같은 값을 두 번 적지 않는다.
   *
   * 뺀 것과 이유:
   *   총 가용 캐시        전역 설정의 입력을 되풀이한 값이라 결과가 아니다.
   *   사용 넥슨캐시       사용 원가와 같은 양을 캐시 단위로 쓴 것이다. 원가 타일에 함께 적는다.
   *   필요 추가 충전액    보유 캐시를 쓰지 않으면 사용 원가와 늘 같은 값이다.
   *                       실제로 보유 캐시를 쓴 계획에서만 따로 보여준다.
   */
  $('#sumBox').innerHTML = [
    ['최종 회수율', fx(rate, 2), '%', rate >= 100 ? 'c-grn' : 'c-red'],
    ['환산 손익', (profit >= 0 ? '+' : '') + comma(profit), '원', profit >= 0 ? 'c-grn' : 'c-red'],
    ['회수 현금', comma(gotWon), '원', 'c-org'],
    ['총 획득 메소', comma(r.meso), '', 'c-org'],
    ['사용 캐시', comma(r.usedCash), '캐시 · 원가 ' + comma(spentWon) + '원', 'c-blue'],
    // 보유 캐시를 실제로 쓴 계획에서만. 아니면 위 원가와 같은 숫자가 한 번 더 나온다.
    ...(newChargeWon !== spentWon ? [['필요 추가 충전액', comma(newChargeWon), '원', '']] : []),
    ...(r.earned > 0 ? [['적립 크레딧', '+' + comma(r.earned), 'C', 'c-grn']] : []),
    ...(r.usedCredit > 0 ? [['사용 크레딧', comma(r.usedCredit), 'C', 'c-grn']] : []),
  ].map(([k, n, u, c]) =>
    '<div><div class="k">' + k + '</div><div class="n ' + c + '">' + n + (u ? '<small>' + u + '</small>' : '') + '</div></div>'
  ).join('');

  const sorted = [...r.lines].filter(l => l.qty > 0).sort((a, b) => b.meso - a.meso);
  /*
   * 미구매 목록.
   *
   * 같은 상품이 캐시 후보와 크레딧샵 후보로 따로 잡히므로 줄 단위로 세면 이름이 두 번 나온다.
   * 구분 표시도 없어 중복처럼 보였다. 이름으로 묶고, 한 쪽이라도 샀으면 그 이름은 뺀다.
   * 일부만 산 상품은 이미 구매 계획 표에 있다.
   */
  const boughtNames = new Set(r.lines.filter(l => l.qty > 0).map(l => l.name));
  const skipped = [...new Set(r.lines.filter(l => l.qty === 0).map(l => l.name))]
    .filter(name => !boughtNames.has(name));
  $('#planRows').innerHTML = sorted.map(l => {
    const z = v => v > 0 ? comma(v) : '<span class="zero">0</span>';
    return '<tr' + (l.mm ? ' class="mm"' : '') + '>' +
      '<td>' + esc(l.name) + (l.mm ? ' <small style="color:var(--mute);font-weight:400">· 1개 = 1억</small>' : '') + '</td>' +
      '<td class="' + (l.kind === 'credit' ? 'mi' : 'ca') + '">' + (l.kind === 'credit' ? '크레딧샵' : '캐시') + '</td>' +
      '<td style="font-weight:700">' + z(l.qty) + '</td>' +
      '<td>' + comma(l.usedCash) + '</td><td>' + comma(l.usedCredit) + '</td>' +
      '<td>' + comma(l.meso) + '</td><td>' + comma(mesoToWon(l.meso, s)) + '원</td></tr>';
  }).join('') || '<tr><td colspan="7" style="text-align:center;color:var(--mute);padding:20px">구매할 수 있는 조합이 없습니다</td></tr>';

  // 이번 계산에서만 해당하는 사실. 매번 달라지므로 펼쳐 둔다.
  const n = [];
  if (r.usedCredit > 0) n.push(['', '이 계획은 크레딧 <b>' + comma(r.usedCredit) + 'C</b>를 사용합니다. 보유 크레딧 ' + comma(s.ownCredit) + 'C와 적립분 ' + comma(r.earned) + 'C의 합 안에서만 구매할 수 있습니다.']);
  if (r.leftCredit > 0) n.push(['', '구매 후 남는 크레딧: <b>' + comma(r.leftCredit) + 'C</b>. 적립일로부터 1년 안에 크레딧샵에서 사용하세요.']);
  if (r.leftCash > 0) n.push(['', '남는 캐시: <b>' + comma(r.leftCash) + '</b>. 최대 회수액과 별개로 MVP 목표 금액만큼 소비했는지 확인하세요.']);
  if (skipped.length) n.push(['', '이번 조합에서 미구매 <b>' + skipped.length + '종</b>: ' + skipped.map(esc).join(', ') + '.']);
  const top = sorted.find(l=>!l.mm);
  if (top && top.qty > 5 && top.meso/r.meso > .7) n.push(['', '<b>' + esc(top.name) + '</b> ' + comma(top.qty) + '개를 입력한 시세에 판매할 수 있는지 확인하고, 판매 가능량을 최대 수량에 반영하세요.']);

  // 계산할 때마다 같은 내용. 결과를 가리지 않게 접어 둔다.
  // 최적해 여부는 버튼 아래 상태줄에도 같은 문장으로 나오므로 여기서는 접어도 잃는 정보가 없다.
  const fixed = [];
  fixed.push([r.exact ? 'ok' : '', r.exact ? '입력한 규칙·수량 한도에서 <b>획득 메소 최대 조합</b>을 확인했습니다.' : '계산량 제한 안에서 찾은 <b>추천 조합</b>입니다. 더 좋은 조합이 존재할 수 있습니다.']);
  fixed.push(['', '회수율은 <b>사용한 보유 캐시까지 포함한 환산 원가</b> 기준입니다. 실제 충전 예산은 ' + comma(s.chargeWon) + '원이며, 잔여 캐시는 회수 현금에 포함하지 않습니다. MVP 인정액은 상품·전환 조건을 별도로 확인해야 합니다.']);
  if (Number.isFinite(base) && s.useMarket) fixed.push(['', '메소마켓의 단위 회수율은 <b>' + fx(base,2) + '%</b>입니다. 수량 한도와 잔액을 고려한 전체 계획의 비교 결과는 아닙니다.']);
  // 순서는 늘 같다(캐시 전부 -> 크레딧샵). 표로 나열하지 않고 이 한 줄로 갈음한다.
  // 이 순서로 항상 실행 가능하다는 것은 optimizer.js가 보장하고 테스트로 확인한다.
  fixed.push(['', '<b>캐시 결제를 모두 마친 뒤</b> 적립된 크레딧으로 크레딧샵에서 구매하세요. 크레딧은 상품 가격을 대신 낼 수 없고 크레딧샵에서만 사용합니다.']);
  const asNotes = list => list.map(([c, t]) => '<div class="note ' + c + '">' + t + '</div>').join('');
  $('#notes').innerHTML = asNotes(n);
  $('#fixedNotes').innerHTML = asNotes(fixed);

  $('#result').style.display = 'block';
}

/* ===================== 저장 / 불러오기 ===================== */
const SKEY = 'mvp-calc-v5';
const snapshot = () => ({
  s: Object.fromEntries(SET_IDS.map(id => [id, $('#'+id).value])),
  chk: Object.fromEntries(CHK_IDS.map(id => [id, $('#'+id).checked])),
  items: [...$('#rows').children].map(tr => ({
    cashShopId: tr.dataset.cashShopId || null,
    name: tr.querySelector('.f-name').value, cash: tr.querySelector('.f-cash').value,
    meso: tr.querySelector('.f-meso').value, cap: tr.querySelector('.f-cap').value,
    earn: tr.querySelector('.f-earn').checked
  })),
  creditItems: [...$('#creditRows').children].map(tr => ({
    cashShopId: tr.dataset.cashShopId || null,
    name: tr.querySelector('.f-name').value, credit: tr.querySelector('.f-credit').value,
    meso: tr.querySelector('.f-meso').value, cap: tr.querySelector('.f-cap').value
  }))
});
const cleanId = value => typeof value==='string' && /^[a-zA-Z0-9_-]{1,150}$/.test(value) ? value : null;
const text = (value, max = 30) => String(value ?? '').slice(0, max);
function restore(d){
  if (!d || typeof d !== 'object' || !Array.isArray(d.items) || d.items.length > 30) throw new Error('아이템 목록이 포함된 설정 파일이 필요합니다 (최대 30개).');
  const credit = Array.isArray(d.creditItems) ? d.creditItems : [];
  if (credit.length > 30) throw new Error('크레딧샵 상품은 최대 30개까지 불러올 수 있습니다.');
  if ([...d.items,...credit].some(it => !it || typeof it !== 'object')) throw new Error('아이템 형식이 올바르지 않습니다.');
  for (const id of SET_IDS) if (d.s && Object.hasOwn(d.s,id) && ['string','number'].includes(typeof d.s[id])) $('#'+id).value = String(d.s[id]).slice(0,50);
  for (const id of CHK_IDS) if (d.chk && typeof d.chk[id] === 'boolean') $('#'+id).checked = d.chk[id];
  $('#rows').replaceChildren();
  $('#creditRows').replaceChildren();
  d.items.forEach(it=>addRow({cashShopId:cleanId(it.cashShopId),name:text(it.name,100),cash:text(it.cash),meso:text(it.meso),cap:text(it.cap),earn:it.earn!==false}));
  credit.forEach(it=>addCreditRow({cashShopId:cleanId(it.cashShopId),name:text(it.name,100),credit:text(it.credit),meso:text(it.meso),cap:text(it.cap)}));
  if (!d.items.length) addRow();
  refresh(); return true;
}
function save(){ try { localStorage.setItem(SKEY,JSON.stringify(snapshot())); } catch { $('#storageStatus').textContent = '이 브라우저에서는 자동 저장을 사용할 수 없습니다. 내보내기로 보관하세요.'; } }
function load(){ try { const stored=localStorage.getItem(SKEY); if (stored) return restore(JSON.parse(stored)); } catch {} return false; }

let activeWorker = null, rejectWorker = null, inputVersion = 0, loadingCashShop = false;
/** 마지막 계산 결과 묶음. 탭을 바꿀 때 다시 계산하지 않고 이걸 다시 그린다. */
let lastRun = null;
let activeMode = 'efficiency';
/** [결과 키, 탭 이름, 탭 요소 id]. 순서가 곧 화면 순서다. */
const MODES = [
  ['efficiency', '최고 효율', 'tabEfficiency'],
  ['volume', '판매량 고려', 'tabVolume'],
  ['tiered', '단가 하락 반영', 'tabTiered'],
];
/** 서버의 거래량 정책. 안내 문구에만 쓰므로 못 받으면 기본값으로 둔다. */
let depthMin = 100, depthWindow = 7;

/**
 * 판매량 고려 모드의 수량 상한.
 *
 * 최근 거래량 전부를 나 혼자 팔 수는 없다. 그중 '판매 점유율'만큼만 소화할 수 있다고 본다.
 * 거래량을 모르는 항목(직접 입력한 상품, 메소마켓)은 묶지 않는다.
 * 모르는 것과 안 팔리는 것은 다르다.
 */
const capBySales = s => it =>
  typeof it.sellable === 'number' && Number.isFinite(it.sellable)
    ? { ...it, cap: Math.min(it.cap, Math.max(0, Math.floor(it.sellable * s.sellShare))) }
    : it;

function showError(message) { $('#calcStatus').textContent = message; $('#result').style.display = 'none'; }
function cancelCalculation() {
  if (activeWorker) { activeWorker.terminate(); activeWorker = null; rejectWorker?.(new Error('입력이 변경되어 계산을 취소했습니다.')); rejectWorker=null; }
}
function runOptimizer(input) {
  return new Promise((resolve,reject)=> {
    // 작업 스레드를 못 쓰는 환경(자산 404, 파일 직접 열기, Worker 차단)에서도 계산은 되게 한다.
    // 같은 엔진을 화면 스레드에서 돌리므로 그동안 입력이 잠시 멈출 수 있다.
    const fallback = error => {
      if (typeof MvpOptimizer === 'undefined') {
        reject(new Error('계산기 파일을 불러오지 못했습니다. 새로고침(Ctrl+Shift+R) 후 다시 시도해주세요. ' + (error?.message ?? '')));
        return;
      }
      $('#calcStatus').textContent = '작업 스레드를 사용할 수 없어 화면 스레드에서 계산합니다…';
      try { resolve(MvpOptimizer.solve(input)); } catch (inlineError) { reject(inlineError); }
    };
    let worker;
    // 상대 경로는 문서 기준(base 포함)으로 풀어 /mvp 처럼 슬래시 없는 주소에서도 맞게 한다.
    try { worker = new Worker(new URL('optimizer.worker.js', document.baseURI)); }
    catch (error) { fallback(error); return; }
    activeWorker=worker;
    const finish=()=> { clearTimeout(timer); worker.terminate(); if(activeWorker===worker){activeWorker=null;rejectWorker=null;} };
    const timer=setTimeout(()=>{finish();reject(new Error('계산 시간이 초과되었습니다. 아이템 수나 예산을 줄여주세요.'));},20000);
    rejectWorker=(error)=>{finish();reject(error);};
    worker.onmessage=({data})=>{finish();data.error?reject(new Error(data.error)):resolve(data.result);};
    worker.onerror=()=>{finish();fallback(new Error('작업 스레드를 불러오지 못했습니다.'));};
    worker.postMessage(input);
  });
}
function validateInputs() {
  const check=(el,label,{min=0,max=1e12,int=false,blank=false}={})=>{
    if(el.value.trim()==='' && blank)return;
    const n=num(el.value);
    if(el.value.trim()==='' || !Number.isFinite(n) || n<min || n>max || (int&&!Number.isSafeInteger(n))) {
      el.focus(); throw new Error(label+' 값을 확인하세요 ('+min+'~'+max+(int?', 정수':'')+').');
    }
  };
  check($('#chargeRatio'),'충전 비율',{min:.01,max:100});
  check($('#chargeWon'),'충전 예산',{max:10000000,int:true});
  check($('#ownCash'),'보유 캐시',{max:10000000,int:true});
  check($('#ownCredit'),'보유 크레딧',{max:10000000,int:true});
  check($('#mesoPrice'),'메소 현금 시세',{min:1,int:true});
  check($('#fee'),'경매장 수수료',{max:100});
  check($('#earnRate'),'크레딧 적립률',{max:100});
  check($('#minEarnCash'),'적립 최소 결제액',{max:10000000,int:true});
  check($('#earnCap'),'추가 적립 한도',{max:10000000,int:true,blank:true});
  check($('#sellShare'),'판매 점유율',{min:1,max:100});
  check($('#tierWidth'),'물량 구간 폭',{min:1,max:100});
  check($('#tierDrop'),'구간당 단가 하락',{min:0,max:50});
  if($('#useMarket').checked) {
    check($('#mesoMarket'),'메소마켓 시세',{min:1,max:10000000,int:true});
    check($('#marketCap'),'메소마켓 한도',{max:10000000,int:true,blank:true});
  }
  for(const [index,tr] of [...$('#rows').children].entries()) {
    if (tr.dataset.cashShopId && (tr.dataset.metadataPending !== 'false' || !tr.querySelector('.f-cash').value.trim() || !tr.querySelector('.f-meso').value.trim())) continue;
    const c=tr.querySelector('.f-cash'),m=tr.querySelector('.f-meso'),cap=tr.querySelector('.f-cap');
    if(!c.value.trim()&&!m.value.trim()&&!cap.value.trim()&&!tr.querySelector('.f-name').value.trim())continue;
    check(c,(index+1)+'행 캐시 원가',{min:1,max:10000000,int:true});
    check(m,(index+1)+'행 경매장 예상가',{min:1,int:true});
    check(cap,(index+1)+'행 최대 수량',{max:10000000,int:true,blank:true});
  }
  for(const [index,tr] of [...$('#creditRows').children].entries()) {
    if (tr.dataset.cashShopId && (tr.dataset.metadataPending !== 'false' || !tr.querySelector('.f-credit').value.trim() || !tr.querySelector('.f-meso').value.trim())) continue;
    const k=tr.querySelector('.f-credit'),m=tr.querySelector('.f-meso'),cap=tr.querySelector('.f-cap');
    if(!k.value.trim()&&!m.value.trim()&&!cap.value.trim()&&!tr.querySelector('.f-name').value.trim())continue;
    check(k,'크레딧샵 '+(index+1)+'행 크레딧 가격',{min:1,max:10000000,int:true});
    check(m,'크레딧샵 '+(index+1)+'행 경매장 예상가',{min:1,int:true});
    check(cap,'크레딧샵 '+(index+1)+'행 월 구매 한도',{max:10000000,int:true,blank:true});
  }
}

/* ===================== 이벤트 ===================== */
$('#bAdd').onclick = () => { addRow(); refresh(); };
$('#bAddCredit').onclick = () => { addCreditRow(); refresh(); };
$('#bClear').onclick = () => { if (confirm('입력한 아이템 목록을 모두 지웁니다. 계속할까요?')){ $('#rows').innerHTML=''; $('#creditRows').innerHTML=''; addRow(); addRow(); addRow(); refresh(); } };
$('#bExample').onclick = () => { $('#rows').innerHTML=''; $('#creditRows').innerHTML=''; EXAMPLE.forEach(addRow); CREDIT_EXAMPLE.forEach(addCreditRow); refresh(); };
$('#bSort').onclick = () => {
  const s = settings();
  [...$('#rows').children].map(tr => {
    const c = num(tr.querySelector('.f-cash').value), g = num(tr.querySelector('.f-meso').value);
    return { tr, k: c > 0 && g > 0 ? g * (1 - s.fee) / c : -1 };
  }).sort((a, b) => b.k - a.k).forEach(x => $('#rows').appendChild(x.tr));
  [...$('#creditRows').children].map(tr => {
    const k = num(tr.querySelector('.f-credit').value), g = num(tr.querySelector('.f-meso').value);
    return { tr, k: k > 0 && g > 0 ? g * (1 - s.fee) / k : -1 };
  }).sort((a, b) => b.k - a.k).forEach(x => $('#creditRows').appendChild(x.tr));
  refresh();
};
$('#bExport').onclick = () => {
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([JSON.stringify(snapshot(), null, 2)], { type:'application/json' }));
  a.download = 'mvp-calc-' + new Date().toISOString().slice(0,10) + '.json';
  a.click(); URL.revokeObjectURL(a.href);
};
$('#bImport').onclick = () => {
  const f = document.createElement('input'); f.type='file'; f.accept='.json,application/json';
  f.onchange = () => {
    const file = f.files?.[0]; if (!file) return;
    if (file.size > 100000) { showError('100KB 이하의 설정 파일을 선택하세요.'); return; }
    const rd = new FileReader();
    rd.onload = () => { try { restore(JSON.parse(rd.result)); } catch(e){ alert('JSON 파일을 읽지 못했습니다.'); } };
    rd.readAsText(file);
  };
  f.click();
};
$('#bCalc').onclick = calculate;
// maple-market이 /mvp로 서빙할 때만 사이트 내비게이션과 시세 자동 반영을 켠다.
// 정적 배포본(단독 index.html)에는 다른 페이지도 /api/cash-shop도 없다.
//
// 예전에는 hostname이 localhost인지로 판단했다. 그래서 같은 서버를 공인 도메인이나
// LAN 주소로 열면 캐시템·크레딧샵 목록이 통째로 비어 보였다. 판단 기준은 호스트가
// 아니라 이 페이지를 maple-market이 서빙하는지다.
const servedByMarket = location.pathname.startsWith('/mvp');
if (servedByMarket) $('#siteNav').hidden = false;
if (servedByMarket || ['localhost','127.0.0.1'].includes(location.hostname)) {
  $('#cashShopControls').hidden = false;
  $('#autoCashShop').checked = true;
}
MODES.forEach(([key, , id]) => $('#' + id).addEventListener('click', () => renderMode(key)));
$('#autoCashShop').addEventListener('change', refresh);
[...SET_IDS, ...CHK_IDS].forEach(id => $('#'+id).addEventListener('input', refresh));
document.addEventListener('keydown', e => { if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') calculate(); });

(async () => {
  // 옛 HTML이 캐시돼 새 요소가 없으면 조용히 죽는 대신 원인을 알린다.
  const missing = ['rows','creditRows','ownCredit','minEarnCash','bCalc','sellShare','tabVolume','tabTiered','tierWidth','tierDrop','modeCompare','fixedNotes'].filter(id => !$('#'+id));
  if (missing.length) {
    document.body.insertAdjacentHTML('afterbegin',
      '<div class="note bad" style="margin:12px">이전 버전 화면이 캐시돼 있습니다. 새로고침(Ctrl+Shift+R) 후 다시 열어주세요.</div>');
    return;
  }
  if (!(await load())){ addRow(); addRow(); addRow(); refresh(); }
  if (!$('#cashShopControls').hidden) {
    try {
      applyCashShop({status:'NOT_REQUESTED',products:CashShop.fixedProducts});
      const version = inputVersion;
      const data = await CashShop.readToday();
      if (version === inputVersion && !loadingCashShop && !activeWorker) applyCashShop(data);
    } catch(e) { $('#cashShopStatus').textContent = e.message+' 고정 상품 목록은 유지됩니다.'; }
  }
})();
