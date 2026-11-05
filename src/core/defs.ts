// ============================================================
// MicroFactory · 共享定义层（模拟与渲染共用，不依赖 Three.js）
// ============================================================

export type ItemKey =
  | 'iron_ore' | 'copper_ore' | 'iron_ingot' | 'copper_ingot'
  | 'gear' | 'wire' | 'circuit' | 'robot';

export interface ItemDef {
  name: string;
  color: number; // 0xRRGGBB
}

export const ITEMS: Record<ItemKey, ItemDef> = {
  iron_ore:     { name: '铁矿石', color: 0xb0714f },
  copper_ore:   { name: '铜矿石', color: 0x35a08c },
  iron_ingot:   { name: '铁锭',   color: 0xc8cdd8 },
  copper_ingot: { name: '铜锭',   color: 0xe08a4e },
  gear:         { name: '齿轮',   color: 0x9aa3b2 },
  wire:         { name: '铜线',   color: 0xf0a35e },
  circuit:      { name: '电路板', color: 0x58c470 },
  robot:        { name: '微型机器人', color: 0xffb03b },
};

export const ITEM_ORDER: ItemKey[] = [
  'iron_ore', 'copper_ore', 'iron_ingot', 'copper_ingot',
  'gear', 'wire', 'circuit', 'robot',
];

// ---------------- 网格与方向 ----------------
// rot: 0=东(+x) 1=南(+y) 2=西(-x) 3=北(-y)，与世界轴一致（grid y → world z）
export type Dir = 0 | 1 | 2 | 3;
export const DIRS: ReadonlyArray<{ x: number; y: number }> = [
  { x: 1, y: 0 }, { x: 0, y: 1 }, { x: -1, y: 0 }, { x: 0, y: -1 },
];
export const DIR_NAMES = ['东', '南', '西', '北'];

// 相对方位：0=正面(朝向) 1=右侧 2=背面 3=左侧
export const FRONT = 0, RIGHT = 1, BACK = 2, LEFT = 3;
export const relDir = (rot: Dir, rel: number): Dir => ((rot + rel) % 4) as Dir;

// 建筑输入端口（世界方向）查询表：[kind][rot] → Dir[]，惰性构建。
// 物理推挤（tryPushTo/accept）每 tick 高频调用，避免每次 map() 分配新数组。
const _inputPorts = new Map<EntKind, Dir[][]>();
export function inputPortsFor(kind: EntKind, rot: Dir): readonly Dir[] {
  let table = _inputPorts.get(kind);
  if (!table) {
    table = [];
    for (let r = 0; r < 4; r++) {
      table[r] = DEFS[kind].inputs.map(rel => relDir(r as Dir, rel));
    }
    _inputPorts.set(kind, table);
  }
  return table[rot];
}

// ---------------- 物理常量 ----------------
export const GRID = 32;            // 场地 32×32 格
export const CELL = 1;             // 每格 1 米
export const SPACING = 0.25;       // 传送带上物品最小间距（格）
export const BELT_SPEED = 1.5;     // 普通传送带速度（格/秒）
export const TURBO_SPEED = 3.0;    // 高速传送带速度（格/秒）
export const NODE_QUEUE_MAX = 3;   // 分流/合流器内部等待位
export const STORAGE_CAP = 48;     // 仓库容量
export const POOL_CAP = 12;        // 加工机器输入缓存
export const OUT_CAP = 8;          // 加工机器输出缓存
export const EXTRACT_TIME = 2.0;   // 采矿周期（秒）
export const EXTRACT_OUT_CAP = 4;  // 采矿机输出缓存

// ---------------- 建筑定义 ----------------
export type EntKind =
  | 'belt' | 'turbo' | 'splitter' | 'merger' | 'storage'
  | 'extractor' | 'furnace' | 'press' | 'assembler' | 'recycler' | 'export';

export interface EntDef {
  kind: EntKind;
  name: string;
  desc: string;
  inputs: number[];   // 相对方位列表（输入端口）
  outputs: number[];  // 相对方位列表（输出端口）
  cat: 'logistics' | 'production' | 'special';
  hotkey?: string;
}

