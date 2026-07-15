/* ═══════════ 模擬城市 3D ─ 核心模擬引擎 ═══════════ */
'use strict';
const N = 64, TILE = 4, HALF = N*TILE/2;

/* 地格類型 */
const T = {GRASS:0, WATER:1, TREE:2, ROAD:3, RAIL:4, WIRE:5,
           RES:6, COM:7, IND:8, PARK:9,
           POLICE:10, FIRESTA:11, COAL:12, NUKE:13, STADIUM:14, PORT:15, AIRPORT:16,
           RUBBLE:17, FIRE:18};

/* 建築規格:尺寸、電力容量(可供電格數)、名稱 */
const BSPEC = {
  [T.POLICE]:{w:2,name:'警察局'}, [T.FIRESTA]:{w:2,name:'消防局'},
  [T.COAL]:{w:3,name:'火力發電廠',cap:220}, [T.NUKE]:{w:3,name:'核能發電廠',cap:550},
  [T.STADIUM]:{w:4,name:'體育場'}, [T.PORT]:{w:3,name:'海港'}, [T.AIRPORT]:{w:5,name:'機場'},
};
const TNAME = {0:'草地',1:'水域',2:'樹林',3:'道路',4:'鐵路',5:'電線',6:'住宅區',7:'商業區',
  8:'工業區',9:'公園',10:'警察局',11:'消防局',12:'火力發電廠',13:'核能發電廠',
  14:'體育場',15:'海港',16:'機場',17:'瓦礫',18:'火災!'};

/* 工具定義 */
const TOOLS = [
  {id:'query', ic:'🔍', nm:'查詢',   pr:0},
  {id:'doze',  ic:'🚜', nm:'推土機', pr:1},
  {id:'autodoze', ic:'♻️', nm:'自動推土', tg:true},
  {grp:'交通'},
  {id:'road',  ic:'🛣️', nm:'道路',   pr:10,  t:T.ROAD},
  {id:'rail',  ic:'🛤️', nm:'鐵路',   pr:20,  t:T.RAIL},
  {id:'wire',  ic:'⚡', nm:'電線',   pr:5,   t:T.WIRE},
  {grp:'分區'},
  {id:'res',   ic:'🏠', nm:'住宅區', pr:100, t:T.RES},
  {id:'com',   ic:'🏬', nm:'商業區', pr:100, t:T.COM},
  {id:'ind',   ic:'🏭', nm:'工業區', pr:100, t:T.IND},
  {id:'park',  ic:'🌳', nm:'公園',   pr:10,  t:T.PARK},
  {grp:'公共'},
  {id:'police',ic:'🚓', nm:'警察局', pr:500, t:T.POLICE},
  {id:'firesta',ic:'🚒',nm:'消防局', pr:500, t:T.FIRESTA},
  {id:'stadium',ic:'🏟️',nm:'體育場', pr:5000,t:T.STADIUM},
  {grp:'電力'},
  {id:'coal',  ic:'🪨', nm:'火力廠', pr:3000,t:T.COAL},
  {id:'nuke',  ic:'☢️', nm:'核能廠', pr:5000,t:T.NUKE},
  {grp:'對外'},
  {id:'port',  ic:'⚓', nm:'海港',   pr:3000,t:T.PORT},
  {id:'airport',ic:'✈️',nm:'機場',   pr:10000,t:T.AIRPORT},
];

/* ── 城市狀態 ── */
let G = null;                 // 格網 [x][y]
let city = null;              // 城市總狀態
const idx = (x,y)=>x*N+y;
const inB = (x,y)=>x>=0&&y>=0&&x<N&&y<N;

function newCell(t){ return {t, lvl:0, pow:false, ax:-1, ay:-1, fire:0, br:false, wr:false, rl:false, tier:0, v:Math.random()}; }

/* 地價價位檔(0 低 / 1 中 / 2 高):只在建築升降級時取樣寫入 c.tier,
   避免 landv 每月重算造成造型抖動。工業自身污染會壓垮地價,門檻另計 */
function landTier(i,t){
  const v=city.landv[i];
  if(t===T.IND) return v>=8?2 : v>=3?1 : 0;
  return v>=30?2 : v>=14?1 : 0;
}

