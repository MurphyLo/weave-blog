// Layout snapshot builder: derives the selectable-content model from the
// rendered DOM (see docs/selection-contract.md). Client-side only.
//
// The walk visits the article root once, in document order:
//   - `aria-hidden="true"` subtrees are pruned (chrome, decorations);
//   - `[data-atomic]` elements emit exactly one AtomicCharEntry and are
//     never recursed into (inline atomics join the enclosing block's flow,
//     block atomics become single-entry blocks);
//   - text nodes inside `[data-block]` elements are split into graphemes.
//
// All rects are stored in article-local coordinates, so page scrolling
// never invalidates a snapshot — only resizes and internal scrolls
// (pre / katex-display overflow) do.

import { useEffect, useRef, useState, type RefObject } from "react";

import {
  isAtomic,
  type AtomicCharEntry,
  type BlockInfo,
  type CharEntry,
  type LayoutSnapshot,
  type Line,
  type Rect,
  type SelectionRange,
} from "./types";

const graphemes = new Intl.Segmenter(undefined, { granularity: "grapheme" });

export function localRect(r: DOMRect, rootRect: DOMRect): Rect {
  return { x: r.left - rootRect.left, y: r.top - rootRect.top, w: r.width, h: r.height };
}

/** Viewport rect of a single entry (one grapheme, or an atomic's element). */
export function entryClientRect(entry: CharEntry): DOMRect {
  if (isAtomic(entry)) return entry.el.getBoundingClientRect();
  const r = document.createRange();
  r.setStart(entry.node, entry.offset);
  r.setEnd(entry.node, entry.offset + entry.ch.length);
  return r.getBoundingClientRect();
}

/** Copy text for an atomic unit: explicit data-raw wins (katex, tables);
 * runtime-marked components (Figure/Video/Demo/CTACard) are derived. */
function deriveAtomic(el: HTMLElement): { kind: string; rawText: string } {
  const explicit = el.getAttribute("data-raw");
  const kindAttr = el.getAttribute("data-atomic-kind");
  if (explicit != null) return { kind: kindAttr ?? "embed", rawText: explicit };

  const img = el.querySelector("img");
  if (img) {
    return {
      kind: "image",
      rawText: `![${img.getAttribute("alt") ?? ""}](${img.getAttribute("src") ?? ""})`,
    };
  }
  const video = el.querySelector("video");
  if (video) return { kind: "video", rawText: `[video](${video.getAttribute("src") ?? ""})` };
  const caption = el.querySelector(".demo-caption");
  if (caption) return { kind: "demo", rawText: `[demo: ${(caption.textContent ?? "").trim()}]` };
  const link = el.querySelector("a[href]");
  if (link) {
    return {
      kind: "link",
      rawText: `[${(link.textContent ?? "").trim()}](${link.getAttribute("href") ?? ""})`,
    };
  }
  return { kind: kindAttr ?? "embed", rawText: `[${kindAttr ?? "embed"}]` };
}

