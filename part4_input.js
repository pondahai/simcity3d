/* ═══════════ 攝影機與輸入 ═══════════ */
let mode='bird';                       // bird | walk
const bird = {tx:0, tz:0, yaw:Math.PI*0.25, pitch:0.9, dist:150};
const walk = {x:0, z:0, yaw:0, pitch:0, speed:9};
let curTool='query';
let cursor=null;                        // 施工游標
const keys={};

function initCameras(){
  cursor = new THREE.Mesh(
    new THREE.BoxGeometry(TILE,0.5,TILE),
    new THREE.MeshBasicMaterial({color:0xffb742, transparent:true, opacity:0.45}));
  cursor.visible=false; scene.add(cursor);
  walk.x=0; walk.z=0;
  updateBirdCam();
}

function updateBirdCam(){
  const b=bird;
  b.pitch=clamp(b.pitch,0.32,1.45); b.dist=clamp(b.dist,26,330);
  const lim=HALF+30;
  b.tx=clamp(b.tx,-lim,lim); b.tz=clamp(b.tz,-lim,lim);
  const cx=b.tx + Math.cos(b.yaw)*Math.cos(b.pitch)*b.dist;
  const cz=b.tz + Math.sin(b.yaw)*Math.cos(b.pitch)*b.dist;
  const cy=Math.sin(b.pitch)*b.dist;
  camBird.position.set(cx,cy,cz);
  camBird.lookAt(b.tx,0,b.tz);
}
function updateWalkCam(){
  walk.pitch=clamp(walk.pitch,-1.2,1.2);
  camWalk.position.set(walk.x, 2.3, walk.z);
  const lx=walk.x+Math.cos(walk.yaw)*Math.cos(walk.pitch);
  const lz=walk.z+Math.sin(walk.yaw)*Math.cos(walk.pitch);
  camWalk.lookAt(lx, 2.3+Math.sin(walk.pitch), lz);
}

/* 世界座標 → 地格 */
function pickTile(clientX, clientY){
  const cam=activeCam;
  const ndc=new THREE.Vector2((clientX/innerWidth)*2-1, -(clientY/innerHeight)*2+1);
  const ray=new THREE.Raycaster();
  ray.setFromCamera(ndc, cam);
  const o=ray.ray.origin, d=ray.ray.direction;
  if(Math.abs(d.y)<1e-5) return null;
  const t=-o.y/d.y;
  if(t<0) return null;
  const px=o.x+d.x*t, pz=o.z+d.z*t;
  const x=Math.floor((px+HALF)/TILE), y=Math.floor((pz+HALF)/TILE);
  if(!inB(x,y)) return null;
  return [x,y];
}

/* 可通行判定(街景) */
function walkable(px,pz){
  const x=Math.floor((px+HALF)/TILE), y=Math.floor((pz+HALF)/TILE);
  if(!inB(x,y)) return false;
  const t=G[x][y].t;
  return t===T.GRASS||t===T.ROAD||t===T.RAIL||t===T.PARK||t===T.TREE||t===T.RUBBLE||
         (isZone(t)&&G[x][y].lvl===0);
}

/* ── 指標事件 ── */
let ptr={down:false, id:-1, sx:0, sy:0, lx:0, ly:0, mode:'', moved:false};
let pinch=null;
let lookPtr={id:-1, lx:0, ly:0};

