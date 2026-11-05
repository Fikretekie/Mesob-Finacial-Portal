import React, { useCallback, useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { useNavigate } from "react-router-dom";
import { App as CapacitorApp } from "@capacitor/app";
import { driveDetectionAvailable, getDriveStatus, setShift } from "utils/driveMonitor";
import { isRideshare } from "utils/mileageRate";

// Home, rideshare: while a shift is on, every drive is logged as work.
const ShiftCard = () => {
  const { t, i18n } = useTranslation();
  const navigate = useNavigate();
  const [status, setStatus] = useState(null);
  const [busy, setBusy] = useState(false);

  const refresh = useCallback(() => {
    getDriveStatus().then(setStatus).catch(() => {});
  }, []);

  useEffect(() => {
    if (!driveDetectionAvailable() || !isRideshare()) return undefined;
    refresh();
    // The notification and the widget can start or end it too.
    const listener = CapacitorApp.addListener("resume", refresh);
    return () => {
      listener.then((l) => l.remove());
    };
  }, [refresh]);

  if (!status) return null;

  const toggle = async () => {
    setBusy(true);
    try {
      setStatus(await setShift(!status.shiftOn));
    } finally {
      setBusy(false);
    }
  };

  if (!status.enabled) {
    return (
      <div className="mksv-shift">
        <div className="mksv-shift__text">
          <div className="mksv-shift__title">{t("drives.shift.startButton")}</div>
          <div className="mksv-shift__sub">{t("drives.shift.needDetection")}</div>
        </div>
        <button type="button" className="mksv-app-btn mksv-app-btn--ghost" onClick={() => navigate("/customer/profile")}>
          {t("drives.settings.allow")}
        </button>
      </div>
    );
  }

  const since = status.shiftAt
    ? new Date(status.shiftAt).toLocaleTimeString(i18n.language, { hour: "numeric", minute: "2-digit" })
    : "";

  return (
    <div className={`mksv-shift${status.shiftOn ? " is-on" : ""}`}>
      <div className="mksv-shift__text">
        <div className="mksv-shift__title">
          {status.shiftOn ? t("drives.shift.onSince", { time: since }) : t("drives.shift.offTitle")}
        </div>
        <div className="mksv-shift__sub">
          {status.shiftOn
            ? t("drives.shift.hintOn", { miles: Number(status.shiftMiles || 0).toFixed(1) })
            : t("drives.shift.hintOff")}
        </div>
      </div>
      <button
        type="button"
        className={`mksv-app-btn ${status.shiftOn ? "mksv-app-btn--ghost" : "mksv-app-btn--primary"}`}
        disabled={busy}
        onClick={toggle}
      >
        {status.shiftOn ? t("drives.shift.end") : t("drives.shift.startButton")}
      </button>
    </div>
  );
};

export default ShiftCard;
