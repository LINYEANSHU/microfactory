// ============================================================
// MicroFactory · 模拟引擎（纯逻辑，与渲染完全分离）
// 固定时间步长驱动；所有物品流动遵循守恒，由 ledger 记账。
// ============================================================
import {
  DIRS, DEFS, ItemKey, Dir, EntKind, Recipe, recipesFor, recipeById, inputPortsFor, ORE_ITEM,
  SPACING, BELT_SPEED, TURBO_SPEED, NODE_QUEUE_MAX, STORAGE_CAP, POOL_CAP,
  OUT_CAP, EXTRACT_TIME, EXTRACT_OUT_CAP, GRID, PATCHES, relDir,
  FRONT, RIGHT, BACK, LEFT,
  ITEM_VALUE, UPGRADE_COST, MAX_LEVEL, SPEED_DIV, START_CREDITS, orderAt,
  ITEM_ORDER, ITEMS, POWER_SUPPLY, POWER_USE, FRONTIER_TOOLS, FREIGHT_CHANNELS, FREIGHT_SECONDS,
  type Ore,
} from '../core/defs';
import {
  CAMPAIGN_GOALS, DEFAULT_SEED, makeRegion, REGIONS, REGION_IDS, regionIdAt, tileKey, WORLD_GRID,
  type Campaign, type CampaignMode, type Region, type RegionId,
} from './regions';

const POOL_PER_TYPE = 6; // 输入池中同种物品的上限
const RUSH_CONTRACTS = [
  { item: 'robot', target: 6, duration: 180, reward: 330 },
  { item: 'gear', target: 18, duration: 120, reward: 280 },
  { item: 'circuit', target: 12, duration: 150, reward: 420 },
] as const;

interface ContractRun {
  base: number;
  deadline: number;
}

// 提取器配方（按矿种共享的常量对象）：每台采矿机每 2 秒完成一次提取，
// 若每次 new 会造成持续的小对象分配；配方只读不写，可安全共享。
const ORES = Object.keys(ORE_ITEM) as Ore[];
const EXTRACT_RECIPES = Object.fromEntries(ORES.map(ore => [
  ore, { id: 'extract', machine: 'furnace', inputs: {}, outputs: { [ORE_ITEM[ore]]: 1 }, time: EXTRACT_TIME },
])) as Record<Ore, Recipe>;
export const GENERATOR_COST = 75;

export type Entry = 0 | 1 | 2; // 0 直线 / 1 右侧切入 / 2 左侧切入
export interface BeltItem { ty: ItemKey; p: number; entry: Entry }
export type MachineState = 'idle' | 'working' | 'starved' | 'blocked' | 'unpowered';

export interface Ent {
  id: number;
  kind: EntKind;
  x: number; y: number; rot: Dir;
  // 传送带
  items?: BeltItem[];
  // 节点（分流/合流/仓库）
  queue?: ItemKey[];
  rr?: number;
  // 加工机器
  pool?: Map<ItemKey, number>;
  out?: Map<ItemKey, number>;
  recipe?: Recipe | null;
  progress?: number;
  ore?: Ore;
  selectedRecipe?: string;
  filter?: ItemKey;
  channel?: number;
  readyAt?: number;
  powered?: boolean;
  state?: MachineState;
  secW?: number; secS?: number; secB?: number; // 本秒内各状态累计
  emaW?: number; emaS?: number; emaB?: number; // 利用率/饥饿/堵塞 指数平滑
  // 出货终端
  counts?: Map<ItemKey, number>;
  active?: number; // 动画激励 0..1（完成/出货时置 1，随时间衰减）
  // 加工机器等级（1-3，升级后更快）
  level?: number;
}

export type Count = Partial<Record<ItemKey, number>>;

const COUNT_TEMPLATE = Object.fromEntries(ITEM_ORDER.map(item => [item, 0])) as Record<ItemKey, number>;
const emptyCount = () => ({ ...COUNT_TEMPLATE });

const mapTotal = (m?: Map<ItemKey, number>): number => {
  if (!m) return 0;
  let t = 0;
  for (const v of m.values()) t += v;
  return t;
};

export interface SaveData {
  v: number;
  time: number;
  ledger: { produced: Count; consumed: Count; exported: Count; destroyed: Count };
  ents: SerEnt[];
  goals?: string[];
  credits?: number;
  orderIdx?: number;
  orderBase?: number;
  contract?: { index: number; active: ContractRun | null };
  frontier?: {
    campaign: Campaign;
    regions: RegionId[];
    restoredTiles: number[];
    freightDeliveries: number;
    nextAutomaticContract: number;
  };
  // 历史曲线采样点 [t, credits, totalExported]，10 秒一个点（可选，旧存档无此字段）
  hist?: Array<[number, number, number]>;
}

export interface SerEnt { k: EntKind; x: number; y: number; r: Dir; d?: any }

