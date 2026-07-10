"use client";

// Renders the active selection: one SVG path per frame for the text shape
// (band geometry inflated by the animated dx/dy/radius motion values) plus a
// rounded highlight ring per selected block-level atomic unit. The visual
// language — sharp while dragging, inhale/exhale morph on release, multiply
// blending, oklch tints — carries over from the base project's demo.

import { useEffect, useMemo, useRef, useState } from "react";
import {
  AnimatePresence,
  animate,
  motion,
  useAnimationFrame,
  useMotionValue,
} from "motion/react";

import { pathForSegments, rowsForRange, type SelectionRows } from "./geometry";
import { localRect } from "./layout";
import type { Measure } from "./measure";
import type { Caret, LayoutSnapshot, Phase, Rect, SelectionRange } from "./types";

type Stage = "drag" | "inhale" | "exhale" | "deflate";

// Fixed animation preset (base's "soft": 方角顺滑鼓成圆角).
const INHALE_MS = 90;
const EXHALE_MS = 380;
const INHALE_EASE = [0.4, 0, 0.6, 1] as const;
const EXHALE_EASE = [0.18, 0.92, 0.22, 1.06] as const;
const VISUAL_EASE = [0.22, 1, 0.36, 1] as const;

const STAGE_TARGETS: Record<Stage, { dx: number; dy: number; radius: number }> = {
  drag: { dx: 0, dy: 0, radius: 2 },
  deflate: { dx: 0, dy: 0, radius: 2 },
  inhale: { dx: -0.5, dy: -0.5, radius: 3 },
  exhale: { dx: 3, dy: 2, radius: 5 },
};

interface AtomicHighlight {
  key: number;
  rect: Rect;
  radius: number;
}

/** Ring geometry per stage, mirroring the text bands' breathing: hugging
 * the component box with sharp corners while dragging, inflating to a
 * loose ring at the component's own rounding (+3px) on release. */
function ringGeometry(stage: Stage, a: AtomicHighlight) {
  const outset = stage === "exhale" ? 3 : stage === "inhale" ? -0.5 : 0;
  const radius = stage === "exhale" ? a.radius + 3 : stage === "inhale" ? 3 : 2;
  return {
    left: a.rect.x - outset,
    top: a.rect.y - outset,
    width: a.rect.w + outset * 2,
    height: a.rect.h + outset * 2,
    borderRadius: radius,
  };
}

function AtomicRing({ stage, a }: { stage: Stage; a: AtomicHighlight }) {
  const fade = { duration: 0.2, ease: [...VISUAL_EASE] as [number, number, number, number] };
  const geometry =
    stage === "drag"
      ? { duration: 0 }
      : {
          duration: (stage === "inhale" ? INHALE_MS : EXHALE_MS) / 1000,
          ease: [...(stage === "inhale" ? INHALE_EASE : EXHALE_EASE)] as [
            number,
            number,
            number,
            number,
          ],
        };
  return (
    <motion.div
      className="selection-atomic"
      initial={{ opacity: 0, scale: 0.99, ...ringGeometry(stage, a) }}
      animate={{ opacity: 1, scale: 1, ...ringGeometry(stage, a) }}
      exit={{ opacity: 0, scale: 0.99 }}
      transition={{ ...geometry, opacity: fade, scale: fade }}
    />
  );
}

function atomicRadius(el: HTMLElement): number {
  const own = parseFloat(getComputedStyle(el).borderRadius);
  if (own > 0) return own;
  const child = el.firstElementChild;
  if (child instanceof HTMLElement) {
    const inner = parseFloat(getComputedStyle(child).borderRadius);
    if (inner > 0) return inner;
  }
  return 10;
}

