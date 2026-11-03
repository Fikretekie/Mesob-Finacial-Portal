import React, { useCallback, useEffect, useState } from "react";
import { getData, putData } from "utils/adminData";
import { fetchTransactions } from "utils/adminApi";
import { downloadCsv } from "./UsersTab";
import { Confirm, Notice, fmtDate, relTime } from "./shared";
import { useAccess } from "utils/staffAccess";
import { submitOrRun } from "utils/approvals";

const TYPE = {
  delete: { label: "Delete account", tone: "red" },
  export: { label: "Export my data", tone: "accent" },
};

const daysLeft = (d) => Math.ceil((new Date(d) - Date.now()) / 86400000);

export default function RequestsTab({ onOpenUser }) {
  const access = useAccess();
  const [items, setItems] = useState(null);
  const [source, setSource] = useState(null);
  const [show, setShow] = useState("pending");
  const [confirm, setConfirm] = useState(null);
  const [busy, setBusy] = useState(null);
  const [flash, setFlash] = useState(null);

  const load = useCallback(async () => {
    const res = await getData("requests");
    setItems(res.data || []);
    setSource(res.source);
  }, []);
  useEffect(() => {
    load();
  }, [load]);

  const complete = async (r, note) => {
    await putData("requests", { ...r, status: "completed", completedAt: new Date().toISOString(), handledBy: localStorage.getItem("user_email") || "owner" }, { action: r.type === "delete" ? "request.delete" : "request.export", target: r.email, detail: note });
    await load();
  };

  const doExport = async (r) => {
    setBusy(r.id);
    setFlash(null);
    try {
      const tx = await fetchTransactions(r.userId).catch(() => []);
      downloadCsv(`${r.email.split("@")[0]}_meksova_export.csv`, tx.length ? tx : [{ note: "No transactions on file", email: r.email }]);
      await complete(r, `${tx.length} transactions exported`);
      setFlash({ tone: "green", text: `Export downloaded. Send it to ${r.email} — they get an email with a secure link once the backend is connected.` });
    } catch (e) {
      setFlash({ tone: e.notConnected ? "amber" : "red", text: e.message });
    } finally {
      setBusy(null);
    }
  };

  const doDelete = async (r) => {
    setBusy(r.id);
    setFlash(null);
    try {
      const res = await submitOrRun("request.delete", access, { summary: `Delete ${r.name}'s account`, reason: r.reason, payload: { requestId: r.id } }, () =>
        complete(r, "account scheduled for deletion; recoverable for 30 days")
      );
      setFlash(
        res.pending
          ? { tone: "amber", text: "Sent to the owner for approval. The account is deleted once they approve." }
          : { tone: "green", text: `${r.email} is scheduled for deletion. Their data sits in the recycle bin for 30 days, then it's gone for good.` }
      );
    } catch (e) {
      setFlash({ tone: e.notConnected ? "amber" : "red", text: e.message });
    } finally {
      setBusy(null);
      setConfirm(null);
    }
  };

  if (!items) return <div className="oc-card"><div className="oc-skel oc-skel--block" /></div>;
  const list = items.filter((r) => (show === "pending" ? r.status === "pending" : r.status !== "pending"));

  return (
    <section className="oc-card">
      <div className="oc-card__head oc-users__head">
        <div className="oc-drawer__titles">
          <h2 className="oc-card__title">Data requests</h2>
          <p className="oc-muted">Customers asking to delete their account or get a copy of their data. Privacy laws and Google Play expect an answer within 30 days.</p>
        </div>
      </div>
      {source === "offline" && <Notice>Requests aren't connected yet. They need the AdminData/requests route and a “Delete my account” button in the app.</Notice>}
      {flash && <div className={`oc-flash oc-edge--${flash.tone}`} role="status">{flash.text}</div>}

      <div className="oc-filters" role="group" aria-label="Filter requests">
        {[["pending", "To do"], ["done", "Done"]].map(([id, label]) => (
          <button key={id} type="button" className={`oc-pill${show === id ? " is-on" : ""}`} aria-pressed={show === id} onClick={() => setShow(id)}>
            {label} <span className="mono oc-pill__n">{items.filter((r) => (id === "pending" ? r.status === "pending" : r.status !== "pending")).length}</span>
          </button>
        ))}
      </div>

      {list.length === 0 ? (
        <p className="oc-empty">{show === "pending" ? "No open requests." : "Nothing handled yet."}</p>
      ) : (
        <ul className="oc-log">
          {list.map((r) => {
            const left = daysLeft(r.dueAt);
            return (
              <li key={r.id} className={`oc-log__item oc-request oc-request--due oc-edge--${r.status === "pending" ? TYPE[r.type].tone : "green"}`}>
                <span className={`oc-due${r.status !== "pending" ? " is-done" : left <= 7 ? " is-close" : ""}`} aria-hidden="true">
                  <span className="oc-due__n mono">{r.status === "pending" ? left : "✓"}</span>
                  <span className="oc-due__l">{r.status === "pending" ? "days left" : "done"}</span>
                </span>
                <div className="oc-request__main">
                  <span className="oc-log__what">
                    {TYPE[r.type].label} <span className="oc-log__target">· {r.name} ({r.email})</span>
                  </span>
                  {r.reason && <span className="oc-log__detail">“{r.reason}”</span>}
                  <span className="oc-log__meta mono">
                    Asked {relTime(r.createdAt)}
                    {r.status === "pending" ? ` · due ${fmtDate(new Date(r.dueAt))} (${left} days left)` : ` · done ${fmtDate(new Date(r.completedAt))} by ${r.handledBy}`}
                  </span>
                </div>
                {r.status === "pending" && (
                  <div className="oc-actions oc-actions--tight">
                    <button type="button" className="oc-btn oc-btn--ghost" onClick={() => onOpenUser(r.userId)}>Account</button>
                    {r.type === "export" ? (
                      <button type="button" className="oc-btn" disabled={busy === r.id} onClick={() => doExport(r)}>{busy === r.id ? "Exporting…" : "Export & complete"}</button>
                    ) : (
                      <button type="button" className="oc-btn oc-btn--danger" disabled={busy === r.id} onClick={() => setConfirm(r)}>Delete account</button>
                    )}
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      )}

      {confirm && (
        <Confirm
          title={`Delete ${confirm.name}'s account?`}
          body={
            <p>
              Their login is closed and all their records move to the recycle bin. If they change their mind within 30 days you can restore everything; after that it's permanently deleted. They get a confirmation email.
            </p>
          }
          typeToConfirm="DELETE"
          tone="danger"
          confirmLabel="Delete account"
          busy={busy === confirm.id}
          onConfirm={() => doDelete(confirm)}
          onClose={() => setConfirm(null)}
        />
      )}
    </section>
  );
}
