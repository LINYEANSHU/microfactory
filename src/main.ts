// ============================================================
// MicroFactory · 主入口：游戏循环 / 输入 / 工具 / 存读档 / 性能统计
// ============================================================
import { World } from './render/world';
import { FactoryView } from './render/view';
import { Hud, Tool, goalName, goalDesc, regionName } from './ui/hud';
import { SoundKit } from './ui/sound';
import { Sim, Ent, SaveData, SerEnt } from './sim/engine';
import { BACKUP_KEY, SAVE_KEY, decodeFactorySave, loadFactorySave } from './sim/save';
import { buildExample } from './sim/example';
import { EntKind, Dir, PALETTE_ORDER, ORE_ITEM, type ItemKey } from './core/defs';
import { t, getLang, setLang, itemName, kindName } from './ui/i18n';

const STEP = 1 / 30;
const SPEEDS = [1, 2, 4];

const container = document.getElementById('app')!;

const sim = new Sim();
const world = new World(container);
const view = new FactoryView(world, sim);
const sound = new SoundKit();

// ---------------- 全局游戏状态 ----------------
let tool: Tool = 'pointer';
let ghostRot: Dir = 3;
let paused = false;
let speedIdx = 0; // SPEEDS 下标，默认 1×，与 HUD 一致
let acc = 0;
let selected: Ent | null = null;
let hoverCell: { x: number; y: number } | null = null;
let dragging = false;
let dragLast: { x: number; y: number } | null = null;
let moving: { data: SerEnt; from: { x: number; y: number } } | null = null;
let perfDetail = false;
let welcomeOpen = false;
let protectSave = false;
let lastValidSave: string | undefined;
let lastSavedState: string | undefined;

// ---------------- HUD ----------------
const uiRoot = document.createElement('div');
uiRoot.id = 'ui';
document.body.appendChild(uiRoot);
const hud = new Hud({
  setTool(t2) { switchTool(t2); },
  setSpeed(i) {
    if (i === 0) { paused = true; } else { paused = false; speedIdx = i - 1; }
    hud.setSpeedBtn(i);
  },
  save: () => saveGame(true),
  load: () => loadGame(),
  acceptContract: () => {
    if (sim.acceptContract()) {
      hud.refreshOrders(sim);
      saveGame(false);
    }
  },
  chooseCampaign: (mode, seed) => {
    if (!sim.chooseCampaign(mode, seed)) { hud.toast(t('frontier.seedInvalid'), 'error-toast'); return; }
    hud.refreshFrontier(sim);
    saveGame(false);
  },
  selectRegion: id => {
    if (!sim.hasRegion(id)) {
      if (!sim.unlockRegion(id)) return;
      world.syncRegions(sim);
      hud.refreshFrontier(sim);
      hud.setCredits(sim.credits);
      hud.toast(t('frontier.regionOpened', { name: regionName(id) }), 'goal-toast');
      sound.play('goal');
    }
    world.focusRegion(id);
    saveGame(false);
  },
  advanceCampaign: () => {
    if (!sim.advanceCampaign()) return;
    const run = sim.campaign!;
    if (run.mode === 'research' && run.stage === 'complete') world.launchPayload();
    hud.refreshFrontier(sim);
    hud.toast(t(`frontier.${run.mode}.${run.stage === 'complete' ? 'complete' : 'charter'}`), 'goal-toast');
    sound.play('goal');
    saveGame(false);
  },
  configure: (key, value) => {
    if (!selected) return;
    const changed = key === 'filter' ? sim.setItemFilter(selected, value === 'any' ? undefined : value as ItemKey)
      : key === 'channel' ? sim.setFreightChannel(selected, Number(value))
        : sim.setAdvancedRecipe(selected, value);
    if (changed) saveGame(false);
    refreshInspector();
  },
  exportFile: () => exportFile(),
  importFile: (f: File) => importFile(f),
  reset: () => hud.confirm(t('reset.title'), t('reset.msg'), t('reset.ok'), () => {
    clearSim();
    saveGame(false, true);
    hud.toast(t('toast.reset'));
  }),
  example: () => {
    const hasStuff = !!sim.campaign || sim.procs.length + sim.nodes.length + sim.belts.length + sim.terminals.length > 0;
    const doBuild = () => {
      clearSim();
      buildExample(sim);
      view.rebuildAll();
      switchTool('pointer');
      hud.toast(t('toast.example'));
    };
    if (hasStuff) hud.confirm(t('example.title'), t('example.msg'), t('example.ok'), doBuild);
    else doBuild();
  },
  help: () => hud.showHelp(),
  rotate: () => rotateAction(),
  move: () => moveAction(),
  remove: () => removeSelected(),
  upgrade: () => upgradeAction(),
  toggleSound: () => {
    sound.setEnabled(!sound.enabled);
    hud.setSoundOn(sound.enabled);
    sound.unlock();
    if (sound.enabled) sound.play('place');
  },
  toggleLang: () => {
    setLang(getLang() === 'zh' ? 'en' : 'zh');
    applyDocumentLang();
    hud.rebuild();
    // 立即重绘动态面板，不等下一次刷新周期
    hud.refreshStats(sim);
    hud.refreshOrders(sim);
    hud.refreshFrontier(sim);
    hud.refreshGoals(sim);
    refreshInspector();
  },
});
hud.setSoundOn(sound.enabled);

