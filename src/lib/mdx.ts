import { evaluate } from "next-mdx-remote-client/rsc";
import remarkGfm from "remark-gfm";
import remarkMath from "remark-math";
import rehypeKatex from "rehype-katex";
import rehypePrettyCode from "rehype-pretty-code";
import rehypeSlug from "rehype-slug";
import type { PluggableList } from "unified";

import { mdxComponents } from "@/components/mdx/mdx-components";
import rehypeDataBlock from "./rehype-data-block";
import rehypeUnwrapImages from "./rehype-unwrap-images";
import remarkTocHeadings, { type TocHeading } from "./remark-toc-headings";

export interface RenderedPost {
  content: React.JSX.Element;
  headings: TocHeading[];
}

export async function renderPost(
  source: string,
  { math = false }: { math?: boolean } = {},
): Promise<RenderedPost> {
  const headings: TocHeading[] = [];

  const rehypePlugins: PluggableList = [
    rehypeSlug,
    rehypeUnwrapImages,
    [rehypePrettyCode, { theme: "github-light", keepBackground: false }],
  ];
  if (math) rehypePlugins.push(rehypeKatex);
  // Must run last: it needs the final block structure (pretty-code figures,
  // expanded katex markup) to assign non-nesting data-block indices.
  rehypePlugins.push(rehypeDataBlock);

  const { content, error } = await evaluate({
    source,
    components: mdxComponents,
    options: {
      mdxOptions: {
        remarkPlugins: [
          remarkGfm,
          remarkMath,
          [remarkTocHeadings, { out: headings }],
        ],
        rehypePlugins,
      },
    },
  });

  if (error) throw error;

  return { content, headings };
}
