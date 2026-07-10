# weave-blog 技术架构

日期：2026-07-06（首版部署）
线上地址：<https://xinghan.me>

## 1. 项目定位与来源

weave-blog 是一个基于 MD/MDX 的个人博客系统，支持在文章中嵌入图片、视频和可进行前后端交互的自定义 React 组件。文章页全部静态生成（SSG），交互能力由客户端岛（client islands）+ Cloudflare Workers API + D1 数据库提供。

它由三个既有项目整合规划而来，各取一块：

| 来源项目 | 贡献 | 本项目的对应物 |
|---|---|---|
| `../base` | 自定义文本选区的**视觉样式**参考（SVG 统一路径、inhale/exhale 呼吸变形、oklch+multiply）及 Chromium 交互行为参考文档 | 选区引擎在本项目内全新设计实现（`src/selection/`，见 §7）；base 的引擎架构因连续性缺陷未被移植。契约见 [selection-contract.md](./selection-contract.md) |
| `../benji` | benji.org 复刻，完整视觉体系（设计 token、字体、prose 排版、主页/文章页组件） | `src/app/globals.css`、`src/styles/article.css`、`src/components/home/*`、`src/components/article/*` 基本逐字移植 |
| `../agentation`（`package/example`） | Next.js App Router 站点结构、TOC scrollspy、CodeBlock、博客卡片模式 | 目录组织、`.article` prose 扩展样式、TOC 思路（改为构建期数据驱动） |

三个来源项目都**没有**任何 markdown/MDX 管线（内容全部硬编码 JSX）——内容管线是本项目全新构建的部分。

## 2. 技术栈与关键决策

| 决策 | 选择 | 理由（及被否方案） |
|---|---|---|
| 框架 | Next.js 15（15.5.x）+ React 19 + TypeScript，App Router，`src/` 布局 | agentation 结构可直接移植；全页 React 树契合未来选区系统接入（选区要求整篇文章 hydrate）。否决 Astro（整篇文章作为单个大 island 会抵消 islands 架构优势）与 Vite SPA（无 SSG，首屏/SEO 弱） |
| 包管理 | pnpm，**hoisted** node-linker（`pnpm-workspace.yaml` 的 `nodeLinker: hoisted`） | OpenNext 拷贝 isolated 布局的 `.pnpm` 路径时更易出问题；hoisted 布局与 npm 一致 |
| 样式 | 纯全局 CSS + CSS 自定义属性，无 Tailwind/SCSS | benji 的 `App.css` 是视觉源头，逐字移植保真最高；agentation 的 SCSS 嵌套很浅，移植时拍平 |
| MDX 编译 | `next-mdx-remote-client`（RSC 模式 `evaluate()`） | 相比 `@next/mdx`（file-per-route，枚举文章需扫 `app/`、frontmatter 别扭）与 velite/content-collections（第二套构建系统，过重）。退路：同一 seam 内换 `@mdx-js/mdx` 的 `evaluate()` |
| 代码高亮 | `rehype-pretty-code` + shiki，构建期，`github-light` 主题 | 产出 HTML 里直接是着色 span，客户端零高亮 JS。benji/agentation 用的 prism-react-renderer 是客户端重复高亮，被替换；benji 的代码块视觉本来就是按 rehype-pretty-code 的 DOM 结构写的 CSS，直接兼容 |
| 数学 | `remark-math` + `rehype-katex`，由 frontmatter `math: true` 控制是否启用插件 | base 用 KaTeX，提前接线。katex.min.css 在文章路由 (`posts/[slug]/page.tsx`) 引入，不进主页 |
| TOC | 构建期 remark 插件提取 h2/h3 headings 作为 props | 优于 benji 的 DOM 查询式（SSR 直出无闪烁、类型化）。`github-slugger` 与 `rehype-slug` 使用同一 slug 算法保证锚点一致 |
| 后端/部署 | Cloudflare Workers（`@opennextjs/cloudflare`）+ D1（SQLite），route handlers | wrangler 已登录、D1 免费额度充足。文章页仍 SSG，仅 `/api/*` 动态。DB 访问收敛在 `src/lib/db.ts`，换 Postgres 只动一个文件。选 route handlers 而非 Server Actions：GET 可缓存、与表单解耦、可移植 |
| 字体 | 逐字移植 benji 的 `fonts.css` + woff2 到 `public/fonts/`，root layout `<link rel="preload">` | 不用 `next/font/local`：5 个字族 + unicode-range 子集重写收益小，逐字移植保证渲染一致 |

