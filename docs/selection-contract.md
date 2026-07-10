# 选区系统契约与引擎（data-block / data-atomic / src/selection）

日期：2026-07-06（契约首版）／2026-07-07（引擎落地，本版）
消费方：本项目内置选区引擎 `src/selection/`（band 分解几何 + SVG 统一路径渲染）
生产方：本项目的 MDX 渲染管线（`src/lib/rehype-atomic.ts` + `src/lib/rehype-data-block.ts` + MDX 组件映射）

引擎为全新设计（`../base` 项目仅作视觉样式参考，其引擎架构未被移植）。改动 MDX 管线或选区引擎时，必须先读这份文档。

## 1. 引擎的消费方式（契约的依据）

`src/selection/layout.ts` 从**渲染后的 DOM** 单次递归走查 article root，按文档序构建全文连续的 `flatChars: CharEntry[]` 扁平索引（半开区间光标位模型）：

1. `aria-hidden="true"` 子树整体剪枝（任意深度，装饰性 chrome 由此隐身）。
2. `[data-atomic]` 元素发出**一个** `AtomicCharEntry` 后剪枝，绝不递归其内部：
   - 位于 `[data-block]` **内部**的是 inline 原子（行内公式），加入所在段落的字符流；
   - 位于 data-block **之外**的是 block 原子（Figure/Video/Demo/CTACard/表格/display 公式），自成单条目块，选中时渲染独立的整体高亮环。
   - 复制输出取 `data-raw` 属性；无该属性时按 DOM 推导（img→`![alt](src)`、video→`[video](src)`、demo caption→`[demo: …]`、a→`[text](href)`）。
3. `[data-block]` 内的文本节点经 `Intl.Segmenter` 按 grapheme 切分。块的先后只依赖文档序，**不读取 `data-block` 属性值**。
4. 行模型：逐块 `Range.getClientRects()`（剔除聚合矩形）→ 垂直重叠聚类 → caret 中心 y 二分定位换行点；所有 rect 存 **article 本地坐标**（页面滚动不失效）。
5. 重建时机：`document.fonts.ready` 门控首建；article ResizeObserver；article 内部可滚动元素（`pre`、`.katex-display`）的 scroll。

## 2. 管线的输出保证

### 2.1 data-block（叶子文本块）

由 `src/lib/rehype-data-block.ts` 在 rehype 链**最后**执行：

- 候选标签：`p, h1–h6, li, pre, blockquote, figcaption`。
- **只标叶子**：候选元素若含内层候选后代则不标注自己；带 `data-atomic` 的元素整体 SKIP（原子内部绝无 data-block）。
- **不变量：`[data-block]` 绝不嵌套**。验证（每次改管线后必查）：

  ```js
  document.querySelectorAll('[data-block] [data-block]').length === 0
  ```

- MDX 组件 `Figure | Video | Demo | CTACard`（`ATOMIC_COMPONENTS`）整体 SKIP，运行时自标 data-atomic。
- 文章页 header 的 `<h1>` 在 `page.tsx` 中手工标注 `data-block=""`（标题参与选区）；meta 行不标注、计数器 aria-hidden，均不进入字符流。

### 2.2 data-atomic（原子单元）

**构建期标注**（`src/lib/rehype-atomic.ts`，挂在 rehype-katex 之后、rehype-data-block 之前）：

| 内容 | 根元素 | data-raw |
|---|---|---|
| 行内公式 | `span.katex` | `$…$`（LaTeX 取自 KaTeX 的 annotation） |
| display 公式 | `.katex-display` 根 | `$$\n…\n$$` |
| GFM 表格 | `<table>` | GFM 管道表源码 |

该插件同时给 `.katex-mathml` 补 `aria-hidden`（否则 MathML 文本会污染字符索引——这是引擎落地时修掉的存量 bug）。

**运行时自标**（组件最外层元素输出 `data-atomic=""`）：

| 组件 | 外层元素 | 文件 |
|---|---|---|
| `Figure`（含 markdown `![...]()`） | `<figure data-atomic>` | `src/components/mdx/Figure.tsx` |
| `Video` | `<figure data-atomic>` | `src/components/mdx/Video.tsx` |
| `Demo`（交互岛包装器） | `<div class="fd-container" data-atomic>` | `src/components/mdx/Demo.tsx` |
| `CTACard` | `<div data-atomic>` | `src/components/article/CTACard.tsx` |

新增块级媒体/交互组件：要么套 `<Demo>`，要么自标 data-atomic **并**加进 `rehype-data-block.ts` 的 `ATOMIC_COMPONENTS`；若复制输出需要精确源码，再加 `data-raw`。

### 2.3 块内 chrome 必须 aria-hidden

任何位于 `[data-block]` 内部或与正文混排、但不属于正文文本的 UI，必须带 `aria-hidden="true"`。现有实例：CodeFigure 复制按钮、Notation 浮动标签、Demo caption、文章 header 的 ViewCounter/LikeButton 容器。

