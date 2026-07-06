import Link from "next/link";

export default function NotFound() {
  return (
    <div className="container">
      <article className="article">
        <header>
          <h1>Not found</h1>
        </header>
        <p>This page doesn&apos;t exist.</p>
        <p>
          <Link className="basic-link" href="/">
            Back to the index
          </Link>
        </p>
      </article>
    </div>
  );
}
