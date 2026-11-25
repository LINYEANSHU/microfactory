import { describe, expect, it } from 'vitest';
import { Sim } from '../sim/engine';
import { decodeFactorySave } from '../sim/save';
import { buildExample } from '../sim/example';
import { DIRS, type ItemKey } from '../core/defs';
import type { Ent } from '../sim/engine';

function run(sim: Sim, seconds: number) {
  for (let i = 0; i < Math.ceil(seconds * 30); i++) sim.tick(1 / 30);
}

function send(sim: Sim, target: Ent, item: ItemKey, count = 1, direction = target.rot) {
  const { x, y } = DIRS[direction];
  for (let i = 0; i < count; i++) {
    expect(sim.tryPushTo(target.x - x, target.y - y, direction, item)).toBe(true);
    sim.ledger.produced[item]++;
  }
}

function ship(sim: Sim, item: ItemKey, count: number) {
  const terminal = sim.get(0, 0) ?? sim.place('export', 0, 0, 0);
  send(sim, terminal, item, count, 2);
}

function explore(sim: Sim) {
  ship(sim, 'gear', 6);
  expect(sim.unlockRegion('fernwash')).toBe(true);
  ship(sim, 'circuit', 4);
  expect(sim.unlockRegion('glassfen')).toBe(true);
  ship(sim, 'gear', 70);
}

