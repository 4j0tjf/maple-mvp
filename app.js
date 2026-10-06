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
['chargeWon','ownCash','ownCredit','mesoPrice','mesoMarket','marketCap','giftWon'].forEach(id => bindNum($('#'+id)));

const SET_IDS = ['chargeRatio','chargeWon','ownCash','ownCredit','earnRate','minEarnCash','fee','mesoPrice','mesoMarket','marketCap','earnCap','sellShare','saleDays','tierWidth','tierDrop','giftWon'];
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
    saleDays: num($('#saleDays').value),
    // 단가 하락 반영 모드의 물량 구간 폭과 구간당 하락률.
    tierWidth: num($('#tierWidth').value) / 100,
    tierDrop: num($('#tierDrop').value) / 100,
    // 선물형으로 MVP 1만원을 채우는 비용. 비우면 비교하지 않는다.
    giftWon: $('#giftWon').value.trim() === '' ? null : num($('#giftWon').value)
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
  tr.saleComponents = d.components || [];
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
    '<td><input type="text" class="f-volume" placeholder="미확인" aria-label="최근 7일 거래량"></td>' +
    '<td><input type="checkbox" class="f-earn" checked aria-label="크레딧 적립 대상"></td>' +
    '<td class="effcell bad">—</td>' +
    '<td class="f-rr">—</td>' +
    '<td><button class="del" title="행 삭제">×</button></td>';
  tr.querySelector('.f-name').value = d.name ?? '';
  tr.querySelector('.f-cash').value = d.cash ?? '';
  tr.querySelector('.f-meso').value = d.meso ?? '';
  tr.querySelector('.f-cap').value  = d.cap  ?? '';
  tr.querySelector('.f-volume').value = d.volume ?? '';
  tr.querySelector('.f-volume').disabled = Boolean(d.cashShopId);
  if (d.cashShopId) tr.querySelector('.f-volume').value = d.depth?.sellable ?? '';
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
    '<td><input type="text" class="f-volume" placeholder="미확인" aria-label="최근 7일 거래량"></td>' +
    '<td class="effcell bad">—</td>' +
    '<td><button class="del" title="행 삭제">×</button></td>';
  tr.querySelector('.f-name').value   = d.name ?? '';
  tr.querySelector('.f-credit').value = d.credit ?? '';
  tr.querySelector('.f-meso').value   = d.meso ?? '';
  tr.querySelector('.f-cap').value    = d.cap ?? '';
  tr.querySelector('.f-volume').value = d.volume ?? '';
  tr.querySelector('.f-volume').disabled = Boolean(d.cashShopId);
  if (d.cashShopId) tr.querySelector('.f-volume').value = d.depth?.sellable ?? '';
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
  sellable: tr.querySelector('.f-volume').value.trim() === '' ? null : num(tr.querySelector('.f-volume').value),
  components: tr.saleComponents || [],
  earn: tr.querySelector('.f-earn').checked,
  ready: !tr.dataset.cashShopId || (tr.dataset.metadataPending === 'false' && num(tr.querySelector('.f-cash').value)>0 && num(tr.querySelector('.f-meso').value)>0)
}));
const readCreditRows = () => [...$('#creditRows').children].map(tr => ({
  tr,
  name: tr.querySelector('.f-name').value.trim() || '(이름 없음)',
  k:    num(tr.querySelector('.f-credit').value),
  gross:num(tr.querySelector('.f-meso').value),
  cap:  tr.querySelector('.f-cap').value.trim() === '' ? Infinity : num(tr.querySelector('.f-cap').value),
  sellable: tr.querySelector('.f-volume').value.trim() === '' ? null : num(tr.querySelector('.f-volume').value),
  components: tr.saleComponents || [],
  ready: !tr.dataset.cashShopId || (tr.dataset.metadataPending === 'false' && num(tr.querySelector('.f-credit').value)>0 && num(tr.querySelector('.f-meso').value)>0)
}));

