"use client";

import { useRef } from "react";
import { motion } from "motion/react";

// Port of benji.org's MorphingIcon (deobfuscated from _next/static/chunks/104-*.js).
// Every icon is exactly 3 lines in a 14x14 viewBox; unused lines collapse to the
// center point (7,7) and are hidden, so any icon can morph into any other by
// animating the 3 line endpoints. Icons in the same group (e.g. the four arrows)
// share line shapes and morph by rotating the whole svg instead.

const EASE = [0.32, 0.72, 0, 1] as const

// A line collapsed to the exact center point is a hidden filler line
const isFiller = (line: Line) => line.x1 === 7 && line.y1 === 7 && line.x2 === 7 && line.y2 === 7

// Bake a rotation (around the icon center) into the line coordinates
const rotateLines = (lines: Line[], deg: number): Line[] => {
  if (deg === 0) return lines
  const rad = (deg * Math.PI) / 180
  const cos = Math.cos(rad)
  const sin = Math.sin(rad)
  const rotate = (x: number, y: number) => ({
    x: 7 + (x - 7) * cos - (y - 7) * sin,
    y: 7 + (x - 7) * sin + (y - 7) * cos,
  })
  return lines.map((line) => {
    const start = rotate(line.x1, line.y1)
    const end = rotate(line.x2, line.y2)
    return { x1: start.x, y1: start.y, x2: end.x, y2: end.y }
  })
}

const arrowLines = [
  { x1: 3, y1: 7, x2: 11, y2: 7 },
  { x1: 7, y1: 3, x2: 11, y2: 7 },
  { x1: 7, y1: 11, x2: 11, y2: 7 },
]

const chevronLines = [
  { x1: 7, y1: 7, x2: 7, y2: 7 },
  { x1: 5, y1: 3, x2: 9, y2: 7 },
  { x1: 5, y1: 11, x2: 9, y2: 7 },
]

const plusCrossLines = [
  { x1: 7, y1: 3, x2: 7, y2: 11 },
  { x1: 3, y1: 7, x2: 11, y2: 7 },
  { x1: 7, y1: 7, x2: 7, y2: 7 },
]

interface Line { x1: number; y1: number; x2: number; y2: number }
interface IconDef { group: string; lines: Line[]; rotation: number }

export const icons: Record<string, IconDef> = {
  'arrow-right': { group: 'arrow', lines: arrowLines, rotation: 0 },
  'arrow-down': { group: 'arrow', lines: arrowLines, rotation: 90 },
  'arrow-left': { group: 'arrow', lines: arrowLines, rotation: 180 },
  'arrow-up': { group: 'arrow', lines: arrowLines, rotation: 270 },
  'chevron-right': { group: 'chevron', lines: chevronLines, rotation: 0 },
  'chevron-down': { group: 'chevron', lines: chevronLines, rotation: 90 },
  'chevron-left': { group: 'chevron', lines: chevronLines, rotation: 180 },
  'chevron-up': { group: 'chevron', lines: chevronLines, rotation: 270 },
  plus: { group: 'plus-cross', lines: plusCrossLines, rotation: 0 },
  cross: { group: 'plus-cross', lines: plusCrossLines, rotation: 45 },
  check: {
    group: 'check',
    lines: [
      { x1: 2.5, y1: 7, x2: 5.5, y2: 10.5 },
      { x1: 5.5, y1: 10.5, x2: 11.5, y2: 4 },
      { x1: 7, y1: 7, x2: 7, y2: 7 },
    ],
    rotation: 0,
  },
  minus: {
    group: 'minus',
    lines: [
      { x1: 7, y1: 7, x2: 7, y2: 7 },
      { x1: 3, y1: 7, x2: 11, y2: 7 },
      { x1: 7, y1: 7, x2: 7, y2: 7 },
    ],
    rotation: 0,
  },
  play: {
    group: 'play',
    lines: [
      { x1: 4, y1: 3, x2: 4, y2: 11 },
      { x1: 4, y1: 11, x2: 11, y2: 7 },
      { x1: 4, y1: 3, x2: 11, y2: 7 },
    ],
    rotation: 0,
  },
  pause: {
    group: 'pause',
    lines: [
      { x1: 4.5, y1: 3.5, x2: 4.5, y2: 10.5 },
      { x1: 7, y1: 7, x2: 7, y2: 7 },
      { x1: 9.5, y1: 3.5, x2: 9.5, y2: 10.5 },
    ],
    rotation: 0,
  },
  menu: {
    group: 'menu',
    lines: [
      { x1: 2.5, y1: 4, x2: 11.5, y2: 4 },
      { x1: 2.5, y1: 7, x2: 11.5, y2: 7 },
      { x1: 2.5, y1: 10, x2: 11.5, y2: 10 },
    ],
    rotation: 0,
  },
  download: {
    group: 'download',
    lines: [
      { x1: 3.5, y1: 11, x2: 10.5, y2: 11 },
      { x1: 10, y1: 6, x2: 7, y2: 9 },
      { x1: 4, y1: 6, x2: 7, y2: 9 },
    ],
    rotation: 0,
  },
  upload: {
    group: 'upload',
    lines: [
      { x1: 3.5, y1: 11, x2: 10.5, y2: 11 },
      { x1: 4, y1: 8, x2: 7, y2: 5 },
      { x1: 10, y1: 8, x2: 7, y2: 5 },
    ],
    rotation: 0,
  },
  external: {
    group: 'external',
    lines: [
      { x1: 4, y1: 10, x2: 10, y2: 4 },
      { x1: 5.5, y1: 4, x2: 10, y2: 4 },
      { x1: 10, y1: 4, x2: 10, y2: 8.5 },
    ],
    rotation: 0,
  },
  more: {
    group: 'more',
    lines: [
      // Zero-length lines with round caps render as dots; the middle one is
      // nudged off (7,7) so it doesn't count as a hidden filler line
      { x1: 3.5, y1: 7, x2: 3.5, y2: 7 },
      { x1: 7, y1: 7.01, x2: 7, y2: 7.01 },
      { x1: 10.5, y1: 7, x2: 10.5, y2: 7 },
    ],
    rotation: 0,
  },
  asterisk: {
    group: 'asterisk',
    lines: [
      { x1: 7, y1: 2.5, x2: 7, y2: 11.5 },
      { x1: 3, y1: 4.5, x2: 11, y2: 9.5 },
      { x1: 3, y1: 9.5, x2: 11, y2: 4.5 },
    ],
    rotation: 0,
  },
  equals: {
    group: 'bars',
    lines: [
      { x1: 3, y1: 9, x2: 11, y2: 9 },
      { x1: 7, y1: 7, x2: 7, y2: 7 },
      { x1: 3, y1: 5, x2: 11, y2: 5 },
    ],
    rotation: 0,
  },
}

