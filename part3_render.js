/* ═══════════ 3D 渲染器(低多邊形) ═══════════ */
let renderer, scene, camBird, camWalk, activeCam;
let groundMesh, boxMesh, coneMesh, cylMesh, carMesh;
let boxN=0, coneN=0, cylN=0, groundN=0;
const BOX_CAP=34000, CONE_CAP=9000, CYL_CAP=3000, CAR_CAP=140, GROUND_CAP=N*N*2;
let dirty=true, groundDirty=true;
let quake=0;
let overlay='none';         // none|power|pollution|crime|landv|traffic
const _d=new THREE.Object3D(), _c=new THREE.Color();

const wx = x => (x - N/2)*TILE + TILE/2;
const wz = y => (y - N/2)*TILE + TILE/2;

function initGL(){
  const canvas = document.getElementById('c3d');
  renderer = new THREE.WebGLRenderer({canvas, antialias:true});
  renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
  renderer.setSize(innerWidth, innerHeight);

  scene = new THREE.Scene();
  scene.background = new THREE.Color(0x9fd4ea);
  scene.fog = new THREE.Fog(0x9fd4ea, 180, 480);

  const hemi = new THREE.HemisphereLight(0xdfeeff, 0x6f7f66, 0.72);
  scene.add(hemi);
  const sun = new THREE.DirectionalLight(0xfff3d8, 0.75);
  sun.position.set(120, 200, 80);
  scene.add(sun);

  camBird = new THREE.PerspectiveCamera(55, innerWidth/innerHeight, 1, 1200);
  camWalk = new THREE.PerspectiveCamera(72, innerWidth/innerHeight, 0.3, 900);
  activeCam = camBird;

  // 自訂 shader:逐實例顏色 aCol + 太陽/半球光 + 霧(完全繞開 r128 instanceColor 相容性問題)
  const INST_VERT = `
    attribute vec3 aCol;
    uniform vec3 sunDir;
    varying vec3 vCol;
    varying float vFogDepth;
    void main(){
      #ifdef USE_INSTANCING
        vec4 mp = instanceMatrix * vec4(position, 1.0);
        vec3 n = normalize(mat3(instanceMatrix) * normal);
      #else
        vec4 mp = vec4(position, 1.0);
        vec3 n = normal;
      #endif
      float dif = max(dot(n, sunDir), 0.0);
      float hemi = n.y * 0.5 + 0.5;
      vec3 light = vec3(0.60, 0.63, 0.66) * (0.50 + 0.50 * hemi)
                 + vec3(1.00, 0.95, 0.84) * dif * 0.58;
      vCol = aCol * min(light, vec3(1.2));
      vec4 mv = modelViewMatrix * mp;
      vFogDepth = -mv.z;
      gl_Position = projectionMatrix * mv;
    }`;
  const INST_FRAG = `
    uniform vec3 fogColor;
    uniform float fogNear;
    uniform float fogFar;
    varying vec3 vCol;
    varying float vFogDepth;
    void main(){
      float f = smoothstep(fogNear, fogFar, vFogDepth);
      gl_FragColor = vec4(mix(vCol, fogColor, f), 1.0);
    }`;
  instMat = new THREE.ShaderMaterial({
    uniforms:{
      sunDir:{value:new THREE.Vector3(120,200,80).normalize()},
      fogColor:{value:new THREE.Color(0x9fd4ea)},
      fogNear:{value:180}, fogFar:{value:480},
    },
    vertexShader:INST_VERT, fragmentShader:INST_FRAG,
  });
  const makeInst = (geo, cap)=>{
    geo.setAttribute('aCol', new THREE.InstancedBufferAttribute(new Float32Array(cap*3).fill(1), 3));
    const m = new THREE.InstancedMesh(geo, instMat, cap);
    m.count=0; m.frustumCulled=false; scene.add(m);
    return m;
  };
  groundMesh = makeInst(new THREE.BoxGeometry(1,1,1), GROUND_CAP);
  boxMesh    = makeInst(new THREE.BoxGeometry(1,1,1), BOX_CAP);
  coneMesh   = makeInst(new THREE.ConeGeometry(0.7,1,4), CONE_CAP);
  cylMesh    = makeInst(new THREE.CylinderGeometry(0.5,0.62,1,8), CYL_CAP);
  carMesh    = makeInst(new THREE.BoxGeometry(1.3,0.62,0.72), CAR_CAP);

  // 邊界基座(城市浮島感)
  const base = new THREE.Mesh(
    new THREE.BoxGeometry(N*TILE+8, 14, N*TILE+8),
    new THREE.MeshBasicMaterial({color:0x5d4e3b}));
  base.position.y=-7.6; scene.add(base);

  // 龍捲風 / 巨獸模型(平時隱藏)
  tornadoMesh = new THREE.Mesh(
    new THREE.ConeGeometry(5,26,7,3,true),
    new THREE.MeshBasicMaterial({color:0x8d99a6, transparent:true, opacity:0.82}));
  tornadoMesh.visible=false; scene.add(tornadoMesh);
  monsterG = buildMonster(); monsterG.visible=false; scene.add(monsterG);

  window.addEventListener('resize', ()=>{
    renderer.setSize(innerWidth, innerHeight);
    camBird.aspect=camWalk.aspect=innerWidth/innerHeight;
    camBird.updateProjectionMatrix(); camWalk.updateProjectionMatrix();
  });
}
let tornadoMesh=null, monsterG=null, instMat=null;
function buildMonster(){
  const g=new THREE.Group();
  const red=new THREE.MeshBasicMaterial({color:0xa8362b});
  const dark=new THREE.MeshBasicMaterial({color:0x6e211c});
  const body=new THREE.Mesh(new THREE.BoxGeometry(4.6,7,3.4),red); body.position.y=6; g.add(body);
  const head=new THREE.Mesh(new THREE.BoxGeometry(3.2,2.6,3),red); head.position.set(0,10.6,0.6); g.add(head);
  const jaw=new THREE.Mesh(new THREE.BoxGeometry(2.6,1,2.6),dark); jaw.position.set(0,9.2,1.2); g.add(jaw);
  for(const s of [-1,1]){
    const eye=new THREE.Mesh(new THREE.BoxGeometry(0.5,0.5,0.4),
      new THREE.MeshBasicMaterial({color:0xffe14d}));
    eye.position.set(s*0.9,11.1,2.1); g.add(eye);
    const leg=new THREE.Mesh(new THREE.BoxGeometry(1.5,4.2,1.7),dark);
    leg.position.set(s*1.5,2.1,0); leg.userData.leg=s; g.add(leg);
    const arm=new THREE.Mesh(new THREE.BoxGeometry(1,3.6,1.1),dark);
    arm.position.set(s*2.9,6.8,0.6); g.add(arm);
  }
  const tail=new THREE.Mesh(new THREE.BoxGeometry(1.4,1.4,5),dark);
  tail.position.set(0,3.6,-3.6); g.add(tail);
  return g;
}

