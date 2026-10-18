/* ═══════════ UI、音效與主迴圈 ═══════════ */
const $ = s=>document.querySelector(s);

/* 工具基本資料(懸停提示):[規格列..., 說明] */
const TOOL_INFO={
  query:   [[],'點擊地格查看電力、地價、污染、犯罪與交通。'],
  doze:    [[['費用','$1/格']],'拆除地物;大建築整棟拆除。'],
  autodoze:[[['費用','$1/格']],'開啟時施工自動清除樹林、瓦礫與腳下電線。'],
  road:    [[['維護','$0.6/格・月']],'分區須在道路 3 格內才會生長;可跨河造橋(5 倍造價)。'],
  rail:    [[['維護','$1.5/格・月']],'需搭配火車站才有作用;可與道路形成平交道、跨河造橋。'],
  wire:    [[],'傳導電力;可跨越道路與鐵路。'],
  station: [[['尺寸','2×2'],['維護','$15/月']],'須緊鄰鐵路並供電;同一鐵路網 ≥2 站才營運,周圍約 6 格車流減半。'],
  res:     [[['維護','$0.3/格・月'],['用電','1+等級×0.5']],'需供電、道路與住宅需求;人口依等級與地價。'],
  com:     [[['維護','$0.3/格・月'],['用電','1+等級×0.5']],'提供就業;需求來自住宅人口。'],
  ind:     [[['維護','$0.3/格・月'],['用電','1+等級×0.5']],'提供就業但產生污染;需求來自對外市場。'],
  park:    [[],'提升周圍 5 格地價。'],
  police:  [[['尺寸','2×2'],['維護','$40/月']],'需供電;依撥款降低周圍犯罪。'],
  firesta: [[['尺寸','2×2'],['維護','$40/月']],'需供電;依撥款加快滅火、減緩火勢蔓延。'],
  stadium: [[['尺寸','4×4']],'提高住宅需求與周圍地價。'],
  coal:    [[['尺寸','3×3'],['容量','480'],['維護','$60/月']],'便宜但污染嚴重。'],
  nuke:    [[['尺寸','3×3'],['容量','1200'],['維護','$110/月']],'容量大、無污染。'],
  port:    [[['尺寸','3×3']],'須緊鄰水域;加快對外市場成長,提高工業需求。'],
  airport: [[['尺寸','5×5']],'大幅加快對外市場成長,但有污染。'],
};
function showTip(tl, el){
  const tip=$('#tip'), info=TOOL_INFO[tl.id]; if(!tip||!info) return;
  const rows=[];
  if(tl.pr && !tl.tg) rows.push(['造價', '$'+tl.pr+(isBigB(tl.t)?'':(tl.id==='doze'?'':'/格'))]);
  rows.push(...info[0]);
  tip.innerHTML=`<div class="tt">${tl.ic} ${tl.nm}</div>`+
    rows.map(([k,v])=>`<span class="k">${k}</span> ${v}`).join('<br>')+
    `<div class="note">${info[1]}</div>`;
  tip.style.display='block';
  const r=el.getBoundingClientRect();
  tip.style.left=(r.right+8)+'px';
  tip.style.top=Math.max(8,Math.min(innerHeight-tip.offsetHeight-8, r.top))+'px';
}
function hideTip(){ const t=$('#tip'); if(t) t.style.display='none'; }

