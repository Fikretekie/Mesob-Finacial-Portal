import React, { useCallback, useEffect, useState } from "react";
import { listStaff, inviteStaff, updateStaff, removeStaff } from "utils/adminApi";
import { PERMISSIONS, PRESETS, presetFor } from "utils/staffAccess";
import { Drawer, Confirm, Notice, fmtDate, fmtDateTime } from "./shared";

const STATUS = {
  active: { label: "Active", tone: "green" },
  invited: { label: "Invite sent", tone: "accent" },
  disabled: { label: "Disabled", tone: "red" },
};

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

const initials = (s) =>
  (s || "?").trim().split(/[@\s.]+/).map((w) => w[0]).filter(Boolean).slice(0, 2).join("").toUpperCase();

const accessLabel = (perms) => {
  const p = presetFor(perms);
  return p ? p.label : `Custom · ${perms.length} permission${perms.length === 1 ? "" : "s"}`;
};

function PermissionPicker({ perms, onChange }) {
  const groups = [...new Set(PERMISSIONS.map((p) => p.group))];
  const toggle = (key) => onChange(perms.includes(key) ? perms.filter((k) => k !== key) : [...perms, key]);
  const active = presetFor(perms);
  return (
    <>
      <div className="oc-field">
        <span className="oc-field__label">Start from a role</span>
        <div className="oc-templates" role="group" aria-label="Role presets">
          {PRESETS.map((p) => (
            <button key={p.id} type="button" className={`oc-pill${active?.id === p.id ? " is-on" : ""}`} aria-pressed={active?.id === p.id} onClick={() => onChange([...p.perms])}>
              {p.label}
            </button>
          ))}
        </div>
      </div>
      {groups.map((g) => (
        <fieldset key={g} className="oc-fieldset oc-perm-group">
          <legend className="oc-sec__title">{g}</legend>
          {PERMISSIONS.filter((p) => p.group === g).map((p) => (
            <label key={p.key} className="oc-perm">
              <input type="checkbox" checked={perms.includes(p.key)} onChange={() => toggle(p.key)} />
              <span className="oc-perm__text">
                <span className="oc-perm__label">{p.label}</span>
                <span className="oc-perm__hint">{p.hint}</span>
              </span>
            </label>
          ))}
        </fieldset>
      ))}
      <p className="oc-hint">Only you can manage staff, change customer roles, or give someone super-admin access.</p>
    </>
  );
}

