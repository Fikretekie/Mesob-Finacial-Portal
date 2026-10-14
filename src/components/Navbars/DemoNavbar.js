import React, { useState, useEffect } from "react";
import { useDispatch, useSelector } from "react-redux";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { can } from "utils/permissions";
import {
  Navbar,
  Nav,
  Dropdown,
  DropdownToggle,
  DropdownMenu,
  DropdownItem,
  Container,
} from "reactstrap";
import axios from "axios";
import { apiUrl, ROUTES } from "../../config/api";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faPlus, faDownload } from "@fortawesome/free-solid-svg-icons";

import { setCurrency } from "store/currencySlice";
import { signOut } from "aws-amplify/auth";
import { useTranslation } from "react-i18next";
import LanguageSelector from "components/Languageselector/LanguageSelector";
import DownloadReportModal from "components/DownloadReportModal";
import BusinessSwitcher from "components/BusinessSwitcher";

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
    userRole === 1 || localStorage.getItem("isTeamMember") === "true"
      ? false
      : !userSubscription && !isTrialActive();

  const SUBSCRIPTION_ROUTE = "/customer/subscription";
  const SUBSCRIPTION_UPDATE_HINT = t("navbar.subscriptionUpdateNeeded");

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
        <Container fluid style={{ display: "flex", flexWrap: "nowrap", alignItems: "center", justifyContent: "space-between" }}>

          {/* ── LEFT: Hamburger + Language Selector ── */}
          <div style={{ display: "flex", flexWrap: "nowrap", alignItems: "center", gap: "1rem", flexShrink: 0 }}>
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
                    backgroundColor: "var(--text-1)",
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
                    backgroundColor: "var(--text-1)",
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
                    backgroundColor: "var(--text-1)",
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
              aria-label={theme === "dark" ? t("navbar.switchToLight") : t("navbar.switchToDark")}
              title={theme === "dark" ? t("navbar.lightMode") : t("navbar.darkMode")}
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

            {/* Page name intentionally not shown here: every page renders its
                own H1 and the sidebar marks the active route, so a navbar brand
                was a third, redundant copy of the title. */}
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
          <div style={{ display: "flex", flexWrap: "nowrap", alignItems: "center", gap: "6px", flexShrink: 0 }}>

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

                {userRole !== 0 && can("add") && (
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

            <BusinessSwitcher />

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
                <DropdownMenu end style={{ maxWidth: "calc(100vw - 16px)" }}>
                  <DropdownItem onClick={() => navigate(userRole === 1 ? "/admin/profile" : "/customer/profile")}>
                    <svg className="nav-ico" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" /><circle cx="12" cy="7" r="4" /></svg>
                    {t("nav.account", "Account")}
                  </DropdownItem>
                  <DropdownItem divider />
                  <DropdownItem onClick={handleLogout}>
                    <svg className="nav-ico" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" /><polyline points="16 17 21 12 16 7" /><line x1="21" y1="12" x2="9" y2="12" /></svg>
                    {t("navbar.logout")}
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

    </>
  );
}

export default DemoNavbar;
