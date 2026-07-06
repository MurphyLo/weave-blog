"use client";

import { createContext, useContext, type ReactNode } from "react";

// Lets interactive islands used inside MDX (<LikeButton />, <ViewCounter />)
// pick up the current post's slug without explicit props.
const PostContext = createContext<string | null>(null);

export function PostProvider({
  slug,
  children,
}: {
  slug: string;
  children: ReactNode;
}) {
  return <PostContext.Provider value={slug}>{children}</PostContext.Provider>;
}

export function usePostSlug(): string {
  const slug = useContext(PostContext);
  if (!slug) {
    throw new Error("usePostSlug must be used inside a post page");
  }
  return slug;
}
