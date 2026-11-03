import { useEffect } from "react";
import { useTranslation } from "react-i18next";
import { App as CapacitorApp } from "@capacitor/app";
import { configureDriveMonitor, driveDetectionAvailable, getDriveSettings, pushMilesLog, syncDrives } from "utils/driveMonitor";
import { fetchTripsShared } from "utils/tripStorage";
import { scheduleTaxReminders } from "utils/taxReminders";

// Mounted once in the signed-in layout (phone app only). Saves drives the
// user sorted from a notification, and keeps the notification text and
// deadline reminders in the app's current language.
const DriveSync = () => {
  const { t, i18n } = useTranslation();

  useEffect(() => {
    const settings = getDriveSettings();
    // Always: also switches the phone side off if the setting is off (it
    // recovers the phone's "on" if this app's saved copy went missing).
    if (driveDetectionAvailable()) configureDriveMonitor(t);
    scheduleTaxReminders(t, {
      enabled: settings.taxReminders,
      trucking: localStorage.getItem("businessType") === "Trucking",
    });
    // eslint-disable-next-line
  }, [i18n.language]);

  useEffect(() => {
    if (!driveDetectionAvailable()) return undefined;
    const sync = () =>
      syncDrives()
        .then(() => fetchTripsShared())
        .then(pushMilesLog)
        .catch(() => {});
    sync();
    const l = CapacitorApp.addListener("resume", sync);
    return () => {
      l.then((h) => h.remove());
    };
  }, []);

  return null;
};

export default DriveSync;
