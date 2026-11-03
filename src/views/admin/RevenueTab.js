import React, { useEffect, useState } from "react";
import { getData } from "utils/adminData";
import { BarChart, HBars, Kpis, Notice, fmtMoney } from "./shared";

const monthLabel = (m) => new Date(`${m}-15`).toLocaleDateString(undefined, { month: "short" });

export default function RevenueTab() {
  const [state, setState] = useState(null);
  useEffect(() => {
    getData("revenue").then(setState);
  }, []);

  if (!state) return <div className="oc-card"><div className="oc-skel oc-skel--block" /></div>;
  if (!state.data) return <Notice>Revenue history isn't connected yet. It needs the AdminData/revenue route (Stripe + PayPal totals by month).</Notice>;

  const { months, cancelReasons } = state.data;
  const cur = months[months.length - 1];
  const prev = months[months.length - 2];
  const growth = prev.mrr ? ((cur.mrr - prev.mrr) / prev.mrr) * 100 : 0;
  const churnRate = prev.paying ? (cur.churned / prev.paying) * 100 : 0;
  const arpu = cur.paying ? cur.mrr / cur.paying : 0;
  const year = months.reduce((a, m) => a + m.mrr, 0);
  const labels = months.map((m) => monthLabel(m.month));

  return (
    <>
      <Kpis
        tiles={[
          { k: "MRR this month", v: fmtMoney(cur.mrr), foot: `${growth >= 0 ? "+" : "−"}${Math.abs(growth).toFixed(1)}% vs last month`, tone: growth >= 0 ? "green" : "red" },
          { k: "Paying customers", v: cur.paying, foot: `+${cur.newPaid} new · −${cur.churned} left` },
          { k: "Avg per customer", v: fmtMoney(arpu), foot: "per month" },
          { k: "Churn", v: `${churnRate.toFixed(1)}%`, foot: "of last month's payers", tone: churnRate > 5 ? "red" : null },
          { k: "Last 12 months", v: fmtMoney(year), foot: `${months.reduce((a, m) => a + m.refunds, 0)} refunds` },
        ]}
      />

      <section className="oc-grid">
        <div className="oc-card oc-card--wide">
          <div className="oc-card__head">
            <h2 className="oc-card__title">Monthly recurring revenue</h2>
            <span className="oc-card__meta mono">last 12 months · axis starts at $0</span>
          </div>
          <BarChart values={months.map((m) => m.mrr)} labels={labels} format={(v) => `$${Math.round(v / 100) / 10}k`} title="Monthly recurring revenue, last 12 months" markLast />
        </div>

        <div className="oc-card">
          <div className="oc-card__head">
            <h2 className="oc-card__title">New vs lost customers</h2>
            <span className="oc-card__meta mono">per month</span>
          </div>
          <div className="oc-pairs" role="img" aria-label="New paying customers and cancellations per month">
            {months.slice(-6).map((m) => (
              <div key={m.month} className="oc-pairs__row">
                <span className="oc-pairs__m mono">{monthLabel(m.month)}</span>
                <span className="oc-pairs__bar oc-tone--green" style={{ "--w": `${m.newPaid * 6}%` }} />
                <span className="mono oc-pairs__n oc-text--green">+{m.newPaid}</span>
                <span className="oc-pairs__bar oc-tone--red" style={{ "--w": `${m.churned * 6}%` }} />
                <span className="mono oc-pairs__n oc-text--red">−{m.churned}</span>
              </div>
            ))}
          </div>
        </div>

        <div className="oc-card">
          <div className="oc-card__head">
            <h2 className="oc-card__title">Why people cancel</h2>
            <span className="oc-card__meta mono">{cancelReasons.reduce((a, r) => a + r.n, 0)} answers</span>
          </div>
          <HBars items={cancelReasons.map((r) => ({ label: r.reason, value: r.n, tone: "muted" }))} />
          <p className="oc-hint">Asked in the cancel flow. “Too expensive” is your cue for a retention offer in Promotions.</p>
        </div>
      </section>
    </>
  );
}
