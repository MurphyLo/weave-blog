"use client";

import { useEffect } from "react";

// Briefly applies a .target class to the element referenced by the URL hash
// (or its enclosing paragraph), on load and on hash changes.
// Ported from benji/src/hooks/useHashHighlight.js; rendered as a component so
// server components can include the behavior without becoming clients.
export function HashHighlight() {
  useEffect(() => {
    const handleHashChange = () => {
      const hash = window.location.hash;
      if (!hash) return;

      let el: Element | null = null;
      try {
        el = document.querySelector(hash);
      } catch {
        return;
      }
      if (!el) return;

      let targetEl: Element = el;
      const isHeading = /^H[1-6]$/.test(el.tagName);
      if (el.tagName !== "P" && !isHeading) {
        targetEl = el.closest("p") || el;
      }

      targetEl.classList.add("target");
      setTimeout(() => {
        targetEl.classList.remove("target");
      }, 5000);
    };

    handleHashChange();
    window.addEventListener("hashchange", handleHashChange);
    return () => window.removeEventListener("hashchange", handleHashChange);
  }, []);

  return null;
}
