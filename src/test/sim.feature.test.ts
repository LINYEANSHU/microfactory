// ============================================================
// MicroFactory · 精进阶段功能测试（回收机 / 历史曲线，vitest 运行）
// ============================================================
import assert from 'node:assert';
import { test } from 'vitest';
import { Sim } from '../sim/engine';
import type { ItemKey } from '../core/defs';

const DT = 1 / 30;

function run(sim: Sim, seconds: number, checkEvery = 10) {
  for (let s = 0; s < seconds; s++) {
    for (let t = 0; t < 30; t++) sim.tick(DT);
    if (checkEvery > 0 && (s + 1) % checkEvery === 0) {
      assert.strictEqual(sim.conservationError(), 0, `守恒失败 @${sim.time.toFixed(0)}s`);
    }
  }
}

/**
 * 从场外向 (5,23) 北向直塞物品（回收机背面输入口）。
 * 直塞绕过了正常生产链，需在测试侧补记 produced（视为场外已生产），守恒式才成立。
 */
function inject(s: Sim, ty: ItemKey, n: number) {
  for (let i = 0; i < n; i++) {
    assert.ok(s.tryPushTo(5, 23, 3, ty), `第 ${i + 1} 件 ${ty} 应被接收`);
    s.ledger.produced[ty]++;
  }
}

// 沿用原有用例名；vitest 逐项执行，断言抛错即该用例失败
const ok = (name: string, fn: () => void) => test(name, fn);

// ------------------------------------------------------------
// 生产线：采矿 → 熔炼 → 冲压(齿轮) → 回收机 → 出货
// ------------------------------------------------------------
function gearRecycleLine(s: Sim) {
  s.place('extractor', 5, 28, 3);
  s.place('belt', 5, 27, 3);
  s.place('furnace', 5, 26, 3);
  s.place('belt', 5, 25, 3);
  s.place('press', 5, 24, 3);
  s.place('belt', 5, 23, 3);
  s.place('recycler', 5, 22, 3); // 背面(南侧)收齿轮，向北出铁锭
  s.place('belt', 5, 21, 3);
  s.place('export', 5, 20, 0);
}

ok('回收机整线：齿轮 → 铁锭 → 出货，守恒成立', () => {
  const s = new Sim();
  gearRecycleLine(s);
  run(s, 90);
  assert.ok(s.ledger.exported.iron_ingot >= 5, `应持续回收集成铁锭，实际 ${s.ledger.exported.iron_ingot}`);
  assert.ok(s.procs.find(p => p.kind === 'recycler'), '回收机应归类为加工机器');
  assert.strictEqual(s.conservationError(), 0);
});

// ------------------------------------------------------------
ok('回收机直推：齿轮逐件分解，产出/消耗记账准确', () => {
  const s = new Sim();
  s.place('recycler', 5, 22, 3);
  s.place('belt', 5, 21, 3);
  s.place('export', 5, 20, 0);
  // 从南侧 (5,23) 向北推入回收机背面输入口（单品上限 6）
  inject(s, 'gear', 6);
  assert.strictEqual(s.tryPushTo(5, 23, 3, 'gear'), false, '超过单品上限 6 应拒收第 7 个');
  run(s, 50);
  assert.strictEqual(s.ledger.consumed.gear, 6, '6 个齿轮应全部投入回收');
  assert.strictEqual(s.ledger.produced.iron_ingot, 6, '分解应产出 6 铁锭（完美拆解）');
  assert.strictEqual(s.ledger.exported.iron_ingot, 6, '6 铁锭应全部出货');
  assert.strictEqual(s.conservationError(), 0);
});

// ------------------------------------------------------------
ok('机器人拆解：1 机器人 → 2 铁锭 + 1 铜锭', () => {
  const s = new Sim();
  s.place('recycler', 5, 22, 3);
  s.place('belt', 5, 21, 3);
  s.place('export', 5, 20, 0);
  assert.ok(s.tryPushTo(5, 23, 3, 'robot'));
  assert.ok(s.tryPushTo(5, 23, 3, 'robot'));
  s.ledger.produced.robot += 2; // 直塞补记账
  run(s, 40);
  assert.strictEqual(s.ledger.exported.iron_ingot, 4, '2 机器人应拆出 4 铁锭');
  assert.strictEqual(s.ledger.exported.copper_ingot, 2, '2 机器人应拆出 2 铜锭');
  assert.strictEqual(s.conservationError(), 0);
});