// 订单播报
sim.onOrderDone = (idx, reward, item, target) => {
  sound.play('order');
  hud.orderToast(t('toast.orderDone', { n: idx + 1, t: target, item: itemName(item), r: reward.toLocaleString('en-US') }));
  const next = sim.currentOrder();
  hud.orderToast(t('toast.orderNext', { n: next.idx + 1, t: next.target, item: itemName(next.item) }));
};
// 单件出货提示音（SoundKit 内部节流 70ms）
sim.onExport = () => sound.play('export');
sim.onContractEnd = (reward) => {
  if (reward) sound.play('order');
  hud.orderToast(reward ? t('contract.completed', { reward }) : t('contract.expired'));
};

/** 语言应用于文档标题与 <html lang> */
function applyDocumentLang() {
  document.documentElement.lang = getLang() === 'zh' ? 'zh-CN' : 'en';
  document.title = t('app.title');
}
applyDocumentLang();

// ---------------- 工具与操作 ----------------
function switchTool(t2: Tool) {
  if (moving && t2 !== 'pointer') { cancelMove(); }
  tool = t2;
  selected = null;
  view.setSelection(null);
  hud.setTool(t2);
  if ((t2 === 'belt' || t2 === 'turbo') && hoverCell) {
    view.setGhost(t2, ghostRot, sim.canPlace(t2, hoverCell.x, hoverCell.y));
    view.positionGhost(hoverCell);
  } else if (t2 !== 'pointer' && t2 !== 'bulldoze' && hoverCell) {
    view.setGhost(t2 as EntKind, ghostRot, sim.canPlace(t2 as EntKind, hoverCell.x, hoverCell.y));
    view.positionGhost(hoverCell);
  } else {
    view.setGhost(null, 0, true);
  }
  refreshInspector();
}

function select(ent: Ent | null) {
  selected = ent;
  view.setSelection(ent);
  refreshInspector();
}

function refreshInspector() {
  hud.refreshInspector(selected, sim);
}

function rotateAction() {
  if (moving) {
    moving.data.r = ((moving.data.r + 1) % 4) as Dir;
    const valid = !!hoverCell && sim.canInsert(moving.data.k, hoverCell.x, hoverCell.y);
    view.setGhost(moving.data.k, moving.data.r, valid);
    return;
  }
  if (tool !== 'pointer' && tool !== 'bulldoze') {
    ghostRot = ((ghostRot + 1) % 4) as Dir;
    if (hoverCell) view.setGhost(tool as EntKind, ghostRot, sim.canPlace(tool as EntKind, hoverCell.x, hoverCell.y));
    return;
  }
  if (selected) {
    selected.rot = ((selected.rot + 1) % 4) as Dir;
    view.onRotated(selected);
    view.setSelection(selected);
    refreshInspector();
  }
}

function moveAction() {
  if (!selected || moving) return;
  const data = sim.extractEnt(selected.x, selected.y);
  if (!data) return;
  view.onRemoved(selected);
  moving = { data, from: { x: selected.x, y: selected.y } };
  select(null);
  view.setGhost(data.k, data.r, true);
  if (hoverCell) view.positionGhost(hoverCell);
  hud.hint(t('hint.move'));
}

