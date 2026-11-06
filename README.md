# MicroFactory

**简体中文** · [English](README.en.md) · [CI](https://github.com/LINYEANSHU/microfactory/actions/workflows/ci.yml)

<img src="assets/readme/hero.svg" width="100%" alt="MicroFactory：把矿石加工成微型机器人的浏览器 3D 工厂；图中为生产线示意">

**铺一条产线，看堵塞从下游一路传回来，再亲手解决它。**
MicroFactory 是单人 3D 自动化工厂：采矿、熔炼、冲压、装配、出货，订单收入用来升级机器、扩大生产。
游戏状态留在浏览器本地，无账号或后端服务。

<img src="assets/readme/current-desktop.png" width="100%" alt="2026-11-06 当前界面：浮岛上的示例工厂，左侧建造栏，右侧订单和可折叠统计">

<details>
<summary>查看窄屏界面（390 × 844）</summary>

<img src="assets/readme/current-mobile.png" width="390" alt="窄屏工厂界面：顶栏分行显示，建造与概览按需打开，中央保留产线视野">

</details>

截图来自 2026-11-06 的桌面 Chromium 审查，使用 SwiftShader 在 CPU 上执行 WebGL；窄视口截图不代表真实手机测试。

## 产线为什么会堵

- **物品实际占位**：传送带有容量和最小间距，下游满载会阻挡上游，机器随之停工。
- **端口决定连接**：绿色箭头是输入、橙色箭头是输出；分流器、合流器和仓库调配流量。
- **加工带来价值**：铁矿与铜矿经过锭、齿轮、铜线、电路板，最终装成机器人出货。
- **扩产需要诊断**：统计面板显示利用率、出货速率和堵塞/缺料建议；机器可升至 3 级。
- **回收多余成品**：回收机沿制造树拆回原料锭，为积压物品提供另一条出路。

先把一条线接通，再观察缓冲区与瓶颈；订单和里程碑会给出后续目标。

## 快速开始

需要 Node.js 22.12 或更新的 22.x（也支持 24.x）、npm 和支持 WebGL 2 的现代浏览器。

```bash
git clone https://github.com/LINYEANSHU/microfactory.git
cd microfactory
npm ci
npm run dev
```

打开终端显示的地址，默认是 `http://localhost:5173`。首次进入点击「加载示例工厂」，即可观察完整产线。
也可在顶栏点击「示例」。界面支持中文/英文切换。

```bash
npm run build       # 输出 dist/
npm run preview     # 预览生产构建
```

Windows PowerShell 如拦截 npm 脚本，可使用 `npm.cmd` 执行相同命令。

## 操作

| 输入 | 功能 |
| --- | --- |
| 左键 / 左键拖动 | 建造或选择 / 连续铺传送带 |
| 右键拖动 / 中键拖动 | 平移 / 旋转视角 |
| 滚轮 / 方向键 | 缩放 / 平移 |
| `1`–`0` | 选择建筑 |
| `R` / `U` / `M` | 旋转 / 升级 / 搬移选中机器 |
| `X` / `Q` | 拆除工具 / 选择工具 |
| `Space` / `Escape` | 暂停 / 取消当前操作 |
| `H` / `F3` | 帮助 / 性能详情 |

窄屏通过「建造」「概览」切换面板；导入、导出和其他次要操作收在「更多」。

## 存档与迁移

每 20 秒自动保存到当前浏览器的 `localStorage`，也可手动保存。
「更多」中的 JSON 导出/导入用于备份与跨浏览器迁移；搬移中的机器也会写入快照。
导入先在独立模拟中加载，通过后才替换当前工厂。

浏览器配置、网站地址或端口变化可能对应另一份本地存储；清理网站数据会删除本地存档。
长期保留的工厂请导出 `microfactory-save.json`。

## 验证与边界

2026-11-06 重新执行：

```bash
npm run typecheck
npm test
npm run build
```

- **38 / 38 测试通过**，覆盖生产节拍、物流背压、回收、经济、迁移和长时间模拟。
- 模拟采用 30 Hz 固定步长，独立于 Three.js；测试核对物品守恒账本。
- 同日浏览器审查覆盖 1440 × 900、390 × 844、语言切换、存档、损坏导入与 WebGL 启动失败恢复。
- 游戏仍使用 Three.js / WebGL 2；SwiftShader 是本次 CPU 审查的渲染方式，普通开发命令不会强制 CPU 渲染。
- 未验证真实手机、其他浏览器引擎或硬件渲染性能；这里不提供通用 FPS 承诺。

## 开发入口

`src/sim/` 是模拟和序列化，`src/render/` 是场景与实例化绘制，`src/ui/` 是界面与合成音效。
规则与产品定位见 [PRODUCT.md](PRODUCT.md)，设计说明见 [DESIGN.md](DESIGN.md)。

## 贡献者

[LINYEANSHU](https://github.com/LINYEANSHU)

## 许可与来源

代码采用 [MIT](LICENSE) © 2026 LINYEANSHU。
使用 [Three.js](https://threejs.org/)、[TypeScript](https://www.typescriptlang.org/)、[Vite](https://vite.dev/) 和 [Vitest](https://vitest.dev/)。
界面自托管 [Rajdhani](https://fonts.google.com/specimen/Rajdhani) 字体子集；第三方代码与字体遵循各自许可。
玩法受到 [Factorio](https://factorio.com/) 和 [shapez](https://shapez.io/) 启发。
