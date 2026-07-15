# 立體模擬城市(SimCity 3D 網頁版)

網頁版 3D 復刻《模擬城市》初代(1989)。單一自包含 HTML,Three.js r128(cdnjs CDN),繁體中文 UI。

## 建置方式
```
python3 build.py   # 將 part1~part5 組裝成 立體模擬城市.html
```
開發時直接用瀏覽器開啟輸出的 HTML(需網路載入 three.js)。

## 檔案架構(組裝順序即依賴順序)
- `part1_head.html` — HTML 結構 + CSS。頂部市政列(資金/人口/日期/RCI 需求柱/速度/功能鈕)、左側工具列、底部訊息帶、街景搖桿、圖層圖例、查詢泡泡、彈窗。深色 slate 面板 + 琥珀色 #ffb742 強調。結尾的 </body></html> 由 build.py 剝除後插入 script。
- `part2_sim.js` — 模擬引擎。64×64 格網 G[x][y],cell={t,lvl,pow,ax,ay,fire,br,v}。T 類型枚舉、BSPEC 建築規格、TOOLS 工具定義。地形生成(河+湖+樹)、place()/doze()、computePower()(BFS 連通元件,火力 cap 220/核能 550)、computeAccess()(道路 3 格 BFS)、computeStats()(污染/犯罪/地價/交通 Float32Array + blur)、simMonth()(生長/需求/財政/火災蔓延/隨機災難)、triggerDisaster()、stepEntities()(龍捲風/巨獸)。
- `part3_render.js` — Three.js 渲染。InstancedMesh(ground/box/cone/cyl/car,容量 34000/9000/3000/140)。**重要:使用自訂 ShaderMaterial(instMat)做逐實例顏色 aCol + 光照 + 霧**,因 r128 的 setColorAt+Lambert 在部分 GPU 會渲染全黑,勿改回。pBox/pCone/pCyl + wCol/flushInst 輔助、rebuildGround()(含 overlay 熱度圖)、rebuildCity()(drawRes/drawCom/drawInd/drawBig 等低多邊形建築)、車流與火車 refreshCars()/stepCars()(火車=車頭+車廂兩實例,共用 carMesh 容量)、龍捲風/巨獸模型。
- `part4_input.js` — 雙視角。bird 軌道相機(拖曳平移 grab 式、右鍵/Ctrl 旋轉、滾輪/雙指縮放、螢幕 ⟲⟳＋− 鈕)、walk 第一人稱(WASD+拖曳環顧+Shift 跑+手機搖桿)、pickTile() 射線選格、paintAt() 施工、walkable() 通行、toggleView()(V 鍵,街景隱藏工具列、純觀光不可施工)。
- `part5_ui.js` — buildToolbar()、updateHUD()、toast()、showQuery()、預算/圖層/災難/新城市彈窗、sfx() WebAudio 音效、主迴圈 loop()(SPD_MS=[∞,2400,1100,380] 月節拍)、boot()。

## 遊戲系統
RCI 分區 lvl 0-5 自動生長(需供電+3 格內道路+需求>0);電網 BFS 供電依容量;鐵路(可達性同道路,交通壅塞×0.3、免交通污染,維護 0.5/格 vs 道路 0.18,火車動畫);跨河橋(道路/鐵路/電線水上 5 倍造價,c.br 旗標,拆除還原成水);稅率+交通/警察/消防撥款(月結,交通撥款<100% 時道路/鐵路每月 (1−撥款)×1.2% 機率劣化成瓦礫);六災難(火/洪/龍捲風/地震/巨獸/空難);時間流速 4 段;人口里程碑;查詢工具;圖層 overlay(power/pollution/crime/landv/traffic);地價價位檔 c.tier(0 低/1 中/2 高,landTier() 門檻 14/30)——lvl 管建物規模、tier 管風格,住宅已有 3 檔×3 變體造型(part3 drawRes),tier 只在 simMonth 升降級時取樣避免每月抖動。

## 已修過的坑
1. r128 InstancedMesh setColorAt+Lambert → 全黑。已改自訂 shader(見 part3)。
2. 大建築被災難打殘後 ax=-1,doze/ignite 需防越界(已加防護)。
3. 橋梁格 c.br:所有破壞路徑(doze/龍捲風/巨獸)都要還原成 T.WATER。
4. 電線⇄道路/鐵路交叉用 c.wr 旗標疊加(t 不變),所有破壞路徑(doze/龍捲風/巨獸/地震/洪水)都要清 wr;導電判定(computePower 的 conductive、part3 的 condAt)都要含 wr。
4b. 平交道(道路⇄鐵路)用 c.rl 旗標,統一存為 t=ROAD+rl;火車路徑判定用 part3 的 railAt()(含 rl),破壞路徑同樣都要清 rl;wr 與 rl 互斥(不允許三重疊加);存檔 bitmask 第 4 位。
5. computePower() 必須在 place/doze/newCity/triggerDisaster 後即時呼叫,不能只靠 simMonth——否則暫停時蓋電線永遠不通電。
6. stepWalk 的右向量 (rx,rz)=(-fz,fx) 是正確的,位移用 rx*mx(勿再加負號,否則 A/D 反向,手機搖桿同路徑)。
7. Windows 下組建要 `python -X utf8 build.py`(cp950 會炸)。

## 存檔系統
localStorage key `simcity3d:save`,`SAVE_VER` 版本檢查。serializeCity() 存 city(排除 Float32Array 圖層)+ 4096 格 cell 精簡陣列(br/wr/rl 打包成 bitmask,第 8 欄為 tier);loadCity() 還原後以 computePower()+computeStats() 重建衍生狀態,舊檔(7 欄)載入後以地價補採樣 tier,SAVE_VER 不需升版。自動存檔時機:年度結算、pagehide、visibilitychange hidden、建新城市、匯入後。匯出/匯入 JSON 在新城市彈窗。

## 待辦 / 可改進
- 尚未在真機完整驗證:街景碰撞手感、手機效能、音效觸發。
- 可加:日夜循環、更多建築變體、交通壅塞回饋到生長/地價、核電廠熔毀事件、對外市場 ext 成長上限。
