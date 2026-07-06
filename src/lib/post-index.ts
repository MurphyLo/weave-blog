import posts from "./post-index.json";

// Build-time content index (see scripts/gen-content-index.mjs). Safe to use
// from code that runs in the worker, unlike the fs-based src/lib/content.ts.

export interface IndexedPost {
  slug: string;
  title: string;
  date: string;
  description: string;
}

export const POST_INDEX: IndexedPost[] = posts;

const SLUG_SET = new Set(POST_INDEX.map((p) => p.slug));

export function isValidSlug(slug: string): boolean {
  return SLUG_SET.has(slug);
}
