import React, { useState, useEffect, useRef } from "react";
import {
  Route,
  Routes,
  Navigate,
  useLocation,
  useNavigate,
} from "react-router-dom";
import { useSelector } from "react-redux";
import PerfectScrollbar from "perfect-scrollbar";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faArrowUp } from "@fortawesome/free-solid-svg-icons";

// core components
import DemoNavbar from "components/Navbars/DemoNavbar.js";
import Footer from "components/Footer/Footer.js";
import Sidebar from "components/Sidebar/Sidebar.js";
import MesobFinancial2 from "views/mesobfinancial2";
import routes from "routes.js";
import Receipts from "views/Receipts";

var ps;

function Admin(props) {
  const location = useLocation();
  const navigate = useNavigate();
  const [backgroundColor, setBackgroundColor] = useState("blue");
  const [showGoToTop, setShowGoToTop] = useState(false);
  const mainPanel = useRef();
  const selectedUser = useSelector((state) => state.selectedUser);

  useEffect(() => {
    const userEmail = localStorage.getItem("user_email");
    if (!userEmail) {
      navigate("/login");
    }
  }, [navigate]);

  useEffect(() => {
    if (navigator.platform.indexOf("Win") > -1) {
      ps = new PerfectScrollbar(mainPanel.current, {
        suppressScrollX: true,
        suppressScrollY: false,
      });
      document.body.classList.toggle("perfect-scrollbar-on");
    }
    return function cleanup() {
      if (navigator.platform.indexOf("Win") > -1) {
        ps.destroy();
        document.body.classList.toggle("perfect-scrollbar-on");
      }
    };
  }, []);

  useEffect(() => {
    document.documentElement.scrollTop = 0;
    document.scrollingElement.scrollTop = 0;
    mainPanel.current.scrollTop = 0;
  }, [location]);

  useEffect(() => {
    const handleScroll = () => {
      const scrollTop = mainPanel.current.scrollTop;
      setShowGoToTop(scrollTop > 200);
    };

    const panel = mainPanel.current;
    panel.addEventListener("scroll", handleScroll);

    return () => {
      panel.removeEventListener("scroll", handleScroll);
    };
  }, []);

  const scrollToTop = () => {
    const scrollStep = -mainPanel.current.scrollTop / (500 / 15);
    const scrollInterval = setInterval(() => {
      if (mainPanel.current.scrollTop !== 0) {
        mainPanel.current.scrollBy(0, scrollStep);
      } else {
        clearInterval(scrollInterval);
      }
    }, 15);
  };

  return (
    <div className="wrapper">
      <Sidebar {...props} routes={routes} backgroundColor={backgroundColor} />
      <div
        className="main-panel"
        ref={mainPanel}
        style={{ height: "100vh", overflow: "auto" }}
      >
        <DemoNavbar {...props} />
        <Routes>
          {routes.map((prop, key) => {
            if (prop.path === "/MesobFinancial2") {
              return (
                <Route
                  path={prop.path}
                  element={<MesobFinancial2 selectedUser={selectedUser} />}
                  key={key}
                  exact
                />
              );
            }
            if (prop.path === "/receipts") {
              return (
                <Route
                  path={prop.path}
                  element={<Receipts selectedUser={selectedUser} />}
                  key={key}
                  exact
                />
              );
            }
            return (
              <Route
                path={prop.path}
                element={prop.component}
                key={key}
                exact
              />
            );
          })}
          <Route
            path="/admin"
            element={<Navigate to="/admin/dashboard" replace />}
          />
        </Routes>
        <Footer fluid />
        {showGoToTop && (
          <button
            className="go-to-top"
            onClick={scrollToTop}
            style={{
              position: "fixed",
              bottom: "20px",
              right: "20px",
              opacity: 1,
              transition: "opacity 0.3s ease-in-out",
              backgroundColor: "#007bff",
              color: "var(--text-1)",
              border: "none",
              borderRadius: "50%",
              width: "50px",
              height: "50px",
              fontSize: "20px",
              cursor: "pointer",
              boxShadow: "0 2px 5px rgba(0,0,0,0.3)",
              zIndex: 1000,
            }}
            title="Scroll to top of page"
          >
            <FontAwesomeIcon icon={faArrowUp} />
          </button>
        )}
      </div>
    </div>
  );
}

export default Admin;
