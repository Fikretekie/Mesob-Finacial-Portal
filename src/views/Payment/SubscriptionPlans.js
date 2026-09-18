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
import { FaPaypal, FaCreditCard, FaCheck } from "react-icons/fa";
import LanguageSelector from "components/Languageselector/LanguageSelector";
import { useTranslation } from "react-i18next";
import { authHeader } from "../../utils/apiFetch";

/* ─── inline styles ─────────────────────────────────────────── */
const styles = {
  page: {
    minHeight: "100vh",
    background: "var(--surface-2)",
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
  /* gradient border card */
  gradientBorder: {
    borderRadius: "20px",
    padding: "3px",              // ← border thickness
  },
  card: {
    background: "#1c1e3d",
    borderRadius: "18px",
    padding: "clamp(1.25rem, 2vw, 1.75rem) clamp(1.25rem, 3vw, 2.25rem)",
  },
  heading: {
    textAlign: "center",
    marginBottom: "1rem",
  },
  h2: {
    fontSize: "clamp(1.5rem, 6vw, 1.8rem)", // ← larger, more readable
    fontWeight: "700",
    color: "var(--text-1)",
    marginBottom: "0.875rem",
    lineHeight: 1.2,
  },
  accent: { color: "white" },
  subtitle: {
    color: "var(--text-3)",
    fontSize: "clamp(0.9rem, 4vw, 1rem)", // ← more readable
    lineHeight: 1.5,
    margin: 0,
    textAlign: "center",
  },
  bold: { fontWeight: "600", color: "var(--text-2)" },
  /* features box */
  featuresBox: {
    background: "#282d57",
    border: "1px solid rgba(59, 130, 246, 0.15)",
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
    color: "#8e94b3",
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
  /* price */
  priceWrap: { textAlign: "center", marginBottom: "1rem" },
  price: {
    fontSize: "clamp(1.9rem, 8vw, 2.4rem)", // ← more prominent
    fontWeight: "700",
    color: "var(--text-1)",
    margin: 0,
    marginBottom: "0.25rem",
  },
  perMonth: { fontSize: "clamp(0.85rem, 3vw, 1rem)", fontWeight: "400", color: "var(--text-3)" },
  /* CTA */
  ctaBtn: {
    width: "100%",
    background: "linear-gradient(135deg, #3b82f6 0%, #4f46e5 100%)",
    border: "none",
    borderRadius: "12px",
    color: "var(--text-1)",
    fontWeight: "600",
    fontSize: "clamp(0.95rem, 4vw, 1.05rem)", // ← readable
    padding: "1rem 1.25rem",
    cursor: "pointer",
    transition: "all 0.3s ease",
    boxShadow: "0 4px 20px rgba(59,130,246,0.35)",
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

  const [billingCycle] = useState("monthly");
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
      price: { monthly: "$29.99/month", yearly: "$600/year" },
      priceId: {
        monthly: getStripeMonthlyPriceId(),
        yearly: "price_basic_yearly",
      },
      paypalPlanId: {
        monthly: window?.location.hostname.includes("localhost")
          ? "P-1E453171T1240781XNDIUNGY"
          : "P-6F168158R7479781ENIS3BMQ",
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
          redirectUrl: window.location.origin + "/customer/dashboard",
          userId,
          email,
        }),
      });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const session = await response.json();
      const url = session?.url || session?.session?.url;
      if (!url) throw new Error("Session URL missing");
      window.location.href = url;
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
    ["localhost", "127.0.0.1"].includes(window.location.hostname)
      ? "AfyldJzeR-e8NQP2M24ocwWHWPfwRAH8XrUa7W70nwSfDYXmHjMOUgdpiEuv8RTV5RT6-GcR_hOMbG6A"
      : "AVuPk0EljwS6RR9n8GU5Rb2MOQADzQ6T3qSj8YoAsNaHGYwdqko9GOilnxq7vCFDn2iH9hQ8xDoaPL3u";

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

            {/* ── Gradient-border card ── */}
            <div style={styles.gradientBorder}>
              <div style={{ ...styles.card, ...cardStyleMobile }}>

                {/* Header */}
                <div style={styles.heading}>
                  <h2 style={styles.h2}>
                    <span style={styles.accent}>Pro Plan</span>
                  </h2>
                  <p style={styles.subtitle}>
                    Your 30-day free trial is ending. Don't lose access to your
                    transactions, reports, and saved business data.
                  </p>
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

                {/* Price */}
                <div style={styles.priceWrap}>
                  <p style={styles.price}>
                    $29.99{" "}
                    <span style={styles.perMonth}>/ month</span>
                  </p>
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
                    {billingCycle === "monthly" && (() => {
                      const selectedPlan = plans.find((p) =>
                        Object.values(p.priceId).includes(selectedPriceId)
                      );
                      const planId = selectedPlan?.paypalPlanId?.monthly;
                      console.log("planId", planId);
                      console.log("selectedPlan", selectedPlan);
                      console.log("plans", plans);
                      console.log("selectedPriceId", selectedPriceId);

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
                                    redirectUrl: window.location.origin + "/customer/subscription",
                                  }),
                                }
                              );
                              const data = await res.json();
                              if (data.success && data.approvalLink) {
                                window.location.href = data.approvalLink;
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