function placeMoving(cell: { x: number; y: number }) {
  if (!moving) return;
  const d = moving.data;
  if (d.k === 'extractor' && !sim.oreAt(cell.x, cell.y)) {
    hud.toast(t('toast.extractorOre'), 'error-toast');
    sound.play('error');
    return;
  }
  if (d.k === 'cultivator' && !sim.isRestorationSite(cell.x, cell.y)) {
    hud.toast(t('frontier.cropInvalid'), 'error-toast');
    sound.play('error');
    return;
  }
  if (!sim.insertEnt({ ...d, x: cell.x, y: cell.y })) {
    hud.toast(t('toast.occupied'), 'error-toast');
    sound.play('error');
    return;
  }
  const e = sim.get(cell.x, cell.y)!;
  view.onPlaced(e);
  moving = null;
  view.setGhost(null, 0, true);
  hud.setTool(tool);
  sound.play('place');
  hud.toast(t('toast.moved', { name: kindName(d.k), x: cell.x, y: cell.y }));
}

function cancelMove() {
  if (!moving) return;
  const { data, from } = moving;
  if (sim.get(from.x, from.y) === null) {
    sim.insertEnt(data);
    const e = sim.get(from.x, from.y)!;
    view.onPlaced(e);
    moving = null;
    view.setGhost(null, 0, true);
    hud.setTool(tool);
  } else {
    hud.toast(t('toast.moveBlocked'), 'error-toast');
  }
}

function removeSelected() {
  if (!selected) return;
  const e = selected;
  sim.remove(e.x, e.y);
  view.onRemoved(e);
  sound.play('remove');
  select(null);
}

function upgradeAction() {
  if (!selected) return;
  const e = selected;
  if (sim.upgradeCost(e) === null) { hud.toast(t('toast.maxLevel'), 'error-toast'); sound.play('error'); return; }
  if (sim.upgrade(e.x, e.y)) {
    view.onUpgraded(e);
    refreshInspector();
    sound.play('upgrade');
    hud.toast(t('toast.upgraded', { name: kindName(e.kind), n: e.level! }));
  } else {
    hud.toast(t('toast.noCredits', { n: sim.upgradeCost(e)! }), 'error-toast');
    sound.play('error');
  }
}

function removeAt(cell: { x: number; y: number }) {
  const e = sim.get(cell.x, cell.y);
  if (!e) return;
  if (selected === e) select(null);
  sim.remove(cell.x, cell.y);
  view.onRemoved(e);
  sound.play('remove');
}

function placeAt(cell: { x: number; y: number }, kind: EntKind, rot: Dir) {
  if (!sim.canPlace(kind, cell.x, cell.y)) return false;
  sim.place(kind, cell.x, cell.y, rot);
  const e = sim.get(cell.x, cell.y)!;
  view.onPlaced(e);
  sound.play('place');
  return true;
}

function refreshTileHint(cell: { x: number; y: number } | null) {
  if (moving || tool === 'bulldoze') return;
  const ore = cell && sim.oreAt(cell.x, cell.y);
  if (ore) hud.hint(t('frontier.tileOre', { item: itemName(ORE_ITEM[ore]) }));
  else if (cell && sim.isRestorationSite(cell.x, cell.y)) hud.hint(t('frontier.crop'));
  else hud.hint(tool === 'pointer' ? t('hint.pointer') : t('hint.build', { name: kindName(tool) }));
}

// ---------------- 指针输入 ----------------
const dom = world.renderer.domElement;

dom.addEventListener('pointerdown', (ev) => {
  if (ev.button === 1) ev.preventDefault();
  sound.unlock(); // 首次手势解锁 AudioContext（幂等）
  if (ev.button !== 0) return;
  const cell = view.pickCell(ev.clientX, ev.clientY);
  if (!cell) return;
  if (moving) { placeMoving(cell); return; }
  if (tool === 'pointer') {
    const ent = view.pickEnt(ev.clientX, ev.clientY);
    select(ent);
    return;
  }
  if (tool === 'bulldoze') {
    dragging = true;
    dragLast = cell;
    removeAt(cell);
    return;
  }
  if (tool === 'belt' || tool === 'turbo') {
    dragging = true;
    dragLast = cell;
    placeAt(cell, tool, ghostRot);
    return;
  }
  // 机器类：单击放置
  placeAt(cell, tool as EntKind, ghostRot);
});