export class Sim {
  W = GRID; H = GRID;
  cells: (Ent | null)[];
  belts: Ent[] = [];
  nodes: Ent[] = [];
  procs: Ent[] = [];
  terminals: Ent[] = [];
  time = 0;
  private nextId = 1;
  private secAcc = 0;
  ringIdx = 0;
  exportRing: Record<ItemKey, number>[] = [];
  ledger = { produced: emptyCount(), consumed: emptyCount(), exported: emptyCount(), destroyed: emptyCount() } as {
    produced: Record<ItemKey, number>; consumed: Record<ItemKey, number>;
    exported: Record<ItemKey, number>; destroyed: Record<ItemKey, number>;
  };
  totalExported = 0;
  // 历史曲线（每 10 秒采样：时间/资金/累计出货），最长 360 点 = 1 小时窗口
  hist: { t: number; credits: number; exported: number }[] = [];
  private histAcc = 0;
  goals = new Set<string>();
  credits = START_CREDITS;
  orderIdx = 0;
  orderBase = 0;
  private contractIndex = 0;
  private activeContract: ContractRun | null = null;
  campaign: Campaign | null = null;
  openRegions: Region[] = [];
  private opened = new Set<RegionId>();
  private scars = new Set<number>();
  restoredTiles = new Set<number>();
  freightDeliveries = 0;
  private nextAutomaticContract = 0;
  generators: Ent[] = [];
  private freightReceivers: Ent[][] = Array.from({ length: FREIGHT_CHANNELS }, () => []);
  private remainingPower = new Map<RegionId, number>();
  private powerSupply = new Map<RegionId, number>();
  private powerDemand = new Map<RegionId, number>();
  onExport: ((ty: ItemKey, x: number, y: number) => void) | null = null;
  onProduce: ((ty: ItemKey) => void) | null = null;
  onOrderDone: ((orderIdx: number, reward: number, item: ItemKey, target: number) => void) | null = null;
  onContractEnd: ((reward: number) => void) | null = null;
  private patches = new Uint8Array(WORLD_GRID * WORLD_GRID);

  constructor() {
    this.cells = new Array(this.W * this.H).fill(null);
    this.addRegion('harbor');
    for (let i = 0; i < 60; i++) this.exportRing.push(emptyCount());
  }

  idx(x: number, y: number) { return y * this.W + x; }
  inBounds(x: number, y: number) {
    return x >= 0 && y >= 0 && x < this.W && y < this.H
      && (this.openRegions.length === 1 || this.openRegions.length === REGION_IDS.length || this.opened.has(regionIdAt(x, y)));
  }
  get(x: number, y: number): Ent | null { return this.inBounds(x, y) ? this.cells[this.idx(x, y)] : null; }
  oreAt(x: number, y: number): Ore | null {
    if (!this.inBounds(x, y)) return null;
    return ORES[this.patches[tileKey(x, y)] - 1] ?? null;
  }

  chooseCampaign(mode: CampaignMode, seed = DEFAULT_SEED): boolean {
    if (this.campaign || (mode !== 'research' && mode !== 'corporate')
      || !Number.isInteger(seed) || seed < 0 || seed > 0xffffffff) return false;
    this.campaign = { mode, seed, stage: 'charter' };
    return true;
  }

  hasRegion(id: RegionId): boolean { return this.opened.has(id); }

  canUnlockRegion(id: RegionId): boolean {
    const def = REGIONS[id];
    return !!this.campaign && !!def?.parent && this.opened.has(def.parent) && !this.opened.has(id)
      && this.credits >= def.credits
      && (!def.shipment || this.ledger.exported[def.shipment[0]] >= def.shipment[1]);
  }

  unlockRegion(id: RegionId): boolean {
    if (!this.canUnlockRegion(id)) return false;
    this.credits -= REGIONS[id].credits;
    this.addRegion(id);
    return true;
  }

  private addRegion(id: RegionId) {
    const area = makeRegion(id, this.campaign?.seed ?? DEFAULT_SEED);
    const width = Math.max(this.W, area.x + GRID), height = Math.max(this.H, area.y + GRID);
    if (width !== this.W || height !== this.H) {
      const cells: (Ent | null)[] = new Array(width * height).fill(null);
      for (let y = 0; y < this.H; y++) for (let x = 0; x < this.W; x++) {
        cells[y * width + x] = this.cells[this.idx(x, y)];
      }
      this.W = width; this.H = height; this.cells = cells;
    }
    for (const p of area.patches) {
      const v = ORES.indexOf(p.ore) + 1;
      for (let y = p.y0; y <= p.y1; y++) for (let x = p.x0; x <= p.x1; x++) this.patches[tileKey(x, y)] = v;
    }
    for (const site of area.scarTiles) this.scars.add(tileKey(site.x, site.y));
    this.openRegions.push(area);
    this.opened.add(id);
  }

  isRestorationSite(x: number, y: number) { return this.inBounds(x, y) && this.scars.has(tileKey(x, y)); }

  campaignGoal() {
    const run = this.campaign;
    if (!run || run.stage === 'complete') return null;
    const goal = CAMPAIGN_GOALS[run.mode][run.stage];
    const delivered = this.ledger.exported[goal.shipment[0]];
    const retainedProfit = Math.max(0, this.credits - START_CREDITS);
    const ready = this.credits >= goal.credits && delivered >= goal.shipment[1] && retainedProfit >= goal.profit
      && this.orderIdx >= goal.orders && this.restoredTiles.size >= goal.restored
      && this.freightDeliveries >= goal.freight && (!goal.skyreach || this.hasRegion('skyreach'));
    return { ...goal, delivered, retainedProfit, ready };
  }

  advanceCampaign(): boolean {
    const goal = this.campaignGoal();
    if (!goal?.ready || !this.campaign) return false;
    this.credits -= goal.credits;
    this.campaign.stage = this.campaign.stage === 'charter' ? 'commission' : 'complete';
    return true;
  }

  powerStatus(id: RegionId) {
    return { supply: this.powerSupply.get(id) ?? 0, demand: this.powerDemand.get(id) ?? 0 };
  }