**视觉隐藏文本同理**——glyph 不可见但 Range rect 仍真实存在（甚至在屏外），会污染字符流和选区几何：

- GFM 脚注 backref（`a[data-footnote-backref]`，"↩"）被 article.css 做成整条不可见热区（`text-indent: -9999px`，rect 在 x≈-9500）。`rehype-atomic.ts` 构建期给它补 `aria-hidden="true"` + `tabindex="-1"`。
- `.sr-only` 元素（GFM 的 `h2.sr-only` 脚注标题）由 `rehype-data-block.ts` 整体 SKIP——不标 data-block、不入字符流，但保留在无障碍树（对屏幕阅读器仍可见，所以**不能**用 aria-hidden）。

## 3. 引擎行为要点（src/selection/）

- **交互**：拖选（含双击=词、三击=块的粒度拖选）、Shift+点击扩展、全键盘导航（字符/词/视觉行/块/文档/页 × extend，macOS/Win 修饰键映射，goal column）、Cmd/Ctrl+A、Escape、拖选近视口边缘自动滚动。规范依据：`../base/docs/selection-interaction-reference.md` 的 Chromium 行为表。
- **方向性与光标模型（无视觉光标）**：`useSelection` 对外暴露 `range`（归一化）+ `direction`（anchor→focus 朝向）+ `caret`（折叠位置模型）。单击、选区折叠都会更新 caret 模型并重武装 anchor（供 Shift+点击/方向键扩展），但**不渲染视觉光标**——这是 2026-07-11 的设计决定：阅读面要引导"选中文本→行间评论"的交互，编辑器式文内光标会与之竞争心智。因此无 Shift 方向键仅在有选区时生效（折叠到方向端点）；无选区时不拦截，保留页面默认滚动。Shift 扩展后以 instant 滚动保 focus 端可见（绕过全局 `scroll-behavior: smooth`）。`Caret.affinity`（upstream/downstream）消解软换行/块边界处"一个 flat 位置、两个视觉落点"的歧义，由 `measure.caretRect()` 换算为几何——这对模型即未来块分裂/插入点（行间评论、富组件插入）的定位地基。
- **形状连续性**：选区按 block 原子切分为文本段；每段做纵向 band 分解（行带 + 间隙带无缝铺满），相邻带 x 必然重叠（交集收腰，过窄回退为并集 S 弯）→ 单一简单多边形，`fill-rule:nonzero`。跨代码块/列表/标题的 markdown 间隙全部由间隙带覆盖，不断裂。
- **左缘吞列**：完整选中的行与选区自上方延续进入的行，左缘取文章列左缘（吞并 bullet/引用边线/pre padding/嵌套缩进），跨块左缘对齐为一条直线；选区起点所在行保持 caret 精确。居中/右对齐块豁免（按块 computed `text-align` 判定，存于 `BlockInfo.flushLeft`）。
- **组件选区**：block 原子仅通过拖选扫过/键盘跨越纳入（单击不选中）；高亮环与文本层共用同一阶段机呼吸——拖选中贴紧组件盒、方角（radius 2），松开沿 inhale/exhale 曲线外扩 3px 并鼓成组件自身圆角+3。原子内部（Chat 输入框、Poll 按钮）交互与原生选区完全不受影响（`user-select: auto`、pointerdown 放行）。
- **复制**：块间 `\n`；非 pre 块内的软换行输出为空格；原子输出源码形式（§2.2）。
- **启用范围**：仅精细指针（`matchMedia("(pointer: fine)")` + CSS `@media (pointer: fine)` 内 `user-select: none`）；触屏保留浏览器原生选区。
- **接入点**：`ArticleLayout` 用 `SelectionRoot`（client）渲染 `<article class="article">` 本身，children 直通保持 prose 服务端渲染；overlay 是 article 内绝对定位的兄弟节点，不会命中 `.article > *` 系列选择器。`.article` 因此带 `position: relative`。
- **就绪信号**：快照建成后 article 带 `data-selection-ready` 属性（测试/调试用）。

## 4. 变更纪律

- 修改 `rehype-data-block.ts` / `rehype-atomic.ts` → 重跑 §2.1 嵌套断言 + scratchpad 的选区端到端脚本（跨块拖选、全选原子环计数、复制断言）。
- 新增 MDX 组件 → 对照 §2.2 / §2.3 检查 data-atomic、data-raw 与 aria-hidden。
- 升级 rehype-pretty-code / rehype-katex 等改变输出 DOM 的依赖 → 检查块结构与 katex 根元素类名（`rehype-atomic` 按类名匹配）。
- 改 `src/styles/article.css` 中影响块几何的规则（heading padding、pre padding 等）→ 选区几何自动跟随（DOM 度量），但 hash 高亮（`.target::after`）的范围约定见 article.css 内注释。
