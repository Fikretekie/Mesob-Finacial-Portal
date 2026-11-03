import React, { useState } from "react";
import { PolicyBody } from "views/PolicyPage";
import { POLICY_PATHS } from "components/PolicyGate";
import useConfigDraft from "./useConfigDraft";
import { Confirm, Notice, fmtDateTime } from "./shared";

const KINDS = [
  { id: "terms", label: "Terms of Use" },
  { id: "privacy", label: "Privacy Policy" },
];

const bump = (v) => {
  const parts = String(v || "1.0").split(".").map((n) => parseInt(n, 10) || 0);
  parts[parts.length - 1] += 1;
  return parts.join(".");
};

export default function PoliciesTab() {
  const { saved, draft, set, dirty, save, discard, busy, flash, status } = useConfigDraft();
  const [kind, setKind] = useState("terms");
  const [confirm, setConfirm] = useState(false);

  if (!draft) return <div className="oc-card"><div className="oc-skel oc-skel--block" /></div>;

  const p = draft.policies[kind];
  const was = saved.policies[kind];
  const versionChanged = p.version && p.version !== was.version;

  return (
    <>
      {status === "offline" && <Notice>Site settings aren't connected to the backend yet. You can edit and preview, but publishing needs the SiteConfig route.</Notice>}

      <div className="oc-filters" role="tablist" aria-label="Policy">
        {KINDS.map((k) => (
          <button key={k.id} type="button" role="tab" aria-selected={kind === k.id} className={`oc-pill${kind === k.id ? " is-on" : ""}`} onClick={() => setKind(k.id)}>
            {k.label} {draft.policies[k.id].version ? <span className="mono oc-pill__n">v{draft.policies[k.id].version}</span> : null}
          </button>
        ))}
      </div>

      <div className="oc-split oc-split--even">
        <section className="oc-card">
          <div className="oc-card__head">
            <h2 className="oc-card__title">Edit {p.title}</h2>
            <a className="oc-card__meta" href={POLICY_PATHS[kind]} target="_blank" rel="noopener noreferrer">View live page ↗</a>
          </div>
          {!was.body && <p className="oc-hint">Not published yet. The site currently shows the built-in {kind === "terms" ? "Terms page" : "placeholder"}.</p>}

          <div className="oc-inline">
            <label className="oc-field oc-field--grow">
              <span className="oc-field__label">Version</span>
              <input className="oc-input mono" value={p.version} onChange={(e) => set(`policies.${kind}.version`, e.target.value)} placeholder="1.0" />
            </label>
            <button type="button" className="oc-btn oc-btn--ghost" onClick={() => set(`policies.${kind}.version`, bump(was.version || p.version))}>New version</button>
            <label className="oc-field oc-field--grow">
              <span className="oc-field__label">Effective date</span>
              <input className="oc-input" type="date" value={p.effectiveDate} onChange={(e) => set(`policies.${kind}.effectiveDate`, e.target.value)} />
            </label>
          </div>
          <label className="oc-field">
            <span className="oc-field__label">What changed (shown in the accept prompt)</span>
            <input className="oc-input" value={p.summary} onChange={(e) => set(`policies.${kind}.summary`, e.target.value)} maxLength={240} />
          </label>
          <label className="oc-field">
            <span className="oc-field__label">Policy text — blank line = paragraph, “## ” = heading, “- ” = bullet</span>
            <textarea className="oc-input oc-textarea oc-textarea--tall" value={p.body} onChange={(e) => set(`policies.${kind}.body`, e.target.value)} />
          </label>
          <div className="oc-toggle-row">
            <div>
              <p className="oc-toggle-row__k">Ask everyone to accept this version</p>
              <p className="oc-muted">Signed-in customers see an “I agree” prompt until they accept.</p>
            </div>
            <button type="button" role="switch" aria-checked={p.requireAccept} aria-label="Require acceptance" className={`oc-switch${p.requireAccept ? " is-on" : ""}`} onClick={() => set(`policies.${kind}.requireAccept`, !p.requireAccept)} />
          </div>
        </section>

        <section className="oc-card oc-policy-preview">
          <div className="oc-card__head">
            <h2 className="oc-card__title">Preview</h2>
            <span className="oc-card__meta mono">{p.version ? `v${p.version}` : "no version"}{p.effectiveDate ? ` · ${p.effectiveDate}` : ""}</span>
          </div>
          <div className="sg-policy oc-policy-preview__doc">
            <h1>{p.title}</h1>
            {p.body ? <PolicyBody body={p.body} /> : <p>Start typing to preview.</p>}
          </div>
        </section>
      </div>

      {(dirty || flash) && (
        <div className="oc-savebar" role="region" aria-label="Unsaved changes">
          {flash ? <span className={`oc-savebar__msg oc-text--${flash.tone}`}>{flash.text}</span> : <span className="oc-savebar__msg">Unsaved policy changes{saved.updatedAt ? ` · last published ${fmtDateTime(new Date(saved.updatedAt))}` : ""}</span>}
          {dirty && (
            <>
              <button type="button" className="oc-btn oc-btn--ghost" onClick={discard} disabled={busy}>Discard</button>
              <button type="button" className="oc-btn" onClick={() => setConfirm(true)} disabled={busy || !p.body.trim() || !p.version}>Publish</button>
            </>
          )}
        </div>
      )}

      {confirm && (
        <Confirm
          title={`Publish ${p.title} v${p.version}?`}
          body={
            <p>
              The live {p.title} page updates right away.
              {p.requireAccept ? " Every signed-in customer will be asked to accept it before continuing." : " Customers won't be prompted."}
              {p.requireAccept && !versionChanged ? " The version number hasn't changed, so people who already accepted it won't be asked again." : ""}
            </p>
          }
          confirmLabel="Publish"
          busy={busy}
          onConfirm={async () => {
            await save("policy.publish", `${p.title} v${p.version}${p.requireAccept ? " (accept required)" : ""}`);
            setConfirm(false);
          }}
          onClose={() => setConfirm(false)}
        />
      )}
    </>
  );
}