/* 工具列 */
function buildToolbar(){
  if(!$('#tip')){ const d=document.createElement('div'); d.id='tip'; document.body.appendChild(d); }
  const bar=$('#toolbar');
  bar.innerHTML='';
  for(const tl of TOOLS){
    if(tl.grp){ const d=document.createElement('div'); d.className='toolgroup'; d.textContent=tl.grp; bar.appendChild(d); continue; }
    const b=document.createElement('button');
    b.addEventListener('pointerenter', e=>{ if(e.pointerType==='mouse') showTip(tl,b); });
    b.addEventListener('pointerleave', hideTip);
    if(tl.tg){   // 開關型(自動推土機):切換狀態,不改變目前工具
      b.className='tool'+(city.autoDoze?' sel':'');
      b.dataset.tg='1';
      b.innerHTML=`<span class="ic">${tl.ic}</span><span class="nm">${tl.nm}</span><span class="pr">${city.autoDoze?'開':'關'}</span>`;
      b.addEventListener('click', ()=>{
        city.autoDoze=!city.autoDoze;
        b.classList.toggle('sel',city.autoDoze);
        b.querySelector('.pr').textContent=city.autoDoze?'開':'關';
        toast(city.autoDoze?'♻️ 自動推土機:開啟(施工自動清除樹林/瓦礫,每格 $1)。':'♻️ 自動推土機:關閉(需先手動推平)。');
      });
      bar.appendChild(b);
      continue;
    }
    b.className='tool'+(tl.id===curTool?' sel':'');
    b.dataset.id=tl.id;
    b.innerHTML=`<span class="ic">${tl.ic}</span><span class="nm">${tl.nm}</span><span class="pr">${tl.pr?'$'+tl.pr:'免費'}</span>`;
    b.addEventListener('click', ()=>{
      curTool=tl.id;
      document.querySelectorAll('.tool').forEach(el=>{ if(!el.dataset.tg) el.classList.toggle('sel',el.dataset.id===tl.id); });
      hideQuery();
      lastPaint=null;
    });
    bar.appendChild(b);
  }
}

/* HUD 更新 */
function updateHUD(){
  $('#vFunds').textContent = '$'+city.funds.toLocaleString();
  $('#vFunds').style.color = city.funds<0 ? 'var(--bad)' : 'var(--amber2)';
  $('#vPop').textContent = city.pop.toLocaleString();
  $('#vDate').textContent = `${city.year}年 ${city.month+1}月`;
  $('#vName').textContent = `${city.name}・${city.title}`;
  setBar('#barR',city.demR); setBar('#barC',city.demC); setBar('#barI',city.demI);
  const np=city.unpowered|0, pw=$('#pwrWarn');
  pw.style.display = np>0 ? 'flex' : 'none';
  if(np>0) pw.textContent = `⚡ ${np} 格缺電`;
}
function setBar(sel,v){
  const el=$(sel);
  const h=Math.abs(v)*50;
  el.style.height=h+'%';
  if(v>=0){ el.style.bottom='50%'; el.style.top='auto'; }
  else { el.style.top='50%'; el.style.bottom='auto'; }
}

/* 訊息帶 */
let toastQ=[];
function toast(msg){
  toastQ.push(msg);
  if(toastQ.length>4) toastQ.shift();
  $('#tickerText').textContent=toastQ[toastQ.length-1];
}

/* 災難警報:紅色橫幅 + 訊息帶 + 警報音;鳥瞰時鏡頭跳往災點 */
function disasterAlert(msg, x, y){
  toast(msg);
  const el=$('#alert');
  el.textContent=msg;
  el.classList.add('show');
  clearTimeout(el._t);
  el._t=setTimeout(()=>el.classList.remove('show'), 5000);
  sfx('alarm');
  if(x!==undefined && mode==='bird'){
    bird.tx=wx(x); bird.tz=wz(y);
    updateBirdCam();
  }
}

