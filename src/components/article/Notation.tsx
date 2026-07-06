"use client";

import { useState, useEffect, useRef, type ReactNode } from "react";
import { RoughNotation } from "react-rough-notation";

export function Notation({
  children,
  label,
  variant = "cursive",
  delay = 800,
}: {
  children: ReactNode;
  label: ReactNode;
  variant?: "cursive" | "neutral";
  delay?: number;
}) {
  const [show, setShow] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;

    let timer: ReturnType<typeof setTimeout> | undefined;
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          timer = setTimeout(() => setShow(true), delay);
          observer.disconnect();
        }
      },
      { threshold: 0.5 },
    );

    observer.observe(el);
    return () => {
      clearTimeout(timer);
      observer.disconnect();
    };
  }, [delay]);

  return (
    <div className="notation-wrapper" ref={ref}>
      <RoughNotation
        type="bracket"
        brackets={["right"]}
        show={show}
        color="rgba(0, 0, 0, 0.25)"
        strokeWidth={1.5}
        padding={[2, 6]}
        animationDuration={800}
      >
        {children}
      </RoughNotation>
      <div className="notation-label" data-variant={variant} aria-hidden="true">
        {label}
      </div>
    </div>
  );
}