## 3. 目录结构

```
weave-blog/
├── content/posts/*.mdx          # 文章源文件（slug = 文件名）
├── chat-worker/                 # 独立聊天 Worker（DO，见 §6.2；不参与博客构建）
├── migrations/*.sql             # D1 迁移
├── scripts/gen-content-index.mjs # 构建期内容索引/静态元文件生成（见 §6）
├── public/
│   ├── fonts/                   # 自托管字体（来自 benji）
│   ├── images/<slug>/           # 文章图片，按 slug 分目录
│   └── feed.xml|sitemap.xml|robots.txt  # 构建期生成，勿手改（gitignored）
├── src/
│   ├── app/
│   │   ├── layout.tsx           # 字体 preload、全局 CSS、Footer
│   │   ├── page.tsx             # 主页：Bio + PostList
│   │   ├── posts/[slug]/page.tsx # 文章页（强制 SSG）
│   │   └── api/posts/[slug]/{stats,view,like}/route.ts  # D1 计数 API
│   ├── components/
│   │   ├── home/                # Bio、PostList、AnnotationHighlight、Footer、FooterBunny
│   │   ├── article/             # ArticleLayout、TableOfContents、BackButton、SectionHeading、
│   │   │                        # Notation、CTACard、CodeFigure、MorphingIcon、HashHighlight
│   │   └── mdx/                 # mdx-components 映射 + Figure/Video/Demo/
│   │                            # PostProvider/ViewCounter/LikeButton
│   ├── lib/
│   │   ├── content.ts           # fs 内容层（仅构建期/Node 环境使用！见 §6）
│   │   ├── mdx.ts               # renderPost()：MDX 编译管线装配
│   │   ├── remark-toc-headings.ts
│   │   ├── rehype-unwrap-images.ts
│   │   ├── rehype-atomic.ts     # KaTeX/表格原子化 + data-raw（复制源码）
│   │   ├── rehype-data-block.ts # 选区契约实现
│   │   ├── post-index.json      # 构建期生成（gitignored）
│   │   ├── post-index.ts        # worker 安全的内容索引 + isValidSlug
│   │   ├── db.ts                # D1 数据访问层（唯一触库文件）
│   │   └── site.ts              # 站点常量（名称/描述/URL）
│   ├── selection/               # 自定义选区引擎（见 §7）
│   │   ├── types.ts / layout.ts / measure.ts / geometry.ts
│   │   ├── keymap.ts / interaction.ts
│   │   └── SelectionRoot.tsx / SelectionOverlay.tsx
│   └── styles/
│       ├── fonts.css            # 逐字移植自 benji
│       └── article.css          # benji agentation.css + MDX prose 扩展 + 选区层样式
├── next.config.ts               # initOpenNextCloudflareForDev() + images.unoptimized
├── open-next.config.ts          # staticAssetsIncrementalCache（关键！见 §8）
├── wrangler.jsonc               # worker 配置 + D1 binding "DB"
└── cloudflare-env.d.ts          # CloudflareEnv 类型（模块级导入 workers-types，勿用三斜线全局引用）
```

## 4. 内容管线

### 4.1 内容层（`src/lib/content.ts`）

- `getAllPosts()`：扫描 `content/posts/*.mdx(.md)`，gray-matter 解析 frontmatter，zod 校验，生产环境过滤 `draft`，按日期降序。
- frontmatter schema：`title`（必填）、`date`（必填，coerce 为 Date）、`description`（必填）、`tags?`、`draft?`、`math?`；`isNew` 由日期派生（发布 45 天内）。
- `postsByYear()`：复刻 benji PostList 的按年分组。
- **约束：此文件用 `node:fs`，只能在构建期/Node 环境调用**（页面组件、`generateStaticParams`）。worker 运行时代码一律用 `post-index.ts`（§6）。

