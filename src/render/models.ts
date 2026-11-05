// ============================================================
// MicroFactory · 机器模型（低多边形组合体 + 运动部件动画）
// 全部模型局部朝向 +X（rot=0 东），由外层 group.rotation.y 统一旋转
// ============================================================
import * as THREE from 'three';
import { M, LAMP } from './materials';
import type { Ent } from '../sim/engine';
import { STORAGE_CAP, EntKind } from '../core/defs';

export interface MachineView {
  group: THREE.Group;
  update(dt: number, time: number, ent: Ent): void;
  dispose(): void;
}

function box(w: number, h: number, d: number, mat: THREE.Material, x = 0, y = 0, z = 0): THREE.Mesh {
  const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
  m.position.set(x, y, z);
  m.castShadow = true;
  m.receiveShadow = true;
  return m;
}
function cyl(rt: number, rb: number, h: number, seg: number, mat: THREE.Material, x = 0, y = 0, z = 0): THREE.Mesh {
  const m = new THREE.Mesh(new THREE.CylinderGeometry(rt, rb, h, seg), mat);
  m.position.set(x, y, z);
  m.castShadow = true;
  m.receiveShadow = true;
  return m;
}

// 状态灯：按机器状态切换共享材质（working 绿 / starved 黄闪 / blocked 红闪 / idle 灰）
function lampBulb(): THREE.Mesh {
  const b = new THREE.Mesh(new THREE.SphereGeometry(0.05, 8, 6), LAMP.off);
  b.castShadow = false;
  return b;
}
function applyLamp(bulb: THREE.Mesh, ent: Ent, time: number) {
  const st = ent.state;
  if (st === 'working') bulb.material = LAMP.green;
  else if (st === 'starved') bulb.material = Math.floor(time * 2.5) % 2 === 0 ? LAMP.yellow : LAMP.off;
  else if (st === 'blocked') bulb.material = Math.floor(time * 3.5) % 2 === 0 ? LAMP.red : LAMP.off;
  else bulb.material = LAMP.off;
}

// ---------------- 简易烟雾 ----------------
class Smoke {
  private parts: { m: THREE.Mesh; life: number; max: number }[] = [];
  private timer = 0;
  constructor(private origin: THREE.Vector3, parent: THREE.Group) {
    const geo = new THREE.SphereGeometry(0.1, 6, 5);
    for (let i = 0; i < 4; i++) {
      const m = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ color: 0xe9edf2, transparent: true, opacity: 0 }));
      m.visible = false;
      parent.add(m);
      this.parts.push({ m, life: 0, max: 0 });
    }
  }
  dispose() {
    // 每个烟团有独立材质；几何由 view 层 traverse 统一释放
    for (const p of this.parts) (p.m.material as THREE.Material).dispose();
  }
  update(dt: number, emit: boolean) {
    this.timer -= dt;
    if (emit && this.timer <= 0) {
      this.timer = 0.5;
      const p = this.parts.find(p => p.life <= 0);
      if (p) { p.life = p.max = 1.6; p.m.visible = true; }
    }
    for (const p of this.parts) {
      if (p.life <= 0) continue;
      p.life -= dt;
      const k = 1 - p.life / p.max; // 0→1
      if (p.life <= 0) { p.m.visible = false; continue; }
      p.m.position.set(this.origin.x + Math.sin(k * 9) * 0.06, this.origin.y + k * 0.8, this.origin.z + Math.cos(k * 7) * 0.06);
      const s = 0.7 + k * 1.8;
      p.m.scale.setScalar(s);
      (p.m.material as THREE.MeshBasicMaterial).opacity = 0.5 * (1 - k);
    }
  }
}

