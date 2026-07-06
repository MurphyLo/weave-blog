export function SectionHeading({ id, title }: { id?: string; title: string }) {
  return (
    <div data-heading="true" className="section-divider">
      <div className="section-hr">
        <hr />
      </div>
      <div className="section-heading">
        <span>
          <h1 id={id}>{title}</h1>
        </span>
      </div>
    </div>
  );
}
