import { Capacitor } from "@capacitor/core";
import { NativeBiometric } from "@capgo/capacitor-native-biometric";

// "on" | "off" | null (not asked yet). Logout clears localStorage, so the
// next person to sign in on this phone is asked again.
const PREF_KEY = "mksv-app-lock";

export const APP_LOCK_CHANGED = "mksv:app-lock-changed";

export const getAppLockPref = () => {
  try {
    return localStorage.getItem(PREF_KEY);
  } catch (e) {
    return null;
  }
};

export const setAppLockPref = (value) => {
  try {
    localStorage.setItem(PREF_KEY, value);
  } catch (e) {}
  window.dispatchEvent(new Event(APP_LOCK_CHANGED));
};

export const isBiometricAvailable = async () => {
  if (!Capacitor.isNativePlatform()) return false;
  try {
    const { isAvailable } = await NativeBiometric.isAvailable();
    return isAvailable;
  } catch (e) {
    return false;
  }
};

// Resolves true on a successful fingerprint/face match, false on cancel or failure.
export const verifyBiometric = async (t) => {
  try {
    await NativeBiometric.verifyIdentity({
      title: t("app.biometricReason"),
      reason: t("app.biometricReason"),
      negativeButtonText: t("app.cancel"),
      maxAttempts: 5,
    });
    return true;
  } catch (e) {
    return false;
  }
};
