"use client";

import { useEffect, useState } from "react";
import NumberFlow from "@number-flow/react";

import { usePostSlug } from "./PostProvider";

// Registers a view on mount and shows the running total.
// Full chain proof: static page → hydrated island → route handler → D1.
export function ViewCounter() {
  const slug = usePostSlug();
  const [views, setViews] = useState<number | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetch(`/api/posts/${slug}/view`, { method: "POST" })
      .then((res) => (res.ok ? res.json() : null))
      .then((stats: { views: number } | null) => {
        if (!cancelled && stats) setViews(stats.views);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [slug]);

  return (
    <span
      className="view-counter"
      aria-hidden="true"
      style={{
        fontVariantNumeric: "tabular-nums",
        opacity: views === null ? 0 : 1,
        transition: "opacity 0.3s ease",
      }}
    >
      <NumberFlow value={views ?? 0} /> views
    </span>
  );
}
