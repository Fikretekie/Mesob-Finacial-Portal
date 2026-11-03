import { getSiteConfig } from "utils/siteConfig";

// IRS business standard mileage rate, by the date the miles were driven.
// Newest first; add a row when the IRS announces a change. 2026 changed
// mid-year (72.5¢ → 76¢ from July 1, Announcement 2026-11).
const RATES = [
  ["2026-07-01", 0.76],
  ["2026-01-01", 0.725],
  ["2025-01-01", 0.7],
  ["2024-01-01", 0.67],
  ["2023-01-01", 0.655],
];

const todayKey = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
};

// Rates the owner adds in Site control (newer IRS announcements) win over the
// built-in table without an app update.
const allRates = () => {
  const extra = (getSiteConfig().app?.mileageRates || []).filter((r) => r && r.from && Number(r.rate) > 0).map((r) => [r.from, Number(r.rate)]);
  if (!extra.length) return RATES;
  const byDate = new Map(RATES);
  extra.forEach(([from, rate]) => byDate.set(from, rate));
  return [...byDate.entries()].sort((a, b) => (a[0] < b[0] ? 1 : -1));
};

export function rateFor(dateKey) {
  const rates = allRates();
  for (const [from, rate] of rates) {
    if (dateKey >= from) return rate;
  }
  return rates[rates.length - 1][1];
}

export const currentRate = () => rateFor(todayKey());

/** Deduction for this year's business trips, each at the rate in force on its date. */
export function yearDeduction(trips, year = new Date().getFullYear()) {
  return trips
    .filter((t) => t.type === "business" && String(t.dateKey).startsWith(String(year)))
    .reduce((sum, t) => sum + Number(t.miles || 0) * rateFor(t.dateKey), 0);
}

/** "$0.76" style label of today's rate. */
export function currentRateLabel() {
  const rate = currentRate();
  return `$${rate.toFixed(Math.round(rate * 1000) % 10 ? 3 : 2)}`;
}

/**
 * Trucking files IFTA (miles by state) and deducts actual vehicle costs — the
 * standard mileage rate doesn't apply to semi-trucks, so no deduction is shown.
 */
export const isTrucking = () => localStorage.getItem("businessType") === "Trucking";
