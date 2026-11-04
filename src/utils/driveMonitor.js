import { Capacitor, registerPlugin } from "@capacitor/core";
import { saveTrip } from "utils/tripStorage";
import { haversineMiles } from "utils/geo";
import { getStateAtPoint } from "utils/geoState";
import { currentRate, isTrucking } from "utils/mileageRate";

// Bridge to the Android drive detector (android/.../drive/DriveMonitorPlugin).
// Android notices the user got in a car, records the drive in the background
// and keeps it on the phone; this module saves those drives to the backend
// once the app is open (the app holds the sign-in, the background code
// doesn't) and passes the user's settings + translated notification text down.
const DriveMonitor = registerPlugin("DriveMonitor");

const SETTINGS_KEY = "mksv-drive-settings";
export const DRIVES_CHANGED = "mksv-drives-changed";
/** Fired after a trip is saved, so Home's deduction card refreshes. */
export const TRIPS_CHANGED = "mksv-trips-changed";

const DEFAULTS = {
  enabled: false,
  autoRecord: true,
  fuelStops: true,
  storeStops: true,
  workdaysOnly: false,
  taxReminders: true,
  weeklySummary: true,
  // "Always business": drives from/to a saved place, or starting in work hours on a weekday.
  rules: { hours: { on: false, start: 8, end: 18 }, places: [] },
};

export const driveDetectionAvailable = () => Capacitor.getPlatform() === "android";

export function getDriveSettings() {
  try {
    return { ...DEFAULTS, ...(JSON.parse(localStorage.getItem(SETTINGS_KEY)) || {}) };
  } catch (e) {
    return { ...DEFAULTS };
  }
}

/** Set at sign-out when detection was on, so the same person signing back in gets it back. */
export const DRIVE_RESUME_KEY = "mksv-drive-resume";

/**
 * Settings to push to the phone at startup. On/off comes from Android, not
 * this app's copy: the WebView saves localStorage lazily, so a write made just
 * before the app is closed can be lost, and pushing that stale copy used to
 * switch background drive detection off by itself.
 */
async function startupDriveSettings() {
  const settings = getDriveSettings();
  let status;
  try {
    status = await DriveMonitor.getStatus();
  } catch (e) {
    return settings;
  }
  let enabled = !!status?.enabled;
  try {
    if (!enabled && localStorage.getItem(DRIVE_RESUME_KEY)) enabled = true;
    localStorage.removeItem(DRIVE_RESUME_KEY);
  } catch (e) {
    // Storage blocked — Android's state stands.
  }
  const merged = { ...settings, enabled };
  if (merged.enabled !== settings.enabled) saveDriveSettings(merged);
  return merged;
}

export function saveDriveSettings(settings) {
  try {
    localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings));
  } catch (e) {
    // Storage blocked — applies until the app restarts.
  }
}

const NATIVE_STRING_KEYS = [
  "channelDrives", "channelRecording",
  "askTitle", "askBody", "askStart", "askDismiss",
  "recordingTitle", "recordingBody", "recordingPersonal",
  "classifyTitle", "classifyBody", "business", "personal", "loaded", "empty",
  "forgotTitle", "forgotBody",
  "fuelTitle", "fuelTitleGeneric", "fuelBody", "fuelScan", "fuelUpload",
  "storeTitle", "storeTitleGeneric", "storeBody", "repairTitleGeneric", "repairBody",
  "personalTitle", "personalBody", "undo",
  "autoTitle", "autoBody", "ruleHours", "alreadyTitle", "alreadyBody",
  "weeklyTitle", "weeklyDeduction", "weeklyWaiting",
  "widgetToday", "widgetWeek", "widgetRecording",
];

/** Drives marked personal stay undoable this long, then are dropped (never saved). */
export const UNDO_WINDOW_MS = 24 * 60 * 60 * 1000;

/** Drives a business rule marked are held this long, so "Personal" on the notification still works. */
const RULE_GRACE_MS = 15 * 60 * 1000;