dom.addEventListener('pointermove', (ev) => {
  const cell = view.pickCell(ev.clientX, ev.clientY);
  if (cell?.x !== hoverCell?.x || cell?.y !== hoverCell?.y) refreshTileHint(cell);
  hoverCell = cell;
  const mode = tool === 'pointer' ? 'pointer' : tool === 'bulldoze' ? 'bulldoze' : 'build';
  view.setHover(cell, mode);
  if (cell) {
    if (moving) {
      const ok = sim.canInsert(moving.data.k, cell.x, cell.y);
      view.setGhost(moving.data.k, moving.data.r, ok);
      view.positionGhost(cell);
    } else if (tool !== 'pointer' && tool !== 'bulldoze') {
      view.setGhost(tool as EntKind, ghostRot, sim.canPlace(tool as EntKind, cell.x, cell.y));
      view.positionGhost(cell);
    } else {
      view.positionGhost(null);
    }
  } else {
    view.positionGhost(null);
  }
  if (!dragging || !cell || !dragLast) return;
  if (tool === 'belt' || tool === 'turbo') {
    // 逐格扩展，自动转向
    let dl: { x: number; y: number } = dragLast;
    let guard = 0;
    while ((dl.x !== cell.x || dl.y !== cell.y) && guard++ < sim.W + sim.H) {
      const dx = Math.sign(cell.x - dl.x);
      const dy = Math.sign(cell.y - dl.y);
      let sx = 0, sy = 0;
      if (dx !== 0 && (dy === 0 || Math.abs(cell.x - dl.x) >= Math.abs(cell.y - dl.y))) sx = dx;
      else if (dy !== 0) sy = dy;
      const dir = (sx === 1 ? 0 : sx === -1 ? 2 : sy === 1 ? 1 : 3) as Dir;
      const next: { x: number; y: number } = { x: dl.x + sx, y: dl.y + sy };
      if (!sim.inBounds(next.x, next.y)) break;
      const cur = sim.get(dl.x, dl.y);
      if (cur && (cur.kind === 'belt' || cur.kind === 'turbo')) {
        cur.rot = dir;
        view.onRotated(cur);
      }
      placeAt(next, tool, dir);
      dl = next;
    }
    dragLast = dl;
  } else if (tool === 'bulldoze') {
    removeAt(cell);
    dragLast = cell;
  }
});

window.addEventListener('pointerup', () => { dragging = false; dragLast = null; });
window.addEventListener('pointercancel', () => { dragging = false; dragLast = null; });
window.addEventListener('blur', () => { dragging = false; dragLast = null; });
dom.addEventListener('pointerleave', () => {
  hoverCell = null;
  view.setHover(null, 'pointer');
  view.positionGhost(null);
  refreshTileHint(null);
});
dom.addEventListener('contextmenu', (e) => e.preventDefault());

// ---------------- 键盘 ----------------
window.addEventListener('keydown', (ev) => {
  if (ev.repeat || ev.ctrlKey || ev.metaKey || ev.altKey) return;
  const target = ev.target as HTMLElement;
  if (hud.modalOpen || target.closest('input, textarea, select, [contenteditable="true"]')) return;
  if ((ev.key === ' ' || ev.key === 'Enter') && target.closest('button, summary, [role="button"]')) return;
  sound.unlock(); // 首次手势解锁 AudioContext（幂等）
  const k = ev.key.toLowerCase();
  if (k >= '1' && k <= '9') {
    const idx = parseInt(k) - 1;
    if (idx < PALETTE_ORDER.length) switchTool(PALETTE_ORDER[idx]);
    return;
  }
  if (k === '0') { switchTool(PALETTE_ORDER[9]); return; }
  switch (k) {
    case 'q': switchTool('pointer'); break;
    case 'x': switchTool('bulldoze'); break;
    case 'r': rotateAction(); break;
    case 'm': moveAction(); break;
    case 'u': upgradeAction(); break;
    case ' ': ev.preventDefault(); togglePause(); break;
    case 'escape':
      if (moving) cancelMove();
      else if (tool !== 'pointer') switchTool('pointer');
      else select(null);
      break;
    case 'f3': ev.preventDefault(); perfDetail = !perfDetail; document.body.classList.toggle('perf-detail', perfDetail); break;
    case 'h': hud.showHelp(); break;
  }
});

function togglePause() {
  paused = !paused;
  hud.setSpeedBtn(paused ? 0 : speedIdx + 1);
}

// ---------------- 存读档 ----------------
function emptySave(): SaveData {
  return { v: 1, time: 0, ledger: { produced: {}, consumed: {}, exported: {}, destroyed: {} }, ents: [], goals: [] };
}