/* ── 實例寫入輔助 ── */
function wCol(mesh, i, hex){
  _c.set(hex);
  mesh.geometry.attributes.aCol.setXYZ(i, _c.r, _c.g, _c.b);
}
function flushInst(mesh, n){
  mesh.count = n;
  mesh.instanceMatrix.needsUpdate = true;
  mesh.geometry.attributes.aCol.needsUpdate = true;
}
function pBox(x,y,z,sx,sy,sz,color,ry){
  if(boxN>=BOX_CAP)return;
  _d.position.set(x,y,z); _d.scale.set(sx,sy,sz); _d.rotation.set(0,ry||0,0);
  _d.updateMatrix();
  boxMesh.setMatrixAt(boxN,_d.matrix); wCol(boxMesh,boxN,color); boxN++;
}
function pCone(x,y,z,r,h,color,ry){
  if(coneN>=CONE_CAP)return;
  _d.position.set(x,y,z); _d.scale.set(r/0.7,h,r/0.7); _d.rotation.set(0,ry||Math.PI/4,0);
  _d.updateMatrix();
  coneMesh.setMatrixAt(coneN,_d.matrix); wCol(coneMesh,coneN,color); coneN++;
}
function pCyl(x,y,z,r,h,color){
  if(cylN>=CYL_CAP)return;
  _d.position.set(x,y,z); _d.scale.set(r/0.5,h,r/0.5); _d.rotation.set(0,0,0);
  _d.updateMatrix();
  cylMesh.setMatrixAt(cylN,_d.matrix); wCol(cylMesh,cylN,color); cylN++;
}

