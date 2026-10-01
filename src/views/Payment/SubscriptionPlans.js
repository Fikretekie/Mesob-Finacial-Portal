import React, { useState, useEffect } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import PanelHeader from "components/PanelHeader/PanelHeader";
import { Helmet } from "react-helmet";
import axios from "axios";
import {
  API_BASE_URL,
  apiUrl,
  ROUTES,
  getStripeMonthlyPriceId,
  getEnv,
} from "../../config/api";
import {
  Row,
  Col,
  Spinner,
  Modal,
  ModalHeader,
  ModalBody,
  ModalFooter,
} from "reactstrap";
import { PayPalScriptProvider } from "@paypal/react-paypal-js";
import { Capacitor } from "@capacitor/core";
import { Browser } from "@capacitor/browser";
import { FaPaypal, FaCreditCard, FaCheck } from "react-icons/fa";
import LanguageSelector from "components/Languageselector/LanguageSelector";
import { useTranslation } from "react-i18next";
import { authHeader } from "../../utils/apiFetch";

// window.location.origin inside the native app's WebView is an internal
// address, not a real website -- Stripe/PayPal can't redirect back to it
// ("site can't be reached"). Use the real hosted domain instead when native.
const getRedirectOrigin = () =>
  Capacitor.isNativePlatform()
    ? (getEnv() === "production" ? "https://app.meksova.com" : "https://staging.meksova.com")
    : window.location.origin;

