import type { ReactNode } from "react";

export function CTACard({
  href,
  children,
  meta,
}: {
  href: string;
  children: ReactNode;
  meta?: ReactNode;
}) {
  const external = /^https?:\/\//.test(href);
  return (
    <div style={{ marginTop: "2rem" }} data-atomic="">
      <a
        className="cta-card"
        data-type="default"
        target={external ? "_blank" : undefined}
        rel={external ? "noopener noreferrer" : undefined}
        href={href}
      >
        <div className="cta-content">
          <div>
            <span
              style={{ display: "inline-flex", alignItems: "center", gap: 12 }}
            >
              <span style={{ marginTop: 2 }}>
                {children}
                {meta && <span>{meta}</span>}
              </span>
            </span>
          </div>
          <div className="cta-external-icon">
            <svg
              width="14"
              height="14"
              viewBox="0 0 14 14"
              fill="none"
              xmlns="http://www.w3.org/2000/svg"
            >
              <path
                d="M10.6286 10.3714L10.6287 3.62874M10.6287 3.62874L3.88599 3.62871M10.6287 3.62874L2.5 11.5"
                stroke="currentColor"
              />
            </svg>
          </div>
        </div>
      </a>
    </div>
  );
}