function StaffDrawer({ member, onClose, onSaved, onPreview }) {
  const isNew = !member;
  const [name, setName] = useState(member?.name || "");
  const [email, setEmail] = useState(member?.email || "");
  const [perms, setPerms] = useState(member ? [...member.perms] : [...PRESETS[0].perms]);
  const [requireMfa, setRequireMfa] = useState(member ? member.requireMfa !== false : true);
  const [busy, setBusy] = useState(false);
  const [flash, setFlash] = useState(null);
  const [confirm, setConfirm] = useState(null);

  const changed = isNew || name !== (member.name || "") || requireMfa !== (member.requireMfa !== false) || [...perms].sort().join() !== [...member.perms].sort().join();
  const valid = EMAIL_RE.test(email.trim()) && perms.length > 0;

  const fail = (e) => setFlash({ tone: e.notConnected ? "amber" : "red", text: e.notConnected ? `${e.message}. Nothing was changed. This turns on once the AdminStaff route is deployed.` : e.message || "Couldn't save." });

  const submit = async () => {
    setBusy(true);
    setFlash(null);
    try {
      if (isNew) await inviteStaff({ name: name.trim(), email: email.trim().toLowerCase(), perms, requireMfa });
      else await updateStaff(member, { name: name.trim(), perms, requireMfa }, "staff.update", accessLabel(perms));
      onSaved(isNew ? `Invite sent to ${email.trim()}.` : "Access updated. It applies the next time they open the console.");
    } catch (e) {
      fail(e);
    } finally {
      setBusy(false);
    }
  };

  const act = async (fn) => {
    setBusy(true);
    setFlash(null);
    try {
      await fn();
    } catch (e) {
      fail(e);
    } finally {
      setBusy(false);
      setConfirm(null);
    }
  };

  return (
    <>
      <Drawer
        title={isNew ? "Add staff member" : member.name || member.email}
        sub={isNew ? "They get an email to set their password and sign in." : member.email}
        onClose={onClose}
        footer={
          <>
            {!isNew && (
              <button type="button" className="oc-btn oc-btn--ghost oc-mr-auto" onClick={() => onPreview(perms, name || email)}>
                Preview their view
              </button>
            )}
            <button type="button" className="oc-btn oc-btn--ghost" onClick={onClose}>Cancel</button>
            <button type="button" className="oc-btn" disabled={!valid || !changed || busy} onClick={submit}>
              {busy ? "Saving…" : isNew ? "Send invite" : "Save"}
            </button>
          </>
        }
      >
        {flash && <div className={`oc-flash oc-edge--${flash.tone}`} role="status">{flash.text}</div>}

        <section className="oc-sec">
          <label className="oc-field">
            <span className="oc-field__label">Name</span>
            <input className="oc-input" value={name} onChange={(e) => setName(e.target.value)} autoComplete="off" />
          </label>
          <label className="oc-field">
            <span className="oc-field__label">Work email</span>
            <input className="oc-input" type="email" value={email} onChange={(e) => setEmail(e.target.value)} disabled={!isNew} autoComplete="off" />
          </label>
          <div className="oc-toggle-row">
            <div>
              <p className="oc-toggle-row__k">Require two-step sign-in</p>
              <p className="oc-muted">A code from an authenticator app on every sign-in. Strongly recommended.</p>
            </div>
            <button type="button" role="switch" aria-checked={requireMfa} aria-label="Require two-step sign-in" className={`oc-switch${requireMfa ? " is-on" : ""}`} onClick={() => setRequireMfa(!requireMfa)} />
          </div>
        </section>

        <section className="oc-sec">
          <h3 className="oc-sec__title">What they can do</h3>
          <PermissionPicker perms={perms} onChange={setPerms} />
          {perms.length === 0 && <p className="oc-hint oc-text--red">Pick at least one permission.</p>}
        </section>

        {!isNew && (
          <section className="oc-sec">
            <h3 className="oc-sec__title">Account</h3>
            <div className="oc-kvs">
              <div className="oc-kv"><span className="oc-kv__k mono">Invited</span><span className="oc-kv__v">{fmtDate(new Date(member.invitedAt))}</span></div>
              <div className="oc-kv"><span className="oc-kv__k mono">Last active</span><span className="oc-kv__v">{member.lastActiveAt ? fmtDateTime(new Date(member.lastActiveAt)) : "Never signed in"}</span></div>
            </div>
            <div className="oc-actions">
              {member.status === "invited" && (
                <button type="button" className="oc-btn oc-btn--ghost" disabled={busy} onClick={() => act(async () => { await updateStaff(member, { resendInvite: true }, "staff.resendInvite"); setFlash({ tone: "green", text: `Invite re-sent to ${member.email}.` }); })}>
                  Resend invite
                </button>
              )}
              {member.status === "disabled" ? (
                <button type="button" className="oc-btn oc-btn--ghost" disabled={busy} onClick={() => act(async () => { await updateStaff(member, { status: "active" }, "staff.enable"); onSaved(`${member.email} can sign in again.`); })}>
                  Re-enable
                </button>
              ) : (
                <button type="button" className="oc-btn oc-btn--ghost" disabled={busy} onClick={() => setConfirm({ kind: "disable" })}>
                  Disable sign-in
                </button>
              )}
              <button type="button" className="oc-btn oc-btn--danger" disabled={busy} onClick={() => setConfirm({ kind: "remove" })}>
                Remove
              </button>
            </div>
          </section>
        )}
      </Drawer>

      {confirm?.kind === "disable" && (
        <Confirm
          title={`Disable ${member.name || member.email}?`}
          body={<p>They're signed out and can't get back in until you re-enable them. Their permissions are kept.</p>}
          confirmLabel="Disable"
          tone="danger"
          busy={busy}
          onConfirm={() => act(async () => { await updateStaff(member, { status: "disabled" }, "staff.disable"); onSaved(`${member.email} can no longer sign in.`); })}
          onClose={() => setConfirm(null)}
        />
      )}
      {confirm?.kind === "remove" && (
        <Confirm
          title={`Remove ${member.name || member.email}?`}
          body={<p>Their staff login is deleted. Everything they did stays in the activity log.</p>}
          typeToConfirm="REMOVE"
          confirmLabel="Remove"
          tone="danger"
          busy={busy}
          onConfirm={() => act(async () => { await removeStaff(member); onSaved(`${member.email} was removed.`); })}
          onClose={() => setConfirm(null)}
        />
      )}
    </>
  );
}

