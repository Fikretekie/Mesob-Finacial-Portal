import React, { useCallback, useEffect, useMemo, useState } from "react";
import { listMessages, sendMessage, loadConfig, saveConfig } from "utils/adminApi";
import { AUDIENCES, Confirm, Notice, fmtDateTime } from "./shared";

const PUSH_LIMIT = 178;

const CHANNELS = [
  { id: "email", label: "Email" },
  { id: "push", label: "Push (phone app)" },
  { id: "banner", label: "In-app banner" },
];

const TEMPLATES = [
  { id: "trial", label: "Trial ending", audience: "trial", subject: "Your Meksova trial ends soon", body: "Your free trial is almost over. Choose a plan to keep your records, reports and receipts in one place." },
  { id: "pastdue", label: "Payment failed", audience: "past_due", subject: "We couldn't process your payment", body: "Your last Meksova payment didn't go through. Update your card in Account → Subscription to avoid any interruption." },
  { id: "feature", label: "New feature", audience: "all", subject: "New in Meksova", body: "We just shipped something new. Open Meksova to take a look." },
  { id: "policy", label: "Policy update", audience: "all", subject: "We've updated our Terms and Privacy Policy", body: "We've made changes to our Terms of Use and Privacy Policy. You'll be asked to review them the next time you open Meksova." },
  { id: "maint", label: "Planned maintenance", audience: "all", subject: "Scheduled maintenance", body: "Meksova will be briefly unavailable for planned maintenance. Your data is safe and nothing is needed from you." },
];