  private refreshPower() {
    this.powerSupply.clear();
    this.powerDemand.clear();
    this.remainingPower.clear();
    for (const e of this.generators) {
      const id = regionIdAt(e.x, e.y);
      const supply = (this.powerSupply.get(id) ?? 0) + POWER_SUPPLY;
      this.powerSupply.set(id, supply);
      this.remainingPower.set(id, supply);
    }
    const consumers = this.procs.filter(e => POWER_USE[e.kind])
      .sort((a, b) => tileKey(a.x, a.y) - tileKey(b.x, b.y));
    for (const e of consumers) {
      const use = POWER_USE[e.kind]!;
      const id = regionIdAt(e.x, e.y);
      const remaining = this.remainingPower.get(id) ?? 0;
      this.powerDemand.set(id, (this.powerDemand.get(id) ?? 0) + use);
      e.powered = remaining >= use;
      if (e.powered) this.remainingPower.set(id, remaining - use);
    }
  }

  // ---------------- 建造 ----------------
  canPlace(kind: EntKind, x: number, y: number): boolean {
    if (!Number.isInteger(x) || !Number.isInteger(y) || !this.inBounds(x, y)) return false;
    if (FRONTIER_TOOLS.includes(kind) && this.openRegions.length < 2) return false;
    if (kind === 'generator' && this.credits < GENERATOR_COST) return false;
    const cur = this.cells[this.idx(x, y)];
    if (kind === 'belt' || kind === 'turbo') {
      return cur === null || cur.kind === 'belt' || cur.kind === 'turbo';
    }
    if (cur !== null) return false;
    if (kind === 'extractor') return this.oreAt(x, y) !== null;
    if (kind === 'cultivator') return this.isRestorationSite(x, y);
    return true;
  }

  place(kind: EntKind, x: number, y: number, rot: Dir): Ent {
    if (!this.canPlace(kind, x, y)) throw new Error(`cannot place ${kind} at ${x},${y}`);
    const cur = kind === 'belt' || kind === 'turbo' ? this.cells[this.idx(x, y)] : null;
    if (cur && (cur.kind === 'belt' || cur.kind === 'turbo')) {
      // 传送带替换（改向/普通↔高速）：保留物品，旧实体必须从列表移除
      this.cells[this.idx(x, y)] = null;
      this.removeFromLists(cur);
      const items = cur.items!;
      const e = this.makeEnt(kind, x, y, rot);
      e.items = items;
      this.install(e);
      return e;
    }
    const e = this.makeEnt(kind, x, y, rot);
    if (kind === 'generator') this.credits -= GENERATOR_COST;
    this.install(e);
    return e;
  }

  private makeEnt(kind: EntKind, x: number, y: number, rot: Dir): Ent {
    const e: Ent = { id: this.nextId++, kind, x, y, rot, active: 0 };
    if (kind === 'belt' || kind === 'turbo') e.items = [];
    if (DEFS[kind].cat === 'logistics' && !e.items) { e.queue = []; e.rr = 0; }
    if (kind === 'sorter') e.filter = 'slag';
    if (kind === 'freight_send' || kind === 'freight_receive') { e.channel = 0; e.readyAt = 0; }
    if (kind === 'extractor' || recipesFor(kind).length > 0) {
      e.pool = new Map(); e.out = new Map(); e.recipe = null; e.progress = 0;
      e.state = 'idle'; e.secW = 0; e.secS = 0; e.secB = 0; e.emaW = 0; e.emaS = 0; e.emaB = 0;
      e.level = 1;
    }
    if (kind === 'extractor') e.ore = this.oreAt(x, y) ?? 'iron';
    if (kind === 'export') e.counts = new Map();
    return e;
  }

  private install(e: Ent) {
    this.cells[this.idx(e.x, e.y)] = e;
    this.categorize(e);
    if (e.kind === 'generator' || POWER_USE[e.kind]) this.refreshPower();
  }

  private categorize(e: Ent) {
    if (e.kind === 'belt' || e.kind === 'turbo') this.belts.push(e);
    else if (e.queue) {
      this.nodes.push(e);
      if (e.kind === 'freight_receive') this.freightReceivers[e.channel!].push(e);
    }
    else if (e.kind === 'export') this.terminals.push(e);
    else if (e.kind === 'generator') this.generators.push(e);
    else this.procs.push(e);
  }

  // 拆除（物品记入 destroyed）
  remove(x: number, y: number): boolean {
    const e = this.get(x, y);
    if (!e) return false;
    if (e.items) for (const it of e.items) this.ledger.destroyed[it.ty]++;
    if (e.queue) for (const ty of e.queue) this.ledger.destroyed[ty]++;
    if (e.pool) for (const [ty, n] of e.pool) this.ledger.destroyed[ty] += n;
    if (e.out) for (const [ty, n] of e.out) this.ledger.destroyed[ty] += n;
    this.cells[this.idx(x, y)] = null;
    this.removeFromLists(e);
    return true;
  }

  // 搬移：取出并保留全部数据
  extractEnt(x: number, y: number): SerEnt | null {
    const e = this.get(x, y);
    if (!e) return null;
    const data = this.serializeEnt(e);
    this.cells[this.idx(x, y)] = null;
    this.removeFromLists(e);
    return data;
  }

