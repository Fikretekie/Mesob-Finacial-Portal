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
  removeTeamMember,
  TEAM_ROLES,
} from "utils/teamStorage";
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

  const load = () => {
    setLoading(true);
    fetchTeam()
      .then(setMembers)
      .catch(() => setMembers([]))
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    load();
  }, []);

  const resetInvite = () => {
    setShowInvite(false);
    setEmail("");
    setPassword("");
    setShowPw(false);
    setRole("accountant");
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
    setSending(true);
    setError("");
    try {
      await inviteTeamMember({ email, role, password });
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
        <button className="team-invite-btn" onClick={() => setShowInvite(true)}>
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.1" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" />
            <circle cx="9" cy="7" r="4" />
            <line x1="19" y1="8" x2="19" y2="14" />
            <line x1="22" y1="11" x2="16" y2="11" />
          </svg>
          {t("team.invite")}
        </button>
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
                  </span>
                </div>
                <button
                  className="team-remove"
                  title={t("team.remove")}
                  onClick={() => handleRemove(m)}
                  disabled={removingId === mid}
                >
                  {removingId === mid ? <Spinner size="sm" /> : "✕"}
                </button>
              </div>
            );
          })
        )}
      </div>

      <Modal isOpen={showInvite} toggle={() => !sending && resetInvite()} className="add-transaction-modal add-business-modal">
        <ModalHeader toggle={() => !sending && resetInvite()}>
          {t("team.inviteTitle")}
          <span className="mksv-modal-sub">{t("team.inviteSub")}</span>
        </ModalHeader>
        <ModalBody>
          {error && <div className="alert alert-danger" role="alert">{error}</div>}
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
    </div>
  );
}

export default Team;
