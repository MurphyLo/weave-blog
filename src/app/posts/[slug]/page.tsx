import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { ArticleLayout } from "@/components/article/ArticleLayout";
import { LikeButton } from "@/components/mdx/LikeButton";
import { PostProvider } from "@/components/mdx/PostProvider";
import { ViewCounter } from "@/components/mdx/ViewCounter";
import { getAllPosts, getPost } from "@/lib/content";
import { renderPost } from "@/lib/mdx";

import "katex/dist/katex.min.css";

// Post pages must always be fully static; fail the build otherwise.
export const dynamic = "error";
export const dynamicParams = false;

export function generateStaticParams() {
  return getAllPosts().map(({ slug }) => ({ slug }));
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await params;
  const post = getPost(slug);
  if (!post) return {};
  return {
    title: post.meta.title,
    description: post.meta.description,
    openGraph: {
      title: post.meta.title,
      description: post.meta.description,
      type: "article",
      publishedTime: post.meta.date,
    },
  };
}

function formatDisplayDate(dateStr: string) {
  return new Date(`${dateStr}T00:00:00.000Z`).toLocaleDateString("en-US", {
    year: "numeric",
    month: "short",
    day: "numeric",
    timeZone: "UTC",
  });
}

export default async function PostPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const post = getPost(slug);
  if (!post) notFound();

  const { content, headings } = await renderPost(post.source, {
    math: post.meta.math,
  });

  return (
    <PostProvider slug={slug}>
      <ArticleLayout title={post.meta.title} headings={headings}>
        <header>
          <h1>{post.meta.title}</h1>
          <div className="post-meta-row">
            <time dateTime={post.meta.date}>
              {formatDisplayDate(post.meta.date)}
            </time>
            <span className="post-meta-stats" aria-hidden="true">
              <ViewCounter />
              <LikeButton />
            </span>
          </div>
        </header>
        {content}
      </ArticleLayout>
    </PostProvider>
  );
}
