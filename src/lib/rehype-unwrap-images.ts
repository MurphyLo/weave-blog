import type { Element, ElementContent, Root } from "hast";
import { visit } from "unist-util-visit";

// Markdown images arrive as `p > img`. The img is rendered by the MDX
// component map as a block-level <figure data-atomic>, which is invalid
// inside <p> and would also make the paragraph a bogus text block for the
// selection walker. Replace image-only paragraphs with their images.
// Must run before rehype-data-block.
export default function rehypeUnwrapImages() {
  return (tree: Root) => {
    visit(tree, "element", (node: Element, index, parent) => {
      if (node.tagName !== "p" || !parent || index === undefined) return;
      const meaningful = node.children.filter(
        (child) => !(child.type === "text" && child.value.trim() === ""),
      );
      if (
        meaningful.length > 0 &&
        meaningful.every(
          (child): child is ElementContent =>
            child.type === "element" && child.tagName === "img",
        )
      ) {
        parent.children.splice(index, 1, ...meaningful);
      }
    });
  };
}
