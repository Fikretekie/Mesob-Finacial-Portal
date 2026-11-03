import React, { useCallback, useEffect, useState } from "react";
import { getData, putData, deleteData } from "utils/adminData";
import { listStaff } from "utils/adminApi";
import { Confirm, Drawer, Notice, relTime } from "./shared";

export const TRIGGERS = {
  "ticket.created": "A support message arrives",
  signup: "Someone signs up",
  "trial.ended": "A free trial ends without paying",
  "payment.failed": "A payment fails",
  "request.created": "Someone asks to delete or export data",
  inactive: "Someone hasn't opened the app in 14 days",
};

const FIELDS = {
  text: "Message text",
  businessType: "Business type",
  plan: "Plan",
  priority: "Ticket priority",
  authProvider: "Signed up with",
};

const OPS = { contains: "contains any of", is: "is", not: "is not" };

const ACTIONS = {
  assign: "Assign to",
  priority: "Set priority",
  tag: "Add tag",
  email: "Send automatic email",
  notify: "Alert",
  status: "Set ticket status",
};

const describeCond = (c) => `${FIELDS[c.field]} ${OPS[c.op]} “${c.value}”`;
const describeAct = (a, automations) => {
  if (a.type === "email") return `send “${automations.find((x) => x.id === a.value)?.name || a.value}”`;
  if (a.type === "notify") return `alert ${a.value === "owner" ? "you" : "the assignee"}`;
  return `${ACTIONS[a.type].toLowerCase()} ${a.value.split("@")[0]}`;
};

/** Does a sample event satisfy every condition? Returns the first failure, if any. */
export function evaluate(rule, sample) {
  for (const c of rule.conditions) {
    const v = String(sample[c.field] || "").toLowerCase();
    const want = String(c.value || "").toLowerCase();
    const ok = c.op === "contains" ? want.split(",").map((w) => w.trim()).filter(Boolean).some((w) => v.includes(w)) : c.op === "is" ? v === want : v !== want;
    if (!ok) return { ok: false, failed: c };
  }
  return { ok: true };
}

