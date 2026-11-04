import axios from "axios";
import { apiUrl, ROUTES } from "config/api";
import { getCurrentBusinessId } from "utils/businessStorage";
import { fetchFuelPurchases } from "utils/fuelStorage";
import { isTrucking } from "utils/mileageRate";

// Bank charges (Plaid) vs expenses the user already recorded — a scanned
// receipt, a typed-in expense, an IFTA fuel purchase. A charge that matches is
// the same purchase seen twice; adding it again would double the expense.

const DAY_MS = 24 * 60 * 60 * 1000;
// Cards post a day or several after the purchase; rarely the day before (time zones).
const POSTS_UP_TO_DAYS_AFTER = 5;
const POSTS_UP_TO_DAYS_BEFORE = 1;

const dayOf = (value) => {
  if (!value) return null;
  // "2026-10-28" is a calendar day; read it as local midnight, not UTC.
  const d = /^\d{4}-\d{2}-\d{2}$/.test(value) ? new Date(`${value}T00:00:00`) : new Date(value);
  if (Number.isNaN(d.getTime())) return null;
  d.setHours(0, 0, 0, 0);
  return d.getTime();
};

const cents = (n) => Math.round(Math.abs(Number(n) || 0) * 100);

/** Recorded expenses, shaped for matching: { key, cents, day, purpose, source }. */
export function toCandidates(transactions = [], fuelPurchases = []) {
  const out = [];
  transactions.forEach((t) => {
    if (t.transactionType !== "Pay" && t.transactionType !== "New_Item") return;
    const day = dayOf(t.transactionDate || t.createdAt);
    if (day === null) return;
    out.push({
      key: `t:${t.id}`,
      cents: cents(t.transactionAmount),
      day,
      purpose: t.transactionPurpose || "",
      source: t.receiptUrl ? "receipt" : "expense",
    });
  });
  fuelPurchases.forEach((f, i) => {
    const day = dayOf(f.dateKey);
    const c = cents(f.totalCost);
    if (day === null || !c) return;
    // A scanned fuel receipt saves both a transaction and a fuel purchase: one purchase, not two.
    if (out.some((o) => o.cents === c && o.day === day)) return;
    out.push({ key: `f:${f.id || i}`, cents: c, day, purpose: "Fuel Expense", source: "fuel" });
  });
  return out;
}

/**
 * charges: Plaid rows { id, amount, date } (amount > 0 = money out).
 * Returns { [chargeId]: { purpose, source, day } } — each recorded expense
 * matches at most one charge, the one posted closest after it.
 */
export function matchCharges(charges = [], candidates = []) {
  const pairs = [];
  charges.forEach((ch) => {
    if (!(ch.amount > 0)) return;
    const chDay = dayOf(ch.date);
    if (chDay === null) return;
    const c = cents(ch.amount);
    candidates.forEach((cand) => {
      if (cand.cents !== c) return;
      const lag = (chDay - cand.day) / DAY_MS;
      if (lag < -POSTS_UP_TO_DAYS_BEFORE || lag > POSTS_UP_TO_DAYS_AFTER) return;
      pairs.push({ ch, cand, distance: Math.abs(lag) });
    });
  });
  pairs.sort((a, b) => a.distance - b.distance);
  const matches = {};
  const used = new Set();
  pairs.forEach(({ ch, cand }) => {
    if (matches[ch.id] || used.has(cand.key)) return;
    used.add(cand.key);
    matches[ch.id] = { purpose: cand.purpose, source: cand.source, day: cand.day };
  });
  return matches;
}

/** Loads this account's recorded expenses (and IFTA fuel purchases for trucking) and matches them. */
export async function loadChargeMatches(charges) {
  if (!charges?.some((ch) => ch.amount > 0)) return {};
  const userId = localStorage.getItem("userId");
  const businessId = getCurrentBusinessId();
  const params = businessId ? { userId, businessId } : { userId };
  const [txRes, fuel] = await Promise.all([
    axios.get(apiUrl(ROUTES.TRANSACTION), { params }).catch(() => ({ data: [] })),
    isTrucking() ? fetchFuelPurchases().catch(() => []) : Promise.resolve([]),
  ]);
  const transactions = Array.isArray(txRes.data) ? txRes.data : [];
  return matchCharges(charges, toCandidates(transactions, fuel));
}
