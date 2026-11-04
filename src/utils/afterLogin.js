// "Sign in, then take me to X" — e.g. the phone app sends US users to
// /login?next=/customer/subscription on the website. The target survives the
// Google/Apple redirect round-trip in sessionStorage (same tab, same origin).
// Only in-app customer paths are accepted, so ?next= can't redirect off-site.
const KEY = "mksv-next";

const isSafe = (p) => typeof p === "string" && /^\/customer\/[A-Za-z0-9/_-]*$/.test(p);

export function rememberNextPath(path) {
  if (!isSafe(path)) return;
  try {
    sessionStorage.setItem(KEY, path);
  } catch (e) {
    // Storage blocked — the user just lands on the dashboard.
  }
}

export function takeNextPath(fallback) {
  try {
    const next = sessionStorage.getItem(KEY);
    sessionStorage.removeItem(KEY);
    if (isSafe(next)) return next;
  } catch (e) {
    // Storage blocked — fall through.
  }
  return fallback;
}

export function hasNextPath() {
  try {
    return isSafe(sessionStorage.getItem(KEY));
  } catch (e) {
    return false;
  }
}