### 4.2 MDX 编译（`src/lib/mdx.ts`）

`renderPost(source, { math })` 调用 `next-mdx-remote-client/rsc` 的 `evaluate()`（而非 `<MDXRemote>` 组件），因为 evaluate 可 await——remark 插件通过 out-param 收集的 headings 在返回前就已填充，TOC 才能作为 props 传给布局。

插件链（**顺序敏感**）：

```
remark:  remark-gfm → remark-math → remark-toc-headings (out 参数收集 h2/h3)
rehype:  rehype-slug → rehype-unwrap-images → rehype-pretty-code(shiki)
         → [rehype-katex, 仅当 math] → rehype-atomic → rehype-data-block（必须最后）
```

- `rehype-slug` 在前：headings 先拿到 id。
- `remark-toc-headings` 对**所有深度**的 heading 走 slugger（与 rehype-slug 保持计数同步，避免重名 heading 的 `-1` 后缀错位），只收集 h2/h3。
- `rehype-unwrap-images`：markdown 图片是 `p > img`，而 `img` 会被组件映射渲染成块级 `<figure data-atomic>`，嵌在 `<p>` 里是非法 HTML（会触发 React hydration 错误）。此插件把"只含图片的段落"解包成顶层 img。
- `rehype-atomic`：给 `span.katex` / `.katex-display` / `table` 标 `data-atomic` + `data-raw`（复制时的源码形式），并给 `.katex-mathml` 补 aria-hidden（防污染选区字符索引）。
- `rehype-data-block` 必须最后跑：它需要看到 pretty-code 包装后的 figure、katex 展开后的最终块结构（原子内部整体 SKIP）。

### 4.3 组件映射（`src/components/mdx/mdx-components.tsx`）

| MDX 元素/组件 | 渲染为 | 说明 |
|---|---|---|
| `a` | `Anchor`（`.basic-link`） | 外链自动加 `target="_blank" rel="noopener noreferrer"` |
| `img` | `Figure` | markdown `![alt](src "title")` 与显式 `<Figure>` 同构；title → caption |
| `figure` | `CodeFigure` 或原样 | 仅当带 `data-rehype-pretty-code-figure`（即代码块）时用 client 包装器加复制按钮 |
| `Figure` / `Video` | `<figure data-atomic>` | 块级媒体，原子单元 |
| `Demo` | `<div class="fd-container" data-atomic>` | 交互组件通用包装器，**保证** data-atomic 不会被漏标 |
| `Notation` | rough-notation 括注 + 浮动标签 | IntersectionObserver 触发；标签 `aria-hidden` |
| `SectionHeading` / `CTACard` | benji 移植组件 | CTACard 外层 data-atomic |
| `LikeButton` / `ViewCounter` | D1 计数岛 | slug 经 `PostProvider` context 注入，MDX 内零参使用 |

`CodeFigure` 的复制按钮从渲染后 `<pre>` 的 `textContent` 取文本（不需要 rehype 附加原始代码属性），按钮带 `aria-hidden` + `tabIndex={-1}`（选区契约要求，见 selection-contract.md §2.3）。

### 4.4 文章页（`src/app/posts/[slug]/page.tsx`）

```ts
export const dynamic = "error";        // 运行时渲染直接构建失败——保证纯 SSG
export const dynamicParams = false;    // 未知 slug 一律 404，不回退 SSR
```

`generateStaticParams` 枚举全部文章；`generateMetadata` 输出 title/description/OpenGraph（`metadataBase` 在 root layout）。页面结构：`PostProvider(slug)` → `ArticleLayout(title, headings)` → header（标题 + 日期 + ViewCounter/LikeButton）→ MDX content。

## 5. 样式与组件移植说明

