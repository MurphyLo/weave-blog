import type { MDXComponents } from "mdx/types";
import type { ComponentPropsWithoutRef } from "react";

import { Chat } from "./Chat";
import { CodeFigure } from "@/components/article/CodeFigure";
import { CTACard } from "@/components/article/CTACard";
import { Notation } from "@/components/article/Notation";
import { SectionHeading } from "@/components/article/SectionHeading";
import { Demo } from "./Demo";
import { Figure } from "./Figure";
import { LikeButton } from "./LikeButton";
import { Poll } from "./Poll";
import { Video } from "./Video";
import { ViewCounter } from "./ViewCounter";

function Anchor({ href = "", children, ...props }: ComponentPropsWithoutRef<"a">) {
  const external = /^https?:\/\//.test(href);
  return (
    <a
      href={href}
      className="basic-link"
      target={external ? "_blank" : undefined}
      rel={external ? "noopener noreferrer" : undefined}
      {...props}
    >
      {children}
    </a>
  );
}

// Markdown ![alt](src "title") — unwrapped from its paragraph by
// rehype-unwrap-images, rendered as an atomic figure.
function MarkdownImage({ src = "", alt = "", title }: ComponentPropsWithoutRef<"img">) {
  return <Figure src={typeof src === "string" ? src : ""} alt={alt} caption={title} />;
}

// rehype-pretty-code wraps code fences in figure[data-rehype-pretty-code-figure];
// wrap those with the client copy-button chrome, leave other figures alone.
function FigureElement(props: ComponentPropsWithoutRef<"figure">) {
  if ("data-rehype-pretty-code-figure" in props) {
    return <CodeFigure {...props} />;
  }
  return <figure {...props} />;
}

export const mdxComponents: MDXComponents = {
  a: Anchor,
  img: MarkdownImage,
  figure: FigureElement,
  // Custom components available in every post without imports:
  Figure,
  Video,
  Demo,
  Notation,
  SectionHeading,
  Chat,
  CTACard,
  LikeButton,
  Poll,
  ViewCounter,
};
