import React from "react";
import { Link, useLocation } from "react-router-dom";
import { Nav } from "reactstrap";
import { useTranslation } from "react-i18next";
import PerfectScrollbar from "perfect-scrollbar";
import { useConsoleAccess } from "utils/staffAccess";
import { SECTIONS, visibleSections, SectionIcon, localize } from "views/admin/consoleNav";
import useBadges from "views/admin/useBadges";

const logo = "/thlogo.png";
let ps;

/** Admin-side sidebar: the console's own sections, never the customer app's pages. */
export default function ConsoleSidebar({ backgroundColor }) {
  const ref = React.useRef();
  const location = useLocation();
  const access = useConsoleAccess();
  const { t } = useTranslation();
  const visible = visibleSections(access);
  const badges = useBadges(visible.length > 0);

  const params = new URLSearchParams(location.search);
  const onConsole = location.pathname === "/admin/console";
  const current = onConsole ? (visible.some((s) => s.id === params.get("tab")) ? params.get("tab") : visible[0]?.id) : null;

  React.useEffect(() => {
    if (navigator.platform.indexOf("Win") > -1) {
      ps = new PerfectScrollbar(ref.current, { suppressScrollX: true, suppressScrollY: false });
    }
    return () => {
      if (navigator.platform.indexOf("Win") > -1 && ps) ps.destroy();
    };
  }, []);

  const badgeFor = (id) => {
    if (id === "support" && badges.support) return { n: badges.support, warn: !badges.supportOverdue };
    if (id === "requests" && badges.requests) return { n: badges.requests };
    if (id === "approvals" && badges.approvals) return { n: badges.approvals };
    if (id === "health" && badges.health) return { n: badges.health, warn: true };
    if (id === "issues" && badges.issues) return { n: badges.issues };
    return null;
  };

  return (
    <div className="sidebar console-sidebar" data-color={backgroundColor}>
      <div className="logo console-sidebar__logo">
        <Link to="/admin/console" className="simple-text logo-mini console-sidebar__brand">
          <div className="logo-img">
            <img src={logo} alt="Meksova" />
          </div>
        </Link>
        <span className="console-sidebar__tag mono">{access.isOwner ? t("console.common.ownerConsole", "Owner console") : t("console.common.staffConsole", "Staff console")}</span>
      </div>
      <div className="sidebar-wrapper" ref={ref}>
        <Nav>
          {SECTIONS.map((g) => {
            const items = g.items.filter((i) => visible.some((v) => v.id === i.id));
            if (!items.length) return null;
            return (
              <React.Fragment key={g.group}>
                <li className="console-sidebar__group" aria-hidden="true">{t(`console.groups.${g.group}`, g.group)}</li>
                {items.map((s) => {
                  const b = badgeFor(s.id);
                  return (
                    <li key={s.id} className={current === s.id ? "active" : ""}>
                      <Link to={s.id === visible[0]?.id ? "/admin/console" : `/admin/console?tab=${s.id}`} className="nav-link" aria-current={current === s.id ? "page" : undefined}>
                        <SectionIcon id={s.id} />
                        <p>{localize(t, s).label}</p>
                        {b && <span className={`nav-badge console-sidebar__badge${b.warn ? " is-warn" : ""}`}>{b.n}</span>}
                      </Link>
                    </li>
                  );
                })}
              </React.Fragment>
            );
          })}
        </Nav>
      </div>
    </div>
  );
}
