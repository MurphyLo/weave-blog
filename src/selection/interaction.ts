// Selection state machine and event wiring: pointer drags (with multi-click
// word/block granularity), the keyboard command table, copy override, and
// drag auto-scroll. Owns anchor/focus refs; the rendered `range` is always
// the normalized min/max form.

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { RefObject } from "react";

import { textForRange } from "./layout";
import { createMeasure, type Measure } from "./measure";
import { actionForKey, type NavAction } from "./keymap";
import {
  isAtomic,
  type DragUnit,
  type LayoutSnapshot,
  type Line,
  type Phase,
  type SelectionRange,
} from "./types";

const MULTI_CLICK_MS = 380;
const MULTI_CLICK_SLOP = 2;
const DRAG_THRESHOLD = 4;
const SCROLL_EDGE = 80;
const SCROLL_MAX = 18;

const words = new Intl.Segmenter(undefined, { granularity: "word" });

// ---------------------------------------------------------------------------
// Word/block granularity over the flat entry space. Word segmentation runs on
// a per-block string reconstruction where every atomic unit is a single
// object-replacement char, so atomics behave as indivisible word units.

interface BlockText {
  text: string;
  /** String offset of each entry (parallel to the block's entry span). */
  offsets: number[];
  start: number;
  end: number;
}

type BlockTextCache = Map<number, BlockText>;

function blockTextFor(
  snapshot: LayoutSnapshot,
  cache: BlockTextCache,
  blockIdx: number,
): BlockText {
  let bt = cache.get(blockIdx);
  if (bt) return bt;
  const block = snapshot.blocks[blockIdx];
  let text = "";
  const offsets: number[] = [];
  for (let g = block.start; g < block.end; g++) {
    const entry = snapshot.flatChars[g];
    offsets.push(text.length);
    text += isAtomic(entry) ? "￼" : entry.ch;
  }
  bt = { text, offsets, start: block.start, end: block.end };
  cache.set(blockIdx, bt);
  return bt;
}

function gForOffset(bt: BlockText, offset: number): number {
  let lo = 0;
  let hi = bt.offsets.length;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if (bt.offsets[mid] >= offset) hi = mid;
    else lo = mid + 1;
  }
  return bt.start + lo;
}

function offsetForG(bt: BlockText, g: number): number {
  const i = g - bt.start;
  return i < bt.offsets.length ? bt.offsets[i] : bt.text.length;
}

export function wordRangeAt(
  snapshot: LayoutSnapshot,
  cache: BlockTextCache,
  g: number,
): SelectionRange {
  const total = snapshot.flatChars.length;
  if (!total) return { start: 0, end: 0 };
  const gi = Math.min(g, total - 1);
  const entry = snapshot.flatChars[gi];
  if (isAtomic(entry)) return { start: gi, end: gi + 1 };
  const bt = blockTextFor(snapshot, cache, entry.blockIdx);
  const off = offsetForG(bt, gi);
  for (const seg of words.segment(bt.text)) {
    if (seg.index <= off && off < seg.index + seg.segment.length) {
      return {
        start: gForOffset(bt, seg.index),
        end: gForOffset(bt, seg.index + seg.segment.length),
      };
    }
  }
  return { start: gi, end: gi + 1 };
}

/** Entry whose word/block unit a cursor position belongs to. A cursor at
 * its line's end (right of a text line's last grapheme, or below an
 * atomic's center) sits directly before the NEXT block's first entry in
 * flatChars, so unit lookups there must clamp to the line's own last
 * entry — otherwise a double/triple click or a unit drag past the line's
 * edge selects content the pointer never reached (the block after it). */
function unitEntryFor(g: number, line: Line | null): number {
  return line && g === line.endG && g > line.startG ? g - 1 : g;
}

export function blockRangeAt(snapshot: LayoutSnapshot, g: number): SelectionRange {
  const total = snapshot.flatChars.length;
  if (!total) return { start: 0, end: 0 };
  const entry = snapshot.flatChars[Math.min(g, total - 1)];
  const block = snapshot.blocks[entry.blockIdx];
  return { start: block.start, end: block.end };
}

