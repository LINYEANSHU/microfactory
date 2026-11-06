// ============================================================
// MicroFactory · i18n 双语字典（中文 / English）
// - 默认跟随浏览器语言（zh* → 中文，其余 → English）
// - 选择持久化到 localStorage（microfactory.lang）
// - 术语表：Extractor=采矿机 · Conveyor=传送带 · Turbo Conveyor=高速传送带
//          Splitter=分流器 · Merger=合流器 · Export Terminal=出货终端
//          credits=资金 · order=订单 · goal=生产目标
// ============================================================
import type { ItemKey, EntKind, Dir } from '../core/defs';

export type Lang = 'zh' | 'en';

const zh = {
  // 应用
  'app.title': 'MicroFactory · 微型工厂',
  'lang.switch': 'EN',
  'lang.tip': '切换到 English',

  // 顶栏
  'top.creditsTip': '资金：出货与完成订单获得，用于升级机器',
  'top.example': '示例',
  'top.build': '建造',
  'top.overview': '概览',
  'top.files': '更多',
  'top.save': '保存',
  'top.saveTip': '保存到浏览器（每 20 秒自动保存）',
  'top.load': '读取',
  'top.loadTip': '读取浏览器存档',
  'top.export': '导出',
  'top.exportTip': '导出存档文件',
  'top.import': '导入',
  'top.importTip': '导入存档文件',
  'top.reset': '重置',
  'top.resetTip': '清空工厂',
  'top.soundTip': '音效开关',
  'top.helpTip': '帮助',

  // 速度
  'speed.pause': '暂停（空格）',
  'speed.x1': '正常速度',
  'speed.x2': '双倍速度',
  'speed.x4': '四倍速度',

  // 建造面板
  'pal.select': '选择',
  'pal.bulldoze': '拆除',
  'pal.logistics': '物流',
  'pal.production': '生产',
  'pal.special': '其他',

  // 物品
  'item.iron_ore': '铁矿石',
  'item.copper_ore': '铜矿石',
  'item.iron_ingot': '铁锭',
  'item.copper_ingot': '铜锭',
  'item.gear': '齿轮',
  'item.wire': '铜线',
  'item.circuit': '电路板',
  'item.robot': '微型机器人',

  // 建筑
  'kind.belt': '传送带',
  'kind.belt.desc': '以 1.5 格/秒 运输物品，可拖动连续铺设。',
  'kind.turbo': '高速传送带',
  'kind.turbo.desc': '以 3 格/秒 运输物品，适合干线。',
  'kind.splitter': '分流器',
  'kind.splitter.desc': '从背面输入，轮流分配到前方/左/右三个出口。',
  'kind.merger': '合流器',
  'kind.merger.desc': '从背面/左/右三路汇入，向前方输出。',
  'kind.storage': '仓库',
  'kind.storage.desc': '缓存 48 件物品，四向进出，先进先出。',
  'kind.extractor': '采矿机',
  'kind.extractor.desc': '只能放在矿脉上，每 2 秒产出 1 矿石。',
  'kind.furnace': '熔炼炉',
  'kind.furnace.desc': '背面输入矿石，3 秒熔炼成锭。自动识别铁矿/铜矿。',
  'kind.press': '冲压机',
  'kind.press.desc': '背面输入锭：铁锭→齿轮，铜锭→2 铜线，2.5 秒。',
  'kind.assembler': '装配机',
  'kind.assembler.desc': '背面+左侧双输入。齿轮+2铜线→电路板；齿轮+电路板→机器人。',
  'kind.recycler': '回收机',
  'kind.recycler.desc': '背面/左/右三向输入，把多余成品拆解还原成原料锭：齿轮→铁锭、2铜线→铜锭、电路板→铁锭+铜锭、机器人→2铁锭+铜锭。',
  'kind.export': '出货终端',
  'kind.export.desc': '任何物品进入即计为出货，四向接收。',

  // 方向
  'dir.0': '东',
  'dir.1': '南',
  'dir.2': '西',
  'dir.3': '北',

  // 机器状态
  'state.working': '运行中',
  'state.starved': '缺料等待',
  'state.blocked': '输出堵塞',
  'state.idle': '待机',

  // 侧栏区块
  'sec.orders': '订单',
  'sec.inspector': '选中对象',
  'sec.stats': '工厂统计',
  'sec.goals': '生产目标',

  // 工具提示条
  'hint.pointer': '<b>点击</b>选中机器查看详情 · <b>U</b> 升级 · <b>R</b> 旋转 · <b>M</b> 搬移 · <b>X</b> 拆除',
  'hint.bulldoze': '<b>点击/拖动</b>拆除建筑（物品将销毁）· <span class="kbd">Q</span> 返回选择',
  'hint.build': '<b>左键</b>放置{name} · <b>拖动</b>连续铺设 · <b>R</b> 旋转 · <b>右键拖动</b>平移 · <span class="kbd">Q</span>退出',
  'hint.move': '<b>搬移中</b>：点击目标格放置（保留内部物品） · <b>R</b> 旋转 · <b>Esc</b> 取消',

  // 订单面板
  'order.no': '订单 {n} 号',
  'order.note': '在出货终端交付 {item}，完成后获得奖金，订单自动接续，难度递增。',

  // 检视器
  'insp.empty': '未选中任何对象',
  'insp.emptyHint': '用「选择」工具点击机器查看详情',
  'insp.pos': '({x}, {y}) · 朝向{d}',
  'insp.level': '等级 {n}',
  'insp.speed': '速度',
  'insp.beltSpeed': '{v} 格/秒',
  'insp.carrying': '载物',
  'insp.count': '{n} 件',
  'insp.queue': '队列',
  'insp.stock': '库存',
  'insp.exportedHere': '本终端累计出货',
  'insp.total': '合计',
  'insp.state': '状态',
  'insp.recipes': '可用配方：',
  'insp.ore': '矿脉',
  'insp.oreIron': '铁矿',
  'insp.oreCopper': '铜矿',
  'insp.cycleLabel': '节拍',
  'insp.cycle': '{v}s / 件',
  'insp.emptyBuf': '空',
  'insp.inputBuf': '输入缓存',
  'insp.outputBuf': '输出缓存',
  'insp.util': '利用率（近期）',
  'insp.upgradeTip': '升级后配方速度 ×{m}',
  'insp.upgradeTo': '升级到 {n} 级 · 速度 ×{m}',
  'insp.maxed': '已满级（速度 ×2.25）',
  'insp.rotate': '旋转',
  'insp.move': '搬移',
  'insp.demolish': '拆除',

  // 统计面板
  'stats.exportRate': '出货速率（近 60 秒）',
  'stats.rate': '{r}/分 · {n} 件',
  'stats.none': '尚无出货 · 建一条生产线吧',
  'stats.machines': '机器概况（{n} 台加工）',
  'stats.overview': '运行 <b style="color:var(--ok)">{w}</b> · 缺料 <b style="color:var(--accent)">{s}</b> · 堵塞 <b style="color:var(--alert)">{b}</b> · 待机 {i}',
  'stats.avgUtil': '平均利用率',
  'stats.beltLoad': '传送带负载',
  'stats.bottleneck': '瓶颈分析',
  'stats.bn.good': '运行良好',
  'stats.bn.goodSub': '未检测到明显瓶颈',
  'stats.bn.blocked': '{name} ({x},{y}) 输出堵塞',
  'stats.bn.blockedSub': '下游吞吐不足（占 {p}% 时间），考虑分流或升级下游',
  'stats.bn.starved': '{name} ({x},{y}) 供料不足',
  'stats.bn.starvedSub': '上游产能或运力不够，也可升级这台机器提高消化速度',
  'stats.legend.credits': '资金 {n}',
  'stats.legend.exported': '累计出货 {n}',
  'stats.sparkRate': '{r} 件/分',

  // 生产目标
  'goal.first.name': '首批出货',
  'goal.first.desc': '出货第 1 台微型机器人',
  'goal.ten.name': '小有规模',
  'goal.ten.desc': '累计出货 10 台机器人',
  'goal.build15.name': '工业奠基',
  'goal.build15.desc': '同时运行 15 台机器',
  'goal.rate8.name': '稳定产线',
  'goal.rate8.desc': '机器人产能达到 8 台/分',
  'goal.first_up.name': '技术改造',
  'goal.first_up.desc': '首次升级一台机器',
  'goal.credits1k.name': '第一桶金',
  'goal.credits1k.desc': '累计持有 1,000 资金',
  'goal.order3.name': '履约人',
  'goal.order3.desc': '完成 3 个订单',
  'goal.fifty.name': '规模量产',
  'goal.fifty.desc': '累计出货 50 台机器人',
  'goal.rate15.name': '产能大师',
  'goal.rate15.desc': '机器人产能达到 15 台/分',
  'goal.store30.name': '仓储大师',
  'goal.store30.desc': '仓库存货 ≥ 30 件',
  'toast.goal': '达成目标：{name} — {desc}',

  // 模态框
  'modal.cancel': '取消',

  // 确认与提示（main）
  'reset.title': '重置工厂',
  'reset.msg': '将清空所有建筑、物品与统计数据，此操作无法撤销。',
  'reset.ok': '确认重置',
  'toast.reset': '工厂已重置',
  'example.title': '加载示例工厂',
  'example.msg': '当前工厂将被替换为示例布局。',
  'example.ok': '替换',
  'toast.example': '🏭 示例工厂已加载：一条完整的机器人生产线',
  'toast.exampleStart': '🏭 示例工厂已加载，观察传送带上的物流吧！',
  'toast.extractorOre': '采矿机只能放在矿脉上',
  'toast.occupied': '目标格被占用',
  'toast.moved': '{name}已搬移至 ({x}, {y})',
  'toast.moveBlocked': '原位置被占用，仍处于搬移状态',
  'toast.maxLevel': '这台机器已满级',
  'toast.upgraded': '升级完成：{name} 现为 {n} 级',
  'toast.noCredits': '资金不足，升级需要 {n} 资金',
  'toast.saved': '💾 已保存到浏览器存档',
  'toast.saveFail': '保存失败：存储空间不足？',
  'toast.noSave': '没有找到存档',
  'toast.loaded': '📂 存档已读取',
  'toast.parseFail': '存档解析失败',
  'toast.exportedFile': '📤 已导出存档文件',
  'toast.imported': '📥 存档已导入',
  'toast.orderDone': '<b>订单 {n} 完成</b> — 交付 {t} 件{item}，奖金 <b style="color:var(--ok)">+{r}</b>',
  'toast.orderNext': '新订单 {n} 号：交付 {t} 件{item}',

  // 性能
  'perf.simple': '<b>{fps}</b> FPS · {fm}ms · {i} 物品',
  'perf.detail': '<b>{fps}</b> FPS · {fm}ms · 模拟 {sm}ms · {c} calls · {i} 物品 · {bt}带/{m}机',

  // 欢迎窗口
  'welcome.title': '欢迎来到 MicroFactory',
  'welcome.p1': '这是一座属于你的<b>微缩自动化工厂</b>。开采矿石、熔炼、冲压、装配——让机器人沿传送带流动起来！',
  'welcome.tips': '上手提示',
  'welcome.tip1': '机器上有端口：<b style="color:var(--ok)">绿色箭头 = 输入</b>，<b style="color:var(--accent)">橙色箭头 = 输出</b>，传送带指向输入口即可自动上料。',
  'welcome.tip2': '传送带支持<b>拖动连续铺设</b>，拐弯自动成型；<b>R</b> 键旋转。',
  'welcome.tip3': '<b>出货赚钱</b>：机器人单价 45 资金。完成右侧<b>订单</b>拿奖金，攒钱用 <b>U</b> 升级机器提速。',
  'welcome.tip4': '<b>回收机</b>（生产类）：把多余成品拆回原料锭——齿轮→铁锭、2铜线→铜锭、电路板→铁锭+铜锭、机器人→2铁锭+铜锭；堵线时用它泄洪。',
  'welcome.tip5': '<b>右键拖动</b>平移视角，<b>中键拖动</b>旋转，滚轮缩放。',
  'welcome.hasSave': '检测到上次的存档，可以点击「读取」继续。',
  'welcome.helpBtn': '查看完整帮助',
  'welcome.exampleBtn': '加载示例工厂',
  'welcome.startBtn': '从零开始建造',

  // 帮助窗口
  'help.title': 'MicroFactory 指南',
  'help.chain': '生产链（1 台机器人 = 2 铁矿 + 1 铜矿）',
  'help.chain.note': '（铜线与齿轮一起进入装配机制作电路板）',
  'help.chain.robot': '机器人',
  'help.economy': '经济与订单',
  'help.eco1': '每种物品有<b>出货单价</b>：原矿 0 · 锭 2 · 铜线 3 · 齿轮 6 · 电路板 15 · 机器人 45。深加工才值钱。',
  'help.eco2': '右侧<b>订单面板</b>会不断下达交付任务，完成拿奖金，自动接下一单（越来越大的单）。',
  'help.eco3': '选中机器按 <b>U</b> 或点「升级」按钮：1→2 级速度 ×1.5，2→3 级速度 ×2.25。升级费用：{costs}',
  'help.connect': '连接规则',
  'help.con1': '选中建筑（或放置预览）时会显示端口：<b style="color:var(--ok)">绿色 = 输入</b>、<b style="color:var(--accent)">橙色 = 输出</b>。',
  'help.con2': '传送带/机器把物品<b>推入</b>相邻机器的输入口；机器从输出口向前方一格推送。',
  'help.con3': '分流器 1 进 3 出（轮流分配）；合流器 3 进 1 出；仓库四向进出、先入先出。',
  'help.con4': '下游满载时物品会<b>真实堵住</b>并一路反压到上游，机器随之停产——布局决定产能。',
  'help.controls': '操作',
  'help.key.lmb': '左键',
  'help.key.lmbUse': '建造 / 选择',
  'help.key.rmb': '右键拖动',
  'help.key.rmbUse': '平移视角',
  'help.key.mmb': '中键拖动',
  'help.key.mmbUse': '旋转视角',
  'help.key.wheel': '滚轮',
  'help.key.wheelUse': '缩放（方向键平移）',
  'help.key.r': 'R',
  'help.key.rUse': '旋转建筑',
  'help.key.u': 'U',
  'help.key.uUse': '升级选中机器',
  'help.key.m': 'M',
  'help.key.mUse': '搬移选中机器',
  'help.key.x': 'X',
  'help.key.xUse': '拆除工具',
  'help.key.q': 'Q',
  'help.key.qUse': '选择工具',
  'help.key.num': '1-0',
  'help.key.numUse': '快选建筑',
  'help.key.space': '空格',
  'help.key.spaceUse': '暂停 / 继续',
  'help.key.f3': 'F3',
  'help.key.f3Use': '性能详情',
  'help.sound': '顶栏「音效」按钮可开关提示音（自动记忆）',
  'help.tips': '<b>技巧</b>：传送带可以互相侧向汇入；高速带（青色）适合长距离干线；产能上不去时看右侧「瓶颈分析」；先把<b>熔炼炉</b>升到 2 级性价比最高。',
  'help.startBtn': '开始建造',
};

