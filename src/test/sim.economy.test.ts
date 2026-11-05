// ============================================================
// MicroFactory · 经济系统测试：出货计价 / 升级 / 订单 / 存档 v2（vitest 运行）
// ============================================================
import assert from 'node:assert';
import { test } from 'vitest';
import { Sim } from '../sim/engine';
import { buildExample } from '../sim/example';
import { ITEM_VALUE, START_CREDITS, MAX_LEVEL, orderAt } from '../core/defs';

const DT = 1 / 30;

// 沿用原有用例名；vitest 逐项执行，断言抛错即该用例失败
const ok = (name: string, fn: () => void) => test(name, fn);

// ------------------------------------------------------------
ok('出货计价：每种物品按单价入账', () => {
  const s = new Sim();
  s.place('export', 6, 20, 0);
  const c0 = s.credits;
  for (const ty of ['robot', 'gear', 'wire', 'circuit', 'iron_ingot', 'iron_ore'] as const) {
    const before = s.credits;
    assert.ok(s.tryPushTo(5, 20, 0, ty), `${ty} 应被终端接收`);
    assert.strictEqual(s.credits - before, ITEM_VALUE[ty], `${ty} 入账 ${ITEM_VALUE[ty]}`);
  }
  assert.ok(s.credits > c0);
});

// ------------------------------------------------------------
ok('升级：Lv2 采矿机产量 ≈ 1.5 倍', () => {
  const mk = () => {
    const s = new Sim();
    s.place('extractor', 5, 28, 3);
    s.place('belt', 5, 27, 3);
    s.place('export', 5, 26, 0);
    return s;
  };
  const a = mk(), b = mk();
  // 给 b 发资金并升级到 Lv2
  b.credits += 100000;
  assert.strictEqual(b.upgrade(5, 28), true);
  assert.strictEqual(b.get(5, 28)!.level, 2);
  for (let i = 0; i < 120 * 30; i++) { a.tick(DT); b.tick(DT); }
  const ea = a.ledger.exported.iron_ore, eb = b.ledger.exported.iron_ore;
  const ratio = eb / Math.max(1, ea);
  assert.ok(ratio > 1.3 && ratio < 1.7, `Lv2/Lv1 出货比 ${ratio.toFixed(2)} 应 ≈1.5`);
  assert.strictEqual(a.conservationError(), 0);
  assert.strictEqual(b.conservationError(), 0);
});

// ------------------------------------------------------------
ok('升级：扣款准确、资金不足拒绝、满级拒绝', () => {
  const s = new Sim();
  s.place('furnace', 5, 26, 3);
  s.credits = 1000;
  assert.strictEqual(s.upgradeCost(s.get(5, 26)!), 80);
  assert.strictEqual(s.upgrade(5, 26), true);
  assert.strictEqual(s.credits, 920);
  assert.strictEqual(s.get(5, 26)!.level, 2);
  assert.strictEqual(s.upgradeCost(s.get(5, 26)!), 200);
  s.credits = 100;
  assert.strictEqual(s.upgrade(5, 26), false, '资金不足应拒绝');
  assert.strictEqual(s.get(5, 26)!.level, 2);
  s.credits = 100000;
  assert.strictEqual(s.upgrade(5, 26), true);
  assert.strictEqual(s.get(5, 26)!.level, 3);
  assert.strictEqual(s.upgradeCost(s.get(5, 26)!), null, '满级无升级');
  assert.strictEqual(s.upgrade(5, 26), false);
  // 传送带不可升级
  s.place('belt', 5, 27, 3);
  assert.strictEqual(s.upgradeCost(s.get(5, 27)!), null);
});

