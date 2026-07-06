import Link from "next/link";

import { postsByYear } from "@/lib/content";
import { AnnotationHighlight } from "./AnnotationHighlight";

function formatDate(dateStr: string) {
  const d = new Date(`${dateStr}T00:00:00.000Z`);
  return {
    day: String(d.getUTCDate()).padStart(2, "0"),
    month: String(d.getUTCMonth() + 1).padStart(2, "0"),
    year: d.getUTCFullYear(),
  };
}

export function PostList() {
  const grouped = postsByYear();
  if (grouped.length === 0) return null;

  return (
    <section>
      <section className="postList" data-variant="primary">
        <h3 className="postList-title">Writing</h3>
        <ul>
          {grouped.map(({ year, posts }) => (
            <li key={year}>
              <ul>
                {posts.map((post) => {
                  const { day, month, year: y } = formatDate(post.date);
                  return (
                    <li key={post.slug}>
                      <Link href={`/posts/${post.slug}`}>
                        <h2>
                          {post.title}
                          {post.isNew && (
                            <span
                              style={{
                                marginLeft: "0.5rem",
                                color: "rgb(255, 0, 170)",
                              }}
                            >
                              <AnnotationHighlight>New</AnnotationHighlight>
                            </span>
                          )}
                        </h2>
                        <time dateTime={`${post.date}T00:00:00.000Z`}>
                          <span>
                            {day}/{month}
                          </span>
                          <span>/</span>
                          <span>{y}</span>
                        </time>
                      </Link>
                    </li>
                  );
                })}
              </ul>
            </li>
          ))}
        </ul>
      </section>
    </section>
  );
}