function newCity(name, funds){
  city = {
    name, funds, tax:7,
    year:1900, month:0,          // month 0-11
    pop:0, resSum:0, comSum:0, indSum:0,
    demR:0.6, demC:0, demI:0.4, ext:20,
    fundRoad:1, fundPolice:1, fundFire:1,
    lastIncome:0, lastExpense:0,
    autoDisaster:true, autoDoze:true, milestones:{},
    powerOK:true, title:'拓荒地',
  };
  genTerrain();
  // 統計圖層
  city.pollution = new Float32Array(N*N);
  city.crime     = new Float32Array(N*N);
  city.landv     = new Float32Array(N*N);
  city.traffic   = new Float32Array(N*N);
  city.policeCov = new Float32Array(N*N);
  city.fireCov   = new Float32Array(N*N);
  computePower();
  computeStats();
}

/* ── 地形生成:蜿蜒河流 + 湖泊 + 樹叢 ── */
function genTerrain(){
  G = [];
  for(let x=0;x<N;x++){ G[x]=[]; for(let y=0;y<N;y++) G[x][y]=newCell(T.GRASS); }
  // 河流:自上而下的隨機漫步,寬 2~3
  let rx = 8 + Math.random()*(N-16);
  for(let y=0;y<N;y++){
    rx += (Math.random()-0.5)*2.4;
    rx = Math.max(3, Math.min(N-4, rx));
    const w = 1 + (Math.sin(y*0.25)+1)*0.8;
    for(let dx=-Math.ceil(w); dx<=Math.ceil(w); dx++){
      const x = Math.round(rx)+dx;
      if(inB(x,y)) G[x][y].t = T.WATER;
    }
  }
  // 湖泊
  const lakes = 1+Math.floor(Math.random()*2);
  for(let i=0;i<lakes;i++){
    const cx=6+Math.random()*(N-12), cy=6+Math.random()*(N-12), r=2.5+Math.random()*3;
    for(let x=0;x<N;x++)for(let y=0;y<N;y++){
      if((x-cx)**2+(y-cy)**2 < r*r) G[x][y].t=T.WATER;
    }
  }
  // 樹叢
  const clumps = 26;
  for(let i=0;i<clumps;i++){
    const cx=Math.random()*N, cy=Math.random()*N, r=1.5+Math.random()*3.5;
    for(let x=0;x<N;x++)for(let y=0;y<N;y++){
      if(G[x][y].t===T.GRASS && (x-cx)**2+(y-cy)**2 < r*r && Math.random()<0.75) G[x][y].t=T.TREE;
    }
  }
}

/* ── 建造與拆除 ── */
const isZone = t => t===T.RES||t===T.COM||t===T.IND;
const isBigB = t => BSPEC[t]!==undefined;
const flammable = t => isZone(t)||t===T.TREE||isBigB(t)||t===T.PARK;
/* 自動推土機開啟時,樹林/瓦礫可直接施工覆蓋(每格加收 $1 清除費) */
const buildable = c => c.t===T.GRASS || (city.autoDoze && (c.t===T.TREE || c.t===T.RUBBLE));

function toolCost(tl){ return tl.pr; }

