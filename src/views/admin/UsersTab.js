import React, { useEffect, useMemo, useState } from "react";
import { useDispatch } from "react-redux";
import { useNavigate } from "react-router-dom";
import { setSelectedUser } from "../../store/userSlice";
import { updateUser, fetchTransactions } from "utils/adminApi";
import { saveFile } from "utils/saveFile";
import { getData } from "utils/adminData";
import { useAccess } from "utils/staffAccess";
import { submitOrRun } from "utils/approvals";
import { TimelinePanel, BillingPanel } from "./CustomerPanels";
import { AUDIENCES, DAY, ROLE_LABEL, StatusChip, Drawer, Confirm, fmtDate, fmtDateTime, fmtMoney, toDate, relTime } from "./shared";

const PAGE = 25;

const csvCell = (v) => `"${String(v ?? "").replace(/"/g, '""')}"`;
export function downloadCsv(name, rows) {
  if (!rows.length) return;
  const head = Object.keys(rows[0]);
  const text = [head.map(csvCell).join(","), ...rows.map((r) => head.map((h) => csvCell(r[h])).join(","))].join("\n");
  saveFile(new Blob([text], { type: "text/csv;charset=utf-8" }), name);
}

function Field({ k, children }) {
  return (
    <div className="oc-kv">
      <span className="oc-kv__k mono">{k}</span>
      <span className="oc-kv__v">{children || "—"}</span>
    </div>
  );
}

