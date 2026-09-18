import React from "react";
import { NavLink, useLocation } from "react-router-dom";
import { Nav } from "reactstrap";
import PerfectScrollbar from "perfect-scrollbar";

const logo = "/thlogo.png";
var ps;

function Sidebar(props) {
  const sidebar = React.useRef();
  const location = useLocation();

  const activeRoute = (routeName) => {
    return location.pathname.indexOf(routeName) > -1 ? "active" : "";
  };

  React.useEffect(() => {
    if (navigator.platform.indexOf("Win") > -1) {
      ps = new PerfectScrollbar(sidebar.current, {
        suppressScrollX: true,
        suppressScrollY: false,
      });
    }
    return function cleanup() {
      if (navigator.platform.indexOf("Win") > -1) {
        ps.destroy();
      }
    };
  });

  return (
    <>
      <div className="sidebar" data-color={props.backgroundColor}>
        <div
          className="logo"
          style={{
            background: "#0b1220",
            padding: "14px 12px",
            borderRadius: "12px",
            margin: "6px 10px 10px",
            border: "1px solid rgba(255,255,255,0.06)",
          }}
        >
          <a
            href="#"
            className="simple-text logo-mini"
            style={{
              width: "100%",
              float: "none",
              margin: "0",
              display: "flex",
              justifyContent: "center",
              alignItems: "center",
            }}
          >
            <div className="logo-img">
              <img
                src={logo}
                alt="Meksova"
                style={{
                  height: "60px",
                  width: "auto",
                  maxWidth: "100%",
                  objectFit: "contain",
                  display: "block",
                }}
              />
            </div>
          </a>
        </div>
        <div className="sidebar-wrapper" ref={sidebar}>
          <Nav>
            {props.routes.map((prop, key) => {
              if (prop.redirect || prop.invisible) return null;
              return (
                <li
                  className={
                    activeRoute(prop.layout + prop.path) +
                    (prop.pro ? " active active-pro" : "")
                  }
                  key={key}
                >
                  <NavLink to={prop.layout + prop.path} className="nav-link">
                    <i className={"now-ui-icons " + prop.icon} />
                    <p>{prop.name}</p>
                  </NavLink>
                </li>
              );
            })}
          </Nav>
        </div>
      </div>
    </>
  );
}

export default Sidebar;