function place(tool, x, y){
  const tl = TOOLS.find(o=>o.id===tool); if(!tl) return false;
  if(tool==='doze') return doze(x,y);
  const t = tl.t;
  const w = isBigB(t) ? BSPEC[t].w : 1;
  if(x+w>N || y+w>N) return false;
  const isTrans = t===T.ROAD||t===T.RAIL||t===T.WIRE;
  // 電線與道路/鐵路交叉:不覆蓋原地格,以 wr 旗標疊加(橋面不可交叉)
  const c0 = G[x][y];
  if(t===T.WIRE && (c0.t===T.ROAD||c0.t===T.RAIL) && !c0.br && !c0.rl){
    if(c0.wr) return false;
    if(city.funds < tl.pr){ toast('資金不足!'); sfx('deny'); return false; }
    city.funds -= tl.pr;
    c0.wr = true;
    computePower();
    sfx('build'); dirty=true; updateHUD();
    return true;
  }
  if((t===T.ROAD||t===T.RAIL) && c0.t===T.WIRE && !c0.br){
    if(city.funds < tl.pr){ toast('資金不足!'); sfx('deny'); return false; }
    city.funds -= tl.pr;
    c0.t=t; c0.wr=true; c0.lvl=0; c0.fire=0; c0.ax=x; c0.ay=y;
    computePower();
    sfx('build'); dirty=true; updateHUD();
    return true;
  }
  // 平交道:道路⇄鐵路交叉,統一存為 t=ROAD + rl 旗標(橋面與電線交叉格不可)
  if(((t===T.RAIL && c0.t===T.ROAD) || (t===T.ROAD && c0.t===T.RAIL)) && !c0.br && !c0.wr && !c0.rl){
    if(city.funds < tl.pr){ toast('資金不足!'); sfx('deny'); return false; }
    city.funds -= tl.pr;
    c0.t=T.ROAD; c0.rl=true; c0.lvl=0; c0.fire=0; c0.ax=x; c0.ay=y;
    sfx('build'); dirty=true; updateHUD();
    return true;
  }
  const onWater = isTrans && G[x][y].t===T.WATER;   // 跨河橋
  let clear=0, wires=0;   // 自動推土:清除費與拆除電線數
  for(let i=0;i<w;i++)for(let j=0;j<w;j++){
    const cc=G[x+i][y+j];
    if(buildable(cc)){ if(cc.t===T.TREE||cc.t===T.RUBBLE) clear++; continue; }
    if(isTrans && cc.t===T.WATER) continue;
    // 分區/建築腳下的電線自動拆除(交通類走上方交叉邏輯,不在此處理)
    if(city.autoDoze && !isTrans && cc.t===T.WIRE && !cc.br){ wires++; clear++; continue; }
    return false;
  }
  if(t===T.PORT){
    let nearWater=false;
    for(let i=-1;i<=w;i++)for(let j=-1;j<=w;j++){
      if(inB(x+i,y+j)&&G[x+i][y+j].t===T.WATER) nearWater=true;
    }
    if(!nearWater){ toast('海港必須緊鄰水域。'); return false; }
  }
  const cost = (onWater ? tl.pr*5 : tl.pr) + clear;
  if(city.funds < cost){ toast(onWater?'橋梁造價為 5 倍,資金不足!':'資金不足!'); sfx('deny'); return false; }
  city.funds -= cost;
  for(let i=0;i<w;i++)for(let j=0;j<w;j++){
    const c=G[x+i][y+j];
    const wasWater = c.t===T.WATER;
    c.t=t; c.lvl=0; c.fire=0; c.ax=x; c.ay=y; c.v=Math.random();
    c.br = isTrans && wasWater; c.wr=false;
  }
  computePower();
  if(wires) toast(`⚡ 自動推土機拆除了 ${wires} 格電線,注意電網連通!`);
  sfx('build'); dirty=true; updateHUD();
  return true;
}

function doze(x,y){
  const c = G[x][y];
  if(c.wr){   // 交叉電線先拆,保留道路/鐵路
    if(city.funds < 1){ toast('資金不足!'); return false; }
    city.funds -= 1;
    c.wr=false;
    computePower();
    sfx('doze'); dirty=true; updateHUD();
    return true;
  }
  if(c.rl){   // 平交道先拆鐵路,保留道路
    if(city.funds < 1){ toast('資金不足!'); return false; }
    city.funds -= 1;
    c.rl=false;
    sfx('doze'); dirty=true; updateHUD();
    return true;
  }
  if(c.t===T.GRASS||c.t===T.WATER) return false;
  let cells=[[x,y]];
  if(isBigB(c.t) && c.ax>=0){
    const t0=c.t, ax=c.ax, ay=c.ay, w=BSPEC[c.t].w; cells=[];
    for(let i=0;i<w;i++)for(let j=0;j<w;j++){
      const cx=ax+i, cy=ay+j;
      if(inB(cx,cy) && G[cx][cy].t===t0) cells.push([cx,cy]);
    }
    if(!cells.length) cells=[[x,y]];
  }
  const cost = cells.length;
  if(city.funds < cost){ toast('資金不足!'); return false; }
  city.funds -= cost;
  for(const [cx,cy] of cells){
    const cc=G[cx][cy];
    cc.t = cc.br ? T.WATER : T.GRASS;
    cc.br=false; cc.wr=false; cc.rl=false; cc.lvl=0; cc.fire=0; cc.ax=-1; cc.ay=-1; cc.tier=0;
  }
  computePower();
  sfx('doze'); dirty=true; updateHUD();
  return true;
}