  insertEnt(s: SerEnt): boolean {
    if (!s || typeof s.k !== 'string' || !Object.prototype.hasOwnProperty.call(DEFS, s.k)) return false;
    if (!this.canInsert(s.k, s.x, s.y)) return false;
    if (!Number.isInteger(s.r) || s.r < 0 || s.r > 3) return false;
    const e = this.makeEnt(s.k, s.x, s.y, s.r);
    const d = s.d || {};
    if (e.items) e.items = (d.items || []).map((a: any) => ({ ty: a[0], p: a[1], entry: a[2] }));
    if (e.queue) { e.queue = [...(d.queue || [])]; e.rr = d.rr || 0; }
    if ((e.kind === 'sorter' || e.kind === 'storage') && Object.hasOwn(ITEMS, d.filter)) e.filter = d.filter;
    if (e.channel !== undefined) {
      if (Number.isInteger(d.channel) && d.channel >= 0 && d.channel < FREIGHT_CHANNELS) e.channel = d.channel;
      if (Number.isFinite(d.readyAt) && d.readyAt >= 0) e.readyAt = d.readyAt;
    }
    if (e.pool) {
      e.pool = new Map((d.pool || []).map((a: any) => [a[0], a[1]]));
      e.out = new Map((d.out || []).map((a: any) => [a[0], a[1]]));
      e.progress = d.prog || 0;
      e.level = Math.min(MAX_LEVEL, Math.max(1, d.lvl || 1));
      const recipe = typeof d.rec === 'string' ? recipeById(d.rec) : null;
      e.recipe = recipe?.machine === e.kind ? recipe : null;
      if (e.kind === 'advanced_assembler' && typeof d.selectedRecipe === 'string'
        && recipeById(d.selectedRecipe)?.machine === e.kind) e.selectedRecipe = d.selectedRecipe;
      if (e.kind === 'extractor') {
        const patchOre = this.oreAt(s.x, s.y) ?? 'iron';
        e.ore = patchOre;
        if (d.rec === 'extract' && (!d.ore || d.ore === patchOre)) e.recipe = EXTRACT_RECIPES[patchOre];
      }
      if (!e.recipe) e.progress = 0;
    }
    if (e.counts) e.counts = new Map((d.counts || []).map((a: any) => [a[0], a[1]]));
    this.install(e);
    return true;
  }

  canInsert(kind: EntKind, x: number, y: number): boolean {
    return Number.isInteger(x) && Number.isInteger(y) && this.inBounds(x, y)
      && this.cells[this.idx(x, y)] === null
      && (kind !== 'extractor' || !!this.oreAt(x, y))
      && (kind !== 'cultivator' || this.isRestorationSite(x, y))
      && (!FRONTIER_TOOLS.includes(kind) || this.openRegions.length >= 2);
  }

  private removeFromLists(e: Ent) {
    let arr: Ent[] | null = null;
    if (e.kind === 'belt' || e.kind === 'turbo') arr = this.belts;
    else if (e.queue) arr = this.nodes;
    else if (e.kind === 'export') arr = this.terminals;
    else if (e.kind === 'generator') arr = this.generators;
    else arr = this.procs;
    const i = arr.indexOf(e);
    if (i >= 0) arr.splice(i, 1);
    if (e.kind === 'freight_receive') {
      const group = this.freightReceivers[e.channel!];
      group.splice(group.indexOf(e), 1);
    }
    if (e.kind === 'generator' || POWER_USE[e.kind]) this.refreshPower();
  }

  setItemFilter(e: Ent, item?: ItemKey): boolean {
    if (this.get(e.x, e.y) !== e || !this.hasRegion('fernwash')
      || (e.kind !== 'sorter' && e.kind !== 'storage')
      || (item === undefined ? e.kind === 'sorter' : !Object.hasOwn(ITEMS, item))) return false;
    e.filter = item;
    return true;
  }

  setFreightChannel(e: Ent, channel: number): boolean {
    if (e.channel === undefined || this.get(e.x, e.y) !== e
      || !Number.isInteger(channel) || channel < 0 || channel >= FREIGHT_CHANNELS) return false;
    if (e.channel !== channel && e.kind === 'freight_receive') {
      const oldGroup = this.freightReceivers[e.channel];
      oldGroup.splice(oldGroup.indexOf(e), 1);
      this.freightReceivers[channel].push(e);
    }
    e.channel = channel;
    return true;
  }

  freightLinks(e: Ent): number {
    if (e.kind !== 'freight_send' || e.channel === undefined) return 0;
    const origin = regionIdAt(e.x, e.y);
    return this.freightReceivers[e.channel].filter(station => regionIdAt(station.x, station.y) !== origin).length;
  }

  setAdvancedRecipe(e: Ent, id: string): boolean {
    if (e.kind !== 'advanced_assembler' || this.get(e.x, e.y) !== e || !this.availableRecipes(e).some(r => r.id === id)) return false;
    if (id !== e.selectedRecipe && (e.recipe || e.pool?.size)) return false;
    e.selectedRecipe = id;
    return true;
  }

  availableRecipes(e: Ent): Recipe[] {
    const all = recipesFor(e.kind);
    if (e.kind !== 'advanced_assembler' || !this.campaign) return all;
    const { mode, stage } = this.campaign;
    const initial = mode === 'research' ? 'asm_probe' : 'asm_core';
    const final = mode === 'research' ? 'asm_payload' : 'asm_dispatch';
    return all.filter(recipe => recipe.id === initial || (stage !== 'charter' && recipe.id === final));
  }

  // ---------------- 核心：向相邻格推物品 ----------------
  // travel 为物品进入目标格时的行进方向；返回是否成功
  tryPushTo(sx: number, sy: number, travel: Dir, ty: ItemKey): boolean {
    const nx = sx + DIRS[travel].x, ny = sy + DIRS[travel].y;
    if (!this.inBounds(nx, ny)) return false;
    const t = this.cells[this.idx(nx, ny)];
    if (!t) return false;
    return this.accept(t, travel, ty, sx, sy);
  }

