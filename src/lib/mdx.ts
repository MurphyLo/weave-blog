import { evaluate } from "next-mdx-remote-client/rsc";
import remarkFlexibleMarkers from "remark-flexible-markers";
import remarkFlexibleToc, { type TocItem } from "remark-flexible-toc";
import remarkGfm from "remark-gfm";
import remarkMath from "remark-math";
import rehypeKatex from "rehype-katex";
import rehypePrettyCode from "rehype-pretty-code";
import rehypeSlug from "rehype-slug";
import type { PluggableList } from "unified";

import { mdxComponents } from "@/components/mdx/mdx-components";
import rehypeAtomic from "./rehype-atomic";
import rehypeDataBlock from "./rehype-data-block";
import rehypeUnwrapImages from "./rehype-unwrap-images";

export interface TocHeading {
  depth: 2 | 3;
  /** Plain heading text. */
  text: string;
  /** Anchor id, matching what rehype-slug produces for the same text. */
  id: string;
}

export interface RenderedPost {
  content: React.JSX.Element;
  headings: TocHeading[];
}

export async function renderPost(
  source: string,
  { math = false }: { math?: boolean } = {},
): Promise<RenderedPost> {
  const toc: TocItem[] = [];

  const rehypePlugins: PluggableList = [
    rehypeSlug,
    rehypeUnwrapImages,
    [rehypePrettyCode, { theme: "github-light", keepBackground: false }],
  ];
  if (math) rehypePlugins.push(rehypeKatex);
  // Atomic marking needs the expanded katex markup; data-block must run
  // last so it sees the final block structure (pretty-code figures, atomic
  // roots) when assigning non-nesting indices.
  rehypePlugins.push(rehypeAtomic, rehypeDataBlock);

  const { content, error } = await evaluate({
    source,
    components: mdxComponents,
    options: {
      mdxOptions: {
        remarkPlugins: [
          remarkGfm,
          remarkMath,
          remarkFlexibleMarkers,
          // Slugs every heading before depth filtering, so anchors stay in
          // sync with rehype-slug even for depths the TOC drops.
          [remarkFlexibleToc, { tocRef: toc, maxDepth: 3 }],
        ],
        rehypePlugins,
      },
    },
  });

  if (error) throw error;

  const headings: TocHeading[] = toc
    .filter((item): item is TocItem & { depth: 2 | 3 } =>
      item.depth === 2 || item.depth === 3,
    )
    .map((item) => ({
      depth: item.depth,
      text: item.value,
      id: item.href.replace(/^#/, ""),
    }));

  return { content, headings };
}