// ------------------------------------------------------------
ok('订单：完成当前订单 → 发奖 → 自动接下一单', () => {
  const s = new Sim();
  s.place('export', 6, 20, 0);
  const done: number[] = [];
  s.onOrderDone = (idx, reward) => done.push(idx * 1000 + reward);
  // 直接送 8 台机器人 → 订单 0（8 台，220 资金）完成
  for (let i = 0; i < 8; i++) s.tryPushTo(5, 20, 0, 'robot');
  const o1 = orderAt(0);
  assert.strictEqual(s.credits, START_CREDITS + 8 * ITEM_VALUE.robot + o1.reward, '奖金应入账');
  assert.strictEqual(done.length, 1);
  assert.strictEqual(s.orderIdx, 1);
  const o2 = s.currentOrder();
  assert.strictEqual(o2.idx, 1);
  assert.strictEqual(o2.progress, 0, '新订单从零起算');
  // 再送 20 台 → 订单 1 完成
  for (let i = 0; i < 20; i++) s.tryPushTo(5, 20, 0, 'robot');
  assert.strictEqual(s.orderIdx, 2);
  assert.strictEqual(done.length, 2);
  assert.ok(s.currentOrder().progress === 0);
});

// ------------------------------------------------------------
ok('订单：进度 = 接单后的累计出货（含混合出货干扰）', () => {
  const s = new Sim();
  s.place('export', 6, 20, 0);
  // 混入无关物品不应推进机器人订单
  for (let i = 0; i < 5; i++) s.tryPushTo(5, 20, 0, 'gear');
  assert.strictEqual(s.currentOrder().progress, 0);
  for (let i = 0; i < 3; i++) s.tryPushTo(5, 20, 0, 'robot');
  assert.strictEqual(s.currentOrder().progress, 3);
  assert.strictEqual(s.currentOrder().remaining, 5);
});

// ------------------------------------------------------------
ok('存档 v2：资金/等级/订单进度完整往返', () => {
  const s = new Sim();
  buildExample(s);
  s.credits = 777;
  s.credits -= s.upgradeCost(s.procs.find(p => p.kind === 'furnace')!)!;
  s.upgrade(s.procs.find(p => p.kind === 'furnace')!.x, s.procs.find(p => p.kind === 'furnace')!.y);
  for (let i = 0; i < 90 * 30; i++) s.tick(DT);
  const snap = JSON.parse(JSON.stringify(s.serialize()));
  assert.strictEqual(snap.v, 2);
  const s2 = new Sim();
  s2.load(snap);
  assert.strictEqual(s2.credits, s.credits);
  assert.strictEqual(s2.orderIdx, s.orderIdx);
  assert.strictEqual(s2.orderBase, s.orderBase);
  for (const p of s.procs) {
    const q = s2.get(p.x, p.y)!;
    assert.strictEqual(q.level, p.level, `(${p.x},${p.y}) 等级应一致`);
  }
  // 双方继续跑 60 秒应保持一致的资金增量
  for (let i = 0; i < 60 * 30; i++) { s.tick(DT); s2.tick(DT); }
  assert.strictEqual(s2.credits, s.credits, '读档后经济演化应一致');
  assert.strictEqual(s2.conservationError(), 0);
});

// ------------------------------------------------------------
ok('v1 存档迁移：补发启动资金，订单从既有出货量起算', () => {
  const s = new Sim();
  buildExample(s);
  for (let i = 0; i < 120 * 30; i++) s.tick(DT);
  const snap = s.serialize();
  // 伪造 v1 存档：去掉经济字段
  const v1: any = { ...snap, v: 1 };
  delete v1.credits; delete v1.orderIdx; delete v1.orderBase;
  // 顺带剥掉机器等级
  for (const e of v1.ents) if (e.d && 'lvl' in e.d) delete e.d.lvl;
  const s2 = new Sim();
  s2.load(v1);
  assert.strictEqual(s2.credits, START_CREDITS, 'v1 存档应补发启动资金');
  assert.strictEqual(s2.orderIdx, 0);
  assert.strictEqual(s2.orderBase, s.ledger.exported.robot, '订单基线 = 载入时的机器人累计');
  assert.strictEqual(s2.currentOrder().progress, 0, '老存档不白送订单进度');
  for (const p of s2.procs) assert.strictEqual(p.level, 1, 'v1 机器默认 1 级');
  assert.strictEqual(s2.conservationError(), 0);
});

// ------------------------------------------------------------