- `src/app/globals.css` ← benji `App.css` 逐字移植：minireset + reset、`:root` token（动效时长/缓动、间距、字体栈、`#111`/`#fdfdfc`/`#3e9fff`/`#ededed`）、6px 细滚动条、`::selection`、`.container::before` 顶部白色渐隐遮罩、`staggerIn` 主页入场动画、PostList/Footer 样式。
- `src/styles/article.css` ← benji `agentation.css`（文章布局、TOC、section divider、notation、代码块 chrome、脚注、CTA 卡片）+ 末尾追加 **MDX prose 扩展**（改编自 agentation `globals.scss` 的 `.article` 块）：列表、blockquote、行内 code、表格、display math、`figure[data-atomic]` 媒体、post-meta-row。代码 token 选择器面向 shiki 输出（`[data-rehype-pretty-code-figure]`）。
- 组件移植（.jsx → .tsx，全部保留原始类名和 DOM 结构以复用样式）：
  - `FooterBunny`：LA 时区 NumberFlow 时钟联动，22:00–07:00（LA）切换睡眠态（闭眼 + 耳朵摇摆 + 漂浮 Z），逐字移植。
  - `MorphingIcon`：所有图标 = 14×14 viewBox 中的 3 条线，图标间通过动画线端点 morph；`EASE` 常量需 `as const` satisfies motion v12 的 Easing 类型。
  - `TableOfContents`：**结构性改动**——headings 从 props 传入（构建期数据），不再查询 DOM；滚动激活逻辑保留 benji 的做法（`data-scrolled` 直接改 DOM 属性避免每次滚动 re-render，passive listener）。
  - `HashHighlight`：benji 的 `useHashHighlight` hook 改为 `"use client"` 空渲染组件，server component 布局可直接嵌入。

## 6. 交互组件 + 后端全链路

### 6.1 数据链路

```
静态 HTML (SSG, CDN/assets)
  → hydrate 客户端岛 (ViewCounter / LikeButton)
    → fetch /api/posts/[slug]/{stats,view,like}  (Workers route handler)
      → src/lib/db.ts (getCloudflareContext → env.DB)
        → D1 (post_stats 表)
```

- schema（`migrations/0001_post_stats.sql`）：`post_stats(slug TEXT PRIMARY KEY, views INTEGER DEFAULT 0, likes INTEGER DEFAULT 0)`。
- `db.ts` 用 `INSERT ... ON CONFLICT(slug) DO UPDATE ... RETURNING` upsert，单语句原子。
- `ViewCounter`：挂载时 `POST /view`，NumberFlow 滚动显示。
- `LikeButton`：挂载时 GET stats；点击乐观 +1，`localStorage["liked:<slug>"]` 记录已赞（无鉴权，honor system），网络失败回滚。
- API 对未知 slug 返回 404，防垃圾行。

### 6.2 分离式实时服务：chat-worker（Durable Objects）

`<Chat>` 聊天室不走上面的 D1 链路——Next route handler 无法返回 WebSocket 的
101 升级响应，且按"演示组件与博客核心解耦"的原则，聊天后端是**独立 Worker
`weave-chat`**（`chat-worker/` 子目录，自有 wrangler 配置，独立部署）：

```
静态 HTML (SSG)
  → hydrate <Chat> 岛 (src/components/mdx/Chat.tsx)
    → WebSocket wss://chat.xinghan.me/ws?name=…（跨域）
      → chat-worker/src/index.ts（Origin allowlist 校验 → idFromName("lobby")）
        → ChatRoom Durable Object（WebSocket Hibernation API）
          → ctx.storage.sql messages 表（保留最近 100 条）
```

- 单房间 demo：路径写死 `idFromName("lobby")`，无 room 参数。
- 两侧契约唯一来源是 `chat-worker/src/protocol.ts`（纯类型+常量），`Chat.tsx`
  直接 import 进客户端 bundle。
- 防滥用：Origin allowlist（`vars.ALLOWED_ORIGINS`）、每连接 1 条/秒限流
  （时间戳存 WS attachment，休眠安全）、280 字上限、昵称服务端二次校验。
- 昵称在线独占：`fetch` 时扫描 `getWebSockets()` 的 attachment，同名（不分
  大小写）已在线则先完成握手再以 close code `4409`（`CLOSE_NAME_TAKEN`）
  关闭——浏览器读不到失败升级的 HTTP 状态码，只能靠 close code 区分"名字
  被占"与"服务不可用"。客户端收到 4409 回门禁并提示，不进重连循环（断线
  重连撞上自己未被回收的旧连接时同样落到门禁，重新加入即可）。