// ---------------- 各机型 ----------------
function buildExtractor(): MachineView {
  const g = new THREE.Group();
  g.add(box(0.84, 0.34, 0.84, M(0x6b7280, { flat: true }), 0, 0.17, 0));
  g.add(box(0.56, 0.4, 0.56, M(0xf2a54a, { flat: true }), 0, 0.54, 0));
  g.add(box(0.34, 0.1, 0.34, M(0xd98c2b, { flat: true }), 0, 0.79, 0));
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
    g.add(box(0.08, 0.36, 0.08, M(0x565e6b, { flat: true }), sx * 0.32, 0.18, sz * 0.32));
  }
  const drill = new THREE.Group();
  const shaft = cyl(0.07, 0.07, 0.3, 8, M(0x3f4756, { metal: 0.5, rough: 0.4 }), 0, 0.15, 0);
  const bit = new THREE.Mesh(new THREE.ConeGeometry(0.1, 0.26, 8), M(0x8b93a5, { metal: 0.6, rough: 0.35 }));
  bit.rotation.x = Math.PI;
  bit.position.y = -0.1;
  bit.castShadow = true;
  drill.add(shaft, bit);
  drill.position.set(0, 0.72, 0);
  g.add(drill);
  g.add(box(0.22, 0.18, 0.26, M(0x565e6b, { flat: true }), 0.45, 0.28, 0));
  const bulb = lampBulb();
  bulb.position.set(-0.18, 0.92, 0.18);
  g.add(bulb);
  return {
    group: g,
    update(dt, time, ent) {
      if (ent.state === 'working') drill.rotation.y += dt * 8;
      applyLamp(bulb, ent, time);
    },
    dispose() {},
  };
}

function buildFurnace(): MachineView {
  const g = new THREE.Group();
  g.add(box(0.88, 0.62, 0.88, M(0xc96f4a, { flat: true }), 0, 0.31, 0));
  g.add(box(0.72, 0.12, 0.72, M(0x8f4f38, { flat: true }), 0, 0.68, 0));
  g.add(box(0.09, 0.4, 0.46, M(0x6e3b28, { flat: true }), 0.44, 0.3, 0));
  const doorMat = new THREE.MeshStandardMaterial({ color: 0x51241a, emissive: 0xff7a3d, emissiveIntensity: 0.15, roughness: 0.6 });
  const door = box(0.05, 0.28, 0.34, doorMat, 0.462, 0.3, 0);
  door.castShadow = false;
  g.add(door);
  g.add(cyl(0.1, 0.12, 0.55, 8, M(0x7a5a48, { flat: true }), -0.22, 0.95, -0.2));
  g.add(cyl(0.13, 0.13, 0.07, 8, M(0x5d4437, { flat: true }), -0.22, 1.24, -0.2));
  const bulb = lampBulb();
  bulb.position.set(0.2, 0.8, 0.2);
  g.add(bulb);
  const smoke = new Smoke(new THREE.Vector3(-0.22, 1.3, -0.2), g);
  return {
    group: g,
    update(dt, time, ent) {
      const working = ent.state === 'working';
      doorMat.emissiveIntensity = working ? 1.1 + Math.sin(time * 6) * 0.35 + (ent.active || 0) * 0.8 : 0.15;
      smoke.update(dt, working);
      applyLamp(bulb, ent, time);
    },
    dispose() { doorMat.dispose(); smoke.dispose(); },
  };
}

function buildPress(): MachineView {
  const g = new THREE.Group();
  g.add(box(0.92, 0.2, 0.92, M(0x555f70, { flat: true }), 0, 0.1, 0));
  g.add(box(0.54, 0.12, 0.54, M(0x3d4553, { flat: true }), 0, 0.26, 0));
  g.add(box(0.16, 0.72, 0.14, M(0x3d4553, { flat: true }), 0, 0.66, -0.32));
  g.add(box(0.16, 0.72, 0.14, M(0x3d4553, { flat: true }), 0, 0.66, 0.32));
  g.add(box(0.2, 0.16, 0.82, M(0x3d4553, { flat: true }), 0, 1.08, 0));
  g.add(box(0.22, 0.05, 0.6, M(0xf2c14e, { flat: true }), 0, 0.99, 0));
  const piston = new THREE.Group();
  piston.add(cyl(0.07, 0.07, 0.5, 8, M(0x8b93a5, { metal: 0.5, rough: 0.4 }), 0, 0.25, 0));
  piston.add(box(0.3, 0.12, 0.3, M(0x555f70, { flat: true }), 0, 0, 0));
  piston.add(box(0.18, 0.07, 0.18, M(0xf2c14e, { flat: true }), 0, -0.09, 0));
  piston.position.set(0, 0.98, 0);
  g.add(piston);
  const bulb = lampBulb();
  bulb.position.set(0.14, 1.2, 0.14);
  g.add(bulb);
  return {
    group: g,
    update(dt, time, ent) {
      const k = ent.state === 'working' ? Math.max(0, Math.min(1, (ent.progress! - 0.55) / 0.45)) : 0;
      piston.position.y = 0.98 - 0.45 * k * k * (3 - 2 * k);
      applyLamp(bulb, ent, time);
    },
    dispose() {},
  };
}

