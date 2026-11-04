import React, { useState } from "react";
import { useTranslation } from "react-i18next";
import { Modal } from "reactstrap";
import { Geolocation } from "@capacitor/geolocation";

const HOURS = Array.from({ length: 25 }, (_, h) => h);

const hourLabel = (h) => new Date(2000, 0, 1, h % 24).toLocaleTimeString(undefined, { hour: "numeric" }) + (h === 24 ? " +1" : "");

// Account → Drives & reminders → "Always business". Matching drives are logged
// as business without asking (the notification still offers Personal).
const BusinessRules = ({ rules, onChange }) => {
  const { t } = useTranslation();
  const [adding, setAdding] = useState(false);
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const hours = rules.hours || { on: false, start: 8, end: 18 };
  const places = rules.places || [];

  const setHours = (patch) => onChange({ ...rules, hours: { ...hours, ...patch } });

  const addPlace = async () => {
    if (!name.trim()) return;
    setBusy(true);
    setError("");
    try {
      const pos = await Geolocation.getCurrentPosition({ enableHighAccuracy: true, timeout: 15000 });
      onChange({
        ...rules,
        places: [...places, { name: name.trim().slice(0, 40), lat: pos.coords.latitude, lng: pos.coords.longitude }],
      });
      setAdding(false);
      setName("");
    } catch (e) {
      setError(t("drives.rules.locationError"));
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <h2 className="mksv-prefs__title">{t("drives.rules.title")}</h2>
      <div className="mksv-prefs__group">
        <div className="mksv-setting">
          <div className="mksv-setting__text">
            <div id="mksv-rule-hours" className="mksv-setting__label">{t("drives.rules.hours")}</div>
            <div className="mksv-setting__hint">{t("drives.rules.hoursHint")}</div>
          </div>
          <button
            type="button"
            role="switch"
            aria-checked={hours.on}
            aria-labelledby="mksv-rule-hours"
            className={`mksv-switch${hours.on ? " is-on" : ""}`}
            onClick={() => setHours({ on: !hours.on })}
          >
            <span className="mksv-switch__thumb" />
          </button>
        </div>
        {hours.on && (
          <div className="mksv-setting mksv-rule-hours">
            <label className="mksv-rule-hours__field">
              <span>{t("drives.rules.from")}</span>
              <span className="mksv-select">
                <select value={hours.start} onChange={(e) => setHours({ start: Number(e.target.value) })}>
                  {HOURS.slice(0, 24).map((h) => (
                    <option key={h} value={h} disabled={h >= hours.end}>
                      {hourLabel(h)}
                    </option>
                  ))}
                </select>
              </span>
            </label>
            <label className="mksv-rule-hours__field">
              <span>{t("drives.rules.to")}</span>
              <span className="mksv-select">
                <select value={hours.end} onChange={(e) => setHours({ end: Number(e.target.value) })}>
                  {HOURS.slice(1).map((h) => (
                    <option key={h} value={h} disabled={h <= hours.start}>
                      {hourLabel(h)}
                    </option>
                  ))}
                </select>
              </span>
            </label>
          </div>
        )}

        {places.map((p, i) => (
          <div key={`${p.name}-${i}`} className="mksv-setting">
            <div className="mksv-setting__text">
              <div className="mksv-setting__label">{p.name}</div>
              <div className="mksv-setting__hint">{t("drives.rules.placeHint")}</div>
            </div>
            <button
              type="button"
              className="mksv-rule-remove"
              aria-label={t("drives.rules.remove", { name: p.name })}
              onClick={() => onChange({ ...rules, places: places.filter((_, j) => j !== i) })}
            >
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true">
                <path d="M18 6 6 18M6 6l12 12" />
              </svg>
            </button>
          </div>
        ))}
        <div className="mksv-setting">
          <button type="button" className="mksv-rule-add" onClick={() => setAdding(true)}>
            + {t("drives.rules.addPlace")}
          </button>
        </div>
      </div>

      <Modal isOpen={adding} toggle={() => !busy && setAdding(false)} labelledBy="mksv-add-place-title" className="mksv-confirm-sheet">
        <div className="mksv-confirm">
          <h2 id="mksv-add-place-title" className="mksv-sheet__title">{t("drives.rules.addTitle")}</h2>
          <p className="mksv-confirm__body">{t("drives.rules.addBody")}</p>
          <label className="mksv-field">
            <span>{t("drives.rules.placeName")}</span>
            <input
              type="text"
              value={name}
              maxLength={40}
              placeholder={t("drives.rules.placePlaceholder")}
              onChange={(e) => setName(e.target.value)}
            />
          </label>
          {error && (
            <p className="mksv-field__error" role="alert">
              {error}
            </p>
          )}
          <button type="button" className="mksv-app-btn mksv-app-btn--primary" disabled={busy || !name.trim()} onClick={addPlace}>
            {busy ? t("drives.rules.locating") : t("drives.rules.save")}
          </button>
          <button type="button" className="mksv-app-btn mksv-app-btn--ghost" disabled={busy} onClick={() => setAdding(false)}>
            {t("drives.disclosure.notNow")}
          </button>
        </div>
      </Modal>
    </>
  );
};

export default BusinessRules;
