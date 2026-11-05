// ============================================================
// MicroFactory · 无头模拟测试（vitest 运行，不依赖浏览器）
// 覆盖：物品守恒、生产节拍、堵塞回流、分流公平性、合流、存读档、示例工厂
// 运行：npm test（= vitest run）
// ============================================================
import assert from 'node:assert';
import { test } from 'vitest';
import { Sim } from '../sim/engine';
import { buildExample } from '../sim/example';
import { ITEM_ORDER, ItemKey, BELT_SPEED, EXTRACT_TIME } from '../core/defs';

const DT = 1 / 30;
const STEP_S = 30; // 每 30 tick = 1 秒

function run(sim: Sim, seconds: number, checkEvery = 10) {
  for (let s = 0; s < seconds; s++) {
    for (let t = 0; t < STEP_S; t++) sim.tick(DT);
    if (checkEvery > 0 && (s + 1) % checkEvery === 0) {
      const err = sim.conservationError();
      assert.strictEqual(err, 0, `守恒校验失败 @t=${sim.time.toFixed(0)}s 误差=${err}`);
    }
  }
}

function countLe(s: Sim): Record<string, number> {
  const r: Record<string, number> = {};
  for (const t of ITEM_ORDER) r[t] = s.ledger.exported[t];
  return r;
}

// 沿用原有用例名；vitest 逐项执行，断言抛错即该用例失败
const ok = (name: string, fn: () => void) => test(name, fn);

console.log('MicroFactory 模拟测试');

// ------------------------------------------------------------
ok('基础线：采矿 → 传送带 → 熔炉 → 传送带 → 出货，节拍符合 1/3s', () => {
  const s = new Sim();
  s.place('extractor', 5, 28, 3);
  s.place('belt', 5, 27, 3);
  s.place('belt', 5, 26, 3);
  s.place('furnace', 5, 25, 3);
  s.place('belt', 5, 24, 3);
  s.place('belt', 5, 23, 3);
  s.place('export', 5, 22, 0);
  run(s, 150);
  const exp = s.ledger.exported.iron_ingot;
  const expected = 150 / 3; // 熔炉节拍 3s，供料充足
  assert.ok(Math.abs(exp - expected) <= 3, `出货 ${exp}，期望≈${expected}`);
  // 熔炉饱和后采矿机被反压限流：产量由下游消费决定（≈150/3），而非采矿峰值
  assert.ok(s.ledger.produced.iron_ore >= 150 / 3 - 4, '采矿产量应跟随下游消费');
  assert.ok(s.ledger.produced.iron_ore <= 150 / EXTRACT_TIME + 8, '采矿不应超速');
  const f = s.procs.find(e => e.kind === 'furnace')!;
  assert.ok(f.emaW! > 0.9, `熔炉利用率应≈100%，实际 ${(f.emaW! * 100).toFixed(0)}%`);
});

// ------------------------------------------------------------
ok('堵塞回流：下游断路 → 熔炉/采矿机依次堵塞；修复后恢复', () => {
  const s = new Sim();
  s.place('extractor', 5, 28, 3);
  s.place('belt', 5, 27, 3);
  s.place('furnace', 5, 26, 3);
  s.place('belt', 5, 25, 3);
  s.place('splitter', 5, 24, 3);
  s.place('belt', 5, 23, 3);
  s.place('belt', 5, 22, 3);
  s.place('belt', 5, 21, 3);
  s.place('belt', 5, 20, 3);
  // 死路：没有任何出口（下游缓冲约 31 件，需更长时间填满）
  run(s, 150);
  const ex = s.procs.find(e => e.kind === 'extractor')!;
  const fu = s.procs.find(e => e.kind === 'furnace')!;
  assert.strictEqual(ex.state, 'blocked', '采矿机应堵塞');
  assert.strictEqual(fu.state, 'blocked', '熔炉应堵塞');
  assert.strictEqual(s.conservationError(), 0);
  assert.ok(s.get(5, 20)!.items!.length === 5, '末端传送带应满载 5 件');
  // 修复：拆掉死路，接上出货终端
  s.remove(5, 20); s.remove(5, 21); s.remove(5, 22);
  s.place('export', 5, 22, 0);
  run(s, 30);
  assert.strictEqual(ex.state, 'working', '修复后采矿机应恢复工作');
  assert.ok(s.ledger.exported.iron_ingot > 3, '恢复后应有出货');
  assert.strictEqual(s.conservationError(), 0);
});

