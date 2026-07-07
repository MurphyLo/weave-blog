// Keyboard command table. The behavioral spec is Chromium's editing
// command map (see base/docs/selection-interaction-reference.md): granularity
// × direction × extend, with platform modifier mapping — macOS uses Cmd for
// line/document level and Option for word/block level; Windows uses Ctrl.
// Unrecognized combinations return null so the browser keeps its defaults.

export type Dir = "left" | "right" | "up" | "down";
export type Granularity =
  | "char"
  | "word"
  | "line"
  | "lineBoundary"
  | "block"
  | "doc"
  | "page";

export type NavAction =
  | { type: "move"; dir: Dir; granularity: Granularity; extend: boolean }
  | { type: "selectAll" }
  | { type: "clear" };

const ARROWS: Record<string, Dir> = {
  ArrowLeft: "left",
  ArrowRight: "right",
  ArrowUp: "up",
  ArrowDown: "down",
};

export function actionForKey(e: KeyboardEvent, isMac: boolean): NavAction | null {
  const { key } = e;

  if (key === "Escape" && !e.metaKey && !e.ctrlKey && !e.altKey) return { type: "clear" };

  const primary = isMac ? e.metaKey : e.ctrlKey;
  if (primary && !e.altKey && !e.shiftKey && key.toLowerCase() === "a") {
    return { type: "selectAll" };
  }

  const extend = e.shiftKey;

  if (key in ARROWS) {
    const dir = ARROWS[key];
    const horizontal = dir === "left" || dir === "right";
    if (isMac) {
      if (e.ctrlKey) return null; // Ctrl+arrows are OS shortcuts on macOS
      if (e.metaKey && e.altKey) return null;
      if (e.metaKey) {
        return { type: "move", dir, granularity: horizontal ? "lineBoundary" : "doc", extend };
      }
      if (e.altKey) {
        return { type: "move", dir, granularity: horizontal ? "word" : "block", extend };
      }
    } else {
      if (e.altKey || e.metaKey) return null;
      if (e.ctrlKey) {
        return { type: "move", dir, granularity: horizontal ? "word" : "block", extend };
      }
    }
    return { type: "move", dir, granularity: horizontal ? "char" : "line", extend };
  }

  if (key === "Home" || key === "End") {
    // macOS Home/End scroll the page without moving the caret — keep that.
    if (isMac || e.metaKey || e.altKey) return null;
    const dir: Dir = key === "Home" ? "left" : "right";
    return { type: "move", dir, granularity: e.ctrlKey ? "doc" : "lineBoundary", extend };
  }

  if (key === "PageUp" || key === "PageDown") {
    if (e.metaKey || e.altKey || e.ctrlKey) return null;
    return { type: "move", dir: key === "PageUp" ? "up" : "down", granularity: "page", extend };
  }

  return null;
}
