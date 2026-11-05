import React, { useCallback, useEffect, useRef, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { Modal, ModalBody } from "reactstrap";
import { Capacitor } from "@capacitor/core";
import { App as CapacitorApp } from "@capacitor/app";
import { signOut } from "aws-amplify/auth";
import { isSignedIn } from "utils/appShell";
import { stopDriveDetection } from "utils/driveMonitor";
import { isSetupDone } from "utils/appSetup";
import { clearForSignOut } from "utils/authStorage";
import {
  APP_LOCK_CHANGED,
  getAppLockPref,
  isBiometricAvailable,
  needsUnlock,
  noteSeen,
  setAppLockPref,
  STAY_UNLOCKED_MS,
  verifyBiometric,
} from "utils/appLock";

const PUBLIC_PATHS = ["/login", "/signup", "/forgot-password", "/confirm", "/oauth-redirect", "/complete-profile"];

const FingerprintIcon = () => (
  <svg width="44" height="44" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d="M12 10a2 2 0 0 0-2 2c0 1.02-.1 2.51-.26 4" />
    <path d="M14 13.12c0 2.38 0 6.38-1 8.88" />
    <path d="M17.29 21.02c.12-.6.43-2.3.5-3.02" />
    <path d="M2 12a10 10 0 0 1 18-6" />
    <path d="M2 16h.01" />
    <path d="M21.8 16c.2-2 .131-5.354 0-6" />
    <path d="M5 19.5C5.5 18 6 15 6 12a6 6 0 0 1 .34-2" />
    <path d="M8.65 22c.21-.66.45-1.32.57-2" />
    <path d="M9 6.8a6 6 0 0 1 9 5.2v2" />
  </svg>
);

const AppLock = () => {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { pathname } = useLocation();
  // null until the device check finishes, so a locked app never flashes its content.
  const [available, setAvailable] = useState(null);
  const [pref, setPref] = useState(getAppLockPref());
  const [locked, setLocked] = useState(
    () => Capacitor.isNativePlatform() && isSignedIn() && getAppLockPref() === "on"
  );
  // Starts covered so nothing shows, then opens by itself if they've been active lately.
  const [checking, setChecking] = useState(locked);
  const [verifying, setVerifying] = useState(false);
  const pausedAt = useRef(0);
  const unlockBtn = useRef(null);

  useEffect(() => {
    isBiometricAvailable().then(setAvailable);
    const sync = () => setPref(getAppLockPref());
    window.addEventListener(APP_LOCK_CHANGED, sync);
    return () => window.removeEventListener(APP_LOCK_CHANGED, sync);
  }, []);

  const recheck = useCallback(async () => {
    setChecking(true);
    const stillNeeded = await needsUnlock().catch(() => true);
    if (!stillNeeded) setLocked(false);
    setChecking(false);
  }, []);

  useEffect(() => {
    if (locked) recheck();
    // eslint-disable-next-line
  }, []);

  useEffect(() => {
    if (!Capacitor.isNativePlatform()) return undefined;
    const pause = CapacitorApp.addListener("pause", () => {
      pausedAt.current = Date.now();
      noteSeen();
    });
    const resume = CapacitorApp.addListener("resume", () => {
      const away = Date.now() - pausedAt.current;
      // Away for hours: cover the screen straight away, then check if they were driving.
      if (getAppLockPref() === "on" && isSignedIn() && pausedAt.current && away >= STAY_UNLOCKED_MS) {
        setLocked(true);
        recheck();
      }
    });
    return () => {
      pause.then((l) => l.remove());
      resume.then((l) => l.remove());
    };
  }, [recheck]);

  const unlock = useCallback(async () => {
    if (verifying) return;
    setVerifying(true);
    const ok = await verifyBiometric(t);
    setVerifying(false);
    if (ok) {
      noteSeen();
      setLocked(false);
    }
  }, [t, verifying]);

  // Fingerprints removed from the phone since lock was turned on: don't trap the user.
  useEffect(() => {
    if (locked && available === false) setLocked(false);
  }, [locked, available]);

  // Ask for the fingerprint as soon as the lock screen appears.
  useEffect(() => {
    if (!locked || !available || checking) return;
    unlockBtn.current?.focus();
    unlock();
    // eslint-disable-next-line
  }, [locked, available, checking]);

  const signInWithPassword = async () => {
    await stopDriveDetection();
    clearForSignOut();
    try {
      await signOut();
    } catch (e) {}
    setLocked(false);
    navigate("/login", { replace: true });
  };

  const enable = async () => {
    // Confirm with a real scan so the user knows it works before relying on it.
    if (await verifyBiometric(t)) setAppLockPref("on");
  };

  const showOffer =
    available === true &&
    !locked &&
    pref === null &&
    // The setup asks this itself, in order.
    isSetupDone() &&
    isSignedIn() &&
    !PUBLIC_PATHS.some((p) => pathname.startsWith(p));

  if (locked && available !== false) {
    return (
      <div
        className="mksv-app-lock"
        data-app-lock
        role="dialog"
        aria-modal="true"
        aria-labelledby="mksv-app-lock-title"
      >
        <img src="/transparent.png" alt="" className="mksv-app-lock__logo" />
        <div className="mksv-app-lock__icon"><FingerprintIcon /></div>
        <h1 id="mksv-app-lock-title" className="mksv-app-lock__title">{t("app.lockTitle")}</h1>
        <p className="mksv-app-lock__body">{t("app.lockBody")}</p>
        <button type="button" ref={unlockBtn} className="mksv-app-btn mksv-app-btn--primary" onClick={unlock} disabled={verifying || !available}>
          {t("app.unlock")}
        </button>
        <button type="button" className="mksv-app-btn mksv-app-btn--ghost" onClick={signInWithPassword}>
          {t("app.usePassword")}
        </button>
      </div>
    );
  }

  return (
    <Modal isOpen={showOffer} centered labelledBy="mksv-lock-offer-title" toggle={() => setAppLockPref("off")}>
      <ModalBody className="mksv-lock-offer">
        <div className="mksv-app-lock__icon"><FingerprintIcon /></div>
        <h2 id="mksv-lock-offer-title" className="mksv-lock-offer__title">{t("app.offerTitle")}</h2>
        <p className="mksv-lock-offer__body">{t("app.offerBody")}</p>
        <button type="button" className="mksv-app-btn mksv-app-btn--primary" onClick={enable}>
          {t("app.turnOn")}
        </button>
        <button type="button" className="mksv-app-btn mksv-app-btn--ghost" onClick={() => setAppLockPref("off")}>
          {t("app.notNow")}
        </button>
      </ModalBody>
    </Modal>
  );
};

export default AppLock;
