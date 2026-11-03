import React, { useCallback, useEffect, useState } from "react";
import { getData, putData } from "utils/adminData";
import { Drawer, Notice } from "./shared";

const TRIGGERS = {
  signup: { label: "When someone signs up", unit: "days after sign-up" },
  trial_day: { label: "During the free trial", unit: "days into the trial" },
  trial_ends_in: { label: "Before the trial ends", unit: "days before it ends" },
  payment_failed: { label: "When a payment fails", unit: "days after the failure" },
  inactive_days: { label: "When someone stops using the app", unit: "days without opening it" },
  date: { label: "On a date", unit: null },
};

const describe = (a) => {
  const t = TRIGGERS[a.trigger];
  if (a.trigger === "date") return `On ${a.date}`;
  if (!a.delayDays) return t.label;
  return `${a.delayDays} ${t.unit}`;
};

function Editor({ item, onClose, onSaved }) {
  const isNew = !item;
  const [d, setD] = useState(item ? { ...item } : { id: `auto-${Date.now()}`, name: "", trigger: "signup", delayDays: 1, channels: ["email"], enabled: false, subject: "", body: "", sent30: 0, opened30: 0 });
  const [busy, setBusy] = useState(false);
  const [flash, setFlash] = useState(null);
  const set = (k, v) => setD((x) => ({ ...x, [k]: v }));
  const toggleCh = (c) => set("channels", d.channels.includes(c) ? d.channels.filter((x) => x !== c) : [...d.channels, c]);

  const save = async () => {
    setBusy(true);
    try {
      await putData("automations", d, { action: isNew ? "automation.create" : "automation.update", target: d.name, detail: describe(d) });
      onSaved(isNew ? `“${d.name}” created. Turn it on when you're ready.` : `“${d.name}” saved.`);
    } catch (e) {
      setFlash({ tone: e.notConnected ? "amber" : "red", text: e.message });
    } finally {
      setBusy(false);
    }
  };

  const valid = d.name.trim() && d.subject.trim() && d.body.trim() && d.channels.length && (d.trigger !== "date" || d.date);

  return (
    <Drawer
      title={isNew ? "New automatic email" : d.name}
      sub={isNew ? "Sent by itself whenever the trigger happens." : describe(d)}
      onClose={onClose}
      footer={
        <>
          <button type="button" className="oc-btn oc-btn--ghost" onClick={onClose}>Cancel</button>
          <button type="button" className="oc-btn" disabled={!valid || busy} onClick={save}>{busy ? "Saving…" : "Save"}</button>
        </>
      }
    >
      {flash && <div className={`oc-flash oc-edge--${flash.tone}`} role="status">{flash.text}</div>}
      <label className="oc-field">
        <span className="oc-field__label">Name (only you see this)</span>
        <input className="oc-input" value={d.name} onChange={(e) => set("name", e.target.value)} />
      </label>
      <label className="oc-field">
        <span className="oc-field__label">When</span>
        <select className="oc-input" value={d.trigger} onChange={(e) => set("trigger", e.target.value)}>
          {Object.entries(TRIGGERS).map(([k, t]) => <option key={k} value={k}>{t.label}</option>)}
        </select>
      </label>
      {d.trigger === "date" ? (
        <label className="oc-field">
          <span className="oc-field__label">Send on</span>
          <input className="oc-input oc-input--narrow" type="date" value={d.date || ""} onChange={(e) => set("date", e.target.value)} />
        </label>
      ) : (
        <label className="oc-field">
          <span className="oc-field__label">{TRIGGERS[d.trigger].unit}</span>
          <input className="oc-input oc-input--narrow mono" type="number" min={0} max={365} value={d.delayDays} onChange={(e) => set("delayDays", Math.max(0, Number(e.target.value) || 0))} />
        </label>
      )}
      <fieldset className="oc-fieldset">
        <legend className="oc-field__label">Send by</legend>
        <div className="oc-checks">
          {[["email", "Email"], ["push", "Push (phone app)"]].map(([c, l]) => (
            <label key={c} className={`oc-check${d.channels.includes(c) ? " is-on" : ""}`}>
              <input type="checkbox" checked={d.channels.includes(c)} onChange={() => toggleCh(c)} /> <span>{l}</span>
            </label>
          ))}
        </div>
      </fieldset>
      <label className="oc-field">
        <span className="oc-field__label">Subject / push title</span>
        <input className="oc-input" value={d.subject} onChange={(e) => set("subject", e.target.value)} />
      </label>
      <label className="oc-field">
        <span className="oc-field__label">Message — use {"{first_name}"} to personalise</span>
        <textarea className="oc-input oc-textarea" rows={5} value={d.body} onChange={(e) => set("body", e.target.value)} />
      </label>
      <div className="oc-preview-mail">
        <p className="oc-preview-mail__from mono">Preview</p>
        <p className="oc-preview-mail__subj">{d.subject || "Subject"}</p>
        <p className="oc-preview-mail__body">{(d.body || "Message").replace(/\{first_name\}/g, "Hana")}</p>
      </div>
    </Drawer>
  );
}

