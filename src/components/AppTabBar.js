import React, { useCallback, useEffect, useRef, useState } from "react";
import { NavLink, useLocation } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { Modal } from "reactstrap";
import QuickScanReceipt from "components/QuickScanReceipt";
import { haptic } from "utils/haptics";
import { isTrucking } from "utils/mileageRate";
import { fuelCategory } from "utils/fuelStop";
import { businessTypes } from "views/BusinessTypes";
import { NavIcon } from "components/Sidebar/Sidebar";

const Icon = ({ children }) => (
  <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    {children}
  </svg>
);

const TABS = [
  {
    to: "/customer/dashboard",
    labelKey: "app.tabHome",
    icon: (
      <Icon>
        <path d="M3 10.5 12 3l9 7.5" />
        <path d="M5 9.5V21h14V9.5" />
        <path d="M10 21v-6h4v6" />
      </Icon>
    ),
  },
  {
    to: "/customer/financial-report",
    labelKey: "app.tabReport",
    icon: (
      <Icon>
        <path d="M4 20V10" />
        <path d="M10 20V4" />
        <path d="M16 20v-7" />
        <path d="M22 20H2" />
      </Icon>
    ),
  },
  { scan: true },
  {
    to: "/customer/mileage-tracker",
    labelKey: "app.tabMileage",
    icon: (
      <Icon>
        <path d="M12 21s-7-6.2-7-11.5a7 7 0 0 1 14 0C19 14.8 12 21 12 21z" />
        <circle cx="12" cy="9.5" r="2.5" />
      </Icon>
    ),
  },
];

// The website's sidebar drawer can still be open (e.g. from the navbar);
// its scrim closes it through the navbar's own toggle.
const toggleSidebar = () => {
  document.querySelector(".navbar-toggle .navbar-toggler")?.click();
};

const SWIPE_CLOSE_PX = 80;

// Drag the sheet down from its top (content scrolled to the top) to close it.
// Listens on the document: the modal mounts after the render that opens it.
function useSwipeToClose(open, close) {
  useEffect(() => {
    if (!open) return undefined;
    let dialog = null;
    let startY = null;
    let dy = 0;
    const onStart = (e) => {
      const content = e.target.closest?.(".mksv-more-sheet .modal-content");
      if (!content || content.scrollTop > 0) return;
      dialog = content.closest(".mksv-more-sheet");
      startY = e.touches[0].clientY;
      dy = 0;
      dialog.style.transition = "none";
    };
    const onMove = (e) => {
      if (startY === null) return;
      dy = Math.max(0, e.touches[0].clientY - startY);
      dialog.style.transform = `translateY(${dy}px)`;
    };
    const onEnd = () => {
      if (startY === null) return;
      startY = null;
      dialog.style.transition = "";
      dialog.style.transform = "";
      if (dy > SWIPE_CLOSE_PX) close();
    };
    document.addEventListener("touchstart", onStart, { passive: true });
    document.addEventListener("touchmove", onMove, { passive: true });
    document.addEventListener("touchend", onEnd);
    document.addEventListener("touchcancel", onEnd);
    return () => {
      document.removeEventListener("touchstart", onStart);
      document.removeEventListener("touchmove", onMove);
      document.removeEventListener("touchend", onEnd);
      document.removeEventListener("touchcancel", onEnd);
    };
  }, [open, close]);
}

/** Ask for the scan sheet (shortcut / fuel-stop notification). detail: { station } */
export const SCAN_REQUEST = "mksv-scan-request";