- 博客侧对 chat-worker **零依赖**：博客的 wrangler/OpenNext/部署流程不变，
  `tsconfig.json` exclude 了 `chat-worker`（workers 类型与 DOM lib 隔离）；
  删除聊天室 = 删 `chat-worker/` + `Chat.tsx` + mdx 注册 + CSS 块。
- 部署：`npx wrangler deploy --config chat-worker/wrangler.jsonc`（DO 迁移
  `new_sqlite_classes` 随 deploy 生效）；本地开发
  `npx wrangler dev --config chat-worker/wrangler.jsonc --port 8788`，
  `next dev` 下组件自动连 `http://localhost:8788`。

### 6.3 worker 无文件系统问题（重要）

**Cloudflare worker 运行时没有 `content/` 目录**，任何运行时代码（route handlers、动态渲染兜底）都不能用 `content.ts` 的 fs 逻辑。解决方案是构建期物化：

`scripts/gen-content-index.mjs`（由 `predev`/`prebuild` 钩子自动运行）生成：

1. `src/lib/post-index.json` — 文章元数据（slug/title/date/description，滤 draft）。`src/lib/post-index.ts` 从它导出 `POST_INDEX` 和 `isValidSlug()`，API 路由用这个做 slug 校验。
2. `public/feed.xml`、`public/sitemap.xml`、`public/robots.txt` — 直接生成静态资源。**不用 app 路由**（`feed.xml/route.ts` + `force-static` 之类）：OpenNext 不会把 force-static route handler 的输出打进 incremental cache，部署后会 404（踩过）。静态资源由 Cloudflare assets 直接服务，绕开 worker。

注意脚本内的 `SITE` 常量与 `src/lib/site.ts` 手动保持同步（绑定自定义域名时两处都要改）。

## 7. 阅读层：自定义选区引擎（`src/selection/`）

文章页的文本选区完全自定义（绕过浏览器 Selection API），实现拖选方角矩形 → 松开呼吸变形为圆角高亮的交互。引擎为全新设计；`../base` 项目仅提供视觉样式参考（曲线预设、oklch + multiply、inhale/exhale 阶段），其引擎架构因连续性缺陷未被移植。

- **数据模型**：半开区间光标位 `[start, end)` 覆盖全文 grapheme 扁平索引 `flatChars`；`data-atomic` 单元（行内公式为 inline 原子、Figure/Video/Demo/CTACard/表格/display 公式为 block 原子）各占一个条目。DOM 走查与行模型见 selection-contract.md §1。
- **形状连续性（核心设计）**：选区按 block 原子切分为文本段，每段做纵向 band 分解——行带与间隙带无缝铺满整段 y 跨度，相邻带 x 区间构造性重叠（交集收腰、过窄回退并集 S 弯）→ 每段恒为单一简单多边形（`fill-rule:nonzero`），跨代码块/列表/标题的 markdown 间隙不产生任何断裂或跳跃。纯函数几何在 `geometry.ts`，有独立不变量测试（tiling/重叠/顺时针/无自交）。
- **左缘对齐（吞列规则）**：被完整选中的行、以及选区自上一行延续进入的行，左缘统一取文章列左缘（`LayoutSnapshot.columnLeft`）而非文本盒左缘——bullet、引用左边线、pre padding、嵌套缩进全部被罩入色块，跨块左缘为一条直线。选区起点所在行保持 caret 精确位置（信息性台阶）；居中/右对齐块经 `BlockInfo.flushLeft=false` 豁免。
- **组件选区**：block 原子仅由拖选扫过/键盘跨越纳入，渲染描边+蒙层高亮环，且与文本层共用同一阶段机呼吸（拖选中贴盒方角，松开外扩并圆角化为组件圆角+3）；原子内部（Chat 输入框、Poll 按钮）保持原生交互与原生选区。
- **交互完备性**：多击粒度拖选、Shift+点击、全键盘导航（Chromium 行为表规范，goal column）、Cmd/Ctrl+A、Escape、自动滚动、复制（块间 `\n` + 原子源码形式）、拖选后抑制链接 click。
- **接入方式**：`SelectionRoot`（client）渲染 `<article class="article">` 本身、children 直通（prose 保持 SSG 直出），overlay 为绝对定位兄弟节点。仅精细指针启用；触屏保留原生选区。快照就绪后 article 带 `data-selection-ready`。

