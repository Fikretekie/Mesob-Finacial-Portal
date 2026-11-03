import axios from "axios";
import { apiUrl, ROUTES, normalizeReceiptUrl, getEnv } from "config/api";
import { getSiteConfig, saveSiteConfig, SITE_DEFAULTS } from "utils/siteConfig";

// Every owner-console read and write goes through here. In demo mode the same
// calls hit an in-memory dataset instead of the API, so each screen can be
// exercised end to end before the backend routes exist.

const DEMO_KEY = "mksv_admin_demo";
const LOCAL_AUDIT_KEY = "mksv_admin_audit_local";
const DAY = 86400000;

// The owner's own choice wins. Without one, production starts on real data
// and staging/local start on demo data so every screen has something to show.
export const isDemo = () => {
  try {
    const v = localStorage.getItem(DEMO_KEY);
    if (v === "1" || v === "0") return v === "1";
  } catch (e) {}
  return getEnv() !== "production";
};
export const setDemo = (on) => {
  try {
    localStorage.setItem(DEMO_KEY, on ? "1" : "0");
  } catch (e) {}
};

/** Thrown when a route the console needs hasn't been deployed yet. */
export class NotConnectedError extends Error {
  constructor(what) {
    super(`${what} isn't connected to the backend yet`);
    this.notConnected = true;
  }
}

// A request API Gateway has no route for comes back as 403 "Missing
// Authentication Token" without CORS headers, which the browser reports as a
// bare network error -- both mean "not deployed".
const isMissingRoute = (err) => !err?.response || err.response.status === 404 || (err.response.status === 403 && /Missing Authentication Token/i.test(JSON.stringify(err.response.data || "")));

const actor = () => localStorage.getItem("user_email") || "owner";

/* ------------------------------------------------------------------ demo -- */

let demo = null;

