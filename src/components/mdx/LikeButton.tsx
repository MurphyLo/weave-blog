"use client";

import { useEffect, useState } from "react";
import { motion } from "motion/react";
import NumberFlow from "@number-flow/react";

import { usePostSlug } from "./PostProvider";

const ACCENT = "rgb(255, 0, 170)";

// Optimistic like button; "already liked" is remembered in localStorage
// (honor system — no auth on a personal blog).
export function LikeButton() {
  const slug = usePostSlug();
  const [likes, setLikes] = useState<number | null>(null);
  const [liked, setLiked] = useState(false);

  useEffect(() => {
    setLiked(localStorage.getItem(`liked:${slug}`) === "1");
    let cancelled = false;
    fetch(`/api/posts/${slug}/stats`)
      .then((res) => (res.ok ? res.json() : null))
      .then((stats: { likes: number } | null) => {
        if (!cancelled && stats) setLikes(stats.likes);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [slug]);

  const handleLike = () => {
    if (liked) return;
    setLiked(true);
    setLikes((n) => (n ?? 0) + 1);
    localStorage.setItem(`liked:${slug}`, "1");
    fetch(`/api/posts/${slug}/like`, { method: "POST" }).catch(() => {
      // Roll back on network failure so the count stays honest.
      setLiked(false);
      setLikes((n) => (n === null ? null : Math.max(0, n - 1)));
      localStorage.removeItem(`liked:${slug}`);
    });
  };

  return (
    <motion.button
      className="like-button"
      aria-hidden="true"
      tabIndex={-1}
      data-liked={String(liked)}
      onClick={handleLike}
      whileTap={{ scale: 0.92 }}
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: "0.375rem",
        color: liked ? ACCENT : "rgba(0, 0, 0, 0.4)",
        fontSize: "0.8125rem",
        fontWeight: 460,
        letterSpacing: "-0.0025rem",
        fontVariantNumeric: "tabular-nums",
        transition: "color 0.2s ease",
        cursor: liked ? "default" : "pointer",
      }}
    >
      <motion.span
        animate={liked ? { scale: [1, 1.35, 1] } : { scale: 1 }}
        transition={{ duration: 0.35, ease: "easeOut" }}
        style={{ display: "inline-flex" }}
      >
        <svg width="14" height="14" viewBox="0 0 16 16" fill="none">
          <path
            d="M8 14S2 10.5 2 6.5C2 4.5 3.5 3 5.5 3 6.7 3 7.7 3.6 8 4.4 8.3 3.6 9.3 3 10.5 3 12.5 3 14 4.5 14 6.5 14 10.5 8 14 8 14Z"
            fill={liked ? ACCENT : "none"}
            stroke="currentColor"
            strokeWidth="1.3"
            strokeLinejoin="round"
          />
        </svg>
      </motion.span>
      <span style={{ opacity: likes === null ? 0 : 1, transition: "opacity 0.3s ease" }}>
        <NumberFlow value={likes ?? 0} />
      </span>
    </motion.button>
  );
}
