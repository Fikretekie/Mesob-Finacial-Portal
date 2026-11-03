import React, { useState } from "react";
import { SiteBanner } from "components/SiteGate";
import { currentRate } from "utils/mileageRate";
import useConfigDraft from "./useConfigDraft";
import { Confirm, Notice, fmtDateTime } from "./shared";

const FEATURES = [
  { key: "receipts", label: "Receipts", hint: "Receipt list and scanning" },
  { key: "documents", label: "Documents", hint: "Document storage" },
  { key: "mileage", label: "Mileage tracker", hint: "Trips, trip history, drives to review" },
  { key: "ifta", label: "IFTA & fuel", hint: "Trucking fuel purchases and IFTA report" },
  { key: "connections", label: "Connections page", hint: "Bank and POS linking page" },
  { key: "team", label: "Team seats", hint: "Inviting teammates" },
  { key: "backups", label: "Backup CSV page", hint: "Customer-facing backup downloads" },
];

function Switch({ on, onChange, label }) {
  return <button type="button" role="switch" aria-checked={on} aria-label={label} className={`oc-switch${on ? " is-on" : ""}`} onClick={() => onChange(!on)} />;
}

function Tri({ value, onChange, label }) {
  const opts = [
    { v: null, t: "Build flag" },
    { v: true, t: "On" },
    { v: false, t: "Off" },
  ];
  return (
    <div className="oc-seg" role="radiogroup" aria-label={label}>
      {opts.map((o) => (
        <button key={String(o.v)} type="button" role="radio" aria-checked={value === o.v} className={`oc-seg__opt${value === o.v ? " is-on" : ""}`} onClick={() => onChange(o.v)}>
          {o.t}
        </button>
      ))}
    </div>
  );
}