function initInput(){
  const cv=renderer.domElement;

  cv.addEventListener('pointerdown', e=>{
    audioKick();
    if(mode==='walk'){
      // 觸控:左下搖桿另外處理;此處負責環顧
      if(e.pointerType==='touch' && e.clientX<innerWidth*0.42 && e.clientY>innerHeight*0.45) return;
      lookPtr.id=e.pointerId; lookPtr.lx=e.clientX; lookPtr.ly=e.clientY;
      cv.setPointerCapture(e.pointerId);
      return;
    }
    if(pinchStart(e)) return;
    if(e.button===1) e.preventDefault();   // 中鍵:抑制瀏覽器自動捲動
    ptr.down=true; ptr.id=e.pointerId; ptr.moved=false;
    ptr.sx=ptr.lx=e.clientX; ptr.sy=ptr.ly=e.clientY;
    ptr.mode = (e.button===2||e.ctrlKey) ? 'rotate'
             : (e.button===1||curTool==='query') ? 'pan' : 'paint';
    cv.setPointerCapture(e.pointerId);
    if(ptr.mode==='paint') paintAt(e.clientX,e.clientY);
  });

  cv.addEventListener('pointermove', e=>{
    if(mode==='walk'){
      if(e.pointerId===lookPtr.id){
        walk.yaw   += (e.clientX-lookPtr.lx)*0.0042;
        walk.pitch -= (e.clientY-lookPtr.ly)*0.0035;
        lookPtr.lx=e.clientX; lookPtr.ly=e.clientY;
      }
      return;
    }
    if(pinchMove(e)) return;
    // 游標預覽
    if(!ptr.down && curTool!=='query'){
      const p=pickTile(e.clientX,e.clientY);
      if(p){ showCursor(p[0],p[1]); } else cursor.visible=false;
    }
    if(!ptr.down || e.pointerId!==ptr.id) return;
    const dx=e.clientX-ptr.lx, dy=e.clientY-ptr.ly;
    if(Math.abs(e.clientX-ptr.sx)+Math.abs(e.clientY-ptr.sy)>6) ptr.moved=true;
    if(ptr.mode==='pan'){
      const s=bird.dist*0.0016;
      const fx=Math.cos(bird.yaw), fz=Math.sin(bird.yaw);
      const rx=-fz, rz=fx;
      bird.tx += (rx*dx - fx*dy)*s;
      bird.tz += (rz*dx - fz*dy)*s;
      updateBirdCam();
    } else if(ptr.mode==='rotate'){
      bird.yaw   += dx*0.0055;
      bird.pitch += dy*0.004;
      updateBirdCam();
    } else if(ptr.mode==='paint'){
      paintAt(e.clientX,e.clientY);
    }
    ptr.lx=e.clientX; ptr.ly=e.clientY;
  });

  const up = e=>{
    if(mode==='walk'){ if(e.pointerId===lookPtr.id) lookPtr.id=-1; return; }
    pinchEnd(e);
    if(e.pointerId!==ptr.id) return;
    if(curTool==='query' && !ptr.moved){
      const p=pickTile(e.clientX,e.clientY);
      if(p) showQuery(p[0],p[1],e.clientX,e.clientY);
    }
    ptr.down=false; ptr.id=-1;
  };
  cv.addEventListener('pointerup', up);
  cv.addEventListener('pointercancel', up);
  cv.addEventListener('contextmenu', e=>e.preventDefault());

  cv.addEventListener('wheel', e=>{
    e.preventDefault();
    if(mode!=='bird') return;
    bird.dist *= (1 + Math.sign(e.deltaY)*0.09);
    updateBirdCam();
  }, {passive:false});

  window.addEventListener('keydown', e=>{
    keys[e.code]=true;
    if(e.code==='KeyV') toggleView();
  });
  window.addEventListener('keyup', e=>{ keys[e.code]=false; });

  initStick();
}

/* 雙指縮放/旋轉(鳥瞰) */
const touches=new Map();
function pinchStart(e){
  if(e.pointerType!=='touch') return false;
  touches.set(e.pointerId,{x:e.clientX,y:e.clientY});
  if(touches.size===2){
    const [a,b]=[...touches.values()];
    pinch={d:Math.hypot(a.x-b.x,a.y-b.y), cy:(a.y+b.y)/2};
    ptr.down=false;
    return true;
  }
  return false;
}
function pinchMove(e){
  if(!touches.has(e.pointerId)) return false;
  touches.set(e.pointerId,{x:e.clientX,y:e.clientY});
  if(pinch && touches.size===2){
    const [a,b]=[...touches.values()];
    const d=Math.hypot(a.x-b.x,a.y-b.y);
    bird.dist *= pinch.d/d;
    const cy=(a.y+b.y)/2;
    bird.pitch += (cy-pinch.cy)*0.004;
    pinch={d, cy};
    updateBirdCam();
    return true;
  }
  return false;
}
function pinchEnd(e){ touches.delete(e.pointerId); if(touches.size<2) pinch=null; }

/* 施工 */
let lastPaint=null;
function paintAt(cx,cy){
  const p=pickTile(cx,cy);
  if(!p) return;
  const [x,y]=p;
  if(lastPaint && lastPaint[0]===x && lastPaint[1]===y) return;
  lastPaint=[x,y];
  showCursor(x,y);
  place(curTool,x,y);
}
function showCursor(x,y){
  const tl=TOOLS.find(o=>o.id===curTool);
  const w = tl&&tl.t!==undefined&&isBigB(tl.t) ? BSPEC[tl.t].w : 1;
  cursor.visible=true;
  cursor.scale.set(w,1,w);
  cursor.position.set(wx(x)+(w-1)*TILE/2, 0.3, wz(y)+(w-1)*TILE/2);
  let ok=true;
  if(curTool!=='doze'&&curTool!=='query'){
    const t=tl&&tl.t, isTrans=t===T.ROAD||t===T.RAIL||t===T.WIRE;
    for(let i=0;i<w;i++)for(let j=0;j<w;j++){
      if(!inB(x+i,y+j)){ ok=false; continue; }
      const cc=G[x+i][y+j];
      const legal = buildable(cc) || (isTrans && cc.t===T.WATER) ||
        (t===T.WIRE && (cc.t===T.ROAD||cc.t===T.RAIL) && !cc.br && !cc.wr) ||
        ((t===T.ROAD||t===T.RAIL) && cc.t===T.WIRE && !cc.br);
      if(!legal) ok=false;
    }
  }
  cursor.material.color.set(ok?0xffb742:0xe05d5d);
}

