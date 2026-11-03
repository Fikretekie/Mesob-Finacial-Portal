import React, { useEffect, useState } from "react";
import { getData } from "utils/adminData";
import { BarChart, HBars, Kpis, Notice } from "./shared";

export default function UsageTab() {
  const [state, setState] = useState(null);
  useEffect(() => {
    getData("usage").then(setState);
  }, []);

  if (!state) return <div className="oc-card"><div className="oc-skel oc-skel--block" /></div>;
  if (!state.data) return <Notice>Usage numbers aren't connected yet. They need the AdminData/usage route (daily active users and feature events).</Notice>;

  const u = state.data;
  const today = u.dau[u.dau.length - 1];
  const weekAgo = u.dau[u.dau.length - 8];
  const labels = u.dau.map((_, i) => {
    const d = new Date(Date.now() - (u.dau.length - 1 - i) * 86400000);
    return `${d.getMonth() + 1}/${d.getDate()}`;
  });
  const platformTotal = u.platform.reduce((a, p) => a + p.n, 0);

  return (
    <>
      <Kpis
        tiles={[
          { k: "Active today", v: today, foot: `${today - weekAgo >= 0 ? "+" : "−"}${Math.abs(today - weekAgo)} vs same day last week`, tone: today >= weekAgo ? "green" : "red" },
          { k: "Active this week", v: u.wau },
          { k: "Active this month", v: u.mau },
          { k: "Stickiness", v: `${Math.round((u.wau / u.mau) * 100)}%`, foot: "weekly ÷ monthly" },
        ]}
      />

      <section className="oc-grid">
        <div className="oc-card oc-card--wide">
          <div className="oc-card__head">
            <h2 className="oc-card__title">Daily active users</h2>
            <span className="oc-card__meta mono">last 30 days · axis starts at 0</span>
          </div>
          <BarChart values={u.dau} labels={labels} labelEvery={5} title="Daily active users, last 30 days" markLast />
        </div>

        <div className="oc-card">
          <div className="oc-card__head">
            <h2 className="oc-card__title">What people use</h2>
            <span className="oc-card__meta mono">% of monthly users</span>
          </div>
          <HBars items={u.features.map((f) => ({ label: f.label, value: f.users }))} of={u.mau} format={(v) => `${Math.round((v / u.mau) * 100)}%`} />
        </div>

        <div className="oc-card">
          <div className="oc-card__head">
            <h2 className="oc-card__title">Where they use it</h2>
            <span className="oc-card__meta mono">{platformTotal} users</span>
          </div>
          <HBars items={u.platform.map((p, i) => ({ label: p.label, value: p.n, tone: ["accent", "teal", "green"][i] }))} />
          <p className="oc-hint">Low feature use is usually a discovery problem: try a “Did you know?” automation or a What's new post.</p>
        </div>
      </section>
    </>
  );
}
