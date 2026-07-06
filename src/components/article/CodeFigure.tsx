"use client";

import { useState, useEffect, useRef, type ReactNode } from "react";
import { MorphingIcon } from "./MorphingIcon";

function CopyButton({ onCopy }: { onCopy: () => Promise<boolean> }) {
  const [copied, setCopied] = useState(false);
  const timerRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

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
      <MorphingIcon icon={copied ? "check" : "plus"} size={16} />
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
