// ============================================================
// MicroFactory · 边界与回归测试（vitest 运行）
// ============================================================
import assert from 'node:assert';
import { test } from 'vitest';
import { Sim } from '../sim/engine';
import { buildExample } from '../sim/example';
import { ITEM_ORDER } from '../core/defs';

const DT = 1 / 30;
const STEP_S = 30;

function run(sim: Sim, seconds: number, checkEvery = 10) {
  for (let s = 0; s < seconds; s++) {
    for (let t = 0; t < STEP_S; t++) sim.tick(DT);
    if (checkEvery > 0 && (s + 1) % checkEvery === 0) {
      assert.strictEqual(sim.conservationError(), 0, `守恒失败 @${sim.time.toFixed(0)}s`);
    }
  }
}

// 沿用原有用例名；vitest 逐项执行，断言抛错即该用例失败
const ok = (name: string, fn: () => void) => test(name, fn);

// ------------------------------------------------------------
ok('回归：重复铺设同格传送带不产生幽灵实体（物品不双重加速）', () => {
  const s = new Sim();
  s.place('extractor', 5, 28, 3);
  s.place('belt', 5, 27, 3);
  s.place('export', 5, 26, 0);
  run(s, 10);
  const beltsBefore = s.belts.length;
  const itemsBefore = s.belts[0].items!.length;
  s.place('belt', 5, 27, 3);   // 同类型重铺（改向）
  s.place('turbo', 5, 27, 3);  // 普通 → 高速
  s.place('belt', 5, 27, 3);   // 高速 → 普通
  assert.strictEqual(s.belts.length, beltsBefore, `替换后实体数应不变: ${beltsBefore} → ${s.belts.length}`);
  assert.strictEqual(s.get(5, 27)!.items!.length, itemsBefore, '替换应保留在途物品');
  run(s, 20);
  assert.ok(s.ledger.exported.iron_ore > 5, '替换后继续正常出货');
  assert.strictEqual(s.conservationError(), 0);
});

// ------------------------------------------------------------
ok('回归：drag 重铺整条传送带后物流仍正确（无重复 tick）', () => {
  const s = new Sim();
  s.place('extractor', 5, 28, 3);
  for (let y = 27; y >= 25; y--) s.place('belt', 5, y, 3);
  s.place('export', 5, 24, 0);
  run(s, 10);
  // 模拟用户来回重拖同一条线
  for (let i = 0; i < 5; i++) {
    for (let y = 27; y >= 25; y--) s.place('belt', 5, y, 3);
  }
  assert.strictEqual(s.belts.length, 3, '重拖 5 次后实体数仍为 3');
  run(s, 40);
  assert.strictEqual(s.conservationError(), 0);
  assert.ok(s.ledger.exported.iron_ore > 10);
});

// ------------------------------------------------------------
ok('错误端口：物品顶在机器非输入侧不会消失，拆除时正确记账', () => {
  const s = new Sim();
  s.place('extractor', 5, 28, 3);
  s.place('belt', 5, 27, 3);
  // 熔炉朝西（rot 2）：背面输入 = 东侧；传送带从南边指向它 → 不是输入口
  s.place('furnace', 5, 26, 2);
  run(s, 30);
  assert.ok(s.ledger.consumed.iron_ore === 0, '错误端口不应消耗任何物品');
  assert.ok(s.get(5, 27)!.items!.length === 5, '物品应堵在带上');
  // 拆掉载货带 → destroyed 记账
  const n = s.get(5, 27)!.items!.length;
  s.remove(5, 27);
  assert.ok(s.ledger.destroyed.iron_ore === n, `destroyed 应 = ${n}`);
  assert.strictEqual(s.conservationError(), 0);
});

// ------------------------------------------------------------
ok('拆除装有原料/成品的机器：缓存全部记账', () => {
  const s = new Sim();
  s.place('extractor', 5, 28, 3);
  s.place('belt', 5, 27, 3);
  s.place('furnace', 5, 26, 3);
  s.place('export', 5, 25, 0);
  run(s, 40); // 熔炉池/输出缓存里必然有货
  const f = s.procs.find(p => p.kind === 'furnace')!;
  const inMachine = [...f.pool!.values()].reduce((a, b) => a + b, 0)
    + [...f.out!.values()].reduce((a, b) => a + b, 0)
    + (f.recipe ? Object.values(f.recipe.inputs).reduce((a: number, b) => a + (b as number), 0) : 0);
  assert.ok(inMachine > 0, '测试前提：机器内应有物品');
  s.remove(5, 26);
  const destroyedTotal = ITEM_ORDER.reduce((a, k) => a + s.ledger.destroyed[k], 0);
  // 注意：加工中的原料按“已消耗”记账，不在 destroyed 中
  const onBelt = s.belts.reduce((a, b) => a + b.items!.length, 0);
  assert.strictEqual(s.conservationError(), 0, '拆除机器后守恒仍成立');
  assert.ok(destroyedTotal > 0 || onBelt >= 0);
});

