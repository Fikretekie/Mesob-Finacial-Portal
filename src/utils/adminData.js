import axios from "axios";
import { apiUrl, ROUTES } from "config/api";
import { isDemo, logAudit, NotConnectedError } from "utils/adminApi";
import { seedSiteContent } from "utils/siteContent";
import { seedIssues } from "utils/issues";

// Generic store for the console's newer sections (support, requests,
// automations, promotions, changelog, recycle bin, metrics). Live mode talks to
// one AdminData/{collection} route; demo mode uses the seeded data below.

const DAY = 86400000;
const HOUR = 3600000;
const wait = (ms = 250) => new Promise((r) => setTimeout(r, ms));
const iso = (ms) => new Date(ms).toISOString();

const PEOPLE = ["Abel Tesfaye", "Hana Girma", "Samuel Bekele", "Liya Haile", "Dawit Mekonnen", "Ruth Alemu", "Yonas Tadesse", "Meron Assefa", "Kidus Wolde", "Selam Getachew", "Biniam Kebede", "Tsion Desta"];
const person = (i) => ({ userId: `demo-${i}`, name: PEOPLE[i], email: `${PEOPLE[i].toLowerCase().replace(" ", ".")}@example.com` });

function seed() {
  const now = Date.now();

  const tickets = [
    { id: "t1", ...person(1), subject: "Can't connect my bank", status: "open", priority: "high", channel: "In-app", createdAt: iso(now - 3 * HOUR), assignee: "", messages: [{ from: "customer", at: iso(now - 3 * HOUR), text: "I tried to link Chase three times and it says 'something went wrong'. I need my transactions for my accountant this week." }] },
    { id: "t2", ...person(7), subject: "Charged but my account says unpaid", status: "open", priority: "urgent", channel: "Email", createdAt: iso(now - 26 * HOUR), assignee: "marta@meksova.com", messages: [{ from: "customer", at: iso(now - 26 * HOUR), text: "My card was charged $24.99 on the 1st but the app keeps telling me to subscribe." }, { from: "staff", by: "marta@meksova.com", at: iso(now - 20 * HOUR), text: "Sorry about that — I'm checking with billing now and will update you today." }] },
    { id: "t3", ...person(4), subject: "How do I export for taxes?", status: "pending", priority: "normal", channel: "In-app", createdAt: iso(now - 2 * DAY), assignee: "marta@meksova.com", messages: [{ from: "customer", at: iso(now - 2 * DAY), text: "Where is the year-end report?" }, { from: "staff", by: "marta@meksova.com", at: iso(now - 47 * HOUR), text: "Financial Report → Download → Year-end summary. Does that give you what you need?" }] },
    { id: "t4", ...person(9), subject: "Mileage tracker stopped counting", status: "open", priority: "high", channel: "App", createdAt: iso(now - 5 * HOUR), assignee: "", messages: [{ from: "customer", at: iso(now - 5 * HOUR), text: "On Android the trip stopped at 2.1 miles even though I drove 18." }] },
    { id: "t5", ...person(2), subject: "Add a second business", status: "resolved", priority: "low", channel: "Email", createdAt: iso(now - 6 * DAY), assignee: "daniel@meksova.com", messages: [{ from: "customer", at: iso(now - 6 * DAY), text: "Can I track my food truck separately?" }, { from: "staff", by: "daniel@meksova.com", at: iso(now - 6 * DAY + 2 * HOUR), text: "Yes — Account → Businesses → Add business. Each one has its own reports." }] },
  ];

  const requests = [
    { id: "r1", type: "delete", ...person(10), status: "pending", reason: "Switching to another app", createdAt: iso(now - 2 * DAY), dueAt: iso(now + 28 * DAY) },
    { id: "r2", type: "export", ...person(5), status: "pending", reason: "Need everything for my accountant", createdAt: iso(now - 6 * HOUR), dueAt: iso(now + 30 * DAY) },
    { id: "r3", type: "delete", ...person(11), status: "completed", reason: "", createdAt: iso(now - 20 * DAY), completedAt: iso(now - 18 * DAY), dueAt: iso(now + 10 * DAY), handledBy: "owner@meksova.com" },
    { id: "r4", type: "export", ...person(3), status: "completed", reason: "", createdAt: iso(now - 9 * DAY), completedAt: iso(now - 9 * DAY + 3 * HOUR), dueAt: iso(now + 21 * DAY), handledBy: "marta@meksova.com" },
  ];

  const automations = [
    { id: "welcome", name: "Welcome", trigger: "signup", delayDays: 0, channels: ["email"], enabled: true, subject: "Welcome to Meksova", body: "Here's how to add your first transaction in under a minute.", sent30: 41, opened30: 0.68 },
    { id: "trial7", name: "Trial check-in", trigger: "trial_day", delayDays: 7, channels: ["email", "push"], enabled: true, subject: "How's your first week?", body: "Tip: scan a receipt and Meksova fills in the amount for you.", sent30: 33, opened30: 0.51 },
    { id: "trial25", name: "Trial ending", trigger: "trial_ends_in", delayDays: 5, channels: ["email", "push"], enabled: true, subject: "Your trial ends in 5 days", body: "Pick a plan to keep your records, reports and receipts.", sent30: 22, opened30: 0.62 },
    { id: "dunning", name: "Payment failed", trigger: "payment_failed", delayDays: 0, channels: ["email"], enabled: true, subject: "We couldn't process your payment", body: "Update your card in Account → Subscription to avoid interruption.", sent30: 3, opened30: 0.83 },
    { id: "winback", name: "We miss you", trigger: "inactive_days", delayDays: 14, channels: ["email"], enabled: false, subject: "Your books are waiting", body: "It only takes a minute to catch up on last week's receipts.", sent30: 0, opened30: 0 },
    { id: "yearend", name: "Year-end summary", trigger: "date", date: "2027-01-05", delayDays: 0, channels: ["email"], enabled: false, subject: "Your 2026 summary is ready", body: "Download your year-end report for tax time.", sent30: 0, opened30: 0 },
  ];

  const promos = [
    { id: "p1", code: "DRIVER20", kind: "percent", value: 20, duration: "3 months", maxUses: 200, used: 64, expiresAt: "2026-12-31", active: true, createdAt: iso(now - 40 * DAY) },
    { id: "p2", code: "TRUCKER1", kind: "free_months", value: 1, duration: "once", maxUses: 100, used: 18, expiresAt: "2027-03-31", active: true, createdAt: iso(now - 15 * DAY) },
    { id: "p3", code: "LAUNCH50", kind: "percent", value: 50, duration: "once", maxUses: 500, used: 500, expiresAt: "2026-09-30", active: false, createdAt: iso(now - 120 * DAY) },
  ];
  const referral = { enabled: true, reward: "1 free month for both", referred30: 14, converted30: 6 };

  const changelog = [
    { id: "c1", version: "1.6.0", title: "Drives to review", body: "Meksova now notices drives on its own and asks you to classify them as business or personal.", tag: "New", status: "published", publishedAt: iso(now - 4 * DAY), platforms: ["app"] },
    { id: "c2", version: "1.5.2", title: "Faster receipt scanning", body: "Receipts are read in about half the time, and totals with tips are picked up correctly.", tag: "Improved", status: "published", publishedAt: iso(now - 18 * DAY), platforms: ["web", "app"] },
    { id: "c3", version: "1.6.1", title: "IFTA PDF export", body: "Download your quarterly IFTA report as a PDF ready to file.", tag: "New", status: "draft", publishedAt: null, platforms: ["web", "app"] },
  ];

  const recycle = [
    { id: "x1", kind: "transaction", ...person(3), label: "Fuel — Shell", amount: 62.4, deletedAt: iso(now - 1 * DAY), purgeAt: iso(now + 29 * DAY) },
    { id: "x2", kind: "transaction", ...person(3), label: "Client payment — Uber", amount: 418.25, deletedAt: iso(now - 1 * DAY), purgeAt: iso(now + 29 * DAY) },
    { id: "x3", kind: "receipt", ...person(6), label: "Home Depot receipt (photo)", amount: 129.88, deletedAt: iso(now - 3 * DAY), purgeAt: iso(now + 27 * DAY) },
    { id: "x4", kind: "business", ...person(2), label: "Business: Bekele Food Truck (34 transactions)", amount: null, deletedAt: iso(now - 8 * DAY), purgeAt: iso(now + 22 * DAY) },
    { id: "x5", kind: "document", ...person(8), label: "2025 Schedule C.pdf", amount: null, deletedAt: iso(now - 12 * DAY), purgeAt: iso(now + 18 * DAY) },
    { id: "x6", kind: "transaction", ...person(0), label: "Insurance — Progressive", amount: 182, deletedAt: iso(now - 27 * DAY), purgeAt: iso(now + 3 * DAY) },
  ];

  // 12 months of revenue, newest last.
  const months = Array.from({ length: 12 }, (_, i) => {
    const d = new Date(now);
    d.setDate(1);
    d.setMonth(d.getMonth() - (11 - i));
    const paying = Math.round(38 + i * 6.5 + (i % 3) * 2);
    return { month: d.toISOString().slice(0, 7), mrr: Math.round(paying * 24.99 * 100) / 100, paying, newPaid: 6 + (i % 4) * 2, churned: 1 + (i % 3), refunds: i % 5 === 0 ? 1 : 0 };
  });
  const cancelReasons = [
    { reason: "Too expensive", n: 9 },
    { reason: "Switched to another app", n: 6 },
    { reason: "Stopped driving / closed business", n: 5 },
    { reason: "Missing a feature", n: 4 },
    { reason: "Other / no answer", n: 7 },
  ];

  const usage = {
    dau: Array.from({ length: 30 }, (_, i) => Math.round(48 + i * 0.9 + ((i * 7) % 11) - (i % 7 === 0 ? 12 : 0))),
    wau: 112,
    mau: 186,
    platform: [
      { label: "Web", n: 71 },
      { label: "Android app", n: 98 },
      { label: "Both", n: 17 },
    ],
    features: [
      { key: "transactions", label: "Added a transaction", users: 171 },
      { key: "receipts", label: "Scanned a receipt", users: 104 },
      { key: "mileage", label: "Tracked a trip", users: 93 },
      { key: "reports", label: "Downloaded a report", users: 58 },
      { key: "connections", label: "Linked a bank or POS", users: 21 },
      { key: "team", label: "Invited a teammate", users: 9 },
      { key: "ifta", label: "Filed IFTA", users: 7 },
    ],
  };

  const health = {
    uptime30: 99.94,
    services: [
      { name: "App API", status: "ok", latencyMs: 182, errorRate: 0.4 },
      { name: "Sign-in (Cognito)", status: "ok", latencyMs: 240, errorRate: 0.1 },
      { name: "Receipt scanning", status: "degraded", latencyMs: 3900, errorRate: 6.2 },
      { name: "Plaid bank sync", status: "ok", latencyMs: 820, errorRate: 1.1 },
      { name: "Square POS sync", status: "ok", latencyMs: 640, errorRate: 0.0 },
      { name: "Email delivery", status: "ok", latencyMs: null, errorRate: 0.3 },
      { name: "Push delivery", status: "down", latencyMs: null, errorRate: 100, note: "Not set up yet — needs Firebase" },
    ],
    errors24: Array.from({ length: 24 }, (_, i) => (i === 17 ? 41 : i === 18 ? 23 : 2 + ((i * 5) % 7))),
    recent: [
      { at: iso(now - 40 * 60000), service: "Receipt scanning", message: "Textract timeout after 30s", count: 12 },
      { at: iso(now - 2 * HOUR), service: "Plaid bank sync", message: "ITEM_LOGIN_REQUIRED for 2 accounts", count: 2 },
      { at: iso(now - 7 * HOUR), service: "App API", message: "POST /Transaction 500 — DynamoDB throttled", count: 23 },
      { at: iso(now - 26 * HOUR), service: "Android app", message: "Crash: MileageTracker watchPosition null", count: 3 },
    ],
    incidents: [{ id: "i1", title: "Slow receipt scanning", status: "investigating", startedAt: iso(now - 50 * 60000), note: "AWS Textract latency in us-east-1." }],
  };

  const approvals = [
    { id: "ap1", kind: "billing.refund", status: "pending", by: "marta@meksova.com", at: iso(now - 50 * 60000), summary: "Refund $24.99 to Meron Assefa", reason: "Charged twice on Nov 1 — duplicate payment.", payload: { row: { id: "demo-7", email: person(7).email }, opts: { amount: 24.99, invoiceId: "demo-7-inv-0", reason: "Duplicate charge" } } },
    { id: "ap2", kind: "request.delete", status: "pending", by: "marta@meksova.com", at: iso(now - 3 * HOUR), summary: "Delete Biniam Kebede's account", reason: "Customer asked twice by email.", payload: { requestId: "r1" } },
    { id: "ap3", kind: "user.suspend", status: "approved", by: "daniel@meksova.com", at: iso(now - 4 * DAY), decidedAt: iso(now - 4 * DAY + HOUR), decidedBy: "owner@meksova.com", summary: "Suspend Kidus Wolde", reason: "Chargeback filed and account shared publicly.", payload: { userId: "demo-8" } },
    { id: "ap4", kind: "site.publish", status: "rejected", by: "daniel@meksova.com", at: iso(now - 9 * DAY), decidedAt: iso(now - 9 * DAY + 2 * HOUR), decidedBy: "owner@meksova.com", note: "Not during tax week.", summary: "Turn on maintenance mode", reason: "Database upgrade", payload: {} },
  ];
  const approvalPolicy = { required: { "billing.refund": true, "billing.cancel": true, "request.delete": true, "recycle.purge": true, "user.suspend": true, "site.publish": true, "policy.publish": true } };

  const slaPolicy = { hours: { urgent: 2, high: 8, normal: 24, low: 72 }, escalateTo: "" };

  const articles = [
    { id: "a1", title: "Connect your bank account", category: "Connections", status: "published", inHelpCenter: true, views: 412, helpful: 0.81, updatedAt: iso(now - 12 * DAY), body: "Go to Connections → Add bank. Pick your bank and sign in through Plaid.\n\nIf it fails, choose Reconnect on the bank card and sign in again. Some banks need you to approve the link in their own app first." },
    { id: "a2", title: "Download your year-end report", category: "Reports", status: "published", inHelpCenter: true, views: 288, helpful: 0.9, updatedAt: iso(now - 30 * DAY), body: "Financial Report → Download → Year-end summary. The PDF has income, expenses by category and mileage — everything your accountant asks for." },
    { id: "a3", title: "Keep mileage tracking on Android", category: "Mileage", status: "published", inHelpCenter: true, views: 197, helpful: 0.64, updatedAt: iso(now - 5 * DAY), body: "Settings → Apps → Meksova → Location → Allow all the time.\n\nThen Battery → Unrestricted. Without these, Android stops trips when the screen is off." },
    { id: "a4", title: "Change or cancel your plan", category: "Billing", status: "published", inHelpCenter: true, views: 133, helpful: 0.72, updatedAt: iso(now - 45 * DAY), body: "Account → Subscription → Manage. You keep access until the end of the period you've paid for." },
    { id: "a5", title: "File IFTA with Meksova", category: "Trucking", status: "draft", inHelpCenter: false, views: 0, helpful: 0, updatedAt: iso(now - 1 * DAY), body: "Draft — add steps once the PDF export ships." },
  ];

  const rules = [
    { id: "ru1", name: "Bank problems go to Marta", enabled: true, trigger: "ticket.created", conditions: [{ field: "text", op: "contains", value: "bank, plaid, chase, connect" }], actions: [{ type: "assign", value: "marta@meksova.com" }, { type: "priority", value: "high" }], runs30: 9, lastRunAt: iso(now - 3 * HOUR) },
    { id: "ru2", name: "Payment trouble is urgent", enabled: true, trigger: "ticket.created", conditions: [{ field: "text", op: "contains", value: "charged, refund, payment" }], actions: [{ type: "priority", value: "urgent" }, { type: "notify", value: "owner" }], runs30: 4, lastRunAt: iso(now - 26 * HOUR) },
    { id: "ru3", name: "Win back expired trucking trials", enabled: true, trigger: "trial.ended", conditions: [{ field: "businessType", op: "is", value: "Trucking" }], actions: [{ type: "email", value: "trial25" }, { type: "tag", value: "win-back" }], runs30: 6, lastRunAt: iso(now - 2 * DAY) },
    { id: "ru4", name: "Flag big refunds", enabled: false, trigger: "payment.failed", conditions: [{ field: "plan", op: "is", value: "Yearly" }], actions: [{ type: "notify", value: "owner" }], runs30: 0, lastRunAt: null },
  ];

  const alertSettings = {
    events: {
      "payment.failed": { on: true, channels: ["email"] },
      "ticket.urgent": { on: true, channels: ["email", "push"] },
      "ticket.overdue": { on: true, channels: ["push"] },
      "service.down": { on: true, channels: ["email", "push", "sms"] },
      "request.created": { on: true, channels: ["email"] },
      "approval.waiting": { on: true, channels: ["push"] },
      "signup.new": { on: false, channels: ["email"] },
      "digest.daily": { on: true, channels: ["email"] },
    },
    recipients: ["owner"],
    quiet: { on: true, from: "22:00", to: "07:00" },
    phone: "",
  };

  const notifications = [
    { id: "n1", kind: "approval.waiting", text: "Marta asked to refund $24.99 to Meron Assefa", at: iso(now - 50 * 60000), read: false, tab: "approvals" },
    { id: "n2", kind: "service.down", text: "Receipt scanning is slow (Textract timeouts)", at: iso(now - 52 * 60000), read: false, tab: "health" },
    { id: "n3", kind: "ticket.urgent", text: "Urgent ticket: “Charged but my account says unpaid”", at: iso(now - 26 * HOUR), read: false, tab: "support" },
    { id: "n4", kind: "request.created", text: "Ruth Alemu asked for a copy of her data", at: iso(now - 6 * HOUR), read: true, tab: "requests" },
    { id: "n5", kind: "payment.failed", text: "Payment failed for Meron Assefa ($24.99)", at: iso(now - 2 * DAY), read: true, tab: "users" },
  ];

  return { tickets, requests, automations, promos, referral, changelog, recycle, revenue: { months, cancelReasons }, usage, health, approvals, approvalPolicy, slaPolicy, articles, rules, alertSettings, notifications, invoices: {}, siteContent: seedSiteContent(), issues: seedIssues(now) };
}

