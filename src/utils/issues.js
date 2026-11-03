import axios from "axios";
import { apiUrl, ROUTES, getEnv } from "config/api";

// Problems in the website, the phone app and the backend, grouped so one bug
// that hit 40 people is one issue, not 40 rows.

const QUEUE_KEY = "mksv_error_queue";
const DAY = 86400000;
const HOUR = 3600000;

/* ----------------------------------------------------- error reporter -- */

const releaseOf = () => process.env.REACT_APP_VERSION || "web";

function platformOf() {
  try {
    if (window.Capacitor?.isNativePlatform?.()) return "Android app";
  } catch (e) {}
  return /Mobi|Android|iPhone/i.test(navigator.userAgent) ? "Mobile web" : "Web";
}

function queue(report) {
  try {
    const list = JSON.parse(localStorage.getItem(QUEUE_KEY) || "[]");
    list.unshift(report);
    localStorage.setItem(QUEUE_KEY, JSON.stringify(list.slice(0, 50)));
  } catch (e) {}
}

let lastSig = "";
function send(kind, message, stack) {
  const msg = String(message || "Unknown error").slice(0, 300);
  // Browser-extension and cross-origin noise carries no information.
  if (/^Script error\.?$/i.test(msg) || /ResizeObserver loop/i.test(msg)) return;
  const sig = `${msg}|${location.pathname}`;
  if (sig === lastSig) return;
  lastSig = sig;
  const report = {
    kind,
    message: msg,
    stack: String(stack || "").slice(0, 2000),
    page: location.pathname,
    platform: platformOf(),
    release: releaseOf(),
    env: getEnv(),
    userId: localStorage.getItem("userId") || "",
    at: new Date().toISOString(),
    ua: navigator.userAgent.slice(0, 200),
  };
  queue(report);
  axios.post(apiUrl(`${ROUTES.ADMIN_DATA}/errors`), report).catch(() => {});
}

/** Call once at start-up: every uncaught error in the app reports itself. */
export function installErrorReporter() {
  if (typeof window === "undefined" || window.__mksvErrors) return;
  window.__mksvErrors = true;
  window.addEventListener("error", (e) => send("error", e.message, e.error?.stack));
  window.addEventListener("unhandledrejection", (e) => {
    const r = e.reason;
    // Failed API calls are tracked server-side; only report real code errors.
    if (r?.isAxiosError) return;
    send("promise", r?.message || String(r), r?.stack);
  });
}

/** Errors captured in this browser, grouped into issues (shown before the backend exists). */
export function localIssues() {
  let list = [];
  try {
    list = JSON.parse(localStorage.getItem(QUEUE_KEY) || "[]");
  } catch (e) {}
  const groups = new Map();
  list.forEach((r) => {
    const key = `${r.message}|${r.page}`;
    const g = groups.get(key) || { id: `local-${groups.size}`, title: r.message, source: "frontend", platform: r.platform, area: r.page, message: r.message, stack: r.stack, page: r.page, release: r.release, firstSeen: r.at, lastSeen: r.at, count: 0, users: new Set(), status: "new", assignee: "", priority: "normal", notes: [], trend: Array(14).fill(0), captured: true };
    g.count += 1;
    if (r.userId) g.users.add(r.userId);
    if (r.at < g.firstSeen) g.firstSeen = r.at;
    if (r.at > g.lastSeen) g.lastSeen = r.at;
    groups.set(key, g);
  });
  return [...groups.values()].map((g) => ({ ...g, users: g.users.size || 1 }));
}

/* ---------------------------------------------------------- demo seed -- */

const trend = (peakAt, size) => Array.from({ length: 14 }, (_, i) => (i >= peakAt ? Math.round(size * (0.4 + ((i * 7) % 5) / 6)) : (i * 3) % 2));

