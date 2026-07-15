# -*- coding: utf-8 -*-
"""產生一張「塞滿且符合合理城市規劃」的 64x64 存檔 JSON。
用法: python -X utf8 gen_full_city.py  → 輸出 full_city_save.json
在遊戲「新城市」彈窗用「匯入 JSON」載入。
"""
import json, random, time

N = 64
random.seed(42)

# T 枚舉(與 part2_sim.js 一致)
GRASS, WATER, TREE, ROAD, RAIL, WIRE = 0, 1, 2, 3, 4, 5
RES, COM, IND, PARK = 6, 7, 8, 9
POLICE, FIRESTA, COAL, NUKE, STADIUM, PORT, AIRPORT = 10, 11, 12, 13, 14, 15, 16

BIGW = {POLICE: 2, FIRESTA: 2, COAL: 3, NUKE: 3, STADIUM: 4, PORT: 3, AIRPORT: 5}
CAP = {COAL: 220, NUKE: 550}

# cell = [t, lvl, ax, ay, bitmask(br|wr<<1|rl<<2), fire, v]
grid = [[[GRASS, 0, -1, -1, 0, 0, 0.0] for _ in range(N)] for _ in range(N)]

def cell(x, y): return grid[x][y]

def setc(x, y, t, lvl=0, ax=None, ay=None, br=False, wr=False, rl=False):
    grid[x][y] = [t, lvl, x if ax is None else ax, y if ay is None else ay,
                  (1 if br else 0) | (2 if wr else 0) | (4 if rl else 0), 0, 0.0]

ROADS = [0, 7, 14, 21, 28, 35, 42, 49, 56, 63]      # 道路線
WIRE_ROWS = [g + 3 for g in ROADS[:-1]]              # 3,10,...,59 每排街廓中線
TRUNK_X = 4                                          # 縱向電力主幹
RAIL_X = 53                                          # 縱貫鐵路(工業區)
RIVER = (30, 32)                                     # 河流欄位 30-32
BRIDGES = {0, 14, 28, 42, 56, 63}                    # 有橋的道路列

# ── 1. 地形:河流 + 湖泊 ──
for y in range(N):
    for x in range(RIVER[0], RIVER[1] + 1):
        setc(x, y, WATER, ax=-1, ay=-1)
for x in range(N):
    for y in range(N):
        if (x - 17.5) ** 2 + (y - 17.5) ** 2 < 3.2 ** 2:
            setc(x, y, WATER, ax=-1, ay=-1)

# ── 2. 分區填充(街廓內部 6x6)──
# bx: 0-2 住宅 | 3 商業 | 4 河濱綠帶 | 5 商業 | 6 住宅 | 7-8 工業
DISTRICT = {0: RES, 1: RES, 2: RES, 3: COM, 4: PARK, 5: COM, 6: RES, 7: IND, 8: IND}

def zone_lvl(t, bx, by):
    if t == COM:
        base = 5 if by in (3, 4, 5) else 3        # CBD 中段最高
        return max(3, min(5, base + random.choice([-1, 0, 0])))
    if t == RES:
        base = 4 if bx in (2, 3) or bx == 6 else 3
        return max(2, min(5, base + random.choice([-1, 0, 0, 1])))
    return max(2, min(4, 3 + random.choice([-1, 0, 0, 1])))   # IND

for bx in range(9):
    for by in range(9):
        gx, gy = ROADS[bx], ROADS[by]
        t = DISTRICT[bx]
        pocket = (t == RES and (bx + by) % 3 == 0)   # 每三個住宅街廓一座口袋公園
        for x in range(gx + 1, gx + 7):
            for y in range(gy + 1, gy + 7):
                if cell(x, y)[0] == WATER:
                    continue
                if t == PARK:                        # 河濱綠帶:公園夾樹
                    setc(x, y, TREE if y % 3 == 0 else PARK)
                elif pocket and x >= gx + 5 and y >= gy + 5:
                    setc(x, y, PARK)
                else:
                    setc(x, y, t, lvl=zone_lvl(t, bx, by))
# 湖畔公園環(街廓 2,2 內非水域全改公園)
for x in range(15, 21):
    for y in range(15, 21):
        if cell(x, y)[0] != WATER:
            setc(x, y, PARK)

# ── 3. 道路格網(河上依 BRIDGES 架橋,其餘斷路)──
for r in ROADS:
    for i in range(N):
        for (x, y) in ((i, r), (r, i)):
            if cell(x, y)[0] == WATER:
                if y in BRIDGES and RIVER[0] <= x <= RIVER[1]:
                    setc(x, y, ROAD, br=True)
            else:
                setc(x, y, ROAD)

# ── 4. 鐵路(縱貫工業區,道路交叉=平交道 rl)──
for y in range(1, 63):
    if cell(RAIL_X, y)[0] == ROAD:
        setc(RAIL_X, y, ROAD, rl=True)
    else:
        setc(RAIL_X, y, RAIL)

