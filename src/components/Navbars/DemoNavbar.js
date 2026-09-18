import React, { useState, useEffect } from "react";
import { useDispatch, useSelector } from "react-redux";
import { Link, useLocation, useNavigate } from "react-router-dom";
import {
  Collapse,
  Navbar,
  NavbarToggler,
  NavbarBrand,
  Nav,
  NavItem,
  Dropdown,
  DropdownToggle,
  DropdownMenu,
  DropdownItem,
  Container,
  Modal,
  ModalHeader,
  ModalBody,
  ModalFooter,
  Button,
} from "reactstrap";
import axios from "axios";
import { apiUrl, ROUTES } from "../../config/api";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faPlus, faDownload } from "@fortawesome/free-solid-svg-icons";

import { adminRoutes, customerRoutes } from "routes.js";
import { setCurrency } from "store/currencySlice";
import { signOut } from "aws-amplify/auth";
import { useTranslation } from "react-i18next";
import LanguageSelector from "components/Languageselector/LanguageSelector";
import DownloadReportModal from "components/DownloadReportModal";

function DemoNavbar(props) {
  const { t } = useTranslation();
  const location = useLocation();
  const dispatch = useDispatch();
  const navigate = useNavigate();

  const [isOpen, setIsOpen] = useState(false);
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const [accountDropdownOpen, setAccountDropdownOpen] = useState(false);
  const [theme, setTheme] = useState(
    (typeof document !== "undefined" &&
      document.documentElement.getAttribute("data-theme")) ||
      "dark"
  );
  const toggleTheme = () => {
    const next = theme === "dark" ? "light" : "dark";
    document.documentElement.setAttribute("data-theme", next);
    try {
      localStorage.setItem("mksv-theme", next);
    } catch (e) {}
    setTheme(next);
  };
  const [helpModalOpen, setHelpModalOpen] = useState(false);
  const [isMobile, setIsMobile] = useState(window.innerWidth < 768);
  const [isLandscape, setIsLandscape] = useState(window.innerWidth > window.innerHeight);
  const [companyName, setCompanyName] = useState("");
  const [loadingCompanyName, setLoadingCompanyName] = useState(false);

  // Download report modal state
  const [showDownloadReportModal, setShowDownloadReportModal] = useState(false);

  // Subscription/trial state (needed to enable/disable buttons)
  const [userSubscription, setUserSubscription] = useState(false);
  const [trialEndDate, setTrialEndDate] = useState(null);
  const [scheduleCount, setScheduleCount] = useState(1);

  const userRole = parseInt(localStorage.getItem("role"));

  const [color, setColor] = useState("transparent");
  const sidebarToggle = React.useRef();

  // ── Derived flags ──
  const isLandscapeMobile = isMobile && isLandscape;
  // Show action buttons in navbar on desktop OR landscape mobile
  const isDashboardPage =
    location.pathname.includes("/dashboard");
  const showNavbarActionButtons = (!isMobile || isLandscapeMobile) && isDashboardPage;

  const isTrialActive = () =>
    trialEndDate && new Date() < trialEndDate && scheduleCount < 4;

  const subscriptionGateActive =
    userRole === 1 ? false : !userSubscription && !isTrialActive();

  const SUBSCRIPTION_ROUTE = "/customer/subscription";
  const SUBSCRIPTION_UPDATE_HINT = "Subscription update needed";

  // ── Resize handler ──
  useEffect(() => {
    const handleResize = () => {
      setIsMobile(window.innerWidth < 768);
      setIsLandscape(window.innerWidth > window.innerHeight);
    };
    window.addEventListener("resize", handleResize);
    return () => window.removeEventListener("resize", handleResize);
  }, []);

  // ── Fetch company name ──
  useEffect(() => {
    if (isDashboardPage) fetchCompanyName();
  }, [location.pathname]);

  const fetchCompanyName = async () => {
    setLoadingCompanyName(true);
    try {
      const userId = localStorage.getItem("userId");
      if (!userId) return;
      const response = await axios.get(
        apiUrl(`${ROUTES.USERS}/${userId}`)
      );
      setCompanyName(response.data?.user?.companyName || "");
    } catch (error) {
      console.error("Error fetching company name:", error);
      setCompanyName("");
    } finally {
      setLoadingCompanyName(false);
    }
  };

  // ── Fetch subscription ──
  useEffect(() => {
    const fetchSubscription = async () => {
      const userId = localStorage.getItem("userId");
      if (!userId) return;
      try {
        const response = await axios.get(
          apiUrl(`${ROUTES.USERS}/${userId}`)
        );
        if (response.data?.user) {
          setUserSubscription(response.data.user.subscription);
          setTrialEndDate(new Date(response.data.user?.trialEndDate));
          setScheduleCount(response.data.user.scheduleCount || 1);
        }
      } catch (error) {
        console.error("Error fetching subscription:", error);
      }
    };
    fetchSubscription();
  }, []);

  const toggle = () => {
    setColor(isOpen ? "transparent" : "white");
    setIsOpen(!isOpen);
  };

  const dropdownToggle = () => setDropdownOpen(!dropdownOpen);
  const accountDropdownToggle = () => setAccountDropdownOpen(!accountDropdownOpen);
  const toggleHelpModal = () => setHelpModalOpen(!helpModalOpen);

  const socialLinks = [
    { href: "https://www.facebook.com/profile.php?id=61579534023491", icon: "fab fa-facebook", color: "#1877F2", glow: "rgba(24,119,242,0.35)" },
    { href: "https://www.tiktok.com/@mesob85?_t=ZT-8yzttOuwr1r&_r=1", icon: "fab fa-tiktok", color: "#ffffff", glow: "rgba(255,255,255,0.15)" },
    { href: "https://www.instagram.com/mesobfinancial?igsh=eWNoNWNoaG45cHI0", icon: "fab fa-instagram", color: "#E4405F", glow: "rgba(228,64,95,0.35)" },
  ];

  const handleLogout = async () => {
    try {
      localStorage.clear();
      await signOut();
      navigate("/login");
    } catch (error) {
      console.error("Logout error:", error);
      navigate("/login");
    }
  };

  const handleAddTransactionClick = () => {
    if (subscriptionGateActive) {
      navigate(SUBSCRIPTION_ROUTE);
      return;
    }
    navigate("/customer/financial-report", {
      state: { openTransactionModal: true },
    });
  };

  const handleDownloadReportClick = () => {
    if (subscriptionGateActive) {
      navigate(SUBSCRIPTION_ROUTE);
      return;
    }
    if (location.pathname.includes("financial-report")) {
      // Financial-report page listens and opens its modal with full data
      window.dispatchEvent(new Event("mesob:downloadReport"));
    } else if (location.pathname.includes("dashboard")) {
      // Dashboard page listens and opens its modal with full data
      window.dispatchEvent(new Event("dashboard:downloadReport"));
    } else {
      // Other pages: open navbar modal (no report data available)
      setShowDownloadReportModal(true);
    }
  };

  const allRoutes = [...adminRoutes, ...customerRoutes];
  const getBrand = () => {
    let name;
    allRoutes.forEach((prop) => {
      if (prop.path === location.pathname) name = prop.name;
    });
    return name;
  };

  const openSidebar = () => {
    document.documentElement.classList.toggle("nav-open");
    sidebarToggle.current.classList.toggle("toggled");
  };

  const updateColor = () => {
    if (window.innerWidth < 993 && isOpen) {
      setColor("red");
    } else {
      setColor("transparent");
    }
  };

  useEffect(() => {
    window.addEventListener("resize", updateColor);
    return () => window.removeEventListener("resize", updateColor);
  }, [isOpen]);

  useEffect(() => {
    if (
      window.innerWidth < 993 &&
      document.documentElement.className.indexOf("nav-open") !== -1
    ) {
      document.documentElement.classList.toggle("nav-open");
      sidebarToggle.current.classList.toggle("toggled");
    }
  }, [location]);

  return (
    <>
      <Navbar
        color={location.pathname.indexOf("full-screen-maps") !== -1 ? "white" : color}
        expand="lg"
        className={
          location.pathname.indexOf("full-screen-maps") !== -1
            ? "navbar-absolute fixed-top"
            : "navbar-absolute fixed-top " +
              (color === "transparent" ? "navbar-transparent " : "")
        }
      >
        <Container fluid style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>

          {/* ── LEFT: Hamburger + Language Selector ── */}
          <div style={{ display: "flex", alignItems: "center", gap: "1rem" }}>
            <div className="navbar-toggle">
              <button
                type="button"
                ref={sidebarToggle}
                className={`navbar-toggler ${isOpen ? "open" : ""}`}
                onClick={openSidebar}
                style={{
                  border: "none",
                  background: "transparent",
                  padding: "8px",
                  cursor: "pointer",
                  display: "flex",
                  flexDirection: "column",
                  justifyContent: "center",
                  gap: "5px",
                }}
              >
                <span
                  className="navbar-toggler-bar bar1"
                  style={{
                    display: "block",
                    width: "28px",
                    height: "3px",
                    backgroundColor: "white",
                    margin: "4px 0",
                    transition: "0.3s ease-in-out",
                    transform: isOpen ? "translateY(8px) rotate(45deg)" : "none",
                  }}
                />
                <span
                  className="navbar-toggler-bar bar2"
                  style={{
                    display: isOpen ? "none" : "block",
                    width: "28px",
                    height: "3px",
                    backgroundColor: "white",
                    margin: "4px 0",
                    transition: "0.3s ease-in-out",
                  }}
                />
                <span
                  className="navbar-toggler-bar bar3"
                  style={{
                    display: "block",
                    width: "28px",
                    height: "3px",
                    backgroundColor: "white",
                    margin: "4px 0",
                    transition: "0.3s ease-in-out",
                    transform: isOpen ? "translateY(-8px) rotate(-45deg)" : "none",
                  }}
                />
              </button>
            </div>

            <div style={{ marginLeft: 8 }}>
              {!location.pathname.includes("/profile") && <LanguageSelector />}
            </div>

            <button
              type="button"
              onClick={toggleTheme}
              aria-label={theme === "dark" ? "Switch to light mode" : "Switch to dark mode"}
              title={theme === "dark" ? "Light mode" : "Dark mode"}
              style={{
                marginLeft: 8,
                width: 38,
                height: 38,
                display: "grid",
                placeItems: "center",
                borderRadius: "var(--r-sm, 8px)",
                cursor: "pointer",
                background: "var(--surface-3)",
                border: "1px solid var(--border)",
                color: "var(--text-2)",
                flex: "0 0 auto",
              }}
            >
              {theme === "dark" ? (
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
                  <circle cx="12" cy="12" r="4" />
                  <path d="M12 2v2M12 20v2M2 12h2M20 12h2M5 5l1.5 1.5M17.5 17.5L19 19M19 5l-1.5 1.5M6.5 17.5L5 19" />
                </svg>
              ) : (
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
                  <path d="M21 12.8A9 9 0 1111.2 3 7 7 0 0021 12.8z" />
                </svg>
              )}
            </button>

            {!isMobile && (
              <NavbarBrand href="/" style={{ marginLeft: "1rem" }}>
                {getBrand()}
              </NavbarBrand>
            )}
          </div>

          {/* ── CENTER: Company Name ── */}
          {companyName && (
            <div
              style={{
                position: "absolute",
                left: "50%",
                transform: "translateX(-50%)",
                textAlign: "center",
                pointerEvents: "none",
              }}
            >
              <h3
                style={{
                  color: "var(--text-1)",
                  margin: 0,
                  fontSize: "clamp(12px, 3vw, 18px)",
                  whiteSpace: "nowrap",
                  textOverflow: "ellipsis",
                  maxWidth: "200px",
                }}
              >
                {companyName}
              </h3>
            </div>
          )}

          {/* ── RIGHT: Action Buttons + Profile ── */}
          <div style={{ display: "flex", alignItems: "center", gap: "6px", flexShrink: 0 }}>

            {/* Download Report + Add Transaction — desktop & landscape only, dashboard pages only */}
            {showNavbarActionButtons && (
              <>
                <button
                  type="button"
                  onClick={handleDownloadReportClick}
                  title={
                    subscriptionGateActive
                      ? SUBSCRIPTION_UPDATE_HINT
                      : t("financialReport.downloadReport")
                  }
                  style={{
                    backgroundColor: "var(--surface-3)",
                    border: "1px solid var(--border-strong)",
                    color: "var(--text-1)",
                    height: "36px",
                    borderRadius: "var(--r-sm)",
                    padding: isLandscapeMobile ? "0 9px" : "0 13px",
                    display: "inline-flex",
                    alignItems: "center",
                    justifyContent: "center",
                    fontSize: "12px",
                    whiteSpace: "nowrap",
                    cursor: "pointer",
                    opacity: subscriptionGateActive ? 0.5 : 1,
                    flexShrink: 0,
                  }}
                >
                  <FontAwesomeIcon
                    icon={faDownload}
                    style={{ fontSize: "13px", marginRight: isLandscapeMobile ? 0 : "5px" }}
                  />
                  {!isLandscapeMobile && t("financialReport.downloadReport")}
                </button>

                {userRole !== 0 && (
                  <button
                    type="button"
                    onClick={handleAddTransactionClick}
                    title={
                      subscriptionGateActive
                        ? SUBSCRIPTION_UPDATE_HINT
                        : t("financialReport.addTransaction")
                    }
                    style={{
                      backgroundColor: "var(--accent-solid)",
                      border: "1px solid var(--accent-solid)",
                      color: "#ffffff",
                      height: "36px",
                      borderRadius: "var(--r-sm)",
                      padding: isLandscapeMobile ? "0 9px" : "0 13px",
                      display: "inline-flex",
                      alignItems: "center",
                      justifyContent: "center",
                      fontSize: "12px",
                      whiteSpace: "nowrap",
                      cursor: "pointer",
                      opacity: subscriptionGateActive ? 0.5 : 1,
                      flexShrink: 0,
                    }}
                  >
                    <FontAwesomeIcon
                      icon={faPlus}
                      style={{ fontSize: "13px", marginRight: isLandscapeMobile ? 0 : "5px" }}
                    />
                    {!isLandscapeMobile && t("financialReport.addTransaction")}
                  </button>
                )}
              </>
            )}

            {/* Profile Dropdown — always last */}
            <Nav navbar style={{ margin: 0, padding: 0 }}>
              <Dropdown
                nav
                isOpen={accountDropdownOpen}
                toggle={accountDropdownToggle}
                className="account-dropdown"
              >
                <DropdownToggle caret nav className="account-toggle">
                  <span className="account-avatar">
                    {(localStorage.getItem("user_name") || "U")
                      .trim()
                      .split(/\s+/)
                      .map((w) => w[0])
                      .slice(0, 2)
                      .join("")
                      .toUpperCase()}
                  </span>
                  {!isMobile && (
                    <span className="account-name">
                      {localStorage.getItem("user_name") || t("common.account", "Account")}
                    </span>
                  )}
                </DropdownToggle>
                <DropdownMenu right style={{ backgroundColor: "white" }}>
                  <DropdownItem onClick={toggleHelpModal}>
                    <i className="now-ui-icons ui-2_settings-90 mr-2" />
                    Help & Support
                  </DropdownItem>
                  <DropdownItem divider />
                  <DropdownItem onClick={handleLogout}>
                    <i className="now-ui-icons ui-1_simple-remove mr-2" />
                    Logout
                  </DropdownItem>
                </DropdownMenu>
              </Dropdown>
            </Nav>
          </div>

        </Container>
      </Navbar>

      {/* ── Download Report Modal (when triggered from navbar on non-financial-report pages) ── */}
      <DownloadReportModal
        isOpen={showDownloadReportModal}
        toggle={() => setShowDownloadReportModal(false)}
        companyName={companyName}
        items={[]}
        revenues={{}}
        expenses={{}}
        initialBalance={0}
        initialvalueableItems={0}
        initialoutstandingDebt={0}
        calculateTotalCash={() => "0.00"}
        calculateTotalRevenue={() => "0.00"}
        calculateTotalExpenses={() => "0.00"}
        calculateTotalPayable={() => "0.00"}
        calculateTotalInventory={() => "0.00"}
        searchedDates={null}
      />

      {/* ── Help & Support Modal ── */}
      <Modal
        isOpen={helpModalOpen}
        toggle={toggleHelpModal}
        centered
        modalClassName="dark-modal"
        contentClassName="bg-transparent border-0 shadow-none"
      >
        <ModalHeader
          toggle={toggleHelpModal}
          style={{
            background: "#111827",
            borderBottom: "1px solid #1e293b",
            borderRadius: "18px 18px 0 0",
            padding: "1.1rem 1.5rem",
          }}
        >
          <span style={{ color: "#ffffff", fontWeight: 700, fontSize: "1.1rem" }}>
            Help & Support
          </span>
        </ModalHeader>

        <ModalBody style={{ background: "#0d1117", padding: "2rem 1.75rem" }}>
          <p style={{ color: "#64748b", textAlign: "center", marginBottom: "2rem", fontSize: "0.9rem" }}>
            We're here to help! Reach out via any method below.
          </p>

          <div style={{ display: "flex", flexDirection: "column", gap: "1rem", marginBottom: "1.75rem" }}>
            {/* Phone */}
            <a href="tel:+16149665005" style={{ textDecoration: "none" }}>
              <div
                style={{ display: "flex", alignItems: "center", gap: "1rem", background: "rgba(30,41,59,0.6)", border: "1px solid rgba(59,130,246,0.15)", borderRadius: "12px", padding: "1rem 1.25rem", transition: "all 0.25s ease", cursor: "pointer" }}
                onMouseEnter={e => { e.currentTarget.style.border = "1px solid rgba(59,130,246,0.45)"; e.currentTarget.style.background = "rgba(59,130,246,0.08)"; }}
                onMouseLeave={e => { e.currentTarget.style.border = "1px solid rgba(59,130,246,0.15)"; e.currentTarget.style.background = "rgba(30,41,59,0.6)"; }}
              >
                <div style={{ width: "44px", height: "44px", flexShrink: 0, background: "linear-gradient(135deg,#3b82f6,#1d4ed8)", borderRadius: "12px", display: "flex", alignItems: "center", justifyContent: "center", boxShadow: "0 4px 14px rgba(59,130,246,0.3)" }}>
                  <i className="now-ui-icons tech_mobile" style={{ color: "#fff", fontSize: "18px" }} />
                </div>
                <div>
                  <p style={{ color: "#94a3b8", fontSize: "0.72rem", margin: 0, letterSpacing: "0.06em", textTransform: "uppercase" }}>Phone</p>
                  <p style={{ color: "#e2e8f0", fontWeight: 600, margin: 0, fontSize: "0.95rem" }}>+1 (614) 966-5005</p>
                </div>
              </div>
            </a>

            {/* Email */}
            <a href="mailto:info@meksova.com" style={{ textDecoration: "none" }}>
              <div
                style={{ display: "flex", alignItems: "center", gap: "1rem", background: "rgba(30,41,59,0.6)", border: "1px solid rgba(99,102,241,0.15)", borderRadius: "12px", padding: "1rem 1.25rem", transition: "all 0.25s ease", cursor: "pointer" }}
                onMouseEnter={e => { e.currentTarget.style.border = "1px solid rgba(99,102,241,0.45)"; e.currentTarget.style.background = "rgba(99,102,241,0.08)"; }}
                onMouseLeave={e => { e.currentTarget.style.border = "1px solid rgba(99,102,241,0.15)"; e.currentTarget.style.background = "rgba(30,41,59,0.6)"; }}
              >
                <div style={{ width: "44px", height: "44px", flexShrink: 0, background: "linear-gradient(135deg,#6366f1,#4338ca)", borderRadius: "12px", display: "flex", alignItems: "center", justifyContent: "center", boxShadow: "0 4px 14px rgba(99,102,241,0.3)" }}>
                  <i className="now-ui-icons ui-1_email-85" style={{ color: "#fff", fontSize: "18px" }} />
                </div>
                <div>
                  <p style={{ color: "#94a3b8", fontSize: "0.72rem", margin: 0, letterSpacing: "0.06em", textTransform: "uppercase" }}>Email</p>
                  <p style={{ color: "#e2e8f0", fontWeight: 600, margin: 0, fontSize: "0.95rem" }}>info@meksova.com</p>
                </div>
              </div>
            </a>
          </div>

          <div style={{ borderTop: "1px solid #1e293b", marginBottom: "1.5rem" }} />

          <p style={{ color: "#64748b", fontSize: "0.75rem", textAlign: "center", textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: "1rem" }}>
            Follow us on
          </p>

          <div style={{ display: "flex", justifyContent: "center", gap: "1rem" }}>
            {socialLinks.map((item) => (
              <a
                key={item.href}
                href={item.href}
                target="_blank"
                rel="noopener noreferrer"
                style={{ width: "46px", height: "46px", background: "rgba(30,41,59,0.7)", border: "1px solid #1e293b", borderRadius: "12px", display: "flex", alignItems: "center", justifyContent: "center", color: item.color, fontSize: "20px", transition: "all 0.25s ease", textDecoration: "none" }}
                onMouseEnter={e => { e.currentTarget.style.boxShadow = `0 4px 16px ${item.glow}`; e.currentTarget.style.borderColor = item.color; e.currentTarget.style.background = "rgba(30,41,59,1)"; }}
                onMouseLeave={e => { e.currentTarget.style.boxShadow = "none"; e.currentTarget.style.borderColor = "#1e293b"; e.currentTarget.style.background = "rgba(30,41,59,0.7)"; }}
              >
                <i className={item.icon} />
              </a>
            ))}
          </div>
        </ModalBody>

        <ModalFooter style={{ background: "#111827", borderTop: "1px solid #1e293b", borderRadius: "0 0 18px 18px", justifyContent: "center", padding: "0.875rem 1.5rem" }}>
          <button
            onClick={toggleHelpModal}
            style={{ background: "#1e293b", border: "1px solid #334155", borderRadius: "9px", color: "#94a3b8", padding: "8px 28px", fontSize: "0.875rem", cursor: "pointer", transition: "all 0.2s ease" }}
            onMouseEnter={e => { e.currentTarget.style.color = "#fff"; e.currentTarget.style.background = "#334155"; }}
            onMouseLeave={e => { e.currentTarget.style.color = "#94a3b8"; e.currentTarget.style.background = "#1e293b"; }}
          >
            Close
          </button>
        </ModalFooter>
      </Modal>
    </>
  );
}

export default DemoNavbar;