/* ── 地面重建(含圖層覆蓋色) ── */
const GCOL={grass:0x7fb069, grass2:0x74a55f, water:0x3f7fbf, road:0x4a4f57, rail:0x6a5f52,
  zoneR:0x9fcf8f, zoneC:0x9fb9dd, zoneI:0xd8c98a, rubble:0x8a7a66, dirt:0x8f7f5f};

function heat(v, max){ // 0..max → 綠黃紅
  const t=clamp(v/max,0,1);
  _c.setHSL(0.33*(1-t), 0.75, 0.42);
  return _c.getHex();
}

function rebuildGround(){
  groundN=0;
  for(let x=0;x<N;x++)for(let y=0;y<N;y++){
    const c=G[x][y], i=idx(x,y);
    let col, h=0.6, yo=-0.3;
    switch(c.t){
      case T.WATER: col=GCOL.water; h=0.36; yo=-0.5; break;
      case T.ROAD: col=c.br?GCOL.water:GCOL.road; if(c.br){h=0.36;yo=-0.5;} break;
      case T.RAIL: col=c.br?GCOL.water:GCOL.rail; if(c.br){h=0.36;yo=-0.5;} break;
      case T.WIRE: if(c.br){col=GCOL.water;h=0.36;yo=-0.5;} else col=((x+y)&1)?GCOL.grass:GCOL.grass2; break;
      case T.RES: col=c.lvl?GCOL.grass:GCOL.zoneR; break;
      case T.COM: col=c.lvl?GCOL.grass:GCOL.zoneC; break;
      case T.IND: col=c.lvl?GCOL.dirt:GCOL.zoneI; break;
      case T.RUBBLE: col=GCOL.rubble; break;
      case T.FIRE: col=0x3a2a1a; break;
      default: col=((x+y)&1)?GCOL.grass:GCOL.grass2;
    }
    if(isBigB(c.t)) col=0x9aa2ac;
    // 圖層覆蓋
    if(overlay!=='none' && c.t!==T.WATER){
      if(overlay==='power') col = (isZone(c.t)||isBigB(c.t)) ? (c.pow?0x35c26b:0xd6453a) : ((c.t===T.WIRE||c.wr)?(c.pow?0x9fe8bb:0xe8a49f):0x39424e);
      if(overlay==='pollution') col=heat(city.pollution[i],90);
      if(overlay==='crime') col=heat(city.crime[i],80);
      if(overlay==='landv'){ const t=clamp(city.landv[i]/60,0,1); _c.setHSL(0.6,0.6,0.18+t*0.45); col=_c.getHex(); }
      if(overlay==='traffic') col=heat(city.traffic[i],60);
    }
    _d.position.set(wx(x), yo, wz(y)); _d.scale.set(TILE,h,TILE); _d.rotation.set(0,0,0);
    _d.updateMatrix();
    groundMesh.setMatrixAt(groundN,_d.matrix); wCol(groundMesh,groundN,col); groundN++;
  }
  flushInst(groundMesh, groundN);
  groundDirty=false;
}

/* ── 建物重建 ── */
const RESWALL=[0xf2e7d5,0xe8d9c3,0xf5efe0,0xdcd0bb];
const ROOFCOL=[0xc0574a,0x7d6b5d,0x5f7d8c,0xa8703f];