function buildDemo() {
  const now = Date.now();
  const types = ["Rideshare", "Trucking", "Restaurant", "Retail", "Cleaning", "Consulting"];
  const names = ["Abel Tesfaye", "Hana Girma", "Samuel Bekele", "Liya Haile", "Dawit Mekonnen", "Ruth Alemu", "Yonas Tadesse", "Meron Assefa", "Kidus Wolde", "Selam Getachew", "Biniam Kebede", "Tsion Desta", "Natnael Fikre", "Saron Mulugeta", "Eyob Hailu", "Mahlet Tilahun", "Robel Yohannes", "Bethlehem Abebe", "Henok Sisay", "Feven Teshome", "Mikiyas Demeke", "Rahel Worku", "Fitsum Berhane", "Lidya Negash", "Amanuel Gebre", "Kalkidan Ayele", "Tewodros Lemma", "Hiwot Shiferaw"];
  const users = [];
  const subs = [];
  const tx = {};
  names.forEach((n, i) => {
    const age = ((i * i * 7 + i * 3) % 84) + 1;
    const id = `demo-${i}`;
    const email = `${n.toLowerCase().replace(" ", ".")}@example.com`;
    const u = {
      id,
      name: n,
      email,
      phone_number: `+1614555${String(1000 + i * 37).slice(-4)}`,
      companyName: `${n.split(" ")[1]} LLC`,
      businessType: types[i % 6],
      role: 2,
      provider: i % 4 === 0 ? "Google" : "Email",
      createdAt: new Date(now - age * DAY).toISOString(),
      trialEndDate: new Date(now - age * DAY + 30 * DAY).toISOString(),
      hasApp: i % 2 === 0,
      lastActiveAt: new Date(now - ((i * 5) % 20) * DAY).toISOString(),
    };
    users.push(u);
    if (i % 3 === 0) subs.push({ id: `sub_demo${i}`, userId: id, email, name: n, status: "active", subscriptionPlan: i % 9 === 0 ? "Yearly" : "Monthly", createdAt: new Date(now - (age - 30) * DAY).toISOString() });
    if (i === 4) subs.push({ id: `I-DEMO${i}`, userId: id, email, name: n, status: "active", provider: "PayPal", subscriptionPlan: "Monthly" });
    if (i === 7) subs.push({ id: `sub_demo${i}`, userId: id, email, name: n, status: "past_due", subscriptionPlan: "Monthly" });
    if (i === 10) subs.push({ id: `sub_demo${i}`, userId: id, email, name: n, status: "canceled", subscriptionPlan: "Monthly" });
    tx[id] = Array.from({ length: 6 + (i % 7) }, (_, k) => ({
      id: `${id}-t${k}`,
      userId: id,
      transactionType: k % 3 === 0 ? "Receive" : "Pay",
      subType: k % 3 === 0 ? "" : "Expense",
      transactionPurpose: ["Fuel", "Client payment", "Insurance", "Phone bill", "Ride earnings", "Parking", "Supplies"][k % 7],
      transactionAmount: Math.round(((k + 1) * 37.5 + i * 3) * 100) / 100,
      status: "Paid",
      createdAt: new Date(now - (k * 4 + 1) * DAY).toISOString(),
    }));
  });

  users.push({
    id: "demo-long",
    name: "Gebremedhin Woldemariam-Tesfamichael ገብረመድህን ወልደማርያም",
    email: "gebremedhin.woldemariam.tesfamichael.longname@verylongcompanydomain.example.com",
    businessType: "Trucking & Logistics Services International",
    role: 2,
    provider: "Email",
    createdAt: new Date(now - 3 * DAY).toISOString(),
    trialEndDate: new Date(now + 27 * DAY).toISOString(),
    hasApp: true,
  });
  tx["demo-long"] = [];

  // Liya wiped her data last week; her pre-delete backup is what a restore uses.
  const wiped = users.find((u) => u.id === "demo-3");
  const backupRows = tx["demo-3"].map((t) => ({ ...t }));
  wiped.lastBackupUrls = [`demo://backups/demo-3transactions_${new Date(now - 6 * DAY).toISOString()}.csv`];
  wiped.dataDeletedAt = new Date(now - 6 * DAY).toISOString();
  tx["demo-3"] = [];

  return {
    users,
    subs,
    tx,
    backups: { [wiped.lastBackupUrls[0]]: backupRows },
    config: JSON.parse(JSON.stringify(SITE_DEFAULTS)),
    messages: [
      { id: "m1", subject: "Your 2026 tax summary is ready", body: "Open Meksova to download your year-end summary.", channels: ["email", "push"], audience: "paying", recipients: 11, status: "sent", sentAt: new Date(now - 9 * DAY).toISOString(), by: "owner@meksova.com" },
      { id: "m2", subject: "Trial ending soon", body: "Your free trial ends in 3 days. Pick a plan to keep your records.", channels: ["email"], audience: "trial", recipients: 9, status: "scheduled", scheduledFor: new Date(now + 2 * DAY).toISOString(), by: "owner@meksova.com" },
    ],
    staff: [
      { id: "staff-1", name: "Marta Bekele", email: "marta@meksova.com", status: "active", perms: ["overview.view", "users.view", "users.edit", "users.viewAs", "support.reply", "requests.handle", "data.restore", "activity.view"], requireMfa: true, invitedAt: new Date(now - 40 * DAY).toISOString(), lastActiveAt: new Date(now - 2 * 3600000).toISOString() },
      { id: "staff-2", name: "Daniel Tesfaye", email: "daniel@meksova.com", status: "active", perms: ["overview.view", "users.view", "messages.send"], requireMfa: true, invitedAt: new Date(now - 12 * DAY).toISOString(), lastActiveAt: new Date(now - 3 * DAY).toISOString() },
      { id: "staff-3", name: "", email: "accountant@example.com", status: "invited", perms: ["overview.view", "revenue.view", "usage.view", "users.view", "health.view", "activity.view"], requireMfa: true, invitedAt: new Date(now - 1 * DAY).toISOString() },
    ],
    audit: [
      { id: "a1", at: new Date(now - 9 * DAY).toISOString(), by: "owner@meksova.com", action: "message.send", target: "11 paying users", detail: "Your 2026 tax summary is ready" },
      { id: "a2", at: new Date(now - 4 * DAY).toISOString(), by: "owner@meksova.com", action: "user.extendTrial", target: "hana.girma@example.com", detail: "+7 days" },
    ],
  };
}

