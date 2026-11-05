import React, { Suspense } from "react";
import { useLocation, Route, Routes, Navigate } from "react-router-dom";
import { Spinner } from "reactstrap";

// core components
import DemoNavbar from "components/Navbars/DemoNavbar";
import Footer from "components/Footer/Footer.js";
import Sidebar from "components/Sidebar/Sidebar";
import AppTabBar from "components/AppTabBar";
import PullToRefresh from "components/PullToRefresh";
import DriveSync from "components/DriveSync";
import AppSetup from "components/AppSetup";
import { isAppShell } from "utils/appShell";
import SiteGate from "components/SiteGate";
import PolicyGate from "components/PolicyGate";
import { useSiteConfig } from "utils/siteConfig";
import { currentRole, STAFF_ROLE } from "utils/staffAccess";

import { getCustomerRoutes } from "routes.js";

function CustomerLayout(props) {
  const location = useLocation();
  const mainPanelRef = React.useRef(null);
  // Subscribing re-renders the layout when the owner flips a feature switch.
  useSiteConfig();
  // Recompute per render so businessType/role set at login apply without a reload.
  const customerRoutes = getCustomerRoutes();
  const appShell = isAppShell();
  // Bumped by pull-to-refresh: remounts the current page so it refetches.
  const [refreshKey, setRefreshKey] = React.useState(0);
  const refresh = React.useCallback(() => setRefreshKey((k) => k + 1), []);

  React.useEffect(() => {
    document.documentElement.scrollTop = 0;
    document.scrollingElement.scrollTop = 0;
    if (mainPanelRef.current) {
      mainPanelRef.current.scrollTop = 0;
    }
  }, [location]);

  const getRoutes = (routes) => {
    return routes.map((prop, key) => {
      if (prop.layout === "/customer") {
        return <Route path={prop.path} element={prop.component} key={key} />;
      } else {
        return null;
      }
    });
  };

  // Phone app: never show signed-in screens to a signed-out user (they'd
  // just fill with "Failed to fetch" errors) — go to sign-in instead.
  if (appShell && !localStorage.getItem("user_email")) {
    return <Navigate to="/login" replace />;
  }
  if (currentRole() === STAFF_ROLE) {
    return <Navigate to="/admin/console" replace />;
  }

  return (
    <div className="wrapper">
      <Sidebar {...props} routes={customerRoutes} backgroundColor="blue" />
      <div className="main-panel" ref={mainPanelRef}>
        <DemoNavbar {...props} />
        <SiteGate>
          <Suspense
            fallback={
              <div style={{ display: "flex", justifyContent: "center", alignItems: "center", minHeight: "60vh" }}>
                <Spinner color="primary" />
              </div>
            }
          >
            <Routes key={refreshKey}>
              {getRoutes(customerRoutes)}
              <Route
                path="*"
                element={<Navigate to="/customer/dashboard" replace />}
              />
            </Routes>
          </Suspense>
          <PolicyGate />
        </SiteGate>
        {!appShell && <Footer fluid />}
      </div>
      {appShell && <AppTabBar routes={customerRoutes} />}
      {appShell && <DriveSync />}
      {appShell && <AppSetup />}
      {appShell && <PullToRefresh panelRef={mainPanelRef} onRefresh={refresh} />}
    </div>
  );
}

export default CustomerLayout;