/* 查詢泡泡 */
function showQuery(x,y,px,py){
  const c=G[x][y], i=idx(x,y), q=$('#query');
  const rows=[];
  rows.push(`<div class="qt">${TNAME[c.t]}${c.rl?'+鐵路(平交道)':''}${c.wr?'+電線':''}${isZone(c.t)?` Lv.${c.lvl}`:''}</div>`);
  rows.push(`<span class="dim">座標</span> (${x}, ${y})`);
  if(c.t===T.STATION){
    const s=computeStations().find(o=>o.x===c.ax&&o.y===c.ay);
    rows.push(`<span class="dim">鐵路網</span> ${!s||!s.pow?'❌ 未供電,停駛':s.n>=2?`✅ 連通 ${s.n} 站,營運中`:'❌ 需以鐵路連接另一座供電車站'}`);
  }
  if(isZone(c.t)||isBigB(c.t)||c.t===T.WIRE||c.wr)
    rows.push(`<span class="dim">電力</span> ${c.pow?'✅ 供電中':'❌ 未供電'}`);
  rows.push(`<span class="dim">地價</span> ${Math.round(city.landv[i])}`);
  rows.push(`<span class="dim">污染</span> ${Math.round(city.pollution[i])}`);
  rows.push(`<span class="dim">犯罪</span> ${Math.round(city.crime[i])}`);
  rows.push(`<span class="dim">交通</span> ${Math.round(city.traffic[i])}`);
  q.innerHTML=rows.join('<br>');
  q.style.display='block';
  const w=q.offsetWidth, h=q.offsetHeight;
  q.style.left=Math.min(innerWidth-w-8, px+14)+'px';
  q.style.top=Math.min(innerHeight-h-40, py+10)+'px';
  clearTimeout(q._t);
  q._t=setTimeout(hideQuery, 4200);
}
function hideQuery(){ $('#query').style.display='none'; }

/* ── 彈窗骨架 ── */
function openModal(html){
  let m=$('#modal');
  if(!m){
    m=document.createElement('div'); m.id='modal'; m.className='modal';
    m.addEventListener('click', e=>{ if(e.target===m) closeModal(); });
    document.body.appendChild(m);
  }
  m.innerHTML=`<div class="mbox">${html}</div>`;
  m.classList.add('show');
  return m;
}
function closeModal(){ const m=$('#modal'); if(m) m.classList.remove('show'); }

/* 預算 */
function openBudget(){
  const m=openModal(`
    <h2>市政預算</h2><div class="sub">${city.year} 年度 ・ 月結制</div>
    <div class="row"><span>稅率</span><b id="taxV">${city.tax}%</b></div>
    <input type="range" min="0" max="20" value="${city.tax}" id="taxSl">
    <div class="slrow"><div class="sl-top"><span>🛣 交通維護(道路 ${city.roadCount||0}・鐵路 ${city.railCount||0})</span><b id="rdV">${Math.round(city.fundRoad*100)}%</b></div>
      <input type="range" min="0" max="100" value="${Math.round(city.fundRoad*100)}" id="rdSl"></div>
    <div class="slrow"><div class="sl-top"><span>🚓 警察撥款(${city.policeCount||0} 間)</span><b id="pcV">${Math.round(city.fundPolice*100)}%</b></div>
      <input type="range" min="0" max="100" value="${Math.round(city.fundPolice*100)}" id="pcSl"></div>
    <div class="slrow"><div class="sl-top"><span>🚒 消防撥款(${city.fireCount||0} 間)</span><b id="frV">${Math.round(city.fundFire*100)}%</b></div>
      <input type="range" min="0" max="100" value="${Math.round(city.fundFire*100)}" id="frSl"></div>
    <div class="row"><span>每月稅收</span><b class="pos">+$${city.lastIncome.toLocaleString()}</b></div>
    <div class="row"><span>每月支出</span><b class="neg">−$${city.lastExpense.toLocaleString()}</b></div>
    <div class="row"><span>每月結餘</span><b>${city.lastIncome-city.lastExpense>=0?'+':''}$${(city.lastIncome-city.lastExpense).toLocaleString()}</b></div>
    <button class="bigbtn" id="mOk">核定預算</button>`);
  $('#taxSl').oninput=e=>{ city.tax=+e.target.value; $('#taxV').textContent=city.tax+'%'; };
  $('#rdSl').oninput=e=>{ city.fundRoad=e.target.value/100; $('#rdV').textContent=e.target.value+'%'; };
  $('#pcSl').oninput=e=>{ city.fundPolice=e.target.value/100; $('#pcV').textContent=e.target.value+'%'; };
  $('#frSl').oninput=e=>{ city.fundFire=e.target.value/100; $('#frV').textContent=e.target.value+'%'; };
  $('#mOk').onclick=()=>{ closeModal(); computeStats(); groundDirty=true; toast('預算已核定。'); };
}