/* ─── inline styles ─────────────────────────────────────────── */
const styles = {
  page: {
    minHeight: "100vh",
    background: "transparent",
    display: "flex",
    alignItems: "flex-start",
    justifyContent: "center",
    padding: "0.75rem 1rem",
    boxSizing: "border-box",
  },
  wrapper: {
    width: "100%",
    maxWidth: "min(96vw, 960px)",
    marginTop: "0.5rem",
    marginLeft: "auto",
    marginRight: "auto",
  },
  /* blue rim-glow card (matches landing demo + design tokens) */
  gradientBorder: {
    borderRadius: "20px",
    padding: 0,
  },
  card: {
    background: "var(--surface-2)",
    border: "1px solid var(--card-border)",
    boxShadow: "var(--card-glow)",
    borderRadius: "20px",
    padding: "clamp(1.5rem, 2.5vw, 2rem) clamp(1.25rem, 3vw, 2.25rem)",
  },
  /* heading above the card */
  topHeading: {
    textAlign: "left",
    margin: "0 0 1rem",
    padding: "0 0.25rem",
  },
  h2: {
    fontSize: "clamp(1.5rem, 6vw, 1.9rem)",
    fontWeight: "800",
    color: "var(--text-1)",
    letterSpacing: "-0.02em",
    margin: "0 0 0.6rem",
    lineHeight: 1.15,
  },
  accent: { color: "var(--accent)" },
  subtitle: {
    color: "var(--text-2)",
    fontSize: "clamp(0.9rem, 4vw, 1rem)",
    lineHeight: 1.55,
    margin: 0,
    textAlign: "left",
  },
  bold: { fontWeight: "700", color: "var(--text-1)" },
  /* eyebrow row inside card */
  eyebrow: {
    display: "flex",
    alignItems: "center",
    gap: "0.65rem",
    fontFamily: "var(--font-mono)",
    fontSize: "0.72rem",
    fontWeight: 700,
    letterSpacing: "0.12em",
    textTransform: "uppercase",
    color: "var(--text-3)",
    marginBottom: "1.1rem",
  },
  eyebrowIco: {
    width: 34,
    height: 34,
    borderRadius: 10,
    display: "grid",
    placeItems: "center",
    color: "var(--accent)",
    background: "var(--accent-soft)",
    border: "1px solid rgba(59, 130, 246, 0.28)",
  },
  /* features box */
  featuresBox: {
    background: "var(--surface-1)",
    border: "1px solid var(--border)",
    borderRadius: "14px",
    padding: "clamp(1rem, 2vw, 1.35rem)",
    marginBottom: "1rem",
  },
  featuresBoxGrid: {
    display: "grid",
    gridTemplateColumns: "repeat(2, minmax(0, 1fr))",
    columnGap: "1.25rem",
    rowGap: "0.65rem",
  },
  featureRow: {
    display: "flex",
    alignItems: "flex-start",
    gap: "0.75rem",
    marginBottom: 0,
  },
  checkIcon: {
    color: "var(--green)",
    marginTop: "2px",
    flexShrink: 0,
    fontSize: "14px",
  },
  featureText: {
    color: "var(--text-3)",
    fontSize: "clamp(0.85rem, 3.5vw, 0.95rem)", // ← balanced sizing
    lineHeight: 1.5,
    margin: 0,
  },
  featureBold: {
    fontWeight: "600",
    color: "var(--text-2)",
  },
  pitch: {
    color: "var(--text-3)",
    fontSize: "clamp(0.8rem, 3vw, 0.9rem)",
    textAlign: "center",
    marginTop: "0.75rem",
    marginBottom: 0,
    lineHeight: 1.6,
    gridColumn: "1 / -1",
  },
  /* billing cycle toggle (segmented pill, demo style) */
  cycleToggle: {
    display: "inline-flex",
    justifyContent: "flex-start",
    gap: "4px",
    padding: "4px",
    marginBottom: "1.1rem",
    background: "var(--surface-3)",
    border: "1px solid var(--border)",
    borderRadius: "999px",
  },
  cyclePill: (active) => ({
    display: "inline-flex",
    alignItems: "center",
    gap: "0.5rem",
    border: "none",
    background: active ? "var(--accent-solid)" : "transparent",
    color: active ? "var(--accent-ink)" : "var(--text-2)",
    borderRadius: "999px",
    padding: "0.45rem 1.05rem",
    fontSize: "clamp(0.82rem, 3vw, 0.92rem)",
    fontWeight: "700",
    cursor: "pointer",
    transition: "all 0.2s ease",
  }),
  saveBadge: (activeYearly) => ({
    fontSize: "0.64rem",
    fontWeight: 800,
    letterSpacing: "0.04em",
    padding: "2px 7px",
    borderRadius: "999px",
    background: activeYearly ? "rgba(255,255,255,0.22)" : "rgba(0,217,126,0.15)",
    color: activeYearly ? "var(--accent-ink)" : "var(--green)",
  }),
  /* price */
  priceWrap: { textAlign: "left", marginBottom: "1rem" },
  price: {
    fontSize: "clamp(2.4rem, 10vw, 3.2rem)", // ← magnified headline price
    fontWeight: "800",
    color: "var(--text-1)",
    letterSpacing: "-0.02em",
    lineHeight: 1.05,
    margin: 0,
    marginBottom: "0.15rem",
  },
  perMonth: { fontSize: "clamp(0.85rem, 3vw, 1rem)", fontWeight: "500", color: "var(--text-3)" },
  priceSub: {
    fontSize: "clamp(0.78rem, 2.8vw, 0.9rem)",
    color: "var(--text-3)",
    margin: "4px 0 0",
    fontWeight: 500,
  },
  priceSave: { color: "#34d399", fontWeight: 700 },
  /* CTA */
  ctaBtn: {
    width: "100%",
    background: "linear-gradient(135deg, var(--accent) 0%, var(--accent-solid) 100%)",
    border: "none",
    borderRadius: "12px",
    color: "var(--accent-ink)",
    fontWeight: "700",
    fontSize: "clamp(0.95rem, 4vw, 1.05rem)",
    padding: "1rem 1.25rem",
    cursor: "pointer",
    transition: "all 0.3s ease",
    boxShadow: "0 10px 30px -8px var(--accent-ring)",
    letterSpacing: "0.01em",
  },
  footNote: {
    color: "#475569",
    fontSize: "clamp(0.7rem, 2.5vw, 0.8rem)",
    textAlign: "center",
    marginTop: "1rem",
    marginBottom: 0,
  },
  /* subscribed state */
  subscribedBadge: {
    background: "rgba(16, 185, 129, 0.12)",
    border: "1px solid rgba(16,185,129,0.3)",
    borderRadius: "10px",
    color: "#34d399",
    padding: "0.875rem 1rem",
    fontSize: "clamp(0.8rem, 3vw, 0.9rem)",
    textAlign: "center",
    marginBottom: "1rem",
    fontWeight: "500",
  },
  cancelBtn: {
    width: "100%",
    background: "transparent",
    border: "1px solid rgba(239,68,68,0.5)",
    borderRadius: "12px",
    color: "#f87171",
    fontWeight: "600",
    fontSize: "clamp(0.9rem, 3.5vw, 1rem)",
    padding: "0.875rem 1.25rem",
    cursor: "pointer",
    transition: "all 0.25s ease",
  },
  /* error */
  errorBox: {
    marginTop: "1rem",
    padding: "12px 14px",
    backgroundColor: "#1a0000",
    border: "1px solid #ff4444",
    borderRadius: "8px",
    color: "#ff6b6b",
    fontSize: "clamp(0.8rem, 3vw, 0.9rem)",
  },
  /* success toast */
  successToast: {
    background: "rgba(16,185,129,0.1)",
    border: "1px solid rgba(16,185,129,0.25)",
    borderRadius: "10px",
    color: "#34d399",
    padding: "0.875rem 1rem",
    fontSize: "clamp(0.85rem, 3vw, 0.95rem)",
    marginBottom: "1.25rem",
    textAlign: "center",
  },
  /* Modal dark theme */
  modalContent: {
    backgroundColor: "#0d1117",
    border: "1px solid #1e293b",
    borderRadius: "16px",
    overflow: "hidden",
  },
  modalHeader: {
    backgroundColor: "#111827",
    borderBottom: "1px solid #1e293b",
    color: "var(--text-1)",
    padding: "1rem 1.5rem",
  },
  modalBody: {
    backgroundColor: "#0d1117",
    padding: "1.75rem 1.25rem",
  },
  modalFooter: {
    backgroundColor: "#111827",
    borderTop: "1px solid #1e293b",
    padding: "1rem 1.25rem",
  },
  payBtn: (gradient, shadow) => ({
    width: "100%",
    background: gradient,
    border: "none",
    borderRadius: "10px",
    padding: "clamp(11px, 3vw, 14px)",
    fontSize: "clamp(0.85rem, 3vw, 0.95rem)",
    fontWeight: "600",
    color: "var(--text-1)",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    gap: "8px",
    boxShadow: shadow,
    cursor: "pointer",
    transition: "all 0.3s ease",
  }),
  cancelModalBtn: {
    background: "#1e293b",
    border: "1px solid #334155",
    borderRadius: "8px",
    color: "var(--text-3)",
    padding: "8px 16px",
    cursor: "pointer",
    fontSize: "clamp(0.8rem, 3vw, 0.9rem)",
    transition: "all 0.2s ease",
  },
  /* confirm modal */
  confirmModalBody: {
    backgroundColor: "#0d1117",
    color: "var(--text-3)",
    padding: "1.5rem 1.25rem",
    fontSize: "clamp(0.85rem, 3vw, 0.95rem)",
    lineHeight: 1.6,
  },
  dangerBtn: {
    background: "linear-gradient(135deg,#ef4444,#b91c1c)",
    border: "none",
    borderRadius: "8px",
    color: "var(--text-1)",
    padding: "8px 16px",
    cursor: "pointer",
    fontWeight: "600",
    fontSize: "clamp(0.8rem, 3vw, 0.9rem)",
  },
};

