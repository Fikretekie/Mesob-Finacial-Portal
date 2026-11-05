import React, { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { useNavigate } from "react-router-dom";
import AppListSkeleton from "components/AppListSkeleton";
import { haptic } from "utils/haptics";
import { isTrucking } from "utils/mileageRate";
import {
  discardDrive,
  getPlaceName,
  getRecordedDrives,
  isOwnCarDrive,
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

/** Walking at a gas station splits the recording, but it's still one trip if he pulled away soon after. */
const SAME_TRIP_GAP_MS = 15 * 60 * 1000;

/** Newest-first drives, as trips of one or more parts. A truck-to-car swap elsewhere stays separate. */
function groupTrips(drives, split) {
  const trips = [];
  [...drives].reverse().forEach((drive) => {
    const open = trips[trips.length - 1];
    const previous = open && open[open.length - 1];
    if (
      previous &&
      previous.endedAtFuel &&
      !split.has(previous.id) &&
      drive.startedAt - previous.endedAt <= SAME_TRIP_GAP_MS
    ) {
      open.push(drive);
    } else {
      trips.push([drive]);
    }
  });
  return trips.reverse();
}

// Drives the phone recorded on its own, waiting for "Business or personal?".
// Opened from the drive notification and the Home banner. Personal drives are
// never saved, but stay restorable here for a day in case of a slip.
// Trucking: the day's pieces. Only what's confirmed as the truck reaches IFTA.
const DriveReview = () => {
  const { t } = useTranslation();
  const navigate = useNavigate();
  // Trucking: Loaded / Empty / Not my truck; personal use of the truck is kept for IFTA.
  const trucking = isTrucking();
  const [ownCar, setOwnCar] = useState([]);
  const [places, setPlaces] = useState({});
  // Parts of a joined trip the driver chose to separate (by the earlier part's id).
  const [split, setSplit] = useState(() => new Set());
  const [drives, setDrives] = useState(null);
  const [personal, setPersonal] = useState([]);
  const [purposes, setPurposes] = useState({});
  const [busyId, setBusyId] = useState(null);
  const [error, setError] = useState("");
  const [undo, setUndo] = useState(null);
  const undoTimer = useRef(null);
  // A "Not my truck" drive waits here during its Undo window. If the app is closed
  // first it simply comes back for review, so nothing is lost by accident.
  const pendingDiscard = useRef(null);

  const flushDiscard = () => {
    (pendingDiscard.current || []).forEach((drive) => discardDrive(drive).catch(() => {}));
    pendingDiscard.current = null;
  };

  useEffect(() => {
    (async () => {
      const waiting = await syncDrives();
      const all = await getRecordedDrives();
      setDrives([...waiting].sort(newestFirst));
      setOwnCar(all.filter(isOwnCarDrive).sort(newestFirst));
      if (trucking) {
        waiting.forEach(async (drive) => {
          const points = Array.isArray(drive.points) ? drive.points : [];
          if (points.length === 0) return;
          const first = points[0];
          const last = points[points.length - 1];
          const [from, to] = await Promise.all([getPlaceName(first[0], first[1]), getPlaceName(last[0], last[1])]);
          setPlaces((p) => ({ ...p, [drive.id]: { from, to } }));
        });
      }
      setPersonal(
        all.filter((d) => d.type === "personal" && Date.now() - (d.personalAt || 0) <= UNDO_WINDOW_MS).sort(newestFirst)
      );
    })();
    return () => {
      clearTimeout(undoTimer.current);
      flushDiscard();
    };
    // eslint-disable-next-line
  }, []);

  const publishCount = (list) => window.dispatchEvent(new CustomEvent(DRIVES_CHANGED, { detail: list.length }));

  const removeFromWaiting = (parts) =>
    setDrives((list) => {
      const next = list.filter((d) => !parts.some((p) => p.id === d.id));
      publishCount(next);
      return next;
    });

  const save = async (parts, load) => {
    setBusyId(parts[0].id);
    setError("");
    try {
      for (const drive of parts) {
        const purpose = load ? LOAD_PURPOSE[load] : purposes[drive.id] || "Other";
        const trip = await saveDrive(drive, { type: "business", purpose });
        logBusinessMiles(trip.dateKey, trip.miles);
        removeFromWaiting([drive]);
      }
      haptic("success");
    } catch (e) {
      setError(t("drives.review.saveError"));
    } finally {
      setBusyId(null);
    }
  };

  const choosePersonal = async (parts) => {
    setBusyId(parts[0].id);
    try {
      await Promise.all(parts.map(markPersonal));
      removeFromWaiting(parts);
      setPersonal((list) => [...parts.map((drive) => ({ ...drive, type: "personal", personalAt: Date.now() })), ...list]);
      clearTimeout(undoTimer.current);
      setUndo({ parts });
      undoTimer.current = setTimeout(() => setUndo(null), 6000);
    } finally {
      setBusyId(null);
    }
  };

  const chooseNotTruck = (parts) => {
    flushDiscard();
    removeFromWaiting(parts);
    pendingDiscard.current = parts;
    clearTimeout(undoTimer.current);
    setUndo({ parts, notTruck: true });
    undoTimer.current = setTimeout(() => {
      flushDiscard();
      setUndo(null);
    }, 6000);
  };

  const restore = async (parts, notTruck) => {
    if (notTruck) {
      pendingDiscard.current = null;
    } else {
      await Promise.all(parts.map(restoreDrive));
    }
    clearTimeout(undoTimer.current);
    setUndo(null);
    const has = (d) => parts.some((p) => p.id === d.id);
    setPersonal((list) => list.filter((d) => !has(d)));
    setOwnCar((list) => list.filter((d) => !has(d)));
    setDrives((list) => {
      const back = parts.map(({ vehicle, ...rest }) => ({ ...rest, type: null }));
      const next = [...list, ...back].sort(newestFirst);
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
            {(trucking ? groupTrips(drives, split) : drives.map((d) => [d])).map((parts) => {
              // Oldest part first; a one-part trip is just the drive.
              const drive = parts[0];
              const lastPart = parts[parts.length - 1];
              const joined = parts.length > 1;
              const from = places[drive.id] && places[drive.id].from;
              const to = places[lastPart.id] && places[lastPart.id].to;
              return (
              <li key={drive.id} className="mksv-drive">
                <div className="mksv-drive__head">
                  <span className="mksv-drive__miles">
                    {parts.reduce((sum, d) => sum + Number(d.miles), 0).toFixed(1)} <small>{t("drives.review.mi")}</small>
                  </span>
                  <span className="mksv-drive__when">{when({ startedAt: drive.startedAt, endedAt: lastPart.endedAt })}</span>
                </div>

                {trucking && (from || to) && (
                  <p className="mksv-drive__route">
                    {from || "?"} → {to || "?"}
                  </p>
                )}
                {trucking && drive.continues && <p className="mksv-drive__route">{t("drives.review.continued")}</p>}
                {joined && <p className="mksv-drive__route">{t("drives.review.joinedFuel")}</p>}

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
                      <button type="button" className="mksv-app-btn mksv-app-btn--primary" disabled={busyId === drive.id} onClick={() => save(parts, "loaded")}>
                        {t("drives.native.loaded")}
                      </button>
                      <button type="button" className="mksv-app-btn mksv-app-btn--primary" disabled={busyId === drive.id} onClick={() => save(parts, "empty")}>
                        {t("drives.native.empty")}
                      </button>
                    </>
                  ) : (
                    <button type="button" className="mksv-app-btn mksv-app-btn--primary" disabled={busyId === drive.id} onClick={() => save(parts)}>
                      {t("drives.native.business")}
                    </button>
                  )}
                  {trucking ? (
                    <button type="button" className="mksv-app-btn mksv-app-btn--ghost" disabled={busyId === drive.id} onClick={() => chooseNotTruck(parts)}>
                      {t("drives.review.notTruck")}
                    </button>
                  ) : (
                    <button type="button" className="mksv-app-btn mksv-app-btn--ghost" disabled={busyId === drive.id} onClick={() => choosePersonal(parts)}>
                      {t("drives.native.personal")}
                    </button>
                  )}
                </div>
                {trucking && (
                  <button type="button" className="mksv-drive__alt" disabled={busyId === drive.id} onClick={() => choosePersonal(parts)}>
                    {t("drives.review.personalTruck")}
                  </button>
                )}
                {joined && (
                  <button
                    type="button"
                    className="mksv-drive__alt"
                    onClick={() => setSplit((s) => new Set([...s, ...parts.map((p) => p.id)]))}
                  >
                    {t("drives.review.splitTrip")}
                  </button>
                )}
              </li>
              );
            })}
          </ul>
        )}

        {ownCar.length > 0 && (
          <section className="mksv-drives__recent" aria-labelledby="mksv-drives-car">
            <h2 id="mksv-drives-car" className="mksv-prefs__title">{t("drives.review.carTitle")}</h2>
            <p className="mksv-drives__hint">{t("drives.review.carHint")}</p>
            <ul className="mksv-list">
              {ownCar.map((drive) => (
                <li key={drive.id} className="mksv-row mksv-drive-personal">
                  <span className="mksv-row__body">
                    <span className="mksv-row__title">
                      {Number(drive.miles).toFixed(1)} {t("drives.review.mi")}
                    </span>
                    <span className="mksv-row__sub">{when(drive)}</span>
                  </span>
                  <button type="button" className="mksv-drive-personal__restore" onClick={() => restore([drive])}>
                    {t("drives.review.itWasTruck")}
                  </button>
                </li>
              ))}
            </ul>
          </section>
        )}

        {personal.length > 0 && (
          <section className="mksv-drives__recent" aria-labelledby="mksv-drives-recent">
            <h2 id="mksv-drives-recent" className="mksv-prefs__title">{t(trucking ? "drives.review.recentTitleTrucking" : "drives.review.recentTitle")}</h2>
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
                  <button type="button" className="mksv-drive-personal__restore" onClick={() => restore([drive])}>
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
          <span>{t(undo.notTruck ? "drives.review.notTruckToast" : "drives.review.personalToast")}</span>
          <button type="button" onClick={() => restore(undo.parts, undo.notTruck)}>
            {t("drives.native.undo")}
          </button>
        </div>
      )}
    </div>
  );
};

export default DriveReview;
