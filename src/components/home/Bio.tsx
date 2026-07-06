import { HashHighlight } from "@/components/article/HashHighlight";

// Placeholder bio — edit freely; structure and classes match the benji.org
// homepage article so the ported styles apply as-is.
export function Bio() {
  return (
    <article className="article">
      <HashHighlight />
      <header>
        <h1>Weave</h1>
        <time>Updated Jul 6, 2026</time>
      </header>
      <p>
        A personal blog focused on interaction and animation experiments —
        where reading, selecting and annotating text become interface
        expressions rather than system feedback.
      </p>
      <p>
        Posts are written in MDX and can embed images, video and live
        interactive components. The custom text-selection system from the{" "}
        <a
          className="basic-link"
          target="_blank"
          rel="noopener noreferrer"
          href="https://github.com"
        >
          weave
        </a>{" "}
        experiments will attach here as the default reading experience.
      </p>
      <p>
        You can reach me at{" "}
        <a className="basic-link" href="mailto:barnum@bnucrow.com">
          barnum@bnucrow.com
        </a>
        .
      </p>
    </article>
  );
}