const D = () => {
  if (!demo) demo = buildDemo();
  return demo;
};
const wait = (ms = 250) => new Promise((r) => setTimeout(r, ms));

/* ----------------------------------------------------------------- audit -- */

const readLocalAudit = () => {
  try {
    return JSON.parse(localStorage.getItem(LOCAL_AUDIT_KEY) || "[]");
  } catch (e) {
    return [];
  }
};

export async function logAudit(action, target, detail = "") {
  const entry = { id: `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`, at: new Date().toISOString(), by: actor(), action, target, detail };
  if (isDemo()) {
    D().audit.unshift(entry);
    return entry;
  }
  try {
    await axios.post(apiUrl(ROUTES.ADMIN_AUDIT), entry);
  } catch (e) {
    // Until AdminAudit exists, keep this browser's own record so nothing an
    // owner does goes unlogged.
    try {
      localStorage.setItem(LOCAL_AUDIT_KEY, JSON.stringify([entry, ...readLocalAudit()].slice(0, 300)));
    } catch (err) {}
  }
  return entry;
}

export async function listAudit() {
  if (isDemo()) {
    await wait();
    return { entries: [...D().audit], source: "demo" };
  }
  try {
    const res = await axios.get(apiUrl(ROUTES.ADMIN_AUDIT));
    return { entries: Array.isArray(res.data) ? res.data : res.data?.entries || [], source: "live" };
  } catch (e) {
    return { entries: readLocalAudit(), source: "local" };
  }
}

/* ------------------------------------------------------- users and subs -- */

export async function loadDirectory() {
  if (isDemo()) {
    await wait(400);
    return { users: D().users.map((u) => ({ ...u })), subs: D().subs.map((s) => ({ ...s })), errors: {} };
  }
  const [u, s] = await Promise.allSettled([axios.get(apiUrl(`${ROUTES.ADMIN_DATA}/users`)), axios.get(apiUrl(`${ROUTES.ADMIN_DATA}/subscriptions`))]);
  const errors = {};
  const list = (r, key) => (Array.isArray(r.value.data) ? r.value.data : r.value.data?.items || r.value.data?.[key] || []);
  const users = u.status === "fulfilled" ? list(u, "users") : [];
  const subs = s.status === "fulfilled" ? list(s, "subscriptions") : [];
  if (u.status === "rejected") errors.users = u.reason?.response?.status || "network";
  if (s.status === "rejected") errors.subs = s.reason?.response?.status || "network";
  return { users, subs, errors };
}

export async function fetchUser(id) {
  if (isDemo()) {
    await wait();
    return { ...D().users.find((u) => u.id === id) };
  }
  const res = await axios.get(apiUrl(`${ROUTES.USERS}/${id}`));
  return res.data?.user || res.data;
}

/** Partial update -- PUT /Users/{id} merges the given fields. */
export async function updateUser(id, patch, audit) {
  if (isDemo()) {
    await wait();
    const u = D().users.find((x) => x.id === id);
    Object.assign(u, patch);
  } else {
    await axios.put(apiUrl(`${ROUTES.ADMIN_DATA}/users/${encodeURIComponent(id)}`), patch);
  }
  if (audit) await logAudit(audit.action, audit.target, audit.detail);
}

/** Demo-only mirror of a Stripe/PayPal change, so the console reflects it. */
export async function updateSubscription(userId, patch) {
  if (!isDemo()) return;
  const sub = D().subs.find((s) => s.userId === userId);
  if (sub) Object.assign(sub, patch);
}

export async function fetchTransactions(userId) {
  if (isDemo()) {
    await wait();
    return (D().tx[userId] || []).map((t) => ({ ...t }));
  }
  const res = await axios.get(apiUrl(`${ROUTES.ADMIN_DATA}/transactions?userId=${encodeURIComponent(userId)}`));
  const d = res.data;
  return Array.isArray(d) ? d : d?.items || d?.transactions || [];
}

/* -------------------------------------------------------------- restore -- */