  private accept(t: Ent, travel: Dir, ty: ItemKey, sx: number, sy: number): boolean {
    switch (t.kind) {
      case 'belt':
      case 'turbo': {
        // 传送带指向来源格 → 拒绝（对撞/回卷）
        const bd = DIRS[t.rot];
        if (bd.x === sx - t.x && bd.y === sy - t.y) return false;
        const items = t.items!;
        if (items.length > 0 && items[items.length - 1].p < SPACING) return false;
        let entry: Entry = 0;
        if (travel === ((t.rot + 1) % 4)) entry = 2;       // 从左侧切入
        else if (travel === ((t.rot + 3) % 4)) entry = 1;  // 从右侧切入
        items.push({ ty, p: 0, entry });
        return true;
      }
      case 'splitter':
        if (travel !== t.rot) return false; // 仅背面输入
        if (t.queue!.length >= NODE_QUEUE_MAX) return false;
        t.queue!.push(ty);
        return true;
      case 'merger':
        if (travel === ((t.rot + 2) % 4)) return false; // 正面不收
        if (t.queue!.length >= NODE_QUEUE_MAX) return false;
        t.queue!.push(ty);
        return true;
      case 'storage':
        if (t.queue!.length >= STORAGE_CAP || (t.filter && t.filter !== ty)) return false;
        t.queue!.push(ty);
        return true;
      case 'sorter':
      case 'freight_send':
        if (travel !== t.rot || t.queue!.length >= NODE_QUEUE_MAX) return false;
        t.queue!.push(ty);
        return true;
      case 'freight_receive':
      case 'generator':
        return false;
      case 'export': {
        t.counts!.set(ty, (t.counts!.get(ty) || 0) + 1);
        this.ledger.exported[ty]++;
        this.totalExported++;
        this.credits += ITEM_VALUE[ty];
        this.exportRing[this.ringIdx][ty] = (this.exportRing[this.ringIdx][ty] || 0) + 1;
        t.active = 1;
        this.onExport?.(ty, t.x, t.y);
        this.checkOrder();
        if (this.activeContract) {
          const contract = RUSH_CONTRACTS[this.contractIndex % RUSH_CONTRACTS.length];
          if (ty === contract.item && this.ledger.exported[ty] - this.activeContract.base >= contract.target) {
            this.credits += contract.reward;
            this.endContract(contract.reward);
          }
        }
        return true;
      }
      default: {
        // 加工机器：检查端口（查询表，避免每次推送分配数组）
        const edge = ((travel + 2) % 4) as Dir; // 被穿过的边（外法线方向）
        const ports = inputPortsFor(t.kind, t.rot);
        if (!ports.includes(edge)) return false;
        if (t.kind === 'advanced_assembler') {
          const selected = t.selectedRecipe && recipeById(t.selectedRecipe);
          if (!selected || !selected.inputs[ty]) return false;
        } else if (POWER_USE[t.kind] && !recipesFor(t.kind).some(recipe => recipe.inputs[ty])) return false;
        // 单品上限：防止某一种原料灌满混合池，饿死其他原料（防死锁）
        if ((t.pool!.get(ty) || 0) >= POOL_PER_TYPE) return false;
        if (mapTotal(t.pool) >= POOL_CAP) return false;
        t.pool!.set(ty, (t.pool!.get(ty) || 0) + 1);
        return true;
      }
    }
  }

  // ---------------- 主循环 ----------------
  tick(dt: number) {
    this.time += dt;
    if (this.activeContract && this.time > this.activeContract.deadline) this.endContract(0);
    if (this.campaign?.mode === 'corporate' && this.campaign.stage === 'complete'
      && !this.activeContract && this.time >= this.nextAutomaticContract) this.acceptContract();
    // 机器（先推输出，腾出空间）
    for (const e of this.procs) this.tickProc(e, dt);
    // 节点
    for (const e of this.nodes) this.tickNode(e);
    // 传送带
    for (const e of this.belts) this.tickBelt(e, dt);
    // 出货终端动画衰减
    for (const e of this.terminals) if (e.active! > 0) e.active = Math.max(0, e.active! - dt * 2.5);
    // 秒采样
    this.secAcc += dt;
    while (this.secAcc >= 1) {
      this.secAcc -= 1;
      this.sampleSecond();
    }
    // 历史曲线采样（每 10 秒）
    this.histAcc += dt;
    while (this.histAcc >= 10) {
      this.histAcc -= 10;
      this.hist.push({ t: Math.round(this.time), credits: this.credits, exported: this.totalExported });
      while (this.hist.length > 360) this.hist.shift(); // 硬封顶 1 小时窗口
    }
  }