/* ===================== 목록 접기 ===================== */
// 접힌 목록 이름("cash", "credit")은 <html data-fold>에 둔다. index.html head의 스크립트가 첫 페인트 전에 같은 키로 채운다.
const FOLD_KEY = 'mvp-fold-v1';
const folded = () => (document.documentElement.getAttribute('data-fold') || '').split(' ').filter(Boolean);
function syncFold(){
  document.querySelectorAll('[data-fold-toggle]').forEach(b => {
    const shut = folded().includes(b.dataset.foldToggle);
    b.setAttribute('aria-expanded', String(!shut));
    b.title = shut ? '목록 펼치기' : '목록 접기';
  });
}
function setFolded(list, shut){
  const next = new Set(folded()); if (shut) next.add(list); else next.delete(list);
  document.documentElement.setAttribute('data-fold', [...next].join(' '));
  try { localStorage.setItem(FOLD_KEY, JSON.stringify([...next])); } catch { /* 이번 화면에서만 적용 */ }
  syncFold();
}
/** 접힌 표 안의 칸을 보여줘야 할 때(입력 오류, 행 추가) 그 목록을 편다. */
function reveal(el){ const card = el && el.closest('[data-list]'); if (card && folded().includes(card.dataset.list)) setFolded(card.dataset.list, false); }
document.querySelectorAll('[data-fold-toggle]').forEach(b => b.addEventListener('click', () => setFolded(b.dataset.foldToggle, !folded().includes(b.dataset.foldToggle))));
syncFold();

/** 접혀 있어도 목록의 핵심은 보이도록 제목 아래에 한 줄로 요약한다. */
function summarizeLists(s, bar){
  const cash = readRows().filter(it => it.name !== '(이름 없음)' || it.c > 0 || it.gross > 0);
  let best = null;
  for (const it of cash) if (it.c > 0 && it.gross > 0) {
    const rate = recovery(it.c, it.gross * (1 - s.fee), s);
    if (Number.isFinite(rate) && (!best || rate > best.rate)) best = { rate, name: it.name };
  }
  const ready = cash.filter(it => it.c > 0 && it.gross > 0).length;
  $('#cashSummary').innerHTML = cash.length
    ? '상품 <b>' + cash.length + '</b>개 · 계산 가능 <b>' + ready + '</b>개' +
      (best ? ' · 최고 회수율 <b style="color:' + (best.rate >= bar ? 'var(--green)' : 'var(--red)') + '">' + fx(best.rate, 1) + '%</b> ' + esc(best.name) : '')
    : '입력한 상품이 없습니다.';
  const credit = readCreditRows().filter(it => it.name !== '(이름 없음)' || it.k > 0 || it.gross > 0);
  let top = null;
  for (const it of credit) if (it.k > 0 && it.gross > 0) {
    const value = it.gross * (1 - s.fee) / it.k;
    if (!top || value > top.value) top = { value, name: it.name };
  }
  $('#creditSummary').innerHTML = credit.length
    ? '상품 <b>' + credit.length + '</b>개' + (top ? ' · 최고 효율 <b>' + comma(top.value) + '</b> 메소/크레딧 ' + esc(top.name) : '')
    : '입력한 상품이 없습니다.';
}

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
  const gift = s.giftWon != null && s.giftWon >= 0 && s.r > 0 ? MvpOptimizer.giftCompare({ mvp: 0, spentWon: 0, gotWon: 0, giftWon: s.giftWon, r: s.r }) : null;
  $('#giftBase').hidden = !gift;
  if (gift) {
    $('#giftRate').textContent = fx(gift.rate, 2) + '%';
    $('#giftCost').textContent = comma(s.giftWon) + '원 · 회수 0';
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
  summarizeLists(s, bar);
  save();
}

