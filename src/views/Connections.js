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
  confirmTransactions,
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

// Short relative time for the "Last synced …" line; falls back to a date.
function timeAgo(value, t) {
  if (!value) return null;
  const d = new Date(value);
  if (isNaN(d.getTime())) return null;
  const sec = Math.floor((Date.now() - d.getTime()) / 1000);
  if (sec < 45) return t("connections.justNow", "just now");
  const min = Math.floor(sec / 60);
  if (min < 60) return t("connections.minsAgo", "{{n}}m ago", { n: min });
  const hr = Math.floor(min / 60);
  if (hr < 24) return t("connections.hrsAgo", "{{n}}h ago", { n: hr });
  const day = Math.floor(hr / 24);
  if (day < 30) return t("connections.daysAgo", "{{n}}d ago", { n: day });
  return d.toLocaleDateString();
}

const CheckGlyph = () => (
  <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" style={{ marginRight: 4, verticalAlign: "-1px" }}>
    <polyline points="20 6 9 17 4 12" />
  </svg>
);

const ChevronGlyph = () => (
  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <polyline points="9 6 15 12 9 18" />
  </svg>
);

const RefreshGlyph = () => (
  <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d="M21 12a9 9 0 1 1-2.64-6.36" /><polyline points="21 3 21 9 15 9" />
  </svg>
);