const AppTabBar = ({ routes = [] }) => {
  const { t } = useTranslation();
  const { pathname } = useLocation();
  const [moreOpen, setMoreOpen] = useState(false);
  const closeMore = useCallback(() => setMoreOpen(false), []);
  useSwipeToClose(moreOpen, closeMore);

  // Every sidebar page that isn't already a tab.
  const tabPaths = TABS.filter((tab) => tab.to).map((tab) => tab.to);
  const morePages = routes.filter(
    (r) => r.layout === "/customer" && !r.redirect && !r.invisible && !tabPaths.includes(r.layout + r.path)
  );
  const moreActive = morePages.some((r) => pathname.startsWith(r.layout + r.path));
  const openScan = useRef(null);
  const openNativeScan = useRef(null);
  // A notification's Scan / Upload button (detail.mode) opens the camera or
  // photo picker straight away; tapping the notification itself shows this
  // sheet so the user picks one.
  const [scanPrompt, setScanPrompt] = useState(null);

  const scanPromptBody = () => {
    if (scanPrompt?.station === undefined) return t("app.scanBody");
    if (scanPrompt.kind === "repair") return t("app.scanRepairBody");
    if (scanPrompt.kind === "store") return t("app.scanBody");
    if (isTrucking()) return t("app.scanFuelBody");
    const type = localStorage.getItem("businessType") || "";
    return fuelCategory(type, businessTypes[type]?.expenses || []) ? t("app.scanFuelBodyExpense") : t("app.scanBody");
  };

  useEffect(() => {
    const onRequest = (e) => {
      const detail = e.detail || {};
      if (detail.mode && openNativeScan.current) openNativeScan.current(detail.mode);
      else setScanPrompt(detail);
    };
    window.addEventListener(SCAN_REQUEST, onRequest);
    return () => window.removeEventListener(SCAN_REQUEST, onRequest);
  }, []);

  // Keyboard open: the WebView shrinks well below its full height. Hide the
  // bar so it doesn't ride up on top of the keyboard over the form. Compare
  // with the tallest height seen (reset on rotation), since Android resizes
  // the whole WebView rather than just the visual viewport.
  useEffect(() => {
    const vv = window.visualViewport;
    if (!vv) return undefined;
    let full = vv.height;
    const sync = () => {
      full = Math.max(full, vv.height);
      document.documentElement.classList.toggle("kb-open", full - vv.height > 150);
    };
    const onRotate = () => {
      full = 0;
      setTimeout(sync, 300);
    };
    vv.addEventListener("resize", sync);
    window.addEventListener("orientationchange", onRotate);
    return () => {
      vv.removeEventListener("resize", sync);
      window.removeEventListener("orientationchange", onRotate);
      document.documentElement.classList.remove("kb-open");
    };
  }, []);

  return (
    <>
    <button type="button" className="mksv-nav-scrim" tabIndex={-1} aria-hidden="true" onClick={toggleSidebar} />
    <nav className="mksv-tabbar" aria-label={t("app.tabBarLabel")}>
      {TABS.map((tab) =>
        tab.scan ? (
          <QuickScanReceipt
            key="scan"
            renderTrigger={({ open, openNative, busy }) => {
              openScan.current = open;
              openNativeScan.current = openNative;
              return (
              <button
                type="button"
                className="mksv-tab mksv-tab--scan"
                onClick={() => {
                  haptic("medium");
                  open();
                }}
                disabled={busy}
              >
                <span className="mksv-tab__scan-disc" aria-hidden="true">
                  <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z" />
                    <circle cx="12" cy="13" r="4" />
                  </svg>
                </span>
                <span className="mksv-tab__label">{t("app.tabScan")}</span>
              </button>
              );
            }}
          />
        ) : (
          <NavLink
            key={tab.to}
            to={tab.to}
            onClick={() => haptic("selection")}
            className={({ isActive }) => `mksv-tab${isActive ? " is-active" : ""}`}
          >
            {tab.icon}
            <span className="mksv-tab__label">{t(tab.labelKey)}</span>
          </NavLink>
        )
      )}
      <button
        type="button"
        className={`mksv-tab${moreActive || moreOpen ? " is-active" : ""}`}
        aria-haspopup="dialog"
        aria-expanded={moreOpen}
        onClick={() => {
          haptic("selection");
          setMoreOpen(true);
        }}
      >
        <Icon>
          <path d="M4 6h16" />
          <path d="M4 12h16" />
          <path d="M4 18h16" />
        </Icon>
        <span className="mksv-tab__label">{t("app.tabMore")}</span>
      </button>
    </nav>
    <Modal
      isOpen={moreOpen}
      toggle={closeMore}
      className="mksv-more-sheet"
      labelledBy="mksv-more-title"
      returnFocusAfterClose
    >
      <div className="mksv-sheet__head">
        <h2 id="mksv-more-title" className="mksv-sheet__title">{t("app.tabMore")}</h2>
        <button type="button" className="mksv-sheet__close" aria-label={t("app.cancel")} onClick={closeMore}>
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true">
            <path d="M6 6l12 12M18 6L6 18" />
          </svg>
        </button>
      </div>
      <ul className="mksv-more-grid">
        {morePages.map((r) => (
          <li key={r.path}>
            <NavLink
              to={r.layout + r.path}
              className={({ isActive }) => `mksv-more-tile${isActive ? " is-active" : ""}`}
              onClick={() => {
                haptic("selection");
                closeMore();
              }}
            >
              <NavIcon path={r.path} />
              <span className="mksv-more-tile__label">{r.nameKey ? t(r.nameKey, r.name) : r.name}</span>
              {r.badge && (
                <span className={`mksv-more-tile__badge${r.badgeTone === "soon" ? " mksv-more-tile__badge--soon" : ""}`}>
                  {t(r.badge)}
                </span>
              )}
            </NavLink>
          </li>
        ))}
      </ul>
    </Modal>
    <Modal isOpen={!!scanPrompt} toggle={() => setScanPrompt(null)} labelledBy="mksv-scan-prompt-title" className="mksv-confirm-sheet">
      <div className="mksv-confirm">
        <h2 id="mksv-scan-prompt-title" className="mksv-sheet__title">
          {scanPrompt?.station !== undefined
            ? scanPrompt.station
              ? t("app.scanFuelTitle", { station: scanPrompt.station })
              : scanPrompt.kind && scanPrompt.kind !== "fuel"
                ? t("app.scanTitle")
                : t("app.scanFuelTitleGeneric")
            : t("app.scanTitle")}
        </h2>
        <p className="mksv-confirm__body">{scanPromptBody()}</p>
        <button
          type="button"
          className="mksv-app-btn mksv-app-btn--primary"
          onClick={() => {
            setScanPrompt(null);
            (openNativeScan.current || openScan.current)?.("camera");
          }}
        >
          {t("app.scanTakePhoto")}
        </button>
        <button
          type="button"
          className="mksv-app-btn mksv-app-btn--secondary"
          onClick={() => {
            setScanPrompt(null);
            openNativeScan.current?.("upload");
          }}
        >
          {t("app.scanUpload")}
        </button>
        <button type="button" className="mksv-app-btn mksv-app-btn--ghost" onClick={() => setScanPrompt(null)}>
          {t("drives.disclosure.notNow")}
        </button>
      </div>
    </Modal>
    </>
  );
};

export default AppTabBar;