/* ===================== 계산 ===================== */
function applyCashShop(data) {
  const rows = CashShop.productRows(data.products || CashShop.fixedProducts, data.depths || []);
  const creditRows = CashShop.creditRows(data.creditProducts, data.depths || []);
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
  showPriceSource(data);
  const ready = rows.filter(r => !r.metadataPending && r.meso);
  const screening = data.creditScreening;
  $('#cashShopStatus').textContent = `${rows.length}개 상품 등록 · 계산 가능 ${ready.length}개` +
    (data.depthCapturedAt ? ` · 거래량: ${new Date(data.depthCapturedAt).toLocaleDateString('ko-KR', {timeZone:'Asia/Seoul'})} 이후 조회값 (각 조회 시점 직전 7일)` : ' · 거래량 미확인') +
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
  const cashCands = raw.map(it => ({ name:it.name, mm:false, kind:'cash', earn:it.earn, c:it.c, m:Math.floor(it.gross*(1-s.fee)), cap:it.cap, sellable:it.sellable, components:it.components }));
  if (s.useMarket) cashCands.push({ name:'메소마켓 (메포 → 1억 메소)', mm:true, kind:'cash', earn:s.marketEarn, c:s.mesoMarket, m:1e8, cap:s.marketCap, sellable:null });
  const creditCands = rawCredit.map(it => ({ name:it.name, mm:false, kind:'credit', k:it.k, m:Math.floor(it.gross*(1-s.fee)), cap:it.cap, sellable:it.sellable, components:it.components }));
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
    const { prepareSales } = MvpOptimizer;
    const volume = await runOptimizer({ ...shared, items:prepareSales(cashCands, s), creditItems:prepareSales(creditCands, s) });
    if (version !== inputVersion) { $('#calcStatus').textContent = '입력이 변경되었습니다. 다시 계산해주세요.'; return; }
    // 3. 단가 하락 반영 — 못 파는 지점이 아니라 싸게 팔리는 지점으로 본다.
    $('#calcStatus').textContent = '물량에 따른 단가 하락을 반영하고 있습니다…';
    const tiered = await runOptimizer({ ...shared, items:prepareSales(cashCands, s, true), creditItems:prepareSales(creditCands, s, true) });
    results = { efficiency, volume, tiered };
  } catch(error) { showError(error.message); return; }
  finally { $('#bCalc').disabled = false; }
  if (version !== inputVersion) { $('#calcStatus').textContent = '입력이 변경되었습니다. 다시 계산해주세요.'; return; }
  // 계획에 적힌 수량이 시장 대비 얼마나 큰지 보여주려면 거래량이 필요하다.
  const volumes = new Map([...raw, ...rawCredit].filter(it => typeof it.sellable === 'number').map(it => [it.name, it.sellable]));
  const unknown = [...MvpOptimizer.prepareSales(cashCands, s), ...MvpOptimizer.prepareSales(creditCands, s)]
    .filter(it => it.salesUnknown).map(it => it.name);
  lastRun = { results, s, volumes, unknown: [...new Set(unknown)] };
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
    efficiency: '<b>최고 효율 · 비교용</b>: 물량 제약이 없는 낙관적 가정입니다. 전량 판매를 전제로 한 예상 회수액이며 실제 추천은 판매 현실 반영 탭을 확인하세요.',
    volume: '<b>판매량 고려</b>: 최근 거래량을 <b>' + s.saleDays + '일</b>로 환산한 뒤 판매 점유율 <b>' + fx(s.sellShare * 100, 1)
      + '%</b>를 적용합니다. 같은 구성품은 캐시·크레딧·패키지의 판매 수량을 합산합니다. 단가는 고정합니다.',
    tiered: '<b>판매 현실 반영 · 기본 추천</b>: 판매기간 <b>' + s.saleDays + '일</b>, 판매 점유율 <b>' + fx(s.sellShare * 100, 1)
      + '%</b> 이내에서 예상 회수액을 최대화합니다. 해당 기간 예상 거래량의 ' + fx(s.tierWidth * 100, 1)
      + '%를 팔 때마다 구성품 단가를 최초 가격의 ' + fx(s.tierDrop * 100, 1) + '%씩 낮춥니다. 같은 구성품의 누적 판매량과 가격 구간을 함께 사용합니다.',
  }[activeMode];
  $('#modeNote').innerHTML = note + ' 자동 상품은 최근 ' + depthWindow + '일 거래 ' + comma(depthMin)
    + '건 미만이면 세 모드 모두에서 제외합니다. 거래량 미확인 상품은 판매량 고려·판매 현실 반영에서 제외합니다. 메소마켓은 입력한 구매 한도를 적용합니다. 예상치이며 기간 내 판매를 보장하지 않습니다.';
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

