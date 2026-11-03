import React, { useCallback, useEffect, useMemo, useState } from "react";
import { getData, putData, deleteData } from "utils/adminData";
import { PolicyBody } from "views/PolicyPage";
import { Confirm, Drawer, Notice, fmtDate } from "./shared";

const CATEGORIES = ["Getting started", "Connections", "Reports", "Mileage", "Receipts", "Billing", "Trucking", "Account"];

function Editor({ item, onClose, onSaved }) {
  const isNew = !item;
  const [d, setD] = useState(item ? { ...item } : { id: `a${Date.now()}`, title: "", category: CATEGORIES[0], status: "draft", inHelpCenter: true, views: 0, helpful: 0, body: "" });
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState(null);
  const set = (k, v) => setD((x) => ({ ...x, [k]: v }));
  const valid = d.title.trim() && d.body.trim();

  const save = async (publish) => {
    setBusy(true);
    try {
      const next = { ...d, status: publish ? "published" : d.status, updatedAt: new Date().toISOString() };
      await putData("articles", next, { action: publish ? "article.publish" : "article.save", target: next.title });
      onSaved(publish ? `“${next.title}” is live in the Help Center.` : "Draft saved.");
    } catch (e) {
      setErr(e.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Drawer
      title={isNew ? "New help article" : d.title}
      sub="Write it the way you'd explain it on the phone. Short steps beat long paragraphs."
      onClose={onClose}
      footer={
        <>
          <button type="button" className="oc-btn oc-btn--ghost" disabled={!valid || busy} onClick={() => save(false)}>Save draft</button>
          <button type="button" className="oc-btn" disabled={!valid || busy} onClick={() => save(true)}>{d.status === "published" ? "Update" : "Publish"}</button>
        </>
      }
    >
      {err && <div className="oc-flash oc-edge--red" role="status">{err}</div>}
      <label className="oc-field">
        <span className="oc-field__label">Title — phrase it as the customer would ask</span>
        <input className="oc-input" value={d.title} onChange={(e) => set("title", e.target.value)} placeholder="How do I…" />
      </label>
      <div className="oc-inline">
        <label className="oc-field oc-field--grow">
          <span className="oc-field__label">Category</span>
          <select className="oc-input" value={d.category} onChange={(e) => set("category", e.target.value)}>
            {CATEGORIES.map((c) => <option key={c}>{c}</option>)}
          </select>
        </label>
        <label className="oc-check oc-check--plain">
          <input type="checkbox" checked={d.inHelpCenter} onChange={(e) => set("inHelpCenter", e.target.checked)} /> <span>Show in the app's Help Center</span>
        </label>
      </div>
      <label className="oc-field">
        <span className="oc-field__label">Answer — blank line = paragraph, “## ” = heading, “- ” = bullet</span>
        <textarea className="oc-input oc-textarea oc-textarea--tall" value={d.body} onChange={(e) => set("body", e.target.value)} />
      </label>
      {d.body && (
        <div className="oc-whatsnew sg-policy oc-article-preview">
          <h1>{d.title || "Title"}</h1>
          <PolicyBody body={d.body} />
        </div>
      )}
    </Drawer>
  );
}

export default function ArticlesTab() {
  const [items, setItems] = useState(null);
  const [source, setSource] = useState(null);
  const [query, setQuery] = useState("");
  const [edit, setEdit] = useState(null);
  const [del, setDel] = useState(null);
  const [flash, setFlash] = useState(null);

  const load = useCallback(async () => {
    const res = await getData("articles");
    setItems(res.data || []);
    setSource(res.source);
  }, []);
  useEffect(() => {
    load();
  }, [load]);

  const list = useMemo(() => {
    const q = query.trim().toLowerCase();
    return (items || []).filter((a) => !q || [a.title, a.category, a.body].some((v) => String(v).toLowerCase().includes(q))).sort((a, b) => b.views - a.views);
  }, [items, query]);

  if (!items) return <div className="oc-card"><div className="oc-skel oc-skel--block" /></div>;
  const weak = items.filter((a) => a.status === "published" && a.views > 50 && a.helpful < 0.7);

  return (
    <section className="oc-card">
      <div className="oc-card__head oc-users__head">
        <div className="oc-users__tools oc-users__tools--start">
          <input className="oc-search" type="search" placeholder="Search articles…" aria-label="Search articles" value={query} onChange={(e) => setQuery(e.target.value)} />
        </div>
        <button type="button" className="oc-btn" onClick={() => setEdit("new")}>New article</button>
      </div>
      {source === "offline" && <Notice>Help articles aren't connected yet. They need the AdminData/articles route, and the app's Help Center needs to read from it.</Notice>}
      {weak.length > 0 && (
        <Notice>
          {weak.map((a) => `“${a.title}”`).join(", ")} {weak.length === 1 ? "is" : "are"} read a lot but marked helpful by fewer than 70% — worth rewriting.
        </Notice>
      )}
      {flash && <div className={`oc-flash oc-edge--${flash.tone}`} role="status">{flash.text}</div>}
      {list.length === 0 ? (
        <p className="oc-empty">{items.length ? "No article matches." : "No articles yet. Start with the question you answer most."}</p>
      ) : (
        <ul className="oc-log">
          {list.map((a) => (
            <li key={a.id} className={`oc-log__item oc-request oc-edge--${a.status === "draft" ? "amber" : "green"}`}>
              <div className="oc-request__main">
                <span className="oc-log__what">{a.title}</span>
                <span className="oc-log__meta mono">
                  {a.category} · {a.status === "draft" ? "draft" : `${a.views} views · ${Math.round(a.helpful * 100)}% helpful`} · updated {fmtDate(new Date(a.updatedAt))}
                  {a.inHelpCenter ? "" : " · hidden from Help Center"}
                </span>
              </div>
              <div className="oc-actions oc-actions--tight">
                <button type="button" className="oc-btn oc-btn--ghost" onClick={() => setEdit(a)}>Edit</button>
                <button type="button" className="oc-btn oc-btn--ghost" onClick={() => setDel(a)}>Delete</button>
              </div>
            </li>
          ))}
        </ul>
      )}
      {edit && <Editor key={edit === "new" ? "new" : edit.id} item={edit === "new" ? null : edit} onClose={() => setEdit(null)} onSaved={(t) => { setEdit(null); setFlash({ tone: "green", text: t }); load(); }} />}
      {del && (
        <Confirm
          title={`Delete “${del.title}”?`}
          body={<p>It disappears from the Help Center and from saved replies.</p>}
          confirmLabel="Delete"
          tone="danger"
          onConfirm={async () => {
            try {
              await deleteData("articles", del, { action: "article.delete", target: del.title });
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
