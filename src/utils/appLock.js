import { Capacitor } from "@capacitor/core";
import { NativeBiometric } from "@capgo/capacitor-native-biometric";
import { driveDetectionAvailable, getDriveStatus, noteAppSeen } from "utils/driveMonitor";

// "on" | "off" | null (not asked yet). Logout clears localStorage, so the
// next person to sign in on this phone is asked again.
const PREF_KEY = "mksv-app-lock";

export const APP_LOCK_CHANGED = "mksv:app-lock-changed";

/** Stays unlocked while they're working: locks only after this long with no use and no driving. */
export const STAY_UNLOCKED_MS = 4 * 60 * 60 * 1000;
const LAST_SEEN_KEY = "mksv-last-seen";

/** The app went to the background, or was just unlocked. */
export const noteSeen = () => {
  try {
    localStorage.setItem(LAST_SEEN_KEY, String(Date.now()));
  } catch (e) {}
  if (driveDetectionAvailable()) noteAppSeen();
};

/** Should opening the app now ask for the fingerprint or face? */
export const needsUnlock = async () => {
  let lastActive = 0;
  try {
    lastActive = Number(localStorage.getItem(LAST_SEEN_KEY)) || 0;
  } catch (e) {}
  if (driveDetectionAvailable()) {
    const status = await getDriveStatus().catch(() => null);
    if (status) {
      if (status.recording || status.manualTrip) return false;
      // Android's copy, since the WebView saves its storage lazily.
      lastActive = Math.max(lastActive, status.lastSeenAt || 0);
      if (lastActive < Date.now() - status.uptimeMs) return true; // phone restarted since
      lastActive = Math.max(lastActive, status.lastMovedAt || 0, status.lastDriveAt || 0);
    }
  }
  return !lastActive || Date.now() - lastActive >= STAY_UNLOCKED_MS;
};

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
