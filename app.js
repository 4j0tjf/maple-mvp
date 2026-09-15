
const $ = s => document.querySelector(s);
const num = v => { const value = String(v ?? '').trim().replace(/,/g,''); return value === '' ? 0 : /^-?\d+(?:\.\d+)?$/.test(value) ? Number(value) : NaN; };
const comma = n => Math.round(n).toLocaleString('ko-KR');
const fx = (n, d = 2) => Number.isFinite(n) ? n.toFixed(d) : '—';
const esc = s => String(s).replace(/[&<>"']/g, m => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[m]));

function bindNum(el){
  el.addEventListener('focus', () => { el.value = el.value.trim() === '' || !Number.isFinite(num(el.value)) ? el.value : String(num(el.value)); el.select(); });
  el.addEventListener('blur',  () => { el.value = el.value.trim() === '' || !Number.isFinite(num(el.value)) ? el.value : num(el.value).toLocaleString('ko-KR',{maximumFractionDigits:10}); });
}
['chargeWon','ownCash','ownMileage','mesoPrice','mesoMarket','marketCap'].forEach(id => bindNum($('#'+id)));

const SET_IDS = ['chargeRatio','chargeWon','ownCash','ownMileage','earnRate','mileRate','fee','mesoPrice','mesoMarket','marketCap','earnCap'];
const CHK_IDS = ['earnOnCashOnly','useMarket','marketMile','marketEarn','reuseMileage'];

function settings(){
  return {
    r: num($('#chargeRatio').value) / 100,
    mrate: num($('#mileRate').value) / 100,
    earn: num($('#earnRate').value) / 100,
    earnOnCashOnly: $('#earnOnCashOnly').checked,
    fee: num($('#fee').value) / 100,
    chargeWon: num($('#chargeWon').value),
    ownCash: num($('#ownCash').value),
    ownMile: num($('#ownMileage').value),
    mesoPrice: num($('#mesoPrice').value),
    mesoMarket: num($('#mesoMarket').value),
    marketCap: $('#marketCap').value.trim() === '' ? Infinity : num($('#marketCap').value),
    useMarket: $('#useMarket').checked,
    marketMile: $('#marketMile').checked,
    marketEarn: $('#marketEarn').checked,
    reuseMileage: $('#reuseMileage').checked,
    earnCap: $('#earnCap').value.trim() === '' ? Infinity : num($('#earnCap').value)
  };
}

const mesoToWon = (meso, s) => meso / 1e8 * s.mesoPrice;
function recovery(c, m, s, withMile){
  const inWon = (withMile ? c - Math.floor(c*s.mrate+1e-7) : c) * s.r;
  return inWon > 0 ? mesoToWon(m, s) / inWon * 100 : NaN;
}
function baseline(s){
  if (!(s.mesoMarket > 0) || !(s.r > 0) || !(s.mesoPrice > 0)) return NaN;
  return recovery(s.mesoMarket, 1e8, s, false);
}

/* ===================== 아이템 행 ===================== */
const EXAMPLE = [
  { name:'예시 A · 고가 가위템',   cash:'3,300', meso:'500,000,000', cap:'',   el:true  },
  { name:'예시 B · 중가 소모품',   cash:'1,600', meso:'230,000,000', cap:'50', el:true  },
  { name:'예시 C · 마일리지 불가', cash:'2,200', meso:'340,000,000', cap:'',   el:false }
];

function addRow(d = {}){
  if ($('#rows').children.length >= 30) { showError('아이템은 최대 30개까지 입력할 수 있습니다.'); return null; }
  const tr = document.createElement('tr');
  tr.innerHTML =
    '<td><input type="text" class="name f-name" placeholder="아이템 이름"></td>' +
    '<td><input type="text" class="f-cash" placeholder="3,300"></td>' +
    '<td><input type="text" class="f-meso" placeholder="500,000,000"></td>' +
    '<td><input type="text" class="f-cap" placeholder="무제한"></td>' +
    '<td><input type="checkbox" class="f-el" checked></td>' +
    '<td><input type="checkbox" class="f-earn" checked aria-label="마일리지 적립 대상"></td>' +
    '<td class="effcell bad">—</td>' +
    '<td class="f-rr">—</td>' +
    '<td><button class="del" title="행 삭제">×</button></td>';
  tr.querySelector('.f-name').value = d.name ?? '';
  tr.querySelector('.f-cash').value = d.cash ?? '';
  tr.querySelector('.f-meso').value = d.meso ?? '';
  tr.querySelector('.f-cap').value  = d.cap  ?? '';
  tr.querySelector('.f-el').checked = d.el !== false;
  tr.querySelector('.f-earn').checked = d.earn !== false;
  [['.f-name','아이템 이름'],['.f-cash','캐시 원가'],['.f-meso','경매장 예상가'],['.f-cap','최대 수량'],['.f-el','마일리지 사용 가능']].forEach(([sel,label])=>tr.querySelector(sel).setAttribute('aria-label',label));
  ['.f-cash','.f-meso','.f-cap'].forEach(sel => bindNum(tr.querySelector(sel)));
  tr.querySelector('.del').onclick = () => { tr.remove(); if(!$('#rows').children.length) addRow(); refresh(); };
  tr.addEventListener('input', refresh);
  $('#rows').appendChild(tr);
  return tr;
}

const readRows = () => [...$('#rows').children].map(tr => ({
  tr,
  name: tr.querySelector('.f-name').value.trim() || '(이름 없음)',
  c:    num(tr.querySelector('.f-cash').value),
  gross:num(tr.querySelector('.f-meso').value),
  cap:  tr.querySelector('.f-cap').value.trim() === '' ? Infinity : num(tr.querySelector('.f-cap').value),
  el:   tr.querySelector('.f-el').checked,
  earn: tr.querySelector('.f-earn').checked
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
      const pure = recovery(it.c, m, s, false);
      const mil  = it.el && s.mrate > 0 ? recovery(it.c, m, s, true) : NaN;
      rc.innerHTML = '<span class="rr" style="color:' + (pure >= bar ? 'var(--green)' : 'var(--red)') + '">' +
        fx(pure, 1) + '%</span>' + (Number.isFinite(mil) ? '<small>마일리지 시 ' + fx(mil, 1) + '%</small>' : '');
    } else {
      ec.textContent = '—'; ec.className = 'effcell bad'; rc.textContent = '—';
    }
  });
  save();
}

/* ===================== 계산 ===================== */
async function calculate(){
  if (activeWorker) return;
  let s, raw;
  try { validateInputs(); s = settings(); raw = readRows().filter(it => it.c > 0 && it.gross > 0); }
  catch(error) { showError(error.message); return; }
  const cands = raw.map(it => ({ name:it.name, mm:false, earn:it.earn, c:it.c, m:Math.floor(it.gross*(1-s.fee)), el:it.el, cap:it.cap }));
  if (s.useMarket) cands.push({ name:'메소마켓 (메포 → 1억 메소)', mm:true, earn:s.marketEarn, c:s.mesoMarket, m:1e8, el:s.marketMile, cap:s.marketCap });
  if (!cands.length) { showError('아이템을 입력하거나 메소마켓을 활성화하세요.'); return; }
  const chargeCash = Math.floor(s.chargeWon/s.r);
  const totalCash = s.ownCash + chargeCash;
  const version = inputVersion;
  let r;
  try {
    $('#calcStatus').textContent = '구매 가능한 조합과 순서를 계산하고 있습니다…';
    $('#bCalc').disabled = true;
    r = await runOptimizer({items:cands,cash:totalCash,mile:s.ownMile,mrate:s.mrate,earn:s.earn,
      earnOnCashOnly:s.earnOnCashOnly,reuse:s.reuseMileage,earnCap:s.earnCap});
  } catch(error) { showError(error.message); return; }
  finally { $('#bCalc').disabled = false; }
  if (version !== inputVersion) { $('#calcStatus').textContent = '입력이 변경되었습니다. 다시 계산해주세요.'; return; }
  $('#calcStatus').textContent = r.exact ? '입력한 조건에서 최대 메소 조합을 확인했습니다.' : '탐색 범위에서 찾은 추천 조합입니다. 전역 최적해는 보장하지 않습니다.';
  const earned = r.earned;

  const chargeUsed = Math.max(0, r.usedCash - s.ownCash);
  const spentWon = r.usedCash * s.r;
  const newChargeWon = chargeUsed * s.r;
  const gotWon = mesoToWon(r.meso, s);
  const rate = spentWon > 0 ? gotWon / spentWon * 100 : NaN;
  const profit = gotWon - spentWon;
  const base = baseline(s);

  $('#sumBox').innerHTML = [
    ['총 가용 캐시', comma(totalCash), '캐시', ''],
    ['적립 마일리지', '+' + comma(earned), 'P', 'c-grn'],
    ['사용 마일리지', comma(r.usedMile), 'P', 'c-grn'],
    ['사용 캐시 환산 원가', comma(spentWon), '원', 'c-blue'],
    ['사용 넥슨캐시·환산액', comma(r.usedCash), '캐시', 'c-blue'],
    ['필요 추가 충전액', comma(newChargeWon), '원', ''],
    ['총 획득 메소', comma(r.meso), '', 'c-org'],
    ['회수 현금', comma(gotWon), '원', 'c-org'],
    ['최종 회수율', fx(rate, 2), '%', rate >= 100 ? 'c-grn' : 'c-red'],
    ['환산 손익', (profit >= 0 ? '+' : '') + comma(profit), '원', profit >= 0 ? 'c-grn' : 'c-red']
  ].map(([k, n, u, c]) =>
    '<div><div class="k">' + k + '</div><div class="n ' + c + '">' + n + (u ? '<small>' + u + '</small>' : '') + '</div></div>'
  ).join('');

  const sorted = [...r.lines].filter(l => l.qty > 0).sort((a, b) => b.meso - a.meso);
  const skipped = r.lines.filter(l => l.qty === 0);
  $('#planRows').innerHTML = sorted.map(l => {
    const z = v => v > 0 ? comma(v) : '<span class="zero">0</span>';
    return '<tr' + (l.mm ? ' class="mm"' : '') + '>' +
      '<td>' + esc(l.name) + (l.mm ? ' <small style="color:var(--mute);font-weight:400">· 1개 = 1억</small>' : '') + '</td>' +
      '<td class="mi">' + z(l.mileQty) + '</td><td class="ca">' + z(l.cashQty) + '</td>' +
      '<td style="font-weight:700">' + z(l.qty) + '</td>' +
      '<td>' + comma(l.usedCash) + '</td><td>' + comma(l.usedMile) + '</td>' +
      '<td>' + comma(l.meso) + '</td><td>' + comma(mesoToWon(l.meso, s)) + '원</td></tr>';
  }).join('') || '<tr><td colspan="8" style="text-align:center;color:var(--mute);padding:20px">구매할 수 있는 조합이 없습니다</td></tr>';

  const n = [];
  n.push([r.exact ? 'ok' : '', r.exact ? '입력한 규칙·수량 한도에서 <b>획득 메소 최대 조합</b>을 확인했습니다.' : '계산량 제한 안에서 찾은 <b>추천 조합</b>입니다. 더 좋은 조합이 존재할 수 있습니다.']);
  n.push(['', '회수율은 <b>사용한 보유 캐시까지 포함한 환산 원가</b> 기준입니다. 실제 충전 예산은 ' + comma(s.chargeWon) + '원이며, 잔여 캐시는 회수 현금에 포함하지 않습니다. MVP 인정액은 상품·전환 조건을 별도로 확인해야 합니다.']);
  if (Number.isFinite(base) && s.useMarket) n.push(['', '메소마켓의 단위 회수율은 <b>' + fx(base,2) + '%</b>입니다. 수량 한도와 잔액을 고려한 전체 계획의 비교 결과는 아닙니다.']);
  n.push(['', s.reuseMileage ? '각 구매의 적립금을 <b>수령한 뒤</b> 다음 단계로 진행하세요. 아래 순서대로 1개씩 결제하는 기준입니다.' : '이번 계획에는 <b>처음 보유한 마일리지만 사용</b>합니다. 새 적립분은 잔여 마일리지에 포함됩니다.']);
  if (r.leftMile > 0) n.push(['', '구매 후 남는 마일리지: <b>' + comma(r.leftMile) + 'P</b>.']);
  if (r.leftCash > 0) n.push(['', '남는 캐시: <b>' + comma(r.leftCash) + '</b>. 최대 회수액과 별개로 MVP 목표 금액만큼 소비했는지 확인하세요.']);
  if (skipped.length) n.push(['', '이번 조합에서 미구매: <b>' + skipped.map(l=>esc(l.name)).join(', ') + '</b>.']);
  const top = sorted.find(l=>!l.mm);
  if (top && top.qty > 5 && top.meso/r.meso > .7) n.push(['', '<b>' + esc(top.name) + '</b> ' + comma(top.qty) + '개를 입력한 시세에 판매할 수 있는지 확인하고, 판매 가능량을 최대 수량에 반영하세요.']);
  $('#sequenceRows').innerHTML = r.steps.map((step,i)=>'<tr><td>'+(i+1)+'</td><td>'+esc(cands[step.i].name)+'</td><td>'+ (step.kind==='mile'?'마일리지 병용':'캐시 전액') +'</td><td>'+comma(step.qty)+'</td><td>'+comma(step.reward)+'</td><td>'+comma(step.cashAfter)+'</td><td>'+comma(step.mileAfter)+'</td></tr>').join('');
  $('#notes').innerHTML = n.map(([c, t]) => '<div class="note ' + c + '">' + t + '</div>').join('');

  $('#result').style.display = 'block';
  $('#result').scrollIntoView({ behavior:'smooth', block:'start' });
}

/* ===================== 저장 / 불러오기 ===================== */
const SKEY = 'mvp-calc-v4';
const snapshot = () => ({
  s: Object.fromEntries(SET_IDS.map(id => [id, $('#'+id).value])),
  chk: Object.fromEntries(CHK_IDS.map(id => [id, $('#'+id).checked])),
  items: [...$('#rows').children].map(tr => ({
    name: tr.querySelector('.f-name').value, cash: tr.querySelector('.f-cash').value,
    meso: tr.querySelector('.f-meso').value, cap: tr.querySelector('.f-cap').value,
    el: tr.querySelector('.f-el').checked, earn: tr.querySelector('.f-earn').checked
  }))
});
function restore(d){
  if (!d || typeof d !== 'object' || !Array.isArray(d.items) || d.items.length > 30) throw new Error('아이템 목록이 포함된 설정 파일이 필요합니다 (최대 30개).');
  if (d.items.some(it => !it || typeof it !== 'object')) throw new Error('아이템 형식이 올바르지 않습니다.');
  for (const id of SET_IDS) if (d.s && Object.hasOwn(d.s,id) && ['string','number'].includes(typeof d.s[id])) $('#'+id).value = String(d.s[id]).slice(0,50);
  for (const id of CHK_IDS) if (d.chk && typeof d.chk[id] === 'boolean') $('#'+id).checked = d.chk[id];
  $('#rows').replaceChildren();
  d.items.forEach(it=>addRow({name:String(it.name??'').slice(0,100),cash:String(it.cash??'').slice(0,30),meso:String(it.meso??'').slice(0,30),cap:String(it.cap??'').slice(0,30),el:it.el!==false,earn:it.earn!==false}));
  if (!d.items.length) addRow();
  refresh(); return true;
}
function save(){ try { localStorage.setItem(SKEY,JSON.stringify(snapshot())); } catch { $('#storageStatus').textContent = '이 브라우저에서는 자동 저장을 사용할 수 없습니다. 내보내기로 보관하세요.'; } }
function load(){ try { const stored=localStorage.getItem(SKEY); if (stored) return restore(JSON.parse(stored)); } catch {} return false; }

let activeWorker = null, rejectWorker = null, inputVersion = 0;
function showError(message) { $('#calcStatus').textContent = message; $('#result').style.display = 'none'; }
function cancelCalculation() {
  if (activeWorker) { activeWorker.terminate(); activeWorker = null; rejectWorker?.(new Error('입력이 변경되어 계산을 취소했습니다.')); rejectWorker=null; }
}
function runOptimizer(input) {
  return new Promise((resolve,reject)=> {
    const worker = new Worker('optimizer.worker.js'); activeWorker=worker;
    const finish=()=> { clearTimeout(timer); worker.terminate(); if(activeWorker===worker){activeWorker=null;rejectWorker=null;} };
    const timer=setTimeout(()=>{finish();reject(new Error('계산 시간이 초과되었습니다. 아이템 수나 예산을 줄여주세요.'));},20000);
    rejectWorker=(error)=>{finish();reject(error);};
    worker.onmessage=({data})=>{finish();data.error?reject(new Error(data.error)):resolve(data.result);};
    worker.onerror=()=>{finish();reject(new Error('계산기를 불러오지 못했습니다. 서버 연결을 확인하고 다시 시도해주세요.'));};
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
  check($('#ownMileage'),'보유 마일리지',{max:10000000,int:true});
  check($('#mesoPrice'),'메소 현금 시세',{min:1,int:true});
  check($('#fee'),'경매장 수수료',{max:100});
  check($('#earnRate'),'마일리지 적립률',{max:100});
  check($('#mileRate'),'마일리지 사용률',{max:99.99});
  check($('#earnCap'),'추가 적립 한도',{max:10000000,int:true,blank:true});
  if($('#useMarket').checked) {
    check($('#mesoMarket'),'메소마켓 시세',{min:1,max:10000000,int:true});
    check($('#marketCap'),'메소마켓 한도',{max:10000000,int:true,blank:true});
  }
  for(const [index,tr] of [...$('#rows').children].entries()) {
    const c=tr.querySelector('.f-cash'),m=tr.querySelector('.f-meso'),cap=tr.querySelector('.f-cap');
    if(!c.value.trim()&&!m.value.trim()&&!cap.value.trim()&&!tr.querySelector('.f-name').value.trim())continue;
    check(c,(index+1)+'행 캐시 원가',{min:1,max:10000000,int:true});
    check(m,(index+1)+'행 경매장 예상가',{min:1,int:true});
    check(cap,(index+1)+'행 최대 수량',{max:10000000,int:true,blank:true});
  }
}

/* ===================== 이벤트 ===================== */
$('#bAdd').onclick = () => { addRow(); refresh(); };
$('#bClear').onclick = () => { if (confirm('입력한 아이템 목록을 모두 지웁니다. 계속할까요?')){ $('#rows').innerHTML=''; addRow(); addRow(); addRow(); refresh(); } };
$('#bExample').onclick = () => { $('#rows').innerHTML=''; EXAMPLE.forEach(addRow); refresh(); };
$('#bSort').onclick = () => {
  const s = settings();
  [...$('#rows').children].map(tr => {
    const c = num(tr.querySelector('.f-cash').value), g = num(tr.querySelector('.f-meso').value);
    return { tr, k: c > 0 && g > 0 ? g * (1 - s.fee) / c : -1 };
  }).sort((a, b) => b.k - a.k).forEach(x => $('#rows').appendChild(x.tr));
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
[...SET_IDS, ...CHK_IDS].forEach(id => $('#'+id).addEventListener('input', refresh));
document.addEventListener('keydown', e => { if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') calculate(); });

(async () => { if (!(await load())){ addRow(); addRow(); addRow(); refresh(); } })();