  private tickProc(e: Ent, dt: number) {
    e.active = Math.max(0, (e.active || 0) - dt * 1.5);
    let outTotal: number;
    if (e.kind === 'extractor') {
      outTotal = mapTotal(e.out);
      const full = outTotal >= EXTRACT_OUT_CAP;
      if (!e.recipe && !full) { e.recipe = EXTRACT_RECIPES[e.ore!]; e.progress = 0; }
      if (e.recipe) {
        e.progress! += (dt * SPEED_DIV[(e.level || 1) - 1]) / e.recipe.time;
        if (e.progress! >= 1) {
          const ty = ORE_ITEM[e.ore!];
          e.out!.set(ty, (e.out!.get(ty) || 0) + 1);
          this.ledger.produced[ty]++;
          this.onProduce?.(ty);
          e.recipe = null; e.progress = 0; e.active = 1;
          outTotal = mapTotal(e.out);
          // 同 tick 立即重启，避免状态闪烁
          if (outTotal < EXTRACT_OUT_CAP) {
            e.recipe = EXTRACT_RECIPES[e.ore!];
            e.progress = 0;
          }
        }
      }
    } else {
      outTotal = mapTotal(e.out);
      if (e.powered !== false && !e.recipe) this.tryStart(e, outTotal);
      if (e.powered !== false && e.recipe) {
        e.progress! += (dt * SPEED_DIV[(e.level || 1) - 1]) / e.recipe.time;
        if (e.progress! >= 1) {
          for (const k of Object.keys(e.recipe.outputs) as ItemKey[]) {
            const n = e.recipe.outputs[k]!;
            e.out!.set(k, (e.out!.get(k) || 0) + n);
            this.ledger.produced[k] += n;
            this.onProduce?.(k);
          }
          if (e.kind === 'cultivator') this.restoredTiles.add(tileKey(e.x, e.y));
          e.recipe = null; e.progress = 0; e.active = 1;
          outTotal = mapTotal(e.out);
          this.tryStart(e, outTotal); // 立即尝试下一件
        }
      }
    }
    // 输出：每 tick 向朝向格推送 1 件（out 自上一次统计后未再变化）
    if (outTotal > 0) {
      for (const ty of e.out!.keys()) {
        if (this.tryPushTo(e.x, e.y, e.rot, ty)) {
          const n = e.out!.get(ty)! - 1;
          if (n <= 0) e.out!.delete(ty); else e.out!.set(ty, n);
          outTotal--; // 推出 1 件，与推送后重算 mapTotal 等价
          break;
        }
      }
    }
    // 状态统计
    let st: MachineState;
    if (e.powered === false) st = 'unpowered';
    else if (e.recipe) st = 'working';
    else if (outTotal >= (e.kind === 'extractor' ? EXTRACT_OUT_CAP : OUT_CAP)) st = 'blocked';
    else if (mapTotal(e.pool) > 0) st = 'starved';
    else st = 'idle';
    e.state = st;
    if (st === 'working') e.secW! += dt;
    else if (st === 'starved') e.secS! += dt;
    else if (st === 'blocked') e.secB! += dt;
  }

  private tryStart(e: Ent, outTotal: number) {
    if (e.kind === 'extractor') return;
    const recipes = recipesFor(e.kind);
    for (const r of recipes) {
      if (e.kind === 'advanced_assembler' && r.id !== e.selectedRecipe) continue;
      let ok = true;
      for (const k of Object.keys(r.inputs) as ItemKey[]) {
        if ((e.pool!.get(k) || 0) < r.inputs[k]!) { ok = false; break; }
      }
      if (!ok) continue;
      let outN = 0;
      for (const k of Object.keys(r.outputs) as ItemKey[]) outN += r.outputs[k]!;
      if (outTotal + outN > OUT_CAP) continue;
      for (const k of Object.keys(r.inputs) as ItemKey[]) {
        const n = e.pool!.get(k)! - r.inputs[k]!;
        if (n <= 0) e.pool!.delete(k); else e.pool!.set(k, n);
        this.ledger.consumed[k] += r.inputs[k]!; // 原料投入加工，记账
      }
      e.recipe = r; e.progress = 0;
      return;
    }
  }

  private tickNode(e: Ent) {
    const q = e.queue!;
    if (q.length === 0) return;
    if (e.kind === 'freight_send') {
      if (this.time < e.readyAt!) return;
      const origin = regionIdAt(e.x, e.y);
      let receiver: Ent | undefined;
      for (const station of this.freightReceivers[e.channel!]) {
        if (regionIdAt(station.x, station.y) === origin || station.queue!.length >= STORAGE_CAP) continue;
        if (!receiver || tileKey(station.x, station.y) < tileKey(receiver.x, receiver.y)) receiver = station;
      }
      if (!receiver) return;
      receiver.queue!.push(q.shift()!);
      e.readyAt = this.time + FREIGHT_SECONDS;
      e.active = 1;
      receiver.active = 1;
      this.freightDeliveries++;
    } else if (e.kind === 'freight_receive' || e.kind === 'merger') {
      if (this.tryPushTo(e.x, e.y, e.rot, q[0])) q.shift();
    } else if (e.kind === 'sorter') {
      const direction = q[0] === e.filter ? e.rot : relDir(e.rot, RIGHT);
      if (this.tryPushTo(e.x, e.y, direction, q[0])) q.shift();
    } else if (e.kind === 'splitter') {
      // 三个出口方向按轮询序尝试（内联计算，避免每 tick 分配 outs 数组）
      const rr = e.rr!;
      for (let i = 0; i < 3; i++) {
        const sel = (rr + i) % 3;
        const d: Dir = sel === 0 ? e.rot : relDir(e.rot, sel === 1 ? RIGHT : LEFT);
        if (this.tryPushTo(e.x, e.y, d, q[0])) {
          e.rr = (rr + i + 1) % 3;
          q.shift();
          return;
        }
      }
    } else { // storage：四向轮询输出
      for (let i = 0; i < 4; i++) {
        const d = ((e.rr! + i) % 4) as Dir;
        if (this.tryPushTo(e.x, e.y, d, q[0])) {
          e.rr = (e.rr! + i + 1) % 4;
          q.shift();
          return;
        }
      }
    }
  }

  private tickBelt(e: Ent, dt: number) {
    const v = e.kind === 'turbo' ? TURBO_SPEED : BELT_SPEED;
    const items = e.items!;
    for (let i = 0; i < items.length; i++) {
      const it = items[i];
      const lim = i === 0 ? 1 : items[i - 1].p - SPACING;
      if (it.p < lim) it.p = Math.min(lim, it.p + v * dt);
    }
    if (items.length > 0 && items[0].p >= 0.9999) {
      if (this.tryPushTo(e.x, e.y, e.rot, items[0].ty)) items.shift();
    }
  }

  private sampleSecond() {
    const A = 1 / 15;
    for (const e of this.procs) {
      e.emaW = (e.emaW || 0) * (1 - A) + (e.secW || 0) * A;
      e.emaS = (e.emaS || 0) * (1 - A) + (e.secS || 0) * A;
      e.emaB = (e.emaB || 0) * (1 - A) + (e.secB || 0) * A;
      e.secW = 0; e.secS = 0; e.secB = 0;
    }
    this.ringIdx = (this.ringIdx + 1) % 60;
    this.exportRing[this.ringIdx] = emptyCount();
  }