/* ── 電力網:從電廠 BFS,依容量供電 ── */
function computePower(){
  const conductive = c => c.t===T.WIRE || c.wr || isZone(c.t) || isBigB(c.t);
  for(let x=0;x<N;x++)for(let y=0;y<N;y++) G[x][y].pow=false;
  const seen = new Uint8Array(N*N);
  let anyPlant=false, blackout=false;
  for(let x=0;x<N;x++)for(let y=0;y<N;y++){
    const c=G[x][y];
    if((c.t===T.COAL||c.t===T.NUKE) && !seen[idx(x,y)]){
      anyPlant=true;
      // 蒐集連通元件
      const q=[[x,y]]; seen[idx(x,y)]=1;
      const comp=[]; let cap=0;
      while(q.length){
        const [cx,cy]=q.pop(); const cc=G[cx][cy];
        comp.push([cx,cy]);
        if((cc.t===T.COAL||cc.t===T.NUKE) && cc.ax===cx && cc.ay===cy) cap += BSPEC[cc.t].cap;
        for(const [dx,dy] of [[1,0],[-1,0],[0,1],[0,-1]]){
          const nx=cx+dx, ny=cy+dy;
          if(inB(nx,ny) && !seen[idx(nx,ny)] && conductive(G[nx][ny])){
            seen[idx(nx,ny)]=1; q.push([nx,ny]);
          }
        }
      }
      // 消耗:分區與建築格各 1;依 BFS 順序供電到容量為止
      let used=0;
      for(const [cx,cy] of comp){
        const cc=G[cx][cy];
        if(cc.t===T.WIRE || cc.wr){ cc.pow=true; continue; }
        if(used<cap){ cc.pow=true; used++; } else blackout=true;
      }
    }
  }
  city.powerOK = anyPlant && !blackout;
  return blackout;
}

/* ── 道路可達性:距道路/鐵路 3 格內 ── */
function computeAccess(){
  const acc = new Uint8Array(N*N);
  const q=[];
  for(let x=0;x<N;x++)for(let y=0;y<N;y++){
    if(G[x][y].t===T.ROAD||G[x][y].t===T.RAIL){ acc[idx(x,y)]=1; q.push([x,y,0]); }
  }
  let head=0;
  while(head<q.length){
    const [cx,cy,d]=q[head++]; if(d>=3) continue;
    for(const [dx,dy] of [[1,0],[-1,0],[0,1],[0,-1]]){
      const nx=cx+dx, ny=cy+dy;
      if(inB(nx,ny)&&!acc[idx(nx,ny)]){ acc[idx(nx,ny)]=1; q.push([nx,ny,d+1]); }
    }
  }
  return acc;
}

/* ── 統計圖層:污染、地價、犯罪、交通、警消覆蓋 ── */
function blur(map, passes){
  const tmp = new Float32Array(N*N);
  for(let p=0;p<passes;p++){
    for(let x=0;x<N;x++)for(let y=0;y<N;y++){
      let s=map[idx(x,y)]*2, n=2;
      if(x>0){s+=map[idx(x-1,y)];n++;} if(x<N-1){s+=map[idx(x+1,y)];n++;}
      if(y>0){s+=map[idx(x,y-1)];n++;} if(y<N-1){s+=map[idx(x,y+1)];n++;}
      tmp[idx(x,y)]=s/n;
    }
    map.set(tmp);
  }
}
function radial(map, cx, cy, R, amt){
  const r2=R*R;
  for(let x=Math.max(0,cx-R);x<=Math.min(N-1,cx+R);x++)
    for(let y=Math.max(0,cy-R);y<=Math.min(N-1,cy+R);y++){
      const d2=(x-cx)**2+(y-cy)**2;
      if(d2<r2) map[idx(x,y)] += amt*(1-Math.sqrt(d2)/R);
    }
}

