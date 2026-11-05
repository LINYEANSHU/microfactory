// ============================================================
// MicroFactory · 建造面板 3D 图标（离屏渲染真实模型）
// ============================================================
import * as THREE from 'three';
import { buildMachine } from './models';
import { FactoryView } from './view';
import { EntKind } from '../core/defs';

export function renderIcons(kinds: EntKind[]): Record<EntKind, string> {
  const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, preserveDrawingBuffer: true });
  renderer.setSize(88, 88);
  renderer.setPixelRatio(1);
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.1;
  const scene = new THREE.Scene();
  scene.add(new THREE.HemisphereLight(0xffffff, 0x8899aa, 2.4));
  const d = new THREE.DirectionalLight(0xfff1de, 2.6);
  d.position.set(2, 3, 2);
  scene.add(d);
  const cam = new THREE.OrthographicCamera(-0.75, 0.75, 0.75, -0.75, 0.1, 20);
  cam.position.set(2.4, 2.1, 2.4);
  cam.lookAt(0, 0.32, 0);
  const out = {} as Record<EntKind, string>;
  for (const k of kinds) {
    let g: THREE.Group;
    if (k === 'belt' || k === 'turbo') {
      g = FactoryView.buildBeltCellVisual(k === 'turbo');
    } else {
      g = buildMachine(k).group;
    }
    g.rotation.y = Math.PI / 4;
    scene.add(g);
    renderer.render(scene, cam);
    out[k] = renderer.domElement.toDataURL('image/png');
    scene.remove(g);
  }
  renderer.dispose();
  return out;
}
