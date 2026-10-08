import axios from "axios";
import { apiUrl, ROUTES } from "config/api";
import { getCurrentBusinessId } from "utils/businessStorage";

function ownerId() {
  return localStorage.getItem("userId") || "anonymous";
}

/** Providers the Connections page offers. `envKey` is the REACT_APP_* flag that,
 * once set at build time, flips the provider from "coming soon" to live — that's
 * the single switch to throw when the Plaid / Square API keys are in. */
export const PROVIDERS = [
  {
    id: "plaid",
    kind: "bank",
    name: "Bank account",
    via: "Plaid",
    descKey: "connections.plaidDesc",
    envKey: "REACT_APP_PLAID_ENABLED",
  },
  {
    id: "square",
    kind: "pos",
    name: "Square POS",
    via: "Square",
    descKey: "connections.squareDesc",
    envKey: "REACT_APP_SQUARE_ENABLED",
  },
];

/** True once the API keys/flags for a provider are wired at build time. */
export function isProviderLive(provider) {
  try {
    return String(process.env[provider.envKey] || "").toLowerCase() === "true";
  } catch (e) {
    return false;
  }
}

/** Current connection status per provider for this account + active business.
 * Returns {} gracefully until the backend route is live. */
export async function fetchConnections() {
  try {
    const businessId = getCurrentBusinessId();
    const params = businessId ? { userId: ownerId(), businessId } : { userId: ownerId() };
    const res = await axios.get(apiUrl(ROUTES.CONNECTIONS), { params });
    // Expected shape: { plaid: {connected, institution, lastSync}, square: {...} }
    return res.data || {};
  } catch (err) {
    console.warn("fetchConnections failed (connections backend may not be live yet):", err?.message);
    return {};
  }
}

/** Kick off a provider connection. Once the API is wired this is where the
 * Plaid Link token exchange / Square OAuth redirect gets initiated; for now it
 * asks the backend to start the flow and returns whatever it provides. */
export async function startConnection(providerId) {
  const businessId = getCurrentBusinessId();
  const res = await axios.post(apiUrl(ROUTES.CONNECTIONS), {
    userId: ownerId(),
    provider: providerId,
    action: "start",
    ...(businessId ? { businessId } : {}),
  });
  return res.data; // e.g. { linkToken } (Plaid) or { redirectUrl } (Square)
}

/** Disconnect a provider. */
export async function disconnectProvider(providerId) {
  const businessId = getCurrentBusinessId();
  const res = await axios.delete(apiUrl(`${ROUTES.CONNECTIONS}/${providerId}`), {
    params: { userId: ownerId(), ...(businessId ? { businessId } : {}) },
  });
  return res.data;
}
export async function exchangePublicToken(providerId, publicToken) {
  const businessId = getCurrentBusinessId();
  const res = await axios.post(apiUrl(ROUTES.CONNECTIONS), {
    userId: ownerId(),
    provider: providerId,
    action: "exchange",
    publicToken,
    ...(businessId ? { businessId } : {}),
  });
  return res.data;
}
/** Pull newly available bank transactions since the last sync. */
export async function syncTransactions() {
  const res = await axios.get(apiUrl(`${ROUTES.CONNECTIONS}/sync`), {
    params: { userId: ownerId() },
  });
  return res.data; // { transactions: [...] }
}

/** Write the selected transactions into Meksova and clear the whole reviewed
 * batch (added + skipped) from the pending list, optionally flipping autoImportAll. */
export async function confirmTransactions(transactions, reviewedIds, autoImportAll) {
  const res = await axios.post(apiUrl(`${ROUTES.CONNECTIONS}/confirm`), {
    userId: ownerId(),
    transactions,
    reviewedIds,
    ...(typeof autoImportAll === "boolean" ? { autoImportAll } : {}),
  });
  return res.data;
}

// ── Square (POS) ─────────────────────────────────────────────────────────────
// Unlike Plaid, Square has no review screen: every Square payment is a business
// sale, so the backend writes them straight in as income. The OAuth flow returns
// to /customer/connections with a ?code= query param, which we exchange here.

/** Exchange the Square OAuth `code` (from the redirect back) for an access token. */
export async function exchangeSquareCode(code) {
  const businessId = getCurrentBusinessId();
  const res = await axios.post(apiUrl(ROUTES.CONNECTIONS), {
    userId: ownerId(),
    provider: "square",
    action: "exchange",
    code,
    ...(businessId ? { businessId } : {}),
  });
  return res.data;
}

/** Pull new Square payments since the last sync and write them in as income. */
export async function syncSquareTransactions() {
  const res = await axios.get(apiUrl(`${ROUTES.CONNECTIONS}/square-sync`), {
    params: { userId: ownerId() },
  });
  return res.data;
}