import React, { useEffect, useState } from "react";
import { getData, putData } from "utils/adminData";
import { listStaff } from "utils/adminApi";
import { Notice } from "./shared";

const EVENTS = [
  { key: "payment.failed", label: "A customer's payment fails", hint: "So you can reach out before they churn" },
  { key: "ticket.urgent", label: "An urgent support ticket arrives", hint: "Priority set to urgent, by a person or a rule" },
  { key: "ticket.overdue", label: "A ticket misses its deadline", hint: "Based on the response deadlines in Support inbox" },
  { key: "service.down", label: "Part of the app is down or slow", hint: "From System health" },
  { key: "request.created", label: "Someone asks to delete or export data", hint: "You have 30 days to answer" },
  { key: "approval.waiting", label: "Staff need your approval", hint: "Refunds, deletions, publishing" },
  { key: "signup.new", label: "Every new sign-up", hint: "Can be noisy once you grow" },
  { key: "digest.daily", label: "Morning summary", hint: "Yesterday's signups, revenue and open tickets at 8am" },
];

const CHANNELS = [
  ["email", "Email"],
  ["push", "Phone"],
  ["sms", "Text"],
];

export default function AlertsTab() {
  const [saved, setSaved] = useState(null);
  const [d, setD] = useState(null);
  const [source, setSource] = useState(null);
  const [staff, setStaff] = useState([]);
  const [busy, setBusy] = useState(false);
  const [flash, setFlash] = useState(null);

  const load = async () => {
    const r = await getData("alertSettings");
    setSaved(r.data);
    setD(r.data ? JSON.parse(JSON.stringify(r.data)) : null);
    setSource(r.source);
  };
  useEffect(() => {
    load();
    listStaff().then((s) => setStaff(s.staff || [])).catch(() => {});
  }, []);

  if (!d && source !== "offline") return <div className="oc-card"><div className="oc-skel oc-skel--block" /></div>;
  if (!d) return <Notice>Alerts aren't connected yet. They need the AdminData/alertSettings route plus email (SES), push (Firebase) and text (SNS) sending.</Notice>;

  const setEv = (k, patch) => setD((x) => ({ ...x, events: { ...x.events, [k]: { ...x.events[k], ...patch } } }));
  const toggleCh = (k, ch) => {
    const cur = d.events[k].channels;
    setEv(k, { channels: cur.includes(ch) ? cur.filter((c) => c !== ch) : [...cur, ch] });
  };
  const toggleRecipient = (who) => setD((x) => ({ ...x, recipients: x.recipients.includes(who) ? x.recipients.filter((r) => r !== who) : [...x.recipients, who] }));
  const dirty = JSON.stringify(saved) !== JSON.stringify(d);
  const needsPhone = Object.values(d.events).some((e) => e.on && e.channels.includes("sms")) && !d.phone;

  const save = async () => {
    setBusy(true);
    setFlash(null);
    try {
      await putData("alertSettings", d, { action: "alerts.update", target: "alert settings", detail: `${Object.values(d.events).filter((e) => e.on).length} alerts on` });
      setFlash({ tone: "green", text: "Alert settings saved." });
      await load();
    } catch (e) {
      setFlash({ tone: e.notConnected ? "amber" : "red", text: e.message });
    } finally {
      setBusy(false);
    }
  };

  const testAlert = async () => {
    await putData("notifications", { id: `n${Date.now()}`, kind: "test", text: "Test alert — this is what an alert looks like.", at: new Date().toISOString(), read: false, tab: "alerts" });
    setFlash({ tone: "green", text: "Test alert sent. Check the bell at the top of the console." });
  };

  return (
    <>
      {flash && <div className={`oc-flash oc-edge--${flash.tone}`} role="status">{flash.text}</div>}
      <div className="oc-split oc-split--wide">
        <section className="oc-card">
          <div className="oc-card__head">
            <h2 className="oc-card__title">Tell me when</h2>
            <button type="button" className="oc-link-btn" onClick={testAlert}>Send a test alert</button>
          </div>
          {EVENTS.map((ev) => {
            const e = d.events[ev.key] || { on: false, channels: [] };
            return (
              <div className="oc-alert-row" key={ev.key}>
                <div className="oc-alert-row__text">
                  <p className="oc-toggle-row__k">{ev.label}</p>
                  <p className="oc-muted">{ev.hint}</p>
                </div>
                <div className="oc-alert-row__ch" role="group" aria-label={`${ev.label}: channels`}>
                  {CHANNELS.map(([ch, l]) => (
                    <label key={ch} className={`oc-check oc-check--sm${e.channels.includes(ch) ? " is-on" : ""}`}>
                      <input type="checkbox" checked={e.channels.includes(ch)} disabled={!e.on} onChange={() => toggleCh(ev.key, ch)} /> <span>{l}</span>
                    </label>
                  ))}
                </div>
                <button type="button" role="switch" aria-checked={e.on} aria-label={ev.label} className={`oc-switch${e.on ? " is-on" : ""}`} onClick={() => setEv(ev.key, { on: !e.on })} />
              </div>
            );
          })}
        </section>

        <div className="oc-stack">
          <section className="oc-card">
            <div className="oc-card__head">
              <h2 className="oc-card__title">Who gets them</h2>
            </div>
            <label className="oc-check oc-check--plain">
              <input type="checkbox" checked={d.recipients.includes("owner")} onChange={() => toggleRecipient("owner")} /> <span>Me ({localStorage.getItem("user_email") || "owner"})</span>
            </label>
            {staff.map((s) => (
              <label key={s.id} className="oc-check oc-check--plain">
                <input type="checkbox" checked={d.recipients.includes(s.email)} onChange={() => toggleRecipient(s.email)} /> <span>{s.name || s.email}</span>
              </label>
            ))}
            <label className="oc-field">
              <span className="oc-field__label">Mobile number for texts</span>
              <input className="oc-input" type="tel" value={d.phone} onChange={(e) => setD({ ...d, phone: e.target.value })} placeholder="+1 614 555 0100" />
            </label>
            {needsPhone && <p className="oc-hint oc-text--red">Add a number, or untick Text, for texts to arrive.</p>}
          </section>

          <section className="oc-card">
            <div className="oc-card__head">
              <h2 className="oc-card__title">Quiet hours</h2>
              <button type="button" role="switch" aria-checked={d.quiet.on} aria-label="Quiet hours" className={`oc-switch${d.quiet.on ? " is-on" : ""}`} onClick={() => setD({ ...d, quiet: { ...d.quiet, on: !d.quiet.on } })} />
            </div>
            <p className="oc-muted">Phone and text alerts wait until morning. “Part of the app is down” always gets through.</p>
            <div className="oc-inline">
              <label className="oc-field oc-field--grow">
                <span className="oc-field__label">From</span>
                <input className="oc-input" type="time" value={d.quiet.from} disabled={!d.quiet.on} onChange={(e) => setD({ ...d, quiet: { ...d.quiet, from: e.target.value } })} />
              </label>
              <label className="oc-field oc-field--grow">
                <span className="oc-field__label">To</span>
                <input className="oc-input" type="time" value={d.quiet.to} disabled={!d.quiet.on} onChange={(e) => setD({ ...d, quiet: { ...d.quiet, to: e.target.value } })} />
              </label>
            </div>
          </section>
        </div>
      </div>

      {dirty && (
        <div className="oc-savebar" role="region" aria-label="Unsaved changes">
          <span className="oc-savebar__msg">Unsaved alert settings</span>
          <button type="button" className="oc-btn oc-btn--ghost" onClick={() => setD(JSON.parse(JSON.stringify(saved)))} disabled={busy}>Discard</button>
          <button type="button" className="oc-btn" onClick={save} disabled={busy}>{busy ? "Saving…" : "Save"}</button>
        </div>
      )}
    </>
  );
}