function rebuildCity(){
  boxN=0; coneN=0; cylN=0;
  const seasonNoOverlay = overlay==='none';
  for(let x=0;x<N;x++)for(let y=0;y<N;y++){
    const c=G[x][y];
    const X=wx(x), Z=wz(y);
    const vr=c.v;
    switch(c.t){
      case T.TREE:
        pCyl(X,0.45,Z,0.16,0.9,0x6d4c33);
        pCone(X,1.6,Z,1.15,2.3,vr<0.5?0x3e7c47:0x4f9152, vr*3);
        if(vr>0.72) pCone(X+1.1,1.1,Z-0.8,0.8,1.6,0x3a7343, vr*5);
        break;
      case T.ROAD: drawRoadDeco(x,y,X,Z); if(c.rl) drawRail(x,y,X,Z,true); break;
      case T.RAIL: drawRail(x,y,X,Z); break;
      case T.WIRE: drawWire(x,y,X,Z,c.pow); break;
      case T.RES: drawRes(c,X,Z); break;
      case T.COM: drawCom(c,X,Z); break;
      case T.IND: drawInd(c,X,Z); break;
      case T.PARK:
        pBox(X,0.06,Z,TILE*0.96,0.12,TILE*0.96,0x5c9e57);
        pCyl(X-0.9,0.4,Z+0.7,0.13,0.8,0x6d4c33);
        pCone(X-0.9,1.35,Z+0.7,0.9,1.7,0x4f9152,vr*4);
        pCyl(X+1,0.4,Z-0.8,0.13,0.8,0x6d4c33);
        pCone(X+1,1.3,Z-0.8,0.8,1.6,0x3e7c47,vr*2);
        pBox(X+0.8,0.28,Z+1.1,1.2,0.28,0.55,0x8f6b3f); // 長椅
        break;
      case T.RUBBLE:
        pBox(X-0.7,0.35,Z+0.4,1.3,0.7,1.1,0x776a58,vr*2);
        pBox(X+0.8,0.25,Z-0.6,1.0,0.5,1.3,0x8a7c68,vr*4);
        break;
      case T.FIRE:
        pCone(X,1.5,Z,1.5,3.0,0xe8632a, vr*6);
        pCone(X+0.5,1.0,Z+0.5,0.9,2.0,0xffb23e, vr*3);
        pCone(X-0.6,0.9,Z-0.4,0.8,1.8,0xffd23e, vr*8);
        break;
    }
    // 道路/鐵路上的交叉電線
    if(c.wr) drawWire(x,y,X,Z,c.pow);
    // 大建築只在錨點畫一次
    if(isBigB(c.t) && c.ax===x && c.ay===y) drawBig(c,x,y);
    // 停電閃爍標記(無覆蓋圖時)
    if(seasonNoOverlay && (isZone(c.t)&&c.lvl>0 || (isBigB(c.t)&&c.ax===x&&c.ay===y)) && !c.pow
       && c.t!==T.COAL && c.t!==T.NUKE){
      pCone(X, zoneH(c)+2.2, Z, 0.55, 1.1, 0xffe14d, Math.PI/4);
    }
  }
  flushInst(boxMesh, boxN);
  flushInst(coneMesh, coneN);
  flushInst(cylMesh, cylN);
  dirty=false;
  rebuildGround();
  refreshCars();
}
function zoneH(c){
  if(c.t===T.RES) return c.lvl<=2?2.2:c.lvl<=4?4:9;
  if(c.t===T.COM) return 2+c.lvl*2.2;
  if(c.t===T.IND) return 3;
  if(isBigB(c.t)) return 5;
  return 2;
}

