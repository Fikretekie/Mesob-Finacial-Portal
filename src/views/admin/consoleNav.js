import React from "react";

// The console's own navigation. Every entry exists because an owner or staff
// member has a job to do there; `purpose` says what that job is and is shown
// under the page title. perm: null = owner only.
export const SECTIONS = [
  {
    group: "Home",
    items: [
      { id: "overview", label: "Overview", perm: "overview.view", purpose: "What needs you today: failed payments, wiped accounts, trials about to lapse." },
      { id: "approvals", label: "Approvals", perm: null, purpose: "Risky actions your staff asked to take. Nothing happens until you approve." },
    ],
  },
  {
    group: "Customers",
    items: [
      { id: "users", label: "Customers", perm: "users.view", purpose: "Find any customer, see their whole history, fix their account or billing." },
      { id: "support", label: "Support inbox", perm: "support.reply", purpose: "Answer customer messages before their deadline runs out." },
      { id: "requests", label: "Data requests", perm: "requests.handle", purpose: "Delete or export an account when a customer asks. Legally due in 30 days." },
      { id: "recovery", label: "Data recovery", perm: "data.restore", purpose: "Put back anything a customer deleted by mistake." },
    ],
  },
  {
    group: "Insights",
    items: [
      { id: "revenue", label: "Revenue", perm: "revenue.view", purpose: "Is the business growing? Monthly revenue, cancellations and why." },
      { id: "usage", label: "Usage", perm: "usage.view", purpose: "Which features people actually use, and how often they come back." },
    ],
  },
  {
    group: "Engage",
    items: [
      { id: "messages", label: "Messages", perm: "messages.send", purpose: "Email, push or an in-app banner to any group of customers, now or later." },
      { id: "automations", label: "Automations", perm: "automations.manage", purpose: "Emails that send themselves: welcome, trial reminders, failed payments." },
      { id: "promos", label: "Promotions", perm: "promos.manage", purpose: "Discount codes and the referral reward." },
      { id: "articles", label: "Help articles", perm: "articles.manage", purpose: "Write an answer once; it shows in the app's Help Center and in your replies." },
    ],
  },
  {
    group: "Platform",
    items: [
      { id: "editor", label: "Site editor", perm: "content.edit", purpose: "Edit the website and app screens like a page builder: text, buttons, sections, brand — then publish." },
      { id: "issues", label: "Issues", perm: "issues.manage", purpose: "Every bug in the website, phone app and backend, grouped by how many people it hits — and the quick fixes." },
      { id: "site", label: "Site control", perm: "site.manage", purpose: "Change the live app and website without a release: banner, maintenance, features." },
      { id: "health", label: "System health", perm: "health.view", purpose: "Spot outages and errors before customers email you, and tell them when you do." },
      { id: "policies", label: "Policies", perm: "policies.publish", purpose: "Terms of Use and Privacy Policy, and who has accepted them." },
      { id: "changelog", label: "What's new", perm: "changelog.publish", purpose: "Release notes customers see after an update." },
    ],
  },
  {
    group: "Admin",
    items: [
      { id: "staff", label: "Staff", perm: null, purpose: "Employee logins and exactly what each one can do." },
      { id: "rules", label: "Rules", perm: "rules.manage", purpose: "If this happens, do that — routing, tagging and follow-ups without you." },
      { id: "alerts", label: "Alerts", perm: null, purpose: "What you get told about, and where: email or phone." },
      { id: "activity", label: "Activity", perm: "activity.view", purpose: "Every admin action: who did what, when." },
    ],
  },
];

export const ALL_SECTIONS = SECTIONS.flatMap((g) => g.items.map((i) => ({ ...i, group: g.group })));

export const visibleSections = (access) => ALL_SECTIONS.filter((s) => (s.perm ? access.can(s.perm) : access.isOwner));

/** Section text in the user's language (English is the fallback). */
export const localize = (t, s) => ({
  ...s,
  label: t(`console.sections.${s.id}.label`, s.label),
  purpose: t(`console.sections.${s.id}.purpose`, s.purpose),
  groupLabel: t(`console.groups.${s.group}`, s.group),
});