let store = null;
const S = () => {
  if (!store) store = seed();
  return store;
};
const clone = (v) => JSON.parse(JSON.stringify(v));

const STARTER_DOCS = ["approvalPolicy", "slaPolicy", "alertSettings", "referral", "siteContent"];

const missing = (e) => !e?.response || e.response.status === 404 || e.response.status === 403;

export async function getData(name) {
  if (isDemo()) {
    await wait();
    return { data: clone(S()[name]), source: "demo" };
  }
  try {
    const res = await axios.get(apiUrl(`${ROUTES.ADMIN_DATA}/${name}`));
    let data = res.data?.items ?? res.data;
    // First time on a real backend: settings documents start from sensible
    // defaults (the same ones demo shows) instead of an empty screen.
    if ((data === null || data === "") && STARTER_DOCS.includes(name)) data = clone(seed()[name]);
    return { data, source: "live" };
  } catch (e) {
    if (missing(e)) return { data: null, source: "offline" };
    throw e;
  }
}

/** Upsert one item of a list collection (or replace an object collection). */
export async function putData(name, item, audit) {
  if (isDemo()) {
    await wait(300);
    const cur = S()[name];
    if (Array.isArray(cur)) {
      const i = cur.findIndex((x) => x.id === item.id);
      if (i >= 0) cur[i] = clone(item);
      else cur.unshift(clone(item));
    } else {
      S()[name] = clone(item);
    }
  } else {
    try {
      await axios.put(apiUrl(`${ROUTES.ADMIN_DATA}/${name}${item.id ? `/${item.id}` : ""}`), item);
    } catch (e) {
      if (missing(e)) throw new NotConnectedError("Saving this");
      throw e;
    }
  }
  if (audit) await logAudit(audit.action, audit.target, audit.detail);
  window.dispatchEvent(new Event("oc:data"));
}

