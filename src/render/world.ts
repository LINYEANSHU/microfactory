// ============================================================
// MicroFactory · 场景/相机/光照/环境（微缩浮岛）
// ============================================================
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { M, makeGroundTexture } from './materials';

export class World {
  scene = new THREE.Scene();
  camera: THREE.PerspectiveCamera;
  renderer: THREE.WebGLRenderer;
  controls: OrbitControls;
  groundMesh!: THREE.Mesh;
  private clouds: THREE.Group[] = [];
  private islands: THREE.Group[] = [];

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
    this.scene.add(sun);

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
    t.x = Math.max(-22, Math.min(22, t.x));
    t.z = Math.max(-22, Math.min(22, t.z));
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
