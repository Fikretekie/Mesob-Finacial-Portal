import { useEffect, useReducer } from "react";
import axios from "axios";
import { apiUrl, ROUTES } from "config/api";

// Runtime settings the owner can change from the console without a deploy.
// Defaults reproduce today's behaviour exactly, so if the SiteConfig route is
// missing or down the app behaves as if this file didn't exist.
export const SITE_DEFAULTS = {
  banner: {
    enabled: false,
    id: "",
    message: "",
    tone: "info",
    linkText: "",
    linkUrl: "",
    audience: "all",
    dismissible: true,
  },
  maintenance: {
    enabled: false,
    message: "We're making some improvements and will be back shortly.",
    until: "",
  },
  features: {
    signups: true,
    receipts: true,
    documents: true,
    mileage: true,
    ifta: true,
    connections: true,
    team: true,
    backups: true,
    // null = follow the REACT_APP_*_ENABLED build flag.
    plaid: null,
    square: null,
  },
  trialDays: 30,
  app: {
    minVersion: "",
    updateUrl: "https://play.google.com/store/apps/details?id=com.meksova.app",
    updateMessage: "A newer version of Meksova is required. Please update to continue.",
    // [{ from: "YYYY-MM-DD", rate: 0.76 }] -- added on top of the built-in IRS table.
    mileageRates: [],
  },
  support: { email: "", phone: "" },
  // Published policy text. An empty body means "use the built-in page".
  // Bumping `version` with requireAccept on asks every signed-in user to
  // accept again before continuing.
  policies: {
    terms: { title: "Terms of Use", version: "", effectiveDate: "", summary: "", body: "", requireAccept: false },
    privacy: { title: "Privacy Policy", version: "", effectiveDate: "", summary: "", body: "", requireAccept: false },
  },
  updatedAt: "",
  updatedBy: "",
};

const CACHE_KEY = "mksv_site_config";
const POLL_MS = 5 * 60 * 1000;

const merge = (base, over) => {
  if (!over || typeof over !== "object") return base;
  const out = { ...base };
  Object.keys(over).forEach((k) => {
    const b = base[k];
    out[k] = b && typeof b === "object" && !Array.isArray(b) ? { ...b, ...(over[k] || {}) } : over[k];
  });
  return out;
};

const readCache = () => {
  try {
    return JSON.parse(localStorage.getItem(CACHE_KEY) || "null");
  } catch (e) {
    return null;
  }
};

let current = merge(SITE_DEFAULTS, readCache());
// "unknown" until the first fetch; "live" when the route answered; "offline"
// when it didn't (route not deployed yet, or network).
let status = "unknown";
let started = false;
const listeners = new Set();

const publish = (next, nextStatus) => {
  if (next) {
    current = merge(SITE_DEFAULTS, next);
    try {
      localStorage.setItem(CACHE_KEY, JSON.stringify(next));
    } catch (e) {}
  }
  if (nextStatus) status = nextStatus;
  listeners.forEach((fn) => fn());
};

export const getSiteConfig = () => current;
export const getSiteConfigStatus = () => status;

export async function refreshSiteConfig() {
  try {
    const res = await axios.get(apiUrl(ROUTES.SITE_CONFIG));
    const data = res.data?.config || res.data;
    publish(data && typeof data === "object" ? data : null, "live");
  } catch (e) {
    publish(null, "offline");
  }
  return current;
}

export async function saveSiteConfig(next) {
  const body = {
    ...next,
    updatedAt: new Date().toISOString(),
    updatedBy: localStorage.getItem("user_email") || "",
  };
  await axios.put(apiUrl(ROUTES.SITE_CONFIG), body);
  publish(body, "live");
  return body;
}

function startSync() {
  if (started || typeof window === "undefined") return;
  started = true;
  refreshSiteConfig();
  setInterval(refreshSiteConfig, POLL_MS);
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "visible") refreshSiteConfig();
  });
}

export function useSiteConfig() {
  const [, rerender] = useReducer((x) => x + 1, 0);
  useEffect(() => {
    listeners.add(rerender);
    startSync();
    return () => listeners.delete(rerender);
  }, []);
  return current;
}

export const isFeatureOn = (key, cfg = current) => cfg.features?.[key] !== false;

/** Compare dotted versions: -1 / 0 / 1. */
export function compareVersions(a, b) {
  const pa = String(a || "").split(".").map((n) => parseInt(n, 10) || 0);
  const pb = String(b || "").split(".").map((n) => parseInt(n, 10) || 0);
  for (let i = 0; i < Math.max(pa.length, pb.length); i += 1) {
    if ((pa[i] || 0) !== (pb[i] || 0)) return (pa[i] || 0) > (pb[i] || 0) ? 1 : -1;
  }
  return 0;
}
