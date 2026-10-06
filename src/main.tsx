import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App";
// Self-hosted fonts (no network, CSP-safe): Inter for everything you read
// and use, IBM Plex Mono for code.
import "@fontsource-variable/inter/wght.css";
import "@fontsource-variable/inter/wght-italic.css";
import "@fontsource/ibm-plex-mono/400.css";
import "@fontsource/ibm-plex-mono/500.css";
import "./index.css";
import { logUncaughtErrors } from "./lib/log";
import { usesOverlayTitleBar } from "./lib/platform";

logUncaughtErrors();

// Before the first paint, so the sidebar never jumps when the title bar loads.
if (usesOverlayTitleBar())
  document.documentElement.classList.add("platform-mac");

ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