export function seedIssues(now) {
  const iso = (ms) => new Date(now - ms).toISOString();
  return [
    {
      id: "is1",
      title: "Mileage trip stops recording when the screen is off",
      source: "app",
      platform: "Android app",
      area: "Mileage tracker",
      feature: "mileage",
      message: "TypeError: Cannot read properties of null (reading 'coords')",
      stack: "TypeError: Cannot read properties of null (reading 'coords')\n    at onPosition (MileageTracker.js:212:31)\n    at Geolocation.watchPosition callback (capacitor-geolocation.js:88:9)",
      page: "/customer/mileage-tracker",
      release: "1.6.0 (Android)",
      firstSeen: iso(5 * DAY),
      lastSeen: iso(40 * 60000),
      count: 64,
      users: 23,
      status: "investigating",
      assignee: "daniel@meksova.com",
      priority: "urgent",
      notes: [{ by: "daniel@meksova.com", at: iso(2 * DAY), text: "Happens when Android revokes background location. Needs the foreground-service plugin." }],
      trend: trend(8, 9),
      tickets: 3,
    },
    {
      id: "is2",
      title: "Receipt scan times out",
      source: "backend",
      platform: "API",
      area: "Receipt scanning (ReceiptOcr Lambda)",
      feature: "receipts",
      message: "Task timed out after 30.03 seconds",
      stack: "REPORT RequestId: 8f1c… Duration: 30030.12 ms Billed Duration: 30000 ms Memory Size: 512 MB Max Memory Used: 211 MB\nStatus: timeout\nTextract AnalyzeExpense latency p95 = 28.4s",
      page: "POST /ReceiptOcr",
      release: "Lambda v42",
      firstSeen: iso(1 * DAY),
      lastSeen: iso(12 * 60000),
      count: 41,
      users: 17,
      status: "new",
      assignee: "",
      priority: "high",
      notes: [],
      trend: trend(11, 14),
      tickets: 1,
    },
    {
      id: "is3",
      title: "Download report button does nothing on iPhone Safari",
      source: "frontend",
      platform: "Mobile web",
      area: "Financial report",
      feature: null,
      message: "NotAllowedError: The request is not allowed by the user agent",
      stack: "NotAllowedError: The request is not allowed by the user agent\n    at saveFile (saveFile.js:41:12)\n    at handleDownload (DownloadReportModal.js:812:7)",
      page: "/customer/financial-report",
      release: "web 2026-11-01",
      firstSeen: iso(9 * DAY),
      lastSeen: iso(3 * HOUR),
      count: 12,
      users: 9,
      status: "fixing",
      assignee: "owner@meksova.com",
      priority: "normal",
      notes: [{ by: "owner@meksova.com", at: iso(1 * DAY), text: "Safari blocks downloads not started by a tap. Move the save into the click handler." }],
      trend: trend(4, 2),
      tickets: 2,
    },
    {
      id: "is4",
      title: "Plaid link fails for Chase accounts",
      source: "backend",
      platform: "API",
      area: "Bank connections (Plaid)",
      feature: "connections",
      message: "ITEM_LOGIN_REQUIRED",
      stack: "POST /Connections → Plaid /item/public_token/exchange\nerror_code: ITEM_LOGIN_REQUIRED\ninstitution: ins_56 (Chase)",
      page: "POST /Connections",
      release: "Lambda v18",
      firstSeen: iso(3 * DAY),
      lastSeen: iso(2 * HOUR),
      count: 7,
      users: 5,
      status: "new",
      assignee: "",
      priority: "high",
      notes: [],
      trend: trend(10, 2),
      tickets: 1,
    },
    {
      id: "is5",
      title: "Pricing page shows $29.99 in one place and $24.99 in another",
      source: "frontend",
      platform: "Web",
      area: "Subscribe screen",
      feature: null,
      message: "Content bug reported by customers",
      stack: "",
      page: "/customer/subscription",
      release: "web 2026-10-20",
      firstSeen: iso(14 * DAY),
      lastSeen: iso(2 * DAY),
      count: 4,
      users: 4,
      status: "fixed",
      assignee: "owner@meksova.com",
      priority: "normal",
      notes: [{ by: "owner@meksova.com", at: iso(2 * DAY), text: "Fixed in Site editor → Subscribe screen." }],
      trend: trend(2, 1),
      tickets: 0,
      fixedIn: "Site editor v3",
    },
  ];
}