export default function AutomationsTab() {
  const [items, setItems] = useState(null);
  const [source, setSource] = useState(null);
  const [edit, setEdit] = useState(null);
  const [flash, setFlash] = useState(null);
  const [busy, setBusy] = useState(null);

  const load = useCallback(async () => {
    const res = await getData("automations");
    setItems(res.data || []);
    setSource(res.source);
  }, []);
  useEffect(() => {
    load();
  }, [load]);

  const toggle = async (a) => {
    setBusy(a.id);
    setFlash(null);
    try {
      await putData("automations", { ...a, enabled: !a.enabled }, { action: a.enabled ? "automation.off" : "automation.on", target: a.name });
      await load();
    } catch (e) {
      setFlash({ tone: e.notConnected ? "amber" : "red", text: e.message });
    } finally {
      setBusy(null);
    }
  };

  if (!items) return <div className="oc-card"><div className="oc-skel oc-skel--block" /></div>;
  const on = items.filter((a) => a.enabled);

  return (
    <section className="oc-card">
      <div className="oc-card__head oc-users__head">
        <div className="oc-drawer__titles">
          <h2 className="oc-card__title">Automatic emails</h2>
          <p className="oc-muted">Set once, sent forever: {on.length} running, {on.reduce((a, x) => a + x.sent30, 0)} sent in the last 30 days.</p>
        </div>
        <button type="button" className="oc-btn" onClick={() => setEdit("new")}>New automation</button>
      </div>
      {source === "offline" && <Notice>Automations aren't connected yet. They need the AdminData/automations route plus a daily job that sends them.</Notice>}
      {flash && <div className={`oc-flash oc-edge--${flash.tone}`} role="status">{flash.text}</div>}

      <ul className="oc-autos">
        {items.map((a) => (
          <li key={a.id} className={`oc-auto${a.enabled ? " is-on" : ""}`}>
            <button type="button" className="oc-auto__main" onClick={() => setEdit(a)}>
              <span className="oc-auto__name">{a.name}</span>
              <span className="oc-muted">{describe(a)} · {a.channels.join(" + ")}</span>
              <span className="oc-auto__subj">“{a.subject}”</span>
            </button>
            <span className="oc-auto__stats mono">
              {a.sent30 ? `${a.sent30} sent · ${Math.round(a.opened30 * 100)}% opened` : "not sent yet"}
            </span>
            <button type="button" role="switch" aria-checked={a.enabled} aria-label={`${a.name} on/off`} className={`oc-switch${a.enabled ? " is-on" : ""}`} disabled={busy === a.id} onClick={() => toggle(a)} />
          </li>
        ))}
      </ul>

      {edit && <Editor key={edit === "new" ? "new" : edit.id} item={edit === "new" ? null : edit} onClose={() => setEdit(null)} onSaved={(t) => { setEdit(null); setFlash({ tone: "green", text: t }); load(); }} />}
    </section>
  );
}