function collect(root: HTMLElement, flatChars: CharEntry[], blocks: BlockInfo[]) {
  const visit = (node: Node, blockIdx: number | null) => {
    if (node.nodeType === Node.TEXT_NODE) {
      if (blockIdx === null) return;
      const value = (node as Text).nodeValue;
      if (!value) return;
      let offset = 0;
      for (const s of graphemes.segment(value)) {
        flatChars.push({
          ch: s.segment,
          g: flatChars.length,
          blockIdx,
          node: node as Text,
          offset,
        });
        offset += s.segment.length;
      }
      return;
    }
    if (node.nodeType !== Node.ELEMENT_NODE) return;
    const el = node as HTMLElement;
    if (el.getAttribute("aria-hidden") === "true") return;

    if (el.hasAttribute("data-atomic")) {
      const { kind, rawText } = deriveAtomic(el);
      if (blockIdx !== null) {
        flatChars.push({
          atomic: true,
          g: flatChars.length,
          blockIdx,
          el,
          kind,
          rawText,
          inline: true,
        });
      } else {
        const idx = blocks.length;
        const start = flatChars.length;
        flatChars.push({ atomic: true, g: start, blockIdx: idx, el, kind, rawText, inline: false });
        blocks.push({ idx, el, start, end: start + 1, kind: "atomic", pre: false, flushLeft: false });
      }
      return;
    }

    if (blockIdx === null && el.hasAttribute("data-block")) {
      const idx = blocks.length;
      const align = getComputedStyle(el).textAlign;
      const info: BlockInfo = {
        idx,
        el,
        start: flatChars.length,
        end: flatChars.length,
        kind: "text",
        pre: el.tagName === "PRE",
        flushLeft: align !== "center" && align !== "right" && align !== "end",
      };
      blocks.push(info);
      for (const child of Array.from(el.childNodes)) visit(child, idx);
      info.end = flatChars.length;
      if (info.end === info.start) blocks.pop();
      return;
    }

    for (const child of Array.from(el.childNodes)) visit(child, blockIdx);
  };
  visit(root, null);
}

interface Cluster {
  top: number;
  bottom: number;
  left: number;
  right: number;
}

/** Drop rects that strictly contain another rect: browsers report aggregate
 * boxes for block-level children fully covered by a Range (e.g. pretty-code's
 * grid <code> spanning every line). */
function dropContaining(rects: DOMRect[]): DOMRect[] {
  const eps = 0.5;
  return rects.filter((a) => {
    return !rects.some(
      (b) =>
        b !== a &&
        a.top <= b.top + eps &&
        a.bottom >= b.bottom - eps &&
        a.left <= b.left + eps &&
        a.right >= b.right - eps &&
        (a.width > b.width + eps || a.height > b.height + eps),
    );
  });
}

/** Cluster a block's client rects into visual lines by vertical overlap.
 * Overlap-based (not top-proximity) so inline runs with taller boxes —
 * KaTeX spans, serif italics — stay on their line. */
function clusterLines(rects: DOMRect[]): Cluster[] {
  const sorted = [...rects].sort((a, b) => a.top - b.top || a.left - b.left);
  const clusters: Cluster[] = [];
  for (const r of sorted) {
    const last = clusters[clusters.length - 1];
    const overlap = last ? Math.min(last.bottom, r.bottom) - Math.max(last.top, r.top) : -1;
    if (last && overlap > 0.4 * Math.min(r.height, last.bottom - last.top)) {
      last.top = Math.min(last.top, r.top);
      last.bottom = Math.max(last.bottom, r.bottom);
      last.left = Math.min(last.left, r.left);
      last.right = Math.max(last.right, r.right);
    } else {
      clusters.push({ top: r.top, bottom: r.bottom, left: r.left, right: r.right });
    }
  }
  return clusters;
}

function linesForBlock(
  block: BlockInfo,
  flatChars: CharEntry[],
  rootRect: DOMRect,
): Omit<Line, "idx">[] {
  if (block.kind === "atomic") {
    const entry = flatChars[block.start] as AtomicCharEntry;
    return [
      {
        blockIdx: block.idx,
        startG: block.start,
        endG: block.end,
        rect: localRect(entry.el.getBoundingClientRect(), rootRect),
        kind: "atomic",
      },
    ];
  }

  const range = document.createRange();
  range.selectNodeContents(block.el);
  const raw = Array.from(range.getClientRects()).filter((r) => r.width > 0.5 && r.height > 0.5);
  const clusters = clusterLines(dropContaining(raw));
  if (!clusters.length) return [];

  const centerY = (g: number) => {
    const r = entryClientRect(flatChars[g]);
    return r.top + r.height / 2;
  };

  // Split the block's entries at cluster boundaries: binary search for the
  // first entry past each boundary (entry centers are monotonic in normal
  // top-to-bottom flow).
  const starts: number[] = [block.start];
  for (let c = 0; c < clusters.length - 1; c++) {
    const boundary = (clusters[c].bottom + clusters[c + 1].top) / 2;
    let lo = starts[c];
    let hi = block.end;
    while (lo < hi) {
      const mid = (lo + hi) >> 1;
      if (centerY(mid) > boundary) hi = mid;
      else lo = mid + 1;
    }
    starts.push(lo);
  }

  const lines: Omit<Line, "idx">[] = [];
  for (let c = 0; c < clusters.length; c++) {
    const startG = starts[c];
    const endG = c + 1 < clusters.length ? starts[c + 1] : block.end;
    if (endG <= startG) continue;
    const cl = clusters[c];
    lines.push({
      blockIdx: block.idx,
      startG,
      endG,
      rect: {
        x: cl.left - rootRect.left,
        y: cl.top - rootRect.top,
        w: cl.right - cl.left,
        h: cl.bottom - cl.top,
      },
      kind: "text",
    });
  }
  return lines;
}