function computeStats(){
  const pol=city.pollution, cri=city.crime, lv=city.landv, tra=city.traffic,
        pc=city.policeCov, fc=city.fireCov;
  pol.fill(0); cri.fill(0); lv.fill(0); tra.fill(0); pc.fill(0); fc.fill(0);

  // 交通:每個已發展分區向最近道路輻射
  for(let x=0;x<N;x++)for(let y=0;y<N;y++){
    const c=G[x][y];
    if(isZone(c.t)&&c.lvl>0) radial(tra,x,y,4,c.lvl*7);
  }
  for(let x=0;x<N;x++)for(let y=0;y<N;y++){
    const t=G[x][y].t, i=idx(x,y);
    if(t===T.RAIL) tra[i]*=0.3;        // 鐵路運量大,壅塞僅為道路的 30%
    else if(t!==T.ROAD) tra[i]*=0.25;
  }

  // 污染源
  for(let x=0;x<N;x++)for(let y=0;y<N;y++){
    const c=G[x][y], i=idx(x,y);
    if(c.t===T.IND) pol[i]+=18+c.lvl*11;
    if(c.t===T.COAL) pol[i]+=65;
    if(c.t===T.AIRPORT) pol[i]+=28;
    if(c.t===T.FIRE) pol[i]+=45;
    if(c.t===T.RUBBLE) pol[i]+=8;
    if(c.t!==T.RAIL) pol[i]+=tra[i]*0.22;   // 鐵路視為電氣化,不產生交通污染
  }
  blur(pol,3);

  // 警消覆蓋(依撥款比例縮放)
  for(let x=0;x<N;x++)for(let y=0;y<N;y++){
    const c=G[x][y];
    if(c.ax===x&&c.ay===y){
      if(c.t===T.POLICE) radial(pc,x+1,y+1,Math.round(13*city.fundPolice)+1,100);
      if(c.t===T.FIRESTA) radial(fc,x+1,y+1,Math.round(13*city.fundFire)+1,100);
    }
  }

  // 地價:近水近公園加分、污染犯罪扣分、市中心微幅加成
  for(let x=0;x<N;x++)for(let y=0;y<N;y++){
    const c=G[x][y], i=idx(x,y);
    let v=28;
    if(c.t===T.PARK) v+=25;
    v -= Math.abs(x-N/2)*0.18 + Math.abs(y-N/2)*0.18;
    lv[i]=v;
  }
  for(let x=0;x<N;x++)for(let y=0;y<N;y++){
    const c=G[x][y];
    if(c.t===T.WATER) radial(lv,x,y,4,9);
    if(c.t===T.PARK)  radial(lv,x,y,5,14);
    if(c.t===T.STADIUM&&c.ax===x&&c.ay===y) radial(lv,x+2,y+2,8,12);
  }
  for(let i=0;i<N*N;i++) lv[i]=Math.max(0, lv[i]-city.pollution[i]*0.45);
  blur(lv,2);

  // 犯罪:人口密度 − 地價 − 警力
  for(let x=0;x<N;x++)for(let y=0;y<N;y++){
    const c=G[x][y], i=idx(x,y);
    let cr=0;
    if(isZone(c.t)) cr = c.lvl*14 - lv[i]*0.35 - pc[i]*0.6;
    cri[i]=Math.max(0,cr);
  }
  blur(cri,2);
}

/* ── 存檔(localStorage 自動存檔 + JSON 匯出入) ── */
const SAVE_KEY='simcity3d:save', SAVE_VER=1;

function serializeCity(){
  const cobj={};
  for(const k in city) if(!(city[k] instanceof Float32Array)) cobj[k]=city[k];
  const cells=[];
  for(let x=0;x<N;x++)for(let y=0;y<N;y++){
    const c=G[x][y];
    cells.push([c.t, c.lvl, c.ax, c.ay, (c.br?1:0)|(c.wr?2:0)|(c.rl?4:0), c.fire, +c.v.toFixed(3), c.tier]);
  }
  return {ver:SAVE_VER, savedAt:Date.now(), city:cobj, cells};
}

function saveCity(){
  if(!city||!G) return;
  try{ localStorage.setItem(SAVE_KEY, JSON.stringify(serializeCity())); }catch(e){}
}

function readSave(){
  try{
    const s=JSON.parse(localStorage.getItem(SAVE_KEY));
    return (s && s.ver===SAVE_VER && Array.isArray(s.cells) && s.cells.length===N*N) ? s : null;
  }catch(e){ return null; }
}

function loadCity(s){
  if(!s) return false;
  newCity(s.city.name, s.city.funds);   // 建骨架(地形會被覆蓋)
  for(const k in s.city) city[k]=s.city[k];
  let i=0, legacy=false;
  for(let x=0;x<N;x++)for(let y=0;y<N;y++){
    const d=s.cells[i++], c=G[x][y];
    c.t=d[0]; c.lvl=d[1]; c.ax=d[2]; c.ay=d[3];
    c.br=!!(d[4]&1); c.wr=!!(d[4]&2); c.rl=!!(d[4]&4); c.fire=d[5]; c.v=d[6]; c.pow=false;
    if(d.length>7) c.tier=d[7]; else { c.tier=0; legacy=true; }
  }
  computePower();
  computeStats();
  if(legacy){   // 舊版存檔無 tier:以載入後的地價補採樣
    for(let x=0;x<N;x++)for(let y=0;y<N;y++){
      const c=G[x][y];
      if(isZone(c.t)&&c.lvl>0) c.tier=landTier(idx(x,y),c.t);
    }
  }
  return true;
}

