import React, { useEffect, useState } from "react";
import { fetchTimeline, getInvoices, billingAction } from "utils/adminData";
import { submitOrRun } from "utils/approvals";
import { useAccess } from "utils/staffAccess";
import { Confirm, Notice, fmtDate, fmtDateTime, fmtMoney } from "./shared";

const KINDS = [
  { id: "all", label: "All" },
  { id: "billing", label: "Billing" },
  { id: "support", label: "Support" },
  { id: "data", label: "Data" },
  { id: "message", label: "Messages" },
  { id: "staff", label: "Staff actions" },
];

/** One customer's whole story: account, money, support, data and staff actions. */
export function TimelinePanel({ row }) {
  const [events, setEvents] = useState(null);
  const [kind, setKind] = useState("all");
  useEffect(() => {
    fetchTimeline(row).then(setEvents).catch(() => setEvents([]));
  }, [row]);

  if (!events) return <div className="oc-skel oc-skel--block" />;
  const list = events.filter((e) => kind === "all" || e.kind === kind);
  return (
    <>
      <div className="oc-filters" role="group" aria-label="Filter history">
        {KINDS.map((k) => (
          <button key={k.id} type="button" className={`oc-pill${kind === k.id ? " is-on" : ""}`} aria-pressed={kind === k.id} onClick={() => setKind(k.id)}>
            {k.label}
          </button>
        ))}
      </div>
      {list.length === 0 ? (
        <p className="oc-empty">Nothing here yet.</p>
      ) : (
        <ol className="oc-timeline">
          {list.map((e, i) => (
            <li key={i} className={`oc-timeline__item oc-dot-${e.tone}`}>
              <span className="oc-timeline__text">{e.text}</span>
              <span className="oc-timeline__at mono">{fmtDateTime(e.at)}</span>
            </li>
          ))}
        </ol>
      )}
    </>
  );
}

