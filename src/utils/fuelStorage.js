import axios from "axios";
import { apiUrl, ROUTES } from "config/api";
import { getCurrentBusinessId } from "utils/businessStorage";

function currentUserId() {
  return localStorage.getItem("userId") || "anonymous";
}

/** Fetches all fuel purchases for the current user + active business
 * from the backend. */
export async function fetchFuelPurchases() {
  const userId = currentUserId();
  const businessId = getCurrentBusinessId();
  const params = businessId ? { userId, businessId } : { userId };
  const res = await axios.get(apiUrl(ROUTES.FUEL_PURCHASE), { params });
  return Array.isArray(res.data) ? res.data : [];
}

/** Saves one fuel purchase to the backend, tagged with the active
 * business. Returns the saved record. */
export async function saveFuelPurchase(purchase) {
  const userId = currentUserId();
  const businessId = getCurrentBusinessId();
  const taggedPurchase = businessId ? { ...purchase, businessId } : purchase;
  const res = await axios.post(apiUrl(ROUTES.FUEL_PURCHASE), { userId, purchase: taggedPurchase });
  return res.data;
}

/** Fuel purchases within a given quarter (year + quarter 1-4), from an
 * already-fetched list. dateKey format: YYYY-MM-DD. */
export function getFuelPurchasesForQuarter(purchases, year, quarter) {
  const startMonth = (quarter - 1) * 3 + 1;
  const endMonth = startMonth + 2;
  return purchases.filter((p) => {
    const [y, m] = p.dateKey.split("-").map(Number);
    return y === year && m >= startMonth && m <= endMonth;
  });
}

/** Total gallons purchased per state, from an already-filtered list. */
export function getGallonsByState(purchases) {
  const totals = {};
  for (const p of purchases) {
    totals[p.state] = (totals[p.state] || 0) + p.gallons;
  }
  return totals;
}