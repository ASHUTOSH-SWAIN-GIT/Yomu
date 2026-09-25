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

  var theme = get("yomu-theme");
  var dark =
    theme === "dark" ||
    ((theme === "system" || !theme || ["light", "paper"].indexOf(theme) < 0) &&
      window.matchMedia("(prefers-color-scheme: dark)").matches);
  root.classList.toggle("dark", dark);
  root.classList.toggle("paper", theme === "paper");

  var reader = {};
  try {
    reader = JSON.parse(get("yomu-reader") || "{}") || {};
  } catch (e) {}
  var pick = function (value, allowed) {
    return allowed.indexOf(value) > 0 ? value : undefined; // index 0 = default
  };
  var font = pick(reader.font, ["serif", "sans"]);
  var size = pick(reader.size, ["m", "s", "l", "xl"]);
  var measure = pick(reader.measure, ["medium", "narrow", "wide"]);
  if (font) root.dataset.readerFont = font;
  if (size) root.dataset.readerSize = size;
  if (measure) root.dataset.readerMeasure = measure;
})();