function Editor({ item, staff, automations, onClose, onSaved }) {
  const isNew = !item;
  const [d, setD] = useState(item ? JSON.parse(JSON.stringify(item)) : { id: `ru${Date.now()}`, name: "", enabled: false, trigger: "ticket.created", conditions: [{ field: "text", op: "contains", value: "" }], actions: [{ type: "assign", value: "" }], runs30: 0, lastRunAt: null });
  const [sample, setSample] = useState({ text: "My bank won't connect", businessType: "Rideshare", plan: "Monthly", priority: "normal", authProvider: "Email" });
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState(null);
  const set = (k, v) => setD((x) => ({ ...x, [k]: v }));
  const setCond = (i, k, v) => set("conditions", d.conditions.map((c, j) => (j === i ? { ...c, [k]: v } : c)));
  const setAct = (i, k, v) => set("actions", d.actions.map((a, j) => (j === i ? { ...a, [k]: v, ...(k === "type" ? { value: "" } : {}) } : a)));
  const valid = d.name.trim() && d.actions.length && d.actions.every((a) => a.value) && d.conditions.every((c) => c.value.trim());
  const test = evaluate(d, sample);

  const valueInput = (a, i) => {
    if (a.type === "assign")
      return (
        <select className="oc-input" value={a.value} onChange={(e) => setAct(i, "value", e.target.value)} aria-label="Assign to">
          <option value="">Pick someone…</option>
          <option value={localStorage.getItem("user_email") || "owner"}>Me</option>
          {staff.map((s) => <option key={s.id} value={s.email}>{s.name || s.email}</option>)}
        </select>
      );
    if (a.type === "priority")
      return (
        <select className="oc-input" value={a.value} onChange={(e) => setAct(i, "value", e.target.value)} aria-label="Priority">
          <option value="">Pick…</option>
          {["urgent", "high", "normal", "low"].map((p) => <option key={p}>{p}</option>)}
        </select>
      );
    if (a.type === "email")
      return (
        <select className="oc-input" value={a.value} onChange={(e) => setAct(i, "value", e.target.value)} aria-label="Email">
          <option value="">Pick an automation…</option>
          {automations.map((x) => <option key={x.id} value={x.id}>{x.name}</option>)}
        </select>
      );
    if (a.type === "notify")
      return (
        <select className="oc-input" value={a.value} onChange={(e) => setAct(i, "value", e.target.value)} aria-label="Alert who">
          <option value="">Pick…</option>
          <option value="owner">Me</option>
          <option value="assignee">Whoever it's assigned to</option>
        </select>
      );
    if (a.type === "status")
      return (
        <select className="oc-input" value={a.value} onChange={(e) => setAct(i, "value", e.target.value)} aria-label="Status">
          <option value="">Pick…</option>
          <option value="pending">Waiting on customer</option>
          <option value="resolved">Resolved</option>
        </select>
      );
    return <input className="oc-input" value={a.value} onChange={(e) => setAct(i, "value", e.target.value)} placeholder="vip" aria-label="Value" />;
  };

  const save = async () => {
    setBusy(true);
    try {
      await putData("rules", d, { action: isNew ? "rule.create" : "rule.update", target: d.name });
      onSaved(isNew ? `“${d.name}” saved. Turn it on when you're ready.` : `“${d.name}” saved.`);
    } catch (e) {
      setErr(e.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Drawer
      title={isNew ? "New rule" : d.name}
      sub="When something happens and it matches, Meksova does the steps for you."
      onClose={onClose}
      footer={
        <>
          <button type="button" className="oc-btn oc-btn--ghost" onClick={onClose}>Cancel</button>
          <button type="button" className="oc-btn" disabled={!valid || busy} onClick={save}>{busy ? "Saving…" : "Save rule"}</button>
        </>
      }
    >
      {err && <div className="oc-flash oc-edge--red" role="status">{err}</div>}
      <label className="oc-field">
        <span className="oc-field__label">Name</span>
        <input className="oc-input" value={d.name} onChange={(e) => set("name", e.target.value)} placeholder="e.g. Bank problems go to Marta" />
      </label>

      <section className="oc-sec">
        <h3 className="oc-sec__title">When</h3>
        <select className="oc-input" value={d.trigger} onChange={(e) => set("trigger", e.target.value)} aria-label="Trigger">
          {Object.entries(TRIGGERS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
        </select>
      </section>

      <section className="oc-sec">
        <h3 className="oc-sec__title">And all of these are true</h3>
        {d.conditions.map((c, i) => (
          <div className="oc-rule-row" key={i}>
            <select className="oc-input" value={c.field} onChange={(e) => setCond(i, "field", e.target.value)} aria-label="Field">
              {Object.entries(FIELDS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
            </select>
            <select className="oc-input" value={c.op} onChange={(e) => setCond(i, "op", e.target.value)} aria-label="Comparison">
              {Object.entries(OPS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
            </select>
            <input className="oc-input" value={c.value} onChange={(e) => setCond(i, "value", e.target.value)} placeholder={c.op === "contains" ? "bank, plaid" : "Trucking"} aria-label="Value" />
            <button type="button" className="oc-icon-btn" aria-label="Remove condition" onClick={() => set("conditions", d.conditions.filter((_, j) => j !== i))}>×</button>
          </div>
        ))}
        <button type="button" className="oc-link-btn" onClick={() => set("conditions", [...d.conditions, { field: "businessType", op: "is", value: "" }])}>+ Add condition</button>
      </section>

      <section className="oc-sec">
        <h3 className="oc-sec__title">Then</h3>
        {d.actions.map((a, i) => (
          <div className="oc-rule-row oc-rule-row--act" key={i}>
            <select className="oc-input" value={a.type} onChange={(e) => setAct(i, "type", e.target.value)} aria-label="Action">
              {Object.entries(ACTIONS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
            </select>
            {valueInput(a, i)}
            <button type="button" className="oc-icon-btn" aria-label="Remove step" onClick={() => set("actions", d.actions.filter((_, j) => j !== i))}>×</button>
          </div>
        ))}
        <button type="button" className="oc-link-btn" onClick={() => set("actions", [...d.actions, { type: "tag", value: "" }])}>+ Add step</button>
      </section>

      <section className="oc-sec">
        <h3 className="oc-sec__title">Try it</h3>
        <div className="oc-form-grid">
          {Object.entries(FIELDS).map(([k, v]) => (
            <label key={k} className="oc-field">
              <span className="oc-field__label">{v}</span>
              <input className="oc-input" value={sample[k]} onChange={(e) => setSample({ ...sample, [k]: e.target.value })} />
            </label>
          ))}
        </div>
        <div className={`oc-flash oc-edge--${test.ok ? "green" : "amber"}`} role="status">
          {test.ok ? `Would run: ${d.actions.filter((a) => a.value).map((a) => describeAct(a, automations)).join(", ") || "nothing yet"}.` : `Would not run: ${describeCond(test.failed)} isn't true for this example.`}
        </div>
      </section>
    </Drawer>
  );
}

export default function RulesTab() {
  const [rules, setRules] = useState(null);
  const [source, setSource] = useState(null);
  const [staff, setStaff] = useState([]);
  const [automations, setAutomations] = useState([]);
  const [edit, setEdit] = useState(null);
  const [del, setDel] = useState(null);
  const [flash, setFlash] = useState(null);

  const load = useCallback(async () => {
    const [r, a] = await Promise.all([getData("rules"), getData("automations")]);
    setRules(r.data || []);
    setAutomations(a.data || []);
    setSource(r.source);
  }, []);
  useEffect(() => {
    load();
    listStaff().then((s) => setStaff(s.staff || [])).catch(() => {});
  }, [load]);

  const toggle = async (r) => {
    try {
      await putData("rules", { ...r, enabled: !r.enabled }, { action: r.enabled ? "rule.off" : "rule.on", target: r.name });
      load();
    } catch (e) {
      setFlash({ tone: e.notConnected ? "amber" : "red", text: e.message });
    }
  };

  if (!rules) return <div className="oc-card"><div className="oc-skel oc-skel--block" /></div>;

  return (
    <section className="oc-card">
      <div className="oc-card__head oc-users__head">
        <p className="oc-muted">{rules.filter((r) => r.enabled).length} rules running · {rules.reduce((a, r) => a + r.runs30, 0)} times in the last 30 days</p>
        <button type="button" className="oc-btn" onClick={() => setEdit("new")}>New rule</button>
      </div>
      {source === "offline" && <Notice>Rules aren't connected yet. They need the AdminData/rules route and the backend to run them when events happen.</Notice>}
      {flash && <div className={`oc-flash oc-edge--${flash.tone}`} role="status">{flash.text}</div>}
      {rules.length === 0 ? (
        <p className="oc-empty">No rules yet. A good first one: send bank-connection tickets to whoever handles Plaid.</p>
      ) : (
        <ul className="oc-autos">
          {rules.map((r) => (
            <li key={r.id} className={`oc-auto${r.enabled ? " is-on" : ""}`}>
              <button type="button" className="oc-auto__main" onClick={() => setEdit(r)}>
                <span className="oc-auto__name">{r.name}</span>
                <span className="oc-muted">
                  <b>When</b> {TRIGGERS[r.trigger].toLowerCase()}
                  {r.conditions.length > 0 && <> <b>and</b> {r.conditions.map(describeCond).join(" and ")}</>}
                </span>
                <span className="oc-auto__subj">→ {r.actions.map((a) => describeAct(a, automations)).join(", ")}</span>
              </button>
              <span className="oc-auto__stats mono">{r.runs30 ? `${r.runs30} runs · last ${relTime(r.lastRunAt)}` : "hasn't run"}</span>
              <span className="oc-rule-tools">
                <button type="button" role="switch" aria-checked={r.enabled} aria-label={`${r.name} on/off`} className={`oc-switch${r.enabled ? " is-on" : ""}`} onClick={() => toggle(r)} />
                <button type="button" className="oc-icon-btn" aria-label={`Delete ${r.name}`} onClick={() => setDel(r)}>×</button>
              </span>
            </li>
          ))}
        </ul>
      )}
      {edit && <Editor key={edit === "new" ? "new" : edit.id} item={edit === "new" ? null : edit} staff={staff} automations={automations} onClose={() => setEdit(null)} onSaved={(t) => { setEdit(null); setFlash({ tone: "green", text: t }); load(); }} />}
      {del && (
        <Confirm
          title={`Delete “${del.name}”?`}
          body={<p>It stops running straight away. Things it already did stay done.</p>}
          confirmLabel="Delete"
          tone="danger"
          onConfirm={async () => {
            await deleteData("rules", del, { action: "rule.delete", target: del.name });
            setDel(null);
            load();
          }}
          onClose={() => setDel(null)}
        />
      )}
    </section>
  );
}
