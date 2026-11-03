import { isAppShell } from "utils/appShell";

// Appearance preference: "system" (follow the phone), "dark" or "light".
// Stored in localStorage "mksv-theme"; public/index.html applies it before
// first paint with the same rules. The app defaults to "system", the website
// to dark (its navbar toggle only flips dark/light).
const KEY = "mksv-theme";
const darkQuery = () =>
  typeof window !== "undefined" && window.matchMedia
    ? window.matchMedia("(prefers-color-scheme: dark)")
    : null;

export function getThemePref() {
  let stored = null;
  try {
    stored = localStorage.getItem(KEY);
  } catch (e) {
    // Storage blocked — fall through to the default.
  }
  if (stored === "dark" || stored === "light" || stored === "system") return stored;
  return isAppShell() ? "system" : "dark";
}

function resolve(pref) {
  if (pref !== "system") return pref;
  const q = darkQuery();
  return q && !q.matches ? "light" : "dark";
}

function apply() {
  document.documentElement.setAttribute("data-theme", resolve(getThemePref()));
}

export function setThemePref(pref) {
  try {
    localStorage.setItem(KEY, pref);
  } catch (e) {
    // The choice still applies for this session.
  }
  apply();
}

// Call once at startup: corrects the pre-paint guess and keeps "system" in
// step when the phone switches between light and dark.
export function initTheme() {
  apply();
  const q = darkQuery();
  if (!q) return;
  const onChange = () => {
    if (getThemePref() === "system") apply();
  };
  if (q.addEventListener) q.addEventListener("change", onChange);
  else if (q.addListener) q.addListener(onChange);
}
