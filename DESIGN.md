# DESIGN.md · MicroFactory UI

模式：**Operate**（玩家在操作一座工厂）——可扫读、状态清晰、反馈即时；个性存在于精确的细节里。
世界：**工业控制台**。HUD 是浮在微缩世界上的仪表盘：深色石墨实面、琥珀强调、等宽数字、自绘线性图标。

## Tokens（src/ui/style.css）
- 地面 `--ground #15181d`，内嵌面 `--ground-2 #1d222a`，悬停 `--ground-3 #262c36`——表面只靠**色阶**区分，不用边框线。
- 墨 `--ink #eceef2`；次级 `--ink-dim #99a1ad`（只做次要信息，正文用全墨）。
- 强调 `--accent #f5a524`（资金/订单/进度/主按钮）；语义色：ok 绿 / alert 红 / info 青。
- 字体：中文系统栈；数字与拉丁用自托管 **Rajdhani**（500/600/700，latin 子集 woff2，共 46KB），`tabular-nums`。
- 圆角：面板 12px，控件 3px（方形工业控件，全站统一）。
- 浮动层（面板/toast/模态框）允许唯一一种柔和投影 `--shadow-float`（它们悬浮于 3D 画布之上）；面板内部无阴影。
- 背景渐变仅一处：透明画布后的 3D 天空，属于世界而非 UI 装饰。

## 硬规则（按 design-taste/impeccable house rules）
- 无玻璃/blur、无 1px 边框分区、无 UI 渐变、无静止阴影、无 emoji——图标全部为自绘 SVG
  （24 视窗、1.8 线宽、圆角端点，见 hud.ts `ICONS`）。
- 无小号大写间距标签；标题句首大写、全墨、13px/600。
- 数字一律 Rajdhani + tabular-nums；表格数据对齐。
- 浏览器表面纳入设计：`::selection` 琥珀、自定义滚动条、`:focus-visible` 2px 强调环。

## 动效
- 入场：面板 12px 上浮渐入，级联 60ms，仅一次；`prefers-reduced-motion` 全部取消位移。
- 反馈：按钮 hover/active、资金数值 bump、进度条 0.3s ease-out、toast 弹入（expo-out，无回弹）。
- 签名一刻：订单完成的琥珀 toast + 出货终端光环脉冲 + 资金跳字。

## 3D 世界
- 低多边形微缩浮岛；机器共享材质缓存，传送带为合并网格 + 单一滚动 UV，物品按类型 InstancedMesh。
- 机器等级用角落的竖排三格信号灯表达（点亮数 = 等级），升级伴随整体脉冲回弹。