/** Sends settings + notification text (in the app's language) to Android. */
export async function configureDriveMonitor(t, settings) {
  if (!driveDetectionAvailable()) return null;
  if (!settings) settings = await startupDriveSettings();
  const strings = {};
  NATIVE_STRING_KEYS.forEach((k) => {
    strings[k] = t(`drives.native.${k}`);
  });
  // Trucking: no mileage deduction (the weekly summary skips it when the rate is 0);
  // fuel receipts matter for IFTA there, for everyone else they're an expense.
  const trucking = isTrucking();
  strings.fuelBody = t(trucking ? "drives.native.fuelBody" : "drives.native.fuelBodyExpense");
  if (trucking) {
    // Loaded / Empty / Personal, and personal miles still go in the IFTA log.
    strings.classifyBody = t("drives.native.classifyBodyTrucking");
    strings.personalTitle = t("drives.native.personalTitleTrucking");
    strings.personalBody = t("drives.native.personalBodyTrucking");
  }
  try {
    return await DriveMonitor.configure({ ...settings, trucking, ratePerMile: trucking ? 0 : currentRate(), strings });
  } catch (e) {
    return null;
  }
}

/** Signing out: stop background drive detection, so nothing is recorded for
 * nobody and later handed to whoever signs in next. */
export function stopDriveDetection() {
  if (!driveDetectionAvailable()) return Promise.resolve();
  try {
    if (getDriveSettings().enabled) localStorage.setItem(DRIVE_RESUME_KEY, "1");
  } catch (e) {
    // Storage blocked — they'll switch it back on by hand.
  }
  return DriveMonitor.configure({ enabled: false, strings: {} }).catch(() => {});
}

export const getDriveStatus = () => DriveMonitor.getStatus();
export const requestDrivePermissions = () => DriveMonitor.requestDrivePermissions();
export const requestBackgroundLocation = () => DriveMonitor.requestBackgroundLocation();
export const openDriveAppSettings = () => DriveMonitor.openAppSettings();

/** Tells Android a hand-started trip is running, so it doesn't record the same drive twice. */
export function setManualTrip(active) {
  if (!driveDetectionAvailable()) return;
  DriveMonitor.setManualTrip({ active }).catch(() => {});
}

/** Gives the phone side the server's business miles per day (widget + weekly summary). */
export function pushMilesLog(trips) {
  if (!driveDetectionAvailable()) return;
  const since = new Date();
  since.setDate(since.getDate() - 21);
  const sinceKey = dateKeyOf(since);
  const log = {};
  trips.forEach((trip) => {
    if (trip.type === "business" && trip.dateKey >= sinceKey) log[trip.dateKey] = (log[trip.dateKey] || 0) + Number(trip.miles || 0);
  });
  DriveMonitor.setMilesLog({ log }).catch(() => {});
}

/** A business trip was saved from the app (Mileage Tracker / review screen). */
export function logBusinessMiles(dateKey, miles) {
  window.dispatchEvent(new Event(TRIPS_CHANGED));
  if (!driveDetectionAvailable()) return;
  DriveMonitor.logMiles({ dateKey, miles: Number(miles) }).catch(() => {});
}

export async function getRecordedDrives() {
  if (!driveDetectionAvailable()) return [];
  try {
    const { drives } = await DriveMonitor.getDrives();
    return Array.isArray(drives) ? drives : [];
  } catch (e) {
    return [];
  }
}

function dateKeyOf(d) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

/** Splits a drive's miles across the US states its sampled points fall in (for IFTA). */
async function stateBreakdownOf(drive) {
  const points = Array.isArray(drive.points) ? drive.points : [];
  if (points.length < 2) {
    const only = points[0] && (await getStateAtPoint(points[0][0], points[0][1]).catch(() => null));
    return only ? [{ state: only, miles: Number(drive.miles.toFixed(2)) }] : [];
  }
  const raw = {};
  let sampled = 0;
  for (let i = 1; i < points.length; i++) {
    const [lat1, lng1] = points[i - 1];
    const [lat2, lng2] = points[i];
    const seg = haversineMiles(lat1, lng1, lat2, lng2);
    const state = await getStateAtPoint((lat1 + lat2) / 2, (lng1 + lng2) / 2).catch(() => null);
    sampled += seg;
    if (state) raw[state] = (raw[state] || 0) + seg;
  }
  // Points are sampled, so scale the per-state split to the measured total.
  const scale = sampled > 0 ? drive.miles / sampled : 0;
  return Object.entries(raw).map(([state, miles]) => ({ state, miles: Number((miles * scale).toFixed(2)) }));
}

