import React, { useCallback, useEffect, useState } from "react";
import { getData, putData } from "utils/adminData";
import { Drawer, Kpis, Notice, fmtDate } from "./shared";

const describe = (p) => (p.kind === "percent" ? `${p.value}% off` : `${p.value} free month${p.value === 1 ? "" : "s"}`) + (p.kind === "percent" && p.duration !== "once" ? ` for ${p.duration}` : p.kind === "percent" ? " first payment" : "");

const expired = (p) => p.expiresAt && new Date(`${p.expiresAt}T23:59:59`) < new Date();
const statusOf = (p) => (!p.active ? "off" : expired(p) ? "expired" : p.used >= p.maxUses ? "used up" : "live");
const TONE = { live: "green", off: "muted", expired: "amber", "used up": "amber" };

function NewCode({ onClose, onSaved }) {
  const [d, setD] = useState({ code: "", kind: "percent", value: 20, duration: "once", maxUses: 100, expiresAt: "" });
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState(null);
  const set = (k, v) => setD((x) => ({ ...x, [k]: v }));
  const valid = /^[A-Z0-9]{4,20}$/.test(d.code) && Number(d.value) > 0 && (d.kind !== "percent" || Number(d.value) <= 100);

  const save = async () => {
    setBusy(true);
    try {
      const item = { ...d, id: `p${Date.now()}`, value: Number(d.value), maxUses: Number(d.maxUses), used: 0, active: true, createdAt: new Date().toISOString() };
      await putData("promos", item, { action: "promo.create", target: item.code, detail: describe(item) });
      onSaved(`${item.code} is live.`);
    } catch (e) {
      setErr(e.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Drawer
      title="New promo code"
      sub="Customers enter it at checkout. The discount is applied by Stripe."
      onClose={onClose}
      footer={
        <>
          <button type="button" className="oc-btn oc-btn--ghost" onClick={onClose}>Cancel</button>
          <button type="button" className="oc-btn" disabled={!valid || busy} onClick={save}>{busy ? "Creating…" : "Create code"}</button>
        </>
      }
    >
      {err && <div className="oc-flash oc-edge--red" role="status">{err}</div>}
      <label className="oc-field">
        <span className="oc-field__label">Code (letters and numbers)</span>
        <input className="oc-input mono" value={d.code} onChange={(e) => set("code", e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, ""))} placeholder="SPRING25" />
      </label>
      <div className="oc-inline">
        <label className="oc-field oc-field--grow">
          <span className="oc-field__label">Discount</span>
          <select className="oc-input" value={d.kind} onChange={(e) => set("kind", e.target.value)}>
            <option value="percent">Percent off</option>
            <option value="free_months">Free months</option>
          </select>
        </label>
        <label className="oc-field oc-field--grow">
          <span className="oc-field__label">{d.kind === "percent" ? "Percent" : "Months"}</span>
          <input className="oc-input mono" type="number" min={1} max={d.kind === "percent" ? 100 : 12} value={d.value} onChange={(e) => set("value", e.target.value)} />
        </label>
      </div>
      {d.kind === "percent" && (
        <label className="oc-field">
          <span className="oc-field__label">How long</span>
          <select className="oc-input" value={d.duration} onChange={(e) => set("duration", e.target.value)}>
            <option value="once">First payment only</option>
            <option value="3 months">3 months</option>
            <option value="6 months">6 months</option>
            <option value="forever">Forever</option>
          </select>
        </label>
      )}
      <div className="oc-inline">
        <label className="oc-field oc-field--grow">
          <span className="oc-field__label">Max uses</span>
          <input className="oc-input mono" type="number" min={1} value={d.maxUses} onChange={(e) => set("maxUses", e.target.value)} />
        </label>
        <label className="oc-field oc-field--grow">
          <span className="oc-field__label">Expires (optional)</span>
          <input className="oc-input" type="date" value={d.expiresAt} onChange={(e) => set("expiresAt", e.target.value)} />
        </label>
      </div>
      {valid && <p className="oc-hint">Customers see: <b>{d.code}</b> — {describe(d)}.</p>}
    </Drawer>
  );
}

export default function PromotionsTab() {
  const [promos, setPromos] = useState(null);
  const [referral, setReferral] = useState(null);
  const [source, setSource] = useState(null);
  const [adding, setAdding] = useState(false);
  const [flash, setFlash] = useState(null);
  const [refDraft, setRefDraft] = useState("");

  const load = useCallback(async () => {
    const [p, r] = await Promise.all([getData("promos"), getData("referral")]);
    setPromos(p.data || []);
    setReferral(r.data);
    setRefDraft(r.data?.reward || "");
    setSource(p.source);
  }, []);
  useEffect(() => {
    load();
  }, [load]);

  const run = async (fn, ok) => {
    setFlash(null);
    try {
      await fn();
      if (ok) setFlash({ tone: "green", text: ok });
      await load();
    } catch (e) {
      setFlash({ tone: e.notConnected ? "amber" : "red", text: e.message });
    }
  };

  if (!promos) return <div className="oc-card"><div className="oc-skel oc-skel--block" /></div>;
  const live = promos.filter((p) => statusOf(p) === "live");

  return (
    <>
      <Kpis
        tiles={[
          { k: "Live codes", v: live.length },
          { k: "Redemptions", v: promos.reduce((a, p) => a + p.used, 0), foot: "all time" },
          { k: "Referrals · 30d", v: referral?.referred30 ?? "—", foot: referral ? `${referral.converted30} became paying` : "" },
        ]}
      />
      {source === "offline" && <Notice>Promo codes aren't connected yet. They need the AdminData/promos route, which creates matching Stripe coupons.</Notice>}
      {flash && <div className={`oc-flash oc-edge--${flash.tone}`} role="status">{flash.text}</div>}

      <section className="oc-grid">
        <div className="oc-card oc-card--wide">
          <div className="oc-card__head">
            <h2 className="oc-card__title">Promo codes</h2>
            <button type="button" className="oc-btn" onClick={() => setAdding(true)}>New code</button>
          </div>
          {promos.length === 0 ? (
            <p className="oc-empty">No codes yet.</p>
          ) : (
            <ul className="oc-promos">
              {promos.map((p) => {
                const st = statusOf(p);
                return (
                  <li key={p.id} className="oc-promo">
                    <span className="oc-promo__code mono">{p.code}</span>
                    <span className="oc-promo__what">{describe(p)}</span>
                    <span className="oc-promo__use">
                      <span className="oc-hbars__track" aria-hidden="true">
                        <span className="oc-hbars__bar oc-tone--accent" style={{ "--w": `${Math.min(100, (p.used / p.maxUses) * 100)}%` }} />
                      </span>
                      <span className="mono oc-promo__n">{p.used}/{p.maxUses}</span>
                    </span>
                    <span className="mono oc-promo__exp">{p.expiresAt ? `until ${fmtDate(new Date(`${p.expiresAt}T12:00:00`))}` : "no expiry"}</span>
                    <span className={`oc-chip oc-chip--${TONE[st]}`}>{st}</span>
                    <button
                      type="button"
                      className="oc-btn oc-btn--ghost"
                      onClick={() => run(() => putData("promos", { ...p, active: !p.active }, { action: p.active ? "promo.off" : "promo.on", target: p.code }), p.active ? `${p.code} turned off.` : `${p.code} turned on.`)}
                    >
                      {p.active ? "Turn off" : "Turn on"}
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </div>

        {referral && (
          <div className="oc-card oc-card--wide">
            <div className="oc-card__head">
              <h2 className="oc-card__title">Referral program</h2>
              <button
                type="button"
                role="switch"
                aria-checked={referral.enabled}
                aria-label="Referral program on/off"
                className={`oc-switch${referral.enabled ? " is-on" : ""}`}
                onClick={() => run(() => putData("referral", { ...referral, enabled: !referral.enabled }, { action: referral.enabled ? "referral.off" : "referral.on", target: "referral program" }))}
              />
            </div>
            <p className="oc-muted">Each customer gets a share link in Account. When a friend subscribes, both get the reward.</p>
            <div className="oc-inline">
              <label className="oc-field oc-field--grow">
                <span className="oc-field__label">Reward</span>
                <input className="oc-input" value={refDraft} onChange={(e) => setRefDraft(e.target.value)} />
              </label>
              <button type="button" className="oc-btn" disabled={refDraft === referral.reward || !refDraft.trim()} onClick={() => run(() => putData("referral", { ...referral, reward: refDraft.trim() }, { action: "referral.update", target: "referral program", detail: refDraft.trim() }), "Referral reward updated.")}>
                Save
              </button>
            </div>
          </div>
        )}
      </section>

      {adding && <NewCode onClose={() => setAdding(false)} onSaved={(t) => { setAdding(false); setFlash({ tone: "green", text: t }); load(); }} />}
    </>
  );
}
