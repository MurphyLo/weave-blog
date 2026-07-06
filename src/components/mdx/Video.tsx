// Block-level video embed; data-atomic marks it as a single selectable unit.
export function Video({
  src,
  caption,
  poster,
  autoPlay = false,
}: {
  src: string;
  caption?: string;
  poster?: string;
  autoPlay?: boolean;
}) {
  return (
    <figure data-atomic="">
      <video
        src={src}
        poster={poster}
        controls={!autoPlay}
        playsInline
        autoPlay={autoPlay}
        muted={autoPlay}
        loop={autoPlay}
        preload="metadata"
      />
      {caption && <figcaption>{caption}</figcaption>}
    </figure>
  );
}
