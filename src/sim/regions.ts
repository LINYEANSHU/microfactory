import { GRID, PATCHES, type ItemKey, type Ore, type PatchRect } from '../core/defs';

export type RegionId = 'harbor' | 'fernwash' | 'glassfen' | 'skyreach';
export type CampaignMode = 'research' | 'corporate';
export type CampaignStage = 'charter' | 'commission' | 'complete';
export interface Tile { x: number; y: number }
interface RegionSpec extends Tile {
  parent: RegionId | null;
  credits: number;
  shipment: [ItemKey, number] | null;
  ores: Ore[];
}

export const REGIONS: Record<RegionId, RegionSpec> = {
  harbor:   { x: 0, y: 0, parent: null, credits: 0, shipment: null, ores: [] },
  fernwash: { x: GRID, y: 0, parent: 'harbor', credits: 60, shipment: ['gear', 6], ores: ['cobalt', 'biomineral', 'iron'] },
  glassfen: { x: 0, y: GRID, parent: 'fernwash', credits: 150, shipment: ['circuit', 4], ores: ['silica', 'biomineral', 'copper'] },
  skyreach: { x: GRID, y: GRID, parent: 'glassfen', credits: 320, shipment: ['composite', 4], ores: ['cobalt', 'silica', 'biomineral'] },
};
export const REGION_IDS = Object.keys(REGIONS) as RegionId[];
export const WORLD_GRID = GRID * 2;
export const DEFAULT_SEED = 271828;
const REGION_GRID: RegionId[][] = [['harbor', 'fernwash'], ['glassfen', 'skyreach']];

export interface Region extends Tile {
  id: RegionId;
  patches: PatchRect[];
  scarTiles: Tile[];
  plantTiles: Tile[];
}

export function regionIdAt(x: number, y: number): RegionId {
  return REGION_GRID[(y / GRID) | 0][(x / GRID) | 0];
}

export function tileKey(x: number, y: number): number {
  return y * WORLD_GRID + x;
}

export function makeRegion(id: RegionId, seed: number): Region {
  const { x, y, ores } = REGIONS[id];
  if (id === 'harbor') return { id, x, y, patches: PATCHES, scarTiles: [], plantTiles: [] };
  let state = (seed ^ Math.imul(REGION_IDS.indexOf(id), 0x9e3779b9)) >>> 0;
  function next(limit: number) {
    state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
    return Math.floor(state / 2 ** 32 * limit);
  }
  const patches = ores.map((ore, index) => {
    const x0 = x + 3 + index * 9 + next(3);
    const y0 = y + 19 + next(8);
    return { ore, x0, y0, x1: x0 + 2 + next(2), y1: y0 + 2 };
  });
  const scarTiles = Array.from({ length: 3 }, (_, i) => ({
    x: x + 5 + i * 8 + next(3), y: y + 7 + next(5),
  }));
  const plantTiles = Array.from({ length: 18 }, (_, i) => ({
    x: x + 2 + (i % 6) * 5 + next(3), y: y + 2 + Math.floor(i / 6) * 5 + next(3),
  })).filter(tile => !scarTiles.some(scar => scar.x === tile.x && scar.y === tile.y));
  return { id, x, y, patches, scarTiles, plantTiles };
}

export interface Campaign {
  mode: CampaignMode;
  seed: number;
  stage: CampaignStage;
}

export const CAMPAIGN_GOALS = {
  research: {
    charter: { credits: 100, shipment: ['survey_probe', 3], orders: 0, profit: 0, restored: 2, freight: 0, skyreach: false },
    commission: { credits: 240, shipment: ['orbital_payload', 3], orders: 0, profit: 0, restored: 3, freight: 0, skyreach: true },
  },
  corporate: {
    charter: { credits: 400, shipment: ['automation_core', 3], orders: 2, profit: 700, restored: 0, freight: 0, skyreach: false },
    commission: { credits: 300, shipment: ['dispatch_unit', 4], orders: 3, profit: 1200, restored: 0, freight: 8, skyreach: true },
  },
} as const satisfies Record<CampaignMode, Record<Exclude<CampaignStage, 'complete'>, {
  credits: number; shipment: readonly [ItemKey, number]; orders: number; profit: number;
  restored: number; freight: number; skyreach: boolean;
}>>;
