import { useEffect } from "react";
import { useUiStore } from "@/stores/ui-store";

/**
 * Applies the current theme to the document root and keeps it in sync
 * with the OS preference when the theme is set to "system".
 */
export function useThemeEffect() {
  const theme = useUiStore((s) => s.theme);

  useEffect(() => {
    const root = window.document.documentElement;

    const applySystemTheme = () => {
      const prefersDark = window.matchMedia(
        "(prefers-color-scheme: dark)",
      ).matches;
      root.classList.toggle("dark", prefersDark);
    };

    if (theme === "system") {
      applySystemTheme();
      const media = window.matchMedia("(prefers-color-scheme: dark)");
      media.addEventListener("change", applySystemTheme);
      return () => media.removeEventListener("change", applySystemTheme);
    }

    root.classList.toggle("dark", theme === "dark");
  }, [theme]);
}