// ------------------------------------------------------------
ok('混合进料：齿轮与铜线按配方优先级依次分解', () => {
  const s = new Sim();
  s.place('recycler', 5, 22, 3);
  s.place('belt', 5, 21, 3);
  s.place('export', 5, 20, 0);
  for (let i = 0; i < 3; i++) assert.ok(s.tryPushTo(5, 23, 3, 'gear'));
  for (let i = 0; i < 4; i++) assert.ok(s.tryPushTo(5, 23, 3, 'wire'));
  s.ledger.produced.gear += 3; // 直塞补记账
  s.ledger.produced.wire += 4;
  run(s, 60);
  assert.strictEqual(s.ledger.exported.iron_ingot, 3, '3 齿轮 → 3 铁锭');
  assert.strictEqual(s.ledger.exported.copper_ingot, 2, '4 铜线(2件/配方) → 2 铜锭');
  assert.strictEqual(s.conservationError(), 0);
});

// ------------------------------------------------------------
ok('回收机升级：Lv2 分解速度 ≈ 1.5 倍（3s → 2s）', () => {
  const firstAt = (level: number): number => {
    const s = new Sim();
    s.place('recycler', 5, 22, 3);
    s.place('belt', 5, 21, 3);
    s.place('export', 5, 20, 0);
    if (level > 1) assert.ok(s.upgrade(5, 22), '升级应成功');
    assert.ok(s.tryPushTo(5, 23, 3, 'gear'));
    s.ledger.produced.gear++; // 直塞补记账
    while (s.ledger.produced.iron_ingot < 1 && s.time < 20) s.tick(DT);
    return s.time;
  };
  const t1 = firstAt(1);
  const t2 = firstAt(2);
  assert.ok(t1 > 2.6 && t1 < 3.6, `Lv1 首件分解应在 ≈3s，实际 ${t1.toFixed(2)}s`);
  assert.ok(t2 > 1.6 && t2 < 2.5, `Lv2 首件分解应在 ≈2s，实际 ${t2.toFixed(2)}s`);
});

// ------------------------------------------------------------
ok('历史曲线：每 10 秒采样、窗口封顶 360 点、随存档往返', () => {
  const s = new Sim();
  s.place('extractor', 5, 28, 3);
  s.place('belt', 5, 27, 3);
  s.place('export', 5, 26, 0);
  run(s, 35, 0);
  assert.strictEqual(s.hist.length, 3, `35 秒应有 3 个采样点（10/20/30s），实际 ${s.hist.length}`);
  assert.deepStrictEqual(s.hist.map(h => h.t), [10, 20, 30]);
  for (let i = 1; i < s.hist.length; i++) {
    assert.ok(s.hist[i].exported >= s.hist[i - 1].exported, '累计出货应单调不减');
  }
  // 窗口封顶
  for (let i = 0; i < 400; i++) s.hist.push({ t: i * 10, credits: 0, exported: 0 });
  run(s, 11, 0); // 触发一次新采样 → 应淘汰旧点，长度保持 360
  assert.strictEqual(s.hist.length, 360, `历史窗口应封顶 360 点，实际 ${s.hist.length}`);
  // 存档往返
  const snap = JSON.parse(JSON.stringify(s.serialize()));
  const s2 = new Sim();
  s2.load(snap);
  assert.strictEqual(s2.hist.length, s.hist.length, '读档后历史点数应一致');
  assert.deepStrictEqual(s2.hist[s2.hist.length - 1], s.hist[s.hist.length - 1], '末点内容应一致');
  assert.strictEqual(s2.conservationError(), 0);
});

// ------------------------------------------------------------
ok('回收机存档往返：池内/输出缓存与配方完整恢复', () => {
  const s = new Sim();
  s.place('recycler', 5, 22, 3);
  s.place('belt', 5, 21, 3);
  s.place('export', 5, 20, 0);
  for (let i = 0; i < 4; i++) s.tryPushTo(5, 23, 3, 'gear');
  s.ledger.produced.gear += 4; // 直塞补记账
  run(s, 4, 0); // 首件分解进行中（有 recipe/pool/out 状态）
  const snap = JSON.parse(JSON.stringify(s.serialize()));
  const s2 = new Sim();
  s2.load(snap);
  assert.strictEqual(s2.conservationError(), 0, '读档后守恒成立');
  run(s, 30);
  run(s2, 30);
  assert.strictEqual(s2.ledger.exported.iron_ingot, s.ledger.exported.iron_ingot,
    `继续运行后出货一致: ${s.ledger.exported.iron_ingot} vs ${s2.ledger.exported.iron_ingot}`);
});

// ------------------------------------------------------------
