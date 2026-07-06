"use client";

import { useState, useEffect, useId, useRef, type ReactNode } from "react";
import { motion, useAnimate, type AnimationSequence } from "motion/react";

// Animated copy button ported from agentation's CodeBlock.tsx: two stacked
// rounded squares collapse into a circle and a check draws in; the sequence
// reverses (or rewinds mid-flight via speed = -1) when the copied state ends.
function CopyButton({ onCopy }: { onCopy: () => Promise<boolean> }) {
  const [copied, setCopied] = useState(false);
  const [scope, animate] = useAnimate();
  const maskId = useId();
  const timerRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  const inSequence: AnimationSequence = [
    [
      '[data-part="square-front"]',
      { y: [0, -4] },
      { duration: 0.12, ease: "easeOut" },
    ],
    [
      '[data-part="square-back"]',
      { x: [0, -4] },
      { at: "<", duration: 0.12, ease: "easeOut" },
    ],
    [
      '[data-part="square-front"], [data-part="square-back"]',
      {
        rx: [2, 7.25],
        width: [10.5, 14.5],
        height: [10.5, 14.5],
        rotate: [0, -45],
      },
      { at: "<", duration: 0.12, ease: "easeOut" },
    ],
    [
      '[data-part="check"]',
      { opacity: [0, 1], pathOffset: [1, 0] },
      { at: "-0.03", duration: 0 },
    ],
    ['[data-part="check"]', { pathLength: [0, 1] }, { duration: 0.1 }],
  ];

  const outSequence: AnimationSequence = [
    [
      '[data-part="check"]',
      { pathOffset: [0, 1] },
      { duration: 0.1, ease: "easeOut" },
    ],
    [
      '[data-part="check"]',
      { opacity: [1, 0], pathLength: [1, 0] },
      { duration: 0 },
    ],
    [
      '[data-part="square-front"], [data-part="square-back"]',
      {
        rx: [7.25, 2],
        width: [14.5, 10.5],
        height: [14.5, 10.5],
        rotate: [-45, 0],
      },
      { at: "+0.03", duration: 0.12, ease: "easeOut" },
    ],
    [
      '[data-part="square-front"]',
      { y: [-4, 0] },
      { at: "<", duration: 0.12, ease: "easeOut" },
    ],
    [
      '[data-part="square-back"]',
      { x: [-4, 0] },
      { at: "<", duration: 0.12, ease: "easeOut" },
    ],
  ];

  const isFirstRender = useRef(true);
  const hasAnimatedIn = useRef(false);
  const inAnimation = useRef<ReturnType<typeof animate> | null>(null);
  const outAnimation = useRef<ReturnType<typeof animate> | null>(null);

  const animateIn = async () => {
    if (
      !inAnimation.current &&
      !outAnimation.current &&
      !hasAnimatedIn.current
    ) {
      const animation = animate(inSequence);
      inAnimation.current = animation;
      await animation;
      inAnimation.current = null;
      if (animation.speed === 1) hasAnimatedIn.current = true;
    } else if (outAnimation.current) {
      outAnimation.current.speed = -1;
    } else if (inAnimation.current) {
      inAnimation.current.speed = 1;
    }
  };

  const animateOut = async () => {
    if (inAnimation.current) {
      inAnimation.current.speed = -1;
    } else if (hasAnimatedIn.current && !outAnimation.current) {
      const animation = animate(outSequence);
      outAnimation.current = animation;
      await animation;
      outAnimation.current = null;
      if (animation.speed === 1) hasAnimatedIn.current = false;
    } else if (outAnimation.current) {
      outAnimation.current.speed = 1;
    }
  };

  useEffect(() => {
    if (isFirstRender.current) {
      isFirstRender.current = false;
      return;
    }
    if (copied) animateIn();
    else animateOut();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [copied]);

  useEffect(() => () => clearTimeout(timerRef.current), []);

  const handleCopy = async () => {
    if (copied) return;
    if (!(await onCopy())) return;
    setCopied(true);
    timerRef.current = setTimeout(() => setCopied(false), 1500);
  };

  return (
    <button
      className={`copy-button${copied ? " copied" : ""}`}
      aria-label={copied ? "Copied" : "Copy to clipboard"}
      // Selection contract: chrome inside the article is invisible to the
      // data-block text walker.
      aria-hidden="true"
      tabIndex={-1}
      onClick={handleCopy}
    >
      <svg
        ref={scope}
        style={{ overflow: "visible" }}
        width={20}
        height={20}
        viewBox="0 0 24 24"
        xmlns="http://www.w3.org/2000/svg"
        fill="none"
        aria-hidden="true"
      >
        <motion.rect
          data-part="square-front"
          x="4.75"
          y="8.75"
          width="10.5"
          height="10.5"
          rx="2"
          stroke="currentColor"
          strokeWidth="1.5"
        />
        <g mask={`url(#${maskId})`}>
          <motion.rect
            data-part="square-back"
            x="8.75"
            y="4.75"
            width="10.5"
            height="10.5"
            rx="2"
            stroke="currentColor"
            strokeWidth="1.5"
          />
        </g>
        <motion.path
          data-part="check"
          initial={{ pathLength: 0, opacity: 0 }}
          d="M9.25 12.25L11 14.25L15 10"
          stroke="currentColor"
          strokeWidth="1.5"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
        <mask id={maskId} maskUnits="userSpaceOnUse">
          <rect width="24" height="24" fill="#fff" />
          <motion.rect
            data-part="square-front"
            x="4.75"
            y="8.75"
            width="10.5"
            height="10.5"
            rx="2"
            fill="#000"
            stroke="#000"
            strokeWidth="1.5"
          />
        </mask>
      </svg>
    </button>
  );
}

// Wraps the static shiki-highlighted figure produced by rehype-pretty-code
// and floats a copy button over it. The copied text is read from the live
// <pre> so no raw-source attribute plumbing is needed.
export function CodeFigure({
  children,
  ...props
}: React.HTMLAttributes<HTMLElement> & { children?: ReactNode }) {
  const wrapperRef = useRef<HTMLDivElement>(null);

  const copy = async () => {
    const pre = wrapperRef.current?.querySelector("pre");
    if (!pre?.textContent) return false;
    try {
      await navigator.clipboard.writeText(pre.textContent);
      return true;
    } catch {
      return false;
    }
  };

  return (
    <div className="code-figure" ref={wrapperRef}>
      <figure {...props}>{children}</figure>
      <CopyButton onCopy={copy} />
    </div>
  );
}