/** Invoices plus refund / cancel / pause / plan changes. */
export function BillingPanel({ row, onChanged }) {
  const access = useAccess();
  const canAct = access.can("billing.manage");
  const [inv, setInv] = useState(null);
  const [source, setSource] = useState(null);
  const [flash, setFlash] = useState(null);
  const [busy, setBusy] = useState(false);
  const [refund, setRefund] = useState(null);
  const [cancel, setCancel] = useState(false);

  const load = () =>
    getInvoices(row).then((r) => {
      setInv(r.data || []);
      setSource(r.source);
    });
  useEffect(() => {
    load();
  }, [row.id]);

  const run = async (fn, ok) => {
    setBusy(true);
    setFlash(null);
    try {
      const res = await fn();
      setFlash({ tone: res?.pending ? "amber" : "green", text: res?.pending ? "Sent to the owner for approval. It happens once they approve." : ok });
      await load();
      onChanged();
    } catch (e) {
      setFlash({ tone: e.notConnected ? "amber" : "red", text: e.message });
    } finally {
      setBusy(false);
      setRefund(null);
      setCancel(false);
    }
  };

  const sub = row.sub;
  const yearly = /year/i.test(sub?.subscriptionPlan || "");
  const paused = sub?.pausedUntil && new Date(sub.pausedUntil) > new Date();

  return (
    <>
      {source === "offline" && <Notice>Billing isn't connected yet. It needs the AdminData/billing route to talk to Stripe and PayPal.</Notice>}
      {flash && <div className={`oc-flash oc-edge--${flash.tone}`} role="status">{flash.text}</div>}

      <section className="oc-sec">
        <h3 className="oc-sec__title">Plan</h3>
        {!sub ? (
          <p className="oc-muted">No subscription. Use “Complimentary access” in Summary to give them paid features for free.</p>
        ) : (
          <>
            <div className="oc-kvs">
              <div className="oc-kv"><span className="oc-kv__k mono">Plan</span><span className="oc-kv__v">{sub.subscriptionPlan || "—"} · {yearly ? "$249.99/yr" : "$24.99/mo"}</span></div>
              <div className="oc-kv"><span className="oc-kv__k mono">Status</span><span className="oc-kv__v">{sub.cancelAtPeriodEnd ? "Cancels at period end" : paused ? `Paused until ${fmtDate(new Date(sub.pausedUntil))}` : sub.status}</span></div>
              <div className="oc-kv"><span className="oc-kv__k mono">Paid with</span><span className="oc-kv__v">{row.billing || "—"}</span></div>
              <div className="oc-kv"><span className="oc-kv__k mono">Subscription ID</span><span className="oc-kv__v mono">{sub.id}</span></div>
            </div>
            {canAct && String(sub.status).toLowerCase() !== "canceled" && (
              <div className="oc-actions">
                <button type="button" className="oc-btn oc-btn--ghost" disabled={busy} onClick={() => run(() => billingAction(row, "switch", { plan: yearly ? "Monthly" : "Yearly" }), `Switched to ${yearly ? "monthly" : "yearly"}. The difference is prorated.`)}>
                  Switch to {yearly ? "monthly" : "yearly"}
                </button>
                {paused || sub.cancelAtPeriodEnd ? (
                  <button type="button" className="oc-btn oc-btn--ghost" disabled={busy} onClick={() => run(() => billingAction(row, "resume"), "Billing resumed.")}>Resume</button>
                ) : (
                  <button type="button" className="oc-btn oc-btn--ghost" disabled={busy} onClick={() => run(() => billingAction(row, "pause", { months: 1 }), "Paused for 1 month. They keep their data and can resume any time.")}>Pause 1 month</button>
                )}
                {!sub.cancelAtPeriodEnd && <button type="button" className="oc-btn oc-btn--danger" disabled={busy} onClick={() => setCancel(true)}>Cancel…</button>}
              </div>
            )}
          </>
        )}
      </section>

      <section className="oc-sec">
        <h3 className="oc-sec__title">Payments</h3>
        {!inv ? (
          <div className="oc-skel oc-skel--line" />
        ) : inv.length === 0 ? (
          <p className="oc-muted">No payments yet.</p>
        ) : (
          <ul className="oc-invoices">
            {inv.map((i) => (
              <li key={i.id} className={`oc-invoice oc-edge--${i.status === "failed" ? "red" : i.refunded ? "amber" : "green"}`}>
                <span className="mono">{fmtDate(new Date(i.date))}</span>
                <span className="mono">{fmtMoney(i.amount)}</span>
                <span className="oc-invoice__st">{i.status}{i.refunded ? ` · ${fmtMoney(i.refunded)} back` : ""}</span>
                <span className="oc-invoice__m">{i.method}</span>
                {canAct && i.status !== "failed" && i.refunded < i.amount && (
                  <button type="button" className="oc-link-btn" onClick={() => setRefund({ invoice: i, amount: (i.amount - i.refunded).toFixed(2), reason: "" })}>Refund</button>
                )}
              </li>
            ))}
          </ul>
        )}
      </section>

      {refund && (
        <Confirm
          title={`Refund ${row.name || row.email}`}
          body={
            <>
              <p>Payment of {fmtMoney(refund.invoice.amount)} on {fmtDate(new Date(refund.invoice.date))}. The money goes back to {refund.invoice.method} in 5–10 days.</p>
              <div className="oc-inline">
                <label className="oc-field oc-field--grow">
                  <span className="oc-field__label">Amount</span>
                  <input className="oc-input mono" type="number" step="0.01" min="0.01" max={refund.invoice.amount - refund.invoice.refunded} value={refund.amount} onChange={(e) => setRefund({ ...refund, amount: e.target.value })} />
                </label>
                <label className="oc-field oc-field--grow">
                  <span className="oc-field__label">Reason</span>
                  <input className="oc-input" value={refund.reason} onChange={(e) => setRefund({ ...refund, reason: e.target.value })} placeholder="Duplicate charge" />
                </label>
              </div>
            </>
          }
          confirmLabel={access.isOwner ? "Refund" : "Ask owner to approve"}
          busy={busy}
          onConfirm={() =>
            run(
              () =>
                submitOrRun("billing.refund", access, { summary: `Refund $${Number(refund.amount).toFixed(2)} to ${row.name || row.email}`, reason: refund.reason, payload: { row: { id: row.id, email: row.email }, opts: { amount: Number(refund.amount), invoiceId: refund.invoice.id, reason: refund.reason } } }, () =>
                  billingAction(row, "refund", { amount: Number(refund.amount), invoiceId: refund.invoice.id, reason: refund.reason })
                ),
              `Refunded ${fmtMoney(Number(refund.amount))}.`
            )
          }
          onClose={() => setRefund(null)}
        />
      )}
      {cancel && (
        <Confirm
          title={`Cancel ${row.name || row.email}'s subscription?`}
          body={<p>“At period end” lets them keep access until the paid period runs out. “Now” stops access today with no refund.</p>}
          typeToConfirm="CANCEL"
          tone="danger"
          confirmLabel={access.isOwner ? "Cancel at period end" : "Ask owner to approve"}
          busy={busy}
          onConfirm={() =>
            run(
              () => submitOrRun("billing.cancel", access, { summary: `Cancel ${row.name || row.email}'s subscription`, payload: { row: { id: row.id, email: row.email }, opts: { when: "period_end" } } }, () => billingAction(row, "cancel", { when: "period_end" })),
              "Subscription will end at the close of the current period."
            )
          }
          onClose={() => setCancel(false)}
        />
      )}
    </>
  );
}
