import type { ReactNode } from "react";

import type { TocHeading } from "@/lib/mdx";
import { SelectionRoot } from "@/selection/SelectionRoot";
import { BackButton } from "./BackButton";
import { HashHighlight } from "./HashHighlight";
import { TableOfContents } from "./TableOfContents";

export function ArticleLayout({
  title,
  headings,
  children,
}: {
  title: string;
  headings: TocHeading[];
  children: ReactNode;
}) {
  return (
    <div className="container agentation-container">
      <HashHighlight />
      <div className="article-layout">
        <aside className="article-aside">
          <BackButton />
          <TableOfContents title={title} headings={headings} />
        </aside>
        <main>
          <SelectionRoot>{children}</SelectionRoot>
        </main>
      </div>
    </div>
  );
}
