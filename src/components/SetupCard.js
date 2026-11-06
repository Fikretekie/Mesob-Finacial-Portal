import React, { useCallback, useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { App as CapacitorApp } from "@capacitor/app";
import { detectionLooksStale, isSetupDone, SETUP_CHANGED, SETUP_OPEN, trackingIncomplete } from "utils/appSetup";
import { driveDetectionAvailable, getDriveSettings, getDriveStatus, resetDetectionCheck } from "utils/driveMonitor";
import { isRideshare, isTrucking } from "utils/mileageRate";

// Home, drivers: something tracking needs is off, so miles are being missed. Red,
// because they are. Android can also take permissions back later, so this rechecks.
const SetupCard = () => {
  const { t } = useTranslation();
  const [show, setShow] = useState(null); // null | "off" | "stale"

  const check = useCallback(async () => {
    const status = await getDriveStatus().catch(() => null);
    if (!status || !isSetupDone()) return setShow(null);
    if (trackingIncomplete(status, getDriveSettings())) return setShow("off");
    return setShow(detectionLooksStale(status) ? "stale" : null);
  }, []);

  useEffect(() => {
    if (!driveDetectionAvailable() || !(isTrucking() || isRideshare())) return undefined;
    check();
    window.addEventListener(SETUP_CHANGED, check);
    const resume = CapacitorApp.addListener("resume", check);
    return () => {
      window.removeEventListener(SETUP_CHANGED, check);
      resume.then((l) => l.remove());
    };
  }, [check]);

  if (!show) return null;

  return (
    <button
      type="button"
      className="mksv-drive-banner"
      onClick={async () => {
        // Tapping counts as seen, so someone who just hasn't driven isn't stuck with it.
        if (show === "stale") {
          await resetDetectionCheck().catch(() => {});
          setShow(null);
        }
        window.dispatchEvent(new Event(SETUP_OPEN));
      }}
    >
      <span className="mksv-row__body">
        <span className="mksv-row__title">{t(show === "stale" ? "setup.staleTitle" : "setup.cardTitle")}</span>
        <span className="mksv-row__sub">{t(show === "stale" ? "setup.staleSub" : "setup.cardSub")}</span>
      </span>
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <path d="m9 6 6 6-6 6" />
      </svg>
    </button>
  );
};

export default SetupCard;