/**
 * 이 수량이 시장에서 어느 정도인지 한 줄로 알린다.
 *
 * 계산은 "이만큼 살 수 있다"까지만 말해 준다. 그 물량을 실제로 소화할 수 있는지는
 * 사람이 판단해야 하는데, 주간 거래량과 견주지 않으면 판단할 근거가 없다.
 * 500건 팔리는 상품의 100개는 주간 거래의 20%, 일평균으로 1.4일치다.
 */
function marketShare(name, qty, volumes) {
  const volume = volumes.get(name);
  if (!volume || qty <= 0) return '';
  const share = (qty / volume) * 100;
  const days = qty / (volume / 7);
  const heavy = share >= 10;
  return ' <small style="font-weight:400;color:' + (heavy ? 'var(--red)' : 'var(--mute)') + '">· 주간 거래의 '
    + fx(share, share < 1 ? 1 : 0) + '% · 일평균 ' + fx(days, 1) + '일치</small>';
}

/** 메소를 억·만 단위로 읽기 쉽게 적는다. 1만 메소 단위로 반올림한다. */
function mesoText(n) {
  if (!Number.isFinite(n)) return '—';
  if (n < 1e4) return comma(n);
  const v = Math.round(n / 1e4), eok = Math.floor(v / 1e4), man = v % 1e4;
  return (eok ? eok + '억' : '') + (man ? (eok ? ' ' : '') + comma(man) + '만' : '');
}

/**
 * 경매장에 올릴 가격. 엔진이 가정한 개당 순수익에 경매장 수수료를 되붙인 값이다.
 *
 * 판매량을 반영한 계산은 같은 구성품을 캐시·크레딧·패키지 모든 줄에서 합산해 단가를 낮춘다.
 * 그래서 가격은 줄이 아니라 구성품 단위로 정해진다. 다른 줄과 함께 파는 수량이면 합계를 적는다.
 * 판매량을 반영하지 않는 계산(최고 효율)은 입력한 시세를 그대로 쓴다.
 */
function listingText(l, markets, s) {
  if (l.mm) return '<span class="zero">경매장 판매 없음</span>';
  const price = net => mesoText(MvpOptimizer.listingPrice(net, s.fee));
  const row = (name, text, note = '') => '<div>' + (name ? '<small style="margin:0 4px 0 0">' + esc(name) + '</small>' : '') + text + note + '</div>';
  if (l.sales?.length) {
    const named = l.sales.length > 1 || l.sales[0].key !== l.name;
    return l.sales.map(use => {
      const market = markets.get(use.key);
      if (!market) return '';
      const mine = l.qty * use.quantity;
      return row(named ? use.key : '', market.tiers.map(t => '<span class="tier"><b>' + price(t.m) + '</b> × ' + comma(t.count) + '</span>').join(' → '),
        market.sold > mine ? ' <small>· 다른 줄과 합산 ' + comma(market.sold) + '개</small>' : '');
    }).join('');
  }
  const parts = (l.components || []).filter(c => c.price > 0 && c.quantity > 0);
  if (parts.length) {
    const named = parts.length > 1 || parts[0].name !== l.name;
    return parts.map(c => row(named ? c.name : '', '<b>' + mesoText(c.price) + '</b> × ' + comma(l.qty * c.quantity))).join('');
  }
  return row('', '<b>' + price(l.m) + '</b> × ' + comma(l.qty));
}

