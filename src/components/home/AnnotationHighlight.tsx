"use client";

import { useState, useEffect, type ReactNode } from "react";
import { RoughNotation } from "react-rough-notation";

export function AnnotationHighlight({
  children,
  type = "circle",
  color = "rgb(255, 0, 170)",
  delay = 800,
}: {
  children: ReactNode;
  type?: "circle" | "bracket" | "underline" | "highlight" | "box";
  color?: string;
  delay?: number;
}) {
  const [show, setShow] = useState(false);

  useEffect(() => {
    const timer = setTimeout(() => setShow(true), delay);
    return () => clearTimeout(timer);
  }, [delay]);

  return (
    <RoughNotation
      type={type}
      show={show}
      color={color}
      strokeWidth={1.5}
      padding={type === "circle" ? [2, 6] : [2, 0]}
      animationDuration={800}
    >
      {children}
    </RoughNotation>
  );
}
