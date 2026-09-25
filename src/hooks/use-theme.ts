import { useEffect } from "react";
import { applyAppearance } from "@/lib/appearance";
import { useUiStore } from "@/stores/ui-store";

/**
 * Applies the theme and reading preferences to the document root, and
 * follows the OS light/dark setting while the theme is "system".
 * (`public/theme-init.js` does the same once before first paint.)
 */
export function useThemeEffect() {
  const theme = useUiStore((s) => s.theme);
  const reader = useUiStore((s) => s.reader);

  useEffect(() => {
    const media = window.matchMedia("(prefers-color-scheme: dark)");
    const apply = () =>
      applyAppearance(
        window.document.documentElement,
        theme,
        media.matches,
        reader,
      );
    apply();
    if (theme !== "system") return;
    media.addEventListener("change", apply);
    return () => media.removeEventListener("change", apply);
  }, [theme, reader]);
}