export default function StaffTab({ onPreview }) {
  const [state, setState] = useState({ staff: null, source: null });
  const [open, setOpen] = useState(null);
  const [flash, setFlash] = useState(null);

  const load = useCallback(() => {
    listStaff().then(setState).catch(() => setState({ staff: [], source: "offline" }));
  }, []);
  useEffect(load, [load]);

  const onSaved = (text) => {
    setOpen(null);
    setFlash(text);
    load();
  };

  const staff = state.staff || [];

  return (
    <section className="oc-card">
      <div className="oc-card__head oc-users__head">
        <div className="oc-drawer__titles">
          <h2 className="oc-card__title">Staff</h2>
          <p className="oc-muted">Employee logins with only the access you give them.</p>
        </div>
        <button type="button" className="oc-btn" onClick={() => setOpen("new")}>Add staff member</button>
      </div>

      {state.source === "offline" && <Notice>Staff accounts aren't connected to the backend yet. You can set up invites and preview access; creating logins needs the AdminStaff route.</Notice>}
      {flash && <div className="oc-flash oc-edge--green" role="status">{flash}</div>}

      {!state.staff ? (
        <div className="oc-skel oc-skel--block" />
      ) : staff.length === 0 ? (
        <div className="oc-empty-state">
          <p className="oc-muted">No staff yet. Add someone and pick what they can do, for example Customer support or Billing.</p>
        </div>
      ) : (
        <ul className="oc-staff">
          {staff.map((m) => (
            <li key={m.id}>
              <button type="button" className={`oc-staff__row oc-edge--${(STATUS[m.status] || STATUS.active).tone}`} onClick={() => setOpen(m)}>
                <span className="oc-staff__ava" aria-hidden="true">{initials(m.name || m.email)}</span>
                <span className="oc-staff__main">
                  <span className="oc-staff__name">{m.name || m.email}</span>
                  <span className="oc-staff__mail">{m.name ? m.email : ""}</span>
                </span>
                <span className="oc-staff__access">{accessLabel(m.perms)}</span>
                <span className="oc-staff__chips">
                  <span className={`oc-chip oc-chip--${(STATUS[m.status] || STATUS.active).tone}`}>{(STATUS[m.status] || STATUS.active).label}</span>
                  {m.requireMfa !== false && <span className="oc-chip oc-chip--muted">2-step</span>}
                </span>
                <span className="oc-staff__seen mono">{m.lastActiveAt ? `Active ${fmtDateTime(new Date(m.lastActiveAt))}` : "Never signed in"}</span>
              </button>
            </li>
          ))}
        </ul>
      )}

      {open && <StaffDrawer key={open === "new" ? "new" : open.id} member={open === "new" ? null : open} onClose={() => setOpen(null)} onSaved={onSaved} onPreview={(perms, who) => { setOpen(null); onPreview(perms, who); }} />}
    </section>
  );
}
