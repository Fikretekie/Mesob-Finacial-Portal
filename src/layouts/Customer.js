import React from "react";
import { useLocation, Route, Routes, Navigate } from "react-router-dom";

// core components
import DemoNavbar from "components/Navbars/DemoNavbar";
import Footer from "components/Footer/Footer.js";
import Sidebar from "components/Sidebar/Sidebar";

import { getCustomerRoutes } from "routes.js";

function CustomerLayout(props) {
  const location = useLocation();
  const mainPanelRef = React.useRef(null);
  // Recompute per render so businessType/role set at login apply without a reload.
  const customerRoutes = getCustomerRoutes();

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

  return (
    <div className="wrapper">
      <Sidebar {...props} routes={customerRoutes} backgroundColor="blue" />
      <div className="main-panel" ref={mainPanelRef}>
        <DemoNavbar {...props} />
        <div >
          <Routes>
            {getRoutes(customerRoutes)}
            <Route
              path="*"
              element={<Navigate to="/customer/dashboard" replace />}
            />
          </Routes>
        </div>
        <Footer fluid />
      </div>
    </div>
  );
}

export default CustomerLayout;