export const DEFS: Record<EntKind, EntDef> = {
  belt: {
    kind: 'belt', name: '传送带', cat: 'logistics', hotkey: '1',
    desc: '以 1.5 格/秒 运输物品，可拖动连续铺设。',
    inputs: [0, 1, 3], outputs: [0],
  },
  turbo: {
    kind: 'turbo', name: '高速传送带', cat: 'logistics', hotkey: '2',
    desc: '以 3 格/秒 运输物品，适合干线。',
    inputs: [0, 1, 3], outputs: [0],
  },
  splitter: {
    kind: 'splitter', name: '分流器', cat: 'logistics', hotkey: '3',
    desc: '从背面输入，轮流分配到前方/左/右三个出口。',
    inputs: [BACK], outputs: [FRONT, RIGHT, LEFT],
  },
  merger: {
    kind: 'merger', name: '合流器', cat: 'logistics', hotkey: '4',
    desc: '从背面/左/右三路汇入，向前方输出。',
    inputs: [BACK, RIGHT, LEFT], outputs: [FRONT],
  },
  storage: {
    kind: 'storage', name: '仓库', cat: 'logistics', hotkey: '5',
    desc: '缓存 48 件物品，四向进出，先进先出。',
    inputs: [0, 1, 2, 3], outputs: [0, 1, 2, 3],
  },
  extractor: {
    kind: 'extractor', name: '采矿机', cat: 'production', hotkey: '6',
    desc: '只能放在矿脉上，每 2 秒产出 1 矿石。',
    inputs: [], outputs: [FRONT],
  },
  furnace: {
    kind: 'furnace', name: '熔炼炉', cat: 'production', hotkey: '7',
    desc: '背面输入矿石，3 秒熔炼成锭。自动识别铁矿/铜矿。',
    inputs: [BACK], outputs: [FRONT],
  },
  press: {
    kind: 'press', name: '冲压机', cat: 'production', hotkey: '8',
    desc: '背面输入锭：铁锭→齿轮，铜锭→2 铜线，2.5 秒。',
    inputs: [BACK], outputs: [FRONT],
  },
  assembler: {
    kind: 'assembler', name: '装配机', cat: 'production', hotkey: '9',
    desc: '背面+左侧双输入。齿轮+2铜线→电路板；齿轮+电路板→机器人。',
    inputs: [BACK, LEFT], outputs: [FRONT],
  },
  recycler: {
    kind: 'recycler', name: '回收机', cat: 'production',
    desc: '背面/左/右三向输入，把多余成品拆解还原成原料锭：齿轮→铁锭、2铜线→铜锭、电路板→铁锭+铜锭、机器人→2铁锭+铜锭。',
    inputs: [BACK, LEFT, RIGHT], outputs: [FRONT],
  },
  export: {
    kind: 'export', name: '出货终端', cat: 'special', hotkey: '0',
    desc: '任何物品进入即计为出货，四向接收。',
    inputs: [0, 1, 2, 3], outputs: [],
  },
};

export const PALETTE_ORDER: EntKind[] = [
  'belt', 'turbo', 'splitter', 'merger', 'storage',
  'extractor', 'furnace', 'press', 'assembler', 'export',
];

// ---------------- 配方 ----------------
export interface Recipe {
  id: string;
  machine: 'furnace' | 'press' | 'assembler' | 'recycler';
  inputs: Partial<Record<ItemKey, number>>;
  outputs: Partial<Record<ItemKey, number>>;
  time: number;
}

