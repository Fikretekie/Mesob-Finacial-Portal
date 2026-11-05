import React, { useCallback, useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { App as CapacitorApp } from "@capacitor/app";
import { isSetupDone, SETUP_CHANGED, SETUP_OPEN, trackingIncomplete } from "utils/appSetup";
import { driveDetectionAvailable, getDriveSettings, getDriveStatus } from "utils/driveMonitor";
import { isRideshare, isTrucking } from "utils/mileageRate";

// Home, drivers: something tracking needs is off, so miles are being missed. Red,
// because they are. Android can also take permissions back later, so this rechecks.
const SetupCard = () => {
  const { t } = useTranslation();
  const [show, setShow] = useState(false);

  const check = useCallback(async () => {
    const status = await getDriveStatus().catch(() => null);
    setShow(!!status && isSetupDone() && trackingIncomplete(status, getDriveSettings()));
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
    <button type="button" className="mksv-drive-banner" onClick={() => window.dispatchEvent(new Event(SETUP_OPEN))}>
      <span className="mksv-row__body">
        <span className="mksv-row__title">{t("setup.cardTitle")}</span>
        <span className="mksv-row__sub">{t("setup.cardSub")}</span>
      </span>
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <path d="m9 6 6 6-6 6" />
      </svg>
    </button>
  );
};

export default SetupCard;