function renderPlan(r, { s, volumes, unknown = [] }) {
  $('#calcStatus').textContent = r.exact ? '입력한 조건에서 최대 메소 조합을 확인했습니다.' : '탐색 범위에서 찾은 추천 조합입니다. 전역 최적해는 보장하지 않습니다.';

  const chargeUsed = Math.max(0, r.usedCash - s.ownCash);
  const spentWon = r.usedCash * s.r;
  const newChargeWon = chargeUsed * s.r;
  const gotWon = mesoToWon(r.meso, s);
  const rate = spentWon > 0 ? gotWon / spentWon * 100 : NaN;
  const profit = gotWon - spentWon;
  const base = baseline(s);
  // 같은 MVP(사용 캐시)를 선물형으로 채웠다면. 선물형은 회수도 크레딧도 없다.
  const gift = s.giftWon != null && r.usedCash > 0
    ? MvpOptimizer.giftCompare({ mvp: r.usedCash, spentWon, gotWon, giftWon: s.giftWon, r: s.r }) : null;

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
    ...(gift ? [['MVP 1만원당 실비용', comma(gift.planPerUnit), '원 · 선물형 ' + comma(s.giftWon) + '원', gift.saving >= 0 ? 'c-grn' : 'c-red']] : []),
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
  const markets = new Map((r.markets || []).map(m => [m.key, m]));
  $('#planRows').innerHTML = sorted.map(l => {
    const z = v => v > 0 ? comma(v) : '<span class="zero">0</span>';
    return '<tr' + (l.mm ? ' class="mm"' : '') + '>' +
      '<td>' + esc(l.name) + (l.mm ? ' <small style="color:var(--mute);font-weight:400">· 1개 = 1억</small>' : marketShare(l.name, l.qty, volumes)) + '</td>' +
      '<td class="' + (l.kind === 'credit' ? 'mi' : 'ca') + '">' + (l.kind === 'credit' ? '크레딧샵' : '캐시') + '</td>' +
      '<td style="font-weight:700">' + z(l.qty) + '</td>' +
      '<td>' + comma(l.usedCash) + '</td><td>' + comma(l.usedCredit) + '</td>' +
      '<td>' + comma(l.meso) + '</td><td>' + comma(mesoToWon(l.meso, s)) + '원</td>' +
      '<td class="listing">' + listingText(l, markets, s) + '</td></tr>';
  }).join('') || '<tr><td colspan="8" style="text-align:center;color:var(--mute);padding:20px">구매할 수 있는 조합이 없습니다</td></tr>';

  $('#listingNote').innerHTML = '<b>경매장 추천 판매 가격</b>은 이 계획이 가정한 판매 단가에 경매장 수수료 ' + fx(s.fee * 100, 1)
    + '%를 되붙인 개당 가격입니다(1만 메소 단위 반올림). '
    + (activeMode === 'tiered'
      ? '판매 현실 반영은 많이 팔수록 단가를 낮춰 계산하므로, <b>앞 가격으로 적힌 수량을 다 판 뒤 다음 가격으로</b> 내려 올리세요. 같은 아이템은 모든 줄의 판매량을 합쳐 셉니다.'
      : '이 탭은 단가를 낮추지 않으므로 입력한 경매장 예상가 그대로입니다.')
    + ' 경쟁 매물과 시세 변동은 반영하지 않으며 판매를 보장하지 않습니다.';

  // 이번 계산에서만 해당하는 사실. 매번 달라지므로 펼쳐 둔다.
  const n = [];
  if (activeMode !== 'efficiency' && unknown.length) n.push(['bad', '거래량 미확인으로 추천 제외: ' + unknown.map(esc).join(', ') + '. 직접 입력한 상품은 최근 7일 거래량을 입력하세요. 자동 상품은 구성품별 거래량이 필요합니다.']);
  if (r.usedCredit > 0) n.push(['', '이 계획은 크레딧 <b>' + comma(r.usedCredit) + 'C</b>를 사용합니다. 보유 크레딧 ' + comma(s.ownCredit) + 'C와 적립분 ' + comma(r.earned) + 'C의 합 안에서만 구매할 수 있습니다.']);
  if (r.leftCredit > 0) n.push(['', '구매 후 남는 크레딧: <b>' + comma(r.leftCredit) + 'C</b>. 적립일로부터 1년 안에 크레딧샵에서 사용하세요.']);
  if (r.leftCash > 0) n.push(['', '남는 캐시: <b>' + comma(r.leftCash) + '</b>. 최대 회수액과 별개로 MVP 목표 금액만큼 소비했는지 확인하세요.']);
  if (gift) n.push([gift.saving >= 0 ? 'ok' : 'bad', '같은 MVP <b>' + comma(r.usedCash) + '원</b>을 선물형으로 채우면 <b>' + comma(gift.giftCost)
    + '원</b>이 들고 회수·크레딧은 없습니다. 이 계획의 실비용은 <b>' + comma(gift.planCost) + '원</b>으로 선물형보다 <b>'
    + comma(Math.abs(gift.saving)) + '원 ' + (gift.saving >= 0 ? '덜' : '더') + '</b> 듭니다. 선물형 환산 회수율은 <b>' + fx(gift.rate, 2)
    + '%</b>이고 이 계획은 <b>' + fx(rate, 2) + '%</b>입니다.']);
  if (skipped.length) n.push(['', '이번 조합에서 미구매 <b>' + skipped.length + '종</b>: ' + skipped.map(esc).join(', ') + '.']);
  // 주간 거래량의 10%를 넘게 사는 계획은 따로 짚는다. 시장을 혼자 차지해야 가능한 물량이다.
  const heavy = sorted.filter(l => !l.mm && volumes.get(l.name) && l.qty / volumes.get(l.name) >= 0.1);
  if (heavy.length) {
    n.push(['bad', '이 계획은 <b>' + heavy.map(l => esc(l.name) + ' ' + comma(l.qty) + '개(주간 거래의 '
      + fx(l.qty / volumes.get(l.name) * 100, 0) + '%)').join(', ')
      + '</b>를 팝니다. 그 기간 시장 물량의 상당 부분을 혼자 차지해야 가능한 양입니다. 물량 구간 폭을 줄이거나 최대 수량을 직접 지정하세요.']);
  }

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
    meso: tr.querySelector('.f-meso').value, cap: tr.querySelector('.f-cap').value, volume: tr.querySelector('.f-volume').value,
    earn: tr.querySelector('.f-earn').checked
  })),
  creditItems: [...$('#creditRows').children].map(tr => ({
    cashShopId: tr.dataset.cashShopId || null,
    name: tr.querySelector('.f-name').value, credit: tr.querySelector('.f-credit').value,
    meso: tr.querySelector('.f-meso').value, cap: tr.querySelector('.f-cap').value, volume: tr.querySelector('.f-volume').value
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
  d.items.forEach(it=>addRow({cashShopId:cleanId(it.cashShopId),name:text(it.name,100),cash:text(it.cash),meso:text(it.meso),cap:text(it.cap),volume:text(it.volume),earn:it.earn!==false}));
  credit.forEach(it=>addCreditRow({cashShopId:cleanId(it.cashShopId),name:text(it.name,100),credit:text(it.credit),meso:text(it.meso),cap:text(it.cap),volume:text(it.volume)}));
  if (!d.items.length) addRow();
  refresh(); return true;
}
function save(){ try { localStorage.setItem(SKEY,JSON.stringify(snapshot())); } catch { $('#storageStatus').textContent = '이 브라우저에서는 자동 저장을 사용할 수 없습니다. 내보내기로 보관하세요.'; } }
function load(){ try { const stored=localStorage.getItem(SKEY); if (stored) return restore(JSON.parse(stored)); } catch {} return false; }

let activeWorker = null, rejectWorker = null, inputVersion = 0, loadingCashShop = false;
/** 마지막 계산 결과 묶음. 탭을 바꿀 때 다시 계산하지 않고 이걸 다시 그린다. */
let lastRun = null;
let activeMode = 'tiered';
/** [결과 키, 탭 이름, 탭 요소 id]. 순서가 곧 화면 순서다. */
const MODES = [
  ['tiered', '판매 현실 반영 · 추천', 'tabTiered'],
  ['volume', '판매량 고려', 'tabVolume'],
  ['efficiency', '최고 효율 · 비교용', 'tabEfficiency'],
];
/** 서버의 거래량 정책. 안내 문구에만 쓰므로 못 받으면 기본값으로 둔다. */
let depthMin = 100, depthWindow = 7;

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
      reveal(el); el.focus(); throw new Error(label+' 값을 확인하세요 ('+min+'~'+max+(int?', 정수':'')+').');
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
  check($('#saleDays'),'판매기간',{min:1,max:365,int:true});
  check($('#sellShare'),'판매 점유율',{min:.01,max:100});
  check($('#tierWidth'),'물량 구간 폭',{min:.01,max:100});
  check($('#tierDrop'),'구간당 단가 하락',{min:0,max:50});
  check($('#giftWon'),'선물형 비용',{max:1000000,int:true,blank:true});
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
    check(tr.querySelector('.f-volume'),(index+1)+'행 최근 7일 거래량',{max:1000000,int:true,blank:true});
  }
  for(const [index,tr] of [...$('#creditRows').children].entries()) {
    if (tr.dataset.cashShopId && (tr.dataset.metadataPending !== 'false' || !tr.querySelector('.f-credit').value.trim() || !tr.querySelector('.f-meso').value.trim())) continue;
    const k=tr.querySelector('.f-credit'),m=tr.querySelector('.f-meso'),cap=tr.querySelector('.f-cap');
    if(!k.value.trim()&&!m.value.trim()&&!cap.value.trim()&&!tr.querySelector('.f-name').value.trim())continue;
    check(k,'크레딧샵 '+(index+1)+'행 크레딧 가격',{min:1,max:10000000,int:true});
    check(m,'크레딧샵 '+(index+1)+'행 경매장 예상가',{min:1,int:true});
    check(cap,'크레딧샵 '+(index+1)+'행 월 구매 한도',{max:10000000,int:true,blank:true});
    check(tr.querySelector('.f-volume'),'크레딧샵 '+(index+1)+'행 최근 7일 거래량',{max:1000000,int:true,blank:true});
  }
}

