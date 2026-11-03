import React, { useCallback, useEffect, useMemo, useState } from "react";
import { getData, putData } from "utils/adminData";
import { listStaff } from "utils/adminApi";
import { useAccess } from "utils/staffAccess";
import { Drawer, Notice, fmtDateTime, relTime } from "./shared";
import { SLA_DEFAULTS, ticketDue, fmtLeft } from "./sla";

const STATUSES = [
  { id: "open", label: "Open", tone: "red" },
  { id: "pending", label: "Waiting on customer", tone: "amber" },
  { id: "resolved", label: "Resolved", tone: "green" },
];
const PRIORITY_TONE = { urgent: "red", high: "amber", normal: "muted", low: "muted" };

const CANNED = [
  { label: "Bank connection", text: "Sorry about that! Bank links sometimes need a fresh sign-in. Go to Connections → your bank → Reconnect. If it still fails, tell me which bank and I'll look into it." },
  { label: "Billing check", text: "Thanks for flagging this — I've checked your account and your payment went through. Please sign out and back in; your plan should show as active." },
  { label: "Year-end report", text: "You'll find it under Financial Report → Download → Year-end summary. It's ready for your accountant or tax software." },
  { label: "Mileage on Android", text: "Please make sure Location is set to “Allow all the time” for Meksova and battery optimisation is off for the app. That keeps trips recording with the screen off." },
];

function DeadlineSettings({ policy, staff, onClose, onSaved }) {
  const [d, setD] = useState(JSON.parse(JSON.stringify(policy)));
  const [busy, setBusy] = useState(false);
  const setH = (k, v) => setD((x) => ({ ...x, hours: { ...x.hours, [k]: Math.max(1, Math.min(240, Number(v) || 1)) } }));
  return (
    <Drawer
      title="Response deadlines"
      sub="How fast each priority must get a reply. The clock starts when the customer writes and pauses while you wait on them."
      onClose={onClose}
      footer={
        <>
          <button type="button" className="oc-btn oc-btn--ghost" onClick={onClose}>Cancel</button>
          <button
            type="button"
            className="oc-btn"
            disabled={busy}
            onClick={async () => {
              setBusy(true);
              await putData("slaPolicy", d, { action: "support.deadlines", target: "response deadlines", detail: Object.entries(d.hours).map(([k, v]) => `${k} ${v}h`).join(", ") });
              onSaved();
            }}
          >
            Save
          </button>
        </>
      }
    >
      {["urgent", "high", "normal", "low"].map((k) => (
        <label key={k} className="oc-field oc-field--row">
          <span className="oc-field__label oc-cap">{k}</span>
          <span className="oc-inline oc-inline--tight">
            <input className="oc-input oc-input--narrow mono" type="number" min={1} max={240} value={d.hours[k]} onChange={(e) => setH(k, e.target.value)} />
            <span className="oc-muted">hours</span>
          </span>
        </label>
      ))}
      <label className="oc-field">
        <span className="oc-field__label">When a deadline is missed, hand the ticket to</span>
        <select className="oc-input" value={d.escalateTo} onChange={(e) => setD({ ...d, escalateTo: e.target.value })}>
          <option value="">Nobody — just flag it red</option>
          <option value={localStorage.getItem("user_email") || "owner"}>Me</option>
          {staff.map((s) => <option key={s.id} value={s.email}>{s.name || s.email}</option>)}
        </select>
      </label>
    </Drawer>
  );
}