export function buildSnapshot(root: HTMLElement, version: number): LayoutSnapshot {
  const flatChars: CharEntry[] = [];
  const blocks: BlockInfo[] = [];
  collect(root, flatChars, blocks);

  const rootRect = root.getBoundingClientRect();
  const rootStyle = getComputedStyle(root);
  const columnLeft =
    parseFloat(rootStyle.borderLeftWidth) + parseFloat(rootStyle.paddingLeft) || 0;
  const lines: Line[] = [];
  for (const block of blocks) {
    for (const line of linesForBlock(block, flatChars, rootRect)) {
      lines.push({ ...line, idx: lines.length });
    }
  }
  return { root, flatChars, blocks, lines, columnLeft, version };
}

/** Plain-text form of a range: blocks separated by \n, atomics contribute
 * their source form, soft newlines inside non-pre blocks render as spaces. */
export function textForRange(snapshot: LayoutSnapshot, range: SelectionRange): string {
  let out = "";
  let prevBlock = -1;
  for (let g = range.start; g < range.end; g++) {
    const entry = snapshot.flatChars[g];
    if (prevBlock !== -1 && entry.blockIdx !== prevBlock) out += "\n";
    prevBlock = entry.blockIdx;
    if (isAtomic(entry)) {
      out += entry.rawText;
    } else if (entry.ch === "\n" && !snapshot.blocks[entry.blockIdx].pre) {
      out += " ";
    } else {
      out += entry.ch;
    }
  }
  return out;
}

/** Rebuilds the snapshot after fonts settle, on root resizes, and on
 * internal overflow scrolls. Returns null until the engine is usable
 * (also stays null on coarse-pointer devices — native selection applies). */
export function useLayoutSnapshot(
  rootRef: RefObject<HTMLElement | null>,
  enabled: boolean,
): LayoutSnapshot | null {
  const [snapshot, setSnapshot] = useState<LayoutSnapshot | null>(null);
  const versionRef = useRef(0);

  useEffect(() => {
    if (!enabled) return;
    const root = rootRef.current;
    if (!root) return;

    let disposed = false;
    let ready = false;
    let raf = 0;

    const rebuild = () => {
      if (disposed || !ready || !rootRef.current) return;
      versionRef.current += 1;
      setSnapshot(buildSnapshot(rootRef.current, versionRef.current));
    };
    const schedule = () => {
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(rebuild);
    };

    document.fonts.ready.then(() => {
      if (disposed) return;
      ready = true;
      rebuild();
    });

    const ro = new ResizeObserver(schedule);
    ro.observe(root);

    // Horizontal scrolling inside code blocks / display math shifts glyph
    // geometry without resizing the root.
    const scrollables = Array.from(root.querySelectorAll("pre, .katex-display"));
    for (const el of scrollables) el.addEventListener("scroll", schedule, { passive: true });

    return () => {
      disposed = true;
      cancelAnimationFrame(raf);
      ro.disconnect();
      for (const el of scrollables) el.removeEventListener("scroll", schedule);
    };
  }, [rootRef, enabled]);

  return enabled ? snapshot : null;
}