/** Next word boundary to the right. macOS stops at the end of the current
 * word; Windows jumps to the start of the next one. */
function wordRight(
  snapshot: LayoutSnapshot,
  cache: BlockTextCache,
  g: number,
  isMac: boolean,
): number {
  const total = snapshot.flatChars.length;
  if (g >= total) return total;
  const entry = snapshot.flatChars[g];
  if (isAtomic(entry)) return g + 1;
  const bt = blockTextFor(snapshot, cache, entry.blockIdx);
  const off = offsetForG(bt, g);
  for (const seg of words.segment(bt.text)) {
    if (!(seg as Intl.SegmentData & { isWordLike?: boolean }).isWordLike) continue;
    const candidate = gForOffset(bt, isMac ? seg.index + seg.segment.length : seg.index);
    if (candidate > g) return candidate;
  }
  if (off < bt.text.length) return bt.end; // trailing non-word tail
  return bt.end >= total ? total : wordRight(snapshot, cache, bt.end, isMac);
}

/** Previous word start to the left (both platforms). */
function wordLeft(snapshot: LayoutSnapshot, cache: BlockTextCache, g: number): number {
  if (g <= 0) return 0;
  const entry = snapshot.flatChars[g - 1];
  if (isAtomic(entry)) return g - 1;
  const bt = blockTextFor(snapshot, cache, entry.blockIdx);
  const off = offsetForG(bt, g);
  let best = -1;
  for (const seg of words.segment(bt.text)) {
    if (!(seg as Intl.SegmentData & { isWordLike?: boolean }).isWordLike) continue;
    const candidate = gForOffset(bt, seg.index);
    if (candidate < g) best = Math.max(best, candidate);
  }
  return best >= 0 ? best : bt.start;
}

// ---------------------------------------------------------------------------

export interface SelectionApi {
  range: SelectionRange | null;
  phase: Phase;
  measure: Measure | null;
  onPointerDown(e: React.PointerEvent): void;
  onClickCapture(e: React.MouseEvent): void;
}