export default function SupportTab({ onOpenUser, focusId, onFocusHandled }) {
  const { can, isOwner } = useAccess();
  const [tickets, setTickets] = useState(null);
  const [source, setSource] = useState(null);
  const [policy, setPolicy] = useState(SLA_DEFAULTS);
  const [articles, setArticles] = useState([]);
  const [staff, setStaff] = useState([]);
  const [filter, setFilter] = useState("active");
  const [openId, setOpenId] = useState(null);
  const [reply, setReply] = useState("");
  const [busy, setBusy] = useState(false);
  const [flash, setFlash] = useState(null);
  const [settings, setSettings] = useState(false);
  const [, tick] = useState(0);

  const load = useCallback(async () => {
    const [res, sla, art] = await Promise.all([getData("tickets"), getData("slaPolicy"), getData("articles")]);
    const pol = sla.data || SLA_DEFAULTS;
    let list = res.data || [];
    // Escalate anything past its deadline to the person the owner picked.
    if (pol.escalateTo && res.source !== "offline") {
      const late = list.filter((t) => ticketDue(t, pol).overdue && !t.escalated && t.assignee !== pol.escalateTo);
      for (const t of late) {
        await putData("tickets", { ...t, assignee: pol.escalateTo, escalated: true }, { action: "support.escalate", target: t.email, detail: `${t.subject} → ${pol.escalateTo}` });
      }
      if (late.length) list = (await getData("tickets")).data || [];
    }
    setTickets(list);
    setPolicy(pol);
    setArticles((art.data || []).filter((a) => a.status === "published"));
    setSource(res.source);
  }, []);

  useEffect(() => {
    load();
    listStaff().then((r) => setStaff(r.staff || [])).catch(() => {});
    const id = setInterval(() => tick((n) => n + 1), 60000);
    return () => clearInterval(id);
  }, [load]);

  useEffect(() => {
    if (focusId) {
      setOpenId(focusId);
      setFilter("all");
      onFocusHandled();
    }
  }, [focusId, onFocusHandled]);

  const counts = useMemo(() => {
    const all = tickets || [];
    return {
      active: all.filter((t) => t.status !== "resolved").length,
      overdue: all.filter((t) => ticketDue(t, policy).overdue).length,
      open: all.filter((t) => t.status === "open").length,
      pending: all.filter((t) => t.status === "pending").length,
      resolved: all.filter((t) => t.status === "resolved").length,
      all: all.length,
    };
  }, [tickets, policy]);

  const list = useMemo(() => {
    const all = tickets || [];
    const shown = all.filter((t) => (filter === "all" ? true : filter === "active" ? t.status !== "resolved" : filter === "overdue" ? ticketDue(t, policy).overdue : t.status === filter));
    // Most urgent deadline first; tickets with no running clock after.
    return shown.sort((a, b) => {
      const da = ticketDue(a, policy);
      const db = ticketDue(b, policy);
      if (da.waiting !== db.waiting) return da.waiting ? -1 : 1;
      if (da.waiting) return da.msLeft - db.msLeft;
      return new Date(b.createdAt) - new Date(a.createdAt);
    });
  }, [tickets, filter, policy]);

  const t = (tickets || []).find((x) => x.id === openId) || null;
  const me = localStorage.getItem("user_email") || "owner";

  const save = async (next, action, detail) => {
    setBusy(true);
    setFlash(null);
    try {
      await putData("tickets", next, { action, target: next.email, detail });
      await load();
      return true;
    } catch (e) {
      setFlash({ tone: e.notConnected ? "amber" : "red", text: e.message });
      return false;
    } finally {
      setBusy(false);
    }
  };

  const send = async (status) => {
    const next = { ...t, status, assignee: t.assignee || me, messages: [...t.messages, { from: "staff", by: me, at: new Date().toISOString(), text: reply.trim() }] };
    if (await save(next, "support.reply", t.subject)) {
      setReply("");
      setFlash({ tone: "green", text: `Reply sent to ${t.email}.` });
    }
  };

  const insertArticle = (id) => {
    const a = articles.find((x) => x.id === id);
    if (!a) return;
    setReply((r) => `${r ? `${r}\n\n` : ""}${a.title}: https://app.meksova.com/help/${a.id}`);
  };

  if (!tickets) return <div className="oc-card"><div className="oc-skel oc-skel--block" /></div>;
  const due = t ? ticketDue(t, policy) : null;

  return (
    <>
      {source === "offline" && <Notice>The support inbox isn't connected yet. It needs the AdminData/tickets route and the Help Center form to save messages there.</Notice>}
      <div className="oc-inbox-bar">
        <span className="oc-muted">
          Deadlines: {Object.entries(policy.hours).map(([k, v]) => `${k} ${v}h`).join(" · ")}
          {policy.escalateTo ? ` · late tickets go to ${policy.escalateTo.split("@")[0]}` : ""}
        </span>
        {isOwner && <button type="button" className="oc-link-btn" onClick={() => setSettings(true)}>Change deadlines</button>}
      </div>
      <div className="oc-split oc-split--inbox">
        <section className="oc-card oc-inbox">
          <div className="oc-filters" role="group" aria-label="Filter tickets">
            {[
              ["active", "Needs work"],
              ["overdue", "Overdue"],
              ["pending", "Waiting on customer"],
              ["resolved", "Resolved"],
              ["all", "All"],
            ].map(([id, label]) => (
              <button key={id} type="button" className={`oc-pill${filter === id ? " is-on" : ""}${id === "overdue" && counts.overdue ? " is-alert" : ""}`} aria-pressed={filter === id} onClick={() => setFilter(id)}>
                {label} <span className="mono oc-pill__n">{counts[id]}</span>
              </button>
            ))}
          </div>
          {list.length === 0 ? (
            <p className="oc-empty">{filter === "active" ? "Inbox zero. Nothing waiting on you." : filter === "overdue" ? "Nothing overdue. Nice." : "Nothing here."}</p>
          ) : (
            <ul className="oc-picklist">
              {list.map((x) => {
                const last = x.messages[x.messages.length - 1];
                const d = ticketDue(x, policy);
                return (
                  <li key={x.id}>
                    <button type="button" className={`oc-picklist__item oc-ticket${x.id === openId ? " is-on" : ""}${d.overdue ? " is-late" : ""}`} aria-pressed={x.id === openId} onClick={() => { setOpenId(x.id); setFlash(null); }}>
                      <span className="oc-ticket__top">
                        <span className="oc-picklist__name">{x.subject}</span>
                        <span className="oc-picklist__meta mono">{relTime(last.at)}</span>
                      </span>
                      <span className="oc-picklist__meta">{x.name} · {x.channel}</span>
                      <span className="oc-ticket__chips">
                        {d.waiting && <span className={`oc-chip oc-chip--${d.overdue ? "red" : d.msLeft < 3600000 ? "amber" : "muted"} mono`}>{fmtLeft(d.msLeft)}</span>}
                        {x.priority !== "normal" && <span className={`oc-chip oc-chip--${PRIORITY_TONE[x.priority]}`}>{x.priority}</span>}
                        {x.escalated && <span className="oc-chip oc-chip--red">escalated</span>}
                        {x.assignee && <span className="oc-chip oc-chip--muted">{x.assignee.split("@")[0]}</span>}
                      </span>
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </section>

        <section className="oc-card oc-thread">
          {!t ? (
            <div className="oc-empty-state">
              <h2 className="oc-card__title">Pick a conversation</h2>
              <p className="oc-muted">Messages from the in-app Help Center and support email land here, next to the customer's account. The most urgent deadline is at the top.</p>
            </div>
          ) : (
            <>
              <div className="oc-card__head oc-users__head">
                <div className="oc-drawer__titles">
                  <h2 className="oc-card__title">{t.subject}</h2>
                  <p className="oc-muted">
                    {t.name} · {t.email} · opened {fmtDateTime(new Date(t.createdAt))}
                  </p>
                </div>
                {can("users.view") && <button type="button" className="oc-btn oc-btn--ghost" onClick={() => onOpenUser(t.userId)}>Open customer</button>}
              </div>

              {due?.waiting && (
                <div className={`oc-flash oc-edge--${due.overdue ? "red" : "amber"}`}>
                  {due.overdue ? "Past its deadline" : "Reply due"} — {fmtDateTime(due.dueAt)} ({fmtLeft(due.msLeft)})
                </div>
              )}

              <div className="oc-inline">
                <label className="oc-field oc-field--grow">
                  <span className="oc-field__label">Status</span>
                  <select className="oc-input" value={t.status} disabled={busy} onChange={(e) => save({ ...t, status: e.target.value }, "support.status", e.target.value)}>
                    {STATUSES.map((s) => <option key={s.id} value={s.id}>{s.label}</option>)}
                  </select>
                </label>
                <label className="oc-field oc-field--grow">
                  <span className="oc-field__label">Assigned to</span>
                  <select className="oc-input" value={t.assignee || ""} disabled={busy} onChange={(e) => save({ ...t, assignee: e.target.value }, "support.assign", e.target.value || "unassigned")}>
                    <option value="">Unassigned</option>
                    <option value={me}>Me ({me})</option>
                    {staff.filter((s) => s.email !== me).map((s) => <option key={s.id} value={s.email}>{s.name || s.email}</option>)}
                  </select>
                </label>
                <label className="oc-field oc-field--grow">
                  <span className="oc-field__label">Priority</span>
                  <select className="oc-input" value={t.priority} disabled={busy} onChange={(e) => save({ ...t, priority: e.target.value }, "support.priority", e.target.value)}>
                    {["urgent", "high", "normal", "low"].map((p) => <option key={p} value={p}>{p} · {policy.hours[p]}h</option>)}
                  </select>
                </label>
              </div>

              <ol className="oc-messages">
                {t.messages.map((m, i) => (
                  <li key={i} className={`oc-msg oc-msg--${m.from}`}>
                    <span className="oc-msg__who mono">{m.from === "customer" ? t.name : m.by} · {fmtDateTime(new Date(m.at))}</span>
                    <p className="oc-msg__text">{m.text}</p>
                  </li>
                ))}
              </ol>

              {flash && <div className={`oc-flash oc-edge--${flash.tone}`} role="status">{flash.text}</div>}

              <div className="oc-templates" role="group" aria-label="Saved replies">
                {CANNED.map((c) => (
                  <button key={c.label} type="button" className="oc-pill" onClick={() => setReply(c.text)}>{c.label}</button>
                ))}
              </div>
              <label className="oc-field">
                <span className="oc-field__label">Reply (emailed to the customer and shown in their Help Center)</span>
                <textarea className="oc-input oc-textarea" rows={4} value={reply} onChange={(e) => setReply(e.target.value)} />
              </label>
              <div className="oc-actions">
                <button type="button" className="oc-btn" disabled={!reply.trim() || busy} onClick={() => send("pending")}>Send</button>
                <button type="button" className="oc-btn oc-btn--ghost" disabled={!reply.trim() || busy} onClick={() => send("resolved")}>Send &amp; resolve</button>
                {articles.length > 0 && (
                  <select className="oc-input oc-input--auto" value="" onChange={(e) => insertArticle(e.target.value)} aria-label="Insert a help article">
                    <option value="">Insert help article…</option>
                    {articles.map((a) => <option key={a.id} value={a.id}>{a.title}</option>)}
                  </select>
                )}
              </div>
            </>
          )}
        </section>
      </div>
      {settings && <DeadlineSettings policy={policy} staff={staff} onClose={() => setSettings(false)} onSaved={() => { setSettings(false); load(); }} />}
    </>
  );
}