/** Trucking: what a business drive's trip purpose says (both count as business miles). */
export const LOAD_PURPOSE = { loaded: "Loaded", empty: "Empty (deadhead)" };
/** Trucking: personal drives are kept as trips of this purpose — IFTA counts every mile the truck drives. */
export const PERSONAL_PURPOSE = "Personal";

export async function tripFromDrive(drive, { type, purpose = "Other", note = "" }) {
  const ended = new Date(drive.endedAt);
  return {
    dateKey: dateKeyOf(ended),
    date: ended.toLocaleDateString("en-US", { month: "short", day: "numeric" }),
    time: ended.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" }),
    miles: Number(Number(drive.miles).toFixed(2)),
    durationSeconds: Math.round((drive.endedAt - drive.startedAt) / 1000),
    type,
    purpose,
    note,
    stateBreakdown: await stateBreakdownOf(drive),
  };
}

/** Saves one drive as a trip, then removes it from the phone. */
export async function saveDrive(drive, details) {
  const trip = await tripFromDrive(drive, details);
  await saveTrip(trip);
  await DriveMonitor.removeDrive({ id: drive.id });
  return trip;
}

export async function discardDrive(drive) {
  await DriveMonitor.removeDrive({ id: drive.id });
}

/** Personal: kept on the phone for UNDO_WINDOW_MS in case it was a slip, then dropped (trucking: saved for IFTA). */
export const markPersonal = (drive) => DriveMonitor.classifyDrive({ id: drive.id, type: "personal" });
export const restoreDrive = (drive) => DriveMonitor.restoreDrive({ id: drive.id });

let syncing = null;

/**
 * Saves drives already marked Business from the notification and returns
 * the ones still waiting for the user. Personal drives stay on the phone for
 * UNDO_WINDOW_MS (undo); then they are dropped — they don't belong in the
 * books — except for trucking, where IFTA needs every mile the truck drove:
 * there they're saved as personal trips (never counted as business).
 */
export function syncDrives() {
  if (!driveDetectionAvailable() || !localStorage.getItem("userId")) return Promise.resolve([]);
  if (syncing) return syncing;
  syncing = (async () => {
    const drives = await getRecordedDrives();
    const waiting = [];
    for (const drive of drives) {
      if (drive.type === "business") {
        if (drive.ruleNote && Date.now() - drive.endedAt < RULE_GRACE_MS) continue;
        try {
          // Already counted on the phone when it was marked business.
          const purpose = LOAD_PURPOSE[drive.load] || "Other";
          await saveDrive(drive, { type: "business", purpose, note: drive.ruleNote || "" });
          window.dispatchEvent(new Event(TRIPS_CHANGED));
        } catch (e) {
          // Offline or signed out — stays on the phone, retried next time.
        }
      } else if (drive.type === "personal") {
        if (Date.now() - (drive.personalAt || 0) <= UNDO_WINDOW_MS) continue;
        if (isTrucking()) {
          try {
            await saveDrive(drive, { type: "personal", purpose: PERSONAL_PURPOSE });
            window.dispatchEvent(new Event(TRIPS_CHANGED));
          } catch (e) {
            // Retried next time.
          }
        } else {
          await discardDrive(drive).catch(() => {});
        }
      } else {
        waiting.push(drive);
      }
    }
    window.dispatchEvent(new CustomEvent(DRIVES_CHANGED, { detail: waiting.length }));
    return waiting;
  })().finally(() => {
    syncing = null;
  });
  return syncing;
}

/** Debug builds: fake a drive start/end or a fuel stop on the emulator. */
export const simulateDrive = (opts) => DriveMonitor.simulate(opts);