describe('frontier expansion', () => {
  it('preserves the original grid and unlocks deterministic, buildable neighboring regions', () => {
    const sim = new Sim();
    const original = sim.place('extractor', 5, 28, 3);
    expect(sim.W).toBe(32);
    expect(sim.oreAt(5, 28)).toBe('iron');
    expect(sim.canPlace('belt', 32, 0)).toBe(false);
    expect(sim.unlockRegion('fernwash')).toBe(false);
    expect(sim.chooseCampaign('research', 42)).toBe(true);
    sim.ledger.exported.gear = 6;
    expect(sim.unlockRegion('fernwash')).toBe(true);
    expect(sim.unlockRegion('fernwash')).toBe(false);
    expect(sim.unlockRegion('skyreach')).toBe(false);
    expect(sim.canPlace('belt', 32, 0)).toBe(true);
    expect(sim.get(5, 28)).toBe(original);
    expect(sim.W).toBe(64);
    const east = sim.openRegions[1];
    expect(east.patches.map(patch => patch.ore)).toContain('biomineral');
    const restored = decodeFactorySave(JSON.stringify(sim.serialize())).sim;
    expect(restored.openRegions).toEqual(sim.openRegions);
    expect(restored.campaign).toEqual(sim.campaign);
    expect(restored.get(5, 28)?.ore).toBe('iron');
  });

  it('opens Fernwash from a live starter factory and keeps v1/v2 factories playable', () => {
    const old = new Sim();
    buildExample(old);
    run(old, 180);
    expect(old.ledger.exported.robot).toBeGreaterThan(6);
    for (const version of [1, 2]) {
      const restored = decodeFactorySave(JSON.stringify({ ...old.serialize(), v: version })).sim;
      expect(restored.campaign).toBeNull();
      expect(restored.openRegions.map(r => r.id)).toEqual(['harbor']);
      expect(restored.chooseCampaign('research', 0)).toBe(true);
      // Tap the original gear press immediately after its output.
      restored.remove(6, 14);
      restored.place('export', 6, 14, 3);
      run(restored, 90);
      expect(restored.ledger.exported.gear).toBeGreaterThanOrEqual(6);
      expect(restored.unlockRegion('fernwash')).toBe(true);
      expect(restored.conservationError()).toBe(0);
    }
  });

  it('refines newly mined ore with local power and sorts useful alloy from the slag stream', () => {
    const sim = new Sim();
    sim.chooseCampaign('research', 99);
    explore(sim);
    const ore = sim.openRegions.find(r => r.id === 'fernwash')!.patches.find(p => p.ore === 'cobalt')!;
    const { x0: x, y0: y } = ore;
    sim.place('extractor', x, y, 3);
    const furnace = sim.place('refinery', x, y - 1, 3);
    sim.place('sorter', x, y - 2, 3);
    const slagExport = sim.place('export', x, y - 3, 3);
    const alloyExport = sim.place('export', x + 1, y - 2, 0);
    sim.place('generator', 1, 1, 0);
    run(sim, 20);
    expect(furnace.state).toBe('unpowered');
    expect(sim.ledger.produced.alloy).toBe(0);
    sim.place('generator', x + 1, y, 0);
    run(sim, 35);
    expect(sim.powerStatus('fernwash')).toEqual({ demand: 4, supply: 14 });
    expect(slagExport.counts!.get('slag')).toBeGreaterThanOrEqual(8);
    expect(slagExport.counts!.get('alloy')).toBeUndefined();
    expect(alloyExport.counts!.get('alloy')).toBe(slagExport.counts!.get('slag'));
    expect(sim.conservationError()).toBe(0);
  });

  it('buffers paired cross-region freight, preserves its cooldown, and filters warehouse inputs', () => {
    const sim = new Sim();
    sim.chooseCampaign('corporate', 1);
    explore(sim);
    const sender = sim.place('freight_send', 10, 10, 0);
    const local = sim.place('freight_receive', 11, 10, 0);
    const remote = sim.place('freight_receive', 40, 10, 0);
    const warehouse = sim.place('storage', 41, 10, 0);
    expect(sim.setItemFilter(warehouse, 'alloy')).toBe(true);
    expect(sim.setFreightChannel(remote, 2)).toBe(true);
    send(sim, sender, 'alloy', 3);
    run(sim, 4);
    expect(sim.freightDeliveries).toBe(0);
    expect(sim.setFreightChannel(sender, 2)).toBe(true);
    run(sim, 0.2);
    expect(sim.freightDeliveries).toBe(1);
    expect(local.queue).toEqual([]);
    expect(warehouse.queue).toEqual(['alloy']);
    const loaded = decodeFactorySave(JSON.stringify(sim.serialize())).sim;
    expect(loaded.get(40, 10)?.channel).toBe(2);
    expect(loaded.get(41, 10)?.filter).toBe('alloy');
    expect(loaded.tryPushTo(41, 9, 1, 'slag')).toBe(false);
    run(loaded, 1);
    expect(loaded.freightDeliveries).toBe(1);
    run(loaded, 3);
    expect(loaded.freightDeliveries).toBe(3);
    expect(loaded.get(41, 10)?.queue).toEqual(['alloy', 'alloy', 'alloy']);
    expect(loaded.conservationError()).toBe(0);
  });

  it('routes reagents between chemical towers and moves cargo across an open border', () => {
    const sim = new Sim();
    sim.chooseCampaign('research', 27);
    explore(sim);
    expect(sim.canPlace('belt', 32, 32)).toBe(false);
    const reagent = sim.place('chemistry', 30, 5, 0);
    const composite = sim.place('chemistry', 31, 5, 0);
    sim.place('belt', 32, 5, 0);
    sim.place('export', 33, 5, 0);
    sim.place('generator', 30, 3, 0);
    send(sim, reagent, 'biomineral', 4);
    send(sim, composite, 'alloy', 4, 1);
    run(sim, 35);
    expect(sim.ledger.exported.composite).toBe(4);
    expect(sim.ledger.exported.reagent).toBe(0);
    expect(sim.conservationError()).toBe(0);
  });

  function precision(sim: Sim, x: number, y: number, recipe: string, inputs: Partial<Record<ItemKey, number>>, runs: number) {
    const machine = sim.place('advanced_assembler', x, y, 0);
    expect(sim.setAdvancedRecipe(machine, recipe)).toBe(true);
    sim.place('export', x + 1, y, 0);
    for (let n = 0; n < runs; n++) {
      for (const [item, quantity] of Object.entries(inputs)) send(sim, machine, item as ItemKey, quantity);
      run(sim, 8);
    }
    return machine;
  }

  it('restores plots, researches probes, and launches a manufactured orbital payload', () => {
    const sim = new Sim();
    sim.chooseCampaign('research', 17);
    explore(sim);
    sim.place('generator', 12, 12, 0);
    sim.place('generator', 40, 12, 0);
    const fernwash = sim.openRegions.find(r => r.id === 'fernwash')!;
    for (const { x, y } of fernwash.scarTiles) {
      const lab = sim.place('cultivator', x, y, 0);
      send(sim, lab, 'slag');
      send(sim, lab, 'biomineral');
    }
    run(sim, 6);
    expect(sim.restoredTiles.size).toBe(3);
    expect(sim.ledger.produced.bioculture).toBe(3);
    expect(sim.advanceCampaign()).toBe(false);
    const machine = precision(sim, 13, 12, 'asm_probe', { composite: 1, glass: 1, bioculture: 1 }, 3);
    expect(sim.ledger.exported.survey_probe).toBe(3);
    expect(sim.setAdvancedRecipe(machine, 'asm_payload')).toBe(false);
    expect(sim.advanceCampaign()).toBe(true);
    ship(sim, 'composite', 4);
    expect(sim.unlockRegion('skyreach')).toBe(true);
    precision(sim, 13, 14, 'asm_payload', { survey_probe: 1, alloy: 1, bioculture: 1 }, 3);
    expect(sim.ledger.exported.orbital_payload).toBe(3);
    expect(sim.advanceCampaign()).toBe(true);
    expect(sim.advanceCampaign()).toBe(false);
    const loaded = decodeFactorySave(JSON.stringify(sim.serialize())).sim;
    expect(loaded.campaign?.stage).toBe('complete');
    expect(loaded.restoredTiles).toEqual(sim.restoredTiles);
    expect(loaded.get(13, 14)?.selectedRecipe).toBe('asm_payload');
    expect(loaded.conservationError()).toBe(0);
  });

  it('builds the corporate automation line, delivers live freight, and auto-accepts new contracts', () => {
    const sim = new Sim();
    sim.chooseCampaign('corporate', 18);
    explore(sim);
    ship(sim, 'robot', 28);
    ship(sim, 'circuit', 40);
    expect(sim.orderIdx).toBe(3);
    sim.place('generator', 12, 12, 0);
    precision(sim, 13, 12, 'asm_core', { composite: 1, glass: 1, robot: 1 }, 3);
    expect(sim.advanceCampaign()).toBe(true);
    ship(sim, 'composite', 4);
    expect(sim.unlockRegion('skyreach')).toBe(true);
    precision(sim, 13, 14, 'asm_dispatch', { automation_core: 1, wire: 2, bioculture: 1 }, 4);
    expect(sim.ledger.exported.dispatch_unit).toBe(4);
    expect(sim.advanceCampaign()).toBe(false);
    const sender = sim.place('freight_send', 14, 20, 0);
    sim.place('freight_receive', 36, 36, 0);
    for (let i = 0; i < 8; i++) {
      send(sim, sender, 'dispatch_unit');
      run(sim, 1.6);
    }
    expect(sim.advanceCampaign()).toBe(true);
    run(sim, 0.1);
    expect(sim.currentContract().active).toBe(true);
    const reward = sim.currentContract().reward;
    const before = sim.credits;
    ship(sim, 'robot', 6);
    expect(sim.currentContract().active).toBe(false);
    expect(sim.credits).toBe(before + reward + 6 * 45);
    const loaded = decodeFactorySave(JSON.stringify(sim.serialize())).sim;
    run(loaded, 29);
    expect(loaded.currentContract().active).toBe(false);
    run(loaded, 2);
    expect(loaded.currentContract().active).toBe(true);
    expect(loaded.conservationError()).toBe(0);
  });
});