// ------------------------------------------------------------
ok('分流器：两路输出数量接近均分', () => {
  const s = new Sim();
  s.place('extractor', 5, 28, 3);
  s.place('belt', 5, 27, 3);
  s.place('splitter', 5, 26, 3);
  s.place('belt', 5, 25, 3);
  s.place('export', 5, 24, 0);
  s.place('belt', 6, 26, 0);
  s.place('export', 7, 26, 0);
  run(s, 120);
  const a = s.ledger.exported.iron_ore;
  const b = (s.terminals[1].counts!.get('iron_ore') || 0);
  const a1 = s.terminals[0].counts!.get('iron_ore') || 0;
  const total = a;
  assert.ok(Math.abs(a1 - b) <= 4, `两路应均分: ${a1} vs ${b}`);
  assert.ok(total >= 55, `总出货 ${total} 应≈60`);
  assert.strictEqual(s.conservationError(), 0);
});

// ------------------------------------------------------------
ok('合流器 + 机器直连 + 高速传送带：两路矿石汇流出货', () => {
  const s = new Sim();
  s.place('extractor', 6, 28, 3); // 直接推入合流器背面输入口
  s.place('merger', 6, 27, 3);
  s.place('extractor', 7, 28, 3); // 经一节传送带进入合流器右侧输入口
  s.place('belt', 7, 27, 2);
  s.place('turbo', 6, 26, 3);
  s.place('turbo', 6, 25, 3);
  s.place('export', 6, 24, 0);
  run(s, 60);
  const total = s.ledger.exported.iron_ore;
  const produced = s.ledger.produced.iron_ore;
  assert.ok(produced >= 55, `采矿产量 ${produced} ≈ 60`);
  assert.ok(total >= produced - 6, `出货 ${total} 应接近产量（在途≈5）`);
  assert.strictEqual(s.conservationError(), 0);
});

// ------------------------------------------------------------
ok('传送带物理：间距、满载与首件阻塞', () => {
  const s = new Sim();
  s.place('extractor', 5, 28, 3);
  const b1 = s.place('belt', 5, 27, 3);
  s.place('furnace', 5, 26, 3);
  s.place('belt', 5, 25, 3);
  s.place('splitter', 5, 24, 3); // 无出口 → 阻塞
  run(s, 90);
  assert.ok(b1.items!.length === 5, `传送带单格容量应为 5，实际 ${b1.items!.length}`);
  assert.ok(b1.items![0].p >= 0.999, '首件应顶到格末端');
  assert.strictEqual(s.conservationError(), 0);
});

// ------------------------------------------------------------
ok('示例工厂：900 秒连续运行，守恒 + 产能 ≈ 12 机器人/分', () => {
  const s = new Sim();
  buildExample(s);
  run(s, 900, 30);
  const robots = s.ledger.exported.robot;
  assert.ok(robots >= 100, `900 秒应出货 ≥100 台机器人，实际 ${robots}`);
  const rate = s.exportPerMin('robot');
  assert.ok(rate >= 9, `稳态产能应 ≥9/分，实际 ${rate.toFixed(1)}/分`);
  const a2 = s.procs.find(e => e.kind === 'assembler' && e.ore === undefined && e.x === 12)!;
  assert.ok(a2.emaW! > 0.85, `机器人装配机利用率 ${(a2.emaW! * 100).toFixed(0)}% 应 >85%`);
  assert.strictEqual(s.conservationError(), 0);
  // 无 NaN 检查
  for (const e of [...s.belts, ...s.nodes, ...s.procs]) {
    assert.ok(Number.isFinite(e.progress || 0), 'progress 不应为 NaN');
  }
});