function saveGame(verbose: boolean, replace = verbose) {
  if (protectSave && !replace) return;
  try {
    const data = saveData();
    const state = JSON.stringify(data);
    if (state !== lastSavedState || verbose) {
      if (lastValidSave) {
        try { localStorage.setItem(BACKUP_KEY, lastValidSave); } catch { /* A full store may still fit the primary. */ }
      }
      const raw = JSON.stringify({ ...data, ts: Date.now() });
      localStorage.setItem(SAVE_KEY, raw);
      lastValidSave = raw;
      lastSavedState = state;
    }
    protectSave = false;
    if (verbose) hud.toast(t('toast.saved'));
  } catch (e) {
    if (verbose) hud.toast(t('toast.saveFail'), 'error-toast');
  }
}

function loadGame(verbose = true) {
  try {
    const save = loadFactorySave(localStorage);
    if (!save) {
      if (verbose) hud.toast(t('toast.noSave'), 'error-toast');
      return false;
    }
    applySave(save);
    lastValidSave = save.raw;
    lastSavedState = undefined;
    protectSave = false;
    if (save.recovered || verbose) hud.toast(t(save.recovered ? 'toast.recovered' : 'toast.loaded'));
    return true;
  } catch {
    protectSave = true;
    hud.toast(t('toast.localSaveInvalid'), 'error-toast');
    return false;
  }
}

function applySave(save: ReturnType<typeof decodeFactorySave>) {
  sim.load(save.sim.serialize());
  world.syncRegions(sim);
  paused = save.playback.paused;
  speedIdx = save.playback.speed;
  acc = 0;
  if (save.camera) {
    world.camera.position.fromArray(save.camera.position);
    world.controls.target.fromArray(save.camera.target);
    world.controls.update();
  }
  hud.setSpeedBtn(paused ? 0 : speedIdx + 1);
  view.rebuildAll();
  moving = null;
  switchTool('pointer');
  hud.refreshOrders(sim);
  hud.refreshFrontier(sim);
  hud.setCredits(sim.credits);
  hud.refreshStats(sim);
  hud.refreshGoals(sim);
}

function saveData() {
  return {
    sim: snapshot(),
    playback: { paused, speed: speedIdx },
    camera: { position: world.camera.position.toArray(), target: world.controls.target.toArray() },
  };
}

