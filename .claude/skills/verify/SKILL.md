---
name: verify
description: Build/launch/drive recipe for verifying weave-blog changes end-to-end in a real browser.
---

# Verifying weave-blog changes

## Launch

- `pnpm dev` (background) → http://localhost:3000; ready when `/` returns 200
  (~15s cold). Posts live at `/posts/<slug>` (`content/posts/*.mdx`;
  `hello-world` exercises the whole pipeline: GFM, code, math, footnotes,
  Demo/Poll/Chat islands).
- MDX pipeline files (`src/lib/rehype-*.ts`, `src/lib/mdx.ts`) recompile per
  request in dev — just reload the page after editing them.

## Drive (browser)

- Use the user's Edge via CDP: ws endpoint is `ws://127.0.0.1:9222` + the
  path from `~/Library/Application Support/Microsoft Edge/DevToolsActivePort`
  (line 2). Playwright python: `chromium.connect_over_cdp(ws)`,
  `browser.contexts[0].new_page()`. `uv run --with playwright python …` works.
- Gotchas: `curl` to 127.0.0.1 is intercepted by a proxy env — probe ports
  with `lsof -nP -iTCP:<port> -sTCP:LISTEN` instead. CDP pages have
  `viewport_size == None` — read `window.innerHeight` via evaluate. The site
  sets global `scroll-behavior: smooth`; sleep or use instant scrolling
  before sampling positions.

## Selection engine checks (src/selection/, docs/selection-contract.md)

- Wait for `article[data-selection-ready]` before any interaction.
- Observables: `.selection-overlay svg path` (`d` attr non-empty = active
  range), `.selection-atomic` (block-atomic rings). There is deliberately NO
  rendered caret (`.selection-caret` must never exist — the caret is an API
  model only, see selection-contract.md §3); plain arrows without a range
  must keep default page scrolling.
- After any MDX pipeline change, assert the contract:
  `document.querySelectorAll('[data-block] [data-block]').length === 0`,
  footnote backrefs `aria-hidden` + `tabIndex === -1`, and no
  `.sr-only[data-block]`.
- Keyboard: drive with `page.keyboard.press` (macOS mapping: Meta+Arrows =
  line/doc, Alt+Arrows = word/block). Multi-click granularity has a 380ms
  window — sleep >0.4s between unrelated clicks or the click counts chain.
