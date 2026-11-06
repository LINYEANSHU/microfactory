// ============================================================
// MicroFactory · HUD：顶栏 / 订单 / 建造面板 / 检视器 / 统计 / 目标 / 模态框
// 图标全部为自绘 SVG（统一 24 视窗 / 1.8 线宽 / 圆角端点），无 emoji。
// 所有用户可见文本经 i18n 字典输出（中文 / English），支持运行时切换。
// ============================================================
import { Sim, Ent } from '../sim/engine';
import {
  ITEMS, ITEM_ORDER, ItemKey, EntKind, DEFS, PALETTE_ORDER, recipesFor,
  UPGRADE_COST,
} from '../core/defs';
import { renderIcons } from '../render/icons';
import {
  t, TKey, itemName, kindName, kindDesc, dirName, stateLabel,
} from './i18n';

export type Tool = 'pointer' | 'bulldoze' | EntKind;

export interface HudHooks {
  setTool(t: Tool): void;
  setSpeed(idx: number): void;
  save(): void; load(): void;
  exportFile(): void; importFile(f: File): void;
  reset(): void; example(): void; help(): void;
  rotate(): void; move(): void; remove(): void;
  upgrade(): void;
  toggleSound(): void;
  toggleLang(): void;
}

// ---------------- 图标库（自绘线性 SVG） ----------------
const P = (d: string) => `<path d="${d}"/>`;
const ICONS: Record<string, string> = {
  gear: `<circle cx="12" cy="12" r="3.1"/>${P('M12 2.8v2.6M12 18.6v2.6M2.8 12h2.6M18.6 12h2.6M5.5 5.5l1.9 1.9M16.6 16.6l1.9 1.9M18.5 5.5l-1.9 1.9M7.4 16.6l-1.9 1.9')}`,
  coin: `<circle cx="12" cy="12" r="8.2"/><circle cx="12" cy="12" r="4.4"/>${P('M12 9.9v4.2')}`,
  clock: `<circle cx="12" cy="12" r="8.4"/>${P('M12 7.2V12l3 2.2')}`,
  pause: `<path d="M8.2 5.5v13M15.8 5.5v13"/>`,
  play: `<path d="M7.5 4.8v14.4L19 12z"/>`,
  save: `${P('M5.5 4.5h10.2l2.8 2.8v12.2h-13z M8.5 4.5v4.6h6.4V4.5 M8.5 19.5v-5.4h7v5.4')}`,
  load: `${P('M3.5 6.5a1 1 0 0 1 1-1h4.6l2 2h8.4a1 1 0 0 1 1 1v9.5a1 1 0 0 1-1 1h-15a1 1 0 0 1-1-1z')}`,
  share: `${P('M4.5 19.5h15 M12 4.5v10 M8.2 8.3L12 4.5l3.8 3.8')}`,
  unshare: `${P('M4.5 4.5h15 M12 9v10.5 M8.2 15.7L12 19.5l3.8-3.8')}`,
  reset: `${P('M19.8 12a7.8 7.8 0 1 1-2.3-5.5 M19.8 4.2v3.6h-3.6')}`,
  help: `<circle cx="12" cy="12" r="8.4"/>${P('M9.6 9.3a2.5 2.5 0 1 1 3.5 2.9c-.75.35-1.1.85-1.1 1.7')}<circle cx="12" cy="16.9" r="0.4" fill="currentColor"/>`,
  bolt: P('M13.2 2.8L5.2 13.6h5.4L9.4 21.2l8.9-11h-5.6z'),
  check: P('M4.8 12.6l4.4 4.4L19.2 7'),
  warn: `${P('M12 3.4L2.6 20h18.8z M12 9.6v4.6 M12 17.1v.3')}`,
  block: `<circle cx="12" cy="12" r="8.4"/>${P('M6 6l12 12')}`,
  sound: `${P('M4.5 9.5v5h3.2L12 18.6V5.4L7.7 9.5z M15.2 9.2a4 4 0 0 1 0 5.6 M17.6 6.9a7.2 7.2 0 0 1 0 10.2')}`,
  mute: `${P('M4.5 9.5v5h3.2L12 18.6V5.4L7.7 9.5z M15.5 9.5l5 5 M20.5 9.5l-5 5')}`,
  chart: `${P('M4.5 4v15.5h15 M8.2 15.8v-4.4 M12 15.8V7.6 M15.8 15.8v-2.6')}`,
  bot: `${P('M5 9.5h14v8.5H5z M12 5.8v3.7 M8.6 13.2v1.6 M15.4 13.2v1.6')}<circle cx="12" cy="4.6" r="1.1"/>`,
  trash: `${P('M4.5 7h15 M9.5 7V4.4h5V7 M6.8 7l.9 12.6h8.6L17.2 7 M10.2 10.8v5.4 M13.8 10.8v5.4')}`,
  cursor: P('M5.5 3.5l6.8 15.2 1.9-6L20 10.8z'),
  factory: `${P('M4 20V10.5l5 3v-3l5 3v-3l6 3.5V20z M4 20h16.5 M7 7.2V4.5h2.4v2.7')}`,
  target: `<circle cx="12" cy="12" r="7.6"/><circle cx="12" cy="12" r="3"/>${P('M12 2.2v3M12 18.8v3M2.2 12h3M18.8 12h3')}`,
  lang: `<circle cx="12" cy="12" r="8.4"/>${P('M3.6 12h16.8 M12 3.6c2.6 2.2 4 5.1 4 8.4s-1.4 6.2-4 8.4 M12 3.6c-2.6 2.2-4 5.1-4 8.4s1.4 6.2 4 8.4')}`,
  chevDn: P('M7 10l5 5 5-5'),
};

const icon = (name: string, cls = '') =>
  `<svg class="icon ${cls}" viewBox="0 0 24 24" aria-hidden="true">${ICONS[name] || ''}</svg>`;

