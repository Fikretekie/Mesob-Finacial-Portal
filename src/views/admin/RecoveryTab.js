import React, { useEffect, useMemo, useState } from "react";
import { fetchBackup, fetchTransactions, restoreTransactions } from "utils/adminApi";
import { getData, deleteData } from "utils/adminData";
import { useAccess } from "utils/staffAccess";
import { submitOrRun } from "utils/approvals";
import { Confirm, Notice, fmtDate, fmtDateTime, fmtMoney, toDate, relTime } from "./shared";

const backupDate = (url) => {
  const m = String(url).match(/transactions_(\d{4}-\d{2}-\d{2}T[\d:.]+Z)/);
  return m ? toDate(m[1]) : null;
};

function BackupsPanel({ rows, presetId, onPresetHandled, onChanged }) {
  const [query, setQuery] = useState("");
  const [userId, setUserId] = useState(null);
  const [current, setCurrent] = useState(null);
  const [backupUrl, setBackupUrl] = useState(null);
  const [preview, setPreview] = useState(null);
  const [err, setErr] = useState(null);
  const [confirming, setConfirming] = useState(false);
  const [progress, setProgress] = useState(null);
  const [result, setResult] = useState(null);

  useEffect(() => {
    if (presetId) {
      setUserId(presetId);
      onPresetHandled();
    }
  }, [presetId, onPresetHandled]);

  const user = rows.find((r) => r.id === userId);

  useEffect(() => {
    setCurrent(null);
    setBackupUrl(null);
    setPreview(null);
    setResult(null);
    setErr(null);
    if (!user) return;
    fetchTransactions(user.id).then(setCurrent).catch(() => setCurrent([]));
    if (user.backups.length) setBackupUrl(user.backups[user.backups.length - 1]);
  }, [userId]);

  useEffect(() => {
    setPreview(null);
    setErr(null);
    if (!backupUrl) return;
    fetchBackup(backupUrl)
      .then(setPreview)
      .catch((e) => setErr(e.message || "Couldn't read that backup."));
  }, [backupUrl]);

  const candidates = useMemo(() => {
    const q = query.trim().toLowerCase();
    const list = q
      ? rows.filter((r) => [r.name, r.email, r.id].some((v) => String(v || "").toLowerCase().includes(q)))
      : rows.filter((r) => r.dataDeletedAt || r.backups.length);
    return list.sort((a, b) => (b.dataDeletedAt || 0) - (a.dataDeletedAt || 0)).slice(0, 12);
  }, [rows, query]);

  const summary = useMemo(() => {
    if (!preview) return null;
    const dates = preview.map((r) => toDate(r.createdAt)).filter(Boolean).sort((a, b) => a - b);
    const sum = (pred) => preview.filter(pred).reduce((a, r) => a + (Number(r.transactionAmount) || 0), 0);
    return {
      count: preview.length,
      from: dates[0],
      to: dates[dates.length - 1],
      income: sum((r) => /receive/i.test(r.transactionType || "")),
      spend: sum((r) => !/receive/i.test(r.transactionType || "")),
    };
  }, [preview]);

  const restore = async () => {
    setConfirming(false);
    setProgress({ done: 0, failed: 0, total: preview.length });
    try {
      const res = await restoreTransactions(user, preview, setProgress);
      setResult(res);
      setCurrent(await fetchTransactions(user.id));
      onChanged();
    } catch (e) {
      const s = e?.response?.status;
      setResult({ error: s === 403 ? "The API refused (403): writing to another user's account needs the super-admin exception on the backend." : e.message || "Restore failed." });
    } finally {
      setProgress(null);
    }
  };

  return (
    <div className="oc-split">
      <section className="oc-card">
        <div className="oc-card__head">
          <h2 className="oc-card__title">Find the account</h2>
        </div>
        <input className="oc-search oc-search--full" type="search" placeholder="Search name or email…" aria-label="Search accounts" value={query} onChange={(e) => setQuery(e.target.value)} />
        <p className="oc-hint mono">{query ? "Matches" : "Accounts with backups or recent deletions"}</p>
        {candidates.length === 0 ? (
          <p className="oc-empty">{query ? "No account matches." : "No account has a backup on file yet."}</p>
        ) : (
          <ul className="oc-picklist">
            {candidates.map((r) => (
              <li key={r.id}>
                <button type="button" className={`oc-picklist__item${r.id === userId ? " is-on" : ""}`} aria-pressed={r.id === userId} onClick={() => setUserId(r.id)}>
                  <span className="oc-picklist__name">{r.name || r.email}</span>
                  <span className="oc-picklist__meta mono">
                    {r.dataDeletedAt ? `Wiped ${fmtDate(r.dataDeletedAt)}` : "Active"} · {r.backups.length} backup{r.backups.length === 1 ? "" : "s"}
                  </span>
                </button>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="oc-card">
        {!user ? (
          <div className="oc-empty-state">
            <h2 className="oc-card__title">Restore deleted data</h2>
            <p className="oc-muted">
              When a customer uses “Delete all records” or “Reset”, Meksova saves a CSV backup first. Pick their account to preview that backup and put the transactions back.
              Rows that are already in their account are skipped, so running it twice is safe.
            </p>
          </div>
        ) : (
          <>
            <div className="oc-card__head">
              <div className="oc-drawer__titles">
                <h2 className="oc-card__title">{user.name || user.email}</h2>
                <p className="oc-muted">{user.email}</p>
              </div>
              <span className="oc-card__meta mono">{current ? `${current.length} transactions now` : "…"}</span>
            </div>

            {user.backups.length === 0 ? (
              <p className="oc-empty">No backup on file for this account. A backup is created automatically the next time they delete or reset their data.</p>
            ) : (
              <>
                <label className="oc-field">
                  <span className="oc-field__label">Backup</span>
                  <select className="oc-input" value={backupUrl || ""} onChange={(e) => setBackupUrl(e.target.value)}>
                    {[...user.backups].reverse().map((u) => (
                      <option key={u} value={u}>{fmtDateTime(backupDate(u))} — {u.split("/").pop()}</option>
                    ))}
                  </select>
                </label>

                {err && <div className="oc-flash oc-edge--red" role="status">{err}</div>}
                {!preview && !err && <div className="oc-skel oc-skel--block" />}

                {summary && (
                  <>
                    <div className="oc-kpis oc-kpis--mini">
                      <div className="oc-kpi"><span className="oc-kpi__k mono">Rows</span><span className="oc-kpi__v mono">{summary.count}</span></div>
                      <div className="oc-kpi"><span className="oc-kpi__k mono">Income</span><span className="oc-kpi__v mono">{fmtMoney(summary.income)}</span></div>
                      <div className="oc-kpi"><span className="oc-kpi__k mono">Spending</span><span className="oc-kpi__v mono">{fmtMoney(summary.spend)}</span></div>
                      <div className="oc-kpi"><span className="oc-kpi__k mono">Covers</span><span className="oc-kpi__v mono oc-kpi__v--sm">{fmtDate(summary.from)} – {fmtDate(summary.to)}</span></div>
                    </div>

                    <div className="oc-table oc-table--tx" role="table" aria-label="Backup preview">
                      <div className="oc-tr oc-tr--head" role="row">
                        <span role="columnheader">Date</span>
                        <span role="columnheader">Description</span>
                        <span role="columnheader">Type</span>
                        <span role="columnheader" className="oc-num">Amount</span>
                      </div>
                      {preview.slice(0, 8).map((r, i) => (
                        <div className="oc-tr" role="row" key={r.id || i}>
                          <span role="cell" className="mono">{fmtDate(toDate(r.createdAt))}</span>
                          <span role="cell">{r.transactionPurpose || "—"}</span>
                          <span role="cell">{r.transactionType || "—"}</span>
                          <span role="cell" className="mono oc-num">{fmtMoney(r.transactionAmount)}</span>
                        </div>
                      ))}
                    </div>
                    {preview.length > 8 && <p className="oc-hint mono">+ {preview.length - 8} more rows</p>}

                    {progress && (
                      <div className="oc-progress" role="progressbar" aria-valuemin={0} aria-valuemax={progress.total} aria-valuenow={progress.done}>
                        <span className="oc-progress__bar" style={{ "--p": `${progress.total ? ((progress.done + progress.failed) / progress.total) * 100 : 100}%` }} />
                        <span className="oc-progress__lbl mono">{progress.done + progress.failed} / {progress.total}</span>
                      </div>
                    )}

                    {result && (
                      <div className={`oc-flash ${result.error ? "oc-edge--red" : "oc-edge--green"}`} role="status">
                        {result.error || `Restored ${result.restored} transaction${result.restored === 1 ? "" : "s"}. ${result.skipped} were already there${result.failed ? `, ${result.failed} failed` : ""}.`}
                      </div>
                    )}

                    <div className="oc-actions">
                      <button type="button" className="oc-btn" disabled={!!progress || !preview.length} onClick={() => setConfirming(true)}>
                        Restore {preview.length} transactions
                      </button>
                    </div>
                  </>
                )}
              </>
            )}
          </>
        )}
      </section>

      {confirming && (
        <Confirm
          title={`Restore data for ${user.name || user.email}?`}
          body={
            <p>
              {summary.count} transactions from the {fmtDateTime(backupDate(backupUrl))} backup will be added back to their account. Anything already there is left alone. This is logged in Activity.
            </p>
          }
          typeToConfirm="RESTORE"
          confirmLabel="Restore"
          onConfirm={restore}
          onClose={() => setConfirming(false)}
        />
      )}
    </div>
  );
}

const KINDS = [
  { id: "all", label: "Everything" },
  { id: "transaction", label: "Transactions" },
  { id: "receipt", label: "Receipts" },
  { id: "document", label: "Documents" },
  { id: "business", label: "Businesses" },
];

function RecycleBin() {
  const access = useAccess();
  const [items, setItems] = useState(null);
  const [source, setSource] = useState(null);
  const [kind, setKind] = useState("all");
  const [query, setQuery] = useState("");
  const [busy, setBusy] = useState(null);
  const [flash, setFlash] = useState(null);
  const [purge, setPurge] = useState(null);

  const load = async () => {
    const res = await getData("recycle");
    setItems(res.data || []);
    setSource(res.source);
  };
  useEffect(() => {
    load();
  }, []);

  const act = async (item, how) => {
    setBusy(item.id);
    setFlash(null);
    try {
      const doIt = () => deleteData("recycle", item, { action: how === "restore" ? "recycle.restore" : "recycle.purge", target: item.email, detail: item.label });
      const res = how === "purge" ? await submitOrRun("recycle.purge", access, { summary: `Permanently delete “${item.label}” (${item.name})`, payload: { item } }, doIt) : (await doIt(), { pending: false });
      setFlash(
        res.pending
          ? { tone: "amber", text: "Sent to the owner for approval." }
          : { tone: "green", text: how === "restore" ? `Restored “${item.label}” to ${item.name}'s account.` : `“${item.label}” was permanently deleted.` }
      );
      await load();
    } catch (e) {
      setFlash({ tone: e.notConnected ? "amber" : "red", text: e.message });
    } finally {
      setBusy(null);
      setPurge(null);
    }
  };

  if (!items) return <div className="oc-card"><div className="oc-skel oc-skel--block" /></div>;
  const q = query.trim().toLowerCase();
  const list = items
    .filter((i) => kind === "all" || i.kind === kind)
    .filter((i) => !q || [i.name, i.email, i.label].some((v) => String(v || "").toLowerCase().includes(q)))
    .sort((a, b) => new Date(b.deletedAt) - new Date(a.deletedAt));

  return (
    <section className="oc-card">
      <div className="oc-card__head oc-users__head">
        <div className="oc-drawer__titles">
          <h2 className="oc-card__title">Recycle bin</h2>
          <p className="oc-muted">Anything a customer deletes stays here for 30 days. Restore puts it back exactly as it was, receipts and all.</p>
        </div>
        <input className="oc-search" type="search" placeholder="Search customer or item…" aria-label="Search recycle bin" value={query} onChange={(e) => setQuery(e.target.value)} />
      </div>
      {source === "offline" && <Notice>The recycle bin needs the backend to switch deletes to “move to bin” (a deletedAt flag) instead of erasing records. Until then use CSV backups.</Notice>}
      {flash && <div className={`oc-flash oc-edge--${flash.tone}`} role="status">{flash.text}</div>}
      <div className="oc-filters" role="group" aria-label="Filter by type">
        {KINDS.map((k) => (
          <button key={k.id} type="button" className={`oc-pill${kind === k.id ? " is-on" : ""}`} aria-pressed={kind === k.id} onClick={() => setKind(k.id)}>
            {k.label} <span className="mono oc-pill__n">{k.id === "all" ? items.length : items.filter((i) => i.kind === k.id).length}</span>
          </button>
        ))}
      </div>
      {list.length === 0 ? (
        <p className="oc-empty">{items.length ? "Nothing matches." : "The recycle bin is empty."}</p>
      ) : (
        <ul className="oc-log">
          {list.map((i) => {
            const left = Math.max(0, Math.ceil((new Date(i.purgeAt) - Date.now()) / 86400000));
            return (
              <li key={i.id} className={`oc-log__item oc-request oc-bin oc-edge--${left <= 3 ? "red" : "amber"}`}>
                <span className={`oc-bin__kind oc-bin__kind--${i.kind}`} aria-hidden="true">{{ transaction: "$", receipt: "R", document: "D", business: "B" }[i.kind] || "•"}</span>
                <div className="oc-request__main">
                  <span className="oc-log__what">
                    {i.label}
                    {i.amount != null && <span className="oc-log__target mono"> · {fmtMoney(i.amount)}</span>}
                  </span>
                  <span className="oc-log__detail">{i.name} · {i.email}</span>
                  <span className={`oc-log__meta mono${left <= 3 ? " oc-text--red" : ""}`}>
                    {i.kind} · deleted {relTime(i.deletedAt)} · gone for good in {left} day{left === 1 ? "" : "s"}
                  </span>
                  <span className="oc-bin__life" aria-hidden="true">
                    <span className={`oc-bin__used${left <= 3 ? " is-red" : ""}`} style={{ "--w": `${Math.min(100, ((30 - left) / 30) * 100)}%` }} />
                  </span>
                </div>
                <div className="oc-actions oc-actions--tight">
                  <button type="button" className="oc-btn" disabled={busy === i.id} onClick={() => act(i, "restore")}>Restore</button>
                  <button type="button" className="oc-btn oc-btn--ghost" disabled={busy === i.id} onClick={() => setPurge(i)}>Delete now</button>
                </div>
              </li>
            );
          })}
        </ul>
      )}
      {purge && (
        <Confirm
          title="Delete permanently?"
          body={<p>“{purge.label}” from {purge.name}'s account can't be recovered after this.</p>}
          typeToConfirm="DELETE"
          tone="danger"
          confirmLabel="Delete permanently"
          busy={busy === purge.id}
          onConfirm={() => act(purge, "purge")}
          onClose={() => setPurge(null)}
        />
      )}
    </section>
  );
}

export default function RecoveryTab(props) {
  const [mode, setMode] = useState(props.presetId ? "backups" : "bin");
  return (
    <>
      <div className="oc-seg oc-seg--lg" role="tablist" aria-label="Recovery source">
        {[["bin", "Recycle bin"], ["backups", "CSV backups"]].map(([id, label]) => (
          <button key={id} type="button" role="tab" aria-selected={mode === id} className={`oc-seg__opt${mode === id ? " is-on" : ""}`} onClick={() => setMode(id)}>
            {label}
          </button>
        ))}
      </div>
      {mode === "bin" ? <RecycleBin /> : <BackupsPanel {...props} />}
    </>
  );
}