/* ── 每月模擬節拍 ── */
function simMonth(){
  const blackout = computePower();
  const acc = computeAccess();

  // 分區生長/衰退
  let resSum=0, comSum=0, indSum=0;
  for(let x=0;x<N;x++)for(let y=0;y<N;y++){
    const c=G[x][y], i=idx(x,y);
    if(!isZone(c.t)) continue;
    const dem = c.t===T.RES?city.demR : c.t===T.COM?city.demC : city.demI;
    const envBad = (city.pollution[i]>55?0.35:0) + (city.crime[i]>55?0.35:0);
    if(c.pow && acc[i] && dem>0 && c.lvl<5){
      const p = 0.10 + dem*0.45 + (city.landv[i]>34?0.08:0) - envBad;
      if(Math.random()<p){ c.lvl++; c.tier=landTier(i,c.t); }
    } else if(!c.pow || dem<-0.25 || envBad>0.4){
      if(c.lvl>0 && Math.random() < (!c.pow?0.35:0.12)){ c.lvl--; c.tier=landTier(i,c.t); }
    }
    if(c.t===T.RES) resSum+=c.lvl; else if(c.t===T.COM) comSum+=c.lvl; else indSum+=c.lvl;
  }
  city.resSum=resSum; city.comSum=comSum; city.indSum=indSum;
  city.pop = resSum*22;

  // 對外市場緩慢成長,海港/機場加速
  let boost=1;
  for(let x=0;x<N;x++)for(let y=0;y<N;y++){
    const c=G[x][y];
    if(c.ax===x&&c.ay===y){ if(c.t===T.PORT)boost+=0.5; if(c.t===T.AIRPORT)boost+=0.7; }
  }
  city.ext += 0.25*boost;

  // RCI 需求
  const jobs = comSum+indSum;
  const taxPen = (city.tax-7)*0.055;
  let stadiumBonus = 0;
  for(let x=0;x<N;x++)for(let y=0;y<N;y++)
    if(G[x][y].t===T.STADIUM&&G[x][y].ax===x&&G[x][y].ay===y) stadiumBonus=0.12;
  city.demR = clamp(((jobs+14)*1.35 - resSum)/55 - taxPen + stadiumBonus, -1, 1);
  city.demC = clamp((resSum*0.62 - comSum)/45 - taxPen, -1, 1);
  city.demI = clamp((city.ext + resSum*0.42 - indSum)/50 - taxPen*1.2, -1, 1);

  // 火災蔓延與燒毀
  const burning=[];
  for(let x=0;x<N;x++)for(let y=0;y<N;y++) if(G[x][y].t===T.FIRE) burning.push([x,y]);
  for(const [x,y] of burning){
    const c=G[x][y];
    c.fire++;
    const cov = city.fireCov[idx(x,y)];
    if(c.fire>2 && Math.random() < 0.3+cov/160){ c.t=T.RUBBLE; c.fire=0; continue; }
    for(const [dx,dy] of [[1,0],[-1,0],[0,1],[0,-1]]){
      const nx=x+dx, ny=y+dy;
      if(!inB(nx,ny)) continue;
      const nc=G[nx][ny];
      if(flammable(nc.t) && Math.random() < Math.max(0.03, 0.32 - cov/280)){
        igniteCell(nx,ny);
      }
    }
  }
  if(burning.length) dirty=true;

  // 交通撥款不足:道路/鐵路逐月劣化
  if(city.fundRoad<1){
    const p=(1-city.fundRoad)*0.012;
    let decayed=0;
    for(let x=0;x<N;x++)for(let y=0;y<N;y++){
      const c=G[x][y];
      if((c.t===T.ROAD||c.t===T.RAIL) && Math.random()<p){
        c.t = c.br?T.WATER:T.RUBBLE;
        c.br=false; c.wr=false; c.rl=false; c.lvl=0; c.ax=-1; c.ay=-1;
        decayed++;
      }
    }
    if(decayed){ computePower(); toast('🛣 交通撥款不足,部分道路/鐵路年久失修損毀!'); }
  }

  // 財政(逐月)
  const income = (resSum*1.0 + comSum*1.6 + indSum*1.6) * city.tax * 0.32;
  let roads=0, rails=0, police=0, fire=0;
  for(let x=0;x<N;x++)for(let y=0;y<N;y++){
    const c=G[x][y];
    if(c.t===T.ROAD){roads++; if(c.rl)rails++;} else if(c.t===T.RAIL)rails++;
    if(c.ax===x&&c.ay===y){ if(c.t===T.POLICE)police++; if(c.t===T.FIRESTA)fire++; }
  }
  const expense = (roads*0.18+rails*0.5)*city.fundRoad + police*24*city.fundPolice + fire*24*city.fundFire;
  city.funds += Math.round(income - expense);
  city.lastIncome = Math.round(income); city.lastExpense = Math.round(expense);
  city.roadCount=roads; city.railCount=rails; city.policeCount=police; city.fireCount=fire;

  // 隨機災難
  if(city.autoDisaster && Math.random()<0.006 && city.pop>800){
    const pick = ['fire','flood','tornado','quake','monster','crash'][Math.floor(Math.random()*6)];
    triggerDisaster(pick, true);
  }

  computeStats();

  // 時間推進與訊息
  city.month++;
  if(city.month>=12){
    city.month=0; city.year++;
    if(city.funds>0) sfx('cash');
    toast(`${city.year} 年度結算:稅收 $${city.lastIncome*12|0},支出 $${city.lastExpense*12|0}(月均×12)`);
    saveCity();   // 年度自動存檔
  }
  checkMilestones(blackout);
  dirty=true;
  updateHUD();
}

