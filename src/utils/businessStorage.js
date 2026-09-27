import axios from "axios";
import { apiUrl, ROUTES } from "config/api";

const CURRENT_BUSINESS_ID_KEY = "currentBusinessId";
const DEFAULT_BUSINESS_TYPE_KEY = "defaultBusinessType";
const DEFAULT_COMPANY_NAME_KEY = "defaultCompanyName";

function currentUserId() {
  return localStorage.getItem("userId") || "anonymous";
}

/** Fetches the extra businesses (#2, #3, ...) this account has added.
 * The account's original/first business is NOT in this list -- it's
 * implicit, derived from the existing `businessType`/`companyName` on the
 * Users record, so existing accounts and their historical records need no
 * migration. Records saved with no businessId belong to that first business. */
export async function fetchBusinesses() {
  const userId = currentUserId();
  const res = await axios.get(apiUrl(ROUTES.BUSINESSES), { params: { userId } });
  return Array.isArray(res.data) ? res.data : [];
}

/** Adds a new business. Returns the saved business (with its businessId). */
export async function createBusiness(name, businessType) {
  const userId = currentUserId();
  const res = await axios.post(apiUrl(ROUTES.BUSINESSES), { userId, name, businessType });
  return res.data;
}

/** Updates any of the active business's own fields (name, businessType,
 * cashBalance, outstandingDebt, valueableItems) -- pass only what changed. */
export async function updateBusiness(businessId, fields) {
  const userId = currentUserId();
  await axios.put(apiUrl(ROUTES.BUSINESSES), { userId, businessId, ...fields });
}

/** Fetches the currently-active business's own record (name, businessType,
 * cashBalance, outstandingDebt, valueableItems), or null when the account's
 * first/default business is active (that one has no Businesses row --
 * callers should fall back to the existing Users-record fields). */
export async function fetchCurrentBusiness() {
  const id = getCurrentBusinessId();
  if (!id) return null;
  const list = await fetchBusinesses();
  return list.find((b) => b.businessId === id) || null;
}

export async function deleteBusiness(businessId) {
  const userId = currentUserId();
  await axios.delete(apiUrl(ROUTES.BUSINESSES), { params: { userId, businessId } });
}

/** The currently-selected business's ID, or "" for the account's first/
 * default business (the pre-existing one, no businessId tag needed). */
export function getCurrentBusinessId() {
  return localStorage.getItem(CURRENT_BUSINESS_ID_KEY) || "";
}

/** Call once on app load. The very first time this runs for an account, it
 * snapshots the account's original businessType/companyName into separate
 * "default" keys, since switching businesses overwrites the plain
 * businessType/companyName keys that the rest of the app already reads
 * everywhere -- this snapshot is how switching back to business #1 restores
 * the right values. */
export function ensureDefaultBusinessCaptured() {
  if (localStorage.getItem(DEFAULT_BUSINESS_TYPE_KEY)) return;
  if (getCurrentBusinessId()) return; // mid-switch already, don't snapshot the wrong values
  localStorage.setItem(DEFAULT_BUSINESS_TYPE_KEY, localStorage.getItem("businessType") || "");
  localStorage.setItem(DEFAULT_COMPANY_NAME_KEY, localStorage.getItem("companyName") || "");
}

/** Switches the active business: mirrors its type/name into the plain
 * businessType/companyName keys every existing screen already reads, then
 * reloads so the whole app picks it up. */
export function switchToBusiness(business) {
  ensureDefaultBusinessCaptured();
  localStorage.setItem(CURRENT_BUSINESS_ID_KEY, business.businessId);
  localStorage.setItem("businessType", business.businessType);
  localStorage.setItem("companyName", business.name);
  window.location.reload();
}

/** Switches back to the account's original/first business. */
export function switchToDefaultBusiness() {
  ensureDefaultBusinessCaptured();
  localStorage.removeItem(CURRENT_BUSINESS_ID_KEY);
  localStorage.setItem("businessType", localStorage.getItem(DEFAULT_BUSINESS_TYPE_KEY) || "");
  localStorage.setItem("companyName", localStorage.getItem(DEFAULT_COMPANY_NAME_KEY) || "");
  window.location.reload();
}

/** Display name for the account's first/default business (for the switcher's
 * "My Business" entry, separate from whichever business is active now). */
export function getDefaultBusinessName() {
  ensureDefaultBusinessCaptured();
  return localStorage.getItem(DEFAULT_COMPANY_NAME_KEY) || "My Business";
}