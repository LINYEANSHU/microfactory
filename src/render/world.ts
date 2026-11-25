// ============================================================
// MicroFactory · 场景/相机/光照/环境（微缩浮岛）
// ============================================================
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { M, makeGroundTexture, cellX, cellZ } from './materials';
import { GRID } from '../core/defs';
import { REGIONS, tileKey, type RegionId } from '../sim/regions';
import type { Sim } from '../sim/engine';

export class World {
  scene = new THREE.Scene();
  camera: THREE.PerspectiveCamera;
  renderer: THREE.WebGLRenderer;
  controls: OrbitControls;
  groundMesh!: THREE.Mesh;
  private clouds: THREE.Group[] = [];
  private islands: THREE.Group[] = [];
  private sun!: THREE.DirectionalLight;
  private regions = new Map<RegionId, THREE.Group>();
  private sites = new Map<number, THREE.Mesh>();
  private plantGeometry = new THREE.ConeGeometry(0.26, 0.62, 5);
  private siteGeometry = new THREE.BoxGeometry(1.08, 0.065, 1.08);
  private landSeed: number | null = null;
  private restorations = -1;
  private limitX = 22;
  private limitZ = 22;
  private flight: { capsule: THREE.Group; elapsed: number } | null = null;

  constructor(container: HTMLElement) {
    this.renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.setSize(container.clientWidth, container.clientHeight);
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.25;
    container.appendChild(this.renderer.domElement);

    this.scene.fog = new THREE.Fog(0xd9ecf7, 75, 170);

    this.camera = new THREE.PerspectiveCamera(42, container.clientWidth / container.clientHeight, 0.1, 400);
    this.camera.position.set(22, 24, 22);

    this.controls = new OrbitControls(this.camera, this.renderer.domElement);
    this.controls.target.set(0, 0, 0);
    this.controls.enableDamping = true;
    this.controls.dampingFactor = 0.08;
    this.controls.rotateSpeed = 0.85;
    this.controls.panSpeed = 0.9;
    this.controls.zoomSpeed = 1.0;
    this.controls.minDistance = 7;
    this.controls.maxDistance = 110;
    this.controls.minPolarAngle = 0.12;
    this.controls.maxPolarAngle = 1.32;
    this.controls.mouseButtons = {
      LEFT: null as any,
      MIDDLE: THREE.MOUSE.ROTATE, // 中键拖动：旋转视角
      RIGHT: THREE.MOUSE.PAN,     // 右键拖动：平移视角
    };
    // 方向键平移视角
    this.controls.listenToKeyEvents(window);

    this.buildLights();
    this.buildGround();
    this.buildEnvironment();

    window.addEventListener('resize', () => this.onResize(container));
  }

  private buildLights() {
    const sun = new THREE.DirectionalLight(0xfff1de, 3.4);
    sun.position.set(26, 38, 14);
    sun.castShadow = true;
    sun.shadow.mapSize.set(2048, 2048);
    const c = sun.shadow.camera;
    c.left = -24; c.right = 24; c.top = 24; c.bottom = -24;
    c.near = 5; c.far = 100;
    sun.shadow.bias = -0.0004;
    sun.shadow.normalBias = 0.03;
    this.sun = sun;
    this.scene.add(sun, sun.target);

    const hemi = new THREE.HemisphereLight(0xcfe5ff, 0x9a8a6f, 1.35);
    this.scene.add(hemi);
  }

  private buildGround() {
    const tex = makeGroundTexture();
    const sideMat = M(0x86ab5e);
    const topMat = new THREE.MeshStandardMaterial({ map: tex, roughness: 0.95, metalness: 0 });
    const g = new THREE.BoxGeometry(33.4, 0.5, 33.4);
    const grass = new THREE.Mesh(g, [sideMat, sideMat, topMat, sideMat, sideMat, sideMat]);
    grass.position.y = -0.25;
    grass.receiveShadow = true;
    this.scene.add(grass);
    this.groundMesh = grass;

    const dirt = new THREE.Mesh(new THREE.BoxGeometry(32.6, 2.0, 32.6), M(0x74603f, { flat: true }));
    dirt.position.y = -1.5;
    this.scene.add(dirt);

    const rim = new THREE.Mesh(new THREE.BoxGeometry(34.3, 0.4, 34.3), M(0x5a4c34, { flat: true }));
    rim.position.y = -0.62;
    this.scene.add(rim);
  }