  // ---------------- 经济：升级与订单 ----------------
  upgradeCost(e: Ent): number | null {
    const costs = UPGRADE_COST[e.kind];
    if (!costs || !e.level) return null;
    if (e.level >= MAX_LEVEL) return null;
    return costs[e.level - 1];
  }

  upgrade(x: number, y: number): boolean {
    const e = this.get(x, y);
    if (!e) return false;
    const cost = this.upgradeCost(e);
    if (cost === null || this.credits < cost) return false;
    this.credits -= cost;
    e.level = (e.level || 1) + 1;
    e.active = 2; // 升级动画激励
    return true;
  }

  currentOrder() {
    const def = orderAt(this.orderIdx);
    const progress = Math.max(0, this.ledger.exported[def.item] - this.orderBase);
    return { idx: this.orderIdx, ...def, progress, remaining: Math.max(0, def.target - progress) };
  }

  currentContract() {
    const def = RUSH_CONTRACTS[this.contractIndex % RUSH_CONTRACTS.length];
    const active = this.activeContract;
    return {
      ...def,
      index: this.contractIndex,
      active: !!active,
      progress: active ? this.ledger.exported[def.item] - active.base : 0,
      remainingSeconds: active ? Math.max(0, active.deadline - this.time) : def.duration,
    };
  }

  acceptContract() {
    if (this.activeContract) return false;
    const def = RUSH_CONTRACTS[this.contractIndex % RUSH_CONTRACTS.length];
    this.activeContract = { base: this.ledger.exported[def.item], deadline: this.time + def.duration };
    return true;
  }

  private endContract(reward: number) {
    this.activeContract = null;
    this.contractIndex++;
    this.nextAutomaticContract = this.time + 30;
    this.onContractEnd?.(reward);
  }

  private checkOrder() {
    let guard = 0;
    while (guard++ < 10) {
      // 内联 currentOrder 的进度计算，避免每次出货都分配对象
      const def = orderAt(this.orderIdx);
      const progress = Math.max(0, this.ledger.exported[def.item] - this.orderBase);
      if (progress < def.target) break;
      this.credits += def.reward;
      // 出货终端闪光
      for (const t of this.terminals) t.active = Math.max(t.active || 0, 2);
      this.onOrderDone?.(this.orderIdx, def.reward, def.item, def.target);
      this.orderIdx++;
      this.orderBase = this.ledger.exported[orderAt(this.orderIdx).item];
    }
  }

  // ---------------- 统计 ----------------
  exportPerMin(ty: ItemKey): number {
    let s = 0;
    for (const b of this.exportRing) s += b[ty] || 0;
    return s; // 60 秒窗口内件数 = 件/分
  }

  liveCount(): Record<ItemKey, number> {
    const c = emptyCount();
    for (const e of this.belts) for (const it of e.items!) c[it.ty]++;
    for (const e of this.nodes) for (const ty of e.queue!) c[ty]++;
    for (const e of this.procs) {
      for (const [ty, n] of e.pool!) c[ty] += n;
      for (const [ty, n] of e.out!) c[ty] += n;
      // 加工中的原料：开工时已计入 consumed，产出时计入 produced，
      // 属于"在制品"，不计入场上现存（保证 produced-consumed-exported-destroyed === live）
    }
    return c;
  }

  beltLoad(): number {
    if (this.belts.length === 0) return 0;
    let s = 0;
    for (const e of this.belts) s += e.items!.length / 5;
    return s / this.belts.length;
  }

  conservationError(): number {
    let live = 0;
    const c = this.liveCount();
    for (const ty of Object.keys(c) as ItemKey[]) live += c[ty];
    let acc = 0;
    for (const ty of Object.keys(this.ledger.produced) as ItemKey[]) {
      acc += this.ledger.produced[ty] - this.ledger.consumed[ty]
        - this.ledger.exported[ty] - this.ledger.destroyed[ty];
    }
    return live - acc;
  }

  // ---------------- 序列化 ----------------
  serialize(): SaveData {
    const ents: SerEnt[] = [];
    for (let y = 0; y < this.H; y++) for (let x = 0; x < this.W; x++) {
      const e = this.cells[this.idx(x, y)];
      if (e) ents.push(this.serializeEnt(e));
    }
    return {
      v: this.campaign ? 3 : 2, time: this.time,
      ledger: this.ledger,
      ents,
      goals: [...this.goals],
      credits: this.credits,
      orderIdx: this.orderIdx,
      orderBase: this.orderBase,
      contract: { index: this.contractIndex, active: this.activeContract },
      ...(this.campaign && { frontier: {
        campaign: { ...this.campaign },
        regions: this.openRegions.map(area => area.id),
        restoredTiles: [...this.restoredTiles],
        freightDeliveries: this.freightDeliveries,
        nextAutomaticContract: this.nextAutomaticContract,
      } }),
      hist: this.hist.map(h => [h.t, h.credits, h.exported] as [number, number, number]),
    };
  }

