import React, { useCallback, useEffect, useMemo, useState } from "react";
import { Helmet } from "react-helmet";
import { useTranslation } from "react-i18next";
import { useSearchParams } from "react-router-dom";
import { CURRENT_ENV } from "../config/api";
import { loadDirectory, isDemo, setDemo, fetchOwnPerms } from "utils/adminApi";
import { AccessContext, useConsoleAccess, announcePerms, setPreview, currentRole, STAFF_ROLE } from "utils/staffAccess";
import { buildRows, DAY, fmtDate, fmtMoney, Notice } from "./admin/shared";
import { visibleSections, localize } from "./admin/consoleNav";
import useBadges from "./admin/useBadges";
import { GlobalSearch, AlertsBell } from "./admin/HeaderTools";
import UsersTab from "./admin/UsersTab";
import RecoveryTab from "./admin/RecoveryTab";
import MessagesTab from "./admin/MessagesTab";
import PoliciesTab from "./admin/PoliciesTab";
import SiteControlTab from "./admin/SiteControlTab";
import ActivityTab from "./admin/ActivityTab";
import StaffTab from "./admin/StaffTab";
import RevenueTab from "./admin/RevenueTab";
import UsageTab from "./admin/UsageTab";
import HealthTab from "./admin/HealthTab";
import SupportTab from "./admin/SupportTab";
import RequestsTab from "./admin/RequestsTab";
import AutomationsTab from "./admin/AutomationsTab";
import PromotionsTab from "./admin/PromotionsTab";
import ChangelogTab from "./admin/ChangelogTab";
import ApprovalsTab from "./admin/ApprovalsTab";
import ArticlesTab from "./admin/ArticlesTab";
import RulesTab from "./admin/RulesTab";
import AlertsTab from "./admin/AlertsTab";
import SiteEditorTab from "./admin/SiteEditorTab";
import IssuesTab from "./admin/IssuesTab";
import "../assets/css/owner-console.css";
import "../assets/css/owner-console-tabs.css";
import "../assets/css/owner-console-more.css";
import "../assets/css/owner-console-crm.css";
import "../assets/css/owner-console-studio.css";

// List prices, used only when a subscription record carries no amount of its
// own. The MRR tile says "est." because of this fallback.
const LIST_PRICE_MONTHLY = 24.99;
const LIST_PRICE_YEARLY = 249.99;

const NEEDS_DIRECTORY = ["overview", "users", "recovery", "messages"];

const monthlyValue = (sub) => {
  const yearly = /year|annual/i.test(`${sub.subscriptionPlan || ""} ${sub.interval || ""}`);
  const raw = sub.amount ?? sub.price ?? sub.plan?.amount;
  if (raw != null && !Number.isNaN(Number(raw))) {
    const amt = Number(raw) > 1000 ? Number(raw) / 100 : Number(raw);
    return { value: yearly ? amt / 12 : amt, estimated: false };
  }
  return { value: yearly ? LIST_PRICE_YEARLY / 12 : LIST_PRICE_MONTHLY, estimated: true };
};

function weeklySignups(rows, now, weeks = 12) {
  const start = new Date(now);
  start.setHours(0, 0, 0, 0);
  start.setDate(start.getDate() - start.getDay() - (weeks - 1) * 7);
  const buckets = Array.from({ length: weeks }, (_, i) => ({ start: new Date(start.getTime() + i * 7 * DAY), count: 0 }));
  rows.forEach((r) => {
    if (!r.signedUp || r.signedUp < start) return;
    const i = Math.floor((r.signedUp - start) / (7 * DAY));
    if (buckets[i]) buckets[i].count += 1;
  });
  return buckets;
}

function SignupChart({ buckets }) {
  const max = Math.max(1, ...buckets.map((b) => b.count));
  const total = buckets.reduce((a, b) => a + b.count, 0);
  return (
    <div className="oc-bars" role="img" aria-label={`${total} signups over the last ${buckets.length} weeks`}>
      {buckets.map((b, i) => (
        <div className="oc-bars__col" key={i} title={`Week of ${fmtDate(b.start)}: ${b.count}`}>
          <span className="oc-bars__val mono">{b.count || ""}</span>
          <div className="oc-bars__track">
            <div className="oc-bars__bar" style={{ "--h": `${(b.count / max) * 100}%` }} />
          </div>
          <span className="oc-bars__lbl mono">{b.start.toLocaleDateString(undefined, { month: "numeric", day: "numeric" })}</span>
        </div>
      ))}
    </div>
  );
}