export const RECIPES: Recipe[] = [
  { id: 'smelt_iron',   machine: 'furnace',   inputs: { iron_ore: 1 },              outputs: { iron_ingot: 1 }, time: 3 },
  { id: 'smelt_copper', machine: 'furnace',   inputs: { copper_ore: 1 },            outputs: { copper_ingot: 1 }, time: 3 },
  { id: 'press_gear',   machine: 'press',     inputs: { iron_ingot: 1 },            outputs: { gear: 1 }, time: 2.5 },
  { id: 'press_wire',   machine: 'press',     inputs: { copper_ingot: 1 },          outputs: { wire: 2 }, time: 2.5 },
  { id: 'asm_circuit',  machine: 'assembler', inputs: { gear: 1, wire: 2 },         outputs: { circuit: 1 }, time: 4 },
  { id: 'asm_robot',    machine: 'assembler', inputs: { gear: 1, circuit: 1 },      outputs: { robot: 1 }, time: 5 },
  // 回收机：按制造树完美拆解（略慢于制造，用于消化多余成品、缓解堵塞）
  { id: 'recycle_gear',   machine: 'recycler', inputs: { gear: 1 },   outputs: { iron_ingot: 1 },             time: 3 },
  { id: 'recycle_wire',   machine: 'recycler', inputs: { wire: 2 },   outputs: { copper_ingot: 1 },           time: 3 },
  { id: 'recycle_circuit',machine: 'recycler', inputs: { circuit: 1 },outputs: { iron_ingot: 1, copper_ingot: 1 }, time: 5 },
  { id: 'recycle_robot',  machine: 'recycler', inputs: { robot: 1 },  outputs: { iron_ingot: 2, copper_ingot: 1 }, time: 6 },
];

// 按机型缓存配方列表（热路径：tickProc 每帧对缺料机器都会查询，
// filter 每次都会分配新数组，这里做记忆化；调用方只读不修改返回数组）
const _recipesByKind = new Map<string, Recipe[]>();
export function recipesFor(kind: 'furnace' | 'press' | 'assembler' | 'recycler'): Recipe[] {
  let r = _recipesByKind.get(kind);
  if (!r) {
    r = RECIPES.filter(x => x.machine === kind);
    _recipesByKind.set(kind, r);
  }
  return r;
}

const _recipeById = new Map<string, Recipe | null>();
export function recipeById(id: string): Recipe | null {
  const cached = _recipeById.get(id);
  if (cached !== undefined) return cached;
  const r: Recipe | null = RECIPES.find(x => x.id === id) ?? null;
  _recipeById.set(id, r);
  return r;
}

// ---------------- 矿脉 ----------------
export interface PatchRect { x0: number; y0: number; x1: number; y1: number; ore: 'iron' | 'copper' }
export const PATCHES: PatchRect[] = [
  { x0: 4,  y0: 27, x1: 7,  y1: 29, ore: 'iron' },
  { x0: 10, y0: 27, x1: 12, y1: 29, ore: 'iron' },
  { x0: 24, y0: 27, x1: 26, y1: 29, ore: 'copper' },
];
export const ORE_ITEM: Record<'iron' | 'copper', ItemKey> = { iron: 'iron_ore', copper: 'copper_ore' };

// ---------------- 传送带上物品的局部路径 ----------------
// 局部坐标系：格中心为原点，+x 为传送带朝向；entry: 0=直线(从背面进入) 1=从右侧切入 2=从左侧切入
// 返回相对格中心的偏移 (x,z) 与切线方向 (tx,tz)（局部系）。
export function beltLocalPath(entry: 0 | 1 | 2, p: number): { x: number; z: number; tx: number; tz: number } {
  if (entry === 0) {
    return { x: -0.5 + p, z: 0, tx: 1, tz: 0 };
  }
  if (entry === 1) { // 从右侧切入：圆心 (0.5, 0.5) r=0.5，θ: π → 1.5π
    const th = Math.PI + (Math.PI / 2) * p;
    return {
      x: 0.5 + 0.5 * Math.cos(th), z: 0.5 + 0.5 * Math.sin(th),
      tx: -Math.sin(th), tz: Math.cos(th),
    };
  }
  // 从左侧切入：圆心 (0.5, -0.5) r=0.5，θ: π → 0.5π
  const th = Math.PI - (Math.PI / 2) * p;
  return {
    x: 0.5 + 0.5 * Math.cos(th), z: -0.5 + 0.5 * Math.sin(th),
    tx: Math.sin(th), tz: -Math.cos(th),
  };
}

