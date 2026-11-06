// First-run setup (components/AppSetup.js). Android won't let an app switch these
// on by itself, so the app walks the person through each one once.
export const SETUP_DONE_KEY = "mksv-setup-done";
export const SETUP_OPEN = "mksv:setup-open";
export const SETUP_CHANGED = "mksv:setup-changed";

export const isSetupDone = () => {
  try {
    return localStorage.getItem(SETUP_DONE_KEY) === "1";
  } catch (e) {
    // Storage blocked: don't keep asking on every open.
    return true;
  }
};

export const markSetupDone = () => {
  try {
    localStorage.setItem(SETUP_DONE_KEY, "1");
  } catch (e) {
    // Asked again next time.
  }
};

/** No drive noticed for this long may mean Android stopped telling us. */
export const DETECTION_STALE_MS = 7 * 24 * 60 * 60 * 1000;

export const detectionLooksStale = (status) =>
  !!status.enabled &&
  !!status.detectionSince &&
  Date.now() - Math.max(status.detectionSince, status.lastDriveAt || 0) >= DETECTION_STALE_MS;

/** What tracking still needs. Battery isn't here: drives usually still record without it. */
export const trackingIncomplete = (status, settings) =>
  !settings.enabled || !status.activity || !status.location || !status.backgroundLocation || !status.notifications;