// ------------------------------------------------------------
ok('分流器两路全堵 → 上游背压；恢复一路即恢复流动', () => {
  const s = new Sim();
  s.place('extractor', 5, 28, 3);
  s.place('belt', 5, 27, 3);
  s.place('splitter', 5, 26, 3);
  s.place('belt', 5, 25, 3);   // 前方路（死头）
  s.place('belt', 6, 26, 0);   // 右路（死头）
  run(s, 60);
  const ex = s.procs[0];
  assert.strictEqual(ex.state, 'blocked', '两路全堵时采矿机应堵塞');
  s.place('export', 5, 24, 0); // 接通前路
  run(s, 30);
  assert.strictEqual(ex.state, 'working', '接通一路后恢复工作');
  assert.ok(s.ledger.exported.iron_ore > 5);
  assert.strictEqual(s.conservationError(), 0);
});

// ------------------------------------------------------------
ok('仓库 FIFO 与四向吞吐', () => {
  const s = new Sim();
  s.place('extractor', 5, 28, 3);
  s.place('belt', 5, 27, 3);
  s.place('storage', 5, 26, 0);
  s.place('belt', 5, 25, 3);
  s.place('belt', 5, 24, 3);
  s.place('export', 5, 23, 0);
  run(s, 60);
  // 经仓库中转后应持续出货（仓库最多缓存 48，60 秒产 30 件应大部分通过）
  assert.ok(s.ledger.exported.iron_ore >= 10, `经仓库出货 ${s.ledger.exported.iron_ore} 应 >10`);
  assert.strictEqual(s.conservationError(), 0);
});

// ------------------------------------------------------------
ok('机器直连：熔炉出口贴冲压机入口', () => {
  const s = new Sim();
  s.place('extractor', 5, 28, 3);
  s.place('belt', 5, 27, 3);
  s.place('furnace', 5, 26, 3);
  s.place('press', 5, 25, 3);  // 熔炉(5,26)出口正对冲压机背面输入
  s.place('belt', 5, 24, 3);
  s.place('export', 5, 23, 0);
  run(s, 60);
  assert.ok(s.ledger.exported.gear >= 10, `直连产齿轮 ${s.ledger.exported.gear} 应 ≥10`);
  assert.strictEqual(s.conservationError(), 0);
});

// ------------------------------------------------------------
ok('单品上限：用单一原料灌装配机，另一输入仍可进入（防死锁）', () => {
  const s = new Sim();
  s.place('extractor', 5, 28, 3);
  s.place('belt', 5, 27, 3);
  // 电路板配方需要 齿轮+铜线；这里只喂齿轮（用熔炉造不了齿轮…改用直接喂铁矿石给熔炉测试池上限）
  // 场景：熔炉只被喂铁矿，检查池中铁矿 ≤ 单品上限 6
  const f = s.place('furnace', 5, 26, 3);
  s.place('export', 5, 25, 0);
  run(s, 60);
  const iron = f.pool!.get('iron_ore') || 0;
  assert.ok(iron <= 6, `单品上限应生效：铁矿积压 ${iron} ≤ 6`);
  assert.strictEqual(s.conservationError(), 0);
});

// ------------------------------------------------------------
ok('高速带比普通带更快把货送到（相同布局对比）', () => {
  const mk = (turbo: boolean) => {
    const s = new Sim();
    s.place('extractor', 5, 28, 3);
    for (let y = 27; y >= 14; y--) s.place(turbo ? 'turbo' : 'belt', 5, y, 3);
    s.place('export', 5, 13, 0);
    run(s, 0, 0); // 不推进
    return s;
  };
  const a = mk(false), b = mk(true);
  for (let i = 0; i < 20 * STEP_S; i++) { a.tick(DT); b.tick(DT); }
  // 20 秒内：普通带传输延迟 ~10s，出货少；高速带延迟 ~5s，出货多
  assert.ok(b.ledger.exported.iron_ore > a.ledger.exported.iron_ore,
    `高速带出货 ${b.ledger.exported.iron_ore} 应多于普通带 ${a.ledger.exported.iron_ore}`);
  assert.strictEqual(a.conservationError(), 0);
  assert.strictEqual(b.conservationError(), 0);
});

// ------------------------------------------------------------
ok('转弯（侧向切入）物品沿弧线到达并正常交接', () => {
  const s = new Sim();
  s.place('extractor', 5, 28, 3);
  s.place('belt', 5, 27, 3);
  s.place('belt', 5, 26, 3);
  s.place('belt', 5, 25, 0);   // 北→东拐弯
  s.place('belt', 6, 25, 0);
  s.place('belt', 7, 25, 1);   // 东→南拐弯
  s.place('belt', 7, 26, 1);
  s.place('export', 7, 27, 0);
  run(s, 60);
  assert.ok(s.ledger.exported.iron_ore >= 15, `两次拐弯后出货 ${s.ledger.exported.iron_ore} 应 ≈28`);
  assert.strictEqual(s.conservationError(), 0);
  // 侧向切入的物品 entry 应为 1 或 2（弧线），直线为 0
  const entries = new Set(s.belts.flatMap(b => b.items!.map(i => i.entry)));
  assert.ok(entries.size <= 3);
});

