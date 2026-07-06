// Block-level image with optional caption. The wrapper carries data-atomic:
// the selection system treats the whole figure as one selectable unit.
export function Figure({
  src,
  alt = "",
  caption,
  width,
  height,
}: {
  src: string;
  alt?: string;
  caption?: string;
  width?: number;
  height?: number;
}) {
  return (
    <figure data-atomic="">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={src} alt={alt} width={width} height={height} loading="lazy" />
      {(caption ?? alt) && <figcaption>{caption ?? alt}</figcaption>}
    </figure>
  );
}