function drawRoadDeco(x,y,X,Z){
  const c=G[x][y];
  const h = inB(x+1,y)&&G[x+1][y].t===T.ROAD || inB(x-1,y)&&G[x-1][y].t===T.ROAD;
  const v = inB(x,y+1)&&G[x][y+1].t===T.ROAD || inB(x,y-1)&&G[x][y-1].t===T.ROAD;
  if(c.br){ // 橋面
    pBox(X,0.05,Z,TILE,0.36,TILE,0x6a6f77);
    pBox(X,0.42,Z, h&&!v?TILE:0.3, 0.5, v&&!h?TILE:0.3, 0x8b909a);
    pCyl(X-1.2,-0.7,Z-1.2,0.2,1.6,0x565b63); pCyl(X+1.2,-0.7,Z+1.2,0.2,1.6,0x565b63);
  }
  if(h&&!v){ pBox(X,c.br?0.28:0.02,Z,1.3,0.05,0.16,0xd8c542); }
  else if(v&&!h){ pBox(X,c.br?0.28:0.02,Z,0.16,0.05,1.3,0xd8c542); }
}
function railAt(x,y){ const c=G[x][y]; return c.t===T.RAIL||c.rl; }
const RAILC=0x9aa3ad, TIEC=0x54462f;
function drawRail(x,y,X,Z,cross){
  const c=G[x][y];
  if(!cross && c.br){ pBox(X,0.02,Z,TILE,0.3,TILE,0x6a6f77); pCyl(X,-0.8,Z,0.24,1.6,0x565b63); }
  const E=inB(x+1,y)&&railAt(x+1,y), W=inB(x-1,y)&&railAt(x-1,y);
  const S=inB(x,y+1)&&railAt(x,y+1), Nb=inB(x,y-1)&&railAt(x,y-1);
  const hC=E||W, vC=S||Nb;
  if(!(hC&&vC)){
    // 直線(或孤立):鋼軌貫通整格,與相鄰格無縫相接;枕木間距 0.8 跨格連續
    const v=vC;
    if(!cross) for(const o of [-1.6,-0.8,0,0.8,1.6]) pBox(X+(v?0:o),0.06,Z+(v?o:0),v?2:0.5,0.1,v?0.5:2,TIEC,0);
    pBox(X+(v?-0.7:0),0.14,Z+(v?0:-0.7),v?0.24:TILE,0.12,v?TILE:0.24,RAILC,0);
    pBox(X+(v?0.7:0),0.14,Z+(v?0:0.7),v?0.24:TILE,0.12,v?TILE:0.24,RAILC,0);
  } else {
    // 轉角/交會:朝每個連接方向畫半格臂,中心以道碴板銜接
    if(!cross) pBox(X,0.05,Z,2.1,0.12,2.1,TIEC,0);
    for(const [on,dx,dz] of [[E,1,0],[W,-1,0],[S,0,1],[Nb,0,-1]]){
      if(!on) continue;
      const a=dx!==0;                       // 臂沿 x 軸
      const ax=X+dx*TILE/4, az=Z+dz*TILE/4;
      if(!cross) for(const o of [0.8,1.6]) pBox(X+dx*o,0.06,Z+dz*o,a?0.5:2,0.1,a?2:0.5,TIEC,0);
      pBox(ax+(a?0:-0.7),0.14,az+(a?-0.7:0),a?TILE/2:0.24,0.12,a?0.24:TILE/2,RAILC,0);
      pBox(ax+(a?0:0.7),0.14,az+(a?0.7:0),a?TILE/2:0.24,0.12,a?0.24:TILE/2,RAILC,0);
    }
  }
  if(cross){ // 平交道警示柱
    pCyl(X+1.55,0.7,Z+1.55,0.07,1.4,0xe8e6df);
    pBox(X+1.55,1.5,Z+1.55,0.55,0.16,0.16,0xd6453a,0);
    pBox(X+1.55,1.5,Z+1.55,0.16,0.16,0.55,0xd6453a,0);
  }
}
function drawWire(x,y,X,Z,pow){
  if(G[x][y].br) pBox(X,0.0,Z,1.2,0.3,1.2,0x8b909a);
  pCyl(X,1.5,Z,0.11,3,0x7a6248);
  const h = inB(x+1,y)&&condAt(x+1,y) || inB(x-1,y)&&condAt(x-1,y);
  pBox(X,2.9,Z,h?0.2:2.1,0.16,h?2.1:0.2,0x7a6248);
  pBox(X,3.12,Z,0.3,0.3,0.3,pow?0xffd23e:0x555c66);
}
function condAt(x,y){ const c=G[x][y]; return c.t===T.WIRE||c.wr||isZone(c.t)||isBigB(c.t); }