  private serializeEnt(e: Ent): SerEnt {
    const s: SerEnt = { k: e.kind, x: e.x, y: e.y, r: e.rot };
    if (e.items) s.d = { items: e.items.map(it => [it.ty, Math.round(it.p * 1000) / 1000, it.entry]) };
    else if (e.queue) s.d = { queue: [...e.queue], rr: e.rr, filter: e.filter, channel: e.channel, readyAt: e.readyAt };
    else if (e.pool) s.d = {
      pool: [...e.pool].map(([k, v]) => [k, v]),
      out: [...e.out!].map(([k, v]) => [k, v]),
      prog: Math.round((e.progress || 0) * 1000) / 1000,
      rec: e.recipe?.id || null,
      ore: e.ore,
      lvl: e.level || 1,
      selectedRecipe: e.selectedRecipe,
    };
    else if (e.counts) s.d = { counts: [...e.counts].map(([k, v]) => [k, v]) };
    return s;
  }

  load(data: SaveData) {
    // 清空
    this.W = GRID; this.H = GRID;
    this.cells = new Array(this.W * this.H).fill(null);
    this.belts = []; this.nodes = []; this.procs = []; this.terminals = [];
    this.generators = [];
    for (const receivers of this.freightReceivers) receivers.length = 0;
    this.refreshPower();
    this.patches.fill(0);
    this.openRegions = [];
    this.opened.clear();
    this.scars.clear();
    this.restoredTiles.clear();
    this.campaign = null;
    this.freightDeliveries = 0;
    this.nextAutomaticContract = 0;
    this.addRegion('harbor');
    if (data.v === 3) this.loadFrontier(data.frontier);
    const cleanCount = (src: any): Record<ItemKey, number> => {
      const base = emptyCount();
      if (src && typeof src === 'object') {
        for (const k of Object.keys(base) as ItemKey[]) {
          const v = Number(src[k]);
          if (Number.isFinite(v) && v >= 0) base[k] = v;
        }
      }
      return base;
    };
    this.time = Number.isFinite(data.time) && data.time >= 0 ? data.time : 0;
    this.ledger = {
      produced: cleanCount(data.ledger.produced),
      consumed: cleanCount((data.ledger as any).consumed),
      exported: cleanCount(data.ledger.exported),
      destroyed: cleanCount(data.ledger.destroyed),
    };
    this.totalExported = Object.values(this.ledger.exported).reduce((a, b) => a + b, 0);
    // 重置 60 秒出货统计环与秒采样累计，避免旧对局的速率残留到新对局
    this.ringIdx = 0;
    this.secAcc = 0;
    for (let i = 0; i < this.exportRing.length; i++) this.exportRing[i] = emptyCount();
    this.goals = new Set(data.goals || []);
    // 经济/订单（v1 存档迁移：补发启动资金，订单从当前累计量起算）
    this.credits = typeof data.credits === 'number' && Number.isFinite(data.credits) ? data.credits : START_CREDITS;
    this.orderIdx = Number.isInteger(data.orderIdx) && data.orderIdx! >= 0 ? data.orderIdx! : 0;
    this.orderBase = typeof data.orderBase === 'number' && Number.isFinite(data.orderBase) ? data.orderBase : this.ledger.exported[orderAt(this.orderIdx).item];
    const contract = data.contract;
    this.contractIndex = contract && Number.isSafeInteger(contract.index) && contract.index >= 0 ? contract.index : 0;
    const active = contract?.active;
    const def = RUSH_CONTRACTS[this.contractIndex % RUSH_CONTRACTS.length];
    this.activeContract = active && Number.isFinite(active.deadline) && active.deadline >= this.time
      && Number.isFinite(active.base) && active.base >= 0 && active.base <= this.ledger.exported[def.item]
      ? { ...active } : null;
    // 历史曲线（旧存档无此字段 → 空数组重新采样）
    this.hist = (data.hist || []).map((h: [number, number, number]) => ({ t: h[0], credits: h[1], exported: h[2] }));
    this.histAcc = 0;
    this.nextId = 1;
    for (const s of data.ents) {
      if (!s || typeof s.k !== 'string' || !Object.prototype.hasOwnProperty.call(DEFS, s.k)) {
        throw new Error(`Invalid entity kind: ${String(s?.k)}`);
      }
      if (!Number.isInteger(s.x) || !Number.isInteger(s.y) || !Number.isInteger(s.r) || s.r < 0 || s.r > 3) {
        throw new Error(`Invalid entity placement at ${s?.x},${s?.y}`);
      }
      if (!this.insertEnt(s)) throw new Error(`Invalid entity placement at ${s.x},${s.y}`);
    }
    let maxId = 0;
    for (const c of this.cells) if (c && c.id > maxId) maxId = c.id;
    this.nextId = maxId + 1;
  }

  private loadFrontier(frontier: SaveData['frontier']) {
    const saved = frontier?.campaign;
    if (!saved || !this.chooseCampaign(saved.mode, saved.seed)
      || !['charter', 'commission', 'complete'].includes(saved.stage)
      || !Array.isArray(frontier.regions) || frontier.regions[0] !== 'harbor' || !Array.isArray(frontier.restoredTiles)) {
      throw new Error('Invalid frontier progression');
    }
    this.campaign!.stage = saved.stage;
    for (const id of frontier.regions.slice(1)) {
      const def = REGIONS[id];
      if (!def?.parent || !this.opened.has(def.parent) || this.opened.has(id)) throw new Error('Invalid frontier region');
      this.addRegion(id);
    }
    for (const key of frontier.restoredTiles) {
      if (!this.scars.has(key)) throw new Error('Invalid restoration site');
      this.restoredTiles.add(key);
    }
    const { freightDeliveries, nextAutomaticContract } = frontier;
    if (!Number.isSafeInteger(freightDeliveries) || freightDeliveries < 0
      || !Number.isFinite(nextAutomaticContract) || nextAutomaticContract < 0) throw new Error('Invalid frontier statistic');
    this.freightDeliveries = freightDeliveries;
    this.nextAutomaticContract = nextAutomaticContract;
  }
}