icons.arrow = icons["arrow-right"];

export function MorphingIcon({
  icon,
  size = 14,
  className,
  animate = true,
}: {
  icon: string;
  size?: number;
  className?: string;
  animate?: boolean;
}) {
  const prevIconRef = useRef<string | null>(null)
  const rotationRef = useRef(0)

  const def = icons[icon]
  const prev = prevIconRef.current ? icons[prevIconRef.current] : null

  if (!def) return null

  if (!animate) {
    return (
      <span className={className} style={{ display: 'inline-flex' }}>
        <svg
          width={size}
          height={size}
          viewBox="0 0 14 14"
          fill="none"
          style={{ display: 'block', overflow: 'visible', transform: `rotate(${def.rotation}deg)` }}
        >
          {def.lines.map((line, i) => (
            <line
              key={i}
              {...line}
              stroke="currentColor"
              strokeWidth="1.5"
              strokeLinecap="round"
              opacity={isFiller(line) ? 0 : 1}
            />
          ))}
        </svg>
      </span>
    )
  }

  let rotation: number;
  let lines: Line[];

  if (prev && prev.group === def.group) {
    // Same group: keep the line shapes and spin the whole svg the short way round
    let delta = def.rotation - prev.rotation
    if (delta > 180) delta -= 360
    else if (delta < -180) delta += 360
    rotation = rotationRef.current + delta
    lines = def.lines
  } else {
    // Different group: settle at the nearest full turn and bake the target
    // rotation into the coordinates so the lines morph instead of spinning
    rotation = Math.round(rotationRef.current / 360) * 360
    lines = rotateLines(def.lines, def.rotation)
  }

  rotationRef.current = rotation
  prevIconRef.current = icon

  return (
    <span className={className} style={{ display: 'inline-flex' }}>
      <motion.svg
        width={size}
        height={size}
        viewBox="0 0 14 14"
        fill="none"
        initial={false}
        animate={{ rotate: rotation }}
        transition={{ duration: 0.3, ease: EASE }}
        style={{ display: 'block', overflow: 'visible' }}
      >
        {lines.map((line, i) => (
          <motion.line
            key={i}
            stroke="currentColor"
            strokeWidth="1.5"
            strokeLinecap="round"
            initial={false}
            animate={{ ...line, opacity: isFiller(line) ? 0 : 1 }}
            transition={{ duration: 0.3, ease: EASE }}
          />
        ))}
      </motion.svg>
    </span>
  )
}
