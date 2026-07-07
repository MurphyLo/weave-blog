// Selection-shape synthesis. The continuity guarantee lives here:
//
// A selected text segment is decomposed into a stack of horizontal *bands*
// that tile its vertical span with no gaps — one band per visual line, plus
// one band for every inter-line gap (paragraph padding, block margins,
// code-block padding, heading rhythm). Every adjacent pair of bands is
// constructed to overlap horizontally, so the traced outline is always one
// simple polygon: the shape cannot split, jump, or self-intersect at
// markdown block boundaries by construction.
//
// Gap-band x-extents: the intersection of the neighbouring lines' extents
// (a natural waist once rounded); when the intersection is narrower than
// MIN_NECK — including not overlapping at all (tiny lines, deep indent
// changes) — the union is used instead, which rounds into a ribbon-like
// S-bend but keeps the region connected.
//
// Everything in this module is pure (no DOM) except rowsForRange, which
// reads caret x-positions through the Measure.

import type { Measure } from "./measure";
import type { AtomicCharEntry, Band, LayoutSnapshot, Pt, SelectionRange } from "./types";

/** Narrower gap necks than this switch from intersection to union (px). */
const MIN_NECK = 24;
/** Directly touching bands are nudged to overlap at least this much (px). */
const MIN_OVERLAP = 8;
/** Adjacent line right-edges within this distance are aligned (px). */
const ALIGN_EPS = 8;

export interface SelectionRows {
  /** One row stack per contiguous text run (split at block atomics). */
  segments: Band[][];
  /** Block-level atomic units covered by the range. */
  atomics: AtomicCharEntry[];
}

/** Per-line selected extents, segmented at block-level atomic units. */
export function rowsForRange(
  snapshot: LayoutSnapshot,
  measure: Measure,
  range: SelectionRange,
): SelectionRows {
  const segments: Band[][] = [];
  const atomics: AtomicCharEntry[] = [];
  let current: Band[] = [];

  for (const line of snapshot.lines) {
    if (range.start >= line.endG || range.end <= line.startG) continue;

    if (line.kind === "atomic") {
      atomics.push(snapshot.flatChars[line.startG] as AtomicCharEntry);
      if (current.length) {
        segments.push(current);
        current = [];
      }
      continue;
    }

    const selStart = Math.max(range.start, line.startG);
    const selEnd = Math.min(range.end, line.endG);
    if (selEnd <= selStart) continue;
    const left =
      selStart <= line.startG ? line.rect.x : measure.caretX(selStart, line);
    const right =
      selEnd >= line.endG ? line.rect.x + line.rect.w : measure.caretX(selEnd, line);
    current.push({
      top: line.rect.y,
      bottom: line.rect.y + line.rect.h,
      left,
      // Degenerate rows (selection covering only collapsed whitespace)
      // still get a visible sliver so the band chain stays connected.
      right: Math.max(right, left + 2),
    });
  }
  if (current.length) segments.push(current);
  return { segments, atomics };
}

/** Align nearly-equal right edges of consecutive rows (ragged-edge
 * de-jitter): runs whose spread stays within eps snap to the run maximum. */
export function smoothRows(rows: Band[], eps = ALIGN_EPS): Band[] {
  const out = rows.map((r) => ({ ...r }));
  let runStart = 0;
  let runMin = out.length ? out[0].right : 0;
  let runMax = runMin;
  const flush = (end: number) => {
    for (let i = runStart; i < end; i++) out[i].right = runMax;
  };
  for (let i = 1; i < out.length; i++) {
    const r = out[i].right;
    if (Math.max(runMax, r) - Math.min(runMin, r) <= eps) {
      runMin = Math.min(runMin, r);
      runMax = Math.max(runMax, r);
    } else {
      flush(i);
      runStart = i;
      runMin = runMax = r;
    }
  }
  flush(out.length);
  return out;
}

function ensureOverlap(a: Band, b: Band) {
  const overlap = Math.min(a.right, b.right) - Math.max(a.left, b.left);
  if (overlap >= MIN_OVERLAP) return;
  // Rare fallback (adjacent rows with no gap and almost-disjoint extents):
  // widen the lower band toward the upper one.
  if (b.right < a.left + MIN_OVERLAP) b.right = a.left + MIN_OVERLAP;
  if (b.left > a.right - MIN_OVERLAP) b.left = a.right - MIN_OVERLAP;
}

/** Interleave gap bands so the result tiles [rows[0].top, rows[n-1].bottom]
 * seamlessly, with adjacent bands always overlapping in x. */
export function buildBands(rows: Band[]): Band[] {
  const bands: Band[] = [];
  for (let i = 0; i < rows.length; i++) {
    const row: Band = { ...rows[i] };
    if (i > 0) {
      const prev = bands[bands.length - 1];
      const gap = row.top - prev.bottom;
      if (gap > 0.5) {
        let left = Math.max(prev.left, row.left);
        let right = Math.min(prev.right, row.right);
        if (right - left < MIN_NECK) {
          left = Math.min(prev.left, row.left);
          right = Math.max(prev.right, row.right);
        }
        bands.push({ top: prev.bottom, bottom: row.top, left, right });
      } else {
        // Touching or slightly overlapping rows: split the boundary at the
        // midpoint so the bands still tile exactly.
        const m = (prev.bottom + row.top) / 2;
        prev.bottom = m;
        row.top = m;
        ensureOverlap(prev, row);
      }
    }
    bands.push(row);
  }
  return bands;
}

