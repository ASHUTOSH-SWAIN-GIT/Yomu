import { type ClassValue, clsx } from "clsx";
import { extendTailwindMerge } from "tailwind-merge";

/** The named text sizes from index.css. Without this list tailwind-merge
 * reads `text-ui` as a colour and drops it next to `text-foreground`. */
const twMerge = extendTailwindMerge({
  extend: {
    theme: {
      text: [
        "micro",
        "caption",
        "meta",
        "ui",
        "prose",
        "lead",
        "heading",
        "title",
        "headline",
        "display",
      ],
    },
  },
});

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}
