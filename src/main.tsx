import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App";
// Self-hosted fonts (no network, CSP-safe): Literata for reading, Hanken
// Grotesk for the interface, Fraunces for display headlines, IBM Plex Mono
// for code.
import "@fontsource-variable/literata/wght.css";
import "@fontsource-variable/literata/wght-italic.css";
import "@fontsource-variable/hanken-grotesk/wght.css";
import "@fontsource-variable/fraunces/wght.css";
import "@fontsource/ibm-plex-mono/400.css";
import "@fontsource/ibm-plex-mono/500.css";
import "./index.css";
import { usesOverlayTitleBar } from "./lib/platform";

// Before the first paint, so the sidebar never jumps when the title bar loads.
if (usesOverlayTitleBar())
  document.documentElement.classList.add("platform-mac");

ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