// 局部 → 世界（格中心 cx,cy；世界 z 轴对应 grid y）
// 渲染层每帧对每个在途物品调用，提供写入目标对象的零分配变体。
export interface BeltWorldResult { x: number; z: number; yaw: number }
export function beltWorldPosInto(
  rot: Dir, entry: 0 | 1 | 2, p: number, wx: number, wz: number,
  out: BeltWorldResult,
): BeltWorldResult {
  // 内联 beltLocalPath，避免中间对象
  let lx: number, lz: number, tx: number, tz: number;
  if (entry === 0) {
    lx = -0.5 + p; lz = 0; tx = 1; tz = 0;
  } else if (entry === 1) { // 从右侧切入：圆心 (0.5, 0.5) r=0.5，θ: π → 1.5π
    const th = Math.PI + (Math.PI / 2) * p;
    lx = 0.5 + 0.5 * Math.cos(th); lz = 0.5 + 0.5 * Math.sin(th);
    tx = -Math.sin(th); tz = Math.cos(th);
  } else { // 从左侧切入：圆心 (0.5, -0.5) r=0.5，θ: π → 0.5π
    const th = Math.PI - (Math.PI / 2) * p;
    lx = 0.5 + 0.5 * Math.cos(th); lz = -0.5 + 0.5 * Math.sin(th);
    tx = Math.sin(th); tz = -Math.cos(th);
  }
  const phi = -rot * Math.PI / 2; // 绕 Y 旋转角：局部 +x → 朝向方向
  const cos = Math.cos(phi), sin = Math.sin(phi);
  out.x = wx + lx * cos + lz * sin;
  out.z = wz - lx * sin + lz * cos;
  const wtx = tx * cos + tz * sin;
  const wtz = -tx * sin + tz * cos;
  out.yaw = Math.atan2(-wtz, wtx);
  return out;
}

export function beltWorldPos(
  rot: Dir, entry: 0 | 1 | 2, p: number, wx: number, wz: number,
): { x: number; z: number; yaw: number } {
  return beltWorldPosInto(rot, entry, p, wx, wz, { x: 0, z: 0, yaw: 0 });
}

export const fmt = (n: number, d = 1) => n.toFixed(d);

// ---------------- 经济系统 ----------------
// 出货单价（资金）
export const ITEM_VALUE: Record<ItemKey, number> = {
  iron_ore: 0, copper_ore: 0,
  iron_ingot: 2, copper_ingot: 2,
  gear: 6, wire: 3, circuit: 15, robot: 45,
};

// 机器升级：等级 1-3，配方速度 = time / SPEED_DIV[level-1]
export const MAX_LEVEL = 3;
export const SPEED_DIV = [1, 1.5, 2.25];
export const UPGRADE_COST: Partial<Record<EntKind, [number, number]>> = {
  // [升到 2 级, 升到 3 级]
  extractor: [120, 300],
  furnace: [80, 200],
  press: [90, 220],
  assembler: [150, 360],
  recycler: [100, 240],
};
export const START_CREDITS = 120;

// ---------------- 订单链 ----------------
export interface OrderDef { item: ItemKey; target: number; reward: number }
export const ORDERS: OrderDef[] = [
  { item: 'robot', target: 8, reward: 220 },
  { item: 'robot', target: 20, reward: 480 },
  { item: 'circuit', target: 40, reward: 520 },
  { item: 'robot', target: 55, reward: 1400 },
  { item: 'circuit', target: 90, reward: 1500 },
  { item: 'robot', target: 120, reward: 2600 },
  { item: 'robot', target: 220, reward: 4400 },
  { item: 'circuit', target: 260, reward: 3900 },
  { item: 'robot', target: 400, reward: 7600 },
];
// 订单链走完后的无限订单：目标 ×1.5，奖励按目标线性增长
export function orderAt(i: number): OrderDef {
  if (i < ORDERS.length) return ORDERS[i];
  const last = ORDERS[ORDERS.length - 1];
  const k = i - ORDERS.length + 1;
  const target = Math.round(last.target * Math.pow(1.5, k) / 10) * 10;
  return { item: 'robot', target, reward: Math.round(target * 19) };
}

