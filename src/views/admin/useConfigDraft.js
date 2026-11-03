import { useCallback, useEffect, useState } from "react";
import { loadConfig, saveConfig, isDemo } from "utils/adminApi";
import { getSiteConfigStatus, refreshSiteConfig } from "utils/siteConfig";
import { useAccess } from "utils/staffAccess";
import { submitOrRun } from "utils/approvals";

/** Loads the site config into an editable draft; save() publishes it. */
export default function useConfigDraft() {
  const access = useAccess();
  const [saved, setSaved] = useState(null);
  const [draft, setDraft] = useState(null);
  const [status, setStatus] = useState(null);
  const [busy, setBusy] = useState(false);
  const [flash, setFlash] = useState(null);

  const load = useCallback(async () => {
    if (!isDemo()) await refreshSiteConfig();
    const { config } = await loadConfig();
    setSaved(config);
    setDraft(JSON.parse(JSON.stringify(config)));
    setStatus(isDemo() ? "demo" : getSiteConfigStatus());
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const set = (path, value) =>
    setDraft((d) => {
      const next = JSON.parse(JSON.stringify(d));
      const keys = path.split(".");
      let o = next;
      keys.slice(0, -1).forEach((k) => {
        o[k] = o[k] || {};
        o = o[k];
      });
      o[keys[keys.length - 1]] = value;
      return next;
    });

  const dirty = saved && draft && JSON.stringify(saved) !== JSON.stringify(draft);

  const save = async (action, detail) => {
    setBusy(true);
    setFlash(null);
    try {
      const kind = action === "policy.publish" ? "policy.publish" : "site.publish";
      const res = await submitOrRun(kind, access, { summary: detail || "Publish site settings", payload: { config: draft, action, detail } }, () => saveConfig(draft, action, detail));
      if (res.pending) {
        setFlash({ tone: "amber", text: "Sent to the owner for approval. It goes live once they approve." });
        return true;
      }
      setFlash({ tone: "green", text: "Published. Open apps pick this up within 5 minutes, or the next time they're opened." });
      await load();
      return true;
    } catch (e) {
      setFlash({ tone: e.notConnected ? "amber" : "red", text: e.notConnected ? `${e.message}. Changes weren't published. This turns on once the SiteConfig route is deployed.` : `Couldn't publish (${e?.response?.status || e.message}).` });
      return false;
    } finally {
      setBusy(false);
    }
  };

  const discard = () => setDraft(JSON.parse(JSON.stringify(saved)));

  return { saved, draft, set, dirty, save, discard, busy, flash, status };
}