## 8. 构建与部署（OpenNext + Cloudflare）

### 8.1 配置要点

- `next.config.ts`：`initOpenNextCloudflareForDev()` 让 `next dev` 经 miniflare 拿到 D1 binding（本地 D1 数据在 `.wrangler/state/v3/d1`，与 `wrangler --local` 共享）；`images.unoptimized = true`（Workers 无内置图片优化器，需要时换 Cloudflare Images loader）。
- `open-next.config.ts`：**必须**配置 `staticAssetsIncrementalCache`。默认 `defineCloudflareConfig()` 没有 incremental cache，SSG 页面（存放在 `.open-next/cache/<buildId>/...`）在 workerd 里读不到，配合 `dynamic = "error"` 会直接 404（踩过）。static-assets 缓存只读、零额外基础设施，纯 SSG 场景足够；引入 ISR/revalidate 时才需要 R2/KV。
- `wrangler.jsonc`：D1 binding `DB`（database_id `b6355285-ff6e-4476-9602-11ef4abc3e46`）、`nodejs_compat`、assets binding `ASSETS`。
- `cloudflare-env.d.ts`：用**模块级** `import type { D1Database } from "@cloudflare/workers-types"` + `declare global`。不要用三斜线 `/// <reference types="@cloudflare/workers-types" />`——那会全局覆盖 DOM 的 fetch/Response 类型，弄坏所有客户端组件的类型检查（踩过）。

### 8.2 命令

```bash
pnpm dev                # next dev（含 D1 binding）
pnpm build              # next build（prebuild 自动生成内容索引）
pnpm preview            # OpenNext 构建 + 本地 workerd 预览
pnpm deploy             # OpenNext 构建 + 部署
pnpm db:migrate:local   # D1 迁移（本地）
pnpm db:migrate:remote  # D1 迁移（远程）
```

### 8.3 已知无害告警

- `opennextjs-cloudflare build` 报 3 条 `ERROR Failed to copy .../hast-util-to-html | hast-util-whitespace | property-information`：来自 OpenNext 对带 workerd export condition 的外部包的处理旁路（`workerd.js` 的 try/catch）。本项目 MDX 全部在构建期编译（文章纯 SSG），运行时从不渲染 MDX，这三个包在 worker 里用不到。已验证不影响任何功能。
- deploy 时 esbuild 的 direct-eval 警告来自 Next 内部代码，无关。

### 8.4 部署验证基线（首版实测）

- 主页/文章页 200，文章 HTML 直出（view-source 可见全部 prose + 顺序 `data-block` + shiki 着色 span，无 prism chunk）。
- `document.querySelectorAll('[data-block] [data-block]').length === 0`。
- view/like 对远程 D1 读写成功且持久。
- feed.xml / sitemap.xml / robots.txt 均 200（注意 Workers 部署传播有数秒延迟，刚部署完 404 先等几秒再判断）。
- 首屏 First Load JS ~161KB（文章页，含 motion + NumberFlow + rough-notation 岛）。

## 9. 后续路线

1. ~~接入选区系统~~（已完成，见 §7：`src/selection/` 全新引擎）。~~选区方向性（anchor/focus 语义完整化）、可见光标~~（2026-07-10 完成：单击放置闪烁光标、Chromium 折叠/移动语义、caret affinity、`direction`/`caret` API，见 selection-contract.md §3）。剩余可迭代方向：触屏交互接管。
2. 行间评论/富组件插入——`data-atomic` + 块分裂机制。
3. 自定义域名 + `site.ts`/脚本 URL 更新；Cloudflare Images loader。
4. Bio 占位文案替换；`opengraph-image.tsx`（satori）；RSS 全文输出。
