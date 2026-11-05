import React, { useState } from "react";
import { useTranslation } from "react-i18next";
import { removeTrip } from "utils/tripStorage";
import { logBusinessMiles, TRIPS_CHANGED } from "utils/driveMonitor";

// Takes a saved trip out of Trip History, deductions and IFTA, after asking once.
const RemoveTripButton = ({ trip, onRemoved }) => {
  const { t } = useTranslation();
  const [asking, setAsking] = useState(false);
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState(false);

  // Older records can lack an id; there would be nothing to point the void at.
  if (!trip.tripId) return null;

  const confirm = async () => {
    setBusy(true);
    setFailed(false);
    try {
      await removeTrip(trip);
      if (trip.type === "business") logBusinessMiles(trip.dateKey, -Number(trip.miles || 0));
      else window.dispatchEvent(new Event(TRIPS_CHANGED));
      onRemoved(trip);
    } catch (e) {
      setFailed(true);
      setBusy(false);
    }
  };

  if (!asking) {
    return (
      <button type="button" className="mksv-trip-remove" onClick={() => setAsking(true)}>
        {t("tripHistory.remove")}
      </button>
    );
  }

  return (
    <div className="mksv-trip-remove__ask" role="group" aria-label={t("tripHistory.removeConfirm")}>
      <span>{failed ? t("tripHistory.removeError") : t("tripHistory.removeConfirm")}</span>
      <button type="button" className="mksv-trip-remove mksv-trip-remove--danger" disabled={busy} onClick={confirm}>
        {t("tripHistory.removeYes")}
      </button>
      <button type="button" className="mksv-trip-remove" disabled={busy} onClick={() => setAsking(false)}>
        {t("tripHistory.removeKeep")}
      </button>
    </div>
  );
};

export default RemoveTripButton;