# ── 5. 電網(橫向電線列 + 縱向主幹;道路/鐵路交叉 wr、水上 br)──
def lay_wire(x, y):
    t = cell(x, y)[0]
    if t == ROAD and not (cell(x, y)[4] & 5):        # 不與橋/平交道三重疊加
        setc(x, y, ROAD, wr=True)
    elif t == RAIL:
        setc(x, y, RAIL, wr=True)
    elif t == WATER:
        setc(x, y, WIRE, br=True)
    else:
        setc(x, y, WIRE)

for wy in WIRE_ROWS:
    for x in range(N):
        lay_wire(x, wy)
for y in range(WIRE_ROWS[0], WIRE_ROWS[-1] + 1):
    lay_wire(TRUNK_X, y)

# ── 6. 大型建築與公共設施 ──
def build(t, ax, ay):
    w = BIGW[t]
    for i in range(w):
        for j in range(w):
            assert cell(ax + i, ay + j)[0] != WATER, (t, ax, ay)
            setc(ax + i, ay + j, t, ax=ax, ay=ay)

build(AIRPORT, 57, 1)                                 # 機場:東北角工業區
build(STADIUM, 16, 30)                                # 體育場:西側住宅區中央
build(PORT, 33, 57)                                   # 海港:河東岸南端
for ax, ay in [(57, 58), (57, 51), (57, 44), (50, 51), (50, 44)]:
    build(NUKE, ax, ay)                               # 核電廠:東南工業角
build(COAL, 50, 58)                                   # 火力廠:同區
for ax, ay in [(10, 10), (10, 31), (10, 51), (24, 24), (38, 17), (45, 38), (51, 24)]:
    build(POLICE, ax, ay)
for ax, ay in [(17, 10), (3, 38), (24, 45), (38, 45), (45, 10), (58, 38)]:
    build(FIRESTA, ax, ay)

# ── 7. 驗證:電力容量 vs 用電格數(電廠 BFS 連通性由遊戲重算,這裡驗算總量)──
consumers = cap = 0
anchors = set()
for x in range(N):
    for y in range(N):
        t = grid[x][y][0]
        if t in (RES, COM, IND) or t in BIGW:
            consumers += 1
        if t in CAP and (grid[x][y][2], grid[x][y][3]) == (x, y) and (x, y) not in anchors:
            anchors.add((x, y)); cap += CAP[t]
assert cap > consumers + 100, f'電力不足: cap={cap} consumers={consumers}'

# 主幹連通性簡易 BFS(conductive = WIRE / wr / 分區 / 大建築)
def conductive(x, y):
    t, m = grid[x][y][0], grid[x][y][4]
    return t == WIRE or (m & 2) or t in (RES, COM, IND) or t in BIGW
seen, q = set(), [(50, 58)]
while q:
    x, y = q.pop()
    if (x, y) in seen or not conductive(x, y): continue
    seen.add((x, y))
    for dx, dy in ((1,0),(-1,0),(0,1),(0,-1)):
        if 0 <= x+dx < N and 0 <= y+dy < N: q.append((x+dx, y+dy))
unpowered = sum(1 for x in range(N) for y in range(N)
                if (grid[x][y][0] in (RES, COM, IND) or grid[x][y][0] in BIGW)
                and (x, y) not in seen)
assert unpowered == 0, f'{unpowered} 格未連上電網'

# ── 8. 城市統計與存檔物件 ──
res_sum = com_sum = ind_sum = 0
for x in range(N):
    for y in range(N):
        t, lvl = grid[x][y][0], grid[x][y][1]
        if t == RES: res_sum += lvl
        elif t == COM: com_sum += lvl
        elif t == IND: ind_sum += lvl
        grid[x][y][6] = round(random.random(), 3)

pop, ext, tax = res_sum * 22, 250, 7
jobs, tax_pen = com_sum + ind_sum, 0.0
clamp = lambda v: max(-1, min(1, v))
city = {
    'name': '藍圖市', 'funds': 75000, 'tax': tax,
    'year': 1978, 'month': 3,
    'pop': pop, 'resSum': res_sum, 'comSum': com_sum, 'indSum': ind_sum,
    'demR': clamp(((jobs + 14) * 1.35 - res_sum) / 55 + 0.12),
    'demC': clamp((res_sum * 0.62 - com_sum) / 45),
    'demI': clamp((ext + res_sum * 0.42 - ind_sum) / 50),
    'ext': ext,
    'fundRoad': 1, 'fundPolice': 1, 'fundFire': 1,
    'lastIncome': 0, 'lastExpense': 0,
    'autoDisaster': True,
    'milestones': {str(m): True for m in (500, 2000, 10000, 30000, 60000) if pop >= m},
    'powerOK': True,
    'title': '大都會' if pop >= 60000 else '都會',
}
cells = [grid[x][y] for x in range(N) for y in range(N)]
save = {'ver': 1, 'savedAt': int(time.time() * 1000), 'city': city, 'cells': cells}

with open('full_city_save.json', 'w', encoding='utf-8') as f:
    json.dump(save, f, ensure_ascii=False, separators=(',', ':'))
print(f'OK  人口={pop:,}  住宅={res_sum} 商業={com_sum} 工業={ind_sum}')
print(f'    用電格={consumers}  電力容量={cap}  全數通電 ✓')