/* ===================== 이벤트 ===================== */
$('#bAdd').onclick = () => { setFolded('cash', false); addRow(); refresh(); };
$('#bAddCredit').onclick = () => { setFolded('credit', false); addCreditRow(); refresh(); };
$('#bClear').onclick = () => { if (confirm('입력한 아이템 목록을 모두 지웁니다. 계속할까요?')){ $('#rows').innerHTML=''; $('#creditRows').innerHTML=''; setFolded('cash', false); setFolded('credit', false); addRow(); addRow(); addRow(); refresh(); } };
$('#bExample').onclick = () => { setFolded('cash', false); setFolded('credit', false); $('#rows').innerHTML=''; $('#creditRows').innerHTML=''; EXAMPLE.forEach(addRow); CREDIT_EXAMPLE.forEach(addCreditRow); refresh(); };
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
// 상단 메뉴의 테마 스위치. 시세·사냥 기록과 같은 localStorage "theme"을 쓴다.
// 옛 index.html이 캐시돼 스위치가 없어도 계산기는 그대로 돌아가야 한다.
const themeSwitch = $('#themeSwitch');
function syncThemeSwitch(){
  const dark = document.documentElement.getAttribute('data-theme') === 'dark';
  themeSwitch.setAttribute('aria-checked', String(dark));
  themeSwitch.title = dark ? '라이트 모드로 바꾸기' : '다크 모드로 바꾸기';
}
if (themeSwitch) {
  themeSwitch.addEventListener('click', () => {
    const next = document.documentElement.getAttribute('data-theme') === 'dark' ? 'light' : 'dark';
    document.documentElement.setAttribute('data-theme', next);
    try { localStorage.setItem('theme', next); } catch { /* 이번 화면에서만 적용 */ }
    syncThemeSwitch();
  });
  syncThemeSwitch();
}
if (servedByMarket || ['localhost','127.0.0.1'].includes(location.hostname)) {
  $('#cashShopControls').hidden = false;
  $('#autoCashShop').checked = true;
}
MODES.forEach(([key, , id]) => $('#' + id).addEventListener('click', () => renderMode(key)));
$('#bFetch').addEventListener('click', async () => {
  const button = $('#bFetch');
  button.disabled = true;
  button.textContent = '시세를 조회하고 있습니다…';
  try {
    const started = await CashShop.startIfNeeded({ status: 'NOT_REQUESTED' });
    await kickCollection(started ?? { status: 'NOT_REQUESTED' });
  } finally {
    // 결과에 맞춰 버튼 상태를 다시 정한다. 조회가 끝나면 잠기고, 또 실패하면 다시 열린다.
    try { showPriceSource(await CashShop.readToday()); } catch { button.disabled = false; button.textContent = '오늘 시세 조회하기'; }
  }
});
$('#autoCashShop').addEventListener('change', refresh);
[...SET_IDS, ...CHK_IDS].forEach(id => $('#'+id).addEventListener('input', refresh));
document.addEventListener('keydown', e => { if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') calculate(); });

(async () => {
  // 옛 HTML이 캐시돼 새 요소가 없으면 조용히 죽는 대신 원인을 알린다.
  const missing = ['rows','creditRows','ownCredit','minEarnCash','bCalc','sellShare','tabVolume','tabTiered','sellShare','tierWidth','tierDrop','modeCompare','fixedNotes','bFetch','priceSource','cashSummary','creditSummary','giftWon','giftBase','giftRate','giftCost','listingNote'].filter(id => !$('#'+id));
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
      // 그날 첫 방문이면 여기서 수집이 시작된다. 계산 버튼을 기다리지 않는다.
      void kickCollection(data);
    } catch(e) { $('#cashShopStatus').textContent = e.message+' 고정 상품 목록은 유지됩니다.'; }
  }
})();

