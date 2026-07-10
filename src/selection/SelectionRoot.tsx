"use client";

// Client entry for the selection engine. Renders the `.article` element
// itself (children are the server-rendered prose, passed through untouched —
// no extra wrapper, so `.article > *` CSS keeps matching) and mounts the
// overlay as an absolutely-positioned sibling of the prose.
//
// The engine only activates for fine pointers; coarse-pointer devices keep
// the browser's native selection (the CSS user-select suppression is gated
// on the same media query in article.css).

import { useEffect, useRef, useState, type ReactNode } from "react";

import { useSelection } from "./interaction";
import { useLayoutSnapshot } from "./layout";
import { SelectionOverlay } from "./SelectionOverlay";

export function SelectionRoot({ children }: { children: ReactNode }) {
  const rootRef = useRef<HTMLElement>(null);
  const [enabled, setEnabled] = useState(false);

  useEffect(() => {
    setEnabled(window.matchMedia("(pointer: fine)").matches);
  }, []);

  const snapshot = useLayoutSnapshot(rootRef, enabled);
  const sel = useSelection(rootRef, snapshot);

  return (
    <article
      className="article"
      ref={rootRef}
      // Readiness signal for tests/debugging: present once the layout
      // snapshot is built and the engine accepts input.
      data-selection-ready={snapshot ? "" : undefined}
      onPointerDown={sel.onPointerDown}
      onClickCapture={sel.onClickCapture}
    >
      {children}
      <SelectionOverlay
        snapshot={snapshot}
        measure={sel.measure}
        range={sel.range}
        caret={sel.caret}
        phase={sel.phase}
      />
    </article>
  );
}