export type TKey = keyof typeof zh;

// 英文字典：类型约束为与中文字典完全同构（缺键/多键都会在 tsc 报错）
const en: Record<TKey, string> = {
  // App
  'app.title': 'MicroFactory · Tiny Factory',
  'lang.switch': '中文',
  'lang.tip': 'Switch to 中文',

  // Top bar
  'top.creditsTip': 'Credits: earned from exports and completed orders, spent on machine upgrades',
  'top.example': 'Demo',
  'top.build': 'Build',
  'top.overview': 'Overview',
  'top.files': 'More',
  'top.save': 'Save',
  'top.saveTip': 'Save to your browser (auto-saves every 20 s)',
  'top.load': 'Load',
  'top.loadTip': 'Load the browser save',
  'top.export': 'Export',
  'top.exportTip': 'Export a save file',
  'top.import': 'Import',
  'top.importTip': 'Import a save file',
  'top.reset': 'Reset',
  'top.resetTip': 'Clear the factory',
  'top.soundTip': 'Toggle sound effects',
  'top.helpTip': 'Help',

  // Speed
  'speed.pause': 'Pause (Space)',
  'speed.x1': 'Normal speed',
  'speed.x2': 'Double speed',
  'speed.x4': 'Quadruple speed',

  // Build palette
  'pal.select': 'Select',
  'pal.bulldoze': 'Demolish',
  'pal.logistics': 'Logistics',
  'pal.production': 'Production',
  'pal.special': 'Special',

  // Items
  'item.iron_ore': 'Iron Ore',
  'item.copper_ore': 'Copper Ore',
  'item.iron_ingot': 'Iron Ingot',
  'item.copper_ingot': 'Copper Ingot',
  'item.gear': 'Gear',
  'item.wire': 'Wire',
  'item.circuit': 'Circuit',
  'item.robot': 'Micro-Robot',

  // Buildings
  'kind.belt': 'Conveyor',
  'kind.belt.desc': 'Moves items at 1.5 tiles/s. Drag to lay a whole run at once.',
  'kind.turbo': 'Turbo Conveyor',
  'kind.turbo.desc': 'Moves items at 3 tiles/s — ideal for main lines.',
  'kind.splitter': 'Splitter',
  'kind.splitter.desc': 'Input at the back; deals items round-robin to the front, left and right outlets.',
  'kind.merger': 'Merger',
  'kind.merger.desc': 'Merges three streams from back/left/right into a single forward output.',
  'kind.storage': 'Storage',
  'kind.storage.desc': 'Buffers up to 48 items, connects on all four sides, first in first out.',
  'kind.extractor': 'Extractor',
  'kind.extractor.desc': 'Must be placed on an ore patch; yields 1 ore every 2 s.',
  'kind.furnace': 'Furnace',
  'kind.furnace.desc': 'Smelts ore from its back input into ingots in 3 s. Detects iron vs copper automatically.',
  'kind.press': 'Press',
  'kind.press.desc': 'Presses ingots from its back input in 2.5 s: iron → gear, copper → 2 wire.',
  'kind.assembler': 'Assembler',
  'kind.assembler.desc': 'Two inputs (back + left). Gear + 2 wire → circuit; gear + circuit → robot.',
  'kind.recycler': 'Recycler',
  'kind.recycler.desc': 'Takes input from back/left/right and breaks surplus products back down into ingots: gear → iron, 2 wire → copper, circuit → iron + copper, robot → 2 iron + copper.',
  'kind.export': 'Export Terminal',
  'kind.export.desc': 'Anything delivered here counts as exported; accepts from all four sides.',

  // Directions
  'dir.0': 'E',
  'dir.1': 'S',
  'dir.2': 'W',
  'dir.3': 'N',

  // Machine states
  'state.working': 'Working',
  'state.starved': 'Starved',
  'state.blocked': 'Blocked',
  'state.idle': 'Idle',

  // Side panels
  'sec.orders': 'Orders',
  'sec.inspector': 'Inspector',
  'sec.stats': 'Factory Stats',
  'sec.goals': 'Goals',

  // Hint bar
  'hint.pointer': '<b>Click</b> a machine to inspect it · <b>U</b> upgrade · <b>R</b> rotate · <b>M</b> move · <b>X</b> demolish',
  'hint.bulldoze': '<b>Click/drag</b> to demolish (items are destroyed) · <span class="kbd">Q</span> back to select',
  'hint.build': '<b>Left-click</b> to place {name} · <b>Drag</b> to keep placing · <b>R</b> rotate · <b>Right-drag</b> to pan · <span class="kbd">Q</span> to exit',
  'hint.move': '<b>Moving</b>: click a tile to drop it (contents kept) · <b>R</b> rotate · <b>Esc</b> cancel',

  // Orders panel
  'order.no': 'Order No. {n}',
  'order.note': 'Deliver {item} to an export terminal to claim the bonus. Orders chain on automatically and keep getting bigger.',

  // Inspector
  'insp.empty': 'Nothing selected',
  'insp.emptyHint': 'Use the Select tool and click a machine for details',
  'insp.pos': '({x}, {y}) · Facing {d}',
  'insp.level': 'Level {n}',
  'insp.speed': 'Speed',
  'insp.beltSpeed': '{v} tiles/s',
  'insp.carrying': 'Carrying',
  'insp.count': '{n}',
  'insp.queue': 'Queue',
  'insp.stock': 'Stored',
  'insp.exportedHere': 'Exported here (all time)',
  'insp.total': 'Total',
  'insp.state': 'State',
  'insp.recipes': 'Recipes:',
  'insp.ore': 'Ore vein',
  'insp.oreIron': 'Iron',
  'insp.oreCopper': 'Copper',
  'insp.cycleLabel': 'Cycle',
  'insp.cycle': '{v}s per item',
  'insp.emptyBuf': 'Empty',
  'insp.inputBuf': 'Input buffer',
  'insp.outputBuf': 'Output buffer',
  'insp.util': 'Utilization (recent)',
  'insp.upgradeTip': 'Recipe speed ×{m} after upgrade',
  'insp.upgradeTo': 'Upgrade to level {n} · ×{m} speed',
  'insp.maxed': 'Fully upgraded (×2.25 speed)',
  'insp.rotate': 'Rotate',
  'insp.move': 'Move',
  'insp.demolish': 'Demolish',

  // Stats panel
  'stats.exportRate': 'Export rate (last 60 s)',
  'stats.rate': '{r}/min · {n} items',
  'stats.none': 'Nothing exported yet — go build a production line!',
  'stats.machines': 'Machines ({n} processing)',
  'stats.overview': 'Running <b style="color:var(--ok)">{w}</b> · Starved <b style="color:var(--accent)">{s}</b> · Blocked <b style="color:var(--alert)">{b}</b> · Idle {i}',
  'stats.avgUtil': 'Avg. utilization',
  'stats.beltLoad': 'Belt load',
  'stats.bottleneck': 'Bottlenecks',
  'stats.bn.good': 'Running smoothly',
  'stats.bn.goodSub': 'No significant bottlenecks detected',
  'stats.bn.blocked': '{name} ({x},{y}) output blocked',
  'stats.bn.blockedSub': 'Downstream can\u2019t keep up ({p}% of the time) — split the flow or upgrade downstream',
  'stats.bn.starved': '{name} ({x},{y}) input starved',
  'stats.bn.starvedSub': 'Upstream can\u2019t supply or move enough — or upgrade this machine to process faster',
  'stats.legend.credits': 'Credits {n}',
  'stats.legend.exported': 'Exported {n}',
  'stats.sparkRate': '{r} items/min',

  // Goals
  'goal.first.name': 'First Shipment',
  'goal.first.desc': 'Export your first micro-robot',
  'goal.ten.name': 'Hitting Your Stride',
  'goal.ten.desc': 'Export 10 robots in total',
  'goal.build15.name': 'Industrial Foundation',
  'goal.build15.desc': 'Have 15 machines running at once',
  'goal.rate8.name': 'Steady Line',
  'goal.rate8.desc': 'Reach a robot output of 8/min',
  'goal.first_up.name': 'First Upgrade',
  'goal.first_up.desc': 'Upgrade a machine for the first time',
  'goal.credits1k.name': 'First Nest Egg',
  'goal.credits1k.desc': 'Hold 1,000 credits at once',
  'goal.order3.name': 'Reliable Supplier',
  'goal.order3.desc': 'Complete 3 orders',
  'goal.fifty.name': 'Mass Production',
  'goal.fifty.desc': 'Export 50 robots in total',
  'goal.rate15.name': 'Throughput Master',
  'goal.rate15.desc': 'Reach a robot output of 15/min',
  'goal.store30.name': 'Stockpile Master',
  'goal.store30.desc': 'Keep 30+ items stored in a warehouse',
  'toast.goal': 'Goal reached: {name} — {desc}',

  // Modal
  'modal.cancel': 'Cancel',

  // Confirmations & toasts (main)
  'reset.title': 'Reset Factory',
  'reset.msg': 'This clears all buildings, items and statistics. It cannot be undone.',
  'reset.ok': 'Reset everything',
  'toast.reset': 'Factory reset',
  'example.title': 'Load Demo Factory',
  'example.msg': 'Your current factory will be replaced by the demo layout.',
  'example.ok': 'Replace',
  'toast.example': '🏭 Demo factory loaded: a complete robot production line',
  'toast.exampleStart': '🏭 Demo factory loaded — watch the items flow!',
  'toast.extractorOre': 'The extractor must be placed on an ore patch',
  'toast.occupied': 'That tile is occupied',
  'toast.moved': '{name} moved to ({x}, {y})',
  'toast.moveBlocked': 'Original tile is occupied — still in move mode',
  'toast.maxLevel': 'This machine is fully upgraded',
  'toast.upgraded': 'Upgrade complete: {name} is now level {n}',
  'toast.noCredits': 'Not enough credits — the upgrade costs {n}',
  'toast.saved': '💾 Saved to your browser',
  'toast.saveFail': 'Save failed — out of storage space?',
  'toast.noSave': 'No save found',
  'toast.loaded': '📂 Save loaded',
  'toast.parseFail': 'Could not parse the save file',
  'toast.exportedFile': '📤 Save file exported',
  'toast.imported': '📥 Save imported',
  'toast.orderDone': '<b>Order {n} delivered</b> — {t} × {item} shipped, bonus <b style="color:var(--ok)">+{r}</b>',
  'toast.orderNext': 'New order No. {n}: deliver {t} × {item}',

  // Performance
  'perf.simple': '<b>{fps}</b> FPS · {fm}ms · {i} items',
  'perf.detail': '<b>{fps}</b> FPS · {fm}ms · sim {sm}ms · {c} calls · {i} items · {bt} belts/{m} machines',

  // Welcome modal
  'welcome.title': 'Welcome to MicroFactory',
  'welcome.p1': 'This is a <b>miniature automated factory</b> all your own. Mine ore, smelt it, press it, assemble it — and set robots flowing down the conveyors!',
  'welcome.tips': 'Quick start',
  'welcome.tip1': 'Machines have ports: <b style="color:var(--ok)">green arrow = input</b>, <b style="color:var(--accent)">orange arrow = output</b>. Point a conveyor at the input and it feeds itself.',
  'welcome.tip2': 'Conveyors support <b>drag-to-lay</b> and corner automatically; press <b>R</b> to rotate.',
  'welcome.tip3': '<b>Export to earn</b>: robots sell for 45 credits. Fill the <b>orders</b> on the right for bonuses, then spend the money on <b>U</b> upgrades.',
  'welcome.tip4': '<b>Recycler</b> (production): breaks surplus products back into ingots — gear → iron, 2 wire → copper, circuit → iron + copper, robot → 2 iron + copper. Use it to relieve jams.',
  'welcome.tip5': '<b>Right-drag</b> to pan, <b>middle-drag</b> to orbit, scroll wheel to zoom.',
  'welcome.hasSave': 'We found your last save — click "Load" to pick up where you left off.',
  'welcome.helpBtn': 'Open the full guide',
  'welcome.exampleBtn': 'Load demo factory',
  'welcome.startBtn': 'Start from scratch',

  // Help modal
  'help.title': 'MicroFactory Guide',
  'help.chain': 'Production chain (1 robot = 2 iron ore + 1 copper ore)',
  'help.chain.note': '(wire and gear meet in the assembler to make circuits)',
  'help.chain.robot': '',
  'help.economy': 'Economy & orders',
  'help.eco1': 'Every item has an <b>export price</b>: ore 0 · ingots 2 · wire 3 · gears 6 · circuits 15 · robots 45. Deeper processing pays better.',
  'help.eco2': 'The <b>orders panel</b> on the right keeps issuing delivery tasks; complete one for a bonus and the next — bigger — order follows automatically.',
  'help.eco3': 'Select a machine and press <b>U</b> (or click "Upgrade"): level 1→2 runs ×1.5, level 2→3 runs ×2.25. Upgrade costs: {costs}',
  'help.connect': 'Connections',
  'help.con1': 'Selecting a building (or the placement preview) reveals its ports: <b style="color:var(--ok)">green = input</b>, <b style="color:var(--accent)">orange = output</b>.',
  'help.con2': 'Conveyors and machines <b>push</b> items into adjacent input ports; machines eject finished goods one tile ahead of the output port.',
  'help.con3': 'Splitters are 1-in/3-out (round robin); mergers are 3-in/1-out; storage connects on all four sides and runs FIFO.',
  'help.con4': 'When the downstream is full, items <b>physically jam</b> and back-pressure stacks all the way upstream, halting machines — layout decides throughput.',
  'help.controls': 'Controls',
  'help.key.lmb': 'LMB',
  'help.key.lmbUse': 'Build / select',
  'help.key.rmb': 'RMB drag',
  'help.key.rmbUse': 'Pan',
  'help.key.mmb': 'MMB drag',
  'help.key.mmbUse': 'Orbit',
  'help.key.wheel': 'Scroll',
  'help.key.wheelUse': 'Zoom (arrow keys pan)',
  'help.key.r': 'R',
  'help.key.rUse': 'Rotate building',
  'help.key.u': 'U',
  'help.key.uUse': 'Upgrade selection',
  'help.key.m': 'M',
  'help.key.mUse': 'Move selection',
  'help.key.x': 'X',
  'help.key.xUse': 'Demolish tool',
  'help.key.q': 'Q',
  'help.key.qUse': 'Select tool',
  'help.key.num': '1-0',
  'help.key.numUse': 'Hot-select buildings',
  'help.key.space': 'Space',
  'help.key.spaceUse': 'Pause / resume',
  'help.key.f3': 'F3',
  'help.key.f3Use': 'Performance details',
  'help.sound': 'The Sound button in the top bar toggles effects (remembered across visits)',
  'help.tips': '<b>Pro tips</b>: conveyors can merge sideways into each other; turbo conveyors (teal) shine on long main lines; when throughput stalls, check "Bottlenecks" on the right; upgrading your first <b>furnace</b> to level 2 is the best value.',
  'help.startBtn': 'Start building',
};