/**
 * 첫 방문 수집을 시작하고, 끝날 때까지 화면을 조용히 갱신한다.
 *
 * 사용자가 무언가를 누르기를 기다리지 않는다. 다만 사람이 입력 중이거나 계산 중이면
 * 화면을 건드리지 않는다. 자동 상품 행을 갈아 끼우면 손으로 고친 값이 사라진다.
 */
async function kickCollection(data) {
  const started = await CashShop.startIfNeeded(data);
  if (!started || !CashShop.needsCollection(started)) {
    if (started) applyIfIdle(started);
    return;
  }
  const deadline = Date.now() + 15 * 60 * 1000;
  while (Date.now() < deadline) {
    await new Promise(resolve => setTimeout(resolve, 15000));
    let latest;
    try { latest = await CashShop.readToday(); } catch { continue; }
    if (!CashShop.needsCollection(latest)) { applyIfIdle(latest); return; }
    applyIfIdle(latest);
  }
}

/**
 * 계산에 쓰는 시세가 언제 것인지 밝히고, 조회 버튼 상태를 정한다.
 *
 * 오늘 수집이 실패하면 서버가 가장 최근 성공한 날의 시세를 대신 내려준다. 계산기가
 * 통째로 비는 것보다 낫지만, 어느 날 값인지 숨기면 오늘 시세로 오해한다. 그래서
 * 지난 시세일 때는 눈에 띄게 알리고 다시 조회할 수 있게 한다.
 *
 * 오늘 시세가 있으면 버튼을 잠근다. 하루 1회면 충분하고, 다시 눌러 봐야 같은 결과다.
 */
