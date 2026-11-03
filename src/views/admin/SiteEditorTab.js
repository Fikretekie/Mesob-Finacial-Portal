import React, { useCallback, useEffect, useMemo, useState } from "react";
import { getData, putData } from "utils/adminData";
import { submitOrRun } from "utils/approvals";
import { useAccess } from "utils/staffAccess";
import { SECTION_TYPES, newSection, splitLines } from "utils/siteContent";
import { Confirm, Drawer, Notice, fmtDateTime } from "./shared";

const DEVICES = [
  { id: "desktop", label: "Desktop", width: "100%" },
  { id: "tablet", label: "Tablet", width: "768px" },
  { id: "phone", label: "Phone", width: "375px" },
];
const FONTS = ["Inter", "Manrope", "Poppins", "DM Sans", "Fraunces"];

/* --------------------------------------------------------- renderers -- */

function Btn({ text, primary, theme }) {
  if (!text) return null;
  return <span className={`se-btn${primary ? " se-btn--primary" : ""}`} style={primary ? { "--brand": theme.brand } : undefined}>{text}</span>;
}

function SectionView({ s, theme }) {
  const f = s.fields;
  switch (s.type) {
    case "hero":
      return (
        <div className="se-hero">
          {f.eyebrow && <p className="se-eyebrow">{f.eyebrow}</p>}
          <h1 className="se-h1">{f.title}</h1>
          {f.subtitle && <p className="se-lead">{f.subtitle}</p>}
          <div className="se-row">
            <Btn text={f.primaryText} primary theme={theme} />
            <Btn text={f.secondaryText} theme={theme} />
          </div>
          {f.image && <img className="se-img" src={f.image} alt="" />}
        </div>
      );
    case "features":
      return (
        <div>
          {f.title && <h2 className="se-h2">{f.title}</h2>}
          <div className="se-grid">
            {splitLines(f.items).map(([t, d], i) => (
              <div key={i} className="se-card">
                <span className="se-dot" style={{ "--brand": theme.brand }} />
                <b>{t}</b>
                {d && <p>{d}</p>}
              </div>
            ))}
          </div>
        </div>
      );
    case "pricing":
      return (
        <div className="se-pricing">
          {f.title && <h2 className="se-h2">{f.title}</h2>}
          <div className="se-price-card">
            <p className="se-price">{f.monthly}</p>
            {f.yearly && <p className="se-muted">or {f.yearly}</p>}
            <ul>
              {splitLines(f.bullets).map(([b], i) => <li key={i}>{b}</li>)}
            </ul>
            <Btn text={f.buttonText} primary theme={theme} />
            {f.note && <p className="se-muted se-small">{f.note}</p>}
          </div>
        </div>
      );
    case "testimonials":
      return (
        <div>
          {f.title && <h2 className="se-h2">{f.title}</h2>}
          <div className="se-grid">
            {splitLines(f.items).map(([q, who], i) => (
              <figure key={i} className="se-card">
                <blockquote>“{q}”</blockquote>
                {who && <figcaption className="se-muted">{who}</figcaption>}
              </figure>
            ))}
          </div>
        </div>
      );
    case "faq":
      return (
        <div>
          {f.title && <h2 className="se-h2">{f.title}</h2>}
          {splitLines(f.items).map(([q, a], i) => (
            <details key={i} className="se-faq" open={i === 0}>
              <summary>{q}</summary>
              {a && <p>{a}</p>}
            </details>
          ))}
        </div>
      );
    case "cta":
      return (
        <div className="se-cta" style={{ "--brand": theme.brand }}>
          <h2 className="se-h2">{f.title}</h2>
          {f.text && <p className="se-lead">{f.text}</p>}
          <Btn text={f.buttonText} primary theme={theme} />
        </div>
      );
    case "stats":
      return (
        <div className="se-stats">
          {splitLines(f.items).map(([n, l], i) => (
            <div key={i}>
              <b>{n}</b>
              <span className="se-muted">{l}</span>
            </div>
          ))}
        </div>
      );
    default:
      return (
        <div>
          {f.title && <h2 className="se-h2">{f.title}</h2>}
          {f.body && <p className="se-lead">{f.body}</p>}
        </div>
      );
  }
}

/* --------------------------------------------------------------- tab -- */