export default function SiteControlTab() {
  const { saved, draft, set, dirty, save, discard, busy, flash, status } = useConfigDraft();
  const [confirm, setConfirm] = useState(false);
  const [rateFrom, setRateFrom] = useState("");
  const [rateVal, setRateVal] = useState("");

  if (!draft) return <div className="oc-card"><div className="oc-skel oc-skel--block" /></div>;

  const b = draft.banner;
  const changes = [];
  if (saved) {
    if (draft.maintenance.enabled !== saved.maintenance.enabled) changes.push(draft.maintenance.enabled ? "turn ON maintenance mode — customers are locked out" : "turn off maintenance mode");
    if (JSON.stringify(draft.banner) !== JSON.stringify(saved.banner)) changes.push(draft.banner.enabled ? "update the announcement banner" : "hide the announcement banner");
    FEATURES.concat([{ key: "signups", label: "Sign-ups" }, { key: "plaid", label: "Plaid" }, { key: "square", label: "Square" }]).forEach((f) => {
      if (draft.features[f.key] !== saved.features[f.key]) changes.push(`${f.label}: ${draft.features[f.key] === null ? "follow build flag" : draft.features[f.key] === false ? "off" : "on"}`);
    });
    if (Number(draft.trialDays) !== Number(saved.trialDays)) changes.push(`free trial → ${draft.trialDays} days`);
    if (JSON.stringify(draft.app) !== JSON.stringify(saved.app)) changes.push(draft.app.minVersion ? `require app version ${draft.app.minVersion}+` : "update app settings");
    if (JSON.stringify(draft.support) !== JSON.stringify(saved.support)) changes.push("update support contact");
  }

  return (
    <>
      {status === "offline" && <Notice>Site settings aren't connected to the backend yet. Everything below runs on its defaults. You can edit and preview; publishing needs the SiteConfig route.</Notice>}

      <div className="oc-grid">
        <section className="oc-card oc-card--wide">
          <div className="oc-card__head">
            <h2 className="oc-card__title">Announcement banner</h2>
            <Switch on={b.enabled} onChange={(v) => set("banner.enabled", v)} label="Show banner" />
          </div>
          <div className="oc-form-grid">
            <label className="oc-field oc-field--span">
              <span className="oc-field__label">Message</span>
              <input className="oc-input" value={b.message} maxLength={200} onChange={(e) => { set("banner.message", e.target.value); set("banner.id", ""); /* dismissals key on the text when id is empty */ }} placeholder="e.g. New: export your IFTA report as PDF" />
            </label>
            <label className="oc-field">
              <span className="oc-field__label">Style</span>
              <select className="oc-input" value={b.tone} onChange={(e) => set("banner.tone", e.target.value)}>
                <option value="info">Info (blue)</option>
                <option value="success">Good news (green)</option>
                <option value="warning">Warning (amber)</option>
                <option value="danger">Urgent (red)</option>
              </select>
            </label>
            <label className="oc-field">
              <span className="oc-field__label">Show on</span>
              <select className="oc-input" value={b.audience} onChange={(e) => set("banner.audience", e.target.value)}>
                <option value="all">Website and phone app</option>
                <option value="web">Website only</option>
                <option value="app">Phone app only</option>
              </select>
            </label>
            <label className="oc-field">
              <span className="oc-field__label">Link text</span>
              <input className="oc-input" value={b.linkText} onChange={(e) => set("banner.linkText", e.target.value)} placeholder="Learn more" />
            </label>
            <label className="oc-field">
              <span className="oc-field__label">Link URL</span>
              <input className="oc-input" type="url" value={b.linkUrl} onChange={(e) => set("banner.linkUrl", e.target.value)} placeholder="https://" />
            </label>
            <label className="oc-check oc-check--plain">
              <input type="checkbox" checked={b.dismissible} onChange={(e) => set("banner.dismissible", e.target.checked)} /> <span>Customers can dismiss it</span>
            </label>
          </div>
          {b.message && (
            <div className="oc-preview-slot">
              <span className="oc-hint mono">Preview</span>
              <SiteBanner preview={{ banner: { ...b, enabled: true, audience: "all" } }} />
            </div>
          )}
        </section>

        <section className={`oc-card${draft.maintenance.enabled ? " oc-card--alert" : ""}`}>
          <div className="oc-card__head">
            <h2 className="oc-card__title">Maintenance mode</h2>
            <Switch on={draft.maintenance.enabled} onChange={(v) => set("maintenance.enabled", v)} label="Maintenance mode" />
          </div>
          <p className="oc-muted">Replaces every signed-in screen with a maintenance notice. Super admins can still get in.</p>
          <label className="oc-field">
            <span className="oc-field__label">Message</span>
            <textarea className="oc-input oc-textarea" rows={2} value={draft.maintenance.message} onChange={(e) => set("maintenance.message", e.target.value)} />
          </label>
          <label className="oc-field">
            <span className="oc-field__label">Expected back (optional)</span>
            <input className="oc-input" type="datetime-local" value={draft.maintenance.until} onChange={(e) => set("maintenance.until", e.target.value)} />
          </label>
        </section>

        <section className="oc-card">
          <div className="oc-card__head">
            <h2 className="oc-card__title">Sign-ups &amp; trial</h2>
          </div>
          <div className="oc-toggle-row">
            <div>
              <p className="oc-toggle-row__k">Accept new sign-ups</p>
              <p className="oc-muted">Off shows “Sign-ups are paused” on the sign-up page.</p>
            </div>
            <Switch on={draft.features.signups !== false} onChange={(v) => set("features.signups", v)} label="Accept new sign-ups" />
          </div>
          <label className="oc-field">
            <span className="oc-field__label">Free trial length (days, new accounts)</span>
            <input className="oc-input mono oc-input--narrow" type="number" min={0} max={365} value={draft.trialDays} onChange={(e) => set("trialDays", Math.max(0, Math.min(365, Number(e.target.value) || 0)))} />
          </label>
        </section>

        <section className="oc-card oc-card--wide">
          <div className="oc-card__head">
            <h2 className="oc-card__title">Features</h2>
            <span className="oc-card__meta mono">turn off a broken feature instantly</span>
          </div>
          <div className="oc-feature-grid">
            {FEATURES.map((f) => (
              <div className="oc-toggle-row" key={f.key}>
                <div>
                  <p className="oc-toggle-row__k">{f.label}</p>
                  <p className="oc-muted">{f.hint}</p>
                </div>
                <Switch on={draft.features[f.key] !== false} onChange={(v) => set(`features.${f.key}`, v)} label={f.label} />
              </div>
            ))}
            {[{ key: "plaid", label: "Plaid bank linking" }, { key: "square", label: "Square POS linking" }].map((f) => (
              <div className="oc-toggle-row" key={f.key}>
                <div>
                  <p className="oc-toggle-row__k">{f.label}</p>
                  <p className="oc-muted">Override the build-time switch</p>
                </div>
                <Tri value={draft.features[f.key] ?? null} onChange={(v) => set(`features.${f.key}`, v)} label={f.label} />
              </div>
            ))}
          </div>
        </section>

        <section className="oc-card">
          <div className="oc-card__head">
            <h2 className="oc-card__title">Phone app</h2>
          </div>
          <p className="oc-muted">Below this version the app shows “Update required” and links to the store.</p>
          <label className="oc-field">
            <span className="oc-field__label">Minimum version</span>
            <input className="oc-input mono oc-input--narrow" value={draft.app.minVersion} onChange={(e) => set("app.minVersion", e.target.value.replace(/[^\d.]/g, ""))} placeholder="e.g. 1.5.2" />
          </label>
          <label className="oc-field">
            <span className="oc-field__label">Store link</span>
            <input className="oc-input" type="url" value={draft.app.updateUrl} onChange={(e) => set("app.updateUrl", e.target.value)} />
          </label>
          <label className="oc-field">
            <span className="oc-field__label">Message</span>
            <input className="oc-input" value={draft.app.updateMessage} onChange={(e) => set("app.updateMessage", e.target.value)} />
          </label>
        </section>

        <section className="oc-card">
          <div className="oc-card__head">
            <h2 className="oc-card__title">IRS mileage rate</h2>
            <span className="oc-card__meta mono">now ${currentRate().toFixed(3)}/mi</span>
          </div>
          <p className="oc-muted">When the IRS announces a new rate, add it here. Trips on or after that date use it in deductions. No app update needed.</p>
          {(draft.app.mileageRates || []).length > 0 && (
            <ul className="oc-rates">
              {draft.app.mileageRates.map((r, i) => (
                <li key={`${r.from}-${i}`} className="oc-rates__row">
                  <span className="mono">from {r.from}</span>
                  <span className="mono">${Number(r.rate).toFixed(3)}/mi</span>
                  <button type="button" className="oc-link-btn" onClick={() => set("app.mileageRates", draft.app.mileageRates.filter((_, j) => j !== i))}>Remove</button>
                </li>
              ))}
            </ul>
          )}
          <div className="oc-inline">
            <label className="oc-field oc-field--grow">
              <span className="oc-field__label">From date</span>
              <input className="oc-input" type="date" value={rateFrom} onChange={(e) => setRateFrom(e.target.value)} />
            </label>
            <label className="oc-field oc-field--grow">
              <span className="oc-field__label">$ per mile</span>
              <input className="oc-input mono" type="number" step="0.005" min="0.1" max="2" value={rateVal} onChange={(e) => setRateVal(e.target.value)} placeholder="0.780" />
            </label>
            <button
              type="button"
              className="oc-btn oc-btn--ghost"
              disabled={!rateFrom || !(Number(rateVal) > 0)}
              onClick={() => {
                set("app.mileageRates", [...(draft.app.mileageRates || []).filter((r) => r.from !== rateFrom), { from: rateFrom, rate: Number(rateVal) }].sort((a, b) => (a.from < b.from ? 1 : -1)));
                setRateFrom("");
                setRateVal("");
              }}
            >
              Add rate
            </button>
          </div>
        </section>

        <section className="oc-card">
          <div className="oc-card__head">
            <h2 className="oc-card__title">Support contact</h2>
          </div>
          <label className="oc-field">
            <span className="oc-field__label">Email</span>
            <input className="oc-input" type="email" value={draft.support.email} onChange={(e) => set("support.email", e.target.value)} placeholder="support@meksova.com" />
          </label>
          <label className="oc-field">
            <span className="oc-field__label">Phone</span>
            <input className="oc-input" value={draft.support.phone} onChange={(e) => set("support.phone", e.target.value)} />
          </label>
        </section>
      </div>

      {(dirty || flash) && (
        <div className="oc-savebar" role="region" aria-label="Unsaved changes">
          {flash ? (
            <span className={`oc-savebar__msg oc-text--${flash.tone}`}>{flash.text}</span>
          ) : (
            <span className="oc-savebar__msg">{changes.length} unsaved change{changes.length === 1 ? "" : "s"}{saved.updatedAt ? ` · last published ${fmtDateTime(new Date(saved.updatedAt))} by ${saved.updatedBy}` : ""}</span>
          )}
          {dirty && (
            <>
              <button type="button" className="oc-btn oc-btn--ghost" onClick={discard} disabled={busy}>Discard</button>
              <button type="button" className="oc-btn" onClick={() => setConfirm(true)} disabled={busy}>Publish</button>
            </>
          )}
        </div>
      )}

      {confirm && (
        <Confirm
          title="Publish these changes?"
          body={
            <>
              <p>This goes live on the website and in the phone app:</p>
              <ul className="oc-confirm__list">{changes.map((c) => <li key={c}>{c}</li>)}</ul>
            </>
          }
          typeToConfirm={draft.maintenance.enabled && !saved.maintenance.enabled ? "MAINTENANCE" : null}
          tone={draft.maintenance.enabled && !saved.maintenance.enabled ? "danger" : "accent"}
          confirmLabel="Publish"
          busy={busy}
          onConfirm={async () => {
            await save("site.update", changes.join("; "));
            setConfirm(false);
          }}
          onClose={() => setConfirm(false)}
        />
      )}
    </>
  );
}