  syncRegions(sim: Sim) {
    this.clearFlight();
    const seed = sim.campaign?.seed ?? null;
    for (const [id, group] of this.regions) {
      if (seed === this.landSeed && sim.hasRegion(id)) continue;
      this.scene.remove(group);
      const land = group.userData.land as THREE.Mesh<THREE.BoxGeometry, THREE.Material[]>;
      land.geometry.dispose();
      const surface = land.material[2] as THREE.MeshStandardMaterial;
      surface.map?.dispose();
      surface.dispose();
      this.regions.delete(id);
      for (const child of group.children) {
        if (typeof child.userData.site === 'number') this.sites.delete(child.userData.site);
      }
    }
    this.landSeed = seed;
    for (const region of sim.openRegions) {
      if (region.id === 'harbor' || this.regions.has(region.id)) continue;
      const group = new THREE.Group();
      const side = M(0x6c7257, { flat: true });
      const top = new THREE.MeshStandardMaterial({ map: makeGroundTexture(region, seed ?? 0), roughness: 0.95 });
      const land = new THREE.Mesh(new THREE.BoxGeometry(GRID, 1.9, GRID), [side, side, top, side, side, side]);
      land.position.set(region.x, -0.94, region.y);
      land.receiveShadow = true;
      group.add(land);
      group.userData.land = land;
      const plantColor = region.id === 'fernwash' ? 0x3a6951 : region.id === 'glassfen' ? 0x3e8582 : 0x699381;
      const plants = new THREE.InstancedMesh(this.plantGeometry, M(plantColor, { flat: true }), region.plantTiles.length);
      const matrix = new THREE.Matrix4();
      region.plantTiles.forEach((plant, i) => {
        const fraction = 0.65 + (i % 5) * 0.12;
        matrix.makeScale(fraction, fraction, fraction).setPosition(cellX(plant.x) + 0.24, 0.28 * fraction, cellZ(plant.y) + 0.24);
        plants.setMatrixAt(i, matrix);
      });
      group.add(plants);
      for (const site of region.scarTiles) {
        const key = tileKey(site.x, site.y);
        const bed = new THREE.Mesh(this.siteGeometry, M(0xae7953, { flat: true }));
        bed.position.set(cellX(site.x), 0.029, cellZ(site.y));
        bed.userData.site = key;
        this.sites.set(key, bed);
        group.add(bed);
      }
      this.regions.set(region.id, group);
      this.scene.add(group);
    }
    this.limitX = sim.W - GRID + 22;
    this.limitZ = sim.H - GRID + 22;
    this.sun.target.position.set((sim.W - GRID) / 2, 0, (sim.H - GRID) / 2);
    this.sun.position.copy(this.sun.target.position).add(new THREE.Vector3(26, 38, 14));
    const s = sim.openRegions.length > 1 ? 49 : 24;
    Object.assign(this.sun.shadow.camera, { left: -s, right: s, top: s, bottom: -s });
    this.sun.shadow.camera.updateProjectionMatrix();
    this.restorations = -1;
    this.syncRestoration(sim);
  }

  syncRestoration(sim: Sim) {
    if (sim.restoredTiles.size === this.restorations) return;
    this.restorations = sim.restoredTiles.size;
    for (const [key, bed] of this.sites) {
      bed.material = M(sim.restoredTiles.has(key) ? 0x568746 : 0xae7953, { flat: true });
    }
  }

  focusRegion(id: RegionId) {
    const { x, y } = REGIONS[id];
    const shift = new THREE.Vector3(x - this.controls.target.x, -this.controls.target.y, y - this.controls.target.z);
    this.camera.position.add(shift);
    this.controls.target.add(shift);
    this.controls.update();
  }

  launchPayload() {
    this.focusRegion('skyreach');
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    this.clearFlight();
    const capsule = new THREE.Group();
    const hull = M(0xdbd4aa, { metal: 0.45, rough: 0.36 });
    const trace = M(0xedbb65, { emissive: 0xe68330, emissiveIntensity: 1.65 });
    const pod = new THREE.Mesh(new THREE.CylinderGeometry(0.47, 0.55, 1.65, 8), hull);
    pod.position.y = 1.05;
    capsule.add(pod);
    const crown = new THREE.Mesh(new THREE.ConeGeometry(0.47, 0.65, 8), hull);
    crown.position.y = 2.2;
    capsule.add(crown);
    for (const side of [-1, 1]) {
      const wing = new THREE.Mesh(new THREE.BoxGeometry(0.66, 0.085, 0.66), M(0x405c80));
      wing.position.set(side * 0.72, 0.74, 0);
      capsule.add(wing);
    }
    const engine = new THREE.Mesh(new THREE.ConeGeometry(0.24, 0.9, 8), trace);
    engine.position.y = 0.01;
    engine.rotation.z = Math.PI;
    capsule.add(engine);
    capsule.position.set(REGIONS.skyreach.x, 0.45, REGIONS.skyreach.y);
    this.scene.add(capsule);
    this.flight = { capsule, elapsed: 0 };
  }