function buildAssembler(): MachineView {
  const g = new THREE.Group();
  g.add(box(0.88, 0.52, 0.88, M(0x3e8e8c, { flat: true }), 0, 0.26, 0));
  g.add(box(0.68, 0.1, 0.68, M(0x2f6b69, { flat: true }), 0, 0.57, 0));
  g.add(box(0.16, 0.26, 0.44, M(0x2f6b69, { flat: true }), -0.44, 0.52, 0));
  g.add(box(0.44, 0.26, 0.16, M(0x2f6b69, { flat: true }), 0, 0.52, -0.44));
  const gear = cyl(0.21, 0.21, 0.07, 8, M(0xd8dde6, { metal: 0.45, rough: 0.35, flat: true }), 0, 0.67, 0);
  const pin = cyl(0.05, 0.05, 0.1, 8, M(0x8b93a5), 0, 0.67, 0);
  g.add(gear, pin);
  g.add(cyl(0.015, 0.015, 0.22, 6, M(0x2f6b69), 0.22, 0.72, 0.22));
  const bulb = lampBulb();
  bulb.position.set(0.22, 0.85, 0.22);
  g.add(bulb);
  return {
    group: g,
    update(dt, time, ent) {
      const w = ent.state === 'working';
      gear.rotation.y += dt * (w ? 3.2 : ent.state === 'idle' ? 0 : 0.7);
      if (w) gear.position.y = 0.67 + Math.sin(time * 5) * 0.015;
      applyLamp(bulb, ent, time);
    },
    dispose() {},
  };
}

function buildNode(accentA: number, accentB: number, discColor: number): MachineView {
  const g = new THREE.Group();
  g.add(box(0.94, 0.12, 0.94, M(accentA, { flat: true }), 0, 0.06, 0));
  g.add(box(0.62, 0.09, 0.62, M(accentB, { flat: true }), 0, 0.165, 0));
  const disc = cyl(0.17, 0.17, 0.06, 6, M(discColor, { metal: 0.3, rough: 0.5, flat: true }), 0, 0.25, 0);
  g.add(disc);
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
    g.add(box(0.06, 0.22, 0.06, M(0x3d4553, { flat: true }), sx * 0.4, 0.11, sz * 0.4));
  }
  return {
    group: g,
    update(dt, _time, ent) {
      disc.rotation.y += dt * ((ent.queue?.length || 0) > 0 ? 2.4 : 0.4);
    },
    dispose() {},
  };
}

function buildStorage(): MachineView {
  const g = new THREE.Group();
  g.add(box(0.9, 0.08, 0.9, M(0x8a6b48, { flat: true }), 0, 0.04, 0));
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
    g.add(box(0.09, 0.56, 0.09, M(0x6b543a, { flat: true }), sx * 0.38, 0.36, sz * 0.38));
  }
  const fillMat = new THREE.MeshStandardMaterial({ color: 0xf2b04a, transparent: true, opacity: 0.34, roughness: 0.7 });
  const fill = box(0.7, 0.5, 0.7, fillMat, 0, 0.36, 0);
  fill.castShadow = false;
  g.add(fill);
  g.add(box(0.96, 0.07, 0.96, M(0x6b543a, { flat: true }), 0, 0.68, 0));
  g.add(box(0.5, 0.04, 0.14, M(0xf2c14e, { flat: true }), 0, 0.73, 0.42));
  return {
    group: g,
    update(_dt, _time, ent) {
      const f = Math.min(1, (ent.queue?.length || 0) / STORAGE_CAP);
      fill.scale.y = Math.max(0.08, f);
      fill.position.y = 0.11 + 0.25 * Math.max(0.08, f);
    },
    dispose() { fillMat.dispose(); },
  };
}