function clamp(v,a,b){return Math.max(a,Math.min(b,v));}

function igniteCell(x,y){
  const c=G[x][y];
  if(c.br) return;
  if(isBigB(c.t) && c.ax>=0){ // 大建築整棟燒
    const t0=c.t, ax=c.ax, ay=c.ay, w=BSPEC[c.t].w;
    for(let i=0;i<w;i++)for(let j=0;j<w;j++){
      const cx=ax+i, cy=ay+j;
      if(!inB(cx,cy)) continue;
      const cc=G[cx][cy];
      if(cc.t===t0){ cc.t=T.FIRE; cc.fire=0; cc.ax=-1; cc.ay=-1; }
    }
  } else { c.t=T.FIRE; c.fire=0; c.lvl=0; c.ax=-1; c.ay=-1; }
}

function checkMilestones(blackout){
  const M=city.milestones;
  const marks=[[500,'村莊'],[2000,'城鎮'],[10000,'城市'],[30000,'都會'],[60000,'大都會']];
  for(const [p,t] of marks){
    if(city.pop>=p && !M[p]){ M[p]=true; city.title=t;
      toast(`🎉 恭喜!人口達 ${p.toLocaleString()},晉升為「${t}」!`); sfx('cash'); }
  }
  if(blackout && !M.bo){ M.bo=true; toast('⚡ 部分區域停電!請增建電廠或檢查電線。'); sfx('alarm'); }
  if(!blackout) M.bo=false;
  if(city.funds<0 && !M.debt){ M.debt=true; toast('💸 市庫赤字!考慮提高稅率或減少撥款。'); }
  if(city.funds>=0) M.debt=false;
}