export default function MessagesTab({ rows, preset, onPresetHandled }) {
  const [channels, setChannels] = useState(["email"]);
  const [audience, setAudience] = useState("all");
  const [direct, setDirect] = useState(null);
  const [subject, setSubject] = useState("");
  const [body, setBody] = useState("");
  const [link, setLink] = useState("");
  const [when, setWhen] = useState("now");
  const [at, setAt] = useState("");
  const [history, setHistory] = useState({ messages: [], source: "loading" });
  const [confirm, setConfirm] = useState(false);
  const [busy, setBusy] = useState(false);
  const [flash, setFlash] = useState(null);

  const loadHistory = useCallback(() => {
    listMessages().then(setHistory).catch(() => setHistory({ messages: [], source: "offline" }));
  }, []);
  useEffect(loadHistory, [loadHistory]);

  useEffect(() => {
    if (preset?.length) {
      setDirect(preset);
      onPresetHandled();
    }
  }, [preset, onPresetHandled]);

  const target = useMemo(() => {
    if (direct) return direct;
    const a = AUDIENCES.find((x) => x.id === audience) || AUDIENCES[0];
    return rows.filter(a.test);
  }, [direct, audience, rows]);

  const reach = {
    email: target.filter((r) => r.email).length,
    push: target.filter((r) => r.hasApp).length,
    banner: direct ? null : target.length,
  };
  const audienceLabel = direct ? `selected user${direct.length === 1 ? "" : "s"}` : (AUDIENCES.find((x) => x.id === audience) || AUDIENCES[0]).label.toLowerCase();

  const toggleChannel = (id) => setChannels((c) => (c.includes(id) ? c.filter((x) => x !== id) : [...c, id]));
  const applyTemplate = (t) => {
    setSubject(t.subject);
    setBody(t.body);
    if (!direct) setAudience(t.audience);
  };

  const pushTooLong = channels.includes("push") && `${subject}: ${body}`.length > PUSH_LIMIT;
  const bannerForDirect = channels.includes("banner") && direct;
  const canSend = channels.length && subject.trim() && body.trim() && target.length && !bannerForDirect && (when === "now" || at);

  const send = async () => {
    setBusy(true);
    setFlash(null);
    const results = [];
    try {
      const outbound = channels.filter((c) => c !== "banner");
      if (outbound.length) {
        await sendMessage({
          subject: subject.trim(),
          body: body.trim(),
          link: link.trim() || undefined,
          channels: outbound,
          audience: direct ? "direct" : audience,
          audienceLabel,
          userIds: direct ? direct.map((r) => r.id) : undefined,
          recipients: Math.max(...outbound.map((c) => reach[c])),
          scheduledFor: when === "later" ? new Date(at).toISOString() : undefined,
        });
        results.push(when === "later" ? `Scheduled for ${fmtDateTime(new Date(at))}` : `Sent to ${Math.max(...outbound.map((c) => reach[c]))} people`);
      }
      if (channels.includes("banner")) {
        const { config } = await loadConfig();
        config.banner = { ...config.banner, enabled: true, id: `msg-${Date.now()}`, message: `${subject.trim()} — ${body.trim()}`, linkUrl: link.trim(), linkText: link.trim() ? "Learn more" : "", tone: "info", audience: "all", dismissible: true };
        await saveConfig(config, "banner.publish", subject.trim());
        results.push("banner is live");
      }
      setFlash({ tone: "green", text: `${results.join(" · ")}.` });
      setSubject("");
      setBody("");
      setLink("");
      setDirect(null);
      loadHistory();
    } catch (e) {
      setFlash({ tone: e.notConnected ? "amber" : "red", text: e.notConnected ? `${e.message}. Nothing was sent. This turns on once the AdminMessages route is deployed.` : `Send failed (${e?.response?.status || e.message}).` });
    } finally {
      setBusy(false);
      setConfirm(false);
    }
  };

  return (
    <div className="oc-split oc-split--wide">
      <section className="oc-card">
        <div className="oc-card__head">
          <h2 className="oc-card__title">New message</h2>
        </div>

        {history.source === "offline" && (
          <Notice>Email and push aren't connected to the backend yet. You can draft and preview; sending waits on the AdminMessages route. In-app banners work now.</Notice>
        )}

        <div className="oc-templates" role="group" aria-label="Templates">
          {TEMPLATES.map((t) => (
            <button key={t.id} type="button" className="oc-pill" onClick={() => applyTemplate(t)}>{t.label}</button>
          ))}
        </div>

        <fieldset className="oc-fieldset">
          <legend className="oc-field__label">Channels</legend>
          <div className="oc-checks">
            {CHANNELS.map((c) => (
              <label key={c.id} className={`oc-check${channels.includes(c.id) ? " is-on" : ""}`}>
                <input type="checkbox" checked={channels.includes(c.id)} onChange={() => toggleChannel(c.id)} />
                <span>{c.label}</span>
                {reach[c.id] != null && <span className="mono oc-check__n">{reach[c.id]}</span>}
              </label>
            ))}
          </div>
        </fieldset>

        {direct ? (
          <div className="oc-direct">
            <span className="oc-field__label">To</span>
            <div className="oc-direct__list">
              {direct.slice(0, 6).map((r) => <span key={r.id} className="oc-chip oc-chip--muted">{r.name || r.email}</span>)}
              {direct.length > 6 && <span className="oc-chip oc-chip--muted">+{direct.length - 6}</span>}
            </div>
            <button type="button" className="oc-btn oc-btn--ghost" onClick={() => setDirect(null)}>Send to a group instead</button>
          </div>
        ) : (
          <label className="oc-field">
            <span className="oc-field__label">Audience</span>
            <select className="oc-input" value={audience} onChange={(e) => setAudience(e.target.value)}>
              {AUDIENCES.map((a) => <option key={a.id} value={a.id}>{a.label} ({rows.filter(a.test).length})</option>)}
            </select>
          </label>
        )}

        <label className="oc-field">
          <span className="oc-field__label">Subject / push title</span>
          <input className="oc-input" value={subject} onChange={(e) => setSubject(e.target.value)} maxLength={120} />
        </label>
        <label className="oc-field">
          <span className="oc-field__label">
            Message {channels.includes("push") && <span className={`mono${pushTooLong ? " oc-text--red" : ""}`}>· push {`${subject}: ${body}`.length}/{PUSH_LIMIT}</span>}
          </span>
          <textarea className="oc-input oc-textarea" rows={5} value={body} onChange={(e) => setBody(e.target.value)} />
        </label>
        <label className="oc-field">
          <span className="oc-field__label">Link (optional)</span>
          <input className="oc-input" type="url" placeholder="https://app.meksova.com/…" value={link} onChange={(e) => setLink(e.target.value)} />
        </label>

        <fieldset className="oc-fieldset">
          <legend className="oc-field__label">When</legend>
          <div className="oc-checks">
            <label className={`oc-check${when === "now" ? " is-on" : ""}`}>
              <input type="radio" name="oc-when" checked={when === "now"} onChange={() => setWhen("now")} /> <span>Send now</span>
            </label>
            <label className={`oc-check${when === "later" ? " is-on" : ""}`}>
              <input type="radio" name="oc-when" checked={when === "later"} onChange={() => setWhen("later")} /> <span>Schedule</span>
            </label>
            {when === "later" && <input className="oc-input oc-input--auto" type="datetime-local" value={at} onChange={(e) => setAt(e.target.value)} aria-label="Send at" />}
          </div>
        </fieldset>

        {pushTooLong && <p className="oc-hint oc-text--red">Push text will be cut off on most phones. Shorten it, or untick Push.</p>}
        {bannerForDirect && <p className="oc-hint oc-text--red">The in-app banner shows to everyone. Untick it to message selected users.</p>}
        {flash && <div className={`oc-flash oc-edge--${flash.tone}`} role="status">{flash.text}</div>}

        <div className="oc-actions">
          <button type="button" className="oc-btn" disabled={!canSend || busy} onClick={() => setConfirm(true)}>
            {when === "later" ? "Schedule" : "Send"}
          </button>
        </div>
      </section>

      <div className="oc-stack">
        <section className="oc-card">
          <div className="oc-card__head">
            <h2 className="oc-card__title">Preview</h2>
          </div>
          {channels.includes("email") && (
            <div className="oc-preview-mail">
              <p className="oc-preview-mail__from mono">Meksova &lt;hello@meksova.com&gt;</p>
              <p className="oc-preview-mail__subj">{subject || "Subject"}</p>
              <p className="oc-preview-mail__body">{body || "Your message appears here."}</p>
              {link && <span className="oc-preview-mail__cta">Open Meksova</span>}
            </div>
          )}
          {channels.includes("push") && (
            <div className="oc-preview-push">
              <span className="oc-preview-push__app mono">MEKSOVA · now</span>
              <p className="oc-preview-push__title">{subject || "Title"}</p>
              <p className="oc-preview-push__body">{body || "Message"}</p>
            </div>
          )}
          {channels.includes("banner") && (
            <div className="oc-preview-banner">
              <span>{subject || "Subject"} — {body || "Message"}</span>
              {link && <span className="oc-preview-banner__link">Learn more</span>}
            </div>
          )}
          {!channels.length && <p className="oc-empty">Pick a channel to preview.</p>}
        </section>

        <section className="oc-card">
          <div className="oc-card__head">
            <h2 className="oc-card__title">Sent &amp; scheduled</h2>
            <span className="oc-card__meta mono">{history.messages.length}</span>
          </div>
          {history.source === "loading" ? (
            <div className="oc-skel oc-skel--block" />
          ) : history.messages.length === 0 ? (
            <p className="oc-empty">Nothing sent yet.</p>
          ) : (
            <ul className="oc-log">
              {history.messages.map((m) => (
                <li key={m.id} className={`oc-log__item oc-edge--${m.status === "scheduled" ? "amber" : "green"}`}>
                  <span className="oc-log__what">{m.subject}</span>
                  <span className="oc-log__meta mono">
                    {m.status === "scheduled" ? `Scheduled ${fmtDateTime(new Date(m.scheduledFor))}` : `Sent ${fmtDateTime(new Date(m.sentAt))}`} · {(m.channels || []).join(" + ")} · {m.recipients} people
                  </span>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>

      {confirm && (
        <Confirm
          title={when === "later" ? "Schedule this message?" : "Send this message now?"}
          body={
            <ul className="oc-confirm__list">
              {channels.includes("email") && <li>Email to <b className="mono">{reach.email}</b> {audienceLabel}</li>}
              {channels.includes("push") && <li>Push to <b className="mono">{reach.push}</b> phones with the app</li>}
              {channels.includes("banner") && <li>Banner shown to everyone in the app</li>}
            </ul>
          }
          confirmLabel={when === "later" ? "Schedule" : "Send"}
          busy={busy}
          onConfirm={send}
          onClose={() => setConfirm(false)}
        />
      )}
    </div>
  );
}