export async function deleteData(name, item, audit) {
  if (isDemo()) {
    await wait(300);
    S()[name] = S()[name].filter((x) => x.id !== item.id);
  } else {
    try {
      await axios.delete(apiUrl(`${ROUTES.ADMIN_DATA}/${name}/${item.id}`));
    } catch (e) {
      if (missing(e)) throw new NotConnectedError("Deleting this");
      throw e;
    }
  }
  if (audit) await logAudit(audit.action, audit.target, audit.detail);
  window.dispatchEvent(new Event("oc:data"));
}

/* ------------------------------------------------------------- billing -- */

function seedInvoices(row) {
  const sub = row.sub;
  if (!sub) return [];
  const yearly = /year/i.test(sub.subscriptionPlan || "");
  const amount = yearly ? 249.99 : 24.99;
  const count = yearly ? 1 : 4;
  const list = Array.from({ length: count }, (_, i) => {
    const d = new Date();
    d.setDate(1);
    d.setMonth(d.getMonth() - (yearly ? 0 : i));
    return { id: `${row.id}-inv-${i}`, date: d.toISOString(), amount, status: "paid", refunded: 0, method: row.billing === "PayPal" ? "PayPal" : "Visa •• 4242" };
  });
  if (String(sub.status).toLowerCase() === "past_due") list[0] = { ...list[0], status: "failed" };
  if (String(sub.status).toLowerCase() === "canceled") list.splice(0, 1);
  return list;
}