// Mirrors generateCSV in mesobfinancial2.js: header row, every cell quoted.
export function parseBackupCsv(text) {
  const rows = [];
  let row = [];
  let cell = "";
  let quoted = false;
  for (let i = 0; i < text.length; i += 1) {
    const c = text[i];
    if (quoted) {
      if (c === '"' && text[i + 1] === '"') {
        cell += '"';
        i += 1;
      } else if (c === '"') quoted = false;
      else cell += c;
    } else if (c === '"') quoted = true;
    else if (c === ",") {
      row.push(cell);
      cell = "";
    } else if (c === "\n" || c === "\r") {
      if (c === "\r" && text[i + 1] === "\n") i += 1;
      row.push(cell);
      rows.push(row);
      row = [];
      cell = "";
    } else cell += c;
  }
  if (cell || row.length) {
    row.push(cell);
    rows.push(row);
  }
  const [head, ...body] = rows.filter((r) => r.some((v) => v !== ""));
  if (!head) return [];
  const NUMERIC = /amount|balance|price|total|gallons|quantity|qty/i;
  return body.map((r) => {
    const o = {};
    head.forEach((h, i) => {
      const v = r[i];
      if (v === undefined || v === "undefined" || v === "null" || v === "[object Object]") return;
      if (v === "true" || v === "false") o[h] = v === "true";
      else if (NUMERIC.test(h) && v !== "" && !Number.isNaN(Number(v))) o[h] = Number(v);
      else o[h] = v;
    });
    return o;
  });
}

export async function fetchBackup(url) {
  if (isDemo()) {
    await wait();
    return (D().backups[url] || []).map((r) => ({ ...r }));
  }
  const res = await fetch(normalizeReceiptUrl(url));
  if (!res.ok) throw new Error(`Backup download failed (${res.status})`);
  return parseBackupCsv(await res.text());
}

const fingerprint = (t) => `${t.createdAt || ""}|${Number(t.transactionAmount) || 0}|${t.transactionPurpose || ""}|${t.transactionType || ""}`;

/** Re-creates backup rows for a user, skipping rows that already exist. */
export async function restoreTransactions(user, rows, onProgress) {
  const existing = new Set((await fetchTransactions(user.id)).map(fingerprint));
  const todo = rows.filter((r) => !existing.has(fingerprint(r)));
  let done = 0;
  let failed = 0;
  for (const r of todo) {
    const { id, ...rest } = r;
    const body = { ...rest, userId: user.id, restoredFrom: id || "", restoredAt: new Date().toISOString() };
    try {
      if (isDemo()) {
        await wait(40);
        D().tx[user.id].push({ ...body, id: `${user.id}-r${done}` });
      } else {
        await axios.post(apiUrl(`${ROUTES.ADMIN_DATA}/transactions`), body);
      }
      done += 1;
    } catch (e) {
      failed += 1;
    }
    onProgress?.({ done, failed, total: todo.length });
  }
  await logAudit("data.restore", user.email, `${done} restored, ${rows.length - todo.length} already present, ${failed} failed`);
  return { restored: done, skipped: rows.length - todo.length, failed };
}

/* ------------------------------------------------------------- messages -- */

export async function listMessages() {
  if (isDemo()) {
    await wait();
    return { messages: [...D().messages], source: "demo" };
  }
  try {
    const res = await axios.get(apiUrl(ROUTES.ADMIN_MESSAGES));
    return { messages: Array.isArray(res.data) ? res.data : res.data?.messages || [], source: "live" };
  } catch (e) {
    if (isMissingRoute(e)) return { messages: [], source: "offline" };
    throw e;
  }
}

/** Queues an email / push broadcast. The backend resolves the audience. */
export async function sendMessage(msg) {
  const record = { ...msg, id: `m${Date.now()}`, by: actor(), status: msg.scheduledFor ? "scheduled" : "sent", sentAt: msg.scheduledFor ? undefined : new Date().toISOString() };
  if (isDemo()) {
    await wait(500);
    D().messages.unshift(record);
  } else {
    try {
      await axios.post(apiUrl(ROUTES.ADMIN_MESSAGES), msg);
    } catch (e) {
      if (isMissingRoute(e)) throw new NotConnectedError("Email and push sending");
      throw e;
    }
  }
  await logAudit(msg.scheduledFor ? "message.schedule" : "message.send", `${msg.recipients} ${msg.audienceLabel}`, msg.subject);
  return record;
}

