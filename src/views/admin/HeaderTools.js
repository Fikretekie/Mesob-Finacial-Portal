import React, { useEffect, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { getData, putData } from "utils/adminData";
import { listStaff } from "utils/adminApi";
import { relTime } from "./shared";

/** One box that finds anything: customers, tickets, articles, codes, staff, rules, pages. */
export function GlobalSearch({ rows, sections, onPick }) {
  const { t } = useTranslation();
  const [q, setQ] = useState("");
  const [open, setOpen] = useState(false);
  const [extra, setExtra] = useState(null);
  const [active, setActive] = useState(0);
  const inputRef = useRef(null);
  const boxRef = useRef(null);

  useEffect(() => {
    const onKey = (e) => {
      const typing = /input|textarea|select/i.test(document.activeElement?.tagName || "");
      if ((e.key === "k" && (e.ctrlKey || e.metaKey)) || (e.key === "/" && !typing)) {
        e.preventDefault();
        inputRef.current?.focus();
      }
    };
    const onDown = (e) => {
      if (boxRef.current && !boxRef.current.contains(e.target)) setOpen(false);
    };
    window.addEventListener("keydown", onKey);
    document.addEventListener("mousedown", onDown);
    return () => {
      window.removeEventListener("keydown", onKey);
      document.removeEventListener("mousedown", onDown);
    };
  }, []);

  // Loaded up front (and refreshed on any change) so results are there the
  // moment someone starts typing.
  useEffect(() => {
    const load = () =>
      Promise.all([getData("tickets"), getData("articles"), getData("promos"), getData("rules"), listStaff().catch(() => ({ staff: [] }))]).then(([t, a, p, r, s]) =>
        setExtra({ tickets: t.data || [], articles: a.data || [], promos: p.data || [], rules: r.data || [], staff: s.staff || [] })
      );
    load();
    window.addEventListener("oc:data", load);
    return () => window.removeEventListener("oc:data", load);
  }, []);

  const results = useMemo(() => {
    const term = q.trim().toLowerCase();
    if (!term) return [];
    const hit = (...vals) => vals.some((v) => String(v || "").toLowerCase().includes(term));
    const out = [];
    const allow = (tab) => sections.some((s) => s.id === tab);
    sections.filter((s) => hit(s.label, s.purpose)).slice(0, 3).forEach((s) => out.push({ kind: "Page", label: s.label, sub: s.purpose, tab: s.id }));
    if (allow("users")) rows.filter((r) => hit(r.name, r.email, r.phone, r.id, r.company)).slice(0, 6).forEach((r) => out.push({ kind: "Customer", label: r.name || r.email, sub: r.email, tab: "users", id: r.id }));
    if (extra) {
      if (allow("support")) extra.tickets.filter((t) => hit(t.subject, t.name, t.email, t.messages.map((m) => m.text).join(" "))).slice(0, 4).forEach((t) => out.push({ kind: "Ticket", label: t.subject, sub: `${t.name} · ${t.status}`, tab: "support", id: t.id }));
      if (allow("articles")) extra.articles.filter((a) => hit(a.title, a.category, a.body)).slice(0, 3).forEach((a) => out.push({ kind: "Article", label: a.title, sub: a.category, tab: "articles", id: a.id }));
      if (allow("promos")) extra.promos.filter((p) => hit(p.code)).slice(0, 3).forEach((p) => out.push({ kind: "Promo code", label: p.code, sub: p.active ? "active" : "off", tab: "promos" }));
      if (allow("staff")) extra.staff.filter((s) => hit(s.name, s.email)).slice(0, 3).forEach((s) => out.push({ kind: "Staff", label: s.name || s.email, sub: s.email, tab: "staff" }));
      if (allow("rules")) extra.rules.filter((r) => hit(r.name)).slice(0, 3).forEach((r) => out.push({ kind: "Rule", label: r.name, sub: r.enabled ? "on" : "off", tab: "rules", id: r.id }));
    }
    return out;
  }, [q, rows, extra, sections]);

  useEffect(() => setActive(0), [q]);

  const pick = (r) => {
    setOpen(false);
    setQ("");
    inputRef.current?.blur();
    onPick(r);
  };

  const onKeyDown = (e) => {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setActive((i) => Math.min(results.length - 1, i + 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActive((i) => Math.max(0, i - 1));
    } else if (e.key === "Enter" && results[active]) {
      e.preventDefault();
      pick(results[active]);
    } else if (e.key === "Escape") {
      setOpen(false);
      inputRef.current?.blur();
    }
  };

  const showList = open && q.trim();

  return (
    <div className="oc-search-box" ref={boxRef}>
      <input
        ref={inputRef}
        className="oc-input oc-search-box__input"
        type="search"
        role="combobox"
        aria-expanded={Boolean(showList)}
        aria-controls="oc-search-results"
        aria-activedescendant={showList && results[active] ? `oc-sr-${active}` : undefined}
        aria-label="Search the console"
        placeholder={t("console.common.search", "Search anything…  Ctrl K")}
        value={q}
        onFocus={() => setOpen(true)}
        onChange={(e) => {
          setQ(e.target.value);
          setOpen(true);
        }}
        onKeyDown={onKeyDown}
      />
      {showList && (
        <ul id="oc-search-results" className="oc-search-box__list" role="listbox">
          {results.length === 0 ? (
            <li className="oc-search-box__empty">{t("console.common.noMatches", "No matches for")} “{q}”.</li>
          ) : (
            results.map((r, i) => (
              <li key={`${r.kind}-${r.label}-${i}`} id={`oc-sr-${i}`} role="option" aria-selected={i === active} className={`oc-search-box__item${i === active ? " is-on" : ""}`} onMouseDown={(e) => e.preventDefault()} onClick={() => pick(r)} onMouseEnter={() => setActive(i)}>
                <span className="oc-search-box__kind mono">{r.kind}</span>
                <span className="oc-search-box__label">{r.label}</span>
                <span className="oc-search-box__sub">{r.sub}</span>
              </li>
            ))
          )}
        </ul>
      )}
    </div>
  );
}

/** Bell with what happened while you were away; each alert jumps to where you fix it. */
export function AlertsBell({ sections, onPick }) {
  const { t } = useTranslation();
  const [items, setItems] = useState([]);
  const [open, setOpen] = useState(false);
  const ref = useRef(null);

  const load = () => getData("notifications").then((r) => setItems(r.data || []));
  useEffect(() => {
    load();
    window.addEventListener("oc:data", load);
    const onDown = (e) => {
      if (ref.current && !ref.current.contains(e.target)) setOpen(false);
    };
    document.addEventListener("mousedown", onDown);
    return () => {
      window.removeEventListener("oc:data", load);
      document.removeEventListener("mousedown", onDown);
    };
  }, []);

  const visible = items.filter((n) => sections.some((s) => s.id === n.tab));
  const unread = visible.filter((n) => !n.read).length;

  const markAll = async () => {
    await Promise.all(visible.filter((n) => !n.read).map((n) => putData("notifications", { ...n, read: true })));
  };
  const openOne = async (n) => {
    setOpen(false);
    if (!n.read) await putData("notifications", { ...n, read: true });
    onPick({ tab: n.tab });
  };

  return (
    <div className="oc-bell" ref={ref} onKeyDown={(e) => e.key === "Escape" && setOpen(false)}>
      <button type="button" className="oc-icon-btn oc-bell__btn" aria-label={`Alerts, ${unread} unread`} aria-expanded={open} onClick={() => setOpen((o) => !o)}>
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9" />
          <path d="M13.73 21a2 2 0 0 1-3.46 0" />
        </svg>
        {unread > 0 && <span className="oc-bell__n mono">{unread}</span>}
      </button>
      {open && (
        <div className="oc-bell__panel" role="dialog" aria-label="Alerts">
          <div className="oc-bell__head">
            <span className="oc-card__title">{t("console.common.alerts", "Alerts")}</span>
            {unread > 0 && <button type="button" className="oc-link-btn" onClick={markAll}>{t("console.common.markAllRead", "Mark all read")}</button>}
          </div>
          {visible.length === 0 ? (
            <p className="oc-empty">{t("console.common.caughtUp", "You're all caught up.")}</p>
          ) : (
            <ul className="oc-bell__list">
              {visible.map((n) => (
                <li key={n.id}>
                  <button type="button" className={`oc-bell__item${n.read ? "" : " is-unread"}`} onClick={() => openOne(n)}>
                    <span className="oc-bell__text">{n.text}</span>
                    <span className="oc-bell__at mono">{relTime(n.at)}</span>
                  </button>
                </li>
              ))}
            </ul>
          )}
          {sections.some((s) => s.id === "alerts") && (
            <button type="button" className="oc-link-btn oc-bell__settings" onClick={() => { setOpen(false); onPick({ tab: "alerts" }); }}>
              {t("console.common.alertSettings", "Alert settings")} ›
            </button>
          )}
        </div>
      )}
    </div>
  );
}
