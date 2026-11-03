import React, { useEffect, useRef, useState } from "react";
import axios from "axios";
import { apiUrl, ROUTES } from "config/api";
import { useSiteConfig } from "utils/siteConfig";
import "../assets/css/site-gate.css";

export const POLICY_PATHS = { terms: "/terms-of-use", privacy: "/privacy-policy" };
const acceptedKey = (kind) => `mksv_policy_${kind}`;

/** Asks a signed-in user to accept any policy the owner re-published with
 * "require acceptance" on. Acceptance is kept locally and on the user record. */
export default function PolicyGate() {
  const cfg = useSiteConfig();
  const [, bump] = useState(0);
  const [saving, setSaving] = useState(false);
  const btnRef = useRef(null);

  const pending = Object.entries(cfg.policies || {}).filter(([kind, p]) => {
    if (!p?.requireAccept || !p.version) return false;
    try {
      return localStorage.getItem(acceptedKey(kind)) !== p.version;
    } catch (e) {
      return false;
    }
  });

  useEffect(() => {
    if (pending.length) btnRef.current?.focus();
  }, [pending.length]);

  if (!pending.length || parseInt(localStorage.getItem("role"), 10) === 0) return null;

  const accept = async () => {
    setSaving(true);
    const accepted = {};
    pending.forEach(([kind, p]) => {
      accepted[kind] = { version: p.version, at: new Date().toISOString() };
      try {
        localStorage.setItem(acceptedKey(kind), p.version);
      } catch (e) {}
    });
    const userId = localStorage.getItem("userId");
    if (userId) {
      try {
        await axios.put(apiUrl(`${ROUTES.USERS}/${userId}`), { acceptedPolicies: accepted });
      } catch (e) {}
    }
    setSaving(false);
    bump((n) => n + 1);
  };

  const trap = (e) => {
    // Accept is the only way out, so keep focus on the dialog's controls.
    if (e.key !== "Tab") return;
    const nodes = e.currentTarget.querySelectorAll("a, button");
    const first = nodes[0];
    const last = nodes[nodes.length - 1];
    if (e.shiftKey && document.activeElement === first) {
      e.preventDefault();
      last.focus();
    } else if (!e.shiftKey && document.activeElement === last) {
      e.preventDefault();
      first.focus();
    }
  };

  return (
    <div className="sg-modal" role="presentation">
      <div className="sg-modal__card" role="dialog" aria-modal="true" aria-labelledby="sg-policy-title" onKeyDown={trap}>
        <h2 id="sg-policy-title" className="sg-wall__title">We've updated our policies</h2>
        <ul className="sg-modal__list">
          {pending.map(([kind, p]) => (
            <li key={kind}>
              <a href={POLICY_PATHS[kind]} target="_blank" rel="noopener noreferrer">
                {p.title}
              </a>
              <span className="sg-wall__meta"> · v{p.version}{p.effectiveDate ? ` · effective ${p.effectiveDate}` : ""}</span>
              {p.summary && <p className="sg-modal__summary">{p.summary}</p>}
            </li>
          ))}
        </ul>
        <button ref={btnRef} type="button" className="sg-wall__btn sg-modal__btn" onClick={accept} disabled={saving}>
          {saving ? "Saving…" : "I agree"}
        </button>
      </div>
    </div>
  );
}
