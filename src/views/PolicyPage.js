import React from "react";
import { Helmet } from "react-helmet";
import { useSiteConfig } from "utils/siteConfig";
import TermsOfUse from "views/Terms";
import "../assets/css/site-gate.css";

// Plain-text policy body: blank line = new paragraph, "## " = heading,
// "- " = bullet. Kept deliberately simple so no HTML is ever injected.
export function PolicyBody({ body }) {
  const blocks = String(body || "").split(/\n\s*\n/).map((b) => b.trim()).filter(Boolean);
  return blocks.map((b, i) => {
    if (b.startsWith("## ")) return <h2 key={i}>{b.slice(3)}</h2>;
    const lines = b.split("\n");
    if (lines.every((l) => l.trim().startsWith("- "))) {
      return (
        <ul key={i}>
          {lines.map((l, j) => <li key={j}>{l.trim().slice(2)}</li>)}
        </ul>
      );
    }
    return <p key={i}>{b}</p>;
  });
}

export default function PolicyPage({ kind }) {
  const cfg = useSiteConfig();
  const p = cfg.policies?.[kind];

  if (!p?.body) {
    if (kind === "terms") return <TermsOfUse />;
    return (
      <div className="sg-policy">
        <h1>{p?.title || "Policy"}</h1>
        <p>This policy hasn't been published yet.</p>
      </div>
    );
  }

  return (
    <div className="sg-policy">
      <Helmet>
        <title>{p.title} - Meksova</title>
      </Helmet>
      <h1>{p.title}</h1>
      <p className="sg-wall__meta">
        {p.version && `Version ${p.version}`}
        {p.effectiveDate && ` · Effective ${p.effectiveDate}`}
      </p>
      <PolicyBody body={p.body} />
    </div>
  );
}
