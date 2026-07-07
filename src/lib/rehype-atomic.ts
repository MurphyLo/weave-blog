import type { Element, ElementContent, Root } from "hast";
import { visit, SKIP } from "unist-util-visit";

/**
 * Marks non-text content as atomic selection units (see
 * docs/selection-contract.md §2.2). Runs after rehype-katex and before
 * rehype-data-block:
 *
 * - inline math  → span.katex           gets data-atomic + data-raw="$…$"
 * - display math → .katex-display root  gets data-atomic + data-raw="$$…$$"
 * - tables       → <table>              gets data-atomic + data-raw=GFM table
 *
 * The selection walker emits one AtomicCharEntry per [data-atomic] element
 * instead of recursing into it, and `data-raw` is what a copy of the
 * selection yields for that unit. KaTeX's MathML half additionally gets
 * aria-hidden: without it the raw MathML text would leak into the flat
 * character index of the enclosing paragraph.
 */

function classList(el: Element): string[] {
  const cn = el.properties?.className;
  return Array.isArray(cn) ? cn.map(String) : typeof cn === "string" ? [cn] : [];
}

function textOf(node: ElementContent): string {
  if (node.type === "text") return node.value;
  if (node.type === "element") return node.children.map(textOf).join("");
  return "";
}

/** The original LaTeX source KaTeX preserves in its MathML annotation. */
function extractTex(el: Element): string | null {
  let tex: string | null = null;
  visit(el, "element", (child: Element) => {
    if (
      child.tagName === "annotation" &&
      child.properties?.encoding === "application/x-tex"
    ) {
      tex = child.children.map(textOf).join("").trim();
      return SKIP;
    }
  });
  return tex;
}

function hideMathml(el: Element) {
  visit(el, "element", (child: Element) => {
    if (classList(child).includes("katex-mathml")) {
      child.properties["ariaHidden"] = "true";
      return SKIP;
    }
  });
}

function tableToGfm(table: Element): string {
  const rows: string[][] = [];
  visit(table, "element", (el: Element) => {
    if (el.tagName === "tr") {
      const cells: string[] = [];
      for (const child of el.children) {
        if (
          child.type === "element" &&
          (child.tagName === "th" || child.tagName === "td")
        ) {
          cells.push(textOf(child).trim().replace(/\|/g, "\\|"));
        }
      }
      rows.push(cells);
      return SKIP;
    }
  });
  if (rows.length === 0) return "";
  const line = (cells: string[]) => `| ${cells.join(" | ")} |`;
  const sep = line(rows[0].map(() => "---"));
  return [line(rows[0]), sep, ...rows.slice(1).map(line)].join("\n");
}

export default function rehypeAtomic() {
  return (tree: Root) => {
    visit(tree, "element", (node: Element) => {
      const classes = classList(node);

      if (classes.includes("katex-display")) {
        const tex = extractTex(node);
        node.properties["dataAtomic"] = "";
        node.properties["dataAtomicKind"] = "math";
        if (tex) node.properties["dataRaw"] = `$$\n${tex}\n$$`;
        hideMathml(node);
        return SKIP;
      }

      // Inline math root. Display math is SKIPped above, so any .katex we
      // still reach here is a standalone inline formula.
      if (classes.includes("katex")) {
        const tex = extractTex(node);
        node.properties["dataAtomic"] = "";
        node.properties["dataAtomicKind"] = "math";
        if (tex) node.properties["dataRaw"] = `$${tex}$`;
        hideMathml(node);
        return SKIP;
      }

      if (node.tagName === "table") {
        node.properties["dataAtomic"] = "";
        node.properties["dataAtomicKind"] = "table";
        node.properties["dataRaw"] = tableToGfm(node);
        return SKIP;
      }
    });
  };
}
