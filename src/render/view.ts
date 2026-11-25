// ============================================================
// MicroFactory · 工厂视图：机器实例 / 传送带合并网格 / 物品实例化渲染 / 叠加层
// ============================================================
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { World } from './world';
import { M, makeBeltTexture, cellX, cellZ, dirAngle } from './materials';
import { buildMachine, type MachineView } from './models';
import { Sim, type Ent } from '../sim/engine';
import {
  ITEMS, ITEM_ORDER, ItemKey, EntKind, Dir, DEFS, DIRS, relDir,
  GRID, BELT_SPEED, TURBO_SPEED, beltWorldPosInto, type BeltWorldResult,
  FRONT, RIGHT, LEFT, BACK,
} from '../core/defs';

// ---------------- 物品几何 ----------------
interface ItemVisual { geo: THREE.BufferGeometry; y: number; spin: boolean; mat: THREE.Material }

function robotGeometry(): THREE.BufferGeometry {
  const body = new THREE.BoxGeometry(0.13, 0.11, 0.1);
  body.translate(0, 0, 0);
  const head = new THREE.BoxGeometry(0.09, 0.07, 0.08);
  head.translate(0.005, 0.085, 0);
  const eye = new THREE.BoxGeometry(0.06, 0.02, 0.012);
  eye.translate(0.005, 0.085, 0.046);
  const merged = mergeGeometries([body, head, eye])!;
  body.dispose(); head.dispose(); eye.dispose();
  return merged;
}

const ITEM_VIS: Record<ItemKey, () => ItemVisual> = {
  iron_ore: () => ({ geo: new THREE.DodecahedronGeometry(0.095, 0), y: 0.185, spin: true, mat: M(ITEMS.iron_ore.color, { flat: true, rough: 0.9 }) }),
  copper_ore: () => ({ geo: new THREE.DodecahedronGeometry(0.095, 0), y: 0.185, spin: true, mat: M(ITEMS.copper_ore.color, { flat: true, rough: 0.9 }) }),
  iron_ingot: () => ({ geo: new THREE.BoxGeometry(0.2, 0.08, 0.12), y: 0.15, spin: false, mat: M(ITEMS.iron_ingot.color, { metal: 0.35, rough: 0.45 }) }),
  copper_ingot: () => ({ geo: new THREE.BoxGeometry(0.2, 0.08, 0.12), y: 0.15, spin: false, mat: M(ITEMS.copper_ingot.color, { metal: 0.35, rough: 0.45 }) }),
  gear: () => ({ geo: new THREE.CylinderGeometry(0.1, 0.1, 0.06, 8), y: 0.155, spin: true, mat: M(ITEMS.gear.color, { metal: 0.4, rough: 0.4, flat: true }) }),
  wire: () => { const g = new THREE.TorusGeometry(0.065, 0.024, 6, 14); g.rotateX(Math.PI / 2); return { geo: g, y: 0.155, spin: false, mat: M(ITEMS.wire.color, { metal: 0.4, rough: 0.45 }) }; },
  circuit: () => ({ geo: new THREE.BoxGeometry(0.17, 0.035, 0.13), y: 0.15, spin: false, mat: M(ITEMS.circuit.color, { rough: 0.6 }) }),
  robot: () => ({ geo: robotGeometry(), y: 0.155, spin: false, mat: M(ITEMS.robot.color, { rough: 0.55 }) }),
};

const MAX_INST = 2000;

export class FactoryView {
  machinesRoot = new THREE.Group();
  beltRoot = new THREE.Group();
  itemRoot = new THREE.Group();
  overlayRoot = new THREE.Group();

  private views = new Map<number, MachineView>();
  private pipsByEnt = new Map<number, THREE.Mesh[]>();
  private beltsDirty = true;
  private beltSurfMat: THREE.MeshStandardMaterial;
  private turboSurfMat: THREE.MeshStandardMaterial;
  private beltMeshes: THREE.Mesh[] = [];