/**
 * Trace one clockwise simple polygon around a tiled band stack.
 * dx inflates every band's left/right; dy only the stack's outer envelope
 * (first top, last bottom) so interior boundaries keep tiling exactly.
 */
export function tracePolygon(bands: Band[], dx: number, dy: number): Pt[] {
  if (!bands.length) return [];
  const b = bands.map((band, i) => ({
    left: band.left - dx,
    right: band.right + dx,
    top: i === 0 ? band.top - dy : band.top,
    bottom: i === bands.length - 1 ? band.bottom + dy : band.bottom,
  }));

  const pts: Pt[] = [];
  pts.push({ x: b[0].left, y: b[0].top });
  pts.push({ x: b[0].right, y: b[0].top });
  for (let i = 0; i < b.length; i++) {
    pts.push({ x: b[i].right, y: b[i].bottom });
    if (i + 1 < b.length) pts.push({ x: b[i + 1].right, y: b[i].bottom });
  }
  const last = b[b.length - 1];
  pts.push({ x: last.left, y: last.bottom });
  for (let i = b.length - 1; i >= 0; i--) {
    pts.push({ x: b[i].left, y: b[i].top });
    if (i > 0) pts.push({ x: b[i - 1].left, y: b[i].top });
  }

  // Cleanup: consecutive duplicates, loop-closure duplicate, collinear points.
  const clean: Pt[] = [];
  for (const p of pts) {
    const prev = clean[clean.length - 1];
    if (prev && Math.abs(prev.x - p.x) < 0.1 && Math.abs(prev.y - p.y) < 0.1) continue;
    clean.push(p);
  }
  if (clean.length > 1) {
    const first = clean[0];
    const end = clean[clean.length - 1];
    if (Math.abs(end.x - first.x) < 0.1 && Math.abs(end.y - first.y) < 0.1) clean.pop();
  }
  return clean.filter((p, i, arr) => {
    const prev = arr[(i - 1 + arr.length) % arr.length];
    const next = arr[(i + 1) % arr.length];
    const isHoriz = Math.abs(prev.y - p.y) < 0.1 && Math.abs(p.y - next.y) < 0.1;
    const isVert = Math.abs(prev.x - p.x) < 0.1 && Math.abs(p.x - next.x) < 0.1;
    return !(isHoriz || isVert);
  });
}

/** Arc-based corner rounding (style carried over from the base project's
 * demo): per-vertex radius capped at half of each adjacent edge, sub-pixel
 * arcs degrade to straight segments, sweep direction from the cross product
 * so convex and concave corners both round correctly. */
export function roundedPath(pts: Pt[], radius: number): string {
  if (pts.length === 0) return "";
  if (radius <= 0) {
    return (
      `M ${pts[0].x} ${pts[0].y} ` +
      pts
        .slice(1)
        .map((p) => `L ${p.x} ${p.y}`)
        .join(" ") +
      " Z"
    );
  }

  let d = "";
  for (let i = 0; i < pts.length; i++) {
    const prev = pts[(i - 1 + pts.length) % pts.length];
    const curr = pts[i];
    const next = pts[(i + 1) % pts.length];

    const l1 = Math.hypot(curr.x - prev.x, curr.y - prev.y);
    const l2 = Math.hypot(next.x - curr.x, next.y - curr.y);
    const r = Math.min(radius, l1 / 2, l2 / 2);

    if (r <= 0.5) {
      d += i === 0 ? `M ${curr.x} ${curr.y} ` : `L ${curr.x} ${curr.y} `;
      continue;
    }

    const v1x = (prev.x - curr.x) / l1;
    const v1y = (prev.y - curr.y) / l1;
    const v2x = (next.x - curr.x) / l2;
    const v2y = (next.y - curr.y) / l2;
    const startX = curr.x + v1x * r;
    const startY = curr.y + v1y * r;
    const endX = curr.x + v2x * r;
    const endY = curr.y + v2y * r;

    const cross = -v1x * v2y + v1y * v2x;
    const sweep = cross > 0 ? 1 : 0;

    d += i === 0 ? `M ${startX} ${startY} ` : `L ${startX} ${startY} `;
    d += `A ${r} ${r} 0 0 ${sweep} ${endX} ${endY} `;
  }
  return d + "Z";
}

/** Full path for all segments at the given inflation/rounding. */
export function pathForSegments(
  segments: Band[][],
  dx: number,
  dy: number,
  radius: number,
): string {
  return segments
    .map((rows) => roundedPath(tracePolygon(buildBands(smoothRows(rows)), dx, dy), radius))
    .join(" ");
}
