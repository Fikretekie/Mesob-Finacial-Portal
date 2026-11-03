import React, { useEffect, useState } from "react";
import { getData, putData } from "utils/adminData";
import { loadConfig, saveConfig } from "utils/adminApi";
import { BarChart, Kpis, Notice, fmtDateTime, relTime } from "./shared";

const STATUS = {
  ok: { label: "Working", tone: "green" },
  degraded: { label: "Slow", tone: "amber" },
  down: { label: "Down", tone: "red" },
};

export default function HealthTab({ onGo }) {
  const [state, setState] = useState(null);
  const [flash, setFlash] = useState(null);
  const [busy, setBusy] = useState(false);

  const load = () => getData("health").then(setState);
  useEffect(() => {
    load();
  }, []);

  if (!state) return <div className="oc-card"><div className="oc-skel oc-skel--block" /></div>;
  if (!state.data) return <Notice>System health isn't connected yet. It needs the AdminData/health route (CloudWatch metrics and app crash reports).</Notice>;

  const h = state.data;
  const issues = h.services.filter((s) => s.status !== "ok").length;
  const open = h.incidents.filter((i) => i.status !== "resolved");
  const hours = h.errors24.map((_, i) => {
    const d = new Date(Date.now() - (23 - i) * 3600000);
    return `${d.getHours()}:00`;
  });

  const postBanner = async (inc) => {
    setBusy(true);
    try {
      const { config } = await loadConfig();
      config.banner = { ...config.banner, enabled: true, id: `inc-${inc.id}`, tone: "warning", message: `${inc.title}. We're on it — your data is safe.`, linkText: "", linkUrl: "", audience: "all", dismissible: true };
      await saveConfig(config, "banner.publish", `Incident: ${inc.title}`);
      setFlash({ tone: "green", text: "Status banner is live in the app and on the website." });
    } catch (e) {
      setFlash({ tone: e.notConnected ? "amber" : "red", text: e.message });
    } finally {
      setBusy(false);
    }
  };

  const resolve = async (inc) => {
    setBusy(true);
    try {
      await putData("health", { ...h, incidents: h.incidents.map((i) => (i.id === inc.id ? { ...i, status: "resolved", resolvedAt: new Date().toISOString() } : i)) }, { action: "incident.resolve", target: inc.title });
      const { config } = await loadConfig();
      if (config.banner?.id === `inc-${inc.id}`) {
        config.banner = { ...config.banner, enabled: false };
        await saveConfig(config, "banner.publish", "Incident banner removed");
      }
      setFlash({ tone: "green", text: "Marked resolved." });
      load();
    } catch (e) {
      setFlash({ tone: e.notConnected ? "amber" : "red", text: e.message });
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <Kpis
        tiles={[
          { k: "Uptime · 30 days", v: `${h.uptime30}%`, tone: h.uptime30 >= 99.9 ? "green" : "red", foot: h.uptime30 >= 99.9 ? "healthy" : "below 99.9% target" },
          { k: "Services with issues", v: issues, tone: issues ? "red" : "green", foot: `of ${h.services.length}` },
          { k: "Errors · 24h", v: h.errors24.reduce((a, n) => a + n, 0), foot: `peak ${Math.max(...h.errors24)}/hour` },
          { k: "Open incidents", v: open.length, tone: open.length ? "red" : "green", foot: open.length ? open[0].title : "none" },
        ]}
      />

      {flash && <div className={`oc-flash oc-edge--${flash.tone}`} role="status">{flash.text}</div>}

      {open.map((inc) => (
        <div key={inc.id} className="oc-incident" role="status">
          <div className="oc-incident__text">
            <span className="oc-incident__title">{inc.title}</span>
            <span className="oc-muted">{inc.note} · started {relTime(inc.startedAt)}</span>
          </div>
          <div className="oc-actions oc-actions--tight">
            <button type="button" className="oc-btn oc-btn--ghost" disabled={busy} onClick={() => postBanner(inc)}>Tell customers</button>
            <button type="button" className="oc-btn" disabled={busy} onClick={() => resolve(inc)}>Mark resolved</button>
          </div>
        </div>
      ))}

      <section className="oc-grid">
        <div className="oc-card">
          <div className="oc-card__head">
            <h2 className="oc-card__title">Services</h2>
            <button type="button" className="oc-link-btn" onClick={() => onGo("site")}>Turn a feature off ›</button>
          </div>
          <ul className="oc-services">
            {h.services.map((s) => (
              <li key={s.name} className={`oc-services__row oc-edge--${STATUS[s.status].tone}`}>
                <span className="oc-services__name">{s.name}</span>
                <span className={`oc-chip oc-chip--${STATUS[s.status].tone}`}>{STATUS[s.status].label}</span>
                <span className="oc-services__meta mono">
                  {s.note || [s.latencyMs != null ? `${s.latencyMs} ms` : null, `${s.errorRate}% errors`].filter(Boolean).join(" · ")}
                </span>
              </li>
            ))}
          </ul>
        </div>

        <div className="oc-card">
          <div className="oc-card__head">
            <h2 className="oc-card__title">Errors per hour</h2>
            <span className="oc-card__meta mono">last 24h</span>
          </div>
          <BarChart values={h.errors24} labels={hours} labelEvery={6} title="Errors per hour, last 24 hours" tone="red" />
        </div>

        <div className="oc-card oc-card--wide">
          <div className="oc-card__head">
            <h2 className="oc-card__title">Recent errors</h2>
          </div>
          <ul className="oc-log">
            {h.recent.map((e, i) => (
              <li key={i} className="oc-log__item oc-edge--red">
                <span className="oc-log__what">{e.message}</span>
                <span className="oc-log__meta mono">{e.service} · {e.count}× · {fmtDateTime(new Date(e.at))}</span>
              </li>
            ))}
          </ul>
        </div>
      </section>
    </>
  );
}