/* 街景移動(每幀) */
let stickVec={x:0,y:0};
function stepWalk(dt){
  let mx=0, mz=0;
  if(keys.KeyW||keys.ArrowUp) mz+=1;
  if(keys.KeyS||keys.ArrowDown) mz-=1;
  if(keys.KeyA||keys.ArrowLeft) mx-=1;
  if(keys.KeyD||keys.ArrowRight) mx+=1;
  mx+=stickVec.x; mz-=stickVec.y;
  const len=Math.hypot(mx,mz);
  if(len>0.01){
    mx/=Math.max(1,len); mz/=Math.max(1,len);
    const sp=walk.speed * ((keys.ShiftLeft||keys.ShiftRight)?2:1);
    const fx=Math.cos(walk.yaw), fz=Math.sin(walk.yaw);
    const rx=-fz, rz=fx;
    let nx=walk.x + (fx*mz + rx*mx)*sp*dt;
    let nz=walk.z + (fz*mz + rz*mx)*sp*dt;
    nx=clamp(nx,-HALF+1,HALF-1); nz=clamp(nz,-HALF+1,HALF-1);
    if(walkable(nx,walk.z)) walk.x=nx;
    if(walkable(walk.x,nz)) walk.z=nz;
  }
  updateWalkCam();
}

/* 虛擬搖桿 */
function initStick(){
  const el=document.getElementById('stick'), knob=document.getElementById('stickKnob');
  let sid=-1, cx=0, cyy=0;
  el.addEventListener('pointerdown', e=>{
    sid=e.pointerId; const r=el.getBoundingClientRect();
    cx=r.left+r.width/2; cyy=r.top+r.height/2;
    el.setPointerCapture(sid); move(e);
  });
  const move=e=>{
    if(e.pointerId!==sid) return;
    let dx=e.clientX-cx, dy=e.clientY-cyy;
    const m=Math.hypot(dx,dy), R=42;
    if(m>R){dx*=R/m; dy*=R/m;}
    knob.style.transform=`translate(calc(-50% + ${dx}px), calc(-50% + ${dy}px))`;
    stickVec.x=dx/R; stickVec.y=dy/R;
  };
  el.addEventListener('pointermove', move);
  const end=e=>{
    if(e.pointerId!==sid) return;
    sid=-1; stickVec.x=0; stickVec.y=0;
    knob.style.transform='translate(-50%,-50%)';
  };
  el.addEventListener('pointerup', end);
  el.addEventListener('pointercancel', end);
}

/* 視角切換 */
function toggleView(){
  if(mode==='bird'){
    mode='walk';
    // 站到鳥瞰目標附近的可走位置
    let bx=clamp(bird.tx,-HALF+2,HALF-2), bz=clamp(bird.tz,-HALF+2,HALF-2);
    outer:
    for(let r=0;r<N;r++){
      for(let a=0;a<16;a++){
        const px=bx+Math.cos(a/16*6.283)*r*TILE, pz=bz+Math.sin(a/16*6.283)*r*TILE;
        if(px>-HALF&&px<HALF&&pz>-HALF&&pz<HALF&&walkable(px,pz)){ bx=px; bz=pz; break outer; }
      }
    }
    walk.x=bx; walk.z=bz; walk.yaw=bird.yaw+Math.PI; walk.pitch=0;
    activeCam=camWalk;
    document.getElementById('viewBtn').textContent='🦅 返回鳥瞰';
    document.getElementById('toolbar').style.display='none';
    document.getElementById('camBtns').style.display='none';
    document.getElementById('walkHint').style.display='block';
    if(isTouch) document.getElementById('stick').style.display='block';
    cursor.visible=false; hideQuery();
    setTimeout(()=>{document.getElementById('walkHint').style.display='none';}, 5200);
    toast('已進入街景。城市持續運轉中——按 V 或按鈕返回鳥瞰。');
  } else {
    mode='bird';
    bird.tx=walk.x; bird.tz=walk.z;
    activeCam=camBird;
    updateBirdCam();
    document.getElementById('viewBtn').textContent='🚶 走進城市';
    document.getElementById('toolbar').style.display='flex';
    document.getElementById('camBtns').style.display='flex';
    document.getElementById('walkHint').style.display='none';
    document.getElementById('stick').style.display='none';
  }
}
const isTouch = matchMedia('(pointer:coarse)').matches;
