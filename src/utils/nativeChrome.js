import { Capacitor, SystemBars, SystemBarsStyle } from "@capacitor/core";

// Edge-to-edge inside the app: the WebView draws behind the status and gesture
// bars, and the navbar/tab bar pad themselves with --safe-area-inset-*. This
// must run before DOMContentLoaded — Capacitor's SystemBars reads the viewport
// meta once at DOM ready to decide whether to stop padding the WebView.
export function initNativeChrome() {
  if (!Capacitor.isNativePlatform()) return;

  const meta = document.querySelector("meta[name=viewport]");
  if (meta && !meta.content.includes("viewport-fit=cover")) {
    meta.content += ", viewport-fit=cover";
  }

  // Status-bar icons follow the in-app theme, not the phone's system theme.
  const syncBars = () => {
    const light = document.documentElement.getAttribute("data-theme") === "light";
    SystemBars.setStyle({ style: light ? SystemBarsStyle.Light : SystemBarsStyle.Dark }).catch(() => {});
  };
  syncBars();
  new MutationObserver(syncBars).observe(document.documentElement, {
    attributes: true,
    attributeFilter: ["data-theme"],
  });
}