/* --------------------------------------------------------- site config -- */

export async function loadConfig() {
  if (isDemo()) {
    await wait();
    return { config: JSON.parse(JSON.stringify(D().config)), source: "demo" };
  }
  return { config: JSON.parse(JSON.stringify(getSiteConfig())), source: "live" };
}

export async function saveConfig(next, auditAction, detail) {
  if (isDemo()) {
    await wait(300);
    D().config = JSON.parse(JSON.stringify({ ...next, updatedAt: new Date().toISOString(), updatedBy: actor() }));
  } else {
    try {
      await saveSiteConfig(next);
    } catch (e) {
      if (isMissingRoute(e)) throw new NotConnectedError("Saving site settings");
      throw e;
    }
  }
  await logAudit(auditAction || "site.update", "site settings", detail || "");
}

/* ---------------------------------------------------------------- staff -- */

export async function listStaff() {
  if (isDemo()) {
    await wait();
    return { staff: D().staff.map((s) => ({ ...s, perms: [...s.perms] })), source: "demo" };
  }
  try {
    const res = await axios.get(apiUrl(ROUTES.ADMIN_STAFF));
    return { staff: Array.isArray(res.data) ? res.data : res.data?.staff || [], source: "live" };
  } catch (e) {
    if (isMissingRoute(e)) return { staff: [], source: "offline" };
    throw e;
  }
}

/** Creates the staff login; the backend emails them a sign-in link. */
export async function inviteStaff({ name, email, perms, requireMfa }) {
  const record = { id: `staff-${Date.now()}`, name, email, perms, requireMfa, status: "invited", invitedAt: new Date().toISOString() };
  if (isDemo()) {
    await wait(400);
    if (D().staff.some((s) => s.email.toLowerCase() === email.toLowerCase())) throw new Error("That email already has a staff account.");
    D().staff.unshift(record);
  } else {
    try {
      await axios.post(apiUrl(ROUTES.ADMIN_STAFF), { name, email, perms, requireMfa });
    } catch (e) {
      if (isMissingRoute(e)) throw new NotConnectedError("Creating staff accounts");
      throw e;
    }
  }
  await logAudit("staff.invite", email, `${perms.length} permissions`);
  return record;
}

export async function updateStaff(member, patch, action, detail) {
  if (isDemo()) {
    await wait(300);
    Object.assign(D().staff.find((s) => s.id === member.id), patch);
  } else {
    try {
      await axios.put(apiUrl(`${ROUTES.ADMIN_STAFF}/${member.id}`), patch);
    } catch (e) {
      if (isMissingRoute(e)) throw new NotConnectedError("Changing staff accounts");
      throw e;
    }
  }
  await logAudit(action, member.email, detail || "");
}

export async function removeStaff(member) {
  if (isDemo()) {
    await wait(300);
    D().staff = D().staff.filter((s) => s.id !== member.id);
  } else {
    try {
      await axios.delete(apiUrl(`${ROUTES.ADMIN_STAFF}/${member.id}`));
    } catch (e) {
      if (isMissingRoute(e)) throw new NotConnectedError("Removing staff accounts");
      throw e;
    }
  }
  await logAudit("staff.remove", member.email);
}

/** A staff member's own permissions, re-read on every console load so a
 * change the owner makes applies without them signing out. */
export async function fetchOwnPerms() {
  const id = localStorage.getItem("userId");
  if (!id || isDemo()) return null;
  try {
    const res = await axios.get(apiUrl(`${ROUTES.USERS}/${id}`));
    const u = res.data?.user || res.data;
    return { perms: Array.isArray(u?.staffPermissions) ? u.staffPermissions : [], disabled: Boolean(u?.disabled) };
  } catch (e) {
    return null;
  }
}
