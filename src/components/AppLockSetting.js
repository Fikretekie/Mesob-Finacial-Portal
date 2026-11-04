import React, { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import {
  APP_LOCK_CHANGED,
  getAppLockPref,
  isBiometricAvailable,
  setAppLockPref,
  verifyBiometric,
} from "utils/appLock";

// Account-page switch for fingerprint/face unlock. Renders nothing on the
// website or on phones without biometrics enrolled.
const AppLockSetting = () => {
  const { t } = useTranslation();
  const [available, setAvailable] = useState(false);
  const [on, setOn] = useState(getAppLockPref() === "on");

  useEffect(() => {
    isBiometricAvailable().then(setAvailable);
    const sync = () => setOn(getAppLockPref() === "on");
    window.addEventListener(APP_LOCK_CHANGED, sync);
    return () => window.removeEventListener(APP_LOCK_CHANGED, sync);
  }, []);

  if (!available) return null;

  const toggle = async () => {
    if (on) {
      setAppLockPref("off");
    } else if (await verifyBiometric(t)) {
      setAppLockPref("on");
    }
  };

  return (
    <div className="mksv-lock-setting">
      <div className="mksv-lock-setting__text">
        <div id="mksv-lock-setting-label" className="mksv-lock-setting__label">{t("app.settingLabel")}</div>
        <div className="mksv-lock-setting__hint">{t("app.settingHint")}</div>
      </div>
      <button
        type="button"
        role="switch"
        aria-checked={on}
        aria-labelledby="mksv-lock-setting-label"
        className={`mksv-switch${on ? " is-on" : ""}`}
        onClick={toggle}
      >
        <span className="mksv-switch__thumb" />
      </button>
    </div>
  );
};

export default AppLockSetting;