function UserDrawer({ row, onClose, onChanged, onRestore, onMessage }) {
  const access = useAccess();
  const { can, isOwner } = access;
  const [view, setView] = useState("summary");
  const dispatch = useDispatch();
  const navigate = useNavigate();
  const [tx, setTx] = useState(null);
  const [txErr, setTxErr] = useState(null);
  const [busy, setBusy] = useState(null);
  const [flash, setFlash] = useState(null);
  const [confirm, setConfirm] = useState(null);
  const [trialDate, setTrialDate] = useState(row.trialEnd ? row.trialEnd.toISOString().slice(0, 10) : "");
  const [note, setNote] = useState(row.raw.adminNote || "");
  const [role, setRole] = useState(String(row.role ?? 2));

  useEffect(() => {
    fetchTransactions(row.id).then(setTx).catch((e) => setTxErr(e?.response?.status || "network"));
  }, [row.id]);

  const run = async (key, patch, audit, message) => {
    setBusy(key);
    setFlash(null);
    try {
      await updateUser(row.id, patch, { ...audit, target: row.email });
      setFlash({ tone: "green", text: message });
      onChanged();
    } catch (e) {
      const s = e?.response?.status;
      setFlash({ tone: "red", text: s === 403 ? "Blocked by the API's per-user guard (403). Needs the super-admin exception on the backend." : `Couldn't save (${s || "network"}).` });
    } finally {
      setBusy(null);
      setConfirm(null);
    }
  };

  const extend = (days) => {
    const base = row.trialEnd && row.trialEnd > new Date() ? row.trialEnd : new Date();
    const next = new Date(base.getTime() + days * DAY);
    setTrialDate(next.toISOString().slice(0, 10));
    run(`trial${days}`, { trialEndDate: next.toISOString() }, { action: "user.extendTrial", detail: `+${days} days → ${fmtDate(next)}` }, `Trial now ends ${fmtDate(next)}.`);
  };

  const setTrialTo = () => {
    const d = toDate(`${trialDate}T23:59:00`);
    if (!d) return;
    run("trialset", { trialEndDate: d.toISOString() }, { action: "user.setTrial", detail: fmtDate(d) }, `Trial end set to ${fmtDate(d)}.`);
  };

  const viewAs = () => {
    dispatch(setSelectedUser({ id: row.id, email: row.email }));
    localStorage.setItem("selectedUserId", row.id);
    localStorage.setItem("selectedUserEmail", row.email || "");
    navigate("/admin/dashboard");
  };

  const exportTx = () => tx && downloadCsv(`${(row.email || row.id).split("@")[0]}_transactions.csv`, tx);

  const lastTx = tx && tx.length ? tx.reduce((a, b) => ((toDate(a.createdAt) || 0) > (toDate(b.createdAt) || 0) ? a : b)) : null;
  const comped = Boolean(row.raw.compedAccess);
  const suspended = Boolean(row.raw.disabled);

  return (
    <>
      <Drawer title={row.name || row.email} sub={row.name ? row.email : null} onClose={onClose}>
        <div className="oc-drawer__chips">
          <StatusChip status={row.status} />
          <span className="oc-chip oc-chip--muted">{ROLE_LABEL[row.role] || "Customer"}</span>
          {row.hasApp && <span className="oc-chip oc-chip--accent">App installed</span>}
        </div>

        <div className="oc-seg oc-seg--lg oc-seg--full" role="tablist" aria-label="Customer view">
          {[["summary", "Summary"], ["history", "History"], ["billing", "Billing"]].map(([id, label]) => (
            <button key={id} type="button" role="tab" aria-selected={view === id} className={`oc-seg__opt${view === id ? " is-on" : ""}`} onClick={() => setView(id)}>
              {label}
            </button>
          ))}
        </div>

        {flash && <div className={`oc-flash oc-edge--${flash.tone}`} role="status">{flash.text}</div>}

        {view === "history" && <TimelinePanel row={row} />}
        {view === "billing" && <BillingPanel row={row} onChanged={onChanged} />}

        {view === "summary" && (
        <>
        <section className="oc-sec">
          <h3 className="oc-sec__title">Account</h3>
          <div className="oc-kvs">
            <Field k="User ID"><span className="mono">{row.id}</span></Field>
            <Field k="Phone">{row.phone}</Field>
            <Field k="Business">{row.businessType || row.company}</Field>
            <Field k="Sign-in">{row.authProvider}</Field>
            <Field k="Signed up">{fmtDate(row.signedUp)}</Field>
            <Field k="Last active">{fmtDateTime(row.lastActive)}</Field>
            <Field k="Trial ends">{fmtDate(row.trialEnd)}</Field>
            <Field k="Billing">{row.sub ? `${row.billing || "—"} · ${row.sub.subscriptionPlan || ""} · ${row.sub.status}` : "No subscription"}</Field>
          </div>
        </section>

        <section className="oc-sec">
          <h3 className="oc-sec__title">Data</h3>
          {txErr ? (
            <p className="oc-muted">Couldn't read transactions ({String(txErr)}).</p>
          ) : !tx ? (
            <div className="oc-skel oc-skel--line" />
          ) : (
            <div className="oc-kvs">
              <Field k="Transactions"><span className="mono">{tx.length}</span></Field>
              <Field k="Last entry">{lastTx ? `${fmtDate(toDate(lastTx.createdAt))} · ${fmtMoney(lastTx.transactionAmount)}` : "None"}</Field>
              <Field k="Backups"><span className="mono">{row.backups.length}</span></Field>
              <Field k="Data deleted">{row.dataDeletedAt ? fmtDate(row.dataDeletedAt) : "—"}</Field>
            </div>
          )}
          <div className="oc-actions">
            {can("data.restore") && <button type="button" className="oc-btn oc-btn--ghost" onClick={() => onRestore(row)}>Restore deleted data</button>}
            {can("users.export") && <button type="button" className="oc-btn oc-btn--ghost" onClick={exportTx} disabled={!tx || !tx.length}>Export CSV</button>}
            {can("users.viewAs") && <button type="button" className="oc-btn oc-btn--ghost" onClick={viewAs}>View as user</button>}
          </div>
        </section>

        {can("users.edit") && (
        <section className="oc-sec">
          <h3 className="oc-sec__title">Trial</h3>
          <div className="oc-actions">
            <button type="button" className="oc-btn oc-btn--ghost" disabled={!!busy} onClick={() => extend(7)}>{busy === "trial7" ? "Saving…" : "+7 days"}</button>
            <button type="button" className="oc-btn oc-btn--ghost" disabled={!!busy} onClick={() => extend(30)}>{busy === "trial30" ? "Saving…" : "+30 days"}</button>
          </div>
          <div className="oc-inline">
            <label className="oc-field oc-field--grow">
              <span className="oc-field__label">Set end date</span>
              <input type="date" className="oc-input" value={trialDate} onChange={(e) => setTrialDate(e.target.value)} />
            </label>
            <button type="button" className="oc-btn" disabled={!!busy || !trialDate} onClick={setTrialTo}>Set</button>
          </div>
        </section>
        )}

        {(can("users.access") || isOwner) && (
        <section className="oc-sec">
          <h3 className="oc-sec__title">Access</h3>
          {can("users.access") && (
          <div className="oc-toggle-row">
            <div>
              <p className="oc-toggle-row__k">Complimentary access</p>
              <p className="oc-muted">Full paid features without billing.</p>
            </div>
            <button
              type="button"
              className={`oc-switch${comped ? " is-on" : ""}`}
              role="switch"
              aria-checked={comped}
              aria-label="Complimentary access"
              disabled={!!busy}
              onClick={() =>
                run("comp", comped ? { compedAccess: false, subscription: row.status === "active" } : { compedAccess: true, subscription: true }, { action: comped ? "user.revokeComp" : "user.grantComp" }, comped ? "Complimentary access removed." : "Complimentary access granted.")
              }
            />
          </div>
          )}
          {isOwner && (
          <div className="oc-inline">
            <label className="oc-field oc-field--grow">
              <span className="oc-field__label">Role</span>
              <select className="oc-input" value={role} onChange={(e) => setRole(e.target.value)}>
                <option value="2">Customer</option>
                <option value="1">Customer (no billing)</option>
                <option value="0">Super admin</option>
              </select>
            </label>
            <button
              type="button"
              className="oc-btn"
              disabled={!!busy || role === String(row.role ?? 2)}
              onClick={() =>
                setConfirm({
                  title: `Make ${row.name || row.email} ${ROLE_LABEL[role]}?`,
                  body: role === "0" ? "Super admins can see every customer's data and change site settings." : "Their navigation and permissions change at next sign-in.",
                  typeToConfirm: role === "0" ? "ADMIN" : null,
                  tone: role === "0" ? "danger" : "accent",
                  action: () => run("role", { role: Number(role) }, { action: "user.setRole", detail: ROLE_LABEL[role] }, `Role changed to ${ROLE_LABEL[role]}.`),
                })
              }
            >
              Change
            </button>
          </div>
          )}
          {can("users.access") && (
          <div className="oc-toggle-row">
            <div>
              <p className="oc-toggle-row__k">{suspended ? "Account suspended" : "Suspend account"}</p>
              <p className="oc-muted">Blocks sign-in. Their data is kept.</p>
            </div>
            <button
              type="button"
              className={`oc-btn ${suspended ? "oc-btn--ghost" : "oc-btn--danger"}`}
              disabled={!!busy}
              onClick={() =>
                suspended
                  ? run("suspend", { disabled: false }, { action: "user.unsuspend" }, "Account reactivated.")
                  : setConfirm({
                      title: `Suspend ${row.name || row.email}?`,
                      body: "They won't be able to sign in until you reactivate them. Nothing is deleted.",
                      typeToConfirm: "SUSPEND",
                      tone: "danger",
                      action: async () => {
                        if (isOwner) return run("suspend", { disabled: true, disabledAt: new Date().toISOString() }, { action: "user.suspend" }, "Account suspended.");
                        setBusy("suspend");
                        try {
                          const res = await submitOrRun("user.suspend", access, { summary: `Suspend ${row.name || row.email}`, payload: { userId: row.id, email: row.email } }, () =>
                            updateUser(row.id, { disabled: true, disabledAt: new Date().toISOString() }, { action: "user.suspend", target: row.email })
                          );
                          setFlash({ tone: res.pending ? "amber" : "green", text: res.pending ? "Sent to the owner for approval." : "Account suspended." });
                          if (!res.pending) onChanged();
                        } catch (e) {
                          setFlash({ tone: "red", text: e.message });
                        } finally {
                          setBusy(null);
                          setConfirm(null);
                        }
                        return null;
                      },
                    })
              }
            >
              {suspended ? "Reactivate" : "Suspend"}
            </button>
          </div>
          )}
        </section>
        )}

        <section className="oc-sec">
          <h3 className="oc-sec__title">Contact</h3>
          <div className="oc-actions">
            {can("messages.send") && <button type="button" className="oc-btn oc-btn--ghost" onClick={() => onMessage([row])}>Send message</button>}
            {row.email && <a className="oc-btn oc-btn--ghost oc-btn--link" href={`mailto:${row.email}`}>Open in email</a>}
          </div>
          <label className="oc-field">
            <span className="oc-field__label">Internal note (only admins see this)</span>
            <textarea className="oc-input oc-textarea" rows={3} value={note} onChange={(e) => setNote(e.target.value)} readOnly={!can("users.edit")} />
          </label>
          {can("users.edit") && (
            <button type="button" className="oc-btn oc-btn--ghost" disabled={!!busy || note === (row.raw.adminNote || "")} onClick={() => run("note", { adminNote: note }, { action: "user.note" }, "Note saved.")}>
              Save note
            </button>
          )}
        </section>
        </>
        )}
      </Drawer>

      {confirm && (
        <Confirm
          title={confirm.title}
          body={<p>{confirm.body}</p>}
          typeToConfirm={confirm.typeToConfirm}
          tone={confirm.tone}
          busy={!!busy}
          onConfirm={confirm.action}
          onClose={() => setConfirm(null)}
        />
      )}
    </>
  );
}