const STATE_DOT: Record<string, string> = {
  working: 'ok', starved: 'accent', blocked: 'alert', idle: 'dim',
};

export const GOALS: Array<{ id: string; check: (s: Sim) => boolean }> = [
  { id: 'first', check: s => s.ledger.exported.robot >= 1 },
  { id: 'ten', check: s => s.ledger.exported.robot >= 10 },
  { id: 'build15', check: s => s.procs.length + s.nodes.length + s.terminals.length >= 15 },
  { id: 'rate8', check: s => s.exportPerMin('robot') >= 8 },
  { id: 'first_up', check: s => s.procs.some(p => (p.level || 1) >= 2) },
  { id: 'credits1k', check: s => s.credits >= 1000 },
  { id: 'order3', check: s => s.orderIdx >= 3 },
  { id: 'fifty', check: s => s.ledger.exported.robot >= 50 },
  { id: 'rate15', check: s => s.exportPerMin('robot') >= 15 },
  { id: 'store30', check: s => s.nodes.some(n => n.kind === 'storage' && (n.queue?.length || 0) >= 30) },
];

export const goalName = (id: string) => t(`goal.${id}.name` as TKey);
export const goalDesc = (id: string) => t(`goal.${id}.desc` as TKey);

const itemChip = (ty: ItemKey, n?: number) =>
  `<span class="item-dot" style="background:#${ITEMS[ty].color.toString(16).padStart(6, '0')}"></span>${itemName(ty)}${n && n > 1 ? ` ×${n}` : ''}`;
const money = (n: number) => n.toLocaleString('en-US');

export class Hud {
  root: HTMLElement;
  private perfEl!: HTMLElement;
  private clockEl!: HTMLElement;
  private creditsEl!: HTMLElement;
  private creditsVal = -1;
  private speedBtns: HTMLElement[] = [];
  private toolBtns = new Map<string, HTMLElement>();
  private ordersSec!: HTMLElement;
  private ordersBody!: HTMLElement;
  private inspectorSec!: HTMLElement;
  private inspectorBody!: HTMLElement;
  private statsSec!: HTMLElement;
  private statsBody!: HTMLElement;
  private goalSec!: HTMLElement;
  private goalBody!: HTMLElement;
  private hintEl!: HTMLElement;
  private toastsEl!: HTMLElement;
  private modalBack!: HTMLElement;
  private modalEl!: HTMLElement;
  private spark: HTMLCanvasElement | null = null;
  private lastOrdersIdx = -1;
  private inspectorEmpty = false; // 空状态已渲染则跳过重复 DOM 重建（每 0.3s 刷新一次）
  // 面板 DOM 去重：记录当前渲染的 HTML，内容未变化时跳过 innerHTML 重建（省解析/布局/监听器重绑）
  private lastOrdersHtml = '';
  private lastInspectorHtml = '';
  private lastStatsHtml = '';
  private creditsValEl: HTMLElement | null = null;
  // 语言切换时重建 DOM 所需的当前状态快照
  private curTool: Tool = 'pointer';
  private curSpeed = 1;
  private curSound = true;
  private icons: Record<EntKind, string> | null = null; // 3D 图标缓存（避免重建面板时重复离屏渲染）
  private modalReturnFocus: HTMLElement | null = null;
  private toolbarObserver = new ResizeObserver(() => {
    const bar = document.getElementById('topbar');
    if (bar) this.root.style.setProperty('--hud-top', `${bar.offsetTop + bar.offsetHeight + 10}px`);
  });

  constructor(private hooks: HudHooks) {
    this.root = document.getElementById('ui')!;
    this.buildStatic();
  }