function Mix({ parts }) {
  const total = parts.reduce((a, p) => a + p.n, 0);
  return (
    <div className="oc-mix">
      <div className="oc-mix__bar" aria-hidden="true">
        {total > 0 && parts.filter((p) => p.n > 0).map((p) => <span key={p.label} className={`oc-mix__seg oc-tone--${p.tone}`} style={{ "--w": `${(p.n / total) * 100}%` }} />)}
      </div>
      <ul className="oc-mix__legend">
        {parts.map((p) => (
          <li key={p.label}>
            <span className={`oc-dot oc-tone--${p.tone}`} />
            <span className="oc-mix__name">{p.label}</span>
            <span className="mono oc-mix__n">{p.n}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

function Overview({ t, rows, loading, now, onOpenUser, onGo, can, badges, sections }) {
  const stats = useMemo(() => {
    const in30 = rows.filter((r) => r.signedUp && now - r.signedUp <= 30 * DAY).length;
    const prev30 = rows.filter((r) => r.signedUp && now - r.signedUp > 30 * DAY && now - r.signedUp <= 60 * DAY).length;
    const paying = rows.filter((r) => r.status === "active");
    let mrr = 0;
    let estimated = false;
    paying.forEach((r) => {
      const m = monthlyValue(r.sub);
      mrr += m.value;
      estimated = estimated || m.estimated;
    });
    const count = (...st) => rows.filter((r) => st.includes(r.status)).length;
    const billing = (p) => paying.filter((r) => (r.billing || "").toLowerCase() === p).length;
    return {
      total: rows.length,
      in30,
      delta: in30 - prev30,
      paying: paying.length,
      trial: count("trial", "trialing"),
      mrr,
      estimated,
      conversion: rows.length ? (paying.length / rows.length) * 100 : 0,
      stripe: billing("stripe"),
      paypal: billing("paypal"),
      mix: [
        { label: "Paying", n: paying.length, tone: "green" },
        { label: "Comped", n: count("comped"), tone: "teal" },
        { label: "In trial", n: count("trial", "trialing"), tone: "accent" },
        { label: "Past due", n: count("past_due"), tone: "red" },
        { label: "Trial expired", n: count("expired"), tone: "amber" },
        { label: "Canceled / none / suspended", n: count("canceled", "none", "suspended"), tone: "muted" },
      ],
    };
  }, [rows, now]);

  const attention = useMemo(() => {
    const items = [];
    rows.forEach((r) => {
      if (r.status === "past_due") items.push({ r, why: "Payment failed — subscription past due", tone: "red", rank: 0 });
      else if (r.dataDeletedAt && now - r.dataDeletedAt <= 14 * DAY) items.push({ r, why: `Deleted all their data ${fmtDate(r.dataDeletedAt)} — backup on file`, tone: "amber", rank: 1 });
      else if (r.status === "trial" && r.trialEnd && r.trialEnd - now <= 7 * DAY) {
        const d = Math.max(0, Math.ceil((r.trialEnd - now) / DAY));
        items.push({ r, why: `Trial ends in ${d} day${d === 1 ? "" : "s"}, no plan yet`, tone: "amber", rank: 2 });
      } else if (r.status === "expired" && r.trialEnd && now - r.trialEnd <= 14 * DAY) {
        items.push({ r, why: `Trial expired ${fmtDate(r.trialEnd)} — didn't convert`, tone: "amber", rank: 3 });
      }
    });
    return items.sort((a, b) => a.rank - b.rank).slice(0, 8);
  }, [rows, now]);

  const weeks = useMemo(() => weeklySignups(rows, now), [rows, now]);

  const tiles = [
    { k: "Total users", v: stats.total, foot: `${stats.conversion.toFixed(1)}% paying` },
    { k: "New · 30 days", v: stats.in30, foot: `${stats.delta >= 0 ? "+" : "−"}${Math.abs(stats.delta)} vs prior 30d`, tone: stats.delta > 0 ? "green" : stats.delta < 0 ? "red" : null },
    { k: "Paying", v: stats.paying, foot: `${stats.stripe} Stripe · ${stats.paypal} PayPal` },
    { k: "In trial", v: stats.trial, foot: `${attention.filter((a) => a.rank === 2).length} ending ≤ 7 days` },
    { k: stats.estimated ? "MRR · est." : "MRR", v: fmtMoney(stats.mrr), foot: stats.estimated ? `at list $${LIST_PRICE_MONTHLY}/mo` : "from plan amounts" },
  ];

  return (
    <>
      <section className="oc-card oc-waiting-card" aria-label={t("console.common.waiting", "Waiting on you")}>
          <div className="oc-card__head">
            <h2 className="oc-card__title">{t("console.common.waiting", "Waiting on you")}</h2>
          </div>
          <div className="oc-waiting">
            {[
              { tab: "approvals", n: badges.approvals, label: "approvals", tone: "red" },
              { tab: "support", n: badges.support, label: badges.supportOverdue ? "tickets to work on · some overdue" : "tickets to work on", tone: badges.supportOverdue ? "red" : "amber" },
              { tab: "requests", n: badges.requests, label: "data requests", tone: "amber" },
              { tab: "issues", n: badges.issues, label: "new issues", tone: "red" },
              { tab: "health", n: badges.health, label: "services with problems", tone: "amber" },
            ]
              .filter((w) => sections.some((s) => s.id === w.tab))
              .map((w) => (
                <button key={w.tab} type="button" className={`oc-waiting__item oc-edge--${w.n ? w.tone : "green"}`} onClick={() => onGo(w.tab)}>
                  <span className="oc-waiting__n mono">{w.n ?? "—"}</span>
                  <span className="oc-waiting__label">{w.n ? w.label : `no ${w.label.split(" ·")[0]}`}</span>
                </button>
              ))}
          </div>
        </section>

      <section className="oc-kpis" aria-busy={loading}>
        {tiles.map((t) => (
          <div className="oc-kpi" key={t.k}>
            <span className="oc-kpi__k mono">{t.k}</span>
            <span className="oc-kpi__v mono">{loading ? <span className="oc-skel" /> : t.v}</span>
            <span className={`oc-kpi__foot mono${t.tone ? ` oc-text--${t.tone}` : ""}`}>{loading ? "" : t.foot}</span>
          </div>
        ))}
      </section>

      <section className="oc-grid">
        <div className="oc-card oc-card--wide">
          <div className="oc-card__head">
            <h2 className="oc-card__title">Signups</h2>
            <span className="oc-card__meta mono">weekly · last 12 weeks</span>
          </div>
          {loading ? <div className="oc-skel oc-skel--block" /> : <SignupChart buckets={weeks} />}
        </div>

        <div className="oc-card">
          <div className="oc-card__head">
            <h2 className="oc-card__title">Account status</h2>
            <span className="oc-card__meta mono">{stats.total} users</span>
          </div>
          {loading ? <div className="oc-skel oc-skel--block" /> : <Mix parts={stats.mix} />}
        </div>

        <div className="oc-card">
          <div className="oc-card__head">
            <h2 className="oc-card__title">Needs attention</h2>
            <span className="oc-card__meta mono">{attention.length}</span>
          </div>
          {loading ? (
            <div className="oc-skel oc-skel--block" />
          ) : attention.length === 0 ? (
            <p className="oc-empty">Nothing waiting on you. No failed payments, wiped accounts or trials about to lapse.</p>
          ) : (
            <ul className="oc-attn">
              {attention.map(({ r, why, tone }) => (
                <li key={r.id}>
                  <button type="button" className={`oc-attn__item oc-edge--${tone}`} onClick={() => onOpenUser(r)} disabled={!can("users.view")}>
                    <span className="oc-attn__who">{r.name || r.email}</span>
                    <span className="oc-attn__why">{why}</span>
                    <span className="oc-attn__go" aria-hidden="true">›</span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>

        <div className="oc-card oc-card--wide oc-shortcuts">
          {[
            { tab: "messages", perm: "messages.send", t: "Send a message", d: "Email, push or an in-app banner to any group" },
            { tab: "recovery", perm: "data.restore", t: "Restore deleted data", d: "Put a customer's wiped transactions back" },
            { tab: "policies", perm: "policies.publish", t: "Update a policy", d: "Publish Terms or Privacy and ask for re-acceptance" },
            { tab: "site", perm: "site.manage", t: "Site control", d: "Banner, maintenance mode, feature switches, app version" },
          ].filter((s) => can(s.perm)).map((s) => (
            <button key={s.tab} type="button" className="oc-shortcut" onClick={() => onGo(s.tab)}>
              <span className="oc-shortcut__t">{s.t}</span>
              <span className="oc-shortcut__d">{s.d}</span>
            </button>
          ))}
        </div>
      </section>
    </>
  );
}

export default function OwnerConsole() {
  const role = currentRole();
  const [params, setParams] = useSearchParams();
  const access = useConsoleAccess();
  const preview = access.preview;
  const [staffDisabled, setStaffDisabled] = useState(false);
  const { t } = useTranslation();
  const sections = visibleSections(access).map((s) => localize(t, s));
  const tab = sections.some((s) => s.id === params.get("tab")) ? params.get("tab") : sections[0]?.id;
  const section = sections.find((s) => s.id === tab);
  const [demo, setDemoState] = useState(isDemo());
  const [dir, setDir] = useState({ users: [], subs: [], errors: {} });
  const [loading, setLoading] = useState(true);
  const [loadedAt, setLoadedAt] = useState(null);
  const [focus, setFocus] = useState({});
  const [recoverFor, setRecoverFor] = useState(null);
  const [messageTo, setMessageTo] = useState(null);
  const badges = useBadges(sections.length > 0);

  const go = useCallback((id) => setParams({ tab: id }), [setParams]);
  const pick = useCallback(
    (r) => {
      if (r.id) setFocus({ [r.tab]: r.id });
      go(r.tab);
    },
    [go]
  );

  const load = useCallback(async () => {
    setLoading(true);
    setDir(await loadDirectory());
    setLoadedAt(new Date());
    setLoading(false);
  }, []);

  useEffect(() => {
    if (role !== STAFF_ROLE) return;
    fetchOwnPerms().then((res) => {
      if (!res) return;
      announcePerms(res.perms);
      setStaffDisabled(res.disabled);
    });
  }, [role]);

  const needsDirectory = sections.some((s) => NEEDS_DIRECTORY.includes(s.id));
  useEffect(() => {
    if ((role === 0 || role === STAFF_ROLE) && needsDirectory) load();
    else setLoading(false);
  }, [role, load, demo, needsDirectory]);

  const now = useMemo(() => loadedAt || new Date(), [loadedAt]);
  const rows = useMemo(() => buildRows(dir.users, dir.subs, now), [dir, now]);

  const toggleDemo = () => {
    setDemo(!demo);
    setDemoState(!demo);
    window.dispatchEvent(new Event("oc:data"));
  };

  const clearFocus = useCallback(() => setFocus({}), []);
  const clearRecover = useCallback(() => setRecoverFor(null), []);
  const clearMessage = useCallback(() => setMessageTo(null), []);
  const openUser = useCallback((id) => pick({ tab: "users", id }), [pick]);

  if ((role !== 0 && role !== STAFF_ROLE) || staffDisabled || !sections.length) {
    return (
      <div className="oc-page">
        <div className="oc-state">
          <h2 className="oc-state__title">{staffDisabled ? "Your access is turned off" : role === STAFF_ROLE ? "No access yet" : "Staff and owners only"}</h2>
          <p className="oc-state__sub">
            {role === STAFF_ROLE ? "Ask the account owner to give you permissions in Staff." : "This console is limited to Meksova staff and super-admin accounts."}
          </p>
        </div>
      </div>
    );
  }

  const { errors } = dir;
  const bothFailed = errors.users && errors.subs;

  return (
    <div className="oc-page">
      <Helmet>
        <title>{section.label} - Meksova console</title>
      </Helmet>

      <div className="oc-topbar">
        <GlobalSearch rows={rows} sections={sections} onPick={pick} />
        <div className="oc-topbar__tools">
          <AlertsBell sections={sections} onPick={pick} />
          {(access.isOwner || preview) && (
            <label className={`oc-demo${demo ? " is-on" : ""}`}>
              <input type="checkbox" checked={demo} onChange={toggleDemo} />
              <span>{t("console.common.demo", "Demo data")}</span>
            </label>
          )}
          <button type="button" className="oc-btn oc-btn--ghost" onClick={load} disabled={loading}>{loading ? t("console.common.refreshing", "Refreshing…") : t("console.common.refresh", "Refresh")}</button>
        </div>
      </div>

      <header className="oc-head">
        <div>
          <p className="oc-eyebrow mono">
            {section.groupLabel} · {demo ? t("console.common.demo", "Demo data").toLowerCase() : CURRENT_ENV}
            {loadedAt ? ` · ${t("console.common.updated", "updated")} ${loadedAt.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })}` : ""}
          </p>
          <h1 className="oc-title">{section.label}</h1>
          <p className="oc-sub">{section.purpose}</p>
        </div>
      </header>

      {preview && (
        <div className="oc-preview-bar" role="status">
          <span>
            Previewing as <b>{preview.who}</b> · {preview.perms.length} permission{preview.perms.length === 1 ? "" : "s"}. The sidebar and every page show exactly what they see.
          </span>
          <button type="button" className="oc-btn" onClick={() => { setPreview(null); go("staff"); }}>{t("console.common.exitPreview", "Exit preview")}</button>
        </div>
      )}

      {demo && <Notice tone="accent">{t("console.common.demoNotice", "Demo data: everything here is made up and nothing you do reaches real customers. Turn it off to work on live data.")}</Notice>}

      {!demo && (errors.users || errors.subs) && !bothFailed && (
        <Notice>{errors.users ? "User list" : "Subscription list"} couldn't load ({String(errors.users || errors.subs)}). Figures are partial.</Notice>
      )}

      <AccessContext.Provider value={access}>
      {bothFailed && NEEDS_DIRECTORY.includes(tab) ? (
        <div className="oc-state">
          <h2 className="oc-state__title">Couldn't load customer data</h2>
          <p className="oc-state__sub">
            Users: {String(errors.users)} · Subscriptions: {String(errors.subs)}. A 403 means the API's per-user guard is blocking list reads; it needs a super-admin exception on the backend. Turn on Demo data to try the console in the meantime.
          </p>
          <button type="button" className="oc-btn" onClick={load}>Try again</button>
        </div>
      ) : (
        <div aria-label={section.label} role="region">
          {tab === "overview" && <Overview t={t} rows={rows} loading={loading} now={now} can={access.can} badges={badges} sections={sections} onOpenUser={(r) => openUser(r.id)} onGo={go} />}
          {tab === "approvals" && <ApprovalsTab key={`ap${demo}`} />}
          {tab === "users" && (
            <UsersTab
              rows={rows}
              loading={loading}
              onChanged={load}
              focusId={focus.users}
              onFocusHandled={clearFocus}
              onRestore={(r) => { setRecoverFor(r.id); go("recovery"); }}
              onMessage={(list) => { setMessageTo(list); go("messages"); }}
            />
          )}
          {tab === "support" && <SupportTab key={`su${demo}`} onOpenUser={openUser} focusId={focus.support} onFocusHandled={clearFocus} />}
          {tab === "requests" && <RequestsTab key={`rq${demo}`} onOpenUser={openUser} />}
          {tab === "recovery" && <RecoveryTab rows={rows} presetId={recoverFor} onPresetHandled={clearRecover} onChanged={load} />}
          {tab === "revenue" && <RevenueTab key={`rv${demo}`} />}
          {tab === "usage" && <UsageTab key={`us${demo}`} />}
          {tab === "messages" && <MessagesTab rows={rows} preset={messageTo} onPresetHandled={clearMessage} />}
          {tab === "automations" && <AutomationsTab key={`au${demo}`} />}
          {tab === "promos" && <PromotionsTab key={`pr${demo}`} />}
          {tab === "articles" && <ArticlesTab key={`ar${demo}`} />}
          {tab === "editor" && <SiteEditorTab key={`ed${demo}`} />}
          {tab === "issues" && <IssuesTab key={`is${demo}`} />}
          {tab === "site" && <SiteControlTab key={`s${demo}`} />}
          {tab === "health" && <HealthTab key={`h${demo}`} onGo={go} />}
          {tab === "policies" && <PoliciesTab key={`p${demo}`} />}
          {tab === "changelog" && <ChangelogTab key={`cl${demo}`} />}
          {tab === "staff" && <StaffTab key={`st${demo}`} onPreview={(perms, who) => { setPreview({ perms, who }); go("overview"); }} />}
          {tab === "rules" && <RulesTab key={`ru${demo}`} />}
          {tab === "alerts" && <AlertsTab key={`al${demo}`} />}
          {tab === "activity" && <ActivityTab key={`a${demo}`} />}
        </div>
      )}
      </AccessContext.Provider>
    </div>
  );
}
