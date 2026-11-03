import React, { useEffect, useState } from "react";
import { Capacitor } from "@capacitor/core";
import { useSiteConfig, compareVersions } from "utils/siteConfig";
import { isAppShell } from "utils/appShell";
import "../assets/css/site-gate.css";

const DISMISS_KEY = "mksv_banner_dismissed";

function useNativeVersion() {
  const [version, setVersion] = useState(null);
  useEffect(() => {
    if (!Capacitor.isNativePlatform()) return;
    import("@capacitor/app")
      .then(({ App }) => App.getInfo())
      .then((info) => setVersion(info.version))
      .catch(() => {});
  }, []);
  return version;
}

export function SiteBanner({ preview }) {
  const live = useSiteConfig();
  const banner = (preview || live).banner;
  const [dismissed, setDismissed] = useState(() => {
    try {
      return localStorage.getItem(DISMISS_KEY) || "";
    } catch (e) {
      return "";
    }
  });
  const app = isAppShell();
  const key = banner.id || banner.message;

  if (!banner.enabled || !banner.message) return null;
  if (banner.audience === "web" && app) return null;
  if (banner.audience === "app" && !app) return null;
  if (!preview && banner.dismissible && dismissed === key) return null;

  const dismiss = () => {
    try {
      localStorage.setItem(DISMISS_KEY, key);
    } catch (e) {}
    setDismissed(key);
  };

  return (
    <div className={`sg-banner sg-banner--${banner.tone}${preview ? " sg-banner--preview" : ""}${app ? " sg-banner--app" : ""}`} role="status">
      <span className="sg-banner__msg">{banner.message}</span>
      {banner.linkUrl && (
        <a className="sg-banner__link" href={banner.linkUrl} target="_blank" rel="noopener noreferrer">
          {banner.linkText || "Learn more"}
        </a>
      )}
      {banner.dismissible && !preview && (
        <button type="button" className="sg-banner__x" onClick={dismiss} aria-label="Dismiss announcement">
          ×
        </button>
      )}
    </div>
  );
}

/** Wraps signed-in screens: maintenance mode and forced app updates replace the
 * page for customers; super admins pass through with a reminder strip. */
export default function SiteGate({ children }) {
  const cfg = useSiteConfig();
  const version = useNativeVersion();
  const isOwner = parseInt(localStorage.getItem("role"), 10) === 0;

  const needsUpdate =
    version && cfg.app.minVersion && compareVersions(version, cfg.app.minVersion) < 0;

  if (needsUpdate) {
    return (
      <div className="sg-wall">
        <div className="sg-wall__card">
          <h1 className="sg-wall__title">Update required</h1>
          <p className="sg-wall__msg">{cfg.app.updateMessage}</p>
          <p className="sg-wall__meta">
            Installed {version} · required {cfg.app.minVersion}
          </p>
          {cfg.app.updateUrl && (
            <a className="sg-wall__btn" href={cfg.app.updateUrl} target="_blank" rel="noopener noreferrer">
              Update Meksova
            </a>
          )}
        </div>
      </div>
    );
  }

  if (cfg.maintenance.enabled && !isOwner) {
    return (
      <div className="sg-wall">
        <div className="sg-wall__card">
          <h1 className="sg-wall__title">Down for maintenance</h1>
          <p className="sg-wall__msg">{cfg.maintenance.message}</p>
          {cfg.maintenance.until && (
            <p className="sg-wall__meta">
              Expected back {new Date(cfg.maintenance.until).toLocaleString()}
            </p>
          )}
          {cfg.support.email && (
            <a className="sg-wall__link" href={`mailto:${cfg.support.email}`}>
              {cfg.support.email}
            </a>
          )}
        </div>
      </div>
    );
  }

  return (
    <>
      {cfg.maintenance.enabled && isOwner && (
        <div className="sg-ownerstrip" role="status">
          Maintenance mode is ON — customers see the maintenance screen.
        </div>
      )}
      {children}
      <SiteBanner />
    </>
  );
}
