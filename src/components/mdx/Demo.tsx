import type { ReactNode } from "react";

// Generic wrapper for interactive components embedded in posts. Guarantees
// the data-atomic contract (one selectable unit) so individual demos can't
// forget it, and applies the shared demo container spacing.
export function Demo({
  children,
  caption,
}: {
  children: ReactNode;
  caption?: string;
}) {
  return (
    <div className="fd-container" data-atomic="">
      <div className="fd-demo">{children}</div>
      {caption && (
        <p className="demo-caption" aria-hidden="true">
          {caption}
        </p>
      )}
    </div>
  );
}