/* 圖層 */
const OVERLAYS=[['none','🏙 一般檢視'],['power','⚡ 電力網'],['pollution','🏭 污染'],
  ['crime','🚨 犯罪'],['landv','💰 地價'],['traffic','🚗 交通']];
function openMaps(){
  const m=openModal(`<h2>城市圖層</h2><div class="sub">以顏色檢視全市統計</div>
    <div class="dlist">${OVERLAYS.map(([k,n])=>`<button data-k="${k}">${n}<span>${overlay===k?'●':''}</span></button>`).join('')}</div>`);
  m.querySelectorAll('[data-k]').forEach(b=>b.onclick=()=>{ closeModal(); setOverlay(b.dataset.k); });
}
function setOverlay(k){
    overlay=k; dirty=true;
    const lg=$('#legend');
    if(overlay==='none'){ lg.style.display='none'; }
    else {
      const name=OVERLAYS.find(o=>o[0]===overlay)[1];
      lg.innerHTML=`<b>${name}</b><br>${overlay==='power'?'綠=供電 紅=停電':overlay==='landv'?'亮藍=高價值':overlay==='traffic'?'綠=低 紅=高<br><span style="color:#22e5ff">■</span> 營運車站 <span style="color:#a47be0">■</span> 未營運車站':'綠=低 紅=高'}
        <label style="display:flex;align-items:center;gap:6px;margin-top:7px;cursor:pointer;color:var(--dim)">
        <input type="checkbox" id="bldgChk" ${ovShowBldg?'checked':''}> 顯示立體建築</label>`;
      lg.style.display='block';
      $('#bldgChk').onchange=e=>{ ovShowBldg=e.target.checked; dirty=true; };
    }
}

