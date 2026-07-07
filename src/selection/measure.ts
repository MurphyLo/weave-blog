// Hit-testing and caret measurement over a layout snapshot. All queries are
// model-driven (line table + per-grapheme rects) rather than
// caretPositionFromPoint: deterministic across browsers, uniform for atomic
// units, and clicks in margins/gaps resolve to the nearest line naturally.
//
// Client x/y from pointer events are converted through the article root's
// live bounding rect, so page scroll needs no special handling.

import { entryClientRect } from "./layout";
import type { LayoutSnapshot, Line, Pt } from "./types";

/** Drag hysteresis (px): in a gap wider than ordinary line spacing, the
 * previously resolved line keeps the point until the pointer comes within
 * this distance of the adjacent line. Without it the focus flips at the
 * gap's midpoint, which reads as "grabbing the heading before the mouse
 * reaches it" across the large block gaps of the article layout. */
const STICKY = 8;

export interface Measure {
  toLocal(clientX: number, clientY: number): Pt;
  /** Nearest visual line to a local y. `sticky` — the line resolved for
   * the previous drag sample — adds hysteresis across wide gaps; narrow
   * gaps (< 2×STICKY, i.e. normal line spacing) stay pure nearest-line. */
  lineAt(yLocal: number, sticky?: Line | null): Line | null;
  /** Cursor position for a local point (mid-grapheme snapping). */
  gAtPoint(xLocal: number, yLocal: number, sticky?: Line | null): number;
  /** Cursor position for a local x on a known line (goal-column moves). */
  gAtLineX(line: Line, xLocal: number): number;
  /** Local x of cursor position g on the given line. */
  caretX(g: number, line: Line): number;
  /** Line containing cursor position g (last line for g == total). */
  lineOf(g: number): Line | null;
}

export function createMeasure(snapshot: LayoutSnapshot): Measure {
  const { root, lines, flatChars } = snapshot;
  // Grapheme horizontal midpoints per line, local coords, built lazily.
  const midsCache = new Map<number, number[]>();

  const rootLeft = () => root.getBoundingClientRect().left;

  function toLocal(clientX: number, clientY: number): Pt {
    const r = root.getBoundingClientRect();
    return { x: clientX - r.left, y: clientY - r.top };
  }

  function distTo(line: Line, yLocal: number): number {
    const top = line.rect.y;
    const bottom = line.rect.y + line.rect.h;
    return yLocal < top ? top - yLocal : yLocal > bottom ? yLocal - bottom : 0;
  }

  function lineAt(yLocal: number, sticky?: Line | null): Line | null {
    let best: Line | null = null;
    let bestD = Infinity;
    for (const line of lines) {
      const d = distTo(line, yLocal);
      if (d < bestD) {
        bestD = d;
        best = line;
        if (d === 0) break;
      }
    }
    if (!best || !sticky || sticky.idx === best.idx) return best;
    // Hysteresis only applies between two adjacent lines while the pointer
    // is still farther than STICKY from the nearer one. A pointer that
    // overshot past `best` (or jumped blocks) always resolves nearest.
    if (bestD <= STICKY || Math.abs(sticky.idx - best.idx) !== 1) return best;
    const [above, below] = sticky.idx < best.idx ? [sticky, best] : [best, sticky];
    const inGap = yLocal >= above.rect.y + above.rect.h && yLocal <= below.rect.y;
    if (!inGap) return best;
    return bestD + distTo(sticky, yLocal) <= 2 * STICKY ? best : sticky;
  }

  function midsFor(line: Line): number[] {
    let mids = midsCache.get(line.idx);
    if (!mids) {
      const left = rootLeft();
      mids = [];
      for (let g = line.startG; g < line.endG; g++) {
        const r = entryClientRect(flatChars[g]);
        mids.push(r.left + r.width / 2 - left);
      }
      midsCache.set(line.idx, mids);
    }
    return mids;
  }

  function gAtLineX(line: Line, xLocal: number): number {
    if (line.kind === "atomic") {
      // Whole-unit semantics: left half → before, right half → after.
      return xLocal < line.rect.x + line.rect.w / 2 ? line.startG : line.endG;
    }
    const mids = midsFor(line);
    let lo = 0;
    let hi = mids.length;
    while (lo < hi) {
      const mid = (lo + hi) >> 1;
      if (mids[mid] > xLocal) hi = mid;
      else lo = mid + 1;
    }
    return line.startG + lo;
  }

  function gAtPoint(xLocal: number, yLocal: number, sticky?: Line | null): number {
    const line = lineAt(yLocal, sticky);
    if (!line) return 0;
    if (line.kind === "atomic") {
      // Vertical drags dominate block units: above center → before it,
      // below → after it, so sweeping across includes the whole unit.
      return yLocal < line.rect.y + line.rect.h / 2 ? line.startG : line.endG;
    }
    return gAtLineX(line, xLocal);
  }

  function caretX(g: number, line: Line): number {
    const left = rootLeft();
    if (g >= line.endG) {
      const r = entryClientRect(flatChars[line.endG - 1]);
      return r.right - left;
    }
    const r = entryClientRect(flatChars[Math.max(g, line.startG)]);
    return r.left - left;
  }

  function lineOf(g: number): Line | null {
    for (const line of lines) {
      if (line.startG <= g && g < line.endG) return line;
    }
    return lines.length ? lines[lines.length - 1] : null;
  }

  return { toLocal, lineAt, gAtPoint, gAtLineX, caretX, lineOf };
}
