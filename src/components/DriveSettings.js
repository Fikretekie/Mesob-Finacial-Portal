import React, { useCallback, useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { Modal } from "reactstrap";
import { App as CapacitorApp } from "@capacitor/app";
import { LocalNotifications } from "@capacitor/local-notifications";
import {
  configureDriveMonitor,
  driveDetectionAvailable,
  getDriveSettings,
  getDriveStatus,
  openDriveAppSettings,
  requestBackgroundLocation,
  requestDrivePermissions,
  saveDriveSettings,
} from "utils/driveMonitor";
import { scheduleTaxReminders } from "utils/taxReminders";
import BusinessRules from "components/BusinessRules";
import TruckBluetooth from "components/TruckBluetooth";
import { isRideshare, isTrucking } from "utils/mileageRate";

const Switch = ({ id, on, onChange, disabled }) => (
  <button
    type="button"
    role="switch"
    aria-checked={on}
    aria-labelledby={id}
    disabled={disabled}
    className={`mksv-switch${on ? " is-on" : ""}`}
    onClick={() => onChange(!on)}
  >
    <span className="mksv-switch__thumb" />
  </button>
);

const Row = ({ id, label, hint, on, onChange, disabled }) => (
  <div className="mksv-setting">
    <div className="mksv-setting__text">
      <div id={id} className="mksv-setting__label">{label}</div>
      {hint && <div className="mksv-setting__hint">{hint}</div>}
    </div>
    <Switch id={id} on={on} onChange={onChange} disabled={disabled} />
  </div>
);

// Account → "Drives & reminders". Turning drive detection on first shows the
// disclosure Google Play requires before asking for background location.
const DriveSettings = () => {
  const { t, i18n } = useTranslation();
  const [settings, setSettings] = useState(getDriveSettings);
  const [status, setStatus] = useState(null);
  const [disclosure, setDisclosure] = useState(false);

  const refreshStatus = useCallback(() => {
    getDriveStatus().then(setStatus).catch(() => {});
  }, []);

  useEffect(() => {
    if (!driveDetectionAvailable()) return undefined;
    refreshStatus();
    // Back from Android's settings page after "Allow all the time".
    const l = CapacitorApp.addListener("resume", refreshStatus);
    return () => {
      l.then((h) => h.remove());
    };
  }, [refreshStatus]);

  if (!driveDetectionAvailable()) return null;

  const apply = async (next) => {
    setSettings(next);
    saveDriveSettings(next);
    const s = await configureDriveMonitor(t, next);
    if (s) setStatus(s);
  };

  const turnOn = async () => {
    setDisclosure(false);
    let s = await requestDrivePermissions().catch(() => null);
    if (s && s.location && !s.backgroundLocation) {
      s = (await requestBackgroundLocation().catch(() => null)) || s;
    }
    if (s) setStatus(s);
    if (s && s.activity) await apply({ ...settings, enabled: true });
  };

  const setTaxReminders = async (on) => {
    if (on) await LocalNotifications.requestPermissions().catch(() => {});
    const next = { ...settings, taxReminders: on };
    setSettings(next);
    saveDriveSettings(next);
    scheduleTaxReminders(t, { enabled: on, trucking: localStorage.getItem("businessType") === "Trucking" });
  };

  const needsBackground = settings.enabled && status && !status.backgroundLocation;
  const notificationsOff = settings.enabled && status && !status.notifications;
  const activityOff = settings.enabled && status && !status.activity;
  const batteryLimited = settings.enabled && status && status.batteryUnrestricted === false;
  const when = (ms) => new Date(ms).toLocaleString(i18n.language, { dateStyle: "medium", timeStyle: "short" });
  const stopResult = () => {
    if (status.lastCheckResult === "failed") return t("drives.settings.stopFailed");
    if (status.lastCheckResult === "none") return t("drives.settings.stopNone");
    return status.lastCheckName || t("drives.settings.stopFound");
  };

  return (
    <section className="mksv-prefs" aria-labelledby="mksv-drive-title">
      <h2 id="mksv-drive-title" className="mksv-prefs__title">{t("drives.settings.title")}</h2>
      <div className="mksv-prefs__group">
        <Row
          id="mksv-drive-enabled"
          label={t("drives.settings.detect")}
          hint={t("drives.settings.detectHint")}
          on={settings.enabled}
          onChange={(on) => (on ? setDisclosure(true) : apply({ ...settings, enabled: false }))}
        />
        {settings.enabled && (
          <>
            <Row
              id="mksv-drive-auto"
              label={t("drives.settings.autoRecord")}
              hint={t("drives.settings.autoRecordHint")}
              on={settings.autoRecord}
              onChange={(on) => apply({ ...settings, autoRecord: on })}
            />
            <Row
              id="mksv-drive-fuel"
              label={t("drives.settings.fuel")}
              hint={t("drives.settings.fuelHint")}
              on={settings.fuelStops}
              onChange={(on) => apply({ ...settings, fuelStops: on })}
            />
            <Row
              id="mksv-drive-stores"
              label={t("drives.settings.stores")}
              hint={t("drives.settings.storesHint")}
              on={settings.storeStops}
              onChange={(on) => apply({ ...settings, storeStops: on })}
            />
            {isRideshare() && (
              <Row
                id="mksv-drive-shift-reminder"
                label={t("drives.settings.shiftReminder")}
                hint={t("drives.settings.shiftReminderHint")}
                on={settings.shiftReminder}
                onChange={(on) => apply({ ...settings, shiftReminder: on })}
              />
            )}
            <Row
              id="mksv-drive-workdays"
              label={t("drives.settings.workdays")}
              hint={t("drives.settings.workdaysHint")}
              on={settings.workdaysOnly}
              onChange={(on) => apply({ ...settings, workdaysOnly: on })}
            />
            <Row
              id="mksv-drive-weekly"
              label={t("drives.settings.weekly")}
              hint={t("drives.settings.weeklyHint")}
              on={settings.weeklySummary}
              onChange={(on) => apply({ ...settings, weeklySummary: on })}
            />
          </>
        )}
        <Row
          id="mksv-drive-tax"
          label={t("drives.settings.tax")}
          hint={t("drives.settings.taxHint")}
          on={settings.taxReminders}
          onChange={setTaxReminders}
        />
      </div>

      {/* Trucking: no "always business" rules, because the car can leave the same yard. */}
      {settings.enabled && settings.autoRecord && !isTrucking() && (
        <BusinessRules rules={settings.rules} onChange={(rules) => apply({ ...settings, rules })} />
      )}
      {settings.enabled && settings.autoRecord && isTrucking() && (
        <TruckBluetooth vehicles={settings.vehicles} onChange={(vehicles) => apply({ ...settings, vehicles })} />
      )}

      {settings.enabled && status && (
        <div className="mksv-prefs__group">
          <div className="mksv-setting">
            <div className="mksv-setting__text">
              <div className="mksv-setting__label">{t("drives.settings.lastDrive")}</div>
              <div className="mksv-setting__hint">{status.lastDriveAt ? when(status.lastDriveAt) : t("drives.settings.never")}</div>
            </div>
          </div>
          <div className="mksv-setting">
            <div className="mksv-setting__text">
              <div className="mksv-setting__label">{t("drives.settings.lastStop")}</div>
              <div className="mksv-setting__hint">
                {status.lastCheckAt ? `${when(status.lastCheckAt)} · ${stopResult()}` : t("drives.settings.never")}
              </div>
            </div>
          </div>
        </div>
      )}

      {activityOff && (
        <div className="mksv-setting-warn" role="status">
          <p>{t("drives.settings.needsActivity")}</p>
          <button
            type="button"
            className="mksv-app-btn mksv-app-btn--ghost"
            onClick={() => requestDrivePermissions().then(setStatus).catch(() => {})}
          >
            {t("drives.settings.allow")}
          </button>
        </div>
      )}

      {batteryLimited && (
        <div className="mksv-setting-warn" role="status">
          <p>{t("drives.settings.needsBattery")}</p>
          <button type="button" className="mksv-app-btn mksv-app-btn--ghost" onClick={() => openDriveAppSettings().catch(() => {})}>
            {t("drives.settings.allow")}
          </button>
        </div>
      )}

      {(needsBackground || notificationsOff) && (
        <div className="mksv-setting-warn" role="status">
          <p>{needsBackground ? t("drives.settings.needsBackground") : t("drives.settings.needsNotifications")}</p>
          <button
            type="button"
            className="mksv-app-btn mksv-app-btn--ghost"
            onClick={() => (needsBackground ? requestBackgroundLocation() : requestDrivePermissions()).then(setStatus).catch(() => {})}
          >
            {t("drives.settings.allow")}
          </button>
        </div>
      )}

      <Modal isOpen={disclosure} toggle={() => setDisclosure(false)} labelledBy="mksv-drive-disclosure-title" className="mksv-confirm-sheet">
        <div className="mksv-confirm">
          <h2 id="mksv-drive-disclosure-title" className="mksv-sheet__title">{t("drives.disclosure.title")}</h2>
          <p className="mksv-confirm__body">{t("drives.disclosure.body")}</p>
          <ul className="mksv-disclosure__list">
            <li>{t("drives.disclosure.point1")}</li>
            <li>{t("drives.disclosure.point2")}</li>
            <li>{t("drives.disclosure.point3")}</li>
          </ul>
          <button type="button" className="mksv-app-btn mksv-app-btn--primary" onClick={turnOn}>
            {t("drives.disclosure.continue")}
          </button>
          <button type="button" className="mksv-app-btn mksv-app-btn--ghost" onClick={() => setDisclosure(false)}>
            {t("drives.disclosure.notNow")}
          </button>
        </div>
      </Modal>
    </section>
  );
};

export default DriveSettings;
