import React, { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { useNavigate } from "react-router-dom";
import { Helmet } from "react-helmet";
import { Spinner } from "reactstrap";
import {
  PROVIDERS,
  isProviderLive,
  fetchConnections,
  startConnection,
  disconnectProvider,
  exchangePublicToken,
  exchangeSquareCode,
  syncSquareTransactions,
} from "utils/connectionsStorage";
import "../assets/css/team.css";
import "../assets/css/connections.css";

const ProviderIcon = ({ kind }) =>
  kind === "bank" ? (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M3 10l9-6 9 6" />
      <path d="M4 10v9" /><path d="M20 10v9" /><path d="M8 10v9" /><path d="M12 10v9" /><path d="M16 10v9" />
      <line x1="2" y1="21" x2="22" y2="21" />
    </svg>
  ) : (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <rect x="4" y="2" width="16" height="20" rx="2" />
      <line x1="8" y1="6" x2="16" y2="6" />
      <line x1="8" y1="10" x2="16" y2="10" />
      <circle cx="12" cy="16" r="1.6" />
    </svg>
  );

// The square-sync backend writes straight in; be tolerant of its response shape
// when reporting how many were imported (number, {imported}/{count}, or a list).
function squareImportCount(result) {
  if (result == null) return null;
  if (typeof result.imported === "number") return result.imported;
  if (typeof result.count === "number") return result.count;
  if (typeof result.added === "number") return result.added;
  if (Array.isArray(result.transactions)) return result.transactions.length;
  return null;
}

function loadPlaidScript() {
  return new Promise((resolve, reject) => {
    if (window.Plaid) return resolve();
    const script = document.createElement("script");
    script.src = "https://cdn.plaid.com/link/v2/stable/link-initialize.js";
    script.onload = resolve;
    script.onerror = reject;
    document.body.appendChild(script);
  });
}

function Connections() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const [status, setStatus] = useState({});
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState(null);
  const [syncMsg, setSyncMsg] = useState(null);

  useEffect(() => {
    fetchConnections()
      .then(setStatus)
      .catch(() => setStatus({}))
      .finally(() => setLoading(false));
  }, []);

  // Square OAuth return: Square (unlike Plaid) redirects back here with a
  // ?code= param. Exchange it for an access token, pull the first batch of
  // payments, strip the code so a refresh can't re-run the exchange, then
  // refresh the connection status.
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const code = params.get("code");
    if (!code) return;
    setBusyId("square");
    (async () => {
      try {
        await exchangeSquareCode(code);
        const result = await syncSquareTransactions();
        const n = squareImportCount(result);
        setSyncMsg(
          n != null
            ? t("connections.squareImported", "Connected! Imported {{count}} Square payment(s).", { count: n })
            : t("connections.squareConnected", "Square connected and synced.")
        );
        // Let the dashboard / financial report refresh if they're open.
        window.dispatchEvent(new Event("mesob:transactionAdded"));
      } catch (err) {
        console.error("Square connect/sync failed:", err);
        setSyncMsg(t("connections.squareError", "Couldn't finish connecting Square. Please try again."));
      } finally {
        window.history.replaceState({}, "", window.location.pathname);
        fetchConnections().then(setStatus).catch(() => {});
        setBusyId(null);
      }
    })();
  }, []);

  const handleSquareSync = async () => {
    setBusyId("square");
    setSyncMsg(null);
    try {
      const result = await syncSquareTransactions();
      const n = squareImportCount(result);
      setSyncMsg(
        n != null
          ? t("connections.squareSynced", "Synced — imported {{count}} new payment(s).", { count: n })
          : t("connections.squareSyncedNone", "Synced. No new payments.")
      );
      window.dispatchEvent(new Event("mesob:transactionAdded"));
    } catch (err) {
      console.error("Square sync failed:", err);
      setSyncMsg(t("connections.squareError", "Sync failed. Please try again."));
    } finally {
      setBusyId(null);
    }
  };

  const handleConnect = async (p) => {
    setBusyId(p.id);
    try {
      const res = await startConnection(p.id);
      if (res?.redirectUrl) {
        window.location.href = res.redirectUrl;
      } else if (res?.linkToken) {
        await loadPlaidScript();
        const handler = window.Plaid.create({
          token: res.linkToken,
          onSuccess: (publicToken) => {
            exchangePublicToken(p.id, publicToken)
              .then(() => navigate("/customer/review-transactions"))
              .catch((err) => console.error("Plaid exchange failed:", err));
          },
          onExit: (err) => {
            if (err) console.error("Plaid Link exited with error:", err);
          },
        });
        handler.open();
      } else {
        await fetchConnections().then(setStatus);
      }
    } catch (err) {
      console.error("Connect failed:", err);
    } finally {
      setBusyId(null);
    }
  };

  const handleDisconnect = async (p) => {
    setBusyId(p.id);
    try {
      await disconnectProvider(p.id);
      setStatus((s) => ({ ...s, [p.id]: { connected: false } }));
    } catch (err) {
      console.error("Disconnect failed:", err);
    } finally {
      setBusyId(null);
    }
  };

  return (
    <div className="team-page">
      <Helmet>
        <title>Connections - Meksova</title>
      </Helmet>

      <div className="team-head">
        <div>
          <h2 className="team-title">{t("connections.title")}</h2>
          <p className="team-sub">{t("connections.subtitle")}</p>
        </div>
      </div>

      {syncMsg && (
        <div className="conn-sync-msg" role="status" onClick={() => setSyncMsg(null)}>
          {syncMsg}
        </div>
      )}

      <div className="conn-grid">
        {PROVIDERS.map((p) => {
          const live = isProviderLive(p);
          const st = status[p.id] || {};
          const connected = !!st.connected;
          return (
            <div className="conn-card" key={p.id}>
              <div className={"conn-ico conn-ico--" + p.kind}>
                <ProviderIcon kind={p.kind} />
              </div>
              <div className="conn-body">
                <div className="conn-name-row">
                  <span className="conn-name">{t("connections." + p.id + "Name")}</span>
                  {!live ? (
                    <span className="conn-chip conn-chip--soon">{t("nav.badgeSoon")}</span>
                  ) : connected ? (
                    <span className="conn-chip conn-chip--on">{t("connections.connected")}</span>
                  ) : (
                    <span className="conn-chip">{t("connections.notConnected")}</span>
                  )}
                </div>
                <p className="conn-desc">{t(p.descKey)}</p>
                {connected && st.institution && (
                  <p className="conn-meta">{st.institution}</p>
                )}
              </div>
              <div className="conn-action">
                {!live ? (
                  <button className="conn-btn conn-btn--ghost" disabled title={t("connections.comingSoonHint")}>
                    {t("nav.badgeSoon")}
                  </button>
                ) : connected ? (
                  <div className="conn-action-group">
                    {p.id === "plaid" && (
                      <button className="conn-btn" onClick={() => navigate("/customer/review-transactions")}>
                        {t("connections.reviewTransactions")}
                      </button>
                    )}
                    {p.id === "square" && (
                      <button className="conn-btn" onClick={handleSquareSync} disabled={busyId === p.id}>
                        {busyId === p.id ? <Spinner size="sm" /> : t("connections.syncNow", "Sync now")}
                      </button>
                    )}
                    <button className="conn-btn conn-btn--ghost" onClick={() => handleDisconnect(p)} disabled={busyId === p.id}>
                      {busyId === p.id ? <Spinner size="sm" /> : t("connections.disconnect")}
                    </button>
                  </div>
                ) : (
                  <button className="conn-btn" onClick={() => handleConnect(p)} disabled={busyId === p.id}>
                    {busyId === p.id ? <Spinner size="sm" /> : t("connections.connect")}
                  </button>
                )}
              </div>
            </div>
          );
        })}
      </div>

      <p className="conn-note">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <rect x="3" y="11" width="18" height="11" rx="2" />
          <path d="M7 11V7a5 5 0 0 1 10 0v4" />
        </svg>
        {loading ? t("connections.loading") : t("connections.securityNote")}
      </p>
    </div>
  );
}

export default Connections;