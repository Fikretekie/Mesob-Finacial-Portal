import React, { useEffect, useRef } from "react";

export const DAY = 86400000;

export const STATUS_META = {
  active: { label: "Paying", tone: "green" },
  trialing: { label: "Trial (card)", tone: "accent" },
  trial: { label: "Free trial", tone: "accent" },
  past_due: { label: "Past due", tone: "red" },
  canceled: { label: "Canceled", tone: "muted" },
  expired: { label: "Trial expired", tone: "amber" },
  comped: { label: "Comped", tone: "green" },
  suspended: { label: "Suspended", tone: "red" },
  none: { label: "No plan", tone: "muted" },
};

export const ROLE_LABEL = { 0: "Super admin", 1: "Customer (no billing)", 2: "Customer", 3: "Staff" };

export const toDate = (v) => {
  if (!v) return null;
  const d = new Date(typeof v === "number" && v < 1e12 ? v * 1000 : v);
  return Number.isNaN(d.getTime()) ? null : d;
};

export const fmtDate = (d) =>
  d ? d.toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" }) : "—";

export const fmtDateTime = (d) =>
  d ? d.toLocaleString(undefined, { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" }) : "—";

export const fmtMoney = (n) =>
  `$${Number(n || 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

const normStatus = (s) => {
  const v = String(s || "").toLowerCase();
  if (v === "cancelled") return "canceled";
  if (v === "unpaid" || v === "suspended") return "past_due";
  return v;
};

export const providerOf = (sub) => {
  if (!sub) return null;
  if (sub.provider) return String(sub.provider);
  if (sub.id?.startsWith("I-")) return "PayPal";
  if (sub.id?.startsWith("sub_")) return "Stripe";
  return null;
};

// One row per user, with their newest subscription joined on userId / email.
export function buildRows(users, subs, now) {
  const byKey = new Map();
  subs.forEach((s) => {
    [s.userId, s.email?.toLowerCase()].filter(Boolean).forEach((k) => {
      const prev = byKey.get(k);
      if (!prev || (toDate(s.createdAt) || 0) > (toDate(prev.createdAt) || 0)) byKey.set(k, s);
    });
  });

  return users.map((u) => {
    const sub = byKey.get(u.id) || byKey.get(u.email?.toLowerCase()) || null;
    const trialEnd = toDate(u.trialEndDate);
    let status = sub ? normStatus(sub.status) : "none";
    if (!STATUS_META[status] || status === "none") {
      if (trialEnd && trialEnd > now) status = "trial";
      else if (trialEnd) status = "expired";
      else status = "none";
    }
    // Lifetime paid: the backend's figure when it sends one, otherwise an
    // estimate from how long they've been subscribed at list price.
    let paid = Number(u.totalPaid);
    let paidEstimated = false;
    if (!Number.isFinite(paid)) {
      paid = 0;
      if (sub && ["active", "past_due", "canceled"].includes(normStatus(sub.status))) {
        const since = toDate(sub.createdAt) || toDate(u.createdAt) || now;
        const yearly = /year/i.test(sub.subscriptionPlan || "");
        const periods = yearly ? Math.max(1, Math.ceil((now - since) / (365 * DAY))) : Math.max(1, Math.ceil((now - since) / (30 * DAY)));
        paid = periods * (yearly ? 249.99 : 24.99);
        paidEstimated = true;
      }
    }
    if (u.compedAccess && status !== "active") status = "comped";
    if (u.disabled) status = "suspended";
    return {
      id: u.id,
      name: u.name || u.companyName || "",
      email: u.email || "",
      phone: u.phone_number || u.phone || "",
      company: u.companyName || "",
      businessType: u.businessType || "",
      signedUp: toDate(u.createdAt || u.creationDate),
      trialEnd,
      lastActive: toDate(u.lastActiveAt || u.lastLoginAt),
      role: u.role,
      authProvider: u.provider || "",
      hasApp: Boolean(u.hasApp || u.pushToken),
      backups: Array.isArray(u.lastBackupUrls) ? u.lastBackupUrls : [],
      dataDeletedAt: toDate(u.dataDeletedAt),
      raw: u,
      sub,
      status,
      billing: providerOf(sub),
      paid,
      paidEstimated,
    };
  });
}

/** Audience filters shared by Users and Messages. */
export const AUDIENCES = [
  { id: "all", label: "Everyone", test: () => true },
  { id: "paying", label: "Paying", test: (r) => r.status === "active" || r.status === "comped" },
  { id: "trial", label: "In trial", test: (r) => r.status === "trial" || r.status === "trialing" },
  { id: "expired", label: "Trial expired", test: (r) => r.status === "expired" },
  { id: "past_due", label: "Past due", test: (r) => r.status === "past_due" },
  { id: "canceled", label: "Canceled / no plan", test: (r) => r.status === "canceled" || r.status === "none" },
  { id: "suspended", label: "Suspended", test: (r) => r.status === "suspended" },
];

export function StatusChip({ status }) {
  const meta = STATUS_META[status] || STATUS_META.none;
  return <span className={`oc-chip oc-chip--${meta.tone}`}>{meta.label}</span>;
}

export function Notice({ tone = "amber", children }) {
  return <div className={`oc-banner oc-banner--${tone}`} role="status">{children}</div>;
}

/** Side panel dialog: labelled, traps focus, Esc closes, focus returns. */
export function Drawer({ title, sub, onClose, children, footer }) {
  const ref = useRef(null);
  useEffect(() => {
    const opener = document.activeElement;
    ref.current?.querySelector("button, a, input, select, textarea")?.focus();
    return () => opener?.focus?.();
  }, []);

  const onKey = (e) => {
    if (e.key === "Escape") {
      e.stopPropagation();
      onClose();
      return;
    }
    if (e.key !== "Tab") return;
    const nodes = [...ref.current.querySelectorAll("button:not([disabled]), a[href], input:not([disabled]), select, textarea")];
    if (!nodes.length) return;
    const first = nodes[0];
    const last = nodes[nodes.length - 1];
    if (e.shiftKey && document.activeElement === first) {
      e.preventDefault();
      last.focus();
    } else if (!e.shiftKey && document.activeElement === last) {
      e.preventDefault();
      first.focus();
    }
  };

  return (
    <div className="oc-scrim" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <aside ref={ref} className="oc-drawer" role="dialog" aria-modal="true" aria-labelledby="oc-drawer-title" onKeyDown={onKey}>
        <header className="oc-drawer__head">
          <div className="oc-drawer__titles">
            <h2 id="oc-drawer-title" className="oc-drawer__title">{title}</h2>
            {sub && <p className="oc-drawer__sub">{sub}</p>}
          </div>
          <button type="button" className="oc-icon-btn" onClick={onClose} aria-label="Close">×</button>
        </header>
        <div className="oc-drawer__body">{children}</div>
        {footer && <footer className="oc-drawer__foot">{footer}</footer>}
      </aside>
    </div>
  );
}

/** Confirm dialog for destructive or customer-visible actions. */
export function Confirm({ title, body, confirmLabel = "Confirm", typeToConfirm, tone = "accent", busy, onConfirm, onClose }) {
  const [typed, setTyped] = React.useState("");
  const ok = !typeToConfirm || typed.trim().toUpperCase() === typeToConfirm;
  return (
    <Drawer
      title={title}
      onClose={onClose}
      footer={
        <>
          <button type="button" className="oc-btn oc-btn--ghost" onClick={onClose}>Cancel</button>
          <button type="button" className={`oc-btn${tone === "danger" ? " oc-btn--danger" : ""}`} disabled={!ok || busy} onClick={onConfirm}>
            {busy ? "Working…" : confirmLabel}
          </button>
        </>
      }
    >
      <div className="oc-confirm">{body}</div>
      {typeToConfirm && (
        <label className="oc-field">
          <span className="oc-field__label">Type {typeToConfirm} to continue</span>
          <input className="oc-input" value={typed} onChange={(e) => setTyped(e.target.value)} autoComplete="off" />
        </label>
      )}
    </Drawer>
  );
}

/** Column chart. Bars dim their siblings on hover; values are mono. */
export function BarChart({ values, labels, format = (v) => v, labelEvery = 1, title, tone = "accent", markLast }) {
  const max = Math.max(1, ...values);
  return (
    <div className="oc-bars" style={{ "--n": values.length }} role="img" aria-label={title}>
      {values.map((v, i) => (
        <div className="oc-bars__col" key={i} title={`${labels?.[i] ?? ""}: ${format(v)}`}>
          <span className="oc-bars__val mono">{values.length <= 14 && v ? format(v) : ""}</span>
          <div className="oc-bars__track">
            <div className={`oc-bars__bar oc-bars__bar--${tone}${markLast && i === values.length - 1 ? " is-last" : ""}`} style={{ "--h": `${(v / max) * 100}%` }} />
          </div>
          <span className="oc-bars__lbl mono">{i % labelEvery === 0 || i === values.length - 1 ? labels?.[i] : ""}</span>
        </div>
      ))}
    </div>
  );
}

/** Horizontal bars for ranked lists (features, reasons). */
export function HBars({ items, format = (v) => v, of }) {
  const max = of || Math.max(1, ...items.map((i) => i.value));
  return (
    <ul className="oc-hbars">
      {items.map((it) => (
        <li key={it.label} className="oc-hbars__row">
          <span className="oc-hbars__label">{it.label}</span>
          <span className="oc-hbars__track" aria-hidden="true">
            <span className={`oc-hbars__bar oc-tone--${it.tone || "accent"}`} style={{ "--w": `${(it.value / max) * 100}%` }} />
          </span>
          <span className="oc-hbars__val mono">{format(it.value)}</span>
        </li>
      ))}
    </ul>
  );
}

export function Kpis({ tiles, mini }) {
  return (
    <section className={`oc-kpis${mini ? " oc-kpis--mini" : ""}`} style={{ "--k": tiles.length }}>
      {tiles.map((t) => (
        <div className="oc-kpi" key={t.k}>
          <span className="oc-kpi__k mono">{t.k}</span>
          <span className="oc-kpi__v mono">{t.v}</span>
          {t.foot != null && <span className={`oc-kpi__foot mono${t.tone ? ` oc-text--${t.tone}` : ""}`}>{t.foot}</span>}
        </div>
      ))}
    </section>
  );
}

export const relTime = (d) => {
  if (!d) return "—";
  const ms = Date.now() - new Date(d).getTime();
  const abs = Math.abs(ms);
  const fut = ms < 0;
  const m = Math.round(abs / 60000);
  if (m < 60) return fut ? `in ${m}m` : `${m}m ago`;
  const h = Math.round(m / 60);
  if (h < 48) return fut ? `in ${h}h` : `${h}h ago`;
  const dd = Math.round(h / 24);
  return fut ? `in ${dd} days` : `${dd} days ago`;
};