  private clearFlight() {
    if (!this.flight) return;
    this.scene.remove(this.flight.capsule);
    for (const child of this.flight.capsule.children as THREE.Mesh[]) child.geometry.dispose();
    this.flight = null;
  }

  private buildEnvironment() {
    // 云（低多边形球团）：每朵云的球团合并为单个 mesh，减少 draw call
    const cloudMat = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 1, flatShading: true, transparent: true, opacity: 0.92 });
    const cloudM = new THREE.Matrix4();
    for (let i = 0; i < 7; i++) {
      const cloud = new THREE.Group();
      const n = 3 + Math.floor(Math.random() * 3);
      const parts: THREE.BufferGeometry[] = [];
      for (let j = 0; j < n; j++) {
        const r = 0.9 + Math.random() * 1.5;
        const g = new THREE.IcosahedronGeometry(r, 0);
        cloudM.makeScale(1, 0.55, 1).setPosition(
          (j - n / 2) * 1.4 + Math.random(), Math.random() * 0.5, Math.random() * 1.6 - 0.8,
        );
        parts.push(g.applyMatrix4(cloudM));
      }
      const merged = new THREE.Mesh(mergeGeometries(parts)!, cloudMat);
      for (const g of parts) g.dispose();
      cloud.add(merged);
      const a = Math.random() * Math.PI * 2;
      const d = 30 + Math.random() * 28;
      cloud.position.set(Math.cos(a) * d, 6 + Math.random() * 8, Math.sin(a) * d);
      this.scene.add(cloud);
      this.clouds.push(cloud);
    }
    // 远处小浮岛
    for (let i = 0; i < 3; i++) {
      const island = new THREE.Group();
      const cone = new THREE.Mesh(new THREE.ConeGeometry(2.6, 3.4, 7), M(0x74603f, { flat: true }));
      cone.rotation.x = Math.PI;
      cone.position.y = -1.7;
      const top = new THREE.Mesh(new THREE.CylinderGeometry(2.7, 2.5, 0.5, 7), M(0x8fb868, { flat: true }));
      top.receiveShadow = true;
      const rock = new THREE.Mesh(new THREE.DodecahedronGeometry(0.55, 0), M(0x9aa3b2, { flat: true }));
      rock.position.set(0.8, 0.45, -0.5);
      rock.castShadow = true;
      island.add(cone, top, rock);
      const a = (i / 3) * Math.PI * 2 + 0.8;
      island.position.set(Math.cos(a) * 42, -5 - i * 2.5, Math.sin(a) * 42);
      this.scene.add(island);
      this.islands.push(island);
    }
  }

  animate(dt: number, time: number) {
    if (this.flight) {
      const { capsule } = this.flight;
      const elapsed = this.flight.elapsed += dt;
      capsule.position.y = 0.45 + elapsed * elapsed * 3.8;
      capsule.rotation.y += dt * 0.38;
      if (elapsed >= 4) this.clearFlight();
    }
    for (let i = 0; i < this.clouds.length; i++) {
      const c = this.clouds[i];
      c.position.x += dt * (0.25 + (i % 3) * 0.12);
      if (c.position.x > 62) c.position.x = -62;
    }
    for (let i = 0; i < this.islands.length; i++) {
      this.islands[i].position.y = -5 - i * 2.5 + Math.sin(time * 0.5 + i * 2) * 0.5;
    }
    // 视点限制在场地附近
    const t = this.controls.target;
    t.x = Math.max(-22, Math.min(this.limitX, t.x));
    t.z = Math.max(-22, Math.min(this.limitZ, t.z));
    t.y = Math.max(-2, Math.min(8, t.y));
    this.controls.update();
  }

  private onResize(container: HTMLElement) {
    const w = container.clientWidth, h = container.clientHeight;
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(w, h);
  }

  render() {
    this.renderer.render(this.scene, this.camera);
  }
}
