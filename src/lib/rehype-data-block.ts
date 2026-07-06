import type { Element, Root } from "hast";
import type { Node } from "unist";
import { visit, SKIP } from "unist-util-visit";

/**
 * Selection-system contract (see ../../base project, hooks/useTextLayout.ts):
 *
 * - Layout is rebuilt from the rendered DOM by flat-walking every
 *   `[data-block]` element in document order and indexing its text into a
 *   flat character array. Blocks must therefore NEVER nest — a nested
 *   `[data-block]` would double-count its text. This plugin only marks
 *   leaf blocks and skips descending into marked nodes.
 * - `data-atomic` subtrees are treated as single selectable units
 *   (`closest("[data-atomic]")`). Custom MDX components (Figure, Video,
 *   Demo, …) are mdxJsxFlowElement nodes invisible to this plugin; they
 *   must self-mark `data-atomic` on their outermost rendered element.
 * - The walker ignores `aria-hidden="true"` subtrees. UI chrome living
 *   inside a block (e.g. a copy button inside a code figure) must either
 *   sit outside the `[data-block]` element or carry aria-hidden.
 * - Indices are sequential for debuggability, but the consumer only relies
 *   on document order, not on attribute values.
 *
 * Must run LAST in the rehype chain so it sees the final block structure
 * (after rehype-pretty-code wraps pre in figures, katex expands math, …).
 */

const CANDIDATES = new Set([
  "p",
  "h1",
  "h2",
  "h3",
  "h4",
  "h5",
  "h6",
  "li",
  "pre",
  "blockquote",
  "figcaption",
]);

function hasCandidateDescendant(node: Element): boolean {
  let found = false;
  visit(node, "element", (child: Element) => {
    if (child !== node && CANDIDATES.has(child.tagName)) {
      found = true;
      return SKIP;
    }
  });
  return found;
}

// MDX components whose rendered output self-marks data-atomic; their JSX
// children must not receive data-block (they'd end up nested inside the
// atomic unit at runtime).
const ATOMIC_COMPONENTS = new Set(["Figure", "Video", "Demo", "CTACard"]);

export default function rehypeDataBlock() {
  return (tree: Root) => {
    let n = 0;
    visit(tree, (node: Node) => {
      if (
        (node.type === "mdxJsxFlowElement" ||
          node.type === "mdxJsxTextElement") &&
        ATOMIC_COMPONENTS.has((node as { name?: string }).name ?? "")
      ) {
        return SKIP;
      }
      if (node.type !== "element") return;
      const el = node as Element;
      if (!CANDIDATES.has(el.tagName)) return;
      // e.g. blockquote > p, loose li > p: mark the inner block instead.
      if (hasCandidateDescendant(el)) return;
      el.properties["dataBlock"] = String(n++);
      return SKIP;
    });
  };
}
