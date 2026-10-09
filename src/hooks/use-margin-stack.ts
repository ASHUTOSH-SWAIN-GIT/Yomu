import { useLayoutEffect, type DependencyList, type RefObject } from "react";
import { stackShifts } from "@/lib/stack-layout";

/** Sent on the article when something in the margin moved by itself. */
export const RESTACK = "yomu:restack";

const GAP = 8;

/**
 * Keeps the notes in the right margin (comments, answers) from running into
 * each other. Each paragraph's notes sit level with their words, so a
 * paragraph with several long notes can reach into the next paragraph's.
 * This measures every note group (`[data-margin-stack]`), top to bottom, and
 * nudges each down just enough with a transform. It writes only transforms,
 * which change no sizes, so it cannot trigger itself.
 */
export function useMarginStack(
  articleRef: RefObject<HTMLElement | null>,
  enabled: boolean,
  deps: DependencyList,
) {
  useLayoutEffect(() => {
    const article = articleRef.current;
    if (!article) return;
    const stacks = () => [
      ...article.querySelectorAll<HTMLElement>("[data-margin-stack]"),
    ];

    const restack = () => {
      const groups = stacks();
      // Read where each would sit with no nudge, then apply the nudges.
      groups.forEach((g) => (g.style.transform = ""));
      if (!enabled) return;
      const boxes = groups.map((g) => {
        const r = g.getBoundingClientRect();
        return { top: r.top, height: r.height };
      });
      stackShifts(boxes, GAP).forEach((shift, i) => {
        if (shift > 0) groups[i].style.transform = `translateY(${shift}px)`;
      });
    };

    restack();
    const observer = new ResizeObserver(restack);
    observer.observe(article);
    stacks().forEach((g) => observer.observe(g));
    article.addEventListener(RESTACK, restack);
    return () => {
      observer.disconnect();
      article.removeEventListener(RESTACK, restack);
    };
    // The caller lists what changes the notes (see its call).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [articleRef, enabled, ...deps]);
}
