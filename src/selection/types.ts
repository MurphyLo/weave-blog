// Shared types for the custom selection engine. The data model follows the
// browser's own abstraction: a selection is a half-open range of cursor
// positions [start, end) over a flat array of grapheme-level entries, so
// `flatChars.slice(start, end)` is exactly the selected content and
// `end - start` is the selected count.

export interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

/** One selectable grapheme of block text. */
export interface TextCharEntry {
  ch: string;
  /** Global index — equals this entry's position in flatChars. */
  g: number;
  blockIdx: number;
  node: Text;
  /** Character offset of this grapheme inside `node`. */
  offset: number;
}

/**
 * One indivisible non-text unit (formula, figure, demo, table, …). Inline
 * atomics live inside a text block's character flow; block atomics form a
 * single-entry block of their own.
 */
export interface AtomicCharEntry {
  atomic: true;
  g: number;
  blockIdx: number;
  el: HTMLElement;
  kind: string;
  /** What this unit contributes to copied text (source form). */
  rawText: string;
  inline: boolean;
}

export type CharEntry = TextCharEntry | AtomicCharEntry;

export function isAtomic(entry: CharEntry): entry is AtomicCharEntry {
  return "atomic" in entry;
}

/** Half-open cursor-position range, always normalized start <= end. */
export interface SelectionRange {
  start: number;
  end: number;
}

export interface BlockInfo {
  idx: number;
  el: HTMLElement;
  /** [start, end) into flatChars. */
  start: number;
  end: number;
  kind: "text" | "atomic";
  /** Whitespace is significant (pre): newlines copy as-is. */
  pre: boolean;
}

/** One visual line (or one block-level atomic pseudo-line). */
export interface Line {
  idx: number;
  blockIdx: number;
  /** [startG, endG) cursor positions covered by this line. */
  startG: number;
  endG: number;
  /** Article-local coordinates (scroll-invariant). */
  rect: Rect;
  kind: "text" | "atomic";
}

export interface LayoutSnapshot {
  root: HTMLElement;
  flatChars: CharEntry[];
  blocks: BlockInfo[];
  lines: Line[];
  version: number;
}

export type Phase = "idle" | "dragging" | "settling";
export type DragUnit = "char" | "word" | "block";

/** A horizontal slice of the selection shape; bands tile a segment's
 * vertical span with no gaps, which is what guarantees shape continuity. */
export interface Band {
  top: number;
  bottom: number;
  left: number;
  right: number;
}

export interface Pt {
  x: number;
  y: number;
}