export async function getInvoices(row) {
  if (isDemo()) {
    await wait();
    const s = S();
    if (!s.invoices[row.id]) s.invoices[row.id] = seedInvoices(row);
    return { data: clone(s.invoices[row.id]), source: "demo" };
  }
  try {
    const res = await axios.get(apiUrl(`${ROUTES.ADMIN_DATA}/invoices?userId=${encodeURIComponent(row.id)}`));
    return { data: res.data?.items ?? res.data, source: "live" };
  } catch (e) {
    if (missing(e)) return { data: null, source: "offline" };
    throw e;
  }
}

/** refund | cancel | pause | resume | switch -- applied by Stripe/PayPal server-side. */
export async function billingAction(row, kind, opts = {}) {
  const detail = {
    refund: `Refunded $${Number(opts.amount).toFixed(2)}${opts.reason ? ` — ${opts.reason}` : ""}`,
    cancel: opts.when === "now" ? "Cancelled immediately" : "Cancels at period end",
    pause: `Paused for ${opts.months} month${opts.months === 1 ? "" : "s"}`,
    resume: "Resumed billing",
    switch: `Switched to ${opts.plan}`,
  }[kind];
  if (isDemo()) {
    await wait(400);
    const inv = S().invoices[row.id] || [];
    if (kind === "refund") {
      const i = inv.find((x) => x.id === opts.invoiceId) || inv[0];
      if (i) {
        i.refunded = Math.min(i.amount, (i.refunded || 0) + Number(opts.amount));
        i.status = i.refunded >= i.amount ? "refunded" : "partly refunded";
      }
    }
    const { updateSubscription } = await import("utils/adminApi");
    if (kind === "cancel") await updateSubscription(row.id, opts.when === "now" ? { status: "canceled" } : { cancelAtPeriodEnd: true });
    if (kind === "pause") await updateSubscription(row.id, { pausedUntil: new Date(Date.now() + opts.months * 30 * DAY).toISOString() });
    if (kind === "resume") await updateSubscription(row.id, { pausedUntil: null, cancelAtPeriodEnd: false });
    if (kind === "switch") await updateSubscription(row.id, { subscriptionPlan: opts.plan });
  } else {
    try {
      await axios.post(apiUrl(`${ROUTES.ADMIN_DATA}/billing`), { userId: row.id, kind, ...opts });
    } catch (e) {
      if (missing(e)) throw new NotConnectedError("Billing changes");
      throw e;
    }
  }
  await logAudit(`billing.${kind}`, row.email, detail);
  window.dispatchEvent(new Event("oc:data"));
  return detail;
}

