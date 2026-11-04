import React, { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { useNavigate } from "react-router-dom";
import AppListSkeleton from "components/AppListSkeleton";
import { haptic } from "utils/haptics";
import { isTrucking } from "utils/mileageRate";
import {
  getRecordedDrives,
  logBusinessMiles,
  markPersonal,
  restoreDrive,
  saveDrive,
  syncDrives,
  DRIVES_CHANGED,
  LOAD_PURPOSE,
  UNDO_WINDOW_MS,
} from "utils/driveMonitor";

// Same purposes (and stored values) as the Mileage Tracker's save sheet.
const PURPOSES = [
  { value: "Client Visit", key: "mileageTracker.purposeClientVisit" },
  { value: "Delivery", key: "mileageTracker.purposeDelivery" },
  { value: "Commute", key: "mileageTracker.purposeCommute" },
  { value: "Other", key: "mileageTracker.purposeOther" },
];

const newestFirst = (a, b) => b.endedAt - a.endedAt;

// Drives the phone recorded on its own, waiting for "Business or personal?".
// Opened from the drive notification and the Home banner. Personal drives are
// never saved, but stay restorable here for a day in case of a slip.
const DriveReview = () => {
  const { t } = useTranslation();
  const navigate = useNavigate();
  // Trucking: Loaded / Empty / Personal; personal miles are kept for IFTA.
  const trucking = isTrucking();
  const [drives, setDrives] = useState(null);
  const [personal, setPersonal] = useState([]);
  const [purposes, setPurposes] = useState({});
  const [busyId, setBusyId] = useState(null);
  const [error, setError] = useState("");
  const [undo, setUndo] = useState(null);
  const undoTimer = useRef(null);

  useEffect(() => {
    (async () => {
      const waiting = await syncDrives();
      const all = await getRecordedDrives();
      setDrives([...waiting].sort(newestFirst));
      setPersonal(
        all.filter((d) => d.type === "personal" && Date.now() - (d.personalAt || 0) <= UNDO_WINDOW_MS).sort(newestFirst)
      );
    })();
    return () => clearTimeout(undoTimer.current);
  }, []);

  const publishCount = (list) => window.dispatchEvent(new CustomEvent(DRIVES_CHANGED, { detail: list.length }));

  const removeFromWaiting = (drive) =>
    setDrives((list) => {
      const next = list.filter((d) => d.id !== drive.id);
      publishCount(next);
      return next;
    });

  const save = async (drive, load) => {
    setBusyId(drive.id);
    setError("");
    try {
      const purpose = load ? LOAD_PURPOSE[load] : purposes[drive.id] || "Other";
      const trip = await saveDrive(drive, { type: "business", purpose });
      logBusinessMiles(trip.dateKey, trip.miles);
      haptic("success");
      removeFromWaiting(drive);
    } catch (e) {
      setError(t("drives.review.saveError"));
    } finally {
      setBusyId(null);
    }
  };

  const choosePersonal = async (drive) => {
    setBusyId(drive.id);
    try {
      await markPersonal(drive);
      removeFromWaiting(drive);
      setPersonal((list) => [{ ...drive, type: "personal", personalAt: Date.now() }, ...list]);
      clearTimeout(undoTimer.current);
      setUndo(drive);
      undoTimer.current = setTimeout(() => setUndo(null), 6000);
    } finally {
      setBusyId(null);
    }
  };

  const restore = async (drive) => {
    await restoreDrive(drive);
    clearTimeout(undoTimer.current);
    setUndo(null);
    setPersonal((list) => list.filter((d) => d.id !== drive.id));
    setDrives((list) => {
      const next = [...list, { ...drive, type: null }].sort(newestFirst);
      publishCount(next);
      return next;
    });
  };

  const dateFmt = (ms) => new Date(ms).toLocaleDateString(undefined, { weekday: "short", month: "short", day: "numeric" });
  const timeFmt = (ms) => new Date(ms).toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" });
  const when = (d) => `${dateFmt(d.endedAt)} · ${timeFmt(d.startedAt)} – ${timeFmt(d.endedAt)}`;

  return (
    <div className="content">
      <div className="mksv-page">
        <header className="mksv-page__head">
          <h1 className="mksv-page__title">{t("drives.review.title")}</h1>
        </header>
        <p className="mksv-drives__intro">{t(trucking ? "drives.review.introTrucking" : "drives.review.intro")}</p>

        {error && (
          <div className="login-notice" role="alert">
            {error}
          </div>
        )}

        {drives === null ? (
          <AppListSkeleton rows={3} />
        ) : drives.length === 0 ? (
          <div className="mksv-empty">
            <div className="mksv-empty__icon" aria-hidden="true">
              <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M20 6 9 17l-5-5" />
              </svg>
            </div>
            <h2 className="mksv-empty__title">{t("drives.review.emptyTitle")}</h2>
            <p className="mksv-empty__body">{t("drives.review.emptyBody")}</p>
            <button type="button" className="mksv-app-btn mksv-app-btn--ghost" onClick={() => navigate("/customer/trip-history")}>
              {t("drives.review.viewTrips")}
            </button>
          </div>
        ) : (
          <ul className="mksv-drives">
            {drives.map((drive) => (
              <li key={drive.id} className="mksv-drive">
                <div className="mksv-drive__head">
                  <span className="mksv-drive__miles">
                    {Number(drive.miles).toFixed(1)} <small>{t("drives.review.mi")}</small>
                  </span>
                  <span className="mksv-drive__when">{when(drive)}</span>
                </div>

                {!trucking && (
                <label className="mksv-drive__purpose">
                  <span>{t("drives.review.purpose")}</span>
                  <span className="mksv-select">
                    <select
                      value={purposes[drive.id] || "Other"}
                      onChange={(e) => setPurposes((p) => ({ ...p, [drive.id]: e.target.value }))}
                    >
                      {PURPOSES.map((p) => (
                        <option key={p.value} value={p.value}>
                          {t(p.key)}
                        </option>
                      ))}
                    </select>
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                      <path d="M6 9l6 6 6-6" />
                    </svg>
                  </span>
                </label>
                )}

                <div className="mksv-drive__actions">
                  {trucking ? (
                    <>
                      <button type="button" className="mksv-app-btn mksv-app-btn--primary" disabled={busyId === drive.id} onClick={() => save(drive, "loaded")}>
                        {t("drives.native.loaded")}
                      </button>
                      <button type="button" className="mksv-app-btn mksv-app-btn--primary" disabled={busyId === drive.id} onClick={() => save(drive, "empty")}>
                        {t("drives.native.empty")}
                      </button>
                    </>
                  ) : (
                    <button type="button" className="mksv-app-btn mksv-app-btn--primary" disabled={busyId === drive.id} onClick={() => save(drive)}>
                      {t("drives.native.business")}
                    </button>
                  )}
                  <button type="button" className="mksv-app-btn mksv-app-btn--ghost" disabled={busyId === drive.id} onClick={() => choosePersonal(drive)}>
                    {t("drives.native.personal")}
                  </button>
                </div>
              </li>
            ))}
          </ul>
        )}

        {personal.length > 0 && (
          <section className="mksv-drives__recent" aria-labelledby="mksv-drives-recent">
            <h2 id="mksv-drives-recent" className="mksv-prefs__title">{t("drives.review.recentTitle")}</h2>
            <p className="mksv-drives__hint">{t(trucking ? "drives.review.recentHintTrucking" : "drives.review.recentHint")}</p>
            <ul className="mksv-list">
              {personal.map((drive) => (
                <li key={drive.id} className="mksv-row mksv-drive-personal">
                  <span className="mksv-row__body">
                    <span className="mksv-row__title">
                      {Number(drive.miles).toFixed(1)} {t("drives.review.mi")}
                    </span>
                    <span className="mksv-row__sub">{when(drive)}</span>
                  </span>
                  <button type="button" className="mksv-drive-personal__restore" onClick={() => restore(drive)}>
                    {t("drives.review.restore")}
                  </button>
                </li>
              ))}
            </ul>
          </section>
        )}
      </div>

      {undo && (
        <div className="mksv-undo" role="status">
          <span>{t("drives.review.personalToast")}</span>
          <button type="button" onClick={() => restore(undo)}>
            {t("drives.native.undo")}
          </button>
        </div>
      )}
    </div>
  );
};

export default DriveReview;