function showPriceSource(data) {
  const box = $('#priceSource');
  const button = $('#bFetch');
  if (!box || !button) return;
  const today = !data.stale && data.priceDay;
  const collecting = data.status === 'RUNNING';

  if (today) {
    box.hidden = true;
    button.disabled = true;
    button.textContent = '오늘 시세 조회 완료';
  } else if (collecting) {
    box.hidden = true;
    button.disabled = true;
    button.textContent = '시세를 조회하고 있습니다…';
  } else if (data.priceDay) {
    box.hidden = false;
    box.className = 'note';
    box.innerHTML = '오늘 시세를 구하지 못해 <b>' + esc(data.priceDay) + '</b> 시세로 계산합니다. '
      + '그 사이 시세가 달라졌을 수 있습니다.';
    button.disabled = !data.retryable;
    button.textContent = data.retryable ? '오늘 시세 조회하기' : '오늘은 더 조회할 수 없습니다';
  } else {
    box.hidden = false;
    box.className = 'note bad';
    box.innerHTML = '<b>시세를 제공할 수 없습니다.</b> 오늘 수집이 실패했고 이전 기록도 없습니다. '
      + 'Chrome에서 메이플 옥션이 로그인된 상태인지 확인한 뒤 다시 조회하세요.';
    button.disabled = !data.retryable;
    button.textContent = data.retryable ? '오늘 시세 조회하기' : '오늘은 더 조회할 수 없습니다';
  }
}

function applyIfIdle(data) {
  if (loadingCashShop || activeWorker) return;
  const version = inputVersion;
  applyCashShop(data);
  // applyCashShop이 refresh()를 부르며 inputVersion을 올린다. 사용자의 편집과 구분한다.
  inputVersion = version;
}