  /** 构建全部静态 DOM 并绑定事件（构造与语言切换时调用） */
  private buildStatic() {
    this.toolbarObserver.disconnect();
    this.speedBtns = [];
    this.toolBtns.clear();
    this.root.innerHTML = `
      <div id="topbar" class="panel">
        <div class="logo">${icon('gear')}MicroFactory</div>
        <div class="divider"></div>
        <div class="credits" id="credits" title="${t('top.creditsTip')}">${icon('coin')}<span id="credits-val">0</span></div>
        <div class="divider"></div>
        <div class="clock" id="clock">00:00</div>
        <div class="divider"></div>
        <div class="speed-group" id="speed-group"></div>
        <div class="divider"></div>
        <div id="perf">--</div>
        <div class="toolbar-actions">
        <button class="btn mobile-panel-toggle" id="b-palette" aria-controls="palette" aria-expanded="false">${icon('factory')}${t('top.build')}</button>
        <button class="btn mobile-panel-toggle" id="b-side" aria-controls="side" aria-expanded="false">${icon('chart')}${t('top.overview')}</button>
        <button class="btn" id="b-example">${t('top.example')}</button>
        <button class="btn" id="b-save" title="${t('top.saveTip')}">${icon('save')}${t('top.save')}</button>
        <details class="file-menu"><summary class="btn">${icon('load')}${t('top.files')}</summary><div class="file-menu-body">
        <button class="btn" id="b-load" title="${t('top.loadTip')}">${icon('load')}${t('top.load')}</button>
        <button class="btn" id="b-export" title="${t('top.exportTip')}">${icon('share')}${t('top.export')}</button>
        <button class="btn" id="b-import" title="${t('top.importTip')}">${icon('unshare')}${t('top.import')}</button>
        <button class="btn danger" id="b-reset" title="${t('top.resetTip')}">${icon('reset')}${t('top.reset')}</button>
        <button class="btn" id="b-sound" title="${t('top.soundTip')}">${icon('sound')}</button>
        <button class="btn" id="b-help" title="${t('top.helpTip')}">${icon('help')}</button>
        </div></details>
        <button class="btn" id="b-lang" title="${t('lang.tip')}">${icon('lang')}<span style="font-size:11.5px;font-weight:600">${t('lang.switch')}</span></button>
        </div>
      </div>
      <div id="palette" class="panel"></div>
      <div id="side">
        <section id="orders" class="panel"><h3>${icon('bot')}${t('sec.orders')}<span class="after"></span></h3><div class="sec-body" id="orders-body"></div></section>
        <section id="inspector" class="panel"><h3>${icon('cursor')}${t('sec.inspector')}<span class="after"></span><span class="chev"></span></h3><div class="sec-body" id="inspector-body"></div></section>
        <section id="stats" class="panel collapsed"><h3>${icon('chart')}${t('sec.stats')}<span class="after"></span><span class="chev"></span></h3><div class="sec-body" id="stats-body"></div></section>
        <section id="goals" class="panel collapsed"><h3>${icon('target')}${t('sec.goals')}<span class="after"></span><span class="chev"></span></h3><div class="sec-body" id="goal-body"></div></section>
      </div>
      <div id="hintbar" class="panel"></div>
      <div id="toasts" role="status" aria-live="polite"></div>
      <div id="modal-back" class="hidden"><div id="modal" class="panel" role="dialog" aria-modal="true" tabindex="-1"></div></div>
      <input type="file" id="file-import" accept=".json" style="display:none" />
    `;
    this.perfEl = document.getElementById('perf')!;
    this.clockEl = document.getElementById('clock')!;
    this.creditsEl = document.getElementById('credits')!;
    this.hintEl = document.getElementById('hintbar')!;
    this.toastsEl = document.getElementById('toasts')!;
    this.modalBack = document.getElementById('modal-back')!;
    this.modalEl = document.getElementById('modal')!;
    this.ordersBody = document.getElementById('orders-body')!;
    this.ordersSec = document.getElementById('orders')!;
    this.inspectorBody = document.getElementById('inspector-body')!;
    this.statsBody = document.getElementById('stats-body')!;
    this.goalBody = document.getElementById('goal-body')!;
    this.inspectorSec = document.getElementById('inspector')!;
    this.statsSec = document.getElementById('stats')!;
    this.goalSec = document.getElementById('goals')!;

    // 语言切换重建后强制重绘动态面板
    this.lastOrdersHtml = '';
    this.lastInspectorHtml = '';
    this.lastStatsHtml = '';
    this.inspectorEmpty = false;
    this.lastOrdersIdx = -1;
    this.creditsValEl = null;
    this.spark = null;

    this.buildSpeed();
    this.buildPalette();
    this.buildTopbarActions();
    for (const id of ['palette', 'side']) {
      document.getElementById(`b-${id}`)!.addEventListener('click', () => {
        const open = !this.root.classList.contains(`show-${id}`);
        for (const panel of ['palette', 'side']) {
          this.root.classList.toggle(`show-${panel}`, open && panel === id);
          document.getElementById(`b-${panel}`)!.setAttribute('aria-expanded', String(open && panel === id));
        }
      });
    }
    for (const sec of [this.ordersSec, this.inspectorSec, this.statsSec, this.goalSec]) {
      const h = sec.querySelector('h3')!;
      h.setAttribute('role', 'button'); h.tabIndex = 0;
      const sync = () => h.setAttribute('aria-expanded', String(!sec.classList.contains('collapsed')));
      const toggle = () => { sec.classList.toggle('collapsed'); sync(); };
      h.addEventListener('click', toggle);
      h.addEventListener('keydown', e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); toggle(); } });
      sync();
    }
    document.getElementById('file-import')!.addEventListener('change', (e) => {
      const f = (e.target as HTMLInputElement).files?.[0];
      if (f) this.hooks.importFile(f);
      (e.target as HTMLInputElement).value = '';
    });
    for (const button of this.root.querySelectorAll<HTMLButtonElement>('button[title]')) button.setAttribute('aria-label', button.title);
    this.toolbarObserver.observe(document.getElementById('topbar')!);
  }

  /** 切换语言后重建整个 HUD，并恢复工具/速度/音效/资金/折叠状态 */
  rebuild() {
    const tool = this.curTool, speed = this.curSpeed;
    const collapsed = new Set<string>();
    for (const sec of [this.ordersSec, this.inspectorSec, this.statsSec, this.goalSec]) {
      if (sec.classList.contains('collapsed')) collapsed.add(sec.id);
    }
    this.buildStatic();
    for (const sec of [this.ordersSec, this.inspectorSec, this.statsSec, this.goalSec]) {
      sec.classList.toggle('collapsed', collapsed.has(sec.id));
      sec.querySelector('h3')!.setAttribute('aria-expanded', String(!collapsed.has(sec.id)));
    }
    this.setTool(tool);
    this.setSpeedBtn(speed);
    this.setSoundOn(this.curSound);
    if (this.creditsVal >= 0) {
      this.creditsValEl = document.getElementById('credits-val');
      this.creditsValEl!.textContent = money(this.creditsVal);
    }
    this.closeModal(); // 打开中的模态框内容为切换前语言，直接关闭最稳妥
  }

  private buildSpeed() {
    const group = document.getElementById('speed-group')!;
    const defs: Array<[string, string, string]> = [
      [icon('pause'), t('speed.pause'), ''],
      [icon('play'), t('speed.x1'), '×1'],
      [icon('play'), t('speed.x2'), '×2'],
      [icon('play'), t('speed.x4'), '×4'],
    ];
    defs.forEach(([ic, title, label], i) => {
      const b = document.createElement('button');
      b.className = 'btn';
      b.innerHTML = ic + (label ? `<span style="font-size:11.5px;font-weight:600">${label}</span>` : '');
      b.title = title;
      b.setAttribute('aria-label', title);
      b.addEventListener('click', () => this.hooks.setSpeed(i));
      group.appendChild(b);
      this.speedBtns.push(b);
    });
    this.setSpeedBtn(1);
  }

  private buildPalette() {
    // recycler 不在 PALETTE_ORDER（无快捷键），但面板需要它的图标
    if (!this.icons) this.icons = renderIcons([...PALETTE_ORDER, 'recycler']);
    const icons = this.icons;
    const pal = document.getElementById('palette')!;
    const mkBtn = (id: string, ic: string, label: string) => {
      const b = document.createElement('button');
      b.className = 'btn';
      b.innerHTML = ic + label;
      b.addEventListener('click', () => this.hooks.setTool(id as Tool));
      pal.appendChild(b);
      this.toolBtns.set(id, b);
      return b;
    };
    const row = document.createElement('div');
    row.className = 'tool-row';
    pal.appendChild(row);
    row.appendChild(mkBtn('pointer', icon('cursor'), t('pal.select')));
    row.appendChild(mkBtn('bulldoze', icon('trash'), t('pal.bulldoze')));

    const cats: Array<[string, EntKind[]]> = [
      [t('pal.logistics'), ['belt', 'turbo', 'splitter', 'merger', 'storage']],
      [t('pal.production'), ['extractor', 'furnace', 'press', 'assembler', 'recycler']],
      [t('pal.special'), ['export']],
    ];
    for (const [cat, kinds] of cats) {
      const h = document.createElement('h3');
      h.textContent = cat;
      pal.appendChild(h);
      for (const k of kinds) {
        const d = DEFS[k];
        const card = document.createElement('button');
        card.type = 'button';
        card.className = 'pcard';
        card.innerHTML = `
          <img src="${icons[k]}" alt="${kindName(k)}" />
          <div><div class="pname">${kindName(k)}</div><div class="pdesc">${kindDesc(k)}</div></div>
          <span class="hk">${d.hotkey ?? ''}</span>
        `;
        card.addEventListener('click', () => this.hooks.setTool(k));
        pal.appendChild(card);
        this.toolBtns.set(k, card);
      }
    }
  }

  private buildTopbarActions() {
    const bind = (id: string, fn: () => void) => document.getElementById(id)!.addEventListener('click', fn);
    bind('b-example', () => this.hooks.example());
    bind('b-save', () => this.hooks.save());
    bind('b-load', () => this.hooks.load());
    bind('b-export', () => this.hooks.exportFile());
    bind('b-import', () => (document.getElementById('file-import') as HTMLInputElement).click());
    bind('b-reset', () => this.hooks.reset());
    bind('b-sound', () => this.hooks.toggleSound());
    bind('b-lang', () => this.hooks.toggleLang());
    bind('b-help', () => this.hooks.help());
  }

  /** 音效开关图标状态（由 main 持久化并回传状态） */
  setSoundOn(on: boolean) {
    this.curSound = on;
    const b = document.getElementById('b-sound');
    if (!b) return;
    b.innerHTML = icon(on ? 'sound' : 'mute');
    b.classList.toggle('active', on);
  }

  // ---------------- 状态设置 ----------------
  setTool(t2: Tool) {
    this.curTool = t2;
    for (const [k, el] of this.toolBtns) {
      el.classList.toggle('selected', k === t2);
      el.setAttribute('aria-pressed', String(k === t2));
    }
    this.root.classList.remove('show-palette');
    document.getElementById('b-palette')?.setAttribute('aria-expanded', 'false');
    const app = document.getElementById('app')!;
    app.className = t2 === 'pointer' ? '' : t2 === 'bulldoze' ? 'tool-bulldoze' : 'tool-build';
    const tips: Array<[Tool, string]> = [
      ['pointer', t('hint.pointer')],
      ['bulldoze', t('hint.bulldoze')],
    ];
    const tip = tips.find(x => x[0] === t2);
    if (tip) this.hintEl.innerHTML = tip[1];
    else {
      const d = t2 as EntKind;
      this.hintEl.innerHTML = t('hint.build', { name: kindName(d) });
    }
  }

  setSpeedBtn(idx: number) {
    this.curSpeed = idx;
    this.speedBtns.forEach((b, i) => { b.classList.toggle('active', i === idx); b.setAttribute('aria-pressed', String(i === idx)); });
  }

  setPerf(html: string, warn: boolean) {
    this.perfEl.innerHTML = html;
    this.perfEl.classList.toggle('warn', warn);
  }

  setClock(t2: number) {
    const m = Math.floor(t2 / 60), s = Math.floor(t2 % 60);
    this.clockEl.textContent = `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
  }

  setCredits(v: number) {
    const el = this.creditsValEl ?? (this.creditsValEl = document.getElementById('credits-val')!);
    if (Math.floor(v) !== this.creditsVal) {
      this.creditsVal = Math.floor(v);
      el.textContent = money(this.creditsVal);
      this.creditsEl.classList.remove('bump');
      void this.creditsEl.offsetWidth; // 重启动画
      this.creditsEl.classList.add('bump');
    }
  }

  hint(html: string) { this.hintEl.innerHTML = html; }

  // ---------------- 订单面板 ----------------
  refreshOrders(sim: Sim) {
    const o = sim.currentOrder();
    const pct = Math.min(100, (o.progress / o.target) * 100);
    const body = `
      <div class="order-head">${icon('bot')}<span class="order-title">${t('order.no', { n: o.idx + 1 })}</span>
        <span class="order-reward">${icon('coin')} +${money(o.reward)}</span></div>
      <div class="order-item">
        <span style="font-size:13px">${itemChip(o.item)}</span>
        <span class="num"><b>${money(o.progress)}</b><span class="of"> / ${money(o.target)}</span></span>
      </div>
      <div class="bar"><i style="width:${pct.toFixed(1)}%"></i></div>
      <div class="order-note">${t('order.note', { item: itemName(o.item) })}</div>
    `;
    if (body !== this.lastOrdersHtml) {
      this.lastOrdersHtml = body;
      this.ordersBody.innerHTML = body;
    }
    if (o.idx !== this.lastOrdersIdx) {
      this.lastOrdersIdx = o.idx;
      this.ordersSec.classList.remove('collapsed');
    }
  }

  // ---------------- 检视器 ----------------
  refreshInspector(sel: Ent | null, sim: Sim) {
    if (!sel) {
      if (this.inspectorEmpty) return; // 内容不变，跳过重建
      this.inspectorEmpty = true;
      this.lastInspectorHtml = ''; // 空状态不计入去重缓存，确保下次选中实体一定重建
      this.inspectorBody.innerHTML = `<div class="kv"><span>${t('insp.empty')}</span></div>
        <div class="kv"><span>${t('insp.emptyHint')}</span></div>`;
      return;
    }
    this.inspectorEmpty = false;
    const pos = t('insp.pos', { x: sel.x, y: sel.y, d: dirName(sel.rot) });
    let body = `<div class="kv"><span><b>${kindName(sel.kind)}</b>${sel.level && sel.level > 1 ? `<span class="lv-pips" title="${t('insp.level', { n: sel.level })}">${[1, 2, 3].map(i => `<i class="${i <= (sel.level || 1) ? 'on' : ''}"></i>`).join('')}</span>` : ''}</span><span class="num">${pos}</span></div>`;

    if (sel.kind === 'belt' || sel.kind === 'turbo') {
      body += `<div class="kv"><span>${t('insp.speed')}</span><b>${t('insp.beltSpeed', { v: sel.kind === 'turbo' ? '3.0' : '1.5' })}</b></div>`;
      body += `<div class="kv"><span>${t('insp.carrying')}</span><b>${t('insp.count', { n: sel.items!.length })}</b></div>`;
      if (sel.items!.length) {
        const c = new Map<ItemKey, number>();
        for (const it of sel.items!) c.set(it.ty, (c.get(it.ty) || 0) + 1);
        body += `<div style="font-size:12px;color:var(--ink-dim);margin-top:4px">${[...c].map(([ty, n]) => itemChip(ty, n)).join(' ')}</div>`;
      }
    } else if (sel.kind === 'splitter' || sel.kind === 'merger') {
      body += `<div class="kv"><span>${kindDesc(sel.kind)}</span></div>`;
      body += `<div class="kv"><span>${t('insp.queue')}</span><b>${sel.queue!.length} / 3</b></div>`;
    } else if (sel.kind === 'storage') {
      const n = sel.queue!.length;
      body += `<div class="kv"><span>${t('insp.stock')}</span><b>${n} / 48</b></div>`;
      body += `<div class="bar b"><i style="width:${(n / 48 * 100).toFixed(0)}%"></i></div>`;
      const c = new Map<ItemKey, number>();
      for (const ty of sel.queue!) c.set(ty, (c.get(ty) || 0) + 1);
      body += `<div style="font-size:12px;color:var(--ink-dim);margin-top:4px">${[...c].map(([ty, n2]) => itemChip(ty, n2)).join(' ')}</div>`;
    } else if (sel.kind === 'export') {
      body += `<div class="kv"><span>${t('insp.exportedHere')}</span></div>`;
      let total = 0;
      for (const ty of ITEM_ORDER) {
        const n = sel.counts!.get(ty) || 0;
        total += n;
        if (n > 0) body += `<div class="kv"><span>${itemChip(ty)}</span><b>${n}</b></div>`;
      }
      body += `<div class="kv"><span>${t('insp.total')}</span><b>${total}</b></div>`;
    } else {
      // 加工机器
      const st = sel.state!;
      body += `<div class="kv"><span>${t('insp.state')}</span><span class="state-chip state-${st}"><span class="dot"></span>${stateLabel(st)}</span></div>`;
      if (sel.kind !== 'extractor') {
        const rs = recipesFor(sel.kind as 'furnace' | 'press' | 'assembler' | 'recycler');
        body += `<div style="font-size:12px;color:var(--ink-dim);margin-top:2px">${t('insp.recipes')}</div>`;
        for (const r of rs) {
          const inPart = (Object.keys(r.inputs) as ItemKey[]).map(k => itemChip(k, r.inputs[k])).join(' + ');
          const outPart = (Object.keys(r.outputs) as ItemKey[]).map(k => itemChip(k, r.outputs[k])).join(' + ');
          const act = sel.recipe?.id === r.id;
          body += `<div class="recipe-line ${act ? 'hot' : ''}">${inPart} <span class="recipe-arrow">→</span> ${outPart} <span style="color:var(--ink-dim)">${(r.time / [1, 1.5, 2.25][(sel.level || 1) - 1]).toFixed(1)}s</span></div>`;
        }
      } else {
        body += `<div class="kv"><span>${t('insp.ore')}</span><b>${sel.ore === 'copper' ? t('insp.oreCopper') : t('insp.oreIron')}</b></div>`;
        body += `<div class="kv"><span>${t('insp.cycleLabel')}</span><b>${t('insp.cycle', { v: (2 / [1, 1.5, 2.25][(sel.level || 1) - 1]).toFixed(1) })}</b></div>`;
      }
      if (sel.recipe) {
        body += `<div class="bar"><i style="width:${((sel.progress || 0) * 100).toFixed(0)}%"></i></div>`;
      }
      const pool = [...sel.pool!].map(([ty, n]) => itemChip(ty, n)).join(' ') || `<span style="color:var(--ink-dim)">${t('insp.emptyBuf')}</span>`;
      const outBuf = [...sel.out!].map(([ty, n]) => itemChip(ty, n)).join(' ') || `<span style="color:var(--ink-dim)">${t('insp.emptyBuf')}</span>`;
      body += `<div class="kv"><span>${t('insp.inputBuf')}</span></div><div style="font-size:12px">${pool}</div>`;
      body += `<div class="kv"><span>${t('insp.outputBuf')}</span></div><div style="font-size:12px">${outBuf}</div>`;
      const u = ((sel.emaW || 0) * 100).toFixed(0);
      body += `<div class="kv"><span>${t('insp.util')}</span><b>${u}%</b></div>`;
      body += `<div class="bar g"><i style="width:${u}%"></i></div>`;
      // 升级
      const cost = sim.upgradeCost(sel);
      if (cost !== null) {
        const afford = sim.credits >= cost;
        const nextDiv = [1, 1.5, 2.25][sel.level || 1];
        body += `<button class="btn primary btn-upgrade" id="sa-up" ${afford ? '' : 'disabled'}
          title="${t('insp.upgradeTip', { m: nextDiv })}">${icon('bolt')}<span>${t('insp.upgradeTo', { n: sel.level === 1 ? 2 : 3, m: nextDiv })}</span><span class="cost">${money(cost)}</span></button>`;
      } else {
        body += `<div class="kv" style="margin-top:6px"><span>${icon('bolt')} ${t('insp.maxed')}</span></div>`;
      }
    }
    body += `<div class="sel-actions">
      <button class="btn" id="sa-rot">${icon('reset')}${t('insp.rotate')}</button>
      <button class="btn" id="sa-move">${icon('cursor')}${t('insp.move')}</button>
      <button class="btn danger" id="sa-del">${icon('trash')}${t('insp.demolish')}</button>
    </div>`;
    // HTML 与当前渲染一致 → 跳过重建（省解析/布局；旧按钮监听器仍有效，行为一致）
    if (body === this.lastInspectorHtml) return;
    this.lastInspectorHtml = body;
    this.inspectorBody.innerHTML = body;
    document.getElementById('sa-rot')!.addEventListener('click', () => this.hooks.rotate());
    document.getElementById('sa-move')!.addEventListener('click', () => this.hooks.move());
    document.getElementById('sa-del')!.addEventListener('click', () => this.hooks.remove());
    const up = document.getElementById('sa-up');
    if (up) up.addEventListener('click', () => this.hooks.upgrade());
  }

  // ---------------- 统计面板 ----------------
  refreshStats(sim: Sim) {
    let body = `<div class="kv"><span>${t('stats.exportRate')}</span></div>`;
    let any = false;
    for (const ty of ITEM_ORDER) {
      const rate = sim.exportPerMin(ty);
      const total = sim.ledger.exported[ty];
      if (rate < 0.05 && total === 0) continue;
      any = true;
      body += `<div class="kv"><span>${itemChip(ty)}</span><b class="num">${t('stats.rate', { r: rate >= 10 ? rate.toFixed(0) : rate.toFixed(1), n: money(total) })}</b></div>`;
    }
    if (!any) body += `<div class="kv"><span style="color:var(--ink-dim)">${t('stats.none')}</span></div>`;

    // 机器人产能 sparkline（近 60 秒逐秒出货）
    const robotTotal = sim.ledger.exported.robot;
    if (robotTotal > 0 || sim.exportPerMin('robot') > 0) {
      body += `<div class="spark-wrap"><canvas id="spark" width="232" height="30"></canvas></div>`;
    }

    // 历史曲线（每 10 秒采样，最长 1 小时）：资金 + 累计出货
    if (sim.hist.length >= 2) {
      body += `<div class="spark-wrap"><canvas id="histchart" width="232" height="72"></canvas></div>`;
    }

    const states = { working: 0, starved: 0, blocked: 0, idle: 0 };
    let uSum = 0;
    for (const p of sim.procs) { states[p.state!]++; uSum += p.emaW || 0; }
    const avgU = sim.procs.length ? uSum / sim.procs.length : 0;
    body += `<div class="kv" style="margin-top:6px"><span>${t('stats.machines', { n: sim.procs.length })}</span></div>`;
    body += `<div class="kv"><span>${t('stats.overview', { w: states.working, s: states.starved, b: states.blocked, i: states.idle })}</span></div>`;
    body += `<div class="kv"><span>${t('stats.avgUtil')}</span><b>${(avgU * 100).toFixed(0)}%</b></div>`;
    body += `<div class="bar g"><i style="width:${(avgU * 100).toFixed(0)}%"></i></div>`;
    const load = sim.beltLoad();
    body += `<div class="kv"><span>${t('stats.beltLoad')}</span><b>${(load * 100).toFixed(0)}%</b></div>`;
    body += `<div class="bar b"><i style="width:${(load * 100).toFixed(0)}%"></i></div>`;

    const blocked = sim.procs.filter(p => (p.emaB || 0) > 0.15).sort((a, b) => b.emaB! - a.emaB!).slice(0, 3);
    const starved = sim.procs.filter(p => (p.emaS || 0) > 0.3).sort((a, b) => b.emaS! - a.emaS!).slice(0, 3);
    body += `<div class="kv" style="margin-top:6px"><span>${t('stats.bottleneck')}</span></div>`;
    if (blocked.length === 0 && starved.length === 0) {
      body += `<div class="bottleneck good"><div class="bn-title">${icon('check')}${t('stats.bn.good')}</div><div class="bn-sub">${t('stats.bn.goodSub')}</div></div>`;
    }
    for (const p of blocked) {
      body += `<div class="bottleneck warn"><div class="bn-title">${icon('block')}${t('stats.bn.blocked', { name: kindName(p.kind), x: p.x, y: p.y })}</div><div class="bn-sub">${t('stats.bn.blockedSub', { p: (p.emaB! * 100).toFixed(0) })}</div></div>`;
    }
    for (const p of starved) {
      body += `<div class="bottleneck hint"><div class="bn-title">${icon('warn')}${t('stats.bn.starved', { name: kindName(p.kind), x: p.x, y: p.y })}</div><div class="bn-sub">${t('stats.bn.starvedSub', { p: (p.emaS! * 100).toFixed(0) })}</div></div>`;
    }
    if (body !== this.lastStatsHtml) {
      this.lastStatsHtml = body;
      this.statsBody.innerHTML = body;
    }
    this.drawSpark(sim); // sparkline 数据每秒平移，即使 HTML 未变也需重绘
    this.drawHistory(sim);
  }

  /** 历史双曲线：资金（琥珀）+ 累计出货（青色），各自归一化 */
  private drawHistory(sim: Sim) {
    const c = document.getElementById('histchart') as HTMLCanvasElement | null;
    if (!c || sim.hist.length < 2) return;
    const g = c.getContext('2d')!;
    const W = c.width, H = c.height, padB = 12;
    g.clearRect(0, 0, W, H);
    g.fillStyle = '#1d222a';
    g.fillRect(0, 0, W, H);
    const n = sim.hist.length;
    // 网格横线（三档）
    g.strokeStyle = 'rgba(236,238,242,0.08)';
    g.lineWidth = 1;
    for (const f of [1 / 3, 2 / 3, 1]) {
      const y = Math.round((H - padB) * (1 - f)) + 0.5;
      g.beginPath(); g.moveTo(0.5, y); g.lineTo(W - 0.5, y); g.stroke();
    }
    const line = (get: (h: { t: number; credits: number; exported: number }) => number, color: string, fill?: string) => {
      let min = Infinity, max = -Infinity;
      for (const h of sim.hist) { const v = get(h); if (v < min) min = v; if (v > max) max = v; }
      const span = Math.max(1e-6, max - min);
      g.beginPath();
      for (let i = 0; i < n; i++) {
        const x = (i / (n - 1)) * (W - 2) + 1;
        const y = (H - padB) * (1 - (get(sim.hist[i]) - min) / span) + 2;
        if (i === 0) g.moveTo(x, y); else g.lineTo(x, y);
      }
      g.strokeStyle = color;
      g.lineWidth = 1.6;
      g.stroke();
      if (fill) {
        g.lineTo(W - 1, H - padB); g.lineTo(1, H - padB); g.closePath();
        g.fillStyle = fill; g.fill();
      }
    };
    line(h => h.exported, '#4dd0ff', 'rgba(77,208,255,0.10)');
    line(h => h.credits, '#f5a524');
    // 图例
    g.font = '9px sans-serif';
    g.fillStyle = '#f5a524';
    g.fillRect(4, 4, 6, 2);
    g.fillText(t('stats.legend.credits', { n: money(sim.credits) }), 13, 8);
    g.fillStyle = '#4dd0ff';
    g.fillRect(64, 4, 6, 2);
    g.fillText(t('stats.legend.exported', { n: money(sim.totalExported) }), 73, 8);
  }

  private drawSpark(sim: Sim) {
    this.spark = document.getElementById('spark') as HTMLCanvasElement | null;
    if (!this.spark) return;
    const g = this.spark.getContext('2d')!;
    const W = this.spark.width, H = this.spark.height;
    g.clearRect(0, 0, W, H);
    // 逐秒机器人出货（60 桶环形 → 按时间序）
    const data: number[] = [];
    for (let i = 1; i <= 60; i++) {
      data.push(sim.exportRing[(sim.ringIdx + i) % 60]['robot'] || 0);
    }
    const max = Math.max(1, ...data);
    g.fillStyle = '#1d222a';
    g.fillRect(0, 0, W, H);
    const bw = W / 60;
    for (let i = 0; i < 60; i++) {
      const h = (data[i] / max) * (H - 4);
      if (h <= 0) continue;
      g.fillStyle = i >= 55 ? '#f5a524' : 'rgba(245,165,36,0.55)';
      g.fillRect(i * bw + 0.5, H - 2 - h, Math.max(1, bw - 1.5), h);
    }
    g.fillStyle = '#99a1ad';
    g.font = '9px sans-serif';
    g.fillText(t('stats.sparkRate', { r: sim.exportPerMin('robot').toFixed(1) }), 4, 10);
  }

  refreshGoals(sim: Sim) {
    let body = '';
    for (const g of GOALS) {
      const done = sim.goals.has(g.id) || g.check(sim);
      if (done && !sim.goals.has(g.id)) sim.goals.add(g.id);
      body += `<div class="goal ${done ? 'done' : ''}"><div class="gcheck">${icon('check')}</div><div><div class="gname">${goalName(g.id)}</div><div class="gdesc">${goalDesc(g.id)}</div></div></div>`;
    }
    this.goalBody.innerHTML = body;
  }

  consumeNewGoals(sim: Sim): string[] {
    const fresh: string[] = [];
    for (const g of GOALS) {
      if (!sim.goals.has(g.id) && g.check(sim)) {
        sim.goals.add(g.id);
        fresh.push(g.id);
      }
    }
    return fresh;
  }

  // ---------------- Toast ----------------
  toast(html: string, cls = '') {
    const t2 = document.createElement('div');
    t2.className = `toast ${cls}`;
    t2.innerHTML = `<span class="tdot"></span><span>${html}</span>`;
    this.toastsEl.appendChild(t2);
    setTimeout(() => t2.classList.add('fade'), cls.includes('goal') || cls.includes('order') ? 4200 : 2600);
    setTimeout(() => t2.remove(), cls.includes('goal') || cls.includes('order') ? 4800 : 3200);
    while (this.toastsEl.children.length > 4) this.toastsEl.firstChild!.remove();
  }

  goalToast(name: string, desc: string) {
    this.toast(t('toast.goal', { name, desc }), 'goal-toast');
  }

  orderToast(text: string) {
    this.toast(text, 'order-toast');
  }

  // ---------------- 模态框 ----------------
  showModal(html: string, actions: Array<{ label: string; cls?: string; cb: () => void }>) {
    if (this.modalBack.classList.contains('hidden')) this.modalReturnFocus = document.activeElement as HTMLElement;
    this.modalEl.innerHTML = html + `<div class="modal-actions" id="modal-actions"></div>`;
    const act = document.getElementById('modal-actions')!;
    for (const a of actions) {
      const b = document.createElement('button');
      b.className = `btn ${a.cls || ''}`;
      b.innerHTML = a.label;
      b.addEventListener('click', () => { this.closeModal(); a.cb(); });
      act.appendChild(b);
    }
    this.modalBack.classList.remove('hidden');
    const title = this.modalEl.querySelector('h2');
    if (title) { title.id = 'modal-title'; this.modalEl.setAttribute('aria-labelledby', title.id); }
    this.modalEl.focus();
    this.modalEl.onkeydown = e => {
      if (e.key !== 'Tab') return;
      const buttons = [...this.modalEl.querySelectorAll<HTMLButtonElement>('button:not(:disabled)')];
      if (!buttons.length) return;
      const first = buttons[0], last = buttons[buttons.length - 1];
      if (e.shiftKey && (document.activeElement === first || document.activeElement === this.modalEl)) { e.preventDefault(); last.focus(); }
      else if (!e.shiftKey && (document.activeElement === last || document.activeElement === this.modalEl)) { e.preventDefault(); first.focus(); }
    };
  }

  closeModal() { this.modalBack.classList.add('hidden'); this.modalReturnFocus?.focus(); }

  get modalOpen() { return !this.modalBack.classList.contains('hidden'); }

  confirm(title: string, msg: string, okLabel: string, cb: () => void) {
    this.showModal(`<h2>${icon('warn')}${title}</h2><p>${msg}</p>`, [
      { label: t('modal.cancel'), cb: () => {} },
      { label: okLabel, cls: 'danger', cb },
    ]);
  }

  showWelcome(hasSave: boolean, onExample: () => void, onStart: () => void) {
    this.showModal(`
      <h2>${icon('factory')}${t('welcome.title')}</h2>
      <p>${t('welcome.p1')}</p>
      <div class="chain">
        <span class="cnode">${itemChip('iron_ore')} / ${itemChip('copper_ore')}</span><span class="carrow">→</span>
        <span class="cnode">${kindName('furnace')}</span><span class="carrow">→</span>
        <span class="cnode">${kindName('press')}</span><span class="carrow">→</span>
        <span class="cnode">${kindName('assembler')}</span><span class="carrow">→</span>
        <span class="cnode produce">${itemChip('robot')}</span>
      </div>
      <p><b>${t('welcome.tips')}</b></p>
      <ul>
        <li>${t('welcome.tip1')}</li>
        <li>${t('welcome.tip2')}</li>
        <li>${t('welcome.tip3')}</li>
        <li>${t('welcome.tip4')}</li>
        <li>${t('welcome.tip5')}</li>
      </ul>
      ${hasSave ? `<p>${t('welcome.hasSave')}</p>` : ''}
    `, [
      { label: t('welcome.helpBtn'), cb: () => this.hooks.help() },
      { label: t('welcome.exampleBtn'), cls: 'primary', cb: onExample },
      { label: t('welcome.startBtn'), cb: onStart },
    ]);
  }

  showHelp() {
    const upgradeCosts = (['extractor', 'furnace', 'press', 'assembler'] as const)
      .map(k => `${kindName(k)} ${money(UPGRADE_COST[k]![0])}/${money(UPGRADE_COST[k]![1])}`).join(' · ');
    const key = (k: string) => `<div class="kv"><span><span class="kbd">${t(`help.key.${k}` as TKey)}</span> ${t(`help.key.${k}Use` as TKey)}</span></div>`;
    this.showModal(`
      <h2>${icon('help')}${t('help.title')}</h2>
      <p><b>${t('help.chain')}</b></p>
      <div class="chain">
        <span class="cnode">${itemChip('iron_ore')}</span><span class="carrow">→</span><span class="cnode">${itemChip('iron_ingot')}</span><span class="carrow">→</span><span class="cnode">${itemChip('gear')}</span><span class="carrow">→</span><span class="cnode">${itemChip('circuit')}</span><span class="carrow">→</span><span class="cnode produce">${itemChip('robot')} ${t('help.chain.robot')}</span>
      </div>
      <div class="chain">
        <span class="cnode">${itemChip('copper_ore')}</span><span class="carrow">→</span><span class="cnode">${itemChip('copper_ingot')}</span><span class="carrow">→</span><span class="cnode">${itemChip('wire')} ×2</span><span class="carrow">↗</span><span style="color:var(--ink-dim);font-size:12px">${t('help.chain.note')}</span>
      </div>
      <p><b>${t('help.economy')}</b></p>
      <ul>
        <li>${t('help.eco1')}</li>
        <li>${t('help.eco2')}</li>
        <li>${t('help.eco3', { costs: upgradeCosts })}</li>
      </ul>
      <p><b>${t('help.connect')}</b></p>
      <ul>
        <li>${t('help.con1')}</li>
        <li>${t('help.con2')}</li>
        <li>${t('help.con3')}</li>
        <li>${t('help.con4')}</li>
      </ul>
      <p><b>${t('help.controls')}</b></p>
      <div class="keys">
        ${key('lmb')}
        ${key('rmb')}
        ${key('mmb')}
        ${key('wheel')}
        ${key('r')}
        ${key('u')}
        ${key('m')}
        ${key('x')}
        ${key('q')}
        ${key('num')}
        ${key('space')}
        ${key('f3')}
        <div class="kv"><span>${t('help.sound')}</span></div>
      </div>
      <p>${t('help.tips')}</p>
    `, [{ label: t('help.startBtn'), cls: 'primary', cb: () => {} }]);
  }
}
