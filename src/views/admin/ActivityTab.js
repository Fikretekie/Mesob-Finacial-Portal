import React, { useEffect, useMemo, useState } from "react";
import { listAudit } from "utils/adminApi";
import { Notice, fmtDateTime } from "./shared";

const LABELS = {
  "user.extendTrial": "Extended trial",
  "user.setTrial": "Set trial end",
  "user.grantComp": "Granted free access",
  "user.revokeComp": "Removed free access",
  "user.setRole": "Changed role",
  "user.suspend": "Suspended account",
  "user.unsuspend": "Reactivated account",
  "user.note": "Edited note",
  "data.restore": "Restored data",
  "message.send": "Sent message",
  "message.schedule": "Scheduled message",
  "banner.publish": "Published banner",
  "policy.publish": "Published policy",
  "site.update": "Changed site settings",
  "staff.invite": "Invited staff",
  "staff.update": "Changed staff access",
  "staff.resendInvite": "Re-sent staff invite",
  "staff.disable": "Disabled staff login",
  "staff.enable": "Re-enabled staff login",
  "staff.remove": "Removed staff",
  "support.reply": "Replied to support",
  "support.status": "Changed ticket status",
  "support.assign": "Assigned ticket",
  "support.priority": "Changed ticket priority",
  "request.export": "Completed data export",
  "request.delete": "Deleted account on request",
  "recycle.restore": "Restored from recycle bin",
  "recycle.purge": "Permanently deleted",
  "automation.create": "Created automation",
  "automation.update": "Edited automation",
  "automation.on": "Turned automation on",
  "automation.off": "Turned automation off",
  "promo.create": "Created promo code",
  "promo.on": "Turned promo code on",
  "promo.off": "Turned promo code off",
  "referral.on": "Turned referrals on",
  "referral.off": "Turned referrals off",
  "referral.update": "Changed referral reward",
  "changelog.publish": "Published update",
  "changelog.save": "Saved update draft",
  "changelog.delete": "Deleted update",
  "incident.resolve": "Resolved incident",
  "billing.refund": "Refunded",
  "billing.cancel": "Cancelled subscription",
  "billing.pause": "Paused subscription",
  "billing.resume": "Resumed subscription",
  "billing.switch": "Changed plan",
  "approval.request": "Asked for approval",
  "approval.approve": "Approved",
  "approval.reject": "Rejected",
  "approval.policy": "Changed approval rules",
  "support.escalate": "Escalated late ticket",
  "support.deadlines": "Changed response deadlines",
  "article.publish": "Published help article",
  "article.save": "Saved article draft",
  "article.delete": "Deleted help article",
  "rule.create": "Created rule",
  "rule.update": "Edited rule",
  "rule.on": "Turned rule on",
  "rule.off": "Turned rule off",
  "rule.delete": "Deleted rule",
  "alerts.update": "Changed alert settings",
  "content.publish": "Published website/app content",
  "issue.status": "Changed issue status",
  "issue.assign": "Assigned issue",
  "issue.priority": "Changed issue priority",
  "issue.fixed": "Marked issue fixed",
  "issue.note": "Noted on issue",
};

const GROUPS = [
  { id: "all", label: "All", test: () => true },
  { id: "user", label: "Accounts", test: (a) => /^(user|support|billing)\./.test(a) },
  { id: "approval", label: "Approvals", test: (a) => a.startsWith("approval.") },
  { id: "data", label: "Data", test: (a) => a.startsWith("data.") || a.startsWith("request.") || a.startsWith("recycle.") },
  { id: "message", label: "Messages", test: (a) => /^(message|banner|automation|promo|referral)\./.test(a) },
  { id: "site", label: "Site & policies", test: (a) => /^(site|policy|changelog|incident|content|issue)\./.test(a) },
  { id: "staff", label: "Staff", test: (a) => a.startsWith("staff.") },
];

const tone = (a) => (["user.suspend", "user.setRole", "staff.disable", "staff.remove", "request.delete", "recycle.purge"].includes(a) ? "red" : a.startsWith("site.") || a.startsWith("policy.") ? "amber" : "green");

export default function ActivityTab() {
  const [state, setState] = useState({ entries: null, source: null });
  const [group, setGroup] = useState("all");
  const [query, setQuery] = useState("");

  useEffect(() => {
    listAudit().then(setState);
  }, []);

  const list = useMemo(() => {
    if (!state.entries) return [];
    const g = GROUPS.find((x) => x.id === group);
    const q = query.trim().toLowerCase();
    return state.entries
      .filter((e) => g.test(e.action || ""))
      .filter((e) => !q || [e.target, e.detail, e.by, LABELS[e.action]].some((v) => String(v || "").toLowerCase().includes(q)))
      .sort((a, b) => new Date(b.at) - new Date(a.at));
  }, [state.entries, group, query]);

  return (
    <section className="oc-card">
      <div className="oc-card__head oc-users__head">
        <h2 className="oc-card__title">Activity</h2>
        <input className="oc-search" type="search" placeholder="Search who, what…" aria-label="Search activity" value={query} onChange={(e) => setQuery(e.target.value)} />
      </div>
      {state.source === "local" && <Notice>The shared activity log isn't connected yet, so this only shows actions taken in this browser.</Notice>}
      <div className="oc-filters" role="group" aria-label="Filter activity">
        {GROUPS.map((g) => (
          <button key={g.id} type="button" className={`oc-pill${group === g.id ? " is-on" : ""}`} aria-pressed={group === g.id} onClick={() => setGroup(g.id)}>{g.label}</button>
        ))}
      </div>
      {!state.entries ? (
        <div className="oc-skel oc-skel--block" />
      ) : list.length === 0 ? (
        <p className="oc-empty">{state.entries.length ? "Nothing matches." : "No admin actions recorded yet."}</p>
      ) : (
        <ul className="oc-log">
          {list.map((e) => (
            <li key={e.id} className={`oc-log__item oc-edge--${tone(e.action || "")}`}>
              <span className="oc-log__what">
                {LABELS[e.action] || e.action} <span className="oc-log__target">· {e.target}</span>
              </span>
              {e.detail && <span className="oc-log__detail">{e.detail}</span>}
              <span className="oc-log__meta mono">{fmtDateTime(new Date(e.at))} · {e.by}</span>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
