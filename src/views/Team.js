import React, { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { Helmet } from "react-helmet";
import {
  Modal,
  ModalHeader,
  ModalBody,
  ModalFooter,
  Button,
  Input,
  FormGroup,
  Label,
  Spinner,
} from "reactstrap";
import {
  fetchTeam,
  inviteTeamMember,
  updateTeamMember,
  removeTeamMember,
  fetchTeamLog,
  fetchOwnerBilling,
  DEFAULT_PERMS,
  TEAM_ROLES,
} from "utils/teamStorage";
import { fetchBusinesses, getDefaultBusinessName } from "utils/businessStorage";
import "../assets/css/team.css";

const initials = (s) =>
  (s || "?")
    .trim()
    .split(/[@\s.]+/)
    .map((w) => w[0])
    .filter(Boolean)
    .slice(0, 2)
    .join("")
    .toUpperCase();

function Team() {
  const { t } = useTranslation();
  const [members, setMembers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showInvite, setShowInvite] = useState(false);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPw, setShowPw] = useState(false);
  const [role, setRole] = useState("accountant");
  const [sending, setSending] = useState(false);
  const [error, setError] = useState("");
  const [removingId, setRemovingId] = useState(null);
  const [editing, setEditing] = useState(null); // member being edited
  const [editRole, setEditRole] = useState("accountant");
  const [savingEdit, setSavingEdit] = useState(false);
  const [bizOptions, setBizOptions] = useState([]); // [{id,name}] incl default (id "")
  const [inviteBiz, setInviteBiz] = useState([]); // selected business ids (add)
  const [editBiz, setEditBiz] = useState([]); // selected business ids (edit)
  const [invitePerms, setInvitePerms] = useState({ ...DEFAULT_PERMS });
  const [editPerms, setEditPerms] = useState({ ...DEFAULT_PERMS });

  const permSummary = (p) => {
    if (!p || typeof p !== "object") return t("team.viewOnly");
    const on = ["add", "edit", "delete"].filter((k) => p[k]).map((k) => t("team.perm_" + k));
    return on.length ? on.join(", ") : t("team.viewOnly");
  };
  const [log, setLog] = useState([]); // recent teammate activity (owner only)
  const [billing, setBilling] = useState(null); // owner's subscription status

  // Billing model: the first teammate is free; each additional one ($9.99/mo)
  // needs an active card subscription.
  const canCharge = !!(
    billing &&
    billing.subscription &&
    billing.isPaid &&
    billing.paymentType === "STRIPE" &&
    billing.subscriptionId
  );
  const paidSeat = members.length >= 1; // this new user is the 2nd+ → paid

  const fmtDateTime = (s) => {
    const d = new Date(s);
    return isNaN(d) ? "" : d.toLocaleString(undefined, { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });
  };

  const actionLabel = (ev) => {
    const verb =
      ev.method === "POST" ? t("team.verbAdded")
      : ev.method === "PUT" ? t("team.verbUpdated")
      : ev.method === "DELETE" ? t("team.verbDeleted")
      : ev.method;
    const parts = (ev.resource || "").split("/").filter((p) => p && !p.startsWith("{"));
    const entity = parts[parts.length - 1] || "item";
    return `${verb} ${entity}`;
  };

  const toggleId = (arr, id) => (arr.includes(id) ? arr.filter((x) => x !== id) : [...arr, id]);

  const bizNames = (ids) =>
    (ids || [])
      .map((id) => (bizOptions.find((o) => o.id === id) || {}).name)
      .filter(Boolean)
      .join(", ");

  const fmtDate = (s) => {
    if (!s) return "";
    const d = new Date(s);
    return isNaN(d) ? "" : d.toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });
  };

  const openEdit = (m) => {
    setEditing(m);
    setEditRole(m.role || "member");
    setEditBiz(
      Array.isArray(m.businessIds) && m.businessIds.length
        ? m.businessIds
        : bizOptions.map((o) => o.id)
    );
    setEditPerms(
      m.perms && typeof m.perms === "object"
        ? { add: !!m.perms.add, edit: !!m.perms.edit, delete: !!m.perms.delete }
        : { ...DEFAULT_PERMS }
    );
    setError("");
  };

  const saveEdit = async () => {
    if (!editing) return;
    setSavingEdit(true);
    setError("");
    try {
      await updateTeamMember(editing.memberId || editing.id, { role: editRole, businessIds: editBiz, perms: editPerms });
      setEditing(null);
      load();
    } catch (err) {
      console.error("Update member failed:", err);
      setError(t("team.inviteError"));
    } finally {
      setSavingEdit(false);
    }
  };

  // Strong random password so the owner doesn't have to invent one.
  const generatePassword = () => {
    const sets = ["ABCDEFGHJKLMNPQRSTUVWXYZ", "abcdefghijkmnpqrstuvwxyz", "23456789", "!@#$%*?"];
    const all = sets.join("");
    const rnd = (s) => s[Math.floor(Math.random() * s.length)];
    let out = sets.map(rnd); // guarantee one from each set
    for (let i = out.length; i < 12; i++) out.push(rnd(all));
    const shuffled = out.sort(() => Math.random() - 0.5).join("");
    setPassword(shuffled);
    setShowPw(true);
  };

  const ownerEmail = localStorage.getItem("user_email") || "";
  // Teammates can't manage the team — only the account owner.
  const canManage = localStorage.getItem("isTeamMember") !== "true";

  const load = () => {
    setLoading(true);
    fetchTeam()
      .then(setMembers)
      .catch(() => setMembers([]))
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    load();
    (async () => {
      let opts = [{ id: "", name: getDefaultBusinessName() }];
      try {
        const list = await fetchBusinesses();
        opts = opts.concat((list || []).map((b) => ({ id: b.businessId, name: b.name })));
      } catch (e) {
        /* default business only */
      }
      setBizOptions(opts);
      setInviteBiz(opts.map((o) => o.id)); // default: access to all
    })();
    if (canManage) {
      fetchTeamLog().then(setLog).catch(() => setLog([]));
      fetchOwnerBilling().then(setBilling).catch(() => setBilling({}));
    }
  }, []);

  const resetInvite = () => {
    setShowInvite(false);
    setEmail("");
    setPassword("");
    setShowPw(false);
    setRole("accountant");
    setInviteBiz(bizOptions.map((o) => o.id));
    setInvitePerms({ ...DEFAULT_PERMS });
    setError("");
  };

  const handleInvite = async () => {
    if (!/\S+@\S+\.\S+/.test(email.trim())) {
      setError(t("team.invalidEmail"));
      return;
    }
    if ((password || "").length < 8) {
      setError(t("team.passwordShort"));
      return;
    }
    if (
      !/[a-z]/.test(password) ||
      !/[A-Z]/.test(password) ||
      !/[0-9]/.test(password) ||
      !/[^A-Za-z0-9]/.test(password)
    ) {
      setError(t("team.passwordWeak"));
      return;
    }
    if (bizOptions.length > 1 && inviteBiz.length === 0) {
      setError(t("team.selectBusiness"));
      return;
    }
    if (paidSeat && !canCharge) {
      setError(t("team.needSubscription"));
      return;
    }
    setSending(true);
    setError("");
    try {
      await inviteTeamMember({
        email,
        role,
        password,
        businessIds: inviteBiz,
        subscriptionId: paidSeat ? billing?.subscriptionId || "" : "",
        perms: invitePerms,
      });
      resetInvite();
      load();
    } catch (err) {
      console.error("Add user failed:", err);
      const code = err?.response?.status;
      if (code === 409) setError(t("team.emailTaken"));
      else if (code === 400) setError(t("team.passwordWeak"));
      else setError(t("team.inviteError"));
    } finally {
      setSending(false);
    }
  };

  const handleRemove = async (m) => {
    setRemovingId(m.id || m.memberId || m.email);
    try {
      await removeTeamMember(m.id || m.memberId);
      setMembers((prev) => prev.filter((x) => x !== m));
    } catch (err) {
      console.error("Remove member failed:", err);
    } finally {
      setRemovingId(null);
    }
  };

  const roleLabel = (r) => {
    const found = TEAM_ROLES.find((x) => x.value === r);
    return found ? t(found.labelKey) : r || t("team.roleMember");
  };

  return (
    <div className="team-page">
      <Helmet>
        <title>Team - Meksova</title>
      </Helmet>

      <div className="team-head">
        <div>
          <h2 className="team-title">{t("team.title")}</h2>
          <p className="team-sub">{t("team.subtitle")}</p>
        </div>
        {canManage && (
          <button className="team-invite-btn" onClick={() => setShowInvite(true)}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.1" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" />
              <circle cx="9" cy="7" r="4" />
              <line x1="19" y1="8" x2="19" y2="14" />
              <line x1="22" y1="11" x2="16" y2="11" />
            </svg>
            {t("team.invite")}
          </button>
        )}
      </div>

      <div className="team-card">
        {/* Owner row (always present) */}
        <div className="team-row">
          <div className="team-ava team-ava--owner">{initials(ownerEmail || "You")}</div>
          <div className="team-row__main">
            <span className="team-row__email">{ownerEmail || t("team.you")}</span>
            <span className="team-row__meta">{t("team.you")}</span>
          </div>
          <span className="team-chip team-chip--owner">{t("team.roleOwner")}</span>
        </div>

        {loading ? (
          <div className="team-empty"><Spinner size="sm" /> {t("team.loading")}</div>
        ) : members.length === 0 ? (
          <div className="team-empty">
            <p className="team-empty__title">{t("team.emptyTitle")}</p>
            <p className="team-empty__sub">{t("team.emptySub")}</p>
          </div>
        ) : (
          members.map((m, i) => {
            const mid = m.id || m.memberId || m.email;
            const status = m.status || "invited";
            return (
              <div className="team-row" key={mid || i}>
                <div className="team-ava">{initials(m.email || m.name)}</div>
                <div className="team-row__main">
                  <span className="team-row__email">{m.email || m.name}</span>
                  <span className="team-row__meta">
                    {roleLabel(m.role)} ·{" "}
                    <span className={status === "active" ? "team-status--active" : "team-status--pending"}>
                      {status === "active" ? t("team.active") : t("team.invited")}
                    </span>
                    {m.createdAt ? ` · ${t("team.added")} ${fmtDate(m.createdAt)}` : ""}
                    {bizOptions.length > 1 &&
                    Array.isArray(m.businessIds) &&
                    m.businessIds.length &&
                    m.businessIds.length < bizOptions.length
                      ? ` · ${bizNames(m.businessIds)}`
                      : ""}
                    {` · ${permSummary(m.perms)}`}
                  </span>
                </div>
                {canManage && (
                  <div className="team-row__actions">
                    <button
                      className="team-edit"
                      title={t("team.edit")}
                      onClick={() => openEdit(m)}
                    >
                      <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                        <path d="M12 20h9" />
                        <path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4z" />
                      </svg>
                    </button>
                    <button
                      className="team-remove"
                      title={t("team.remove")}
                      onClick={() => handleRemove(m)}
                      disabled={removingId === mid}
                    >
                      {removingId === mid ? <Spinner size="sm" /> : "✕"}
                    </button>
                  </div>
                )}
              </div>
            );
          })
        )}
      </div>

      {canManage && (
        <div className="team-card team-log">
          <div className="team-log__head">{t("team.activity")}</div>
          {log.length === 0 ? (
            <div className="team-empty">
              <p className="team-empty__sub">{t("team.activityEmpty")}</p>
            </div>
          ) : (
            log.map((ev, i) => (
              <div className="team-row" key={i}>
                <div className="team-ava team-ava--log">{initials(ev.actorEmail || "?")}</div>
                <div className="team-row__main">
                  <span className="team-row__email">{ev.actorEmail || ev.actorSub}</span>
                  <span className="team-row__meta">
                    {actionLabel(ev)} · {fmtDateTime(ev.at)}
                  </span>
                </div>
              </div>
            ))
          )}
        </div>
      )}

      <Modal isOpen={showInvite} toggle={() => !sending && resetInvite()} className="add-transaction-modal add-business-modal">
        <ModalHeader toggle={() => !sending && resetInvite()}>
          {t("team.inviteTitle")}
          <span className="mksv-modal-sub">{t("team.inviteSub")}</span>
        </ModalHeader>
        <ModalBody>
          {error && <div className="alert alert-danger" role="alert">{error}</div>}
          {!paidSeat ? (
            <div className="team-seat-note">{t("team.firstFree")}</div>
          ) : billing ? (
            canCharge ? (
              <div className="team-seat-note">{t("team.seatNote")}</div>
            ) : (
              <div className="team-seat-note team-seat-note--warn">{t("team.needSubscription")}</div>
            )
          ) : null}
          <FormGroup>
            <Label>{t("team.emailLabel")}</Label>
            <Input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder={t("team.emailPlaceholder")}
            />
          </FormGroup>
          <FormGroup>
            <Label>{t("team.passwordLabel")}</Label>
            <div className="team-pw-row">
              <Input
                type={showPw ? "text" : "password"}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder={t("team.passwordPlaceholder")}
                autoComplete="new-password"
              />
              <button type="button" className="team-pw-btn" onClick={() => setShowPw((s) => !s)}>
                {showPw ? t("team.hide") : t("team.show")}
              </button>
              <button type="button" className="team-pw-btn team-pw-btn--gen" onClick={generatePassword}>
                {t("team.generate")}
              </button>
            </div>
            <small className="team-role-hint">{t("team.passwordHint")}</small>
          </FormGroup>
          <FormGroup>
            <Label>{t("team.roleLabel")}</Label>
            <Input type="select" value={role} onChange={(e) => setRole(e.target.value)}>
              {TEAM_ROLES.map((r) => (
                <option key={r.value} value={r.value}>{t(r.labelKey)}</option>
              ))}
            </Input>
            <small className="team-role-hint">{t("team.roleHint")}</small>
          </FormGroup>
          {bizOptions.length > 1 && (
            <FormGroup>
              <Label>{t("team.businessAccess")}</Label>
              <div className="team-biz-list">
                {bizOptions.map((o) => (
                  <label key={o.id || "default"} className="team-biz-item">
                    <input
                      type="checkbox"
                      checked={inviteBiz.includes(o.id)}
                      onChange={() => setInviteBiz((a) => toggleId(a, o.id))}
                    />
                    <span>{o.name}</span>
                  </label>
                ))}
              </div>
              <small className="team-role-hint">{t("team.businessAccessHint")}</small>
            </FormGroup>
          )}
          <FormGroup>
            <Label>{t("team.permissions")}</Label>
            <div className="team-biz-list">
              {["add", "edit", "delete"].map((k) => (
                <label key={k} className="team-biz-item">
                  <input type="checkbox" checked={!!invitePerms[k]} onChange={() => setInvitePerms((p) => ({ ...p, [k]: !p[k] }))} />
                  <span>{t("team.perm_" + k)}</span>
                </label>
              ))}
            </div>
            <small className="team-role-hint">{t("team.permsHint")}</small>
          </FormGroup>
        </ModalBody>
        <ModalFooter>
          <Button color="secondary" onClick={resetInvite} disabled={sending}>
            {t("common.cancel")}
          </Button>
          <Button color="primary" onClick={handleInvite} disabled={sending}>
            {sending ? <Spinner size="sm" /> : t("team.sendInvite")}
          </Button>
        </ModalFooter>
      </Modal>

      <Modal isOpen={!!editing} toggle={() => !savingEdit && setEditing(null)} className="add-transaction-modal add-business-modal">
        <ModalHeader toggle={() => !savingEdit && setEditing(null)}>
          {t("team.editTitle")}
          <span className="mksv-modal-sub">{editing?.email}</span>
        </ModalHeader>
        <ModalBody>
          {error && <div className="alert alert-danger" role="alert">{error}</div>}
          <FormGroup>
            <Label>{t("team.roleLabel")}</Label>
            <Input type="select" value={editRole} onChange={(e) => setEditRole(e.target.value)}>
              {TEAM_ROLES.map((r) => (
                <option key={r.value} value={r.value}>{t(r.labelKey)}</option>
              ))}
            </Input>
            <small className="team-role-hint">{t("team.roleHint")}</small>
          </FormGroup>
          {bizOptions.length > 1 && (
            <FormGroup>
              <Label>{t("team.businessAccess")}</Label>
              <div className="team-biz-list">
                {bizOptions.map((o) => (
                  <label key={o.id || "default"} className="team-biz-item">
                    <input
                      type="checkbox"
                      checked={editBiz.includes(o.id)}
                      onChange={() => setEditBiz((a) => toggleId(a, o.id))}
                    />
                    <span>{o.name}</span>
                  </label>
                ))}
              </div>
              <small className="team-role-hint">{t("team.businessAccessHint")}</small>
            </FormGroup>
          )}
          <FormGroup>
            <Label>{t("team.permissions")}</Label>
            <div className="team-biz-list">
              {["add", "edit", "delete"].map((k) => (
                <label key={k} className="team-biz-item">
                  <input type="checkbox" checked={!!editPerms[k]} onChange={() => setEditPerms((p) => ({ ...p, [k]: !p[k] }))} />
                  <span>{t("team.perm_" + k)}</span>
                </label>
              ))}
            </div>
            <small className="team-role-hint">{t("team.permsHint")}</small>
          </FormGroup>
        </ModalBody>
        <ModalFooter>
          <Button color="secondary" onClick={() => setEditing(null)} disabled={savingEdit}>
            {t("common.cancel")}
          </Button>
          <Button color="primary" onClick={saveEdit} disabled={savingEdit}>
            {savingEdit ? <Spinner size="sm" /> : t("team.save")}
          </Button>
        </ModalFooter>
      </Modal>
    </div>
  );
}

export default Team;