/* ── 災難 ── */
let tornadoE=null, monsterE=null;   // 動態實體
function triggerDisaster(kind, auto){
  const randTile = ()=>[2+Math.floor(Math.random()*(N-4)), 2+Math.floor(Math.random()*(N-4))];
  if(kind==='fire'){
    for(let tries=0;tries<80;tries++){
      const [x,y]=randTile();
      if(flammable(G[x][y].t)){ igniteCell(x,y); disasterAlert('🔥 火災爆發!',x,y); break; }
    }
  }
  if(kind==='flood'){
    const cand=[];
    for(let x=1;x<N-1;x++)for(let y=1;y<N-1;y++){
      if(G[x][y].t!==T.WATER) continue;
      for(const [dx,dy] of [[1,0],[-1,0],[0,1],[0,-1]])
        if(G[x+dx][y+dy].t!==T.WATER) cand.push([x+dx,y+dy]);
    }
    let n=Math.min(45,cand.length), fx=-1, fy=-1;
    while(n-->0){
      const [x,y]=cand[Math.floor(Math.random()*cand.length)];
      if(fx<0){ fx=x; fy=y; }
      const c=G[x][y]; c.t=c.br?T.WATER:T.RUBBLE; c.br=false; c.wr=false; c.rl=false; c.lvl=0; c.ax=-1; c.ay=-1;
    }
    if(fx>=0) disasterAlert('🌊 洪水氾濫!沿岸地區受災。',fx,fy);
    else disasterAlert('🌊 洪水氾濫!沿岸地區受災。');
  }
  if(kind==='tornado'){
    const [x,y]=randTile();
    tornadoE={x, z:y, vx:(Math.random()-0.5), vz:(Math.random()-0.5), life:38, step:0};
    disasterAlert('🌪 龍捲風登陸!',x,y);
  }
  if(kind==='quake'){
    let n=90;
    while(n-->0){
      const [x,y]=randTile(); const c=G[x][y];
      if(c.t===T.WATER||c.t===T.GRASS) continue;
      if(Math.random()<0.25 && flammable(c.t)) igniteCell(x,y);
      else { if(isBigB(c.t)){c.ax=-1;c.ay=-1;} c.t=c.br?T.WATER:T.RUBBLE; c.br=false; c.wr=false; c.rl=false; c.lvl=0; }
    }
    quake=1.4;
    disasterAlert('🫨 大地震!全市受創。');   // 全市範圍,鏡頭不跳轉
  }
  if(kind==='monster'){
    // 從邊緣出現,走向污染最高處
    let best=0, bx=N/2, by=N/2;
    for(let i=0;i<N*N;i++) if(city.pollution[i]>best){best=city.pollution[i];bx=(i/N)|0;by=i%N;}
    const mz=Math.floor(Math.random()*N);
    monsterE={x:0, z:mz, tx:bx, tz:by, life:110, step:0, ph:0};
    disasterAlert('🦖 巨獸從水域現身,朝工業區前進!',0,mz);
  }
  if(kind==='crash'){
    const [x,y]=randTile();
    for(let i=-1;i<=1;i++)for(let j=-1;j<=1;j++){
      if(!inB(x+i,y+j)) continue;
      const c=G[x+i][y+j];
      if(c.t===T.WATER) continue;
      if(flammable(c.t)||c.t===T.GRASS){ igniteCell(x+i,y+j); }
    }
    disasterAlert('✈️💥 飛機失事墜毀!',x,y);
  }
  computePower();
  dirty=true;
}

/* 災難實體逐步推進(由主迴圈以 0.22s 間隔呼叫) */
function stepEntities(){
  if(tornadoE){
    const e=tornadoE;
    e.vx += (Math.random()-0.5)*0.6; e.vz += (Math.random()-0.5)*0.6;
    const sp=Math.hypot(e.vx,e.vz)||1; e.vx/=sp; e.vz/=sp;
    e.x=clamp(e.x+e.vx,1,N-2); e.z=clamp(e.z+e.vz,1,N-2);
    const tx=Math.round(e.x), tz=Math.round(e.z);
    const c=G[tx][tz];
    if(c.t!==T.WATER && c.t!==T.GRASS){
      if(isBigB(c.t)){c.ax=-1;c.ay=-1;}
      c.t = c.br?T.WATER:T.RUBBLE; c.br=false; c.wr=false; c.rl=false; c.lvl=0; dirty=true;
    }
    if(--e.life<=0){ tornadoE=null; toast('龍捲風消散了。'); }
  }
  if(monsterE){
    const e=monsterE;
    e.x += Math.sign(e.tx-e.x)*(Math.random()<0.8?1:0);
    e.z += Math.sign(e.tz-e.z)*(Math.random()<0.8?1:0);
    e.ph++;
    for(let i=-1;i<=0;i++)for(let j=-1;j<=0;j++){
      const cx=Math.round(e.x)+i, cy=Math.round(e.z)+j;
      if(!inB(cx,cy)) continue;
      const c=G[cx][cy];
      if(c.t!==T.WATER && c.t!==T.GRASS){
        if(isBigB(c.t)){c.ax=-1;c.ay=-1;}
        if(Math.random()<0.3 && flammable(c.t)) igniteCell(cx,cy);
        else {c.t=c.br?T.WATER:T.RUBBLE; c.br=false; c.wr=false; c.rl=false; c.lvl=0;}
        dirty=true;
      }
    }
    if(Math.abs(e.x-e.tx)<1 && Math.abs(e.z-e.tz)<1){ e.tx=Math.random()*N; e.tz=Math.random()*N; }
    if(--e.life<=0){ monsterE=null; toast('巨獸返回水域深處……'); }
  }
}