export function useSelection(
  rootRef: RefObject<HTMLElement | null>,
  snapshot: LayoutSnapshot | null,
): SelectionApi {
  const [range, setRange] = useState<SelectionRange | null>(null);
  const [phase, setPhase] = useState<Phase>("idle");

  const measure = useMemo(() => (snapshot ? createMeasure(snapshot) : null), [snapshot]);

  const snapRef = useRef(snapshot);
  const measureRef = useRef(measure);
  const rangeRef = useRef(range);
  snapRef.current = snapshot;
  measureRef.current = measure;
  rangeRef.current = range;

  const anchorRef = useRef<number | null>(null);
  const focusRef = useRef<number | null>(null);
  const goalXRef = useRef<number | null>(null);
  const dragUnitRef = useRef<DragUnit>("char");
  const dragBaseRef = useRef<SelectionRange | null>(null);
  const hasDraggedRef = useRef(false);
  const keyboardExtendRef = useRef(false);
  const clickRef = useRef({ g: -1, ts: 0, count: 0 });
  const lastClientRef = useRef({ x: 0, y: 0 });
  const downClientRef = useRef({ x: 0, y: 0 });
  const scrollRafRef = useRef(0);
  const detachDragRef = useRef<(() => void) | null>(null);
  const blockTextCacheRef = useRef<BlockTextCache>(new Map());
  /** Line resolved for the previous drag sample — hysteresis input. */
  const dragLineRef = useRef<Line | null>(null);

  const isMac = useMemo(
    () => (typeof navigator !== "undefined" ? /mac/i.test(navigator.platform) : true),
    [],
  );

  // A rebuilt snapshot keeps entry indices stable (same DOM content), but a
  // shrunk one must not leave a dangling range.
  useEffect(() => {
    blockTextCacheRef.current = new Map();
    dragLineRef.current = null; // stale Line objects reference the old snapshot
    if (!snapshot) return;
    const total = snapshot.flatChars.length;
    const r = rangeRef.current;
    if (r && r.end > total) {
      setRange(null);
      setPhase("idle");
      anchorRef.current = focusRef.current = null;
    }
  }, [snapshot]);

  const apply = useCallback((anchor: number, focus: number) => {
    anchorRef.current = anchor;
    focusRef.current = focus;
    if (anchor === focus) setRange(null);
    else setRange({ start: Math.min(anchor, focus), end: Math.max(anchor, focus) });
  }, []);

  const clearAll = useCallback(() => {
    setRange(null);
    setPhase("idle");
    dragBaseRef.current = null;
    goalXRef.current = null;
  }, []);

  // --- pointer -------------------------------------------------------------

  const applyDragAt = useCallback(
    (clientX: number, clientY: number) => {
      const s = snapRef.current;
      const m = measureRef.current;
      if (!s || !m) return;
      const pt = m.toLocal(clientX, clientY);
      const line = m.lineAt(pt.y, dragLineRef.current);
      dragLineRef.current = line;
      const g = m.gAtPoint(pt.x, pt.y, line);
      focusRef.current = g;
      const unit = dragUnitRef.current;
      if (unit === "char" || !dragBaseRef.current) {
        apply(anchorRef.current ?? g, g);
        return;
      }
      const cache = blockTextCacheRef.current;
      const unitG = unitEntryFor(g, line);
      const u = unit === "word" ? wordRangeAt(s, cache, unitG) : blockRangeAt(s, unitG);
      const base = dragBaseRef.current;
      const merged = {
        start: Math.min(base.start, u.start),
        end: Math.max(base.end, u.end),
      };
      // Anchor stays on the initial unit; focus follows the moving side.
      if (u.start < base.start) {
        anchorRef.current = merged.end;
        focusRef.current = merged.start;
      } else {
        anchorRef.current = merged.start;
        focusRef.current = merged.end;
      }
      setRange(merged);
    },
    [apply],
  );

  const stopAutoScroll = useCallback(() => {
    cancelAnimationFrame(scrollRafRef.current);
    scrollRafRef.current = 0;
  }, []);

  const maybeAutoScroll = useCallback(() => {
    if (scrollRafRef.current) return;
    const tick = () => {
      scrollRafRef.current = 0;
      const y = lastClientRef.current.y;
      let dy = 0;
      if (y < SCROLL_EDGE) dy = -Math.min(SCROLL_MAX, (SCROLL_EDGE - y) / 3);
      else if (y > window.innerHeight - SCROLL_EDGE) {
        dy = Math.min(SCROLL_MAX, (y - (window.innerHeight - SCROLL_EDGE)) / 3);
      }
      if (!dy) return;
      window.scrollBy(0, dy);
      applyDragAt(lastClientRef.current.x, lastClientRef.current.y);
      scrollRafRef.current = requestAnimationFrame(tick);
    };
    scrollRafRef.current = requestAnimationFrame(tick);
  }, [applyDragAt]);

  const onPointerDown = useCallback(
    (e: React.PointerEvent) => {
      const s = snapRef.current;
      const m = measureRef.current;
      if (!s || !m) return;
      if (e.button !== 0 || e.pointerType === "touch") return;
      const target = e.target as HTMLElement;
      // Component internals stay fully native; buttons/inputs anywhere are
      // never selection starts. (Sweeping *across* an atomic from outside
      // still includes it as a unit.)
      if (target.closest("[data-atomic], button, input, textarea, select")) return;

      detachDragRef.current?.();
      hasDraggedRef.current = false;
      keyboardExtendRef.current = false;
      goalXRef.current = null;

      const pt = m.toLocal(e.clientX, e.clientY);
      const line = m.lineAt(pt.y);
      dragLineRef.current = line;
      const g = m.gAtPoint(pt.x, pt.y);
      const unitG = unitEntryFor(g, line);
      lastClientRef.current = downClientRef.current = { x: e.clientX, y: e.clientY };

      const prev = clickRef.current;
      const count =
        e.timeStamp - prev.ts < MULTI_CLICK_MS && Math.abs(g - prev.g) <= MULTI_CLICK_SLOP
          ? Math.min(prev.count + 1, 3)
          : 1;
      clickRef.current = { g, ts: e.timeStamp, count };

      if (e.shiftKey && anchorRef.current != null) {
        dragUnitRef.current = "char";
        dragBaseRef.current = null;
        apply(anchorRef.current, g);
        setPhase("dragging");
      } else if (count === 2) {
        const r = wordRangeAt(s, blockTextCacheRef.current, unitG);
        dragUnitRef.current = "word";
        dragBaseRef.current = r;
        apply(r.start, r.end);
        setPhase("dragging");
      } else if (count === 3) {
        const r = blockRangeAt(s, unitG);
        dragUnitRef.current = "block";
        dragBaseRef.current = r;
        apply(r.start, r.end);
        setPhase("dragging");
      } else {
        dragUnitRef.current = "char";
        dragBaseRef.current = null;
        anchorRef.current = g;
        focusRef.current = g;
        setRange(null);
        setPhase("idle");
      }

      const onMove = (ev: PointerEvent) => {
        lastClientRef.current = { x: ev.clientX, y: ev.clientY };
        if (!hasDraggedRef.current) {
          const moved = Math.hypot(
            ev.clientX - downClientRef.current.x,
            ev.clientY - downClientRef.current.y,
          );
          if (moved < DRAG_THRESHOLD) return;
          hasDraggedRef.current = true;
          setPhase("dragging");
        }
        applyDragAt(ev.clientX, ev.clientY);
        maybeAutoScroll();
      };
      const onUp = () => {
        detachDragRef.current?.();
        setPhase(rangeRef.current ? "settling" : "idle");
      };
      window.addEventListener("pointermove", onMove);
      window.addEventListener("pointerup", onUp);
      window.addEventListener("pointercancel", onUp);
      detachDragRef.current = () => {
        window.removeEventListener("pointermove", onMove);
        window.removeEventListener("pointerup", onUp);
        window.removeEventListener("pointercancel", onUp);
        detachDragRef.current = null;
        stopAutoScroll();
      };
    },
    [apply, applyDragAt, maybeAutoScroll, stopAutoScroll],
  );

  useEffect(() => () => detachDragRef.current?.(), []);

  // A completed drag must not fire the click it ends on (links would
  // navigate after a drag-select across them).
  const onClickCapture = useCallback((e: React.MouseEvent) => {
    if (!hasDraggedRef.current) return;
    hasDraggedRef.current = false;
    e.preventDefault();
    e.stopPropagation();
  }, []);

  // --- keyboard ------------------------------------------------------------

  const moveFocus = useCallback(
    (g: number, action: Extract<NavAction, { type: "move" }>): number => {
      const s = snapRef.current;
      const m = measureRef.current;
      if (!s || !m) return g;
      const total = s.flatChars.length;
      const cache = blockTextCacheRef.current;
      const { dir, granularity } = action;
      const backward = dir === "left" || dir === "up";

      switch (granularity) {
        case "char":
          return backward ? Math.max(0, g - 1) : Math.min(total, g + 1);
        case "word":
          return backward ? wordLeft(s, cache, g) : wordRight(s, cache, g, isMac);
        case "lineBoundary": {
          const line = m.lineOf(g);
          return line ? (backward ? line.startG : line.endG) : g;
        }
        case "block": {
          const entry = s.flatChars[Math.min(g, total - 1)];
          if (!entry) return g;
          const block = s.blocks[entry.blockIdx];
          if (backward) {
            if (g > block.start) return block.start;
            return block.idx > 0 ? s.blocks[block.idx - 1].start : 0;
          }
          if (g < block.end) return block.end;
          return block.idx + 1 < s.blocks.length ? s.blocks[block.idx + 1].end : total;
        }
        case "doc":
          return backward ? 0 : total;
        case "line": {
          const line = m.lineOf(g);
          if (!line) return g;
          if (goalXRef.current == null) goalXRef.current = m.caretX(g, line);
          const target = s.lines[line.idx + (backward ? -1 : 1)];
          if (!target) return backward ? 0 : total;
          if (target.kind === "atomic") return backward ? target.startG : target.endG;
          return m.gAtLineX(target, goalXRef.current);
        }
        case "page": {
          const line = m.lineOf(g);
          if (!line) return g;
          if (goalXRef.current == null) goalXRef.current = m.caretX(g, line);
          const targetY =
            line.rect.y + line.rect.h / 2 + (backward ? -1 : 1) * window.innerHeight * 0.85;
          const target = m.lineAt(targetY);
          if (!target) return g;
          if (target.kind === "atomic") return backward ? target.startG : target.endG;
          return m.gAtLineX(target, goalXRef.current);
        }
      }
    },
    [isMac],
  );

  useEffect(() => {
    if (!snapshot || !measure) return;

    const onKeyDown = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement | null;
      if (t?.closest?.('input, textarea, select, [contenteditable="true"]')) return;
      const action = actionForKey(e, isMac);
      if (!action) return;

      if (action.type === "selectAll") {
        const total = snapshot.flatChars.length;
        if (!total) return;
        e.preventDefault();
        apply(0, total);
        goalXRef.current = null;
        setPhase("settling");
        return;
      }
      if (action.type === "clear") {
        if (!rangeRef.current) return;
        e.preventDefault();
        clearAll();
        return;
      }

      if (action.granularity !== "line" && action.granularity !== "page") {
        goalXRef.current = null;
      }

      if (!action.extend) {
        // No caret is rendered in this read-only context: a plain move
        // collapses the selection to the directional edge and re-arms the
        // anchor there for subsequent Shift-extends.
        const r = rangeRef.current;
        if (!r) return; // let the page scroll
        e.preventDefault();
        const backward = action.dir === "left" || action.dir === "up";
        const edge = backward ? r.start : r.end;
        anchorRef.current = focusRef.current = edge;
        setRange(null);
        setPhase("idle");
        return;
      }

      const from = focusRef.current ?? anchorRef.current;
      if (from == null) return;
      e.preventDefault();
      if (anchorRef.current == null) anchorRef.current = from;
      const next = moveFocus(from, action);
      keyboardExtendRef.current = true;
      apply(anchorRef.current, next);
      setPhase(next === anchorRef.current ? "idle" : "dragging");
    };

    const onKeyUp = (e: KeyboardEvent) => {
      if (e.key !== "Shift" || !keyboardExtendRef.current) return;
      keyboardExtendRef.current = false;
      if (rangeRef.current) setPhase("settling");
    };

    window.addEventListener("keydown", onKeyDown);
    window.addEventListener("keyup", onKeyUp);
    return () => {
      window.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("keyup", onKeyUp);
    };
  }, [snapshot, measure, isMac, apply, clearAll, moveFocus]);

  // --- copy & native-selection suppression ----------------------------------

  useEffect(() => {
    if (!snapshot) return;
    const onCopy = (e: ClipboardEvent) => {
      const r = rangeRef.current;
      if (!r || r.end <= r.start || !e.clipboardData) return;
      e.preventDefault();
      e.clipboardData.setData("text/plain", textForRange(snapshot, r));
    };
    document.addEventListener("copy", onCopy);
    return () => document.removeEventListener("copy", onCopy);
  }, [snapshot]);

  useEffect(() => {
    const root = rootRef.current;
    if (!root || !snapshot) return;
    // Native selection/drag would bleed through the multiply overlay.
    // Component internals ([data-atomic]) keep native behavior.
    const prevent = (e: Event) => {
      const t = e.target as HTMLElement | null;
      if (t?.closest?.("[data-atomic], input, textarea")) return;
      e.preventDefault();
    };
    root.addEventListener("selectstart", prevent);
    root.addEventListener("dragstart", prevent);
    return () => {
      root.removeEventListener("selectstart", prevent);
      root.removeEventListener("dragstart", prevent);
    };
  }, [rootRef, snapshot]);

  return { range, phase, measure, onPointerDown, onClickCapture };
}