export function SelectionOverlay({
  snapshot,
  measure,
  range,
  caret,
  phase,
}: {
  snapshot: LayoutSnapshot | null;
  measure: Measure | null;
  range: SelectionRange | null;
  caret: Caret | null;
  phase: Phase;
}) {
  const [stage, setStage] = useState<Stage>("drag");
  const prevPhaseRef = useRef<Phase>(phase);

  useEffect(() => {
    const prevPhase = prevPhaseRef.current;
    prevPhaseRef.current = phase;
    if (phase === "dragging" || phase === "idle") {
      if (prevPhase === "settling" && phase === "dragging") {
        setStage("deflate");
        const t = setTimeout(() => setStage("drag"), EXHALE_MS);
        return () => clearTimeout(t);
      }
      setStage("drag");
      return;
    }
    // settling: brief inhale, then the exhale morph.
    setStage("inhale");
    const t = setTimeout(() => setStage("exhale"), INHALE_MS);
    return () => clearTimeout(t);
  }, [phase]);

  const dx = useMotionValue(0);
  const dy = useMotionValue(0);
  const radius = useMotionValue(2);
  const pathData = useMotionValue("");

  useEffect(() => {
    const target = STAGE_TARGETS[stage];
    if (stage === "drag") {
      dx.set(target.dx);
      dy.set(target.dy);
      radius.set(target.radius);
      return;
    }
    const ms = stage === "inhale" ? INHALE_MS : EXHALE_MS;
    const ease = stage === "inhale" ? INHALE_EASE : EXHALE_EASE;
    const opts = { duration: ms / 1000, ease: [...ease] as [number, number, number, number] };
    animate(dx, target.dx, opts);
    animate(dy, target.dy, opts);
    animate(radius, target.radius, opts);
  }, [stage, dx, dy, radius]);

  const shape: SelectionRows | null = useMemo(() => {
    if (!snapshot || !measure || !range || range.end <= range.start) return null;
    return rowsForRange(snapshot, measure, range);
  }, [snapshot, measure, range]);

  // Remounting on every position change (key) restarts the blink cycle, so
  // a moving caret is solidly visible — same as the native caret.
  const caretRect = useMemo(
    () => (caret && measure ? measure.caretRect(caret) : null),
    [caret, measure],
  );

  const atomics: AtomicHighlight[] = useMemo(() => {
    if (!shape || !snapshot) return [];
    const rootRect = snapshot.root.getBoundingClientRect();
    return shape.atomics.map((entry) => ({
      key: entry.g,
      rect: localRect(entry.el.getBoundingClientRect(), rootRect),
      radius: atomicRadius(entry.el),
    }));
  }, [shape, snapshot]);

  const shapeRef = useRef(shape);
  shapeRef.current = shape;
  const lastRef = useRef({ shape: null as SelectionRows | null, dx: 0, dy: 0, radius: 0 });

  useAnimationFrame(() => {
    const s = shapeRef.current;
    const cdx = dx.get();
    const cdy = dy.get();
    const cr = radius.get();
    const last = lastRef.current;
    if (s === last.shape && cdx === last.dx && cdy === last.dy && cr === last.radius) return;
    pathData.set(s ? pathForSegments(s.segments, cdx, cdy, cr) : "");
    lastRef.current = { shape: s, dx: cdx, dy: cdy, radius: cr };
  });

  const settled = stage === "exhale";
  const fill = settled
    ? "oklch(0.88 0.08 var(--selection-h) / 0.42)"
    : stage === "inhale"
      ? "oklch(0.88 0.07 var(--selection-h) / 0.5)"
      : "oklch(0.90 0.06 var(--selection-h) / 0.55)";
  const ring = settled
    ? "oklch(0.70 0.12 var(--selection-h) / 0.35)"
    : "oklch(0.72 0.08 var(--selection-h) / 0.25)";
  const shadow = settled
    ? "drop-shadow(0px 1px 2px oklch(0.55 0.12 var(--selection-h) / 0.10))"
    : "drop-shadow(0px 0px 0px oklch(0.55 0.12 var(--selection-h) / 0))";
  const visualTransition =
    stage === "drag"
      ? { duration: 0 }
      : {
          duration: (stage === "inhale" ? INHALE_MS : EXHALE_MS) / 1000,
          ease: [...VISUAL_EASE] as [number, number, number, number],
        };

  return (
    <div className="selection-overlay" aria-hidden="true">
      {shape && shape.segments.length > 0 && (
        <svg>
          <motion.path
            initial={false}
            d={pathData}
            fillRule="nonzero"
            animate={{ fill, stroke: ring, strokeWidth: 1, filter: shadow }}
            transition={visualTransition}
          />
        </svg>
      )}
      <AnimatePresence>
        {atomics.map((a) => (
          <AtomicRing key={a.key} stage={stage} a={a} />
        ))}
      </AnimatePresence>
      {caret && caretRect && (
        <div
          key={`${caret.g}:${caret.affinity}`}
          className="selection-caret"
          style={{ left: caretRect.x - 1, top: caretRect.y, height: caretRect.h }}
        />
      )}
    </div>
  );
}