/* 統計:歷史折線圖 */
const CHARTS=[
  {t:'人口', s:[[2,'#ffd489','人口']]},
  {t:'資金', s:[[3,'#4cc36b','資金']], zero:true},
  {t:'每月結餘', s:[[4,'#ffb742','月結餘']], zero:true},
  {t:'RCI 需求', s:[[5,'#4cc36b','住宅'],[6,'#4d9de0','商業'],[7,'#e8c14a','工業']], zero:true, fix:[-1,1]},
  {t:'環境(分區平均)', s:[[8,'#c98a5a','污染'],[9,'#e05d5d','犯罪']]},
];
let histSpan=120;
function openHistory(){
  const m=openModal(`<h2>城市統計</h2><div class="sub">每月記錄,最多保留 10 年</div>
    <div class="choice" style="margin-bottom:12px">
      <button data-sp="12" class="${histSpan===12?'on':''}">近 1 年</button>
      <button data-sp="120" class="${histSpan===120?'on':''}">近 10 年</button>
    </div>
    <div id="charts"></div>`);
  m.querySelectorAll('[data-sp]').forEach(b=>b.onclick=()=>{
    histSpan=+b.dataset.sp;
    m.querySelectorAll('[data-sp]').forEach(x=>x.classList.toggle('on',x===b));
    drawCharts();
  });
  drawCharts();
}
function drawCharts(){
  const box=$('#charts'); if(!box) return;
  const H=(city.hist||[]).slice(-histSpan);
  if(H.length<2){ box.innerHTML='<div style="color:var(--dim);font-size:13px">資料不足,讓時間再跑一兩個月吧。</div>'; return; }
  const fmt=v=>Math.abs(v)>=1000?Math.round(v).toLocaleString():(+v.toFixed(2)).toString();
  box.innerHTML=CHARTS.map((c,k)=>`<div class="chart"><div class="ch"><span>${c.t}</span><b>${
      c.s.map(([j,,n])=>c.s.length>1?`${n} ${fmt(H[H.length-1][j])}`:fmt(H[H.length-1][j])).join('・')}</b></div>
    <canvas id="cv${k}"></canvas>
    ${c.s.length>1?`<div class="lg">${c.s.map(([,col,n])=>`<i style="background:${col}"></i>${n}`).join('')}</div>`:''}</div>`).join('');
  const f=H[0], l=H[H.length-1];
  CHARTS.forEach((c,k)=>{
    const cv=$('#cv'+k), dpr=devicePixelRatio||1, W=cv.clientWidth, Ht=cv.clientHeight;
    cv.width=W*dpr; cv.height=Ht*dpr;
    const g=cv.getContext('2d'); g.scale(dpr,dpr);
    let lo=Infinity, hi=-Infinity;
    for(const r of H) for(const [j] of c.s){ lo=Math.min(lo,r[j]); hi=Math.max(hi,r[j]); }
    if(c.fix){ lo=Math.min(lo,c.fix[0]); hi=Math.max(hi,c.fix[1]); }
    if(c.zero){ lo=Math.min(lo,0); hi=Math.max(hi,0); }
    if(hi-lo<1e-6){ hi+=1; lo-=1; }
    const pad=6, X=i=>pad+(W-2*pad)*i/(H.length-1), Y=v=>Ht-pad-(Ht-2*pad)*(v-lo)/(hi-lo);
    if(c.zero){ g.strokeStyle='rgba(127,147,168,.45)'; g.setLineDash([3,3]); g.beginPath(); g.moveTo(pad,Y(0)); g.lineTo(W-pad,Y(0)); g.stroke(); g.setLineDash([]); }
    g.fillStyle='rgba(127,147,168,.8)'; g.font='10px sans-serif';
    g.fillText(fmt(hi),pad+2,pad+9); g.fillText(fmt(lo),pad+2,Ht-pad-2);
    for(const [j,col] of c.s){
      g.strokeStyle=col; g.lineWidth=1.8; g.lineJoin='round'; g.beginPath();
      H.forEach((r,i)=>i?g.lineTo(X(i),Y(r[j])):g.moveTo(X(i),Y(r[j]))); g.stroke();
    }
  });
  box.insertAdjacentHTML('beforeend',`<div style="font-size:11px;color:var(--dim)">${f[0]} 年 ${f[1]+1} 月 → ${l[0]} 年 ${l[1]+1} 月</div>`);
}

/* 災難 */
function openDisasters(){
  const m=openModal(`<h2>災難控制中心</h2><div class="sub">手動觸發,或切換隨機災難</div>
    <div class="dlist">
      <button data-d="fire">🔥 火災</button>
      <button data-d="flood">🌊 洪水</button>
      <button data-d="tornado">🌪 龍捲風</button>
      <button data-d="quake">🫨 地震</button>
      <button data-d="monster">🦖 巨獸來襲</button>
      <button data-d="crash">✈️ 空難</button>
      <button data-d="auto">🎲 隨機災難:<span>${city.autoDisaster?'開啟':'關閉'}</span></button>
    </div>`);
  m.querySelectorAll('[data-d]').forEach(b=>b.onclick=()=>{
    const k=b.dataset.d;
    if(k==='auto'){ city.autoDisaster=!city.autoDisaster; toast(`隨機災難已${city.autoDisaster?'開啟':'關閉'}。`); }
    else triggerDisaster(k,false);
    closeModal();
  });
}

