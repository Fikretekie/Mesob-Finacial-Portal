import React, { useState } from "react";
import { useTranslation } from "react-i18next";
import { getPairedDevices, requestBluetooth } from "utils/driveMonitor";

const KINDS = [
  { kind: "truck", labelKey: "drives.vehicles.truck" },
  { kind: "car", labelKey: "drives.vehicles.car" },
];

// Trucking: link the truck's (and optionally the car's) Bluetooth, so most drives
// sort themselves. The linked devices stay on this phone.
const TruckBluetooth = ({ vehicles, onChange }) => {
  const { t } = useTranslation();
  const [devices, setDevices] = useState(null);
  const [denied, setDenied] = useState(false);

  const load = async () => {
    setDenied(false);
    const status = await requestBluetooth().catch(() => null);
    if (!status || !status.bluetooth) {
      setDenied(true);
      return;
    }
    setDevices(await getPairedDevices());
  };

  const linked = (kind) => (vehicles && vehicles[kind]) || [];
  const isLinked = (kind, address) => linked(kind).some((d) => d.address === address);

  const toggle = (kind, device) => {
    const other = kind === "truck" ? "car" : "truck";
    onChange({
      [kind]: isLinked(kind, device.address)
        ? linked(kind).filter((d) => d.address !== device.address)
        : [...linked(kind), device],
      // One device can't be both.
      [other]: linked(other).filter((d) => d.address !== device.address),
    });
  };

  const summary = KINDS.map(({ kind, labelKey }) => {
    const names = linked(kind).map((d) => d.name).join(", ");
    return `${t(labelKey)}: ${names || t("drives.vehicles.none")}`;
  }).join(" · ");

  return (
    <>
      <h2 className="mksv-prefs__title">{t("drives.vehicles.title")}</h2>
      <div className="mksv-prefs__group">
        <div className="mksv-setting">
          <div className="mksv-setting__text">
            <div className="mksv-setting__label">{t("drives.vehicles.hint")}</div>
            <div className="mksv-setting__hint">{summary}</div>
          </div>
        </div>
        {devices === null ? (
          <div className="mksv-setting">
            <button type="button" className="mksv-app-btn mksv-app-btn--ghost" onClick={load}>
              {t("drives.vehicles.link")}
            </button>
          </div>
        ) : devices.length === 0 ? (
          <div className="mksv-setting">
            <div className="mksv-setting__text">
              <div className="mksv-setting__hint">{t("drives.vehicles.noDevices")}</div>
            </div>
          </div>
        ) : (
          devices.map((device) => (
            <div key={device.address} className="mksv-setting">
              <div className="mksv-setting__text">
                <div className="mksv-setting__label">{device.name}</div>
              </div>
              <div className="mksv-vehicle-pick">
                {KINDS.map(({ kind, labelKey }) => (
                  <button
                    key={kind}
                    type="button"
                    aria-pressed={isLinked(kind, device.address)}
                    className={`mksv-vehicle-pick__btn${isLinked(kind, device.address) ? " is-on" : ""}`}
                    onClick={() => toggle(kind, device)}
                  >
                    {t(labelKey)}
                  </button>
                ))}
              </div>
            </div>
          ))
        )}
      </div>
      {denied && (
        <div className="mksv-setting-warn" role="status">
          <p>{t("drives.vehicles.denied")}</p>
        </div>
      )}
    </>
  );
};

export default TruckBluetooth;