function drawRes(c,X,Z){
  if(c.lvl===0) return;
  const wall=RESWALL[(c.v*4)|0], roof=ROOFCOL[(c.v*7|0)%4];
  if(c.lvl<=2){                       // 小屋
    pBox(X,0.9,Z,2.4,1.8,2.2,wall,0);
    pCone(X,2.5,Z,2.0,1.4,roof,Math.PI/4);
    if(c.lvl===2){ pBox(X+1.4,0.6,Z+1.2,0.9,1.2,0.9,wall); }
  } else if(c.lvl<=4){                // 連棟宅
    pBox(X-0.85,1.3,Z,1.7,2.6,2.6,wall,0);
    pCone(X-0.85,3.2,Z,1.5,1.2,roof,Math.PI/4);
    pBox(X+1.05,1.0,Z+0.3,1.6,2.0,2.0,RESWALL[((c.v*9)|0)%4],0);
    pCone(X+1.05,2.6,Z+0.3,1.4,1.1,ROOFCOL[((c.v*5)|0)%4],Math.PI/4);
  } else {                            // 公寓塔
    pBox(X,4.4,Z,2.9,8.8,2.9,0xe3d5be,0);
    pBox(X,9.0,Z,3.1,0.4,3.1,0x8f8577,0);
    for(let f=0;f<4;f++) pBox(X,1.6+f*2,Z+1.5,2.5,0.5,0.14,0x5f7d8c);
  }
}
function drawCom(c,X,Z){
  if(c.lvl===0) return;
  const h = 2 + c.lvl*2.1;
  const glass=[0x6fa8c9,0x7fb3d6,0x5f93b5][(c.v*3)|0];
  pBox(X,h/2,Z,2.9,h,2.9,glass,0);
  pBox(X,h+0.18,Z,3.1,0.36,3.1,0x3f5666,0);
  for(let f=0;f<c.lvl;f++){ pBox(X,1.2+f*2.1,Z,3.02,0.22,3.02,0xdfeeff,0); }
  if(c.lvl>=3) pBox(X,h+0.9,Z,0.24,1.4,0.24,0x3f5666,0);
  if(c.lvl>=1) pBox(X,0.9,Z+1.55,2.6,0.5,0.12,0xffb742,0); // 招牌
}
function drawInd(c,X,Z){
  if(c.lvl===0) return;
  const body=[0xb8b2a6,0xc9b98e,0xa9a49b][(c.v*3)|0];
  pBox(X,1.4,Z,3.2,2.8,3.0,body,0);
  pCone(X-0.8,3.2,Z,1.3,1.0,0x8a8478,Math.PI/4);
  pCyl(X+1.1,3.6,Z+0.9,0.28,2.6,0x6e6a63);
  if(c.lvl>=3){ pCyl(X+0.3,4.0,Z-0.9,0.3,3.4,0x5f5b55); pBox(X-1.0,3.4,Z+0.9,1.2,1.2,1.2,body,0); }
  if(c.lvl>=5){ pBox(X,3.4,Z,2.0,1.4,1.8,0x97918a,0); }
  pBox(X,0.35,Z-1.62,2.8,0.7,0.14,0x77706a,0); // 圍牆
}

