import React, { useCallback, useEffect, useState } from "react";
import { getData, putData } from "utils/adminData";
import { RISKY, decide } from "utils/approvals";
import { Confirm, Notice, fmtDateTime, relTime } from "./shared";

export default function ApprovalsTab() {
  const [items, setItems] = useState(null);
  const [policy, setPolicy] = useState(null);
  const [source, setSource] = useState(null);
  const [show, setShow] = useState("pending");
  const [busy, setBusy] = useState(null);
  const [flash, setFlash] = useState(null);
  const [reject, setReject] = useState(null);
  const [note, setNote] = useState("");

  const load = useCallback(async () => {
    const [a, p] = await Promise.all([getData("approvals"), getData("approvalPolicy")]);
    setItems(a.data || []);
    setPolicy(p.data || { required: {} });
    setSource(a.source);
  }, []);
  useEffect(() => {
    load();
  }, [load]);

  const act = async (item, approve, why = "") => {
    setBusy(item.id);
    setFlash(null);
    try {
      await decide(item, approve, why);
      setFlash({ tone: approve ? "green" : "amber", text: approve ? `Approved and done: ${item.summary}.` : `Rejected. ${item.by} can see your note in Activity.` });
      await load();
    } catch (e) {
      setFlash({ tone: e.notConnected ? "amber" : "red", text: e.message });
    } finally {
      setBusy(null);
      setReject(null);
      setNote("");
    }
  };

  const togglePolicy = async (kind) => {
    const next = { ...policy, required: { ...policy.required, [kind]: policy.required?.[kind] === false } };
    try {
      await putData("approvalPolicy", next, { action: "approval.policy", target: RISKY[kind], detail: next.required[kind] ? "needs approval" : "staff can do it directly" });
      setPolicy(next);
    } catch (e) {
      setFlash({ tone: e.notConnected ? "amber" : "red", text: e.message });
    }
  };

  if (!items) return <div className="oc-card"><div className="oc-skel oc-skel--block" /></div>;
  const pending = items.filter((i) => i.status === "pending").sort((a, b) => new Date(a.at) - new Date(b.at));
  const done = items.filter((i) => i.status !== "pending").sort((a, b) => new Date(b.decidedAt) - new Date(a.decidedAt));
  const list = show === "pending" ? pending : done;

  return (
    <>
      {source === "offline" && <Notice>Approvals aren't connected yet. They need the AdminData/approvals route.</Notice>}
      {flash && <div className={`oc-flash oc-edge--${flash.tone}`} role="status">{flash.text}</div>}
      <div className="oc-split oc-split--wide">
        <section className="oc-card">
          <div className="oc-filters" role="group" aria-label="Filter approvals">
            {[["pending", "Waiting on you", pending.length], ["done", "Decided", done.length]].map(([id, label, n]) => (
              <button key={id} type="button" className={`oc-pill${show === id ? " is-on" : ""}`} aria-pressed={show === id} onClick={() => setShow(id)}>
                {label} <span className="mono oc-pill__n">{n}</span>
              </button>
            ))}
          </div>
          {list.length === 0 ? (
            <p className="oc-empty">{show === "pending" ? "Nothing waiting. Your team hasn't asked for anything risky." : "No decisions yet."}</p>
          ) : show === "pending" ? (
            <div className="oc-decisions">
              {list.map((i) => (
                <article key={i.id} className="oc-decision">
                  <header className="oc-decision__head">
                    <span className="oc-decision__ava" aria-hidden="true">{i.by.slice(0, 2).toUpperCase()}</span>
                    <span className="oc-decision__who">
                      <b>{i.by.split("@")[0]}</b> asks to
                      <span className="oc-decision__kind mono">{RISKY[i.kind] || i.kind}</span>
                    </span>
                    <span className="oc-decision__age mono">waiting {relTime(i.at).replace(" ago", "")}</span>
                  </header>
                  <p className="oc-decision__what">{i.summary}</p>
                  {i.reason && <blockquote className="oc-decision__why">{i.reason}</blockquote>}
                  <div className="oc-decision__actions">
                    <button type="button" className="oc-btn oc-btn--ghost" disabled={busy === i.id} onClick={() => setReject(i)}>Reject</button>
                    <button type="button" className="oc-btn" disabled={busy === i.id} onClick={() => act(i, true)}>{busy === i.id ? "Working…" : "Approve & do it"}</button>
                  </div>
                </article>
              ))}
            </div>
          ) : (
            <ul className="oc-log">
              {list.map((i) => (
                <li key={i.id} className={`oc-log__item oc-request oc-edge--${i.status === "pending" ? "red" : i.status === "approved" ? "green" : "muted"}`}>
                  <div className="oc-request__main">
                    <span className="oc-log__what">{i.summary}</span>
                    {i.reason && <span className="oc-log__detail">“{i.reason}”</span>}
                    <span className="oc-log__meta mono">
                      {RISKY[i.kind] || i.kind} · asked by {i.by} {relTime(i.at)}
                      {i.status !== "pending" && ` · ${i.status} by ${i.decidedBy} ${fmtDateTime(new Date(i.decidedAt))}${i.note ? ` — “${i.note}”` : ""}`}
                    </span>
                  </div>
                  {i.status === "pending" && (
                    <div className="oc-actions oc-actions--tight">
                      <button type="button" className="oc-btn oc-btn--ghost" disabled={busy === i.id} onClick={() => setReject(i)}>Reject</button>
                      <button type="button" className="oc-btn" disabled={busy === i.id} onClick={() => act(i, true)}>{busy === i.id ? "Working…" : "Approve"}</button>
                    </div>
                  )}
                </li>
              ))}
            </ul>
          )}
        </section>

        <section className="oc-card">
          <div className="oc-card__head">
            <h2 className="oc-card__title">What needs your OK</h2>
          </div>
          <p className="oc-muted">When a staff member tries one of these, it waits here instead of happening. Your own actions never wait.</p>
          {Object.entries(RISKY).map(([kind, label]) => {
            const on = policy.required?.[kind] !== false;
            return (
              <div className="oc-toggle-row" key={kind}>
                <p className="oc-toggle-row__k">{label}</p>
                <button type="button" role="switch" aria-checked={on} aria-label={`${label} needs approval`} className={`oc-switch${on ? " is-on" : ""}`} onClick={() => togglePolicy(kind)} />
              </div>
            );
          })}
        </section>
      </div>

      {reject && (
        <Confirm
          title={`Reject: ${reject.summary}?`}
          body={
            <label className="oc-field">
              <span className="oc-field__label">Note for {reject.by} (optional)</span>
              <input className="oc-input" value={note} onChange={(e) => setNote(e.target.value)} placeholder="e.g. Offer a free month instead" />
            </label>
          }
          confirmLabel="Reject"
          tone="danger"
          busy={busy === reject.id}
          onConfirm={() => act(reject, false, note.trim())}
          onClose={() => setReject(null)}
        />
      )}
    </>
  );
}
