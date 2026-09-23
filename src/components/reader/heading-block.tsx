import type { JSX } from "react";

const SIZES: Record<number, string> = {
  1: "text-3xl font-semibold mt-8 mb-4",
  2: "text-2xl font-semibold mt-8 mb-3",
  3: "text-xl font-semibold mt-6 mb-3",
  4: "text-lg font-semibold mt-6 mb-2",
  5: "text-base font-semibold mt-4 mb-2",
  6: "text-sm font-semibold mt-4 mb-2",
};

export function HeadingBlock({ level, text }: { level: number; text: string }) {
  const Tag =
    `h${Math.min(Math.max(level, 1), 6)}` as keyof JSX.IntrinsicElements;
  const className = SIZES[level] ?? SIZES[2];
  return <Tag className={className}>{text}</Tag>;
}