const DICTS: Record<Lang, Record<TKey, string>> = { zh, en };

const STORE_KEY = 'microfactory.lang';

function detectLang(): Lang {
  try {
    const saved = localStorage.getItem(STORE_KEY);
    if (saved === 'zh' || saved === 'en') return saved;
  } catch { /* 隐私模式等场景忽略 */ }
  const nav = typeof navigator !== 'undefined' ? navigator.language || '' : '';
  return nav.toLowerCase().startsWith('zh') ? 'zh' : 'en';
}

let cur: Lang = detectLang();

export function getLang(): Lang { return cur; }

export function setLang(l: Lang) {
  cur = l;
  try { localStorage.setItem(STORE_KEY, l); } catch { /* 忽略 */ }
}

/** 字典取值，支持 {name} 占位符插值 */
export function t(key: TKey, params?: Record<string, string | number>): string {
  let s = DICTS[cur][key];
  if (params) {
    for (const k in params) s = s.replaceAll(`{${k}}`, String(params[k]));
  }
  return s;
}

export const itemName = (k: ItemKey) => t(`item.${k}` as TKey);
export const kindName = (k: EntKind) => t(`kind.${k}` as TKey);
export const kindDesc = (k: EntKind) => t(`kind.${k}.desc` as TKey);
export const dirName = (d: Dir) => t(`dir.${d}` as TKey);
export const stateLabel = (s: string) => t(`state.${s}` as TKey);
