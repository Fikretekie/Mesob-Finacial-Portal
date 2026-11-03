import { createContext, useContext, useEffect, useMemo, useState } from "react";

// Roles: 0 = super admin (owner), 1 = customer without billing, 2 = customer,
// 3 = staff. Staff get only the console, limited to the permissions below.
export const STAFF_ROLE = 3;

export const PERMISSIONS = [
  { key: "overview.view", group: "Business", label: "See the overview", hint: "Headline numbers, signups, needs-attention list" },
  { key: "revenue.view", group: "Business", label: "See revenue", hint: "Monthly revenue, cancellations and reasons" },
  { key: "usage.view", group: "Business", label: "See usage", hint: "Active users and which features people use" },
  { key: "users.view", group: "Customers", label: "Look up customers", hint: "Search the customer list and open an account" },
  { key: "users.edit", group: "Customers", label: "Extend trials & write notes", hint: "Trial dates and internal notes" },
  { key: "users.access", group: "Customers", label: "Free access & suspensions", hint: "Grant/remove free access, suspend or reactivate" },
  { key: "users.viewAs", group: "Customers", label: "View as customer", hint: "Open the app as that customer sees it" },
  { key: "users.export", group: "Customers", label: "Export customer data", hint: "Download customer lists and transactions" },
  { key: "billing.manage", group: "Customers", label: "Refunds & plan changes", hint: "Refund, cancel, pause or switch a customer's plan" },
  { key: "support.reply", group: "Customers", label: "Answer support", hint: "Read and reply to customer messages" },
  { key: "requests.handle", group: "Customers", label: "Handle deletion & export requests", hint: "Export or delete an account on request" },
  { key: "data.restore", group: "Customers", label: "Restore deleted data", hint: "Recycle bin and CSV backups" },
  { key: "messages.send", group: "Engage", label: "Send messages", hint: "Email, push and in-app banner" },
  { key: "automations.manage", group: "Engage", label: "Manage automatic emails", hint: "Welcome, trial and payment reminders" },
  { key: "promos.manage", group: "Engage", label: "Manage promo codes", hint: "Discount codes and referral reward" },
  { key: "articles.manage", group: "Engage", label: "Write help articles", hint: "Help Center answers and saved replies" },
  { key: "content.edit", group: "Platform", label: "Edit website & app content", hint: "Site editor: text, sections, brand (publishing may need approval)" },
  { key: "issues.manage", group: "Platform", label: "Work on issues", hint: "Bug list, assign, notes, quick fixes" },
  { key: "site.manage", group: "Platform", label: "Site control", hint: "Banner, maintenance mode, feature switches, app settings" },
  { key: "policies.publish", group: "Platform", label: "Edit & publish policies", hint: "Terms of Use and Privacy Policy" },
  { key: "changelog.publish", group: "Platform", label: "Publish what's new", hint: "Release notes customers see" },
  { key: "health.view", group: "Platform", label: "See system health", hint: "Errors, failed syncs, uptime" },
  { key: "rules.manage", group: "Team", label: "Manage rules", hint: "If-this-then-that routing and follow-ups" },
  { key: "activity.view", group: "Team", label: "See the activity log", hint: "Every admin action, by whom" },
];

export const PRESETS = [
  { id: "support", label: "Customer support", perms: ["overview.view", "users.view", "users.edit", "users.viewAs", "support.reply", "requests.handle", "data.restore", "articles.manage", "issues.manage", "activity.view"] },
  { id: "billing", label: "Billing", perms: ["overview.view", "revenue.view", "users.view", "users.edit", "users.access", "users.export", "billing.manage", "promos.manage"] },
  { id: "marketing", label: "Marketing", perms: ["overview.view", "usage.view", "users.view", "messages.send", "automations.manage", "promos.manage", "articles.manage", "changelog.publish", "content.edit"] },
  { id: "operations", label: "Operations", perms: ["overview.view", "usage.view", "messages.send", "site.manage", "policies.publish", "changelog.publish", "health.view", "rules.manage", "content.edit", "issues.manage", "activity.view"] },
  { id: "readonly", label: "Read-only", perms: ["overview.view", "revenue.view", "usage.view", "users.view", "health.view", "activity.view"] },
];

export const presetFor = (perms) => {
  const set = [...(perms || [])].sort().join(",");
  return PRESETS.find((p) => [...p.perms].sort().join(",") === set) || null;
};

const PERMS_KEY = "staffPerms";

export const readStoredPerms = () => {
  try {
    return JSON.parse(localStorage.getItem(PERMS_KEY) || "[]");
  } catch (e) {
    return [];
  }
};
export const storePerms = (perms) => {
  try {
    localStorage.setItem(PERMS_KEY, JSON.stringify(perms || []));
  } catch (e) {}
};

/** Where a signed-in account lands after login. */
export const homePathForRole = (role) => {
  const r = Number(role);
  if (r === 0) return "/admin/console";
  if (r === STAFF_ROLE) return "/admin/console";
  return "/customer/dashboard";
};

export const currentRole = () => parseInt(localStorage.getItem("role"), 10);

/**
 * Access for the signed-in console user. `preview` lets the owner see the
 * console exactly as a staff member with those permissions would.
 */
export function makeAccess(role, perms, preview) {
  if (role === 0 && !preview) {
    return { isOwner: true, isStaff: false, preview: null, perms: PERMISSIONS.map((p) => p.key), can: () => true };
  }
  const list = preview ? preview.perms : perms;
  const set = new Set(list || []);
  return { isOwner: false, isStaff: true, preview: preview || null, perms: [...set], can: (p) => set.has(p) };
}

export const AccessContext = createContext(makeAccess(0, []));
export const useAccess = () => useContext(AccessContext);

/** Admin-layout pages a staff member may open (everything else is owner-only). */
export const STAFF_PATHS = ["/console", "/help"];

// The owner can preview the console as a staff member; the sidebar and the
// console page both read this so they always agree on what's visible.
const PREVIEW_KEY = "mksv_console_preview";

export const getPreview = () => {
  try {
    return JSON.parse(sessionStorage.getItem(PREVIEW_KEY) || "null");
  } catch (e) {
    return null;
  }
};

export const setPreview = (preview) => {
  try {
    if (preview) sessionStorage.setItem(PREVIEW_KEY, JSON.stringify(preview));
    else sessionStorage.removeItem(PREVIEW_KEY);
  } catch (e) {}
  window.dispatchEvent(new Event("oc:access"));
};

/** Re-publish after a staff member's own permissions were re-read. */
export const announcePerms = (perms) => {
  storePerms(perms);
  window.dispatchEvent(new Event("oc:access"));
};

export function useConsoleAccess() {
  const [tick, setTick] = useState(0);
  useEffect(() => {
    const bump = () => setTick((n) => n + 1);
    window.addEventListener("oc:access", bump);
    return () => window.removeEventListener("oc:access", bump);
  }, []);
  // eslint-disable-next-line
  return useMemo(() => makeAccess(currentRole(), readStoredPerms(), getPreview()), [tick]);
}
