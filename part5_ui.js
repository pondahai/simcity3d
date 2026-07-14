/* ═══════════ UI、音效與主迴圈 ═══════════ */
const $ = s=>document.querySelector(s);

/* 工具列 */
function buildToolbar(){
  const bar=$('#toolbar');
  bar.innerHTML='';
  for(const tl of TOOLS){
    if(tl.grp){ const d=document.createElement('div'); d.className='toolgroup'; d.textContent=tl.grp; bar.appendChild(d); continue; }
    const b=document.createElement('button');
    b.className='tool'+(tl.id===curTool?' sel':'');
    b.dataset.id=tl.id;
    b.innerHTML=`<span class="ic">${tl.ic}</span><span class="nm">${tl.nm}</span><span class="pr">${tl.pr?'$'+tl.pr:'免費'}</span>`;
    b.addEventListener('click', ()=>{
      curTool=tl.id;
      document.querySelectorAll('.tool').forEach(el=>el.classList.toggle('sel',el.dataset.id===tl.id));
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

/* 查詢泡泡 */
function showQuery(x,y,px,py){
  const c=G[x][y], i=idx(x,y), q=$('#query');
  const rows=[];
  rows.push(`<div class="qt">${TNAME[c.t]}${c.rl?'+鐵路(平交道)':''}${c.wr?'+電線':''}${isZone(c.t)?` Lv.${c.lvl}`:''}</div>`);
  rows.push(`<span class="dim">座標</span> (${x}, ${y})`);
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
  m.querySelectorAll('[data-k]').forEach(b=>b.onclick=()=>{
    overlay=b.dataset.k; groundDirty=true; closeModal();
    const lg=$('#legend');
    if(overlay==='none'){ lg.style.display='none'; }
    else {
      const name=OVERLAYS.find(o=>o[0]===overlay)[1];
      lg.innerHTML=`<b>${name}</b><br>${overlay==='power'?'綠=供電 紅=停電':overlay==='landv'?'亮藍=高價值':'綠=低 紅=高'}`;
      lg.style.display='block';
    }
  });
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
function openNewCity(first){
  let diff=20000;
  const m=openModal(`
    <h2>${first?'🏗 建立你的城市':'🆕 開拓新城市'}</h2>
    <div class="sub">完整復刻初代模擬城市 ・ 立體成像 ・ 雙視角</div>
    <div style="font-size:12px;color:var(--dim);margin-bottom:2px">城市名稱</div>
    <input id="nameInput" maxlength="12" value="${first?'新市鎮':(city?city.name:'新市鎮')}">
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
    dirty=true; updateHUD(); closeModal();
    saveCity();
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
        dirty=true; updateHUD(); closeModal();
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

function bindUI(){
  document.querySelectorAll('[data-spd]').forEach(b=>b.onclick=()=>{
    speed=+b.dataset.spd;
    document.querySelectorAll('[data-spd]').forEach(x=>x.classList.toggle('on',+x.dataset.spd===speed));
    toast(speed===0?'時間暫停。':'時間流速已調整。');
  });
  $('#viewBtn').onclick=toggleView;
  $('#budgetBtn').onclick=openBudget;
  $('#mapBtn').onclick=openMaps;
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

  // 地震震動
  if(quake>0){
    quake=Math.max(0,quake-dt*0.7);
    activeCam.position.x += (Math.random()-0.5)*quake*2.2;
    activeCam.position.y += (Math.random()-0.5)*quake*1.6;
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
    requestAnimationFrame(loop);
    openNewCity(true);
  }
}
boot();
