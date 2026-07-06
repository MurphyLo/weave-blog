import { getCloudflareContext } from "@opennextjs/cloudflare";
import type { D1Database } from "@cloudflare/workers-types";

// Thin data-access layer over D1. Swapping the database later (e.g. to
// Postgres) should only touch this file.

export interface PostStats {
  views: number;
  likes: number;
}

async function db(): Promise<D1Database> {
  const { env } = await getCloudflareContext({ async: true });
  return env.DB;
}

export async function getStats(slug: string): Promise<PostStats> {
  const row = await (await db())
    .prepare("SELECT views, likes FROM post_stats WHERE slug = ?")
    .bind(slug)
    .first<PostStats>();
  return row ?? { views: 0, likes: 0 };
}

export async function incrementView(slug: string): Promise<PostStats> {
  const row = await (await db())
    .prepare(
      `INSERT INTO post_stats (slug, views, likes) VALUES (?, 1, 0)
       ON CONFLICT(slug) DO UPDATE SET views = views + 1
       RETURNING views, likes`,
    )
    .bind(slug)
    .first<PostStats>();
  return row ?? { views: 1, likes: 0 };
}

export async function incrementLike(slug: string): Promise<PostStats> {
  const row = await (await db())
    .prepare(
      `INSERT INTO post_stats (slug, views, likes) VALUES (?, 0, 1)
       ON CONFLICT(slug) DO UPDATE SET likes = likes + 1
       RETURNING views, likes`,
    )
    .bind(slug)
    .first<PostStats>();
  return row ?? { views: 0, likes: 1 };
}
