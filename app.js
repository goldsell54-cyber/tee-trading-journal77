const STORAGE_KEY = 'tee_trading_journal_v1';
const THEME_KEY = 'tee_trading_journal_theme';
let trades = loadTrades();
let currentBefore = '';
let currentAfter = '';
let pnlMode = 'profit';

const $ = (id) => document.getElementById(id);
const qsa = (sel, root=document) => [...root.querySelectorAll(sel)];
function uid(){ return (globalThis.crypto?.randomUUID?.() || ('t-'+Date.now().toString(36)+'-'+Math.random().toString(36).slice(2,10))); }

function loadTrades(){
  try { return JSON.parse(localStorage.getItem(STORAGE_KEY) || '[]'); } catch { return []; }
}
function saveTrades(){ localStorage.setItem(STORAGE_KEY, JSON.stringify(trades)); }
function money(n){
  const v = Number(n || 0);
  return new Intl.NumberFormat('en-US',{style:'currency',currency:'USD',minimumFractionDigits:2}).format(v);
}
function num(n,d=2){ return Number(n||0).toLocaleString('en-US',{maximumFractionDigits:d}); }
function esc(s=''){ return String(s).replace(/[&<>\"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c])); }
function dateTimeLocalValue(date=new Date()){
  const p = n => String(n).padStart(2,'0');
  return `${date.getFullYear()}-${p(date.getMonth()+1)}-${p(date.getDate())}T${p(date.getHours())}:${p(date.getMinutes())}`;
}
function fmtDate(s){ if(!s) return '-'; const d=new Date(s); return d.toLocaleString('th-TH',{dateStyle:'short',timeStyle:'short'}); }
function setPnlMode(mode){
  pnlMode = mode;
  const input = $('pnl');
  if (input && mode === 'be') input.value = '0';
  qsa('.pnl-mode-btn').forEach(b=>b.classList.remove('active'));
  const target = mode==='loss' ? $('pnlLossBtn') : mode==='be' ? $('pnlBeBtn') : $('pnlProfitBtn');
  target?.classList.add('active');
  updateLiveCalc();
}
function signedPnlFromForm(){
  const raw = Number($('pnl')?.value || 0);
  if (pnlMode === 'be') return 0;
  return pnlMode === 'loss' ? -Math.abs(raw) : Math.abs(raw);
}
function netPnl(t){ return Number(t.pnl||0) - Number(t.fees||0); }
function rrOf(t){
  const e=Number(t.entry), x=Number(t.exit), s=Number(t.sl);
  if(!e || !x || !s || e===s) return null;
  const risk=Math.abs(e-s), reward=Math.abs(x-e);
  return reward/risk;
}
function rMultiple(t){ const risk=Number(t.riskUsd||0); return risk>0 ? netPnl(t)/risk : null; }
function riskPct(t){ const risk=Number(t.riskUsd||0), bal=Number(t.balance||0); return risk>0&&bal>0 ? risk/bal*100 : null; }
function plannedRR(t){
  const e=Number(t.entry), tp=Number(t.tp), s=Number(t.sl);
  if(!e || !tp || !s || e===s) return null;
  return Math.abs(tp-e)/Math.abs(e-s);
}
function calcStats(list){
  const closed=list.filter(t=>Number.isFinite(Number(t.pnl)) && t.pnl!=='' && t.pnl!==null && t.pnl!==undefined);
  const pnls=closed.map(netPnl);
  const wins=pnls.filter(v=>v>0), losses=pnls.filter(v=>v<0), bes=pnls.filter(v=>v===0);
  const grossWin=wins.reduce((a,b)=>a+b,0), grossLoss=Math.abs(losses.reduce((a,b)=>a+b,0));
  const total=pnls.reduce((a,b)=>a+b,0);
  const avg=closed.length?total/closed.length:0;
  const winRate=closed.length?wins.length/closed.length*100:0;
  const pf=grossLoss?grossWin/grossLoss:(grossWin?Infinity:0);
  const avgWin=wins.length?grossWin/wins.length:0;
  const avgLoss=losses.length?grossLoss/losses.length:0;
  const expectancy=closed.length?((wins.length/closed.length)*avgWin)-((losses.length/closed.length)*avgLoss):0;
  const rVals=closed.map(rMultiple).filter(v=>v!==null&&Number.isFinite(v));
  const avgR=rVals.length?rVals.reduce((a,b)=>a+b,0)/rVals.length:0;
  let eq=0, peak=0, maxDD=0;
  [...closed].sort((a,b)=>new Date(a.date)-new Date(b.date)).forEach(t=>{eq+=netPnl(t);peak=Math.max(peak,eq);maxDD=Math.max(maxDD,peak-eq)});
  return {closed:closed.length,total,wins:wins.length,losses:losses.length,bes:bes.length,winRate,pf,avg,expectancy,maxDD,grossWin,grossLoss,avgR};
}
function applyFilters(list){
  const period=$('periodFilter')?.value||'all'; const sym=$('symbolFilter')?.value||'all'; const side=$('sideFilter')?.value||'all';
  const now=new Date(); let from=null;
  if(period==='today'){ from=new Date(now.getFullYear(),now.getMonth(),now.getDate()); }
  if(period==='7d'){ from=new Date(now); from.setDate(from.getDate()-6); from.setHours(0,0,0,0); }
  if(period==='30d'){ from=new Date(now); from.setDate(from.getDate()-29); from.setHours(0,0,0,0); }
  if(period==='month'){ from=new Date(now.getFullYear(),now.getMonth(),1); }
  return list.filter(t=>(!from||new Date(t.date)>=from)&&(sym==='all'||t.symbol===sym)&&(side==='all'||t.side===side));
}
function todayRange(){ const n=new Date(); return new Date(n.getFullYear(),n.getMonth(),n.getDate()); }
function monthRange(){ const n=new Date(); return new Date(n.getFullYear(),n.getMonth(),1); }
function statCard(label,value,sub='',cls=''){
  return `<div class="stat-card"><div class="stat-label">${label}</div><div class="stat-value ${cls}">${value}</div><div class="stat-sub">${sub}</div></div>`;
}
function getBestSetup(list){
  const rows = groupPerformance('setup', list).filter(x=>x.k && x.k!=='ไม่ระบุ');
  return rows[0] || null;
}
function groupPerformance(key, source=trades){
  const m=new Map();
  source.forEach(t=>{
    const raw = t[key];
    const k=(typeof raw === 'string' ? raw.trim() : raw) || 'ไม่ระบุ';
    if(!m.has(k))m.set(k,[]);
    m.get(k).push(t);
  });
  return [...m.entries()].map(([k,v])=>({k,...calcStats(v)})).sort((a,b)=>b.total-a.total);
}
function renderHeroOverview(list){
  const totalStats = calcStats(trades);
  const todayList = trades.filter(t=>new Date(t.date) >= todayRange());
  const monthList = trades.filter(t=>new Date(t.date) >= monthRange());
  const todayStats = calcStats(todayList);
  const monthStats = calcStats(monthList);
  const best = getBestSetup(trades);
  const filterText = ($('periodFilter')?.selectedOptions?.[0]?.textContent || 'ทั้งหมด');
  $('heroOverview').innerHTML = `
    <div class="hero-head">
      <div class="hero-title">
        <div class="eyebrow">TRADING COMMAND CENTER</div>
        <h2>ดูง่ายขึ้น ใช้ง่ายขึ้น และโฟกัสสิ่งสำคัญ</h2>
        <p>สรุปภาพรวมกำไร ขาดทุน วินัย และ Setup ที่ทำเงินได้ดี เพื่อให้รู้ทันทีว่าอะไรควรทำซ้ำ และอะไรควรเลิก</p>
      </div>
      <div class="hero-badge">กำลังดู: ${esc(filterText)} • ทั้งหมด ${trades.length} รายการ</div>
    </div>
    <div class="hero-kpis">
      <div class="hero-kpi"><div class="label">วันนี้</div><div class="value ${todayStats.total>0?'positive':todayStats.total<0?'negative':''}">${money(todayStats.total)}</div><div class="sub">${todayStats.closed || 0} closed trades</div></div>
      <div class="hero-kpi"><div class="label">เดือนนี้</div><div class="value ${monthStats.total>0?'positive':monthStats.total<0?'negative':''}">${money(monthStats.total)}</div><div class="sub">Win rate ${num(monthStats.winRate,1)}%</div></div>
      <div class="hero-kpi"><div class="label">เฉลี่ยต่อไม้</div><div class="value ${totalStats.avg>0?'positive':totalStats.avg<0?'negative':''}">${money(totalStats.avg)}</div><div class="sub">Expectancy ${money(totalStats.expectancy)}</div></div>
      <div class="hero-kpi"><div class="label">Setup เด่น</div><div class="value">${esc(best?.k || '—')}</div><div class="sub">${best ? `${money(best.total)} • ${best.closed} ไม้` : 'ยังไม่มีข้อมูลพอ'}</div></div>
    </div>`;
}
function renderAll(){ updateSymbolFilter(); renderDashboard(); renderTrades(); renderAnalytics(); }
function updateSymbolFilter(){
  const el=$('symbolFilter'); if(!el) return; const current=el.value||'all';
  const syms=[...new Set(trades.map(t=>t.symbol).filter(Boolean))].sort();
  el.innerHTML='<option value="all">ทั้งหมด</option>'+syms.map(s=>`<option value="${esc(s)}">${esc(s)}</option>`).join('');
  el.value=syms.includes(current)?current:'all';
}
function renderDashboard(){
  const list=applyFilters(trades); const s=calcStats(list);
  renderHeroOverview(list);
  $('statsGrid').innerHTML=[
    statCard('Net P/L',money(s.total),`${s.closed} closed trades`,s.total>0?'positive':s.total<0?'negative':''),
    statCard('Win Rate',`${num(s.winRate,1)}%`,`${s.wins}W / ${s.losses}L / ${s.bes}BE`,s.winRate>=50?'positive':''),
    statCard('Profit Factor',s.pf===Infinity?'∞':num(s.pf,2),'Gross profit ÷ gross loss',s.pf>=1.5?'positive':s.pf&&s.pf<1?'negative':''),
    statCard('Expectancy',money(s.expectancy),'ค่าเฉลี่ยที่คาดหวังต่อไม้',s.expectancy>0?'positive':s.expectancy<0?'negative':''),
    statCard('Avg R',`${num(s.avgR,2)}R`,'จาก Risk USD ที่กรอก',s.avgR>0?'positive':s.avgR<0?'negative':''),
    statCard('Max Drawdown',money(s.maxDD),'จาก Equity ที่บันทึก',s.maxDD>0?'negative':''),
  ].join('');
  renderEquityChart(list); renderDailyChart(list); renderRecent(list); renderDiscipline(list);
}
function chartSetup(canvas){
  const dpr=window.devicePixelRatio||1; const rect=canvas.getBoundingClientRect();
  canvas.width=Math.max(300,Math.floor(rect.width*dpr)); canvas.height=Math.floor(300*dpr);
  const ctx=canvas.getContext('2d'); ctx.setTransform(dpr,0,0,dpr,0,0); return {ctx,w:rect.width,h:300};
}
function cssVar(name){ return getComputedStyle(document.documentElement).getPropertyValue(name).trim(); }
function renderEquityChart(list){
  const canvas=$('equityChart'); const {ctx,w,h}=chartSetup(canvas); const pad={l:48,r:16,t:18,b:34};
  const arr=[...list].filter(t=>t.pnl!==''&&t.pnl!=null).sort((a,b)=>new Date(a.date)-new Date(b.date));
  let total=0; const pts=arr.map(t=>({x:new Date(t.date),y:(total+=netPnl(t))}));
  $('equityCaption').textContent=pts.length?`${pts.length} จุด`:'ไม่มีข้อมูล'; drawLineChart(ctx,w,h,pad,pts);
}
function renderDailyChart(list){
  const canvas=$('dailyChart'); const {ctx,w,h}=chartSetup(canvas); const map=new Map();
  list.filter(t=>t.pnl!==''&&t.pnl!=null).forEach(t=>{const d=new Date(t.date);const k=`${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;map.set(k,(map.get(k)||0)+netPnl(t));});
  const vals=[...map.entries()].sort((a,b)=>a[0].localeCompare(b[0])).slice(-20); $('dailyCaption').textContent=vals.length?`${vals.length} วันล่าสุด`:'ไม่มีข้อมูล'; drawBarChart(ctx,w,h,vals);
}
function drawGrid(ctx,w,h,pad,minY,maxY){
  ctx.clearRect(0,0,w,h); ctx.strokeStyle=cssVar('--line'); ctx.fillStyle=cssVar('--muted'); ctx.lineWidth=1; ctx.font='11px system-ui';
  for(let i=0;i<=4;i++){const y=pad.t+(h-pad.t-pad.b)*(i/4);ctx.beginPath();ctx.moveTo(pad.l,y);ctx.lineTo(w-pad.r,y);ctx.stroke();const v=maxY-(maxY-minY)*(i/4);ctx.fillText(num(v,0),4,y+4)}
}
function drawLineChart(ctx,w,h,pad,pts){
  if(!pts.length){ctx.clearRect(0,0,w,h);ctx.fillStyle=cssVar('--muted');ctx.font='14px system-ui';ctx.fillText('ยังไม่มีข้อมูล',w/2-45,h/2);return}
  const ys=pts.map(p=>p.y); let minY=Math.min(0,...ys), maxY=Math.max(0,...ys); if(minY===maxY){minY-=1;maxY+=1} const span=maxY-minY;
  minY-=span*.08;maxY+=span*.08; drawGrid(ctx,w,h,pad,minY,maxY);
  const x=i=>pad.l+(w-pad.l-pad.r)*(pts.length===1?.5:i/(pts.length-1)); const y=v=>pad.t+(h-pad.t-pad.b)*(1-(v-minY)/(maxY-minY));
  // fill area
  ctx.beginPath();pts.forEach((p,i)=>{const px=x(i),py=y(p.y);i?ctx.lineTo(px,py):ctx.moveTo(px,py)});ctx.lineTo(x(pts.length-1),h-pad.b);ctx.lineTo(x(0),h-pad.b);ctx.closePath();
  const grad = ctx.createLinearGradient(0,pad.t,0,h-pad.b); grad.addColorStop(0,'rgba(123,140,255,.25)'); grad.addColorStop(1,'rgba(123,140,255,0)'); ctx.fillStyle=grad; ctx.fill();
  ctx.strokeStyle=cssVar('--accent');ctx.lineWidth=2.6;ctx.beginPath();pts.forEach((p,i)=>{const px=x(i),py=y(p.y);i?ctx.lineTo(px,py):ctx.moveTo(px,py)});ctx.stroke();
  ctx.fillStyle=cssVar('--accent2');pts.forEach((p,i)=>{ctx.beginPath();ctx.arc(x(i),y(p.y),3,0,Math.PI*2);ctx.fill()});
}
function drawBarChart(ctx,w,h,vals){
  const pad={l:48,r:16,t:18,b:34}; if(!vals.length){ctx.clearRect(0,0,w,h);ctx.fillStyle=cssVar('--muted');ctx.font='14px system-ui';ctx.fillText('ยังไม่มีข้อมูล',w/2-45,h/2);return}
  const ys=vals.map(v=>v[1]); let minY=Math.min(0,...ys),maxY=Math.max(0,...ys);if(minY===maxY){minY-=1;maxY+=1}const span=maxY-minY;minY-=span*.08;maxY+=span*.08;drawGrid(ctx,w,h,pad,minY,maxY);const y=v=>pad.t+(h-pad.t-pad.b)*(1-(v-minY)/(maxY-minY));const base=y(0);const cw=(w-pad.l-pad.r)/vals.length;ctx.font='10px system-ui';
  vals.forEach((v,i)=>{const px=pad.l+i*cw+cw*.16,bw=Math.max(3,cw*.68),py=y(v[1]);ctx.fillStyle=v[1]>=0?cssVar('--accent2'):cssVar('--danger');ctx.fillRect(px,Math.min(base,py),bw,Math.abs(base-py)); if(vals.length<=10){ctx.fillStyle=cssVar('--muted');ctx.fillText(v[0].slice(5),px,h-12)}});
}
function renderRecent(list){
  const recent=[...list].sort((a,b)=>new Date(b.date)-new Date(a.date)).slice(0,6);
  $('recentTrades').innerHTML=recent.length?recent.map(t=>`<div class="recent-item" data-detail="${t.id}"><span class="side-pill ${t.side==='BUY'?'buy':'sell'}">${t.side}</span><div class="recent-main"><strong>${esc(t.symbol||'-')} · ${esc(t.setup||'No setup')}</strong><span>${fmtDate(t.date)}</span></div><div class="recent-pnl ${netPnl(t)>0?'positive':netPnl(t)<0?'negative':''}">${money(netPnl(t))}</div></div>`).join(''):'<div class="empty-state">ยังไม่มีรายการเทรด</div>';
  qsa('[data-detail]', $('recentTrades')).forEach(el=>el.onclick=()=>openDetail(el.dataset.detail));
}
function renderDiscipline(list){
  const closed=list.filter(t=>t.followPlan); const followed=closed.filter(t=>t.followPlan==='yes').length; const pct=closed.length?followed/closed.length*100:0;
  const noMistake=list.filter(t=>!(t.mistakes||'').trim()).length; const cleanPct=list.length?noMistake/list.length*100:0;
  const withSL=list.filter(t=>Number(t.sl)).length; const slPct=list.length?withSL/list.length*100:0;
  $('disciplinePanel').innerHTML=[['ทำตามแผน',pct],['มี SL ระบุไว้',slPct],['ไม่มีข้อผิดพลาดที่บันทึก',cleanPct]].map(([n,p])=>`<div class="progress-row"><div class="progress-head"><span>${n}</span><strong>${num(p,0)}%</strong></div><div class="progress"><i style="width:${Math.min(100,p)}%"></i></div></div>`).join('');
}
function resultType(t){ const p=netPnl(t); return p>0?'win':p<0?'loss':'be'; }
function renderTrades(){
  const term=($('searchTrades').value||'').toLowerCase(); const rf=$('resultFilter').value;
  let list=[...trades].sort((a,b)=>new Date(b.date)-new Date(a.date));
  list=list.filter(t=>!term||[t.symbol,t.setup,t.note,t.reason,t.mistakes].join(' ').toLowerCase().includes(term));
  list=list.filter(t=>{const p=netPnl(t);return rf==='all'||(rf==='win'&&p>0)||(rf==='loss'&&p<0)||(rf==='be'&&p===0)});
  $('tradeCount').textContent=`${list.length} รายการ`;
  $('emptyTrades').classList.toggle('hidden',list.length>0);
  $('emptyTrades').innerHTML='ยังไม่มีรายการเทรด กด “＋ เพิ่มออเดอร์” เพื่อเริ่มบันทึก';

  $('tradesCards').innerHTML = list.length ? list.map(t=>{
    const rr=rrOf(t); const cls = netPnl(t)>0?'positive':netPnl(t)<0?'negative':'';
    return `<article class="trade-card">
      <div class="trade-card-top">
        <div>
          <div class="trade-card-symbol">${esc(t.symbol)}</div>
          <div class="trade-card-date">${fmtDate(t.date)}</div>
        </div>
        <div style="display:flex;gap:8px;align-items:center"><span class="side-pill ${t.side==='BUY'?'buy':'sell'}">${t.side}</span><strong class="${cls}">${money(netPnl(t))}</strong></div>
      </div>
      <div class="trade-card-grid">
        <div class="trade-card-cell"><small>Entry</small><strong>${num(t.entry,4)}</strong></div>
        <div class="trade-card-cell"><small>Exit</small><strong>${t.exit?num(t.exit,4):'-'}</strong></div>
        <div class="trade-card-cell"><small>Lot</small><strong>${t.lot||'-'}</strong></div>
        <div class="trade-card-cell"><small>RR</small><strong>${rr?num(rr,2):'-'}</strong></div>
        <div class="trade-card-cell"><small>ผลลัพธ์</small><strong>${resultType(t).toUpperCase()}</strong></div>
        <div class="trade-card-cell"><small>Risk</small><strong>${t.riskUsd?money(t.riskUsd):'-'}</strong></div>
      </div>
      <div class="trade-card-bottom">
        <span class="setup-tag">${esc(t.setup||'ไม่ระบุ Setup')}</span>
        <div class="row-actions">
          <button class="mini" data-viewtrade="${t.id}">ดู</button>
          <button class="mini" data-edit="${t.id}">แก้</button>
          <button class="mini" data-delete="${t.id}">ลบ</button>
        </div>
      </div>
    </article>`;
  }).join('') : '<div class="empty-state">ยังไม่มีรายการเทรด</div>';

  $('tradesTableBody').innerHTML=list.map(t=>{const rr=rrOf(t);return `<tr><td>${fmtDate(t.date)}</td><td><strong>${esc(t.symbol)}</strong></td><td><span class="side-pill ${t.side==='BUY'?'buy':'sell'}">${t.side}</span></td><td>${num(t.entry,4)}</td><td>${t.exit?num(t.exit,4):'-'}</td><td>${t.lot||'-'}</td><td class="${netPnl(t)>0?'positive':netPnl(t)<0?'negative':''}"><strong>${money(netPnl(t))}</strong></td><td>${rr?num(rr,2):'-'}</td><td>${esc(t.setup||'-')}</td><td><div class="row-actions"><button class="mini" data-viewtrade="${t.id}">ดู</button><button class="mini" data-edit="${t.id}">แก้</button><button class="mini" data-delete="${t.id}">ลบ</button></div></td></tr>`}).join('');
  qsa('[data-viewtrade]').forEach(b=>b.onclick=()=>openDetail(b.dataset.viewtrade));
  qsa('[data-edit]').forEach(b=>b.onclick=()=>openTradeForm(b.dataset.edit));
  qsa('[data-delete]').forEach(b=>b.onclick=()=>deleteTrade(b.dataset.delete));
}
function renderBars(el, rows, valueFn=r=>r.total, formatFn=money){
  if(!rows.length){el.innerHTML='<div class="empty-state">ยังไม่มีข้อมูล</div>';return}
  const max=Math.max(...rows.map(r=>Math.abs(valueFn(r))),1);
  el.innerHTML=`<div class="bar-list">${rows.slice(0,10).map(r=>`<div class="bar-item"><span>${esc(r.k)}</span><div class="bar-track"><div class="bar-fill" style="width:${Math.max(3,Math.abs(valueFn(r))/max*100)}%"></div></div><span class="bar-value ${valueFn(r)>0?'positive':valueFn(r)<0?'negative':''}">${formatFn(valueFn(r))}</span></div>`).join('')}</div>`;
}
function renderAnalytics(){
  const s=calcStats(trades);
  $('analyticsStats').innerHTML=[
    statCard('Total Trades',String(s.closed),'ออเดอร์ที่มี P/L'),
    statCard('Gross Profit',money(s.grossWin),'กำไรรวม','positive'),
    statCard('Gross Loss',money(s.grossLoss),'ขาดทุนรวม','negative'),
    statCard('Win Rate',`${num(s.winRate,1)}%`,'อัตราชนะ'),
    statCard('Profit Factor',s.pf===Infinity?'∞':num(s.pf,2),'คุณภาพกำไร'),
    statCard('Expectancy',money(s.expectancy),'ต่อออเดอร์',s.expectancy>0?'positive':s.expectancy<0?'negative':'')
  ].join('');
  renderBars($('setupAnalytics'),groupPerformance('setup'));
  renderBars($('symbolAnalytics'),groupPerformance('symbol'));
  const mm=new Map();
  trades.forEach(t=>(t.mistakes||'').split(',').map(x=>x.trim()).filter(Boolean).forEach(x=>mm.set(x,(mm.get(x)||0)+1)));
  renderBars($('mistakeAnalytics'),[...mm.entries()].map(([k,count])=>({k,count})).sort((a,b)=>b.count-a.count),r=>r.count,v=>`${v} ครั้ง`);
  renderBars($('sessionAnalytics'),groupPerformance('session'));
}
function openTradeForm(id=''){
  const t=trades.find(x=>x.id===id);
  $('tradeForm').reset();
  $('tradeId').value=t?.id||'';
  $('formTitle').textContent=t?'แก้ไขออเดอร์':'เพิ่มออเดอร์';
  $('tradeDate').value=t?.date||dateTimeLocalValue();
  $('symbol').value=t?.symbol||'XAUUSD';
  $('side').value=t?.side||'BUY';
  $('lot').value=t?.lot??'';
  $('entry').value=t?.entry??'';
  $('exit').value=t?.exit??'';
  $('sl').value=t?.sl??'';
  $('tp').value=t?.tp??'';
  const existingPnl = Number(t?.pnl ?? 0); pnlMode = t ? (existingPnl<0?'loss':existingPnl>0?'profit':'be') : 'profit'; $('pnl').value=t ? Math.abs(existingPnl) : ''; setPnlMode(pnlMode);
  $('fees').value=t?.fees??0;
  $('riskUsd').value=t?.riskUsd??'';
  $('balance').value=t?.balance??'';
  $('setup').value=t?.setup||'';
  $('session').value=t?.session||'';
  $('emotion').value=t?.emotion||'';
  $('followPlan').value=t?.followPlan||'yes';
  $('mistakes').value=t?.mistakes||'';
  $('reason').value=t?.reason||'';
  $('note').value=t?.note||'';
  currentBefore=t?.beforeImage||'';
  currentAfter=t?.afterImage||'';
  renderImagePreview();
  updateLiveCalc();
  $('tradeDialog').showModal();
}
function renderImagePreview(){ $('beforePreview').innerHTML=currentBefore?`<img src="${currentBefore}" alt="ก่อนเข้า">`:'<span class="muted">ยังไม่มีรูป</span>'; $('afterPreview').innerHTML=currentAfter?`<img src="${currentAfter}" alt="หลังออก">`:'<span class="muted">ยังไม่มีรูป</span>'; }
function fileToDataURL(file,max=1400,quality=.82){
  return new Promise((resolve,reject)=>{const fr=new FileReader();fr.onerror=reject;fr.onload=()=>{const img=new Image();img.onload=()=>{let {width,height}=img;const scale=Math.min(1,max/Math.max(width,height));width=Math.round(width*scale);height=Math.round(height*scale);const c=document.createElement('canvas');c.width=width;c.height=height;c.getContext('2d').drawImage(img,0,0,width,height);resolve(c.toDataURL('image/jpeg',quality));};img.onerror=reject;img.src=fr.result;};fr.readAsDataURL(file);});
}
async function handleImage(input,which){const f=input.files?.[0];if(!f)return;try{const data=await fileToDataURL(f);if(which==='before')currentBefore=data;else currentAfter=data;renderImagePreview();}catch{toast('อ่านรูปไม่สำเร็จ')}}
function getFormTrade(){
  return {id:$('tradeId').value||uid(),date:$('tradeDate').value,symbol:$('symbol').value.trim().toUpperCase(),side:$('side').value,lot:$('lot').value,entry:$('entry').value,exit:$('exit').value,sl:$('sl').value,tp:$('tp').value,pnl:signedPnlFromForm(),fees:$('fees').value||0,riskUsd:$('riskUsd').value,balance:$('balance').value,setup:$('setup').value.trim(),session:$('session').value,emotion:$('emotion').value,followPlan:$('followPlan').value,mistakes:$('mistakes').value.trim(),reason:$('reason').value.trim(),note:$('note').value.trim(),beforeImage:currentBefore,afterImage:currentAfter,updatedAt:new Date().toISOString()};
}
function updateLiveCalc(){
  const t=getFormTrade();const rr=plannedRR(t),actual=rrOf(t),net=netPnl(t),r=rMultiple(t),rp=riskPct(t);
  $('liveCalc').innerHTML=`Planned RR: <strong>${rr?num(rr,2):'-'}</strong> &nbsp; • &nbsp; Actual RR: <strong>${actual?num(actual,2):'-'}</strong> &nbsp; • &nbsp; R: <strong>${r!==null?num(r,2)+'R':'-'}</strong> &nbsp; • &nbsp; Risk: <strong>${rp!==null?num(rp,2)+'%':'-'}</strong> &nbsp; • &nbsp; Net P/L: <strong class="${net>0?'positive':net<0?'negative':''}">${money(net)}</strong>`;
}
function deleteTrade(id){if(!confirm('ลบรายการนี้ใช่ไหม?'))return;trades=trades.filter(t=>t.id!==id);saveTrades();renderAll();toast('ลบแล้ว');}
function openDetail(id){
  const t=trades.find(x=>x.id===id);if(!t)return;const rr=rrOf(t),prr=plannedRR(t);
  $('tradeDetail').innerHTML=`<div class="detail-grid">${[['วันที่',fmtDate(t.date)],['Symbol',esc(t.symbol)],['Side',t.side],['Lot',t.lot||'-'],['Entry',num(t.entry,4)],['Exit',t.exit?num(t.exit,4):'-'],['SL',t.sl?num(t.sl,4):'-'],['TP',t.tp?num(t.tp,4):'-'],['Net P/L',money(netPnl(t))],['Risk USD',t.riskUsd?money(t.riskUsd):'-'],['Risk %',riskPct(t)!==null?num(riskPct(t),2)+'%':'-'],['R Multiple',rMultiple(t)!==null?num(rMultiple(t),2)+'R':'-'],['Actual RR',rr?num(rr,2):'-'],['Planned RR',prr?num(prr,2):'-'],['Setup',esc(t.setup||'-')],['Session',esc(t.session||'-')],['Emotion',esc(t.emotion||'-')],['ตามแผน',t.followPlan==='yes'?'ใช่':'ไม่'],['ผิดพลาด',esc(t.mistakes||'-')]].map(([a,b])=>`<div class="detail-cell"><small>${a}</small><strong>${b}</strong></div>`).join('')}</div>${t.reason?`<div class="detail-text"><strong>เหตุผลเข้าเทรด</strong>\n${esc(t.reason)}</div>`:''}${t.note?`<div class="detail-text"><strong>สิ่งที่เรียนรู้ / Note</strong>\n${esc(t.note)}</div>`:''}<div class="detail-images">${t.beforeImage?`<div><small class="muted">ก่อนเข้า</small><img src="${t.beforeImage}"></div>`:''}${t.afterImage?`<div><small class="muted">หลังออก</small><img src="${t.afterImage}"></div>`:''}</div>`;
  $('detailDialog').showModal();
}
function exportJson(){const blob=new Blob([JSON.stringify({version:1,exportedAt:new Date().toISOString(),trades},null,2)],{type:'application/json'});downloadBlob(blob,`trading-journal-${new Date().toISOString().slice(0,10)}.json`);}
function csvCell(v){const s=String(v??'');return `"${s.replaceAll('"','""')}"`;}
function exportCsv(){const heads=['date','symbol','side','lot','entry','exit','sl','tp','pnl','fees','riskUsd','balance','setup','session','emotion','followPlan','mistakes','reason','note'];const rows=[heads.join(','),...trades.map(t=>heads.map(h=>csvCell(t[h])).join(','))];downloadBlob(new Blob(['\ufeff'+rows.join('\n')],{type:'text/csv;charset=utf-8'}),`trading-journal-${new Date().toISOString().slice(0,10)}.csv`);}
function downloadBlob(blob,name){const a=document.createElement('a');a.href=URL.createObjectURL(blob);a.download=name;a.click();setTimeout(()=>URL.revokeObjectURL(a.href),1000);}
function importJson(file){const fr=new FileReader();fr.onload=()=>{try{const obj=JSON.parse(fr.result);const incoming=Array.isArray(obj)?obj:obj.trades;if(!Array.isArray(incoming))throw 0;const map=new Map(trades.map(t=>[t.id,t]));incoming.forEach(t=>{const id=t.id||uid();map.set(id,{...t,id})});trades=[...map.values()];saveTrades();renderAll();toast(`นำเข้า ${incoming.length} รายการแล้ว`);}catch{alert('ไฟล์ไม่ถูกต้อง');}};fr.readAsText(file);}
function toast(msg){const el=$('toast');el.textContent=msg;el.classList.add('show');clearTimeout(toast.timer);toast.timer=setTimeout(()=>el.classList.remove('show'),2200);}
function switchView(name){
  qsa('.tab').forEach(b=>b.classList.toggle('active',b.dataset.view===name));
  qsa('.bottom-item').forEach(b=>b.classList.toggle('active',b.dataset.view===name));
  qsa('.view').forEach(v=>v.classList.toggle('active',v.id===`view-${name}`));
  if(name==='dashboard')setTimeout(renderDashboard,30);
}
function applyTheme(){const t=localStorage.getItem(THEME_KEY)||'dark';document.documentElement.classList.toggle('light',t==='light');setTimeout(()=>{renderDashboard()},20)}

qsa('.tab').forEach(b=>b.onclick=()=>switchView(b.dataset.view));
qsa('.bottom-item').forEach(b=>b.onclick=()=>switchView(b.dataset.view));
qsa('[data-go]').forEach(b=>b.onclick=()=>switchView(b.dataset.go));
$('newTradeBtn').onclick=()=>openTradeForm();
$('fabAddBtn').onclick=()=>openTradeForm();
$('closeDialogBtn').onclick=()=> $('tradeDialog').close();
$('cancelBtn').onclick=()=> $('tradeDialog').close();
$('closeDetailBtn').onclick=()=> $('detailDialog').close();
$('tradeForm').addEventListener('submit',e=>{e.preventDefault();const t=getFormTrade();if(!t.date||!t.symbol||!t.entry){alert('กรอก วันที่, Symbol และ Entry');return}const i=trades.findIndex(x=>x.id===t.id);if(i>=0)trades[i]=t;else trades.push(t);saveTrades();$('tradeDialog').close();renderAll();toast('บันทึกแล้ว');});
['entry','exit','sl','tp','pnl','fees','riskUsd','balance'].forEach(id=>$(id).addEventListener('input',updateLiveCalc));
$('pnlProfitBtn').onclick=()=>setPnlMode('profit');
$('pnlLossBtn').onclick=()=>setPnlMode('loss');
$('pnlBeBtn').onclick=()=>setPnlMode('be');
$('beforeImage').onchange=()=>handleImage($('beforeImage'),'before');
$('afterImage').onchange=()=>handleImage($('afterImage'),'after');
['periodFilter','symbolFilter','sideFilter'].forEach(id=>$(id).onchange=renderDashboard);
$('clearFiltersBtn').onclick=()=>{$('periodFilter').value='all';$('symbolFilter').value='all';$('sideFilter').value='all';renderDashboard()};
$('searchTrades').oninput=renderTrades;
$('resultFilter').onchange=renderTrades;
$('exportJsonBtn').onclick=exportJson;
$('exportCsvBtn').onclick=exportCsv;
$('importFile').onchange=e=>{if(e.target.files[0])importJson(e.target.files[0]);e.target.value=''};
$('clearAllBtn').onclick=()=>{if(confirm('ลบข้อมูลทั้งหมดจริงหรือไม่?')){trades=[];saveTrades();renderAll();toast('ล้างข้อมูลแล้ว')}};
$('themeBtn').onclick=()=>{const next=document.documentElement.classList.contains('light')?'dark':'light';localStorage.setItem(THEME_KEY,next);applyTheme()};
window.addEventListener('resize',()=>{clearTimeout(window.__rz);window.__rz=setTimeout(renderDashboard,150)});
if('serviceWorker' in navigator && location.protocol.startsWith('http')) navigator.serviceWorker.register('./sw.js').catch(()=>{});
applyTheme();renderAll();