/* ------------------------------------------------------------ timeline -- */

/** Everything that ever happened to one customer, newest first. */
export async function fetchTimeline(row) {
  const { listAudit, listMessages } = await import("utils/adminApi");
  const [tickets, requests, recycle, invoices, audit, msgs] = await Promise.all([
    getData("tickets"),
    getData("requests"),
    getData("recycle"),
    getInvoices(row),
    listAudit(),
    listMessages().catch(() => ({ messages: [] })),
  ]);
  const ev = [];
  const add = (at, kind, text, tone = "muted", tab) => at && ev.push({ at: new Date(at), kind, text, tone, tab });

  add(row.signedUp, "account", `Signed up${row.authProvider ? ` with ${row.authProvider}` : ""}`, "accent");
  if (row.trialEnd) add(row.trialEnd < new Date() ? row.trialEnd : null, "account", "Free trial ended", "amber");
  if (row.sub?.createdAt) add(row.sub.createdAt, "billing", `Subscribed · ${row.sub.subscriptionPlan || "plan"} via ${row.billing || "card"}`, "green");
  (invoices.data || []).forEach((i) => {
    add(i.date, "billing", `${i.status === "failed" ? "Payment failed" : "Paid"} $${i.amount.toFixed(2)}`, i.status === "failed" ? "red" : "green");
    if (i.refunded) add(i.date, "billing", `Refunded $${i.refunded.toFixed(2)}`, "amber");
  });
  (tickets.data || []).filter((t) => t.userId === row.id).forEach((t) => add(t.createdAt, "support", `Support: “${t.subject}” (${t.status})`, t.status === "resolved" ? "green" : "red", "support"));
  (requests.data || []).filter((r) => r.userId === row.id).forEach((r) => add(r.createdAt, "data", `Asked to ${r.type === "delete" ? "delete their account" : "export their data"} (${r.status})`, "amber", "requests"));
  (recycle.data || []).filter((r) => r.userId === row.id).forEach((r) => add(r.deletedAt, "data", `Deleted ${r.label}`, "amber", "recovery"));
  if (row.dataDeletedAt) add(row.dataDeletedAt, "data", "Deleted all their records (backup saved)", "red", "recovery");
  (msgs.messages || []).filter((m) => (m.userIds || []).includes(row.id)).forEach((m) => add(m.sentAt || m.scheduledFor, "message", `Sent: “${m.subject}”`, "accent", "messages"));
  (audit.entries || []).filter((a) => a.target === row.email).forEach((a) => add(a.at, "staff", `${a.by.split("@")[0]}: ${a.action.replace(".", " → ")}${a.detail ? ` (${a.detail})` : ""}`, "muted", "activity"));
  if (row.lastActive) add(row.lastActive, "account", "Last opened the app", "muted");

  return ev.sort((a, b) => b.at - a.at);
}