export default function SiteEditorTab() {
  const access = useAccess();
  const [saved, setSaved] = useState(null);
  const [doc, setDoc] = useState(null);
  const [source, setSource] = useState(null);
  const [pageId, setPageId] = useState("home");
  const [selId, setSelId] = useState(null);
  const [device, setDevice] = useState("desktop");
  const [panel, setPanel] = useState("section");
  const [history, setHistory] = useState([]);
  const [busy, setBusy] = useState(false);
  const [flash, setFlash] = useState(null);
  const [versions, setVersions] = useState(false);
  const [restore, setRestore] = useState(null);
  const [adding, setAdding] = useState(false);

  const load = useCallback(async () => {
    const r = await getData("siteContent");
    setSaved(r.data);
    setDoc(r.data ? JSON.parse(JSON.stringify(r.data)) : null);
    setSource(r.source);
    setHistory([]);
  }, []);
  useEffect(() => {
    load();
  }, [load]);

  const page = doc?.pages.find((p) => p.id === pageId);
  const sel = page?.sections.find((s) => s.id === selId) || null;
  const dirty = useMemo(() => saved && doc && JSON.stringify(saved) !== JSON.stringify(doc), [saved, doc]);

  // Every edit goes through here so Undo can step back.
  const change = (fn) =>
    setDoc((d) => {
      setHistory((h) => [...h.slice(-30), d]);
      const next = JSON.parse(JSON.stringify(d));
      fn(next);
      return next;
    });
  const undo = () =>
    setHistory((h) => {
      if (!h.length) return h;
      setDoc(h[h.length - 1]);
      return h.slice(0, -1);
    });

  const editPage = (fn) => change((d) => fn(d.pages.find((p) => p.id === pageId)));
  const setField = (k, v) => editPage((p) => { p.sections.find((s) => s.id === selId).fields[k] = v; });
  const move = (id, dir) =>
    editPage((p) => {
      const i = p.sections.findIndex((s) => s.id === id);
      const j = i + dir;
      if (j < 0 || j >= p.sections.length) return;
      [p.sections[i], p.sections[j]] = [p.sections[j], p.sections[i]];
    });
  const toggleVis = (id) => editPage((p) => { const s = p.sections.find((x) => x.id === id); s.visible = !s.visible; });
  const remove = (id) => {
    editPage((p) => { p.sections = p.sections.filter((s) => s.id !== id); });
    setSelId(null);
  };
  const add = (type) => {
    const s = newSection(type);
    editPage((p) => { p.sections.push(s); });
    setSelId(s.id);
    setPanel("section");
    setAdding(false);
  };

  const publish = async () => {
    setBusy(true);
    setFlash(null);
    try {
      const stamp = { id: `v${Date.now()}`, at: new Date().toISOString(), by: localStorage.getItem("user_email") || "owner", note: `Edited ${page.name}`, snapshot: { theme: doc.theme, pages: doc.pages } };
      const next = { ...doc, publishedAt: stamp.at, publishedBy: stamp.by, versions: [stamp, ...(doc.versions || [])].slice(0, 20) };
      const res = await submitOrRun("site.publish", access, { summary: `Publish website/app content (${page.name})`, payload: {} }, () =>
        putData("siteContent", next, { action: "content.publish", target: page.name, detail: `${page.surface} · ${page.path}` })
      );
      if (res.pending) setFlash({ tone: "amber", text: "Sent to the owner for approval." });
      else {
        setFlash({ tone: "green", text: "Published. The website and app show the new content on their next load." });
        await load();
      }
    } catch (e) {
      setFlash({ tone: e.notConnected ? "amber" : "red", text: e.notConnected ? `${e.message}. Nothing went live — this needs the AdminData/siteContent route and the website reading from it.` : e.message });
    } finally {
      setBusy(false);
    }
  };

  if (!doc && source !== "offline") return <div className="oc-card"><div className="oc-skel oc-skel--block" /></div>;
  if (!doc) return <Notice>The Site editor isn't connected yet. It needs the AdminData/siteContent route, and the website (meksova.com) and app screens need to read their text from it.</Notice>;

  const surfaces = [
    ["website", "Website"],
    ["app", "App screens"],
  ];

  return (
    <>
      <div className="se-toolbar">
        <div className="oc-seg" role="radiogroup" aria-label="Preview size">
          {DEVICES.map((d) => (
            <button key={d.id} type="button" role="radio" aria-checked={device === d.id} className={`oc-seg__opt${device === d.id ? " is-on" : ""}`} onClick={() => setDevice(d.id)}>
              {d.label}
            </button>
          ))}
        </div>
        <span className="oc-muted se-toolbar__status">
          {dirty ? "Unpublished changes" : `Live · published ${fmtDateTime(new Date(doc.publishedAt))} by ${doc.publishedBy}`}
        </span>
        <div className="se-toolbar__actions">
          <button type="button" className="oc-btn oc-btn--ghost" onClick={undo} disabled={!history.length}>Undo</button>
          <button type="button" className="oc-btn oc-btn--ghost" onClick={() => setVersions(true)}>Versions</button>
          <a className="oc-btn oc-btn--ghost oc-btn--link" href={page.surface === "website" ? `https://meksova.com${page.path}` : page.path} target="_blank" rel="noopener noreferrer">Open live ↗</a>
          <button type="button" className="oc-btn" onClick={publish} disabled={!dirty || busy}>{busy ? "Publishing…" : "Publish"}</button>
        </div>
      </div>
      {flash && <div className={`oc-flash oc-edge--${flash.tone}`} role="status">{flash.text}</div>}

      <div className="se-layout">
        <nav className="oc-card se-pages" aria-label="Pages">
          {surfaces.map(([sid, label]) => (
            <div key={sid} className="se-pages__group">
              <span className="oc-sec__title">{label}</span>
              {doc.pages.filter((p) => p.surface === sid).map((p) => (
                <button key={p.id} type="button" className={`se-pages__item${p.id === pageId ? " is-on" : ""}`} aria-current={p.id === pageId ? "page" : undefined} onClick={() => { setPageId(p.id); setSelId(null); }}>
                  <span>{p.name}</span>
                  <span className="mono se-pages__path">{p.path}</span>
                </button>
              ))}
            </div>
          ))}
          <button type="button" className={`se-pages__item se-pages__theme${panel === "theme" ? " is-on" : ""}`} onClick={() => setPanel("theme")}>
            <span>Theme &amp; brand</span>
            <span className="se-swatch" style={{ "--brand": doc.theme.brand }} aria-hidden="true" />
          </button>
        </nav>

        <div className="se-stage">
          <div className="se-frame" style={{ "--frame-w": DEVICES.find((d) => d.id === device).width, "--brand": doc.theme.brand, "--se-font": `"${doc.theme.headingFont}", var(--font-sans)`, "--se-radius": doc.theme.radius === "square" ? "4px" : doc.theme.radius === "pill" ? "999px" : "12px" }}>
            <div className="se-browserbar" aria-hidden="true">
              <span className="se-dotrow"><i /><i /><i /></span>
              <span className="se-url mono">{page.surface === "website" ? `meksova.com${page.path}` : `app.meksova.com${page.path}`}</span>
            </div>
            <div className="se-canvas">
              {page.sections.map((s) => (
                <button
                  key={s.id}
                  type="button"
                  className={`se-section${s.id === selId ? " is-sel" : ""}${s.visible ? "" : " is-hidden"}`}
                  onClick={() => { setSelId(s.id); setPanel("section"); }}
                  aria-label={`Edit ${SECTION_TYPES[s.type].label}`}
                >
                  <span className="se-section__tag mono">{SECTION_TYPES[s.type].label}{s.visible ? "" : " · hidden"}</span>
                  <SectionView s={s} theme={doc.theme} />
                </button>
              ))}
              {page.sections.length === 0 && <p className="se-empty">This page is empty. Add a section →</p>}
            </div>
          </div>
        </div>

        <aside className="oc-card se-inspector" aria-label="Inspector">
          {panel === "theme" ? (
            <>
              <h3 className="oc-card__title">Theme &amp; brand</h3>
              <p className="oc-muted">Applies to every page of the website and the app screens.</p>
              <label className="oc-field">
                <span className="oc-field__label">Brand colour</span>
                <span className="oc-inline oc-inline--tight">
                  <input type="color" className="se-color" value={doc.theme.brand} onChange={(e) => change((d) => { d.theme.brand = e.target.value; })} aria-label="Pick brand colour" />
                  <input className="oc-input mono" value={doc.theme.brand} onChange={(e) => change((d) => { d.theme.brand = e.target.value; })} />
                </span>
              </label>
              <label className="oc-field">
                <span className="oc-field__label">Heading font</span>
                <select className="oc-input" value={doc.theme.headingFont} onChange={(e) => change((d) => { d.theme.headingFont = e.target.value; })}>
                  {FONTS.map((f) => <option key={f}>{f}</option>)}
                </select>
              </label>
              <label className="oc-field">
                <span className="oc-field__label">Button corners</span>
                <select className="oc-input" value={doc.theme.radius} onChange={(e) => change((d) => { d.theme.radius = e.target.value; })}>
                  <option value="square">Square</option>
                  <option value="rounded">Rounded</option>
                  <option value="pill">Pill</option>
                </select>
              </label>
              <label className="oc-field">
                <span className="oc-field__label">Logo URL</span>
                <input className="oc-input" value={doc.theme.logo} onChange={(e) => change((d) => { d.theme.logo = e.target.value; })} />
              </label>
            </>
          ) : (
            <>
              <div className="oc-card__head">
                <h3 className="oc-card__title">{page.name}</h3>
                <button type="button" className="oc-link-btn" onClick={() => setAdding(true)}>+ Add section</button>
              </div>
              <ol className="se-outline">
                {page.sections.map((s, i) => (
                  <li key={s.id} className={`se-outline__row${s.id === selId ? " is-on" : ""}`}>
                    <button type="button" className="se-outline__name" onClick={() => setSelId(s.id)}>
                      {SECTION_TYPES[s.type].label}
                      <span className="se-outline__sub">{s.fields.title || s.fields.text || ""}</span>
                    </button>
                    <span className="se-outline__tools">
                      <button type="button" className="oc-icon-btn" aria-label="Move up" disabled={i === 0} onClick={() => move(s.id, -1)}>↑</button>
                      <button type="button" className="oc-icon-btn" aria-label="Move down" disabled={i === page.sections.length - 1} onClick={() => move(s.id, 1)}>↓</button>
                      <button type="button" className="oc-icon-btn" aria-label={s.visible ? "Hide" : "Show"} aria-pressed={!s.visible} onClick={() => toggleVis(s.id)}>{s.visible ? "◉" : "○"}</button>
                    </span>
                  </li>
                ))}
              </ol>

              {sel ? (
                <section className="oc-sec se-fields">
                  <h4 className="oc-sec__title">{SECTION_TYPES[sel.type].label}</h4>
                  {SECTION_TYPES[sel.type].fields.map(([k, label, kind]) => (
                    <label key={k} className="oc-field">
                      <span className="oc-field__label">{label}</span>
                      {kind === "textarea" || kind === "lines" ? (
                        <textarea className={`oc-input oc-textarea${kind === "lines" ? " mono se-lines" : ""}`} rows={kind === "lines" ? 5 : 3} value={sel.fields[k] || ""} onChange={(e) => setField(k, e.target.value)} />
                      ) : (
                        <input className="oc-input" type={kind === "url" ? "url" : "text"} value={sel.fields[k] || ""} onChange={(e) => setField(k, e.target.value)} />
                      )}
                    </label>
                  ))}
                  <button type="button" className="oc-btn oc-btn--danger" onClick={() => remove(sel.id)}>Remove section</button>
                </section>
              ) : (
                <p className="oc-hint">Click any section in the preview, or in the list above, to edit it.</p>
              )}
            </>
          )}
        </aside>
      </div>

      {adding && (
        <Drawer title="Add a section" sub={`Adds to the bottom of ${page.name}. Move it with ↑ ↓.`} onClose={() => setAdding(false)}>
          <div className="se-add-grid">
            {Object.entries(SECTION_TYPES).map(([type, t]) => (
              <button key={type} type="button" className="oc-shortcut" onClick={() => add(type)}>
                <span className="oc-shortcut__t">{t.label}</span>
                <span className="oc-shortcut__d">{t.fields.map((f) => f[1].split(" —")[0]).slice(0, 3).join(", ")}</span>
              </button>
            ))}
          </div>
        </Drawer>
      )}

      {versions && (
        <Drawer title="Versions" sub="Every publish is kept. Restore puts an old version back as a draft; publish to make it live." onClose={() => setVersions(false)}>
          <ul className="oc-log">
            {(doc.versions || []).map((v, i) => (
              <li key={v.id} className={`oc-log__item oc-request oc-edge--${i === 0 ? "green" : "muted"}`}>
                <div className="oc-request__main">
                  <span className="oc-log__what">{v.note}{i === 0 ? " · live" : ""}</span>
                  <span className="oc-log__meta mono">{fmtDateTime(new Date(v.at))} · {v.by}</span>
                </div>
                {i > 0 && v.snapshot && <button type="button" className="oc-btn oc-btn--ghost" onClick={() => setRestore(v)}>Restore</button>}
              </li>
            ))}
          </ul>
        </Drawer>
      )}
      {restore && (
        <Confirm
          title={`Restore “${restore.note}”?`}
          body={<p>The editor loads that version as a draft. Nothing changes on the live site until you publish.</p>}
          confirmLabel="Restore as draft"
          onConfirm={() => {
            if (restore.snapshot) {
              change((d) => {
                d.theme = JSON.parse(JSON.stringify(restore.snapshot.theme));
                d.pages = JSON.parse(JSON.stringify(restore.snapshot.pages));
              });
              setSelId(null);
              setFlash({ tone: "green", text: `Loaded “${restore.note}” as a draft. Publish to make it live, or Undo to go back.` });
            } else {
              setFlash({ tone: "amber", text: `“${restore.note}” was published before version copies were kept, so there's nothing to restore.` });
            }
            setRestore(null);
            setVersions(false);
          }}
          onClose={() => setRestore(null)}
        />
      )}
    </>
  );
}
