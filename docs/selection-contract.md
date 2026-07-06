# 选区系统接入契约（data-block / data-atomic）

日期：2026-07-06
消费方：`../base` 项目的自定义文本选区系统（DOM Range 布局管线 + SVG 统一路径选区渲染）
生产方：本项目的 MDX 渲染管线（`src/lib/rehype-data-block.ts` + MDX 组件映射）

本文档定义双方的接口约定。改动 MDX 管线或移植选区系统时，必须先读这份文档。

## 1. base 侧的消费方式（契约的依据）

base 的 `useTextLayout`（`base/src/hooks/useTextLayout.ts`）从**渲染后的 DOM** 反推布局：

1. `querySelectorAll("[data-block]")` 按**文档序**取出所有块，逐块用 `TreeWalker` 走查文本节点，经 `Intl.Segmenter` 按 grapheme 切分，构建全文连续的 `flatChars: CharEntry[]` 扁平索引。
2. 块的先后只依赖文档序，**不读取 `data-block` 属性值**（本项目输出顺序数字仅为调试方便）。
3. `data-atomic` 子树被视为**单个可选中单元**：walker 遇到 `[data-atomic]` 应输出一个 `AtomicCharEntry` 而不递归其文本（base 的 `CharEntry` union 与 `isAtomic()` 已预留，`line-measure.ts` 用 `closest("[data-atomic]")` 做命中归并）。
4. `aria-hidden="true"` 子树被 walker 跳过（base 现有行为，用于列表 marker 等装饰内容）。
5. 布局在 `document.fonts.ready` 后构建，并由 `ResizeObserver` 触发重建——内容必须在稳定的 DOM 里（SSG 直出满足；客户端插入/删除块会自然触发重建）。

## 2. 本项目的输出保证

### 2.1 data-block（叶子文本块）

由 `src/lib/rehype-data-block.ts` 在 rehype 链**最后**执行（此时 pretty-code 的 figure 包装、KaTeX 展开均已完成）：

- 候选标签：`p, h1–h6, li, pre, blockquote, figcaption`。
- **只标叶子**：候选元素若含有内层候选后代则不标注自己（例：`blockquote > p` 标 p 不标 blockquote；loose list 的 `li > p` 标 p；tight list 的 `li` 直接是块）。标注后 `SKIP` 不再下钻。
- **不变量：`[data-block]` 绝不嵌套。** 嵌套会导致 flatChars 重复计数同一段文本，选区索引整体错位。验证方式（每次改管线后必查）：

  ```js
  document.querySelectorAll('[data-block] [data-block]').length === 0
  ```

- 属性值为 `0..n-1` 顺序整数（仅调试用途，消费方勿依赖具体数值）。
- 插件对 `mdxJsxFlowElement` / `mdxJsxTextElement` 中名字属于 `Figure | Video | Demo | CTACard` 的节点整体 `SKIP`——它们运行时自标 data-atomic（§2.2），其 JSX 子树里的 p 等元素**不会**带 data-block（否则运行时会出现 atomic 内嵌 block）。

### 2.2 data-atomic（原子单元）

以下组件保证在**最外层渲染元素**上输出 `data-atomic=""`：

| 组件 | 外层元素 | 文件 |
|---|---|---|
| `Figure`（含 markdown `![...]()`） | `<figure data-atomic>` | `src/components/mdx/Figure.tsx` |
| `Video` | `<figure data-atomic>` | `src/components/mdx/Video.tsx` |
| `Demo`（所有交互岛的包装器） | `<div class="fd-container" data-atomic>` | `src/components/mdx/Demo.tsx` |
| `CTACard` | `<div data-atomic>` | `src/components/article/CTACard.tsx` |

新增可嵌入 MDX 的块级媒体/交互组件时：要么套 `<Demo>`，要么自己在最外层加 `data-atomic` **并**把组件名加进 `rehype-data-block.ts` 的 `ATOMIC_COMPONENTS` 集合。

markdown 图片的特殊处理：`p > img` 会被 `rehype-unwrap-images` 先解包（否则块级 figure 嵌在 p 里是非法 HTML，且该 p 会成为无意义的文本块）。

### 2.3 块内 chrome 必须 aria-hidden

任何位于 `[data-block]` 内部或与正文混排、但**不属于正文文本**的 UI，必须带 `aria-hidden="true"`，否则会被 walker 计入 flatChars 污染选区索引。现有实例：

- `CodeFigure` 的复制按钮（在 `.code-figure` 包装 div 内、figure 外，防御性标注）；
- `Notation` 的浮动标签（`.notation-label`）；
- `Demo` 的 caption、文章 header 的 ViewCounter/LikeButton 容器。

新增组件遵循同一规则。

## 3. 当前已验证的 DOM 形态（hello-world 种子文章）

- 21 个顺序 `data-block`（p / 标题 / li / pre / blockquote>p / 脚注 li 等），零嵌套。
- 4 个 `data-atomic`（Figure 图片、Video、Demo(内含 Poll 交互岛)、CTACard），内部无 data-block——Poll 的按钮/文本位于 Demo 的 atomic 子树内，walker 不会递归进去，无需额外 aria-hidden。
- KaTeX 行内公式目前是 `[data-block]` 段落内的普通 `<span class="katex">` 子树——**尚未**标 data-atomic。按 base CLAUDE.md 的规划，行内公式应成为原子单元；接入时在 rehype 链给 katex 输出根 span 加 `data-atomic`（或扩展 walker 识别 `.katex`），这是接入阶段的待办而非现有保证。

## 4. 选区系统接入路径（预案）

1. 把 base 的 `useTextLayout` / `useTextSelection` / `SelectionLayer` / `line-measure.ts` / 类型移植为一个 npm-workspace 包或直接 `src/selection/`。
2. 新增 `"use client"` 的 `SelectionProvider`，在 `posts/[slug]/page.tsx` 里包住 `{content}`（`.article` 容器即选区根）。文章 prose 本身仍是服务端渲染的静态 HTML——选区系统只读 DOM，不要求 prose 是 React 拥有的节点。
3. 扩展 base 的 DOM walker：遇到 `[data-atomic]` 输出 `AtomicCharEntry`（base 类型层已预留，仅 walker 未实现）。
4. `user-select: none` 与 `selectstart`/`dragstart` 抑制仅作用于 `.article` 范围（base 是整页 demo，博客里需收窄，避免影响 TOC/评论区等）。
5. 处理 KaTeX 行内原子化（§3 待办）。

## 5. 变更纪律

- 修改 `rehype-data-block.ts` 的候选集合或叶子判定 → 重跑 §2.1 的嵌套断言 + 抽查一篇含全部块类型的文章。
- 新增 MDX 组件 → 对照 §2.2 / §2.3 检查 data-atomic 与 aria-hidden。
- 升级 rehype-pretty-code / rehype-katex 等会改变输出 DOM 结构的依赖 → 检查块结构是否变化（尤其 figure/figcaption 层级）。