function buildExport(): MachineView {
  const g = new THREE.Group();
  g.add(cyl(0.5, 0.54, 0.1, 24, M(0x3d4454, { flat: true }), 0, 0.05, 0));
  g.add(cyl(0.32, 0.32, 0.03, 24, M(0x2b303b), 0, 0.11, 0));
  const ringMat = new THREE.MeshStandardMaterial({ color: 0x1d3a45, emissive: 0x4dd8ff, emissiveIntensity: 0.9, roughness: 0.4 });
  const ring = new THREE.Mesh(new THREE.TorusGeometry(0.36, 0.035, 8, 32), ringMat);
  ring.rotation.x = -Math.PI / 2;
  ring.position.y = 0.14;
  g.add(ring);
  const beamMat = new THREE.MeshBasicMaterial({ color: 0x8fe8ff, transparent: true, opacity: 0, depthWrite: false, side: THREE.DoubleSide });
  const beam = new THREE.Mesh(new THREE.CylinderGeometry(0.26, 0.34, 1.3, 12, 1, true), beamMat);
  beam.position.y = 0.75;
  g.add(beam);
  const tips: THREE.Mesh[] = [];
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
    g.add(box(0.07, 0.34, 0.07, M(0x565e6b, { flat: true }), sx * 0.42, 0.27, sz * 0.42));
    const tip = new THREE.Mesh(new THREE.SphereGeometry(0.045, 8, 6), LAMP.green);
    tip.position.set(sx * 0.42, 0.47, sz * 0.42);
    g.add(tip);
    tips.push(tip);
  }
  return {
    group: g,
    update(dt, _time, ent) {
      const a = ent.active || 0;
      ringMat.emissiveIntensity = 0.8 + a * 2.6;
      ring.rotation.z += dt * 0.6;
      beamMat.opacity = a * 0.3;
      beam.scale.y = 1 + a * 0.6;
      beam.position.y = 0.75 + a * 0.2;
      for (const t of tips) t.material = a > 0.4 ? LAMP.green : LAMP.off;
    },
    dispose() { ringMat.dispose(); beamMat.dispose(); },
  };
}

function buildRecycler(): MachineView {
  const g = new THREE.Group();
  g.add(box(0.9, 0.3, 0.9, M(0x5f5347, { flat: true }), 0, 0.15, 0));
  g.add(box(0.78, 0.1, 0.78, M(0x4a4038, { flat: true }), 0, 0.35, 0));
  // 进料斗（背面，斜置方锥口）
  const hopper = box(0.5, 0.22, 0.5, M(0x8a6b48, { flat: true }), 0, 0.48, -0.18);
  hopper.rotation.x = 0.22;
  g.add(hopper);
  // 锯盘：破碎机的标志部件，运转时旋转
  const blade = new THREE.Group();
  const disc = cyl(0.3, 0.3, 0.05, 12, M(0x9aa3b2, { metal: 0.55, rough: 0.35, flat: true }), 0, 0, 0);
  disc.rotation.x = Math.PI / 2;
  blade.add(disc);
  for (let i = 0; i < 6; i++) {
    const tooth = box(0.07, 0.16, 0.03, M(0xd8dde6, { metal: 0.4, rough: 0.4, flat: true }));
    const a = (i / 6) * Math.PI * 2;
    tooth.position.set(Math.cos(a) * 0.28, Math.sin(a) * 0.28, 0);
    tooth.rotation.z = a + Math.PI / 2;
    blade.add(tooth);
  }
  blade.position.set(0, 0.55, 0.1);
  g.add(blade);
  // 机架与出料槽（正面）
  for (const sx of [-1, 1]) {
    g.add(box(0.08, 0.34, 0.08, M(0x3d4553, { flat: true }), sx * 0.3, 0.44, 0.28));
  }
  g.add(box(0.4, 0.06, 0.24, M(0xf2c14e, { flat: true }), 0, 0.3, 0.44));
  const bulb = lampBulb();
  bulb.position.set(0.3, 0.62, 0.22);
  g.add(bulb);
  return {
    group: g,
    update(dt, time, ent) {
      const w = ent.state === 'working';
      blade.rotation.z += dt * (w ? 6.5 : ent.state === 'idle' ? 0 : 0.8);
      applyLamp(bulb, ent, time);
    },
    dispose() {},
  };
}

const BUILDERS: Record<EntKind, () => MachineView> = {
  extractor: buildExtractor,
  furnace: buildFurnace,
  press: buildPress,
  assembler: buildAssembler,
  recycler: buildRecycler,
  splitter: () => buildNode(0x454c5c, 0x5b6470, 0x8b93a5),
  merger: () => buildNode(0x5b6470, 0x454c5c, 0xd8a04e),
  storage: buildStorage,
  export: buildExport,
  belt: () => ({ group: new THREE.Group(), update() {}, dispose() {} }), // 传送带由合并网格渲染
  turbo: () => ({ group: new THREE.Group(), update() {}, dispose() {} }),
};

export function buildMachine(kind: EntKind): MachineView {
  return BUILDERS[kind]();
}
