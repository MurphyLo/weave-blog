import GithubSlugger from "github-slugger";
import type { Root, Heading, PhrasingContent } from "mdast";
import { visit } from "unist-util-visit";

export interface TocHeading {
  depth: 2 | 3;
  text: string;
  /** Anchor id, matching what rehype-slug produces for the same text. */
  id: string;
}

function textOf(nodes: PhrasingContent[]): string {
  let out = "";
  for (const node of nodes) {
    if (node.type === "text" || node.type === "inlineCode") {
      out += node.value;
    } else if ("children" in node) {
      out += textOf(node.children as PhrasingContent[]);
    }
  }
  return out;
}

/**
 * Collects h2/h3 headings into `options.out` during compilation, so the
 * table of contents can be built at build time instead of by querying the
 * rendered DOM. Ids use github-slugger, the same slugger rehype-slug uses,
 * so anchors line up.
 */
export default function remarkTocHeadings(options: { out: TocHeading[] }) {
  return (tree: Root) => {
    const slugger = new GithubSlugger();
    visit(tree, "heading", (node: Heading) => {
      const text = textOf(node.children);
      // Keep the slugger in sync with rehype-slug, which slugs every
      // heading in document order — including depths we don't collect.
      const id = slugger.slug(text);
      if (node.depth === 2 || node.depth === 3) {
        options.out.push({ depth: node.depth, text, id });
      }
    });
  };
}