  private itemMeshes = new Map<ItemKey, THREE.InstancedMesh>();
  private itemVis = new Map<ItemKey, ItemVisual>();
  private tmpM = new THREE.Matrix4();
  private tmpP = new THREE.Vector3();
  private tmpQ = new THREE.Quaternion();
  private tmpE = new THREE.Euler();
  private tmpS = new THREE.Vector3(1, 1, 1);
  // 每帧复用的临时对象（避免 GC 压力）
  private itemCounts = new Map<ItemKey, number>();
  private itemsDirty = true;
  private beltPosScratch: BeltWorldResult = { x: 0, z: 0, yaw: 0 };
  private ndcScratch = new THREE.Vector2();
  private planeHitScratch = new THREE.Vector3();

  // 叠加层
  hoverQuad: THREE.Mesh;
  selRing: THREE.Mesh;
  private ghost: THREE.Group | null = null;
  private ghostKind: EntKind | null = null;
  private ghostView: MachineView | null = null; // 幽灵机型的原生材质（doorMat 等）随 dispose 释放
  private ghostConeGeo: THREE.BufferGeometry | null = null;
  private ghostMatOk = new THREE.MeshBasicMaterial({ color: 0x9fe8a8, transparent: true, opacity: 0.45, depthWrite: false });
  private ghostMatBad = new THREE.MeshBasicMaterial({ color: 0xff6b5a, transparent: true, opacity: 0.5, depthWrite: false });
  private ghostMats: THREE.MeshBasicMaterial[] = [];
  private ghostArrowMats: THREE.MeshBasicMaterial[] = [];
  private portHints = new THREE.Group();