function drawBig(c,x,y){
  const w=BSPEC[c.t].w, cx=wx(x)+(w-1)*TILE/2, cz=wz(y)+(w-1)*TILE/2, W=w*TILE;
  pBox(cx,0.12,cz,W*0.98,0.24,W*0.98,0xb7bcc4);   // 基座
  switch(c.t){
    case T.POLICE:
      pBox(cx,1.6,cz,W*0.7,3.2,W*0.62,0x5f83b8,0);
      pBox(cx,3.4,cz,W*0.74,0.4,W*0.66,0x33465f,0);
      pBox(cx,3.9,cz,1.2,0.7,0.5,0x2e77d0,0); pBox(cx,4.5,cz,0.16,0.6,0.16,0x33465f,0);
      break;
    case T.FIRESTA:
      pBox(cx,1.5,cz,W*0.72,3.0,W*0.64,0xc65a4d,0);
      pBox(cx,3.2,cz,W*0.76,0.4,W*0.68,0x6e2e28,0);
      pBox(cx-W*0.18,1.2,cz+W*0.28,2.0,2.4,0.2,0x8a3b34,0); // 車庫門
      pCyl(cx+W*0.24,4.0,cz-W*0.2,0.2,2.2,0x6e2e28);
      break;
    case T.COAL:
      pBox(cx,2.2,cz,W*0.8,4.4,W*0.66,0x6a6f78,0);
      pCyl(cx-W*0.2,6.2,cz,0.75,6.0,0x565b64);
      pCyl(cx+W*0.16,5.6,cz+0.6,0.65,5.0,0x60656e);
      pBox(cx+W*0.3,1.2,cz-W*0.28,2.2,2.4,2.2,0x3b3f46,0); // 煤堆
      break;
    case T.NUKE:
      pBox(cx-W*0.2,1.8,cz,W*0.44,3.6,W*0.5,0xe8e6df,0);
      pCyl(cx+W*0.22,3.4,cz,2.3,6.8,0xd9d7cf);
      pCyl(cx+W*0.22,7.0,cz,1.7,0.7,0xc4c2ba);
      pBox(cx-W*0.2,3.9,cz,1.1,0.8,1.1,0xf2c23e,0);   // 警示標
      break;
    case T.STADIUM:{
      pBox(cx,0.5,cz,W*0.62,0.7,W*0.42,0x63a35c,0);   // 草皮
      pBox(cx,1.5,cz-W*0.31,W*0.86,2.6,W*0.14,0xcfd4da,0);
      pBox(cx,1.5,cz+W*0.31,W*0.86,2.6,W*0.14,0xcfd4da,0);
      pBox(cx-W*0.4,1.3,cz,W*0.12,2.2,W*0.6,0xbfc4cb,0);
      pBox(cx+W*0.4,1.3,cz,W*0.12,2.2,W*0.6,0xbfc4cb,0);
      for(const s of [-1,1]) pCyl(cx+s*W*0.3,3.8,cz-W*0.3,0.12,3.4,0x8a9099);
      break;}
    case T.PORT:
      pBox(cx,0.9,cz,W*0.8,1.8,W*0.5,0x9c8a6f,0);      // 倉庫
      pCone(cx,2.2,cz,W*0.34,1.0,0x7d6f59,Math.PI/4);
      pCyl(cx+W*0.3,3.2,cz+W*0.3,0.18,5.0,0xc7873f);   // 起重機柱
      pBox(cx+W*0.3,5.4,cz+W*0.15,0.3,0.3,3.4,0xc7873f,0);
      pBox(cx-W*0.28,0.7,cz+W*0.3,2.6,1.4,1.4,0xb5473d,0); // 貨櫃
      pBox(cx-W*0.28,2.0,cz+W*0.3,2.6,1.2,1.4,0x3f7fbf,0);
      break;
    case T.AIRPORT:{
      pBox(cx,0.3,cz+W*0.22,W*0.94,0.3,W*0.3,0x565b63,0);   // 跑道
      for(let s=0;s<5;s++) pBox(cx-W*0.36+s*W*0.18,0.5,cz+W*0.22,1.6,0.06,0.24,0xf0f0e8,0);
      pBox(cx-W*0.24,1.4,cz-W*0.18,W*0.4,2.8,W*0.26,0xd7dbe0,0); // 航廈
      pCyl(cx+W*0.26,2.8,cz-W*0.2,0.5,5.2,0xaeb4bc);           // 塔台
      pBox(cx+W*0.26,5.7,cz-W*0.2,1.7,0.9,1.7,0x6fa8c9,0);
      // 停機小飛機
      pBox(cx+W*0.05,0.9,cz+W*0.02,3.0,0.5,0.6,0xeef1f4,0);
      pBox(cx+W*0.05,0.95,cz+W*0.02,0.7,0.4,2.6,0xeef1f4,0);
      pBox(cx+W*0.05+1.3,1.3,cz+W*0.02,0.5,0.9,0.16,0xc65a4d,0);
      break;}
  }
}