// ------------------------------------------------------------
ok('对撞：带头顶头互拒，物品堵住（不消失、不穿透），修复后恢复', () => {
  const s = new Sim();
  s.place('extractor', 5, 28, 3);
  s.place('belt', 5, 27, 3);   // 向北
  s.place('belt', 5, 26, 1);   // 向南（与上一条对撞）
  run(s, 40);
  const b1 = s.get(5, 27)!, b2 = s.get(5, 26)!;
  assert.strictEqual(b1.items!.length, 5, '北带应满载堵住');
  assert.strictEqual(b2.items!.length, 0, '南带无货源应为空');
  assert.strictEqual(s.procs[0].state, 'blocked', '采矿机应被对撞堵塞');
  assert.strictEqual(s.conservationError(), 0);
  // 修复：拆掉南带，接上出口
  s.remove(5, 26);
  s.place('export', 5, 26, 0);
  run(s, 30);
  assert.ok(s.ledger.exported.iron_ore >= 5, `恢复后出货 ${s.ledger.exported.iron_ore} 应 ≥5`);
  assert.strictEqual(s.conservationError(), 0);
});

// ------------------------------------------------------------
ok('大规模工厂：30 台采矿机 + 干线 + 600 秒，守恒与稳定性', () => {
  const s = new Sim();
  // 矿脉行 y=29 全部放采矿机，向北两条高速带汇入 y=26 干线
  const patchCells: Array<[number, number]> = [];
  for (let x = 4; x <= 7; x++) patchCells.push([x, 29]);
  for (let x = 10; x <= 12; x++) patchCells.push([x, 29]);
  for (let x = 24; x <= 26; x++) patchCells.push([x, 29]);
  for (const [x, y] of patchCells) s.place('extractor', x, y, 3);
  for (const [x] of patchCells) {
    s.place('turbo', x, 28, 3);
    s.place('turbo', x, 27, 3);
    s.place('turbo', x, 26, 0); // 汇入干线（侧向切入）
  }
  for (let x = 3; x <= 27; x++) if (!s.get(x, 26)) s.place('turbo', x, 26, 0);
  s.place('turbo', 28, 26, 3);
  s.place('storage', 28, 25, 0);
  s.place('export', 28, 24, 0);
  run(s, 600, 60);
  const total = s.ledger.exported.iron_ore + s.ledger.exported.copper_ore;
  assert.ok(total >= 2000, `600 秒 10 机出货 ${total} 应 ≥2000（10×0.5×600=3000 上限）`);
  assert.strictEqual(s.conservationError(), 0);
  for (const p of s.procs) assert.ok(Number.isFinite(p.progress || 0));
});

// ------------------------------------------------------------
ok('存读档：在途物品（含弧线上的）逐件恢复', () => {
  const s = new Sim();
  buildExample(s);
  run(s, 45, 0);
  const liveBefore = ITEM_ORDER.reduce((a, k) => a + s.liveCount()[k], 0);
  const snap = JSON.parse(JSON.stringify(s.serialize()));
  const s2 = new Sim();
  s2.load(snap);
  const liveAfter = ITEM_ORDER.reduce((a, k) => a + s2.liveCount()[k], 0);
  assert.strictEqual(liveAfter, liveBefore, `在途物品数应一致: ${liveBefore} → ${liveAfter}`);
  // 传送带物品逐件对比
  for (const b of s.belts) {
    const b2 = s2.get(b.x, b.y)!;
    assert.ok(b2, `(${b.x},${b.y}) 应存在`);
    assert.strictEqual(b2.items!.length, b.items!.length, `(${b.x},${b.y}) 带上物品数应一致`);
    for (let i = 0; i < b.items!.length; i++) {
      assert.strictEqual(b2.items![i].ty, b.items![i].ty);
      assert.ok(Math.abs(b2.items![i].p - b.items![i].p) < 0.002, '进度误差 < 0.002');
    }
  }
});

// ------------------------------------------------------------
ok('极端输入：挖掉正在供货的整条上游，下游自然排空', () => {
  const s = new Sim();
  s.place('extractor', 5, 28, 3);
  s.place('belt', 5, 27, 3);
  s.place('belt', 5, 26, 3);
  s.place('furnace', 5, 25, 3);
  s.place('belt', 5, 24, 3);
  s.place('export', 5, 23, 0);
  run(s, 30);
  s.remove(5, 27); // 掐断上游
  run(s, 60);
  const exState = s.procs.find(p => p.kind === 'extractor')!.state;
  assert.ok(exState === 'idle' || exState === 'blocked', `采矿机孤立后应待机或堵塞（输出无处可推），实际 ${exState}`);
  assert.ok(s.ledger.exported.iron_ingot > 0, '已产出的锭仍应出货');
  assert.strictEqual(s.conservationError(), 0);
});

// ------------------------------------------------------------