  private raycaster = new THREE.Raycaster();
  private pickPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);

  constructor(private world: World, private sim: Sim) {
    world.scene.add(this.machinesRoot, this.beltRoot, this.itemRoot, this.overlayRoot);
    this.beltSurfMat = new THREE.MeshStandardMaterial({ map: makeBeltTexture(false), roughness: 0.9 });
    this.turboSurfMat = new THREE.MeshStandardMaterial({ map: makeBeltTexture(true), roughness: 0.85, emissive: 0x0e2a30, emissiveIntensity: 0.8 });
    // 物品实例（几何/材质仅构建一次）
    for (const ty of ITEM_ORDER) {
      const v = ITEM_VIS[ty]();
      this.itemVis.set(ty, v);
      const im = new THREE.InstancedMesh(v.geo, v.mat, MAX_INST);
      im.count = 0;
      im.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
      im.castShadow = true;
      im.frustumCulled = false;
      this.itemMeshes.set(ty, im);
      this.itemRoot.add(im);
    }
    // 悬停高亮
    this.hoverQuad = new THREE.Mesh(
      new THREE.PlaneGeometry(0.96, 0.96),
      new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.14, depthWrite: false }),
    );
    this.hoverQuad.rotation.x = -Math.PI / 2;
    this.hoverQuad.position.y = 0.115;
    this.hoverQuad.visible = false;
    this.overlayRoot.add(this.hoverQuad);
    // 选中环
    this.selRing = new THREE.Mesh(
      new THREE.RingGeometry(0.36, 0.47, 32),
      new THREE.MeshBasicMaterial({ color: 0xffc24a, transparent: true, opacity: 0.95, depthWrite: false, side: THREE.DoubleSide }),
    );
    this.selRing.rotation.x = -Math.PI / 2;
    this.selRing.position.y = 0.13;
    this.selRing.visible = false;
    this.overlayRoot.add(this.selRing, this.portHints);
  }

  // ---------------- 结构变更 ----------------
  onPlaced(ent: Ent) {
    this.itemsDirty = true;
    if (ent.kind === 'belt' || ent.kind === 'turbo') { this.beltsDirty = true; return; }
    const v = buildMachine(ent.kind);
    v.group.position.set(cellX(ent.x), 0, cellZ(ent.y));
    v.group.rotation.y = dirAngle(ent.rot);
    v.group.userData.entId = ent.id;
    this.views.set(ent.id, v);
    this.machinesRoot.add(v.group);
    if (ent.level !== undefined) this.attachPips(ent, v);
  }

  // 等级信号灯：加工机器角落的竖排三格指示塔
  private attachPips(ent: Ent, v: MachineView) {
    const off = M(0x2b313b, { flat: true });
    const post = new THREE.Mesh(new THREE.BoxGeometry(0.035, 0.46, 0.035), M(0x3d4553, { flat: true }));
    post.position.set(-0.32, 0.78, -0.32);
    post.castShadow = true;
    v.group.add(post);
    const meshes: THREE.Mesh[] = [];
    for (let i = 0; i < 3; i++) {
      const m = new THREE.Mesh(new THREE.BoxGeometry(0.075, 0.055, 0.045), off);
      m.position.set(-0.32, 0.615 + i * 0.115, -0.32);
      v.group.add(m);
      meshes.push(m);
    }
    this.pipsByEnt.set(ent.id, meshes);
    this.setPips(ent);
  }

  private setPips(ent: Ent) {
    const meshes = this.pipsByEnt.get(ent.id);
    if (!meshes) return;
    const on = M(0xf5a524, { emissive: 0xf5a524, emissiveIntensity: 1.5 });
    const off = M(0x2b313b, { flat: true });
    meshes.forEach((m, i) => { m.material = i < (ent.level || 1) ? on : off; });
  }

  onUpgraded(ent: Ent) {
    this.setPips(ent);
    ent.active = Math.max(ent.active || 0, 2);
  }

  onRemoved(ent: Ent) {
    this.itemsDirty = true;
    if (ent.kind === 'belt' || ent.kind === 'turbo') { this.beltsDirty = true; return; }
    this.pipsByEnt.delete(ent.id);
    const v = this.views.get(ent.id);
    if (v) {
      this.machinesRoot.remove(v.group);
      v.group.traverse((o: any) => { if (o.geometry) o.geometry.dispose(); });
      v.dispose();
      this.views.delete(ent.id);
    }
  }

  onRotated(ent: Ent) {
    this.itemsDirty = true;
    if (ent.kind === 'belt' || ent.kind === 'turbo') { this.beltsDirty = true; return; }
    const v = this.views.get(ent.id);
    if (v) v.group.rotation.y = dirAngle(ent.rot);
  }

  reset() {
    for (const [, v] of this.views) {
      this.machinesRoot.remove(v.group);
      v.group.traverse((o: any) => { if (o.geometry) o.geometry.dispose(); });
      v.dispose();
    }
    this.views.clear();
    this.pipsByEnt.clear();
    for (const m of this.beltMeshes) {
      this.beltRoot.remove(m);
      m.geometry.dispose();
    }
    this.beltMeshes = [];
    this.beltsDirty = true;
    for (const ty of ITEM_ORDER) this.itemMeshes.get(ty)!.count = 0;
    this.setSelection(null);
    this.setGhost(null, 0, true);
  }

  rebuildAll() {
    this.itemsDirty = true;
    this.reset();
    for (const e of [...this.sim.procs, ...this.sim.nodes, ...this.sim.terminals]) this.onPlaced(e);
    this.beltsDirty = true;
  }

  markBeltsDirty() { this.beltsDirty = true; }

  // ---------------- 传送带合并网格 ----------------
  private rebuildBelts() {
    for (const m of this.beltMeshes) { this.beltRoot.remove(m); m.geometry.dispose(); }
    this.beltMeshes = [];
    const darks: THREE.BufferGeometry[] = [];
    const surfs: THREE.BufferGeometry[] = [];
    const tDarks: THREE.BufferGeometry[] = [];
    const tSurfs: THREE.BufferGeometry[] = [];

    // 基础几何（局部：行进方向 = +X）
    const baseGeo = new THREE.BoxGeometry(0.96, 0.08, 0.96); baseGeo.translate(0, 0.04, 0);
    const railL = new THREE.BoxGeometry(0.96, 0.12, 0.07); railL.translate(0, 0.09, -0.445);
    const railR = new THREE.BoxGeometry(0.96, 0.12, 0.07); railR.translate(0, 0.09, 0.445);
    const surfGeo = new THREE.BoxGeometry(0.7, 0.02, 0.92); surfGeo.rotateY(Math.PI / 2); surfGeo.translate(0, 0.09, 0);

    for (const b of this.sim.belts) {
      const rotM = new THREE.Matrix4().makeRotationY(dirAngle(b.rot));
      const posM = new THREE.Matrix4().makeTranslation(cellX(b.x), 0, cellZ(b.y));
      const m = posM.multiply(rotM);
      const dark = b.kind === 'turbo' ? tDarks : darks;
      const surf = b.kind === 'turbo' ? tSurfs : surfs;
      for (const g of [baseGeo, railL, railR]) dark.push(g.clone().applyMatrix4(m));
      surf.push(surfGeo.clone().applyMatrix4(m));
    }
    baseGeo.dispose(); railL.dispose(); railR.dispose(); surfGeo.dispose();

    const darkMat = M(0x3a414e, { flat: true });
    const tDarkMat = M(0x2e5560, { flat: true });
    const add = (geos: THREE.BufferGeometry[], mat: THREE.Material) => {
      if (geos.length === 0) return;
      const merged = mergeGeometries(geos)!;
      for (const g of geos) g.dispose();
      const mesh = new THREE.Mesh(merged, mat);
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      this.beltRoot.add(mesh);
      this.beltMeshes.push(mesh);
    };
    add(darks, darkMat); add(surfs, this.beltSurfMat);
    add(tDarks, tDarkMat); add(tSurfs, this.turboSurfMat);
    this.beltsDirty = false;
  }

  // 单格传送带视觉（ghost / 图标用）
  static buildBeltCellVisual(turbo: boolean, surfMat?: THREE.Material): THREE.Group {
    const g = new THREE.Group();
    const dark = turbo ? M(0x2e5560, { flat: true }) : M(0x3a414e, { flat: true });
    const base = new THREE.Mesh(new THREE.BoxGeometry(0.96, 0.08, 0.96), dark);
    base.position.y = 0.04;
    const rl = new THREE.Mesh(new THREE.BoxGeometry(0.96, 0.12, 0.07), dark);
    rl.position.set(0, 0.09, -0.445);
    const rr = new THREE.Mesh(new THREE.BoxGeometry(0.96, 0.12, 0.07), dark);
    rr.position.set(0, 0.09, 0.445);
    const surf = new THREE.Mesh(
      (() => { const gg = new THREE.BoxGeometry(0.7, 0.02, 0.92); gg.rotateY(Math.PI / 2); gg.translate(0, 0.09, 0); return gg; })(),
      surfMat ?? M(turbo ? 0x39808f : 0x596274, { rough: 0.9 }),
    );
    for (const m of [base, rl, rr, surf]) { m.castShadow = true; m.receiveShadow = true; g.add(m); }
    return g;
  }

  get beltSurfMaterials() { return [this.beltSurfMat, this.turboSurfMat]; }

  // ---------------- 每帧更新 ----------------
  update(dt: number, simTime: number) {
    if (this.beltsDirty) this.rebuildBelts();
    // 传送带表面滚动（用模拟时间 → 暂停时停止）
    // offset 对 1 取模：RepeatWrapping 下与无限累加视觉等价，但避免长会话浮点精度抖动
    const off = (BELT_SPEED * dt) / 1.0;
    this.beltSurfMat.map!.offset.y = (this.beltSurfMat.map!.offset.y - off) % 1;
    this.turboSurfMat.map!.offset.y = (this.turboSurfMat.map!.offset.y - (TURBO_SPEED * dt) / 1.0) % 1;

    for (const e of this.sim.procs) {
      const v = this.views.get(e.id);
      if (v) {
        v.update(dt, simTime, e);
        // 升级脉冲：active 2→1 衰减期间整体轻微放大回弹
        const a = e.active || 0;
        if (a > 1) v.group.scale.setScalar(1 + (a - 1) * 0.07);
        else if (v.group.scale.x !== 1) v.group.scale.setScalar(1);
      }
    }
    for (const e of this.sim.nodes) {
      const v = this.views.get(e.id);
      if (v) v.update(dt, simTime, e);
    }
    for (const e of this.sim.terminals) {
      const v = this.views.get(e.id);
      if (v) v.update(dt, simTime, e);
    }
    if (dt > 0 || this.itemsDirty) {
      this.syncItems(simTime);
      this.itemsDirty = false;
    }

    // 选中环动画
    if (this.selRing.visible) {
      const s = 1 + Math.sin(simTime * 4) * 0.05;
      this.selRing.scale.setScalar(s);
    }
  }

  private syncItems(simTime: number) {
    const counts = this.itemCounts;
    for (const ty of ITEM_ORDER) counts.set(ty, 0);

    for (const b of this.sim.belts) {
      const wx = cellX(b.x), wz = cellZ(b.y);
      for (const it of b.items!) {
        // 零分配：位置写入复用的 scratch 对象
        const w = beltWorldPosInto(b.rot, it.entry, it.p, wx, wz, this.beltPosScratch);
        const h = (b.x * 31 + b.y * 57 + it.p * 91) % 10;
        this.putItem(counts, it.ty, w.x, 0, w.z, w.yaw, h, simTime);
      }
    }
    for (const n of this.sim.nodes) {
      const wx = cellX(n.x), wz = cellZ(n.y);
      const q = n.queue!;
      for (let i = 0; i < q.length; i++) {
        this.putItem(counts, q[i], wx, 0.02 + i * 0.05, wz, dirAngle(n.rot), i * 1.7, simTime);
      }
    }

    for (const ty of ITEM_ORDER) {
      const im = this.itemMeshes.get(ty)!;
      const n = counts.get(ty)!;
      im.count = n;
      // 仅当本帧写入了实例矩阵（n>0）才标记上传，避免空类型每帧全量上传 instanceMatrix
      if (n > 0) im.instanceMatrix.needsUpdate = true;
    }
  }

  private putItem(
    counts: Map<ItemKey, number>, ty: ItemKey,
    x: number, y: number, z: number, yaw: number, spin: number, simTime: number,
  ) {
    const im = this.itemMeshes.get(ty)!;
    const n = counts.get(ty)!;
    if (n >= MAX_INST) return;
    const vis = this.itemVis.get(ty)!;
    this.tmpP.set(x, y + vis.y, z);
    if (vis.spin) {
      this.tmpE.set(simTime * 1.3 + spin, simTime * 2.1 + spin * 2, 0);
    } else {
      this.tmpE.set(0, yaw, 0);
    }
    this.tmpQ.setFromEuler(this.tmpE);
    this.tmpM.compose(this.tmpP, this.tmpQ, this.tmpS);
    im.setMatrixAt(n, this.tmpM);
    counts.set(ty, n + 1);
  }

  // ---------------- 叠加层控制 ----------------
  setHover(cell: { x: number; y: number } | null, mode: 'build' | 'bulldoze' | 'pointer') {
    if (!cell || mode === 'pointer') { this.hoverQuad.visible = false; return; }
    this.hoverQuad.visible = true;
    this.hoverQuad.position.set(cellX(cell.x), 0.115, cellZ(cell.y));
    (this.hoverQuad.material as THREE.MeshBasicMaterial).color.set(mode === 'bulldoze' ? 0xff6b5a : 0xffffff);
    (this.hoverQuad.material as THREE.MeshBasicMaterial).opacity = mode === 'bulldoze' ? 0.25 : 0.14;
  }

  setSelection(ent: Ent | null) {
    if (!ent) { this.selRing.visible = false; this.clearPortHints(); return; }
    this.selRing.visible = true;
    this.selRing.position.set(cellX(ent.x), 0.13, cellZ(ent.y));
    this.rebuildPortHints(ent.kind, ent.rot);
  }

  // 清空端口箭头并释放其几何/材质（箭头材质每次重建，几何共享一个锥体）
  private clearPortHints() {
    if (this.portHints.children.length > 0) {
      const geos = new Set<THREE.BufferGeometry>();
      for (const c of this.portHints.children) {
        const m = c as THREE.Mesh;
        if (m.geometry) geos.add(m.geometry);
        const mat = (m as any).material;
        if (mat) (mat as THREE.Material).dispose();
      }
      for (const g of geos) g.dispose();
    }
    this.portHints.clear();
  }

  private rebuildPortHints(kind: EntKind, rot: number) {
    this.clearPortHints();
    if (kind === 'belt' || kind === 'turbo') return;
    const def = DEFS[kind];
    const cx = cellX(0), cz = cellZ(0); // 相对位置，不依赖具体格
    const coneGeo = new THREE.ConeGeometry(0.07, 0.16, 6);
    const addArrow = (d: number, input: boolean) => {
      const dv = DIRS[d];
      const m = new THREE.Mesh(coneGeo, new THREE.MeshBasicMaterial({
        color: input ? 0x4ade80 : 0xffb03b, transparent: true, opacity: 0.95, depthWrite: false,
      }));
      const px = cx + dv.x * 0.56, pz = cz + dv.y * 0.56;
      m.position.set(px, 0.1, pz);
      // 锥体默认 +Y；rotateX(-π/2) 后尖端指向 -Z
      m.rotation.x = -Math.PI / 2;
      const tipTo = input ? { x: -dv.x, z: -dv.y } : { x: dv.x, z: dv.y }; // 尖端应指向的方向
      m.rotation.z = 0;
      // 将 -Z 旋转到 tipTo：rotation.y = atan2(-tipTo.x, -tipTo.z)?? 直接用四元数
      const q = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 0, -1), new THREE.Vector3(tipTo.x, 0, tipTo.z));
      m.quaternion.copy(q);
      m.rotation.x = 0; // quaternion 覆盖欧拉
      this.portHints.add(m);
    };
    for (const rel of def.inputs) addArrow(relDir(rot as Dir, rel), true);
    for (const rel of def.outputs) addArrow(relDir(rot as Dir, rel), false);
  }

  private ghostDispose() {
    if (!this.ghost) return;
    this.overlayRoot.remove(this.ghost);
    this.ghost.traverse((o: any) => { if (o.geometry) o.geometry.dispose(); });
    this.ghostView?.dispose(); // 释放机型自带的未被幽灵化的材质（炉门/仓库填充/终端光环等）
    this.ghostConeGeo?.dispose();
    for (const m of this.ghostMats) m.dispose();
    for (const m of this.ghostArrowMats) m.dispose();
    this.ghost = null;
    this.ghostKind = null;
    this.ghostView = null;
    this.ghostConeGeo = null;
    this.ghostMats = [];
    this.ghostArrowMats = [];
  }

  setGhost(kind: EntKind | null, rot: number, valid: boolean, turbo?: boolean) {
    if (!kind) {
      this.ghostDispose();
      return;
    }
    if (this.ghostKind !== kind) {
      this.ghostDispose();
      this.ghost = new THREE.Group();
      let child: THREE.Group;
      if (kind === 'belt' || kind === 'turbo') {
        child = FactoryView.buildBeltCellVisual(kind === 'turbo');
        this.ghostView = null;
      } else {
        const v = buildMachine(kind);
        child = v.group;
        this.ghostView = v;
      }
      child.traverse((o: any) => {
        if (o.isMesh) {
          const m = this.ghostMatOk.clone();
          this.ghostMats.push(m);
          o.material = m;
          o.castShadow = false;
          o.receiveShadow = false;
        }
      });
      // 端口箭头（不透明）
      if (kind !== 'belt' && kind !== 'turbo') {
        const def = DEFS[kind];
        const coneGeo = new THREE.ConeGeometry(0.07, 0.16, 6);
        this.ghostConeGeo = coneGeo; // ghostDispose 时统一释放
        const addArrow = (d: number, input: boolean) => {
          const dv = DIRS[d];
          const am = new THREE.MeshBasicMaterial({
            color: input ? 0x4ade80 : 0xffb03b, transparent: true, opacity: 0.95, depthWrite: false,
          });
          this.ghostArrowMats.push(am);
          const m = new THREE.Mesh(coneGeo, am);
          m.position.set(dv.x * 0.56, 0.1, dv.y * 0.56);
          const tipTo = input ? { x: -dv.x, z: -dv.y } : { x: dv.x, z: dv.y };
          const q = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 0, -1), new THREE.Vector3(tipTo.x, 0, tipTo.z));
          m.quaternion.copy(q);
          this.ghost!.add(m);
        };
        for (const rel of def.inputs) addArrow(relDir(rot as Dir, rel), true);
        for (const rel of def.outputs) addArrow(relDir(rot as Dir, rel), false);
      }
      this.ghost.add(child);
      this.overlayRoot.add(this.ghost);
      this.ghostKind = kind;
    }
    if (!this.ghost) return;
    this.ghost.rotation.y = dirAngle(rot);
    const mat = valid ? this.ghostMatOk : this.ghostMatBad;
    for (const m of this.ghostMats!) { m.color.copy(mat.color); m.opacity = mat.opacity; }
  }

  positionGhost(cell: { x: number; y: number } | null) {
    if (!this.ghost) return;
    if (!cell) { this.ghost.visible = false; return; }
    this.ghost.visible = true;
    this.ghost.position.set(cellX(cell.x), 0, cellZ(cell.y));
  }

  // ---------------- 拾取 ----------------
  pickCell(clientX: number, clientY: number): { x: number; y: number } | null {
    const ndc = this.toNdc(clientX, clientY);
    this.raycaster.setFromCamera(ndc, this.world.camera);
    const p = this.planeHitScratch;
    if (!this.raycaster.ray.intersectPlane(this.pickPlane, p)) return null;
    const cx = Math.round(p.x + (GRID - 1) / 2);
    const cy = Math.round(p.z + (GRID - 1) / 2);
    if (cx < 0 || cy < 0 || cx >= GRID || cy >= GRID) return null;
    return { x: cx, y: cy };
  }

  pickEnt(clientX: number, clientY: number): Ent | null {
    const ndc = this.toNdc(clientX, clientY);
    this.raycaster.setFromCamera(ndc, this.world.camera);
    const hits = this.raycaster.intersectObjects(this.machinesRoot.children, true);
    for (const h of hits) {
      let o: THREE.Object3D | null = h.object;
      while (o) {
        if (o.userData && o.userData.entId !== undefined) {
          const ent = this.sim.procs.find(e => e.id === o!.userData.entId)
            || this.sim.nodes.find(e => e.id === o!.userData.entId)
            || this.sim.terminals.find(e => e.id === o!.userData.entId);
          if (ent) return ent;
        }
        o = o.parent;
      }
    }
    return null;
  }

  private toNdc(clientX: number, clientY: number): THREE.Vector2 {
    const r = this.world.renderer.domElement.getBoundingClientRect();
    return this.ndcScratch.set(
      ((clientX - r.left) / r.width) * 2 - 1,
      -((clientY - r.top) / r.height) * 2 + 1,
    );
  }
}