const UnlinkGlyph = () => (
  <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d="M18.84 12.25l1.72-1.71a4 4 0 0 0-5.66-5.66l-1.71 1.72" /><path d="M5.17 11.75l-1.72 1.71a4 4 0 0 0 5.66 5.66l1.71-1.72" />
    <line x1="8" y1="2" x2="8" y2="5" /><line x1="2" y1="8" x2="5" y2="8" /><line x1="16" y1="19" x2="16" y2="22" /><line x1="19" y1="16" x2="22" y2="16" />
  </svg>
);

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
    const hasCode = new URLSearchParams(window.location.search).get("code");
    fetchConnections()
      .then((data) => {
        setStatus(data || {});
        // Sync-on-open: silently pull new Square payments whenever the page
        // opens (the OAuth-return effect handles the ?code case separately).
        if (!hasCode && data && data.square && data.square.connected) {
          syncSquareTransactions()
            .then((result) => {
              const n = squareImportCount(result);
              if (n) {
                setSyncMsg(t("connections.squareSynced", "Synced — imported {{count}} new payment(s).", { count: n }));
                window.dispatchEvent(new Event("mesob:transactionAdded"));
                fetchConnections().then(setStatus).catch(() => {});
              }
            })
            .catch(() => {});
        }
      })
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

  // Clicking a connected card opens that account's transactions: the bank goes
  // to the review inbox; Square (which auto-imports) goes to the report where
  // its sales land.
  const openAccount = (p) => {
    navigate(p.id === "square" ? "/customer/financial-report" : "/customer/review-transactions");
  };

  // Auto-sync toggle (bank): when on, new transactions import automatically
  // without the manual review step. Persisted via the same autoImportAll flag
  // the review screen uses.
  const handleToggleAutoSync = async (p, checked) => {
    setStatus((s) => ({ ...s, [p.id]: { ...(s[p.id] || {}), autoImportAll: checked } }));
    try {
      await confirmTransactions([], [], checked);
    } catch (err) {
      console.error("Auto-sync toggle failed:", err);
      setStatus((s) => ({ ...s, [p.id]: { ...(s[p.id] || {}), autoImportAll: !checked } }));
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
          const syncAgo = connected ? timeAgo(st.lastSync, t) : null;
          const toReview = p.id === "plaid" && connected ? (Number(st.pendingCount) || 0) : 0;
          const name = t("connections." + p.id + "Name");
          const recent = Array.isArray(st.recent) ? st.recent.slice(0, 3) : [];
          const clickProps = connected
            ? {
                role: "button",
                tabIndex: 0,
                onClick: () => openAccount(p),
                onKeyDown: (e) => {
                  if (e.key === "Enter" || e.key === " ") { e.preventDefault(); openAccount(p); }
                },
                "aria-label": t("connections.openAccount", "Open {{name}} transactions", { name }),
              }
            : {};
          return (
            <div className={"conn-card" + (connected ? " conn-card--on" : "")} key={p.id}>
              <div className={"conn-card-main" + (connected ? " conn-card-main--click" : "")} {...(connected ? clickProps : {})}>
                <div className={"conn-ico conn-ico--" + p.kind}>
                  <ProviderIcon kind={p.kind} />
                </div>
                <div className="conn-body">
                  <div className="conn-name-row">
                    <span className="conn-name">{name}</span>
                    {!live ? (
                      <span className="conn-chip conn-chip--soon">{t("nav.badgeSoon")}</span>
                    ) : connected ? (
                      <span className="conn-chip conn-chip--on"><CheckGlyph />{t("connections.connected")}</span>
                    ) : (
                      <span className="conn-chip">{t("connections.notConnected")}</span>
                    )}
                    {toReview > 0 && (
                      <span className="conn-badge">{t("connections.toReview", "{{n}} to review", { n: toReview })}</span>
                    )}
                  </div>
                  <span className="conn-via">{t("connections.via", "via")} {p.via}</span>
                  <p className="conn-desc">{t(p.descKey)}</p>
                  {connected && (st.institution || syncAgo) && (
                    <div className="conn-meta-row">
                      {st.institution && <span className="conn-meta">{st.institution}</span>}
                      {syncAgo && <span className="conn-meta conn-meta--sync">{t("connections.lastSynced", "Last synced {{ago}}", { ago: syncAgo })}</span>}
                    </div>
                  )}
                </div>

                {!live ? (
                  <div className="conn-action">
                    <button className="conn-btn conn-btn--ghost" disabled title={t("connections.comingSoonHint")}>
                      {t("nav.badgeSoon")}
                    </button>
                  </div>
                ) : loading ? (
                  <div className="conn-action">
                    <div className="conn-skel" aria-hidden="true" />
                  </div>
                ) : connected ? (
                  <div className="conn-trail">
                    {p.id === "square" && (
                      <button
                        className="conn-icon-btn"
                        title={t("connections.syncNow", "Sync now")}
                        aria-label={t("connections.syncNow", "Sync now")}
                        onClick={(e) => { e.stopPropagation(); handleSquareSync(); }}
                        disabled={busyId === p.id}
                      >
                        {busyId === p.id ? <Spinner size="sm" /> : <RefreshGlyph />}
                      </button>
                    )}
                    <button
                      className="conn-icon-btn conn-icon-btn--danger"
                      title={t("connections.disconnect")}
                      aria-label={t("connections.disconnect")}
                      onClick={(e) => { e.stopPropagation(); handleDisconnect(p); }}
                      disabled={busyId === p.id}
                    >
                      {busyId === p.id ? <Spinner size="sm" /> : <UnlinkGlyph />}
                    </button>
                    <span className="conn-chevron" aria-hidden="true"><ChevronGlyph /></span>
                  </div>
                ) : (
                  <div className="conn-action">
                    <button className="conn-btn" onClick={() => handleConnect(p)} disabled={busyId === p.id}>
                      {busyId === p.id ? <Spinner size="sm" /> : t("connections.connect")}
                    </button>
                  </div>
                )}
              </div>

              {connected && (p.id === "plaid" || recent.length > 0) && (
                <div className="conn-extra">
                  {p.id === "plaid" && (
                    <div className="conn-autosync">
                      <button
                        type="button"
                        role="switch"
                        aria-checked={!!st.autoImportAll}
                        aria-label={t("connections.autoSync", "Auto-sync")}
                        className={"conn-switch" + (st.autoImportAll ? " conn-switch--on" : "")}
                        onClick={() => handleToggleAutoSync(p, !st.autoImportAll)}
                      >
                        <span className="conn-switch-knob" />
                      </button>
                      <div className="conn-autosync-text">
                        <span className="conn-autosync-label">{t("connections.autoSync", "Auto-sync")}</span>
                        <span className="conn-autosync-hint">{t("connections.autoSyncHint", "Add new transactions automatically, no review needed")}</span>
                      </div>
                    </div>
                  )}
                  {recent.length > 0 && (
                    <div className="conn-preview">
                      <div className="conn-preview-head">{t("connections.recentActivity", "Recent")}</div>
                      {recent.map((tx, i) => {
                        const inc = p.id === "square" ? true : Number(tx.amount) < 0;
                        return (
                          <div className="conn-preview-row" key={i}>
                            <span className="conn-preview-name">{tx.name}</span>
                            <span className="conn-preview-date">{tx.date}</span>
                            <span className={"conn-preview-amt" + (inc ? " conn-preview-amt--pos" : "")}>
                              {(inc ? "+$" : "-$") + Math.abs(Number(tx.amount) || 0).toFixed(2)}
                            </span>
                          </div>
                        );
                      })}
                      <button type="button" className="conn-preview-all" onClick={() => openAccount(p)}>
                        {p.id === "plaid"
                          ? t("connections.reviewAllN", "Review all {{n}}", { n: st.pendingCount || recent.length })
                          : t("connections.viewAll", "View all")}
                        <ChevronGlyph />
                      </button>
                    </div>
                  )}
                </div>
              )}
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