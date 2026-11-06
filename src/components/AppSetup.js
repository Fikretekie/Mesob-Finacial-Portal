import React, { useCallback, useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { App as CapacitorApp } from "@capacitor/app";
import TruckBluetooth from "components/TruckBluetooth";
import { getAppLockPref, isBiometricAvailable, setAppLockPref, verifyBiometric } from "utils/appLock";
import { isSetupDone, markSetupDone, SETUP_CHANGED, SETUP_OPEN } from "utils/appSetup";
import {
  configureDriveMonitor,
  driveDetectionAvailable,
  getDriveSettings,
  getDriveStatus,
  openDriveAppSettings,
  requestBackgroundLocation,
  requestDrivePermission,
  saveDriveSettings,
} from "utils/driveMonitor";
import { isRideshare, isTrucking } from "utils/mileageRate";

const ORDER = ["intro", "motion", "background", "notifications", "battery", "industry", "lock", "done"];

// After first sign-in: one screen per thing Android makes the person approve.
// Anything already on is skipped, and every step can be put off (Home's red card
// brings them back). The location disclosure must come before the permission
// requests, which Google Play requires.
const AppSetup = () => {
  const { t } = useTranslation();
  const [step, setStep] = useState(null);
  const [status, setStatus] = useState(null);
  const [blocked, setBlocked] = useState(false);
  const [position, setPosition] = useState({ at: 1, of: 1 });
  const [settings, setSettings] = useState(getDriveSettings);
  const declined = useRef(false);
  const firstTime = useRef(false);
  const biometric = useRef(false);
  const stepRef = useRef(null);
  const plan = useRef([]);
  const titleRef = useRef(null);

  const driver = isTrucking() || isRideshare();

  const needed = useCallback(
    (name, s) => {
      // Read fresh: these callbacks outlive the render that made them.
      const isDriver = isTrucking() || isRideshare();
      const locationOk = !declined.current;
      switch (name) {
        case "intro":
          return isDriver && locationOk && (!getDriveSettings().enabled || !s.activity || !s.location || !s.backgroundLocation);
        case "motion":
          return isDriver && locationOk && (!s.activity || !s.location);
        case "background":
          return isDriver && locationOk && s.location && !s.backgroundLocation;
        case "notifications":
          return !s.notifications;
        case "battery":
          return isDriver && locationOk && s.batteryUnrestricted === false;
        case "industry":
          return isDriver && locationOk && firstTime.current;
        case "lock":
          return biometric.current && getAppLockPref() === null;
        case "done":
          return isDriver && locationOk && firstTime.current;
        default:
          return false;
      }
    },
    []
  );

  const finish = useCallback(() => {
    markSetupDone();
    setStep(null);
    stepRef.current = null;
    window.dispatchEvent(new Event(SETUP_CHANGED));
  }, []);

  const goAfter = useCallback(
    async (current) => {
      const s = await getDriveStatus().catch(() => null);
      if (!s) return finish();
      // Coming back from Android's pop-up also lands here: move on only once per step.
      if (current && stepRef.current !== current) return undefined;
      setStatus(s);
      setBlocked(false);
      const from = current ? ORDER.indexOf(current) + 1 : 0;
      const nextName = ORDER.slice(from).find((name) => needed(name, s));
      if (!nextName) return finish();
      if (!current) {
        // "All the time" can only be asked once location is allowed, so count it from the start.
        plan.current = ORDER.filter((name) => name !== "done" && (needed(name, s) || (name === "background" && needed("motion", s))));
      }
      setPosition({ at: plan.current.indexOf(nextName) + 1, of: plan.current.length });
      stepRef.current = nextName;
      setStep(nextName);
      return undefined;
    },
    [finish, needed]
  );

  const start = useCallback(
    async (first) => {
      firstTime.current = first;
      declined.current = false;
      setSettings(getDriveSettings());
      biometric.current = await isBiometricAvailable();
      goAfter(null);
    },
    [goAfter]
  );

  useEffect(() => {
    if (!driveDetectionAvailable()) return undefined;
    if (!isSetupDone()) start(true);
    const reopen = () => start(false);
    window.addEventListener(SETUP_OPEN, reopen);
    // Back from Android's settings pages: move on if that step is now done.
    const resume = CapacitorApp.addListener("resume", async () => {
      const current = stepRef.current;
      if (!current) return;
      const s = await getDriveStatus().catch(() => null);
      if (!s) return;
      setStatus(s);
      if (!needed(current, s) && ["motion", "background", "notifications", "battery"].includes(current)) {
        await enableIfReady(s);
        goAfter(current);
      }
    });
    return () => {
      window.removeEventListener(SETUP_OPEN, reopen);
      resume.then((l) => l.remove());
    };
    // eslint-disable-next-line
  }, []);

  useEffect(() => {
    if (step) titleRef.current?.focus();
  }, [step]);

  if (!step || !status) return null;

  // Tracking goes on as soon as Android allows it, even if a later step gets skipped.
  async function enableIfReady(s) {
    const current = getDriveSettings();
    if (declined.current || !s.activity || current.enabled) return;
    const next = { ...current, enabled: true };
    saveDriveSettings(next);
    setSettings(next);
    await configureDriveMonitor(t, next);
  }

  const askMotion = async () => {
    await requestDrivePermission("activity").catch(() => null);
    const s = await requestDrivePermission("location").catch(() => null);
    if (s && s.activity && s.location) {
      await enableIfReady(s);
      goAfter("motion");
    } else {
      setBlocked(true);
    }
  };

  const askBackground = async () => {
    const s = await requestBackgroundLocation().catch(() => null);
    if (s && s.backgroundLocation) goAfter("background");
    else setBlocked(true);
  };

  const askNotifications = async () => {
    const s = await requestDrivePermission("notifications").catch(() => null);
    if (s && s.notifications) goAfter("notifications");
    else setBlocked(true);
  };

  const askLock = async () => {
    if (await verifyBiometric(t)) setAppLockPref("on");
    goAfter("lock");
  };

  const putOff = () => {
    if (step === "intro") {
      declined.current = true;
      plan.current = plan.current.filter((name) => !["motion", "background", "battery", "industry"].includes(name));
    }
    if (step === "lock") setAppLockPref("off");
    goAfter(step);
  };

  const updateVehicles = (vehicles) => {
    const next = { ...getDriveSettings(), vehicles };
    saveDriveSettings(next);
    setSettings(next);
    configureDriveMonitor(t, next);
  };

  const COPY = {
    intro: { title: t("drives.disclosure.title"), body: t(isTrucking() ? "drives.disclosure.body" : "drives.disclosure.bodyOther") },
    motion: { title: t("setup.motionTitle"), body: t("setup.motionBody") },
    background: { title: t("setup.backgroundTitle"), body: t("setup.backgroundBody") },
    notifications: { title: t("setup.notificationsTitle"), body: t(driver ? "setup.notificationsBody" : "setup.notificationsBodyOther") },
    battery: { title: t("setup.batteryTitle"), body: t("setup.batteryBody") },
    industry: isTrucking()
      ? { title: t("setup.truckTitle"), body: t("setup.truckBody") }
      : { title: t("setup.shiftTitle"), body: t("setup.shiftBody") },
    lock: { title: t("app.offerTitle"), body: t("app.offerBody") },
    done: { title: t("setup.doneTitle"), body: t(isTrucking() ? "setup.doneBodyTrucking" : "setup.doneBodyRideshare") },
  };
  const ACTIONS = {
    intro: { label: t("drives.disclosure.continue"), run: () => goAfter("intro").then(() => enableIfReady(status)) },
    motion: { label: t("setup.allow"), run: askMotion },
    background: { label: t("setup.openSettings"), run: askBackground },
    notifications: { label: t("setup.allow"), run: askNotifications },
    battery: { label: t("setup.openSettings"), run: () => openDriveAppSettings().catch(() => {}) },
    industry: { label: t("setup.next"), run: () => goAfter("industry") },
    lock: { label: t("app.turnOn"), run: askLock },
    done: { label: t("setup.finish"), run: finish },
  };
  const copy = COPY[step];
  const action = blocked
    ? { label: t("setup.openSettings"), run: () => openDriveAppSettings().catch(() => {}) }
    : ACTIONS[step];
  const canPutOff = !["done"].includes(step);

  return (
    <div className="mksv-setup" role="dialog" aria-modal="true" aria-labelledby="mksv-setup-title">
      <div className="mksv-setup__body">
        {step !== "done" && (
          <p className="mksv-setup__step">{t("setup.stepOf", position)}</p>
        )}
        <h1 id="mksv-setup-title" ref={titleRef} tabIndex={-1} className="mksv-setup__title">{copy.title}</h1>
        <p className="mksv-setup__text">{copy.body}</p>

        {step === "intro" && (
          <ul className="mksv-setup__points">
            <li>{t("drives.disclosure.point1")}</li>
            <li>{t("drives.disclosure.point2")}</li>
            <li>{t("drives.disclosure.point3")}</li>
          </ul>
        )}

        {/* What Android's page looks like, since this choice is the one most often missed. */}
        {step === "background" && (
          <div className="mksv-setup__mock" aria-hidden="true">
            <div className="mksv-setup__mock-row is-on"><span className="mksv-setup__radio" />{t("setup.optionAlways")}</div>
            <div className="mksv-setup__mock-row"><span className="mksv-setup__radio" />{t("setup.optionWhileUsing")}</div>
            <div className="mksv-setup__mock-row"><span className="mksv-setup__radio" />{t("setup.optionDeny")}</div>
          </div>
        )}

        {step === "industry" && isTrucking() && <TruckBluetooth vehicles={settings.vehicles} onChange={updateVehicles} />}

        {blocked && (
          <p className="mksv-setup__blocked" role="status">{t("setup.blocked")}</p>
        )}
      </div>

      <div className="mksv-setup__actions">
        <button type="button" className="mksv-app-btn mksv-app-btn--primary" onClick={action.run}>{action.label}</button>
        {canPutOff && (
          <button type="button" className="mksv-app-btn mksv-app-btn--ghost" onClick={putOff}>
            {t(step === "industry" ? "setup.skip" : "setup.notNow")}
          </button>
        )}
      </div>
    </div>
  );
};

export default AppSetup;
