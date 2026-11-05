// ============================================================
// MicroFactory · 材质与纹理（缓存共享，控制 draw material 数量）
// ============================================================
import * as THREE from 'three';
import { PATCHES, GRID, DIRS } from '../core/defs';

const matCache = new Map<string, THREE.MeshStandardMaterial>();

export function M(
  color: number,
  opts: { rough?: number; metal?: number; emissive?: number; emissiveIntensity?: number; flat?: boolean; transparent?: boolean; opacity?: number } = {},
): THREE.MeshStandardMaterial {
  const key = `c${color}|r${opts.rough ?? 0.85}|m${opts.metal ?? 0.05}|e${opts.emissive ?? 0}|ei${opts.emissiveIntensity ?? 1}|f${opts.flat ? 1 : 0}|t${opts.transparent ? 1 : 0}|o${opts.opacity ?? 1}`;
  let m = matCache.get(key);
  if (!m) {
    m = new THREE.MeshStandardMaterial({
      color,
      roughness: opts.rough ?? 0.85,
      metalness: opts.metal ?? 0.05,
      emissive: opts.emissive ?? 0x000000,
      emissiveIntensity: opts.emissiveIntensity ?? 1,
      flatShading: opts.flat ?? false,
      transparent: opts.transparent ?? false,
      opacity: opts.opacity ?? 1,
    });
    matCache.set(key, m);
  }
  return m;
}

// 灯光材质（状态灯共用，按状态换引用而非克隆）
export const LAMP = {
  off: M(0x3a3f46, { emissive: 0x111318, emissiveIntensity: 1 }),
  green: M(0x2f8f4e, { emissive: 0x2fe070, emissiveIntensity: 1.6 }),
  yellow: M(0xb8912a, { emissive: 0xffd23e, emissiveIntensity: 1.6 }),
  red: M(0xa33b30, { emissive: 0xff5040, emissiveIntensity: 1.6 }),
};

// ---------------- 传送带表面纹理（v 轴 = 行进方向） ----------------
export function makeBeltTexture(turbo: boolean): THREE.CanvasTexture {
  const c = document.createElement('canvas');
  c.width = 64; c.height = 128;
  const g = c.getContext('2d')!;
  g.fillStyle = turbo ? '#1f3d46' : '#262b33';
  g.fillRect(0, 0, 64, 128);
  g.strokeStyle = turbo ? '#7fd8e8' : '#8b93a5';
  g.lineWidth = 7;
  g.lineCap = 'round';
  // 两枚箭头，指向 +v（纹理 offset.y 减小时图案向 +v 滚动）
  for (const oy of [32, 96]) {
    g.beginPath();
    g.moveTo(14, oy + 10);
    g.lineTo(32, oy - 8);
    g.lineTo(50, oy + 10);
    g.stroke();
  }
  g.strokeStyle = 'rgba(0,0,0,0.35)';
  g.lineWidth = 2;
  g.strokeRect(1, 1, 62, 126);
  const tex = new THREE.CanvasTexture(c);
  tex.wrapS = THREE.ClampToEdgeWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 4;
  return tex;
}

// ---------------- 地面纹理（草地 + 网格 + 矿脉） ----------------
export function makeGroundTexture(): THREE.CanvasTexture {
  const S = 1024;
  const cell = S / GRID; // 32px
  const c = document.createElement('canvas');
  c.width = S; c.height = S;
  const g = c.getContext('2d')!;

  g.fillStyle = '#8fb868';
  g.fillRect(0, 0, S, S);
  // 草地噪点
  for (let i = 0; i < 900; i++) {
    const x = Math.random() * S, y = Math.random() * S, r = 4 + Math.random() * 14;
    g.fillStyle = Math.random() < 0.5 ? 'rgba(255,255,240,0.05)' : 'rgba(30,60,20,0.06)';
    g.beginPath(); g.arc(x, y, r, 0, 7); g.fill();
  }
  // 矿脉
  const oreStyle: Record<string, [string, string]> = {
    iron: ['rgba(176,113,79,0.55)', 'rgba(90,50,30,0.5)'],
    copper: ['rgba(53,160,140,0.5)', 'rgba(20,80,66,0.55)'],
  };
  for (const p of PATCHES) {
    const [fill, dot] = oreStyle[p.ore];
    const x0 = p.x0 * cell, y0 = p.y0 * cell;
    const w = (p.x1 - p.x0 + 1) * cell, h = (p.y1 - p.y0 + 1) * cell;
    g.fillStyle = fill;
    g.beginPath();
    g.roundRect(x0 + 2, y0 + 2, w - 4, h - 4, 10);
    g.fill();
    for (let i = 0; i < 60; i++) {
      const x = x0 + 6 + Math.random() * (w - 12), y = y0 + 6 + Math.random() * (h - 12);
      g.fillStyle = dot;
      g.beginPath(); g.arc(x, y, 1.5 + Math.random() * 3, 0, 7); g.fill();
    }
  }
  // 网格线
  g.strokeStyle = 'rgba(20,40,15,0.16)';
  g.lineWidth = 1;
  for (let i = 0; i <= GRID; i++) {
    g.beginPath(); g.moveTo(i * cell, 0); g.lineTo(i * cell, S); g.stroke();
    g.beginPath(); g.moveTo(0, i * cell); g.lineTo(S, i * cell); g.stroke();
  }
  // 外框
  g.strokeStyle = 'rgba(20,40,15,0.45)';
  g.lineWidth = 8;
  g.strokeRect(4, 4, S - 8, S - 8);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 8;
  return tex;
}

// 网格坐标 → 世界坐标
export const cellX = (x: number) => x - (GRID - 1) / 2;
export const cellZ = (y: number) => y - (GRID - 1) / 2;
export const worldToCell = (wx: number, wz: number): { x: number; y: number } => ({
  x: Math.round(wx + (GRID - 1) / 2),
  y: Math.round(wz + (GRID - 1) / 2),
});
export const dirAngle = (rot: number) => -rot * Math.PI / 2;
export const dirVec = (rot: number) => DIRS[rot];