function exportFile() {
  const blob = new Blob([JSON.stringify({ ...saveData(), ts: Date.now() }, null, 1)], { type: 'application/json' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = 'microfactory-save.json';
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 2000);
  hud.toast(t('toast.exportedFile'));
}

function importFile(f: File) {
  f.text().then(txt => {
    try {
      applySave(decodeFactorySave(txt));
      if (protectSave) saveGame(false, true);
      hud.toast(t('toast.imported'));
    } catch { hud.toast(t('toast.parseFail'), 'error-toast'); }
  }).catch(() => hud.toast(t('toast.parseFail'), 'error-toast'));
}

function snapshot() {
  const data = sim.serialize();
  // A machine in transit is extracted from cells but still belongs to the factory.
  if (moving) data.ents.push({ ...moving.data, x: moving.from.x, y: moving.from.y });
  return data;
}

function clearSim() {
  sim.load(emptySave());
  world.syncRegions(sim);
  world.focusRegion('harbor');
  view.rebuildAll();
  select(null);
  moving = null;
  view.setGhost(null, 0, true);
  switchTool('pointer');
  hud.refreshFrontier(sim);
}

// 自动存档（首次欢迎引导尚未选择时不写入空存档）
setInterval(() => {
  if (!welcomeOpen) saveGame(false);
}, 20000);
window.addEventListener('pagehide', () => {
  if (!welcomeOpen) saveGame(false);
});
document.addEventListener('visibilitychange', () => {
  if (document.hidden && !welcomeOpen) saveGame(false);
});

// ---------------- 性能统计 ----------------
let frames = 0;
let perfAcc = 0;
let frameMsAcc = 0;
let simMsAcc = 0;
let lastFps = 60;
let lastItems = 0;

function countItems(): number {
  let n = 0;
  for (const b of sim.belts) n += b.items!.length;
  for (const n2 of sim.nodes) n += n2.queue!.length;
  return n;
}

function updatePerf(rawDt: number, simMs: number) {
  frames++;
  perfAcc += rawDt;
  frameMsAcc += rawDt * 1000;
  simMsAcc += simMs;
  if (perfAcc >= 0.5) {
    lastFps = frames / perfAcc;
    const frameMs = frameMsAcc / frames;
    const sms = simMsAcc / frames;
    const calls = world.renderer.info.render.calls;
    lastItems = countItems();
    if (perfDetail) {
      hud.setPerf(t('perf.detail', {
        fps: lastFps.toFixed(0), fm: frameMs.toFixed(1), sm: sms.toFixed(2),
        c: calls, i: lastItems, bt: sim.belts.length, m: sim.procs.length,
      }), lastFps < 50);
    } else {
      hud.setPerf(t('perf.simple', { fps: lastFps.toFixed(0), fm: frameMs.toFixed(1), i: lastItems }), lastFps < 50);
    }
    frames = 0; perfAcc = 0; frameMsAcc = 0; simMsAcc = 0;
  }
}

// ---------------- 周期性 UI 刷新 ----------------
let uiAcc = 0;
let statsAcc = 0;
function refreshUi(rawDt: number) {
  uiAcc += rawDt;
  if (uiAcc >= 0.3) {
    uiAcc = 0;
    hud.setClock(sim.time);
    hud.setCredits(sim.credits);
    hud.refreshOrders(sim);
    hud.refreshFrontier(sim);
    refreshInspector();
  }
  statsAcc += rawDt;
  if (statsAcc >= 1) {
    statsAcc = 0;
    hud.refreshStats(sim);
    const fresh = hud.consumeNewGoals(sim);
    for (const id of fresh) {
      hud.goalToast(goalName(id), goalDesc(id));
      sound.play('goal');
    }
  }
}

// ---------------- 调试钩子（自动化测试用） ----------------
(window as any).__mf = {
  sim, view, world, hud,
  select: (x: number, y: number) => select(sim.get(x, y)),
  place: (k: EntKind, x: number, y: number, r: Dir = 0) => placeAt({ x, y }, k, r),
  remove: (x: number, y: number) => removeAt({ x, y }),
  upgrade: (x: number, y: number) => { const ok = sim.upgrade(x, y); if (ok) { const e = sim.get(x, y); if (e) view.onUpgraded(e); } return ok; },
  buildExample: () => { clearSim(); buildExample(sim); view.rebuildAll(); },
  stats: () => ({
    time: sim.time,
    exported: { ...sim.ledger.exported },
    robotsPerMin: sim.exportPerMin('robot'),
    conservationError: sim.conservationError(),
    items: lastItems,
    fps: lastFps,
    machines: sim.procs.length + sim.nodes.length + sim.terminals.length + sim.generators.length,
    belts: sim.belts.length,
  }),
  setSpeed: (i: number) => { paused = false; speedIdx = Math.max(0, Math.min(2, i)); hud.setSpeedBtn(speedIdx + 1); },
  pause: () => { paused = true; hud.setSpeedBtn(0); },
  resume: () => { paused = false; hud.setSpeedBtn(speedIdx + 1); },
};

// ---------------- 主循环 ----------------
let last = performance.now();
function frame(now: number) {
  const rawDt = Math.min(0.1, (now - last) / 1000);
  last = now;
  let simMs = 0;
  let simDt = 0;
  if (!paused) {
    acc += rawDt * SPEEDS[speedIdx];
    let steps = 0;
    const t0 = performance.now();
    const maxSteps = 6 * SPEEDS[speedIdx];
    while (acc >= STEP && steps < maxSteps) {
      sim.tick(STEP);
      acc -= STEP;
      steps++;
    }
    if (acc > STEP * 10) acc = STEP * 10; // 防死亡螺旋
    simMs = performance.now() - t0;
    simDt = steps * STEP;
  }
  world.animate(rawDt, sim.time);
  world.syncRestoration(sim);
  view.update(simDt, sim.time);
  world.render();
  updatePerf(rawDt, simMs);
  refreshUi(rawDt);
  requestAnimationFrame(frame);
}

// ---------------- 启动 ----------------
const hasSave = loadGame(false);
hud.setTool('pointer');
hud.refreshStats(sim);
hud.refreshGoals(sim);
hud.refreshFrontier(sim);
refreshInspector();
if (!hasSave) {
  paused = true;
  welcomeOpen = true;
  hud.setSpeedBtn(0);
  hud.showWelcome(false, () => {
    welcomeOpen = false;
    buildExample(sim);
    view.rebuildAll();
    paused = false;
    hud.setSpeedBtn(1);
    hud.toast(t('toast.exampleStart'));
  }, () => {
    welcomeOpen = false;
    paused = false;
    hud.setSpeedBtn(1);
    switchTool('belt');
  });
}
requestAnimationFrame(frame);
