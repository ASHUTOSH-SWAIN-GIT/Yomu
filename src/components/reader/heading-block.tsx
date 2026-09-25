import type { JSX } from "react";

// Sizes are in em, relative to the reader's chosen text size, so headings
// scale with it. Margins are half-gaps: neighbours add (see block-renderer). Tight leading and slight negative tracking suit larger type.
const SIZES: Record<number, string> = {
  1: "text-[1.75em] mt-[1.2em] mb-[0.1em]",
  2: "text-[1.45em] mt-[1.4em] mb-[0.1em]",
  3: "text-[1.2em] mt-[1.2em] mb-[0.1em]",
  4: "text-[1.05em] mt-[1em] mb-[0.05em]",
  5: "text-[1em] mt-[1em] mb-[0.05em]",
  6: "text-[1em] mt-[1em] mb-[0.05em]",
};

export function HeadingBlock({ level, text }: { level: number; text: string }) {
  const Tag =
    `h${Math.min(Math.max(level, 1), 6)}` as keyof JSX.IntrinsicElements;
  const size = SIZES[level] ?? SIZES[2];
  return (
    <Tag
      className={`${size} text-foreground leading-[1.25] font-semibold tracking-[-0.01em] text-balance`}
    >
      {text}
    </Tag>
  );
}
