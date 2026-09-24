// Single source of truth for the user's display currency across the app.
// The chosen currency is saved to the user record at signup and mirrored into
// localStorage on login / data load, so every screen can read it synchronously.

import { currencies } from "./currencies";

/** Currency code the user picked (e.g. "ETB"); falls back to USD. */
export function getCurrencyCode() {
  try {
    const c = localStorage.getItem("currency");
    if (c && currencies[c]) return c;
  } catch (e) {
    /* localStorage unavailable */
  }
  return "USD";
}

/** Symbol for the user's currency (e.g. "Br" for ETB, "$" for USD). */
export function currencySymbol() {
  const code = getCurrencyCode();
  return (currencies[code] && currencies[code].symbol) || "$";
}

/** Persist the user's currency (call after login / fetching the user record). */
export function setCurrencyFromUser(user) {
  try {
    const code = user && user.currency;
    if (code && currencies[code]) localStorage.setItem("currency", code);
  } catch (e) {
    /* ignore */
  }
}

/**
 * Format a number as money with the user's currency symbol.
 * @param {number|string} amount
 * @param {{decimals?: number}} [opts] decimals defaults to 2
 */
export function formatMoney(amount, opts = {}) {
  const decimals = opts.decimals != null ? opts.decimals : 2;
  const n = parseFloat(amount) || 0;
  return `${currencySymbol()}${n.toLocaleString("en-US", {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  })}`;
}
