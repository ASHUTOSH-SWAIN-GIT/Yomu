// Applies the saved theme and reading preferences before the first paint, so
// the app never flashes the wrong theme. An external file (not inline)
// because the CSP allows scripts only from the app itself. Mirrors
// applyAppearance() in src/lib/appearance.ts: keep the two in step.
(function () {
  var root = document.documentElement;
  var get = function (key) {
    try {
      return window.localStorage.getItem(key);
    } catch (e) {
      return null;
    }
  };

  // The theme id, and whether it is a dark one (saved next to it, so this
  // file needs no list of themes). Unknown or "system" follows macOS.
  var theme = get("yomu-theme");
  var mode = get("yomu-theme-mode");
  var system = !theme || theme === "system";
  var dark = system
    ? window.matchMedia("(prefers-color-scheme: dark)").matches
    : mode
      ? mode === "dark"
      : theme === "dark";
  root.classList.toggle("dark", dark);
  if (!system && theme !== "light" && theme !== "dark") {
    root.dataset.theme = theme;
  }

  var reader = {};
  try {
    reader = JSON.parse(get("yomu-reader") || "{}") || {};
  } catch (e) {}
  var pick = function (value, allowed) {
    return allowed.indexOf(value) > 0 ? value : undefined; // index 0 = default
  };
  var font = pick(reader.font, ["sans", "serif"]);
  var size = pick(reader.size, ["m", "s", "l", "xl"]);
  var measure = pick(reader.measure, ["medium", "narrow", "wide"]);
  if (font) root.dataset.readerFont = font;
  if (size) root.dataset.readerSize = size;
  if (measure) root.dataset.readerMeasure = measure;
})();