/* 新城市 */
const escHTML = s=>String(s).replace(/[&<>"']/g, ch=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[ch]));
function openNewCity(first){
  let diff=20000;
  const m=openModal(`
    <h2>${first?'🏗 建立你的城市':'🆕 開拓新城市'}</h2>
    <div class="sub">完整復刻初代模擬城市 ・ 立體成像 ・ 雙視角</div>
    <div style="font-size:12px;color:var(--dim);margin-bottom:2px">城市名稱</div>
    <input id="nameInput" maxlength="12" value="${escHTML(first?'新市鎮':(city?city.name:'新市鎮'))}">
    <div style="font-size:12px;color:var(--dim)">難度(起始資金)</div>
    <div class="choice">
      <button data-f="20000" class="on">簡單<br>$20,000</button>
      <button data-f="10000">普通<br>$10,000</button>
      <button data-f="5000">困難<br>$5,000</button>
    </div>
    <button class="bigbtn" id="goBtn">產生地形,開始建設</button>
    ${first?'':'<button class="bigbtn ghost" id="cancelBtn" style="margin-top:8px">取消</button>'}
    <div style="display:flex;gap:8px;margin-top:8px">
      <button class="bigbtn ghost" id="expBtn" style="flex:1;margin-top:0">📤 匯出存檔</button>
      <button class="bigbtn ghost" id="impBtn" style="flex:1;margin-top:0">📥 匯入存檔</button>
    </div>
    <div style="font-size:11.5px;color:var(--dim);margin-top:14px;line-height:1.8">
      玩法:先蓋 <b style="color:var(--amber2)">電廠</b> → 拉 <b style="color:var(--amber2)">電線</b> 到分區
      → 劃 <b style="color:var(--res)">住宅</b>/<b style="color:var(--com)">商業</b>/<b style="color:var(--ind)">工業</b>區並鋪路。
      隨時按「🚶 走進城市」用第一人稱漫步街頭。</div>`);
  m.querySelectorAll('[data-f]').forEach(b=>b.onclick=()=>{
    diff=+b.dataset.f;
    m.querySelectorAll('[data-f]').forEach(x=>x.classList.toggle('on',x===b));
  });
  $('#goBtn').onclick=()=>{
    const nm=($('#nameInput').value.trim()||'新市鎮');
    newCity(nm, diff);
    tornadoE=null; monsterE=null; cars=[]; trains=[];
    overlay='none'; $('#legend').style.display='none';
    if(mode==='walk') toggleView();
    bird.tx=0; bird.tz=0; bird.dist=150; updateBirdCam();
    dirty=true; updateHUD(); buildToolbar(); closeModal();
    saveCity();
    if(first) setSpeed(1);   // 首次開局:建好城市才開始走時間
    toast(`「${nm}」奠基於 1900 年。祝施政順利,市長!`);
  };
  const cb=$('#cancelBtn'); if(cb) cb.onclick=closeModal;
  $('#expBtn').onclick=()=>{
    if(!city){ toast('尚無城市可匯出。'); return; }
    const blob=new Blob([JSON.stringify(serializeCity())],{type:'application/json'});
    const a=document.createElement('a');
    a.href=URL.createObjectURL(blob);
    a.download=`simcity3d_${city.name}_${city.year}.json`;
    a.click();
    URL.revokeObjectURL(a.href);
    toast('存檔已匯出為 JSON 檔。');
  };
  $('#impBtn').onclick=()=>{
    const inp=document.createElement('input');
    inp.type='file'; inp.accept='.json,application/json';
    inp.onchange=()=>{
      const f=inp.files[0]; if(!f) return;
      f.text().then(txt=>{
        let s=null;
        try{ s=JSON.parse(txt); }catch(e){}
        if(!s || s.ver!==SAVE_VER || !Array.isArray(s.cells) || s.cells.length!==N*N){
          toast('匯入失敗:不是有效的存檔檔案。'); sfx('deny'); return;
        }
        loadCity(s);
        saveCity();
        tornadoE=null; monsterE=null; cars=[]; trains=[];
        overlay='none'; $('#legend').style.display='none';
        if(mode==='walk') toggleView();
        bird.tx=0; bird.tz=0; bird.dist=150; updateBirdCam();
        dirty=true; updateHUD(); buildToolbar(); closeModal();
        toast(`已匯入「${city.name}」(${city.year} 年)。`);
      });
    };
    inp.click();
  };
}

/* ── 音效(WebAudio 極簡合成) ── */
let AC=null, muted=false;
function audioKick(){ if(!AC){ try{ AC=new (window.AudioContext||window.webkitAudioContext)(); }catch(e){} } }
function sfx(kind){
  if(muted||!AC) return;
  const t=AC.currentTime;
  const o=AC.createOscillator(), g=AC.createGain();
  o.connect(g); g.connect(AC.destination);
  if(kind==='build'){ o.type='square'; o.frequency.setValueAtTime(660,t); o.frequency.exponentialRampToValueAtTime(990,t+0.07);
    g.gain.setValueAtTime(0.045,t); g.gain.exponentialRampToValueAtTime(0.001,t+0.12); o.start(t); o.stop(t+0.13); }
  else if(kind==='doze'){ o.type='sawtooth'; o.frequency.setValueAtTime(150,t); o.frequency.exponentialRampToValueAtTime(60,t+0.16);
    g.gain.setValueAtTime(0.06,t); g.gain.exponentialRampToValueAtTime(0.001,t+0.18); o.start(t); o.stop(t+0.2); }
  else if(kind==='cash'){ o.type='triangle'; o.frequency.setValueAtTime(784,t); o.frequency.setValueAtTime(1175,t+0.09);
    g.gain.setValueAtTime(0.05,t); g.gain.exponentialRampToValueAtTime(0.001,t+0.3); o.start(t); o.stop(t+0.32); }
  else if(kind==='alarm'){ o.type='square'; o.frequency.setValueAtTime(520,t); o.frequency.setValueAtTime(392,t+0.14);
    o.frequency.setValueAtTime(520,t+0.28); g.gain.setValueAtTime(0.05,t);
    g.gain.exponentialRampToValueAtTime(0.001,t+0.5); o.start(t); o.stop(t+0.52); }
  else if(kind==='deny'){ o.type='square'; o.frequency.setValueAtTime(180,t);
    g.gain.setValueAtTime(0.05,t); g.gain.exponentialRampToValueAtTime(0.001,t+0.1); o.start(t); o.stop(t+0.12); }
}

/* ── 速度與主迴圈 ── */
let speed=1;
const SPD_MS=[Infinity, 2400, 1100, 380];
let simAcc=0, entAcc=0, lastT=0;

function setSpeed(s){
  speed=s;
  document.querySelectorAll('[data-spd]').forEach(x=>x.classList.toggle('on',+x.dataset.spd===speed));
}

function bindUI(){
  document.querySelectorAll('[data-spd]').forEach(b=>b.onclick=()=>{
    setSpeed(+b.dataset.spd);
    toast(speed===0?'時間暫停。':'時間流速已調整。');
  });
  $('#viewBtn').onclick=toggleView;
  $('#budgetBtn').onclick=openBudget;
  $('#mapBtn').onclick=openMaps;
  $('#histBtn').onclick=openHistory;
  $('#disBtn').onclick=openDisasters;
  $('#newBtn').onclick=()=>openNewCity(false);
  $('#sndBtn').onclick=()=>{ muted=!muted; $('#sndBtn').textContent=muted?'🔇':'🔊'; audioKick(); };
  // 鳥瞰視角鈕:按住連續作用
  const hold=(id,fn)=>{
    const el=$(id); let tm=null;
    const start=e=>{ e.preventDefault(); fn(); tm=setInterval(fn,50); };
    const stop=()=>{ if(tm){clearInterval(tm); tm=null;} };
    el.addEventListener('pointerdown',start);
    el.addEventListener('pointerup',stop);
    el.addEventListener('pointercancel',stop);
    el.addEventListener('pointerleave',stop);
  };
  hold('#rotL', ()=>{ if(mode==='bird'){ bird.yaw-=0.045; updateBirdCam(); } });
  hold('#rotR', ()=>{ if(mode==='bird'){ bird.yaw+=0.045; updateBirdCam(); } });
  hold('#zIn',  ()=>{ if(mode==='bird'){ bird.dist*=0.97; updateBirdCam(); } });
  hold('#zOut', ()=>{ if(mode==='bird'){ bird.dist*=1.03; updateBirdCam(); } });
  // 關頁/切背景時自動存檔
  window.addEventListener('pagehide', saveCity);
  document.addEventListener('visibilitychange', ()=>{ if(document.visibilityState==='hidden') saveCity(); });
}

function loop(t){
  requestAnimationFrame(loop);
  const dt=Math.min(0.05,(t-lastT)/1000)||0.016;
  lastT=t;

  // 模擬節拍
  if(speed>0){
    simAcc += dt*1000;
    const ms=SPD_MS[speed];
    let guard=0;
    while(simAcc>=ms && guard++<4){ simAcc-=ms; simMonth(); }
    // 災難實體
    entAcc+=dt;
    if(entAcc>0.22){ entAcc=0; stepEntities(); }
  }

  if(dirty) rebuildCity();
  else if(groundDirty) rebuildGround();

  stepCars(speed===0?0:dt*(speed===3?1.6:1));

  // 災難實體動畫
  if(tornadoE){
    tornadoMesh.visible=true;
    tornadoMesh.position.set(wx(Math.round(tornadoE.x)) + Math.sin(t*0.01)*1.2, 13, wz(Math.round(tornadoE.z)) + Math.cos(t*0.013)*1.2);
    tornadoMesh.rotation.y = t*0.02;
  } else tornadoMesh.visible=false;
  if(monsterE){
    monsterG.visible=true;
    monsterG.position.set(wx(Math.round(monsterE.x)), Math.abs(Math.sin(t*0.008))*0.6, wz(Math.round(monsterE.z)));
    monsterG.rotation.y = Math.atan2(monsterE.tx-monsterE.x, monsterE.tz-monsterE.z);
  } else monsterG.visible=false;

  // 缺電標記:上下浮動 + 閃爍
  warnMesh.position.y = Math.sin(t*0.004)*0.35;
  warnMesh.visible = Math.sin(t*0.009) > -0.35;

  // 地震震動
  if(quake>0){
    if(mode==='bird') updateBirdCam();   // 每幀從基準位置抖動,避免位移累積
    quake=Math.max(0,quake-dt*0.7);
    if(quake===0){ if(mode==='bird') updateBirdCam(); }
    else {
    activeCam.position.x += (Math.random()-0.5)*quake*2.2;
    activeCam.position.y += (Math.random()-0.5)*quake*1.6;
    }
  }

  if(mode==='walk') stepWalk(dt);
  renderer.render(scene, activeCam);
}

/* ── 啟動 ── */
function boot(){
  initGL();
  const save=readSave();
  if(save && loadCity(save)){
    initCameras(); initInput(); buildToolbar(); bindUI();
    updateHUD(); rebuildCity();
    requestAnimationFrame(loop);
    toast(`歡迎回來,市長!已自動載入「${city.name}」(${city.year} 年 ${city.month+1} 月)。想重新開始請按「🆕」。`);
  } else {
    newCity('新市鎮', 20000);
    initCameras(); initInput(); buildToolbar(); bindUI();
    updateHUD(); rebuildCity();
    setSpeed(0);   // 開局彈窗期間暫停
    requestAnimationFrame(loop);
    openNewCity(true);
  }
}
boot();