export default function UsersTab({ rows, loading, onChanged, onRestore, onMessage, focusId, onFocusHandled }) {
  const { can } = useAccess();
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState("all");
  const [shown, setShown] = useState(PAGE);
  const [openId, setOpenId] = useState(null);
  const [picked, setPicked] = useState(() => new Set());
  const [sort, setSort] = useState({ key: "signedUp", dir: -1 });
  const [openTickets, setOpenTickets] = useState({});

  useEffect(() => {
    const count = () =>
      getData("tickets").then((r) => {
        const m = {};
        (r.data || []).filter((t) => t.status !== "resolved").forEach((t) => {
          m[t.userId] = (m[t.userId] || 0) + 1;
        });
        setOpenTickets(m);
      });
    count();
    window.addEventListener("oc:data", count);
    return () => window.removeEventListener("oc:data", count);
  }, []);

  useEffect(() => {
    if (focusId) {
      setOpenId(focusId);
      onFocusHandled();
    }
  }, [focusId, onFocusHandled]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    const aud = AUDIENCES.find((a) => a.id === filter) || AUDIENCES[0];
    return rows
      .filter(aud.test)
      .filter((r) => !q || [r.name, r.email, r.company, r.businessType, r.id, r.phone].some((v) => String(v || "").toLowerCase().includes(q)))
      .sort((a, b) => {
        const v = (r) => (sort.key === "tickets" ? openTickets[r.id] || 0 : sort.key === "name" ? (r.name || r.email).toLowerCase() : sort.key === "status" ? r.status : r[sort.key] || 0);
        const x = v(a);
        const y = v(b);
        return (x > y ? 1 : x < y ? -1 : 0) * sort.dir;
      });
  }, [rows, query, filter, sort, openTickets]);

  const sortBy = (key) => setSort((s) => ({ key, dir: s.key === key ? -s.dir : key === "name" || key === "status" ? 1 : -1 }));
  const Th = ({ k, children, num }) => (
    <span role="columnheader" aria-sort={sort.key === k ? (sort.dir > 0 ? "ascending" : "descending") : "none"} className={num ? "oc-num" : ""}>
      <button type="button" className={`oc-th${sort.key === k ? " is-on" : ""}`} onClick={() => sortBy(k)}>
        {children}
        <span className="oc-th__arrow" aria-hidden="true">{sort.key === k ? (sort.dir > 0 ? "↑" : "↓") : ""}</span>
      </button>
    </span>
  );

  useEffect(() => setShown(PAGE), [query, filter]);

  const open = rows.find((r) => r.id === openId);
  const toggle = (id) =>
    setPicked((s) => {
      const n = new Set(s);
      if (n.has(id)) n.delete(id);
      else n.add(id);
      return n;
    });
  const pickedRows = rows.filter((r) => picked.has(r.id));

  const exportList = () =>
    downloadCsv(
      `meksova_users_${filter}.csv`,
      filtered.map((r) => ({ id: r.id, name: r.name, email: r.email, phone: r.phone, business: r.businessType, status: r.status, billing: r.billing || "", signedUp: r.signedUp?.toISOString() || "", trialEnds: r.trialEnd?.toISOString() || "" }))
    );

  return (
    <section className="oc-card oc-users">
      <div className="oc-card__head oc-users__head">
        <h2 className="oc-card__title">Users</h2>
        <div className="oc-users__tools">
          <input className="oc-search" type="search" placeholder="Search name, email, phone…" aria-label="Search users" value={query} onChange={(e) => setQuery(e.target.value)} />
          {can("users.export") && <button type="button" className="oc-btn oc-btn--ghost" onClick={exportList} disabled={!filtered.length}>Export</button>}
        </div>
      </div>
      <div className="oc-filters" role="group" aria-label="Filter by status">
        {AUDIENCES.map((f) => (
          <button key={f.id} type="button" className={`oc-pill${filter === f.id ? " is-on" : ""}`} aria-pressed={filter === f.id} onClick={() => setFilter(f.id)}>
            {f.label} <span className="mono oc-pill__n">{rows.filter(f.test).length}</span>
          </button>
        ))}
      </div>

      {picked.size > 0 && (
        <div className="oc-bulk" role="status">
          <span className="mono">{picked.size} selected</span>
          {can("messages.send") && <button type="button" className="oc-btn" onClick={() => onMessage(pickedRows)}>Message selected</button>}
          {can("users.export") && <button type="button" className="oc-btn oc-btn--ghost" onClick={() => downloadCsv("meksova_selected_users.csv", pickedRows.map((r) => ({ id: r.id, name: r.name, email: r.email, phone: r.phone, status: r.status })))}>Export selected</button>}
          <button type="button" className="oc-btn oc-btn--ghost" onClick={() => setPicked(new Set())}>Clear</button>
        </div>
      )}

      {loading ? (
        <div className="oc-skel oc-skel--block" />
      ) : filtered.length === 0 ? (
        <p className="oc-empty">{rows.length ? "No users match this search or filter." : "No users yet."}</p>
      ) : (
        <>
          <div className="oc-table oc-table--users" role="table" aria-label="Users">
            <div className="oc-tr oc-tr--head" role="row">
              <span role="columnheader"><span className="sr-only">Select</span></span>
              <Th k="name">Customer</Th>
              <Th k="status">Status</Th>
              <Th k="signedUp">Signed up</Th>
              <Th k="lastActive">Last active</Th>
              <Th k="paid" num>Paid</Th>
              <Th k="tickets" num>Tickets</Th>
            </div>
            {filtered.slice(0, shown).map((r) => (
              <div className={`oc-tr${picked.has(r.id) ? " is-picked" : ""}`} role="row" key={r.id}>
                <span role="cell" className="oc-td-pick">
                  <input type="checkbox" checked={picked.has(r.id)} onChange={() => toggle(r.id)} aria-label={`Select ${r.name || r.email}`} />
                </span>
                <span role="cell" className="oc-td-user">
                  <button type="button" className="oc-td-user__btn" onClick={() => setOpenId(r.id)}>
                    <span className="oc-td-user__name">{r.name || "—"}</span>
                    <span className="oc-td-user__mail">{r.email}</span>
                    {(r.businessType || r.company) && <span className="oc-td-user__biz">{r.businessType || r.company}</span>}
                  </button>
                </span>
                <span role="cell" data-k="Status" className="oc-td-stack">
                  <StatusChip status={r.status} />
                  {(r.status === "trial" || r.status === "expired") && r.trialEnd && <span className="oc-td-sub mono">{r.status === "trial" ? "ends" : "ended"} {fmtDate(r.trialEnd)}</span>}
                </span>
                <span role="cell" data-k="Signed up" className="mono">{fmtDate(r.signedUp)}</span>
                <span role="cell" data-k="Last active" className="mono">{r.lastActive ? relTime(r.lastActive) : "—"}</span>
                <span role="cell" data-k="Paid" className="oc-td-stack oc-num">
                  <span className="mono" title={r.paidEstimated ? "Estimated from months subscribed at list price" : undefined}>{r.paid ? `${fmtMoney(r.paid)}${r.paidEstimated ? "*" : ""}` : "—"}</span>
                  {r.billing && <span className="oc-td-sub mono">{r.billing}</span>}
                </span>
                <span role="cell" data-k="Tickets" className="mono oc-num">
                  {openTickets[r.id] ? <span className="oc-chip oc-chip--red">{openTickets[r.id]} open</span> : "—"}
                </span>
              </div>
            ))}
          </div>
          <div className="oc-foot">
            <span className="mono">Showing {Math.min(shown, filtered.length)} of {filtered.length}{filtered.some((r) => r.paidEstimated) ? " · * paid is estimated until billing is connected" : ""}</span>
            {shown < filtered.length && (
              <button type="button" className="oc-btn oc-btn--ghost" onClick={() => setShown((n) => n + PAGE)}>Show more</button>
            )}
          </div>
        </>
      )}

      {open && <UserDrawer key={open.id} row={open} onClose={() => setOpenId(null)} onChanged={onChanged} onRestore={(r) => { setOpenId(null); onRestore(r); }} onMessage={(list) => { setOpenId(null); onMessage(list); }} />}
    </section>
  );
}
