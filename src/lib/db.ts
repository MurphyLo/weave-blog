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

export type PollVotes = Record<string, number>;

export async function getPollVotes(pollId: string): Promise<PollVotes> {
  const { results } = await (await db())
    .prepare("SELECT option_id, votes FROM poll_votes WHERE poll_id = ?")
    .bind(pollId)
    .all<{ option_id: string; votes: number }>();
  return Object.fromEntries(results.map((r) => [r.option_id, r.votes]));
}

export async function incrementPollVote(
  pollId: string,
  optionId: string,
): Promise<PollVotes> {
  await (await db())
    .prepare(
      `INSERT INTO poll_votes (poll_id, option_id, votes) VALUES (?, ?, 1)
       ON CONFLICT(poll_id, option_id) DO UPDATE SET votes = votes + 1`,
    )
    .bind(pollId, optionId)
    .run();
  return getPollVotes(pollId);
}