const ICONS = {
  overview: <><rect x="3" y="3" width="7" height="9" rx="1.5" /><rect x="14" y="3" width="7" height="5" rx="1.5" /><rect x="14" y="12" width="7" height="9" rx="1.5" /><rect x="3" y="16" width="7" height="5" rx="1.5" /></>,
  approvals: <><path d="M9 11l3 3L22 4" /><path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11" /></>,
  users: <><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" /><circle cx="9" cy="7" r="4" /><path d="M23 21v-2a4 4 0 0 0-3-3.87" /><path d="M16 3.13a4 4 0 0 1 0 7.75" /></>,
  support: <><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" /></>,
  requests: <><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" /><polyline points="14 2 14 8 20 8" /><line x1="9" y1="15" x2="15" y2="15" /></>,
  recovery: <><polyline points="1 4 1 10 7 10" /><path d="M3.51 15a9 9 0 1 0 2.13-9.36L1 10" /></>,
  revenue: <><line x1="12" y1="1" x2="12" y2="23" /><path d="M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6" /></>,
  usage: <><polyline points="22 12 18 12 15 21 9 3 6 12 2 12" /></>,
  messages: <><path d="M4 4h16a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2z" /><polyline points="22 6 12 13 2 6" /></>,
  automations: <><polyline points="13 2 3 14 12 14 11 22 21 10 12 10 13 2" /></>,
  promos: <><path d="M20.59 13.41l-7.17 7.17a2 2 0 0 1-2.83 0L2 12V2h10l8.59 8.59a2 2 0 0 1 0 2.82z" /><line x1="7" y1="7" x2="7.01" y2="7" /></>,
  articles: <><path d="M2 3h6a4 4 0 0 1 4 4v14a3 3 0 0 0-3-3H2z" /><path d="M22 3h-6a4 4 0 0 0-4 4v14a3 3 0 0 1 3-3h7z" /></>,
  site: <><circle cx="12" cy="12" r="3" /><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 1 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 1 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 1 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 1 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" /></>,
  health: <><path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78L12 21.23l8.84-8.84a5.5 5.5 0 0 0 0-7.78z" /></>,
  policies: <><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" /></>,
  changelog: <><path d="M12 2l3 7h7l-5.5 4.5 2 7.5L12 17l-6.5 4 2-7.5L2 9h7z" /></>,
  staff: <><rect x="2" y="7" width="20" height="14" rx="2" /><path d="M16 21V5a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v16" /></>,
  rules: <><polyline points="16 3 21 3 21 8" /><line x1="4" y1="20" x2="21" y2="3" /><polyline points="21 16 21 21 16 21" /><line x1="15" y1="15" x2="21" y2="21" /><line x1="4" y1="4" x2="9" y2="9" /></>,
  alerts: <><path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9" /><path d="M13.73 21a2 2 0 0 1-3.46 0" /></>,
  editor: <><path d="M12 20h9" /><path d="M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4z" /></>,
  issues: <><path d="M8 2l1.88 1.88" /><path d="M14.12 3.88L16 2" /><path d="M9 7.13v-1a3 3 0 1 1 6 0v1" /><path d="M12 20c-3.3 0-6-2.7-6-6v-3a4 4 0 0 1 4-4h4a4 4 0 0 1 4 4v3c0 3.3-2.7 6-6 6z" /><path d="M12 20v-9" /><path d="M6.53 9C4.6 8.8 3 7.1 3 5" /><path d="M6 13H2" /><path d="M3 21c0-2.1 1.7-3.9 3.8-4" /><path d="M20.97 5c0 2.1-1.6 3.8-3.5 4" /><path d="M22 13h-4" /><path d="M17.2 17c2.1.1 3.8 1.9 3.8 4" /></>,
  activity: <><circle cx="12" cy="12" r="10" /><polyline points="12 6 12 12 16 14" /></>,
};

export function SectionIcon({ id }) {
  return (
    <svg className="nav-ico" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      {ICONS[id] || <circle cx="12" cy="12" r="4" />}
    </svg>
  );
}
