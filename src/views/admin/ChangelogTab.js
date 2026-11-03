import React, { useCallback, useEffect, useState } from "react";
import { getData, putData, deleteData } from "utils/adminData";
import { Confirm, Drawer, Notice, fmtDate } from "./shared";

const TAGS = { New: "green", Improved: "accent", Fixed: "amber" };

function Editor({ item, onClose, onSaved }) {
  const isNew = !item;
  const [d, setD] = useState(item ? { ...item } : { id: `c${Date.now()}`, version: "", title: "", body: "", tag: "New", status: "draft", publishedAt: null, platforms: ["web", "app"] });
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState(null);
  const set = (k, v) => setD((x) => ({ ...x, [k]: v }));
  const togglePlat = (p) => set("platforms", d.platforms.includes(p) ? d.platforms.filter((x) => x !== p) : [...d.platforms, p]);
  const valid = d.title.trim() && d.body.trim() && d.platforms.length;

  const save = async (publish) => {
    setBusy(true);
    try {
      const next = { ...d, status: publish ? "published" : d.status, publishedAt: publish ? new Date().toISOString() : d.publishedAt };
      await putData("changelog", next, { action: publish ? "changelog.publish" : "changelog.save", target: `${next.version ? `v${next.version} ` : ""}${next.title}` });
      onSaved(publish ? `“${next.title}” is live in What's new.` : "Draft saved.");
    } catch (e) {
      setErr(e.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Drawer
      title={isNew ? "New update" : d.title}
      sub="Shown in the app's What's new screen after customers update."
      onClose={onClose}
      footer={
        <>
          <button type="button" className="oc-btn oc-btn--ghost" disabled={!valid || busy} onClick={() => save(false)}>Save draft</button>
          <button type="button" className="oc-btn" disabled={!valid || busy} onClick={() => save(true)}>{d.status === "published" ? "Update" : "Publish"}</button>
        </>
      }
    >
      {err && <div className="oc-flash oc-edge--red" role="status">{err}</div>}
      <div className="oc-inline">
        <label className="oc-field oc-field--grow">
          <span className="oc-field__label">Version (optional)</span>
          <input className="oc-input mono" value={d.version} onChange={(e) => set("version", e.target.value)} placeholder="1.6.1" />
        </label>
        <label className="oc-field oc-field--grow">
          <span className="oc-field__label">Label</span>
          <select className="oc-input" value={d.tag} onChange={(e) => set("tag", e.target.value)}>
            {Object.keys(TAGS).map((t) => <option key={t}>{t}</option>)}
          </select>
        </label>
      </div>
      <label className="oc-field">
        <span className="oc-field__label">Headline</span>
        <input className="oc-input" value={d.title} onChange={(e) => set("title", e.target.value)} maxLength={80} />
      </label>
      <label className="oc-field">
        <span className="oc-field__label">What changed, in plain words</span>
        <textarea className="oc-input oc-textarea" rows={5} value={d.body} onChange={(e) => set("body", e.target.value)} />
      </label>
      <fieldset className="oc-fieldset">
        <legend className="oc-field__label">Show on</legend>
        <div className="oc-checks">
          {[["web", "Website"], ["app", "Phone app"]].map(([p, l]) => (
            <label key={p} className={`oc-check${d.platforms.includes(p) ? " is-on" : ""}`}>
              <input type="checkbox" checked={d.platforms.includes(p)} onChange={() => togglePlat(p)} /> <span>{l}</span>
            </label>
          ))}
        </div>
      </fieldset>
      <div className="oc-whatsnew">
        <span className={`oc-chip oc-chip--${TAGS[d.tag]}`}>{d.tag}</span>
        <p className="oc-whatsnew__title">{d.title || "Headline"}</p>
        <p className="oc-whatsnew__body">{d.body || "Description"}</p>
      </div>
    </Drawer>
  );
}

export default function ChangelogTab() {
  const [items, setItems] = useState(null);
  const [source, setSource] = useState(null);
  const [edit, setEdit] = useState(null);
  const [del, setDel] = useState(null);
  const [flash, setFlash] = useState(null);

  const load = useCallback(async () => {
    const res = await getData("changelog");
    setItems(res.data || []);
    setSource(res.source);
  }, []);
  useEffect(() => {
    load();
  }, [load]);

  if (!items) return <div className="oc-card"><div className="oc-skel oc-skel--block" /></div>;
  const sorted = [...items].sort((a, b) => (a.status === "draft" ? -1 : b.status === "draft" ? 1 : new Date(b.publishedAt) - new Date(a.publishedAt)));

  return (
    <section className="oc-card">
      <div className="oc-card__head oc-users__head">
        <div className="oc-drawer__titles">
          <h2 className="oc-card__title">What's new</h2>
          <p className="oc-muted">Release notes customers see after an update. Short and in plain words works best.</p>
        </div>
        <button type="button" className="oc-btn" onClick={() => setEdit("new")}>New update</button>
      </div>
      {source === "offline" && <Notice>What's new isn't connected yet. It needs the AdminData/changelog route.</Notice>}
      {flash && <div className={`oc-flash oc-edge--${flash.tone}`} role="status">{flash.text}</div>}
      <ul className="oc-log">
        {sorted.map((c) => (
          <li key={c.id} className={`oc-log__item oc-request oc-edge--${c.status === "draft" ? "amber" : "green"}`}>
            <div className="oc-request__main">
              <span className="oc-log__what">
                <span className={`oc-chip oc-chip--${TAGS[c.tag]}`}>{c.tag}</span> {c.title}
              </span>
              <span className="oc-log__detail">{c.body}</span>
              <span className="oc-log__meta mono">
                {c.version ? `v${c.version} · ` : ""}
                {c.status === "draft" ? "Draft" : `Published ${fmtDate(new Date(c.publishedAt))}`} · {c.platforms.join(" + ")}
              </span>
            </div>
            <div className="oc-actions oc-actions--tight">
              <button type="button" className="oc-btn oc-btn--ghost" onClick={() => setEdit(c)}>Edit</button>
              <button type="button" className="oc-btn oc-btn--ghost" onClick={() => setDel(c)}>Delete</button>
            </div>
          </li>
        ))}
      </ul>
      {edit && <Editor key={edit === "new" ? "new" : edit.id} item={edit === "new" ? null : edit} onClose={() => setEdit(null)} onSaved={(t) => { setEdit(null); setFlash({ tone: "green", text: t }); load(); }} />}
      {del && (
        <Confirm
          title={`Delete “${del.title}”?`}
          body={<p>It disappears from What's new for everyone.</p>}
          confirmLabel="Delete"
          tone="danger"
          onConfirm={async () => {
            try {
              await deleteData("changelog", del, { action: "changelog.delete", target: del.title });
              setFlash({ tone: "green", text: "Deleted." });
              load();
            } catch (e) {
              setFlash({ tone: e.notConnected ? "amber" : "red", text: e.message });
            }
            setDel(null);
          }}
          onClose={() => setDel(null)}
        />
      )}
    </section>
  );
}
