import React, { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { QUEUE_CHANGED, queueCount } from "utils/offline";

// Slim status bar instead of blocking the app: offline, the app keeps working
// on saved data and queues new entries (utils/offline.js).
const OfflineBar = () => {
  const { t } = useTranslation();
  const [offline, setOffline] = useState(typeof navigator !== "undefined" && navigator.onLine === false);
  const [waiting, setWaiting] = useState(0);

  useEffect(() => {
    const goOffline = () => setOffline(true);
    const goOnline = () => setOffline(false);
    const onQueue = (e) => setWaiting(e.detail || 0);
    window.addEventListener("offline", goOffline);
    window.addEventListener("online", goOnline);
    window.addEventListener(QUEUE_CHANGED, onQueue);
    queueCount().then(setWaiting);
    return () => {
      window.removeEventListener("offline", goOffline);
      window.removeEventListener("online", goOnline);
      window.removeEventListener(QUEUE_CHANGED, onQueue);
    };
  }, []);

  const shown = offline || waiting > 0;
  useEffect(() => {
    document.documentElement.classList.toggle("offline-bar", shown);
  }, [shown]);

  if (!shown) return null;

  const text = offline
    ? waiting
      ? t("app.offlineWaiting", { count: waiting })
      : t("app.offlineSaved")
    : t("app.offlineSyncing", { count: waiting });

  return (
    <div className={`mksv-offline-bar${offline ? "" : " mksv-offline-bar--syncing"}`} role="status">
      {text}
    </div>
  );
};

export default OfflineBar;
