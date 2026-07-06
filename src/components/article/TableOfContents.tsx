"use client";

import { useState, useEffect, useRef } from "react";

import type { TocHeading } from "@/lib/remark-toc-headings";

// Ported from benji's TableOfContents, with one structural change: headings
// come as build-time props (extracted by remark-toc-headings) instead of
// being auto-discovered from the DOM, so the list is server-rendered.

const getOffsetTop = (el: Element) =>
  el.getBoundingClientRect().top + window.scrollY;

export function TableOfContents({
  title,
  headings,
  variant = "primary",
}: {
  title: string;
  headings: TocHeading[];
  variant?: string;
}) {
  const [activeId, setActiveId] = useState("");
  const [ready, setReady] = useState(false);
  const navRef = useRef<HTMLElement>(null);

  useEffect(() => {
    setReady(true);
  }, []);

  useEffect(() => {
    const ids = headings.map((h) => h.id);

    const handleScroll = () => {
      const bodyTop = document.body.getBoundingClientRect().top;
      const threshold = -bodyTop + 128 + window.innerHeight * 0.5;

      // Toggled directly on the DOM to avoid re-rendering on every scroll
      if (navRef.current) {
        const scrolled =
          navRef.current.getAttribute("data-scrolled") === "true";
        if (bodyTop < -100 && !scrolled) {
          navRef.current.setAttribute("data-scrolled", "true");
        } else if (scrolled && bodyTop > -100) {
          navRef.current.setAttribute("data-scrolled", "false");
        }
      }

      const els = ids
        .map((id) => document.getElementById(id))
        .filter((el): el is HTMLElement => el !== null);
      if (els.length === 0) return;

      let current = "";
      if (document.body.clientHeight < -bodyTop + window.innerHeight + 24) {
        // Within 24px of the bottom: force the last heading active
        current = els[els.length - 1].id;
      } else {
        for (const el of els) {
          if (threshold > getOffsetTop(el) + window.innerHeight * 0.5) {
            current = el.id;
          }
        }
      }
      setActiveId(current);
    };

    handleScroll();
    window.addEventListener("scroll", handleScroll, { passive: true });
    window.addEventListener("resize", handleScroll);
    return () => {
      window.removeEventListener("resize", handleScroll);
      window.removeEventListener("scroll", handleScroll);
    };
  }, [headings]);

  return (
    <div
      className="toc"
      aria-hidden="true"
      data-variant={variant}
      data-ready={String(ready)}
    >
      <nav ref={navRef}>
        <h2
          data-active={String(activeId === "")}
          onClick={() => window.scrollTo(0, 0)}
        >
          {title}
        </h2>
        <ul>
          {headings.map((heading) => (
            <li
              key={heading.id}
              data-active={String(activeId === heading.id)}
              data-depth={heading.depth}
            >
              <a href={`#${heading.id}`} tabIndex={-1}>
                {heading.text}
              </a>
            </li>
          ))}
        </ul>
      </nav>
    </div>
  );
}