// ------------------------------------------------------------
ok('存读档：序列化 → 新 Sim 恢复 → 继续运行行为一致', () => {
  const s1 = new Sim();
  buildExample(s1);
  run(s1, 120);
  const data = s1.serialize();
  const s2 = new Sim();
  s2.load(JSON.parse(JSON.stringify(data)));
  assert.strictEqual(s2.conservationError(), 0, '读档后守恒应成立');
  // 并行继续运行
  for (let i = 0; i < 60 * STEP_S; i++) { s1.tick(DT); s2.tick(DT); }
  const r1 = s1.ledger.exported.robot, r2 = s2.ledger.exported.robot;
  assert.ok(Math.abs(r1 - r2) <= 4, `继续运行 60s 后出货应接近: ${r1} vs ${r2}`);
  assert.strictEqual(s1.conservationError(), 0);
  assert.strictEqual(s2.conservationError(), 0);
  // 在途物品也被恢复
  const live1 = s1.liveCount(), live2 = s2.liveCount();
  const t1 = ITEM_ORDER.reduce((a, k) => a + live1[k], 0);
  const t2 = ITEM_ORDER.reduce((a, k) => a + live2[k], 0);
  assert.ok(Math.abs(t1 - t2) <= 6, `在途物品数应接近: ${t1} vs ${t2}`);
});

// ------------------------------------------------------------
ok('拆除与搬移：拆除记账 destroyed；搬移不丢物品', () => {
  const s = new Sim();
  s.place('extractor', 5, 28, 3);
  s.place('belt', 5, 27, 3);
  s.place('belt', 5, 26, 3);
  s.place('belt', 5, 25, 3);
  s.place('export', 5, 24, 0);
  run(s, 40);
  assert.strictEqual(s.conservationError(), 0);
  // 搬移采矿机（保留缓存物品）到矿脉另一格，改接回干线
  const nBefore = s.ledger.exported.iron_ore;
  const data = s.extractEnt(5, 28)!;
  assert.ok(data.k === 'extractor');
  assert.ok(s.insertEnt({ k: 'extractor', x: 6, y: 28, r: 2 })); // 朝西输出
  s.place('belt', 5, 28, 3); // 转向北汇入干线
  run(s, 40);
  assert.strictEqual(s.conservationError(), 0, '搬移后守恒仍成立');
  assert.ok(s.ledger.exported.iron_ore > nBefore, '搬移后继续出货');
  // 拆掉出口让传送带满载，再拆载货传送带 → 记入 destroyed
  s.remove(5, 24);
  run(s, 40);
  const b = s.get(5, 26)!;
  const n = b.items!.length;
  assert.ok(n > 0, '测试前提：带上应有物品');
  s.remove(5, 26);
  assert.ok(s.ledger.destroyed.iron_ore >= n, '拆除物品应记入 destroyed');
  assert.strictEqual(s.conservationError(), 0, '拆除后守恒仍成立');
});

// ------------------------------------------------------------
ok('布局变更即时生效：切断齿轮供应 → 装配机饥饿', () => {
  const s = new Sim();
  buildExample(s);
  run(s, 300);
  const rate0 = s.exportPerMin('robot');
  assert.ok(rate0 >= 8, `基线产能 ${rate0.toFixed(1)}`);
  // 切断齿轮干线（拆 M2 输出带）
  s.remove(7, 12);
  run(s, 150); // 60s 滑窗 + 装配机在制缓冲 ~35s，需足够时间让产能真正掉下来
  const rate1 = s.exportPerMin('robot');
  assert.ok(rate1 < rate0 * 0.3, `切断后产能应骤降: ${rate0.toFixed(1)} → ${rate1.toFixed(1)}`);
  const a2 = s.procs.find(e => e.kind === 'assembler' && e.x === 12)!;
  assert.ok(a2.emaS! > 0.3 || a2.state === 'starved', '机器人装配机应处于缺料状态');
  assert.strictEqual(s.conservationError(), 0, '布局变更（拆除）后守恒仍成立');
});

// ------------------------------------------------------------
ok('长时间稳定性：示例工厂 2400 秒运行无异常', () => {
  const s = new Sim();
  buildExample(s);
  run(s, 2400, 120);
  assert.strictEqual(s.conservationError(), 0);
  assert.ok(s.ledger.exported.robot >= 400);
});

// ------------------------------------------------------------
// 守恒校验贯穿所有用例：produced - exported - destroyed === 场上现存，误差为 0
