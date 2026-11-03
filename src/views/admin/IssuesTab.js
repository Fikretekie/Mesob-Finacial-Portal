import React, { useCallback, useEffect, useMemo, useState } from "react";
import { getData, putData } from "utils/adminData";
import { listStaff, loadConfig, saveConfig } from "utils/adminApi";
import { submitOrRun } from "utils/approvals";
import { localIssues } from "utils/issues";
import { useAccess } from "utils/staffAccess";
import { BarChart, Drawer, Kpis, Notice, fmtDateTime, relTime } from "./shared";

const STATUS = [
  { id: "new", label: "New", tone: "red" },
  { id: "investigating", label: "Investigating", tone: "amber" },
  { id: "fixing", label: "Fix in progress", tone: "accent" },
  { id: "fixed", label: "Fixed", tone: "green" },
  { id: "ignored", label: "Ignored", tone: "muted" },
];
const SOURCE = { frontend: "Website", app: "Phone app", backend: "Backend" };
const FEATURE_LABEL = { mileage: "Mileage tracker", receipts: "Receipts", connections: "Connections page", ifta: "IFTA & fuel", documents: "Documents", team: "Team seats" };

const statusMeta = (id) => STATUS.find((s) => s.id === id) || STATUS[0];

function IssueDrawer({ issue, staff, onClose, onSaved }) {
  const access = useAccess();
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [flash, setFlash] = useState(null);
  const [fixedIn, setFixedIn] = useState(issue.fixedIn || "");
  const me = localStorage.getItem("user_email") || "owner";

  const save = async (patch, action, detail, ok) => {
    setBusy(true);
    setFlash(null);
    try {
      if (issue.captured) throw new Error("This one was caught in your browser only. It becomes trackable once the AdminData/errors route stores reports.");
      await putData("issues", { ...issue, ...patch }, { action, target: issue.title, detail });
      setFlash({ tone: "green", text: ok });
      onSaved();
    } catch (e) {
      setFlash({ tone: e.notConnected ? "amber" : "red", text: e.message });
    } finally {
      setBusy(false);
    }
  };

  const featureOff = async () => {
    setBusy(true);
    setFlash(null);
    try {
      const { config } = await loadConfig();
      config.features = { ...config.features, [issue.feature]: false };
      const res = await submitOrRun("site.publish", access, { summary: `Turn off ${FEATURE_LABEL[issue.feature]} (issue: ${issue.title})`, payload: { config, action: "site.update", detail: `${FEATURE_LABEL[issue.feature]}: off` } }, () =>
        saveConfig(config, "site.update", `${FEATURE_LABEL[issue.feature]}: off (issue ${issue.id})`)
      );
      setFlash(res.pending ? { tone: "amber", text: "Sent to the owner for approval." } : { tone: "green", text: `${FEATURE_LABEL[issue.feature]} is now hidden for customers. Turn it back on in Site control once fixed.` });
    } catch (e) {
      setFlash({ tone: e.notConnected ? "amber" : "red", text: e.message });
    } finally {
      setBusy(false);
    }
  };

  const tellCustomers = async () => {
    setBusy(true);
    try {
      const { config } = await loadConfig();
      config.banner = { ...config.banner, enabled: true, id: `issue-${issue.id}`, tone: "warning", message: `We know about a problem with ${issue.area.split(" (")[0].toLowerCase()} and we're fixing it.`, linkText: "", linkUrl: "", audience: issue.platform === "Android app" ? "app" : "all", dismissible: true };
      await saveConfig(config, "banner.publish", `Issue: ${issue.title}`);
      setFlash({ tone: "green", text: "Banner is live for affected customers." });
    } catch (e) {
      setFlash({ tone: e.notConnected ? "amber" : "red", text: e.message });
    } finally {
      setBusy(false);
    }
  };

  const copyForDev = async () => {
    const text = [
      `## ${issue.title}`,
      `- Where: ${SOURCE[issue.source]} · ${issue.platform} · ${issue.page}`,
      `- Release: ${issue.release}`,
      `- Seen ${issue.count}× by ${issue.users} people · first ${fmtDateTime(new Date(issue.firstSeen))} · last ${fmtDateTime(new Date(issue.lastSeen))}`,
      "",
      "```",
      issue.stack || issue.message,
      "```",
      ...(issue.notes || []).map((n) => `> ${n.by}: ${n.text}`),
    ].join("\n");
    try {
      await navigator.clipboard.writeText(text);
      setFlash({ tone: "green", text: "Copied — paste it into a GitHub issue or send it to your developer." });
    } catch (e) {
      setFlash({ tone: "amber", text: "Couldn't copy automatically. Select the details below and copy them." });
    }
  };

  const days = issue.trend.map((_, i) => {
    const d = new Date(Date.now() - (issue.trend.length - 1 - i) * 86400000);
    return `${d.getMonth() + 1}/${d.getDate()}`;
  });

  return (
    <Drawer title={issue.title} sub={`${SOURCE[issue.source]} · ${issue.area}`} onClose={onClose}>
      <div className="oc-drawer__chips">
        <span className={`oc-chip oc-chip--${statusMeta(issue.status).tone}`}>{statusMeta(issue.status).label}</span>
        <span className={`oc-chip oc-chip--${issue.priority === "urgent" ? "red" : issue.priority === "high" ? "amber" : "muted"}`}>{issue.priority}</span>
        {issue.captured && <span className="oc-chip oc-chip--accent">caught in this browser</span>}
      </div>
      {flash && <div className={`oc-flash oc-edge--${flash.tone}`} role="status">{flash.text}</div>}

      <section className="oc-sec">
        <div className="oc-kvs">
          <div className="oc-kv"><span className="oc-kv__k mono">People hit</span><span className="oc-kv__v mono">{issue.users}</span></div>
          <div className="oc-kv"><span className="oc-kv__k mono">Times</span><span className="oc-kv__v mono">{issue.count}</span></div>
          <div className="oc-kv"><span className="oc-kv__k mono">Last seen</span><span className="oc-kv__v">{relTime(issue.lastSeen)}</span></div>
          <div className="oc-kv"><span className="oc-kv__k mono">First seen</span><span className="oc-kv__v">{fmtDateTime(new Date(issue.firstSeen))}</span></div>
          <div className="oc-kv"><span className="oc-kv__k mono">Device</span><span className="oc-kv__v">{issue.platform}</span></div>
          <div className="oc-kv"><span className="oc-kv__k mono">Release</span><span className="oc-kv__v mono">{issue.release}</span></div>
          <div className="oc-kv"><span className="oc-kv__k mono">Page / endpoint</span><span className="oc-kv__v mono">{issue.page}</span></div>
          <div className="oc-kv"><span className="oc-kv__k mono">Support tickets</span><span className="oc-kv__v mono">{issue.tickets ?? 0}</span></div>
        </div>
      </section>

      <section className="oc-sec">
        <h3 className="oc-sec__title">Last 14 days</h3>
        <BarChart values={issue.trend} labels={days} labelEvery={4} title="Occurrences per day" tone="red" />
      </section>

      <section className="oc-sec">
        <h3 className="oc-sec__title">Quick fixes</h3>
        <div className="oc-actions">
          {issue.feature && <button type="button" className="oc-btn oc-btn--ghost" disabled={busy} onClick={featureOff}>Turn off {FEATURE_LABEL[issue.feature]}</button>}
          {access.can("messages.send") && <button type="button" className="oc-btn oc-btn--ghost" disabled={busy} onClick={tellCustomers}>Tell affected customers</button>}
          <button type="button" className="oc-btn oc-btn--ghost" onClick={copyForDev}>Copy for developer</button>
        </div>
      </section>

      <section className="oc-sec">
        <h3 className="oc-sec__title">Error</h3>
        <pre className="oc-stack">{issue.stack || issue.message}</pre>
      </section>

      <section className="oc-sec">
        <h3 className="oc-sec__title">Work on it</h3>
        <div className="oc-inline">
          <label className="oc-field oc-field--grow">
            <span className="oc-field__label">Status</span>
            <select className="oc-input" value={issue.status} disabled={busy} onChange={(e) => save({ status: e.target.value }, "issue.status", e.target.value, `Status: ${statusMeta(e.target.value).label}.`)}>
              {STATUS.map((s) => <option key={s.id} value={s.id}>{s.label}</option>)}
            </select>
          </label>
          <label className="oc-field oc-field--grow">
            <span className="oc-field__label">Assigned to</span>
            <select className="oc-input" value={issue.assignee || ""} disabled={busy} onChange={(e) => save({ assignee: e.target.value }, "issue.assign", e.target.value || "unassigned", "Assigned.")}>
              <option value="">Nobody</option>
              <option value={me}>Me</option>
              {staff.filter((s) => s.email !== me).map((s) => <option key={s.id} value={s.email}>{s.name || s.email}</option>)}
            </select>
          </label>
          <label className="oc-field oc-field--grow">
            <span className="oc-field__label">Priority</span>
            <select className="oc-input" value={issue.priority} disabled={busy} onChange={(e) => save({ priority: e.target.value }, "issue.priority", e.target.value, "Priority changed.")}>
              {["urgent", "high", "normal", "low"].map((p) => <option key={p}>{p}</option>)}
            </select>
          </label>
        </div>
        <div className="oc-inline">
          <label className="oc-field oc-field--grow">
            <span className="oc-field__label">Fixed in (release or change)</span>
            <input className="oc-input mono" value={fixedIn} onChange={(e) => setFixedIn(e.target.value)} placeholder="1.6.1" />
          </label>
          <button type="button" className="oc-btn" disabled={busy || issue.status === "fixed"} onClick={() => save({ status: "fixed", fixedIn }, "issue.fixed", fixedIn || "", "Marked fixed. If it comes back, it reopens as New.")}>Mark fixed</button>
        </div>
        {(issue.notes || []).length > 0 && (
          <ol className="oc-messages">
            {issue.notes.map((n, i) => (
              <li key={i} className="oc-msg oc-msg--staff">
                <span className="oc-msg__who mono">{n.by} · {fmtDateTime(new Date(n.at))}</span>
                <p className="oc-msg__text">{n.text}</p>
              </li>
            ))}
          </ol>
        )}
        <label className="oc-field">
          <span className="oc-field__label">Add a note</span>
          <textarea className="oc-input oc-textarea" rows={2} value={note} onChange={(e) => setNote(e.target.value)} placeholder="What you found, what you tried…" />
        </label>
        <button type="button" className="oc-btn oc-btn--ghost" disabled={!note.trim() || busy} onClick={() => save({ notes: [...(issue.notes || []), { by: me, at: new Date().toISOString(), text: note.trim() }] }, "issue.note", note.trim().slice(0, 60), "Note added.").then(() => setNote(""))}>
          Add note
        </button>
      </section>
    </Drawer>
  );
}

