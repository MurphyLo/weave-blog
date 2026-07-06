// Build-time content generation, run via pre{dev,build}:
// 1. src/lib/post-index.json — post metadata for code that may run in the
//    Cloudflare worker (API slug validation), where content/ is not on disk.
// 2. public/feed.xml, public/sitemap.xml, public/robots.txt — served as
//    plain static assets (OpenNext does not bundle force-static route
//    handler output into its incremental cache, so app routes 404 on the
//    worker; static assets sidestep that entirely).
import fs from "node:fs";
import path from "node:path";
import matter from "gray-matter";
import { Feed } from "feed";

// Keep in sync with src/lib/site.ts.
const SITE = {
  name: "Weave",
  description:
    "A personal blog focused on interaction and animation experiments.",
  url: "https://xinghan.me",
};

const root = process.cwd();
const postsDir = path.join(root, "content", "posts");

const posts = !fs.existsSync(postsDir)
  ? []
  : fs
      .readdirSync(postsDir)
      .filter((f) => /\.mdx?$/.test(f))
      .map((f) => {
        const { data } = matter(
          fs.readFileSync(path.join(postsDir, f), "utf8"),
        );
        return {
          slug: f.replace(/\.mdx?$/, ""),
          title: String(data.title ?? ""),
          date: new Date(data.date).toISOString().slice(0, 10),
          description: String(data.description ?? ""),
          draft: Boolean(data.draft),
        };
      })
      .filter((p) => !p.draft)
      .map(({ draft: _, ...p }) => p)
      .sort((a, b) => b.date.localeCompare(a.date));

fs.writeFileSync(
  path.join(root, "src", "lib", "post-index.json"),
  `${JSON.stringify(posts, null, 2)}\n`,
);

const feed = new Feed({
  title: SITE.name,
  description: SITE.description,
  id: SITE.url,
  link: SITE.url,
  language: "en",
  copyright: "",
  feedLinks: { rss: `${SITE.url}/feed.xml` },
});
for (const post of posts) {
  feed.addItem({
    title: post.title,
    id: `${SITE.url}/posts/${post.slug}`,
    link: `${SITE.url}/posts/${post.slug}`,
    description: post.description,
    date: new Date(`${post.date}T00:00:00.000Z`),
  });
}
fs.writeFileSync(path.join(root, "public", "feed.xml"), feed.rss2());

const urls = [
  `  <url><loc>${SITE.url}</loc><changefreq>weekly</changefreq><priority>1.0</priority></url>`,
  ...posts.map(
    (p) =>
      `  <url><loc>${SITE.url}/posts/${p.slug}</loc><lastmod>${p.date}</lastmod><changefreq>monthly</changefreq><priority>0.8</priority></url>`,
  ),
];
fs.writeFileSync(
  path.join(root, "public", "sitemap.xml"),
  `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls.join("\n")}\n</urlset>\n`,
);

fs.writeFileSync(
  path.join(root, "public", "robots.txt"),
  `User-Agent: *\nAllow: /\n\nSitemap: ${SITE.url}/sitemap.xml\n`,
);

console.log(
  `post-index.json + feed.xml + sitemap.xml + robots.txt: ${posts.length} post(s)`,
);