/* ── 車流與火車 ── */
let cars=[], roadList=[], trains=[], railList=[];
function refreshCars(){
  roadList=[]; railList=[];
  for(let x=0;x<N;x++)for(let y=0;y<N;y++){
    const c=G[x][y];
    if(c.t===T.ROAD){ roadList.push([x,y]); if(c.rl) railList.push([x,y]); }
    else if(c.t===T.RAIL) railList.push([x,y]);
  }
  const wantTrain = Math.min(10, Math.floor(railList.length/7));
  while(trains.length>wantTrain) trains.pop();
  while(trains.length<wantTrain && railList.length){
    const [x,y]=railList[Math.floor(Math.random()*railList.length)];
    trains.push({x,y,tx:x,ty:y,prog:1});
  }
  const want = Math.min(CAR_CAP - trains.length*2, Math.floor(roadList.length/2.4));
  while(cars.length>want) cars.pop();
  while(cars.length<want && roadList.length){
    const [x,y]=roadList[Math.floor(Math.random()*roadList.length)];
    cars.push({x,y,px:wx(x),pz:wz(y),tx:x,ty:y,prog:1,
      col:[0xd94f3d,0x3d7fd9,0xe8c14a,0xdfe4ea,0x54c47a][Math.floor(Math.random()*5)]});
  }
}
function stepCars(dt){
  let n=0;
  for(const car of cars){
    car.prog += dt*1.7;
    if(car.prog>=1){
      car.x=car.tx; car.y=car.ty; car.prog=0;
      const opts=[];
      for(const [dx,dy] of [[1,0],[-1,0],[0,1],[0,-1]]){
        const nx=car.x+dx, ny=car.y+dy;
        if(inB(nx,ny)&&G[nx][ny].t===T.ROAD) opts.push([nx,ny]);
      }
      if(!opts.length){ car.prog=1; continue; }
      const pick=opts[Math.floor(Math.random()*opts.length)];
      car.tx=pick[0]; car.ty=pick[1];
    }
    const fx=wx(car.x)+(wx(car.tx)-wx(car.x))*car.prog;
    const fz=wz(car.y)+(wz(car.ty)-wz(car.y))*car.prog;
    const dx=car.tx-car.x, dz=car.ty-car.y;
    const ox = dz!==0 ? (dz>0?-0.85:0.85) : 0;
    const oz = dx!==0 ? (dx>0?0.85:-0.85) : 0;
    _d.position.set(fx+ox, 0.42, fz+oz);
    _d.rotation.set(0, dx!==0 ? 0 : Math.PI/2, 0);
    _d.scale.set(1,1,1); _d.updateMatrix();
    carMesh.setMatrixAt(n,_d.matrix); wCol(carMesh,n,car.col); n++;
  }
  // 火車:沿鐵路行駛,不走回頭路,端點折返
  for(const tr of trains){
    tr.prog += dt*2.2;
    if(tr.prog>=1){
      const px=tr.x, py=tr.y;
      tr.x=tr.tx; tr.y=tr.ty; tr.prog=0;
      const opts=[];
      for(const [dx,dy] of [[1,0],[-1,0],[0,1],[0,-1]]){
        const nx=tr.x+dx, ny=tr.y+dy;
        if(inB(nx,ny)&&railAt(nx,ny)&&!(nx===px&&ny===py)) opts.push([nx,ny]);
      }
      if(!opts.length){
        if(inB(px,py)&&railAt(px,py)&&!(px===tr.x&&py===tr.y)) opts.push([px,py]);
        else { tr.prog=1; continue; }   // 鐵路被拆或孤立,原地待命
      }
      const pick=opts[Math.floor(Math.random()*opts.length)];
      tr.tx=pick[0]; tr.ty=pick[1];
    }
    const fx=wx(tr.x)+(wx(tr.tx)-wx(tr.x))*tr.prog;
    const fz=wz(tr.y)+(wz(tr.ty)-wz(tr.y))*tr.prog;
    const dx=tr.tx-tr.x, dz=tr.ty-tr.y;
    const ry = dx!==0 ? 0 : Math.PI/2;
    const bx = dx ? -Math.sign(dx)*2.1 : 0, bz = dz ? -Math.sign(dz)*2.1 : 0;
    if(n<CAR_CAP){ // 車頭
      _d.position.set(fx,0.52,fz); _d.rotation.set(0,ry,0); _d.scale.set(1.5,1.15,1.05); _d.updateMatrix();
      carMesh.setMatrixAt(n,_d.matrix); wCol(carMesh,n,0x37424e); n++;
    }
    if(n<CAR_CAP){ // 車廂
      _d.position.set(fx+bx,0.5,fz+bz); _d.rotation.set(0,ry,0); _d.scale.set(1.3,1.0,1.0); _d.updateMatrix();
      carMesh.setMatrixAt(n,_d.matrix); wCol(carMesh,n,0x8a5a3a); n++;
    }
  }
  flushInst(carMesh, n);
}