export default function IssuesTab() {
  const [items, setItems] = useState(null);
  const [source, setSource] = useState(null);
  const [staff, setStaff] = useState([]);
  const [status, setStatus] = useState("open");
  const [where, setWhere] = useState("all");
  const [openId, setOpenId] = useState(null);

  const load = useCallback(async () => {
    const r = await getData("issues");
    setItems([...(r.data || []), ...localIssues()]);
    setSource(r.source);
  }, []);
  useEffect(() => {
    load();
    listStaff().then((s) => setStaff(s.staff || [])).catch(() => {});
  }, [load]);

  const list = useMemo(
    () =>
      (items || [])
        .filter((i) => (status === "open" ? !["fixed", "ignored"].includes(i.status) : status === "all" ? true : i.status === status))
        .filter((i) => where === "all" || i.source === where)
        .sort((a, b) => b.users - a.users || new Date(b.lastSeen) - new Date(a.lastSeen)),
    [items, status, where]
  );

  if (!items) return <div className="oc-card"><div className="oc-skel oc-skel--block" /></div>;
  const open = items.filter((i) => !["fixed", "ignored"].includes(i.status));
  const issue = items.find((i) => i.id === openId);

  return (
    <>
      <Kpis
        tiles={[
          { k: "Open issues", v: open.length, tone: open.length ? "red" : "green" },
          { k: "People affected", v: open.reduce((a, i) => a + i.users, 0), foot: "across open issues" },
          { k: "New, unassigned", v: open.filter((i) => i.status === "new" && !i.assignee).length, tone: open.some((i) => i.status === "new" && !i.assignee) ? "red" : null },
          { k: "Fixed · 30 days", v: items.filter((i) => i.status === "fixed").length },
        ]}
      />
      {source === "offline" && <Notice>Only errors caught in this browser are shown. The app now reports crashes automatically; storing them for everyone needs the AdminData/errors and AdminData/issues routes, plus CloudWatch alarms for the backend.</Notice>}

      <section className="oc-card">
        <div className="oc-filters" role="group" aria-label="Filter by status">
          {[["open", "Open"], ...STATUS.map((s) => [s.id, s.label]), ["all", "All"]].map(([id, label]) => (
            <button key={id} type="button" className={`oc-pill${status === id ? " is-on" : ""}`} aria-pressed={status === id} onClick={() => setStatus(id)}>{label}</button>
          ))}
        </div>
        <div className="oc-filters" role="group" aria-label="Filter by where">
          {[["all", "Everywhere"], ...Object.entries(SOURCE)].map(([id, label]) => (
            <button key={id} type="button" className={`oc-pill${where === id ? " is-on" : ""}`} aria-pressed={where === id} onClick={() => setWhere(id)}>
              {label} <span className="mono oc-pill__n">{id === "all" ? items.length : items.filter((i) => i.source === id).length}</span>
            </button>
          ))}
        </div>

        {list.length === 0 ? (
          <p className="oc-empty">{status === "open" ? "No open issues. Everything's running clean." : "Nothing here."}</p>
        ) : (
          <ul className="oc-issues">
            {list.map((i) => {
              const st = statusMeta(i.status);
              const max = Math.max(1, ...i.trend);
              return (
                <li key={i.id}>
                  <button type="button" className={`oc-issue oc-edge--${st.tone}`} onClick={() => setOpenId(i.id)}>
                    <span className="oc-issue__users">
                      <b className="mono">{i.users}</b>
                      <span>people</span>
                    </span>
                    <span className="oc-issue__main">
                      <span className="oc-issue__title">{i.title}</span>
                      <span className="oc-issue__msg mono">{i.message}</span>
                      <span className="oc-issue__meta">
                        <span className={`oc-chip oc-chip--${st.tone}`}>{st.label}</span>
                        <span className="oc-chip oc-chip--muted">{SOURCE[i.source]}</span>
                        <span className="oc-muted">{i.area} · last {relTime(i.lastSeen)}{i.assignee ? ` · ${i.assignee.split("@")[0]}` : ""}</span>
                      </span>
                    </span>
                    <span className="oc-issue__spark" aria-hidden="true">
                      {i.trend.map((v, k) => <i key={k} style={{ "--h": `${(v / max) * 100}%` }} />)}
                    </span>
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      </section>

      {issue && <IssueDrawer key={issue.id} issue={issue} staff={staff} onClose={() => setOpenId(null)} onSaved={load} />}
    </>
  );
}