const features = (t) => [
  {
    title: "Unlimited Transactions:",
    desc: "Track every transaction without limits — always know your real profit.",
  },
  {
    title: "Advanced Financial Reports:",
    desc: "Instantly generate clear reports for taxes and smarter decisions.",
  },
  {
    title: "Check Balance Sheet:",
    desc: "View a full balance sheet to understand your assets, liabilities, and equity at a glance.",
  },
  {
    title: "View Income Statement:",
    desc: "Track your revenue and expenses over time with a clear income statement.",
  },
  {
    title: "Export & Download Receipts:",
    desc: "Keep all your receipts organized, downloadable, and audit-ready.",
  },
  {
    title: "User Profile Management:",
    desc: "Manage your business info easily, no confusion, no lost data.",
  },
];
/* ─── component ─────────────────────────────────────────────── */
const SubscriptionPlans = () => {
  const { t } = useTranslation();
  const location = useLocation();

  const [billingCycle, setBillingCycle] = useState("monthly");
  const [userData, setUserData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [cancelLoading, setCancelLoading] = useState(false);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [selectedPriceId, setSelectedPriceId] = useState(null);
  const [justSubscribed, setJustSubscribed] = useState(false);
  const [showConfirmModal, setShowConfirmModal] = useState(false);
  const [ctaHover, setCtaHover] = useState(false);

  const backendBaseUrl =
    API_BASE_URL;

  const getUserId = () => localStorage.getItem("userId") || null;

  const fetchUser = async () => {
    try {
      setLoading(true);
      setError("");
      const userId = getUserId();
      if (!userId) { setUserData(null); return; }
      const response = await axios.get(apiUrl(`${ROUTES.USERS}/${userId}`));
      setUserData(response.data.user || response.data);
    } catch (err) {
      if (err.response?.status === 404) setUserData(null);
      else setError(err.response?.data?.message || "Failed to fetch user data.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { if (getUserId()) fetchUser(); }, []);

  // Native app: PayPal opens in an in-app browser tab (has its own close
  // button, unlike the app's WebView) -- refresh subscription status once
  // the user closes it, whether they finished or cancelled.
  useEffect(() => {
    if (!Capacitor.isNativePlatform()) return;
    const listener = Browser.addListener("browserFinished", fetchUser);
    return () => { listener.then((l) => l.remove()); };
  }, []);

  useEffect(() => {
    if (new URLSearchParams(window.location.search).get("paypal") === "success") fetchUser();
  }, [location.search]);

  useEffect(() => {
    const q = new URLSearchParams(window.location.search);
    if (q.get("success") === "true") {
      setJustSubscribed(true);
      const u = new URL(window.location.href);
      u.searchParams.delete("success");
      window.history.replaceState({}, document.title, u.toString());
      setTimeout(() => setJustSubscribed(false), 5000);
    }
  }, []);

  useEffect(() => {
    if (location.state?.justSubscribed) {
      setJustSubscribed(true);
      setTimeout(() => setJustSubscribed(false), 5000);
    }
  }, [location.state]);

  const plans = [
    {
      name: t("subscription.pricingPlan"),
      price: { monthly: "$29.99/month", yearly: "$299.99/year" },
      priceId: {
        monthly: getStripeMonthlyPriceId(),
        yearly: "price_basic_yearly",
      },
      paypalPlanId: {
        monthly: getEnv() === "production"
          ? "P-4DH237728B393202MNK4JXDA"
          : "P-34787152CT884572TNK2TSRI",
        yearly: getEnv() === "production"
          ? "P-0HL90234RM559280ANK4JXDA"
          : "P-1NJ16193HB228783PNK2TSRI",
      },
    },
  ];

  const isSubscribed =
    userData?.isPaid === true &&
    (userData?.subscription === true || userData?.subscription === "true");

  const handleSubscribe = async () => {
    try {
      const email = localStorage.getItem("user_email");
      const userId = getUserId();
      if (!email || !userId) { setError("Email or User ID missing"); return; }
      const response = await fetch(`${backendBaseUrl}/Subscription/Session`, {
        method: "POST",
        headers: { "Content-Type": "application/json", ...(await authHeader()) },
        body: JSON.stringify({
          planType: billingCycle,
          redirectUrl: getRedirectOrigin() + "/customer/dashboard",
          userId,
          email,
        }),
      });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const session = await response.json();
      const url = session?.url || session?.session?.url;
      if (!url) throw new Error("Session URL missing");
      if (Capacitor.isNativePlatform()) {
        await Browser.open({ url });
      } else {
        window.location.href = url;
      }
    } catch (err) {
      setError(err.message || "Failed to create Stripe subscription session");
    }
  };

  const cancelStripeSubscription = async () => {
    try {
      setCancelLoading(true);
      setError("");
      if (!userData?.subscriptionId) {
        setError("Subscription ID missing.");
        return;
      }
      await axios.delete(
        apiUrl(`${ROUTES.SUBSCRIPTION}/${userData.subscriptionId}`)
      );
      setShowConfirmModal(false);
      await fetchUser();
      window.location.reload();
    } catch (err) {
      console.error("Cancel Stripe subscription:", err);
      setError(
        err.response?.data?.message ||
        "Failed to cancel Stripe subscription. Please try again."
      );
    } finally {
      setCancelLoading(false);
    }
  };

  /** DELETE /MesobFinancialSystem/PaypalSubscription/{id} → your Lambda (PayPal cancel + DynamoDB). */
  const cancelPaypalSubscription = async () => {
    try {
      setCancelLoading(true);
      setError("");
      if (!userData?.subscriptionId) {
        setError("Subscription ID missing.");
        return;
      }
      await axios.delete(
        apiUrl(
          `${ROUTES.PAYPAL_SUBSCRIPTION}/${userData.subscriptionId}`
        )
      );
      setShowConfirmModal(false);
      await fetchUser();
      window.location.reload();
    } catch (err) {
      console.error("Cancel PayPal subscription:", err);
      setError(
        err.response?.data?.message ||
        err.response?.data?.error ||
        "Failed to cancel PayPal subscription. Please try again or cancel in your PayPal account."
      );
    } finally {
      setCancelLoading(false);
    }
  };

  const handleCancelSubscription = () => {
    const provider = (userData?.paymentType || "").toUpperCase();
    if (provider === "STRIPE") cancelStripeSubscription();
    else if (provider === "PAYPAL") cancelPaypalSubscription();
    else
      setError(
        "Unable to determine payment type. Please contact support."
      );
  };

  const getPaypalClientId = () =>
    getEnv() === "production"
      ? "BAAga0rtXS3g2MuYrH_6rDIEgudLNSGyrBXx8xbJ16-ju1Fowe_9IYUXUMOsHDBJEcVdDEd8twmkmAVF7c"
      : "AUBo6OTLCuCJS2A8eTCVdtzYTaH9020vCFdoC5dMl5Ejv-NcZWxClWuOeukqVNS2FUDl0ZvjAqA6dnvM";

  const [isMobile, setIsMobile] = useState(window.innerWidth < 768);
  const [isLandscape, setIsLandscape] = useState(window.innerWidth > window.innerHeight);

  useEffect(() => {
    const handleResize = () => {
      setIsMobile(window.innerWidth < 768);
      setIsLandscape(window.innerWidth > window.innerHeight);
    };
    window.addEventListener("resize", handleResize);
    return () => window.removeEventListener("resize", handleResize);
  }, []);

  const isMobileLandscape = isMobile && isLandscape;
  const currentPriceId = plans[0].priceId[billingCycle];
  const headerPriceLine = billingCycle === "yearly" ? "$299.99/year" : "$29.99/month";

  /** Wider card on small screens: less outer + inner horizontal padding */
  const pageStyleMobile = isMobile
    ? { padding: "0.45rem max(0.3rem, env(safe-area-inset-left)) 0.5rem max(0.3rem, env(safe-area-inset-right))" }
    : {};
  const wrapperStyleMobile = isMobile
    ? { maxWidth: "100%", width: "100%" }
    : {};
  const cardStyleMobile = isMobile
    ? { padding: "1.1rem 0.65rem" }
    : {};
  const featuresBoxStyleMobile = isMobile
    ? { padding: "0.85rem 0.55rem" }
    : {};

  return (
    <>
      <Helmet>
        <title>{t("subscription.title")} - Meksova</title>
      </Helmet>

      <div
        className="content"
        style={{
          marginTop: 80,
          ...(isMobile ? { paddingLeft: 0, paddingRight: 0 } : {}),
        }}
      >
        <div style={{ ...styles.page, ...pageStyleMobile }}>
          <div style={{ ...styles.wrapper, ...wrapperStyleMobile }}>
            {justSubscribed && (
              <div style={styles.successToast}>
                🎉 {t("subscription.congratulations")}
              </div>
            )}

            {error && <div style={styles.errorBox}>⚠️ {error}</div>}

            {/* ── Heading above the card (demo layout) ── */}
            <div style={styles.topHeading}>
              <h2 style={styles.h2}>
                Full Access with <span style={styles.accent}>Pro Plan</span>
              </h2>
              <p style={styles.subtitle}>
                Enjoy{" "}
                <b style={styles.bold}>unlimited access free for 30 days</b> — no
                credit card required. After your trial, your subscription
                continues automatically at{" "}
                <b style={styles.bold}>{headerPriceLine}</b>.
              </p>
            </div>

            {/* ── Blue rim-glow card ── */}
            <div style={styles.gradientBorder}>
              <div style={{ ...styles.card, ...cardStyleMobile }}>

                {/* Eyebrow */}
                <div style={styles.eyebrow}>
                  <span style={styles.eyebrowIco}>
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                      <rect x="2" y="5" width="20" height="14" rx="2" />
                      <line x1="2" y1="10" x2="22" y2="10" />
                    </svg>
                  </span>
                  Pro Plan
                </div>

                {/* Features */}
                <div
                  style={{
                    ...styles.featuresBox,
                    ...featuresBoxStyleMobile,
                    ...(isMobile ? {} : styles.featuresBoxGrid),
                  }}
                >
                  {features(t).map((f, i) => (
                    <div key={i} style={styles.featureRow}>
                      <FaCheck style={styles.checkIcon} />
                      <p style={styles.featureText}>
                        <span style={styles.featureBold}>{f.title}</span>{" "}
                        {f.desc}
                      </p>
                    </div>
                  ))}
                  <p style={styles.pitch}>
                    Stop guessing where your money goes. Keep full
                    control of your finances.
                  </p>
                </div>

                {/* Billing cycle toggle */}
                {!isSubscribed && (
                  <div style={styles.cycleToggle}>
                    <button
                      type="button"
                      style={styles.cyclePill(billingCycle === "monthly")}
                      onClick={() => setBillingCycle("monthly")}
                    >
                      Monthly
                    </button>
                    <button
                      type="button"
                      style={styles.cyclePill(billingCycle === "yearly")}
                      onClick={() => setBillingCycle("yearly")}
                    >
                      Yearly{" "}
                      <span style={styles.saveBadge(billingCycle === "yearly")}>
                        SAVE 17%
                      </span>
                    </button>
                  </div>
                )}

                {/* Price — magnified per-month headline, billing detail beneath */}
                <div style={styles.priceWrap}>
                  {billingCycle === "yearly" ? (
                    <>
                      <p style={styles.price}>
                        $24.99{" "}
                        <span style={styles.perMonth}>/ month</span>
                      </p>
                      <p style={styles.priceSub}>
                        $299.99 billed yearly ·{" "}
                        <span style={styles.priceSave}>2 months free</span>
                      </p>
                    </>
                  ) : (
                    <>
                      <p style={styles.price}>
                        $29.99{" "}
                        <span style={styles.perMonth}>/ month</span>
                      </p>
                      <p style={styles.priceSub}>billed monthly · cancel anytime</p>
                    </>
                  )}
                </div>

                {/* CTA / subscribed state */}
                {loading ? (
                  <div style={{ textAlign: "center", padding: "1.25rem 0" }}>
                    <Spinner style={{ color: "#60a5fa" }} />
                    <p style={{ color: "var(--text-3)", marginTop: "0.75rem", fontSize: "clamp(0.8rem, 3vw, 0.9rem)" }}>
                      {t("subscription.loadingSubscription")}
                    </p>
                  </div>
                ) : isSubscribed ? (
                  <>
                    <div style={styles.subscribedBadge}>
                      ✓ {t("subscription.alreadySubscribed")}
                    </div>
                    <button
                      style={styles.cancelBtn}
                      disabled={cancelLoading}
                      onClick={() => {
                        setError("");
                        setShowConfirmModal(true);
                      }}
                      onMouseEnter={e => { e.currentTarget.style.background = "rgba(239,68,68,0.1)"; }}
                      onMouseLeave={e => { e.currentTarget.style.background = "transparent"; }}
                    >
                      {cancelLoading ? (
                        <><Spinner size="sm" /> {t("subscription.cancelling")}</>
                      ) : t("subscription.unsubscribe")}
                    </button>
                  </>
                ) : (
                  <button
                    style={{
                      ...styles.ctaBtn,
                      ...(ctaHover ? {
                        boxShadow: "0 6px 28px rgba(59,130,246,0.55)",
                        transform: "translateY(-1px)",
                      } : {}),
                    }}
                    onMouseEnter={() => setCtaHover(true)}
                    onMouseLeave={() => setCtaHover(false)}
                    onClick={() => {
                      setSelectedPriceId(currentPriceId);
                      setIsModalOpen(true);
                    }}
                  >
                    Keep My Unlimited Access
                  </button>
                )}

                <p style={styles.footNote}>
                  No interruption. Cancel anytime.
                </p>
              </div>
            </div>
          </div>
        </div>

        {/* ── Payment Method Modal ── */}
        <Modal
          isOpen={isModalOpen}
          toggle={() => setIsModalOpen(false)}
          contentClassName=""
          style={{ "--bs-modal-bg": "transparent" }}
        >
          <div style={styles.modalContent}>
            <ModalHeader
              toggle={() => setIsModalOpen(false)}
              style={styles.modalHeader}
            >
              <span style={{ color: "var(--text-1)", fontWeight: 600, fontSize: "clamp(0.95rem, 4vw, 1.1rem)" }}>
                {t("subscription.choosePaymentMethod")}
              </span>
            </ModalHeader>

            <ModalBody style={styles.modalBody}>
              <Row className="g-2 g-sm-3">
                <Col xs={12} md={6}>
                  <button
                    style={styles.payBtn(
                      "linear-gradient(135deg,#3b82f6 0%,#1d4ed8 100%)",
                      "0 4px 16px rgba(59,130,246,0.3)"
                    )}
                    onClick={() => { handleSubscribe(); setIsModalOpen(false); }}
                    onMouseEnter={e => e.currentTarget.style.boxShadow = "0 6px 22px rgba(59,130,246,0.55)"}
                    onMouseLeave={e => e.currentTarget.style.boxShadow = "0 4px 16px rgba(59,130,246,0.3)"}
                  >
                    <FaCreditCard size={18} />
                    {t("subscription.payWithCard")}
                  </button>
                </Col>

                <Col xs={12} md={6}>
                  <PayPalScriptProvider
                    options={{
                      "client-id": getPaypalClientId(),
                      currency: "USD",
                      intent: "subscription",
                      vault: true,
                    }}
                  >
                    {(() => {
                      const selectedPlan = plans.find((p) =>
                        Object.values(p.priceId).includes(selectedPriceId)
                      );
                      const planId = selectedPlan?.paypalPlanId?.[billingCycle];
                      console.log("planId", planId);
                      console.log("selectedPlan", selectedPlan);
                      console.log("plans", plans);
                      console.log("selectedPriceId", selectedPriceId);

                      if (!planId) {
                        return (
                          <p style={{ color: "var(--text-3)", fontSize: "0.85rem", textAlign: "center", margin: 0 }}>
                            PayPal for yearly billing isn't set up yet — please use card.
                          </p>
                        );
                      }

                      return (
                        <button
                          disabled={loading}
                          style={{
                            ...styles.payBtn(
                              "linear-gradient(135deg,#0070ba 0%,#003087 100%)",
                              "0 4px 16px rgba(0,112,186,0.3)"
                            ),
                            opacity: loading ? 0.7 : 1,
                          }}
                          onMouseEnter={e => e.currentTarget.style.boxShadow = "0 6px 22px rgba(0,112,186,0.55)"}
                          onMouseLeave={e => e.currentTarget.style.boxShadow = "0 4px 16px rgba(0,112,186,0.3)"}
                          onClick={async () => {
                            setLoading(true); setError("");
                            try {
                              if (!planId) { setError("PayPal plan not configured."); return; }
                              const userId = getUserId();
                              const email = localStorage.getItem("user_email");
                              if (!userId || !email) { setError("User not logged in"); return; }
                              const res = await fetch(
                                `${backendBaseUrl}/createPaypalSubscription`,
                                {
                                  method: "POST",
                                  headers: { "Content-Type": "application/json", ...(await authHeader()) },
                                  body: JSON.stringify({
                                    planId, userId, email,
                                    redirectUrl: getRedirectOrigin() + "/customer/subscription",
                                  }),
                                }
                              );
                              const data = await res.json();
                              if (data.success && data.approvalLink) {
                                if (Capacitor.isNativePlatform()) {
                                  await Browser.open({ url: data.approvalLink });
                                } else {
                                  window.location.href = data.approvalLink;
                                }
                              } else {
                                setError("Failed to create PayPal subscription.");
                              }
                            } catch { setError("PayPal subscription failed. Please try again."); }
                            finally { setLoading(false); }
                          }}
                        >
                          {loading ? (
                            <><span className="spinner-border spinner-border-sm" /> {t("subscription.processing")}</>
                          ) : (
                            <><FaPaypal size={18} /> {t("subscription.payWithPaypal")}</>
                          )}
                        </button>
                      );
                    })()}
                  </PayPalScriptProvider>
                </Col>
              </Row>

              {error && <div style={styles.errorBox}>⚠️ {error}</div>}
            </ModalBody>

            <ModalFooter style={styles.modalFooter}>
              <button
                style={styles.cancelModalBtn}
                onClick={() => setIsModalOpen(false)}
                onMouseEnter={e => { e.currentTarget.style.color = "var(--text-1)"; e.currentTarget.style.background = "#334155"; }}
                onMouseLeave={e => { e.currentTarget.style.color = "var(--text-3)"; e.currentTarget.style.background = "#1e293b"; }}
              >
                {t("subscription.cancel")}
              </button>
            </ModalFooter>
          </div>
        </Modal>

        {/* ── Confirm Unsubscribe Modal ── */}
        <Modal isOpen={showConfirmModal} toggle={() => setShowConfirmModal(false)}>
          <div style={styles.modalContent}>
            <ModalHeader
              toggle={() => setShowConfirmModal(false)}
              style={styles.modalHeader}
            >
              <span style={{ color: "var(--text-1)", fontSize: "clamp(0.95rem, 4vw, 1.1rem)" }}>
                {t("subscription.confirmUnsubscribe")}
              </span>
            </ModalHeader>
            <ModalBody style={styles.confirmModalBody}>
              {t("subscription.unsubscribeMessage")}
              {error ? (
                <div style={{ ...styles.errorBox, marginTop: "1rem", marginBottom: 0 }}>
                  ⚠️ {error}
                </div>
              ) : null}
            </ModalBody>
            <ModalFooter style={styles.modalFooter}>
              <button
                style={styles.cancelModalBtn}
                onClick={() => setShowConfirmModal(false)}
              >
                {t("subscription.cancel")}
              </button>
              <button
                style={styles.dangerBtn}
                disabled={cancelLoading}
                onClick={() => handleCancelSubscription()}
              >
                {cancelLoading ? (
                  <><Spinner size="sm" /> {t("subscription.unsubscribing")}</>
                ) : t("subscription.unsubscribe")}
              </button>
            </ModalFooter>
          </div>
        </Modal>
      </div>
    </>
  );
};

export default SubscriptionPlans;