import fs from "node:fs";
import path from "node:path";
import matter from "gray-matter";
import { z } from "zod";

const POSTS_DIR = path.join(process.cwd(), "content", "posts");

/** A post is considered "new" for this many days after its publish date. */
const NEW_WINDOW_DAYS = 45;

const frontmatterSchema = z.object({
  title: z.string().min(1),
  date: z.coerce.date(),
  description: z.string().min(1),
  tags: z.array(z.string()).optional(),
  draft: z.boolean().default(false),
  math: z.boolean().default(false),
});

export interface PostMeta {
  slug: string;
  title: string;
  /** ISO date string (yyyy-mm-dd). */
  date: string;
  description: string;
  tags: string[];
  draft: boolean;
  math: boolean;
  isNew: boolean;
}

export interface Post {
  meta: PostMeta;
  /** MDX source with frontmatter stripped. */
  source: string;
}

function parsePostFile(filePath: string): Post {
  const slug = path.basename(filePath).replace(/\.mdx?$/, "");
  const raw = fs.readFileSync(filePath, "utf8");
  const { data, content } = matter(raw);
  const parsed = frontmatterSchema.safeParse(data);
  if (!parsed.success) {
    throw new Error(
      `Invalid frontmatter in ${filePath}: ${parsed.error.message}`,
    );
  }
  const fm = parsed.data;
  const ageDays = (Date.now() - fm.date.getTime()) / 86_400_000;
  return {
    meta: {
      slug,
      title: fm.title,
      date: fm.date.toISOString().slice(0, 10),
      description: fm.description,
      tags: fm.tags ?? [],
      draft: fm.draft,
      math: fm.math,
      isNew: ageDays >= 0 && ageDays <= NEW_WINDOW_DAYS,
    },
    source: content,
  };
}

export function getAllPosts(): PostMeta[] {
  if (!fs.existsSync(POSTS_DIR)) return [];
  return fs
    .readdirSync(POSTS_DIR)
    .filter((f) => /\.mdx?$/.test(f))
    .map((f) => parsePostFile(path.join(POSTS_DIR, f)).meta)
    .filter((meta) => process.env.NODE_ENV !== "production" || !meta.draft)
    .sort((a, b) => b.date.localeCompare(a.date));
}

export function getPost(slug: string): Post | null {
  for (const ext of [".mdx", ".md"]) {
    const filePath = path.join(POSTS_DIR, `${slug}${ext}`);
    if (fs.existsSync(filePath)) {
      const post = parsePostFile(filePath);
      if (process.env.NODE_ENV === "production" && post.meta.draft) {
        return null;
      }
      return post;
    }
  }
  return null;
}

export function postsByYear(): { year: number; posts: PostMeta[] }[] {
  const groups = new Map<number, PostMeta[]>();
  for (const post of getAllPosts()) {
    const year = Number(post.date.slice(0, 4));
    const list = groups.get(year) ?? [];
    list.push(post);
    groups.set(year, list);
  }
  return [...groups.entries()]
    .sort(([a], [b]) => b - a)
    .map(([year, posts]) => ({ year, posts }));
}
