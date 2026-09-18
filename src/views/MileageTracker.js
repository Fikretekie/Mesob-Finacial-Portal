import React, { useState, useRef, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { Card, CardBody, Button } from "reactstrap";
import { Capacitor, registerPlugin } from "@capacitor/core";

import PanelHeader from "components/PanelHeader/PanelHeader.js";
import { haversineMiles } from "utils/geo";
import { saveTrip } from "utils/tripStorage";
import { getStateAtPoint } from "utils/geoState";

const BackgroundGeolocation = registerPlugin("BackgroundGeolocation");

const MAX_ACCEPTABLE_ACCURACY_METERS = 50;
const MIN_MOVEMENT_MILES = 0.005; // ~8 meters
const STATE_CHECK_INTERVAL_MILES = 1; // how often to re-check which state we're in

const PURPOSE_OPTIONS = ["Client Visit", "Delivery", "Commute", "Other"];

function formatElapsed(totalSeconds) {
  const h = String(Math.floor(totalSeconds / 3600)).padStart(2, "0");
  const m = String(Math.floor((totalSeconds % 3600) / 60)).padStart(2, "0");
  const s = String(Math.floor(totalSeconds % 60)).padStart(2, "0");
  return `${h}:${m}:${s}`;
}

function dateKeyOf(d) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function MileageTracker() {
  const navigate = useNavigate();
  const { t } = useTranslation();

  const [isTracking, setIsTracking] = useState(false);
  const [distanceMiles, setDistanceMiles] = useState(0);
  const [lastAccuracy, setLastAccuracy] = useState(null);
  const [elapsedSeconds, setElapsedSeconds] = useState(0);
  const [error, setError] = useState("");

  const [pendingTrip, setPendingTrip] = useState(null); // { miles, durationSeconds, endedAt }
  const [tripType, setTripType] = useState("business");
  const [showNoteField, setShowNoteField] = useState(false);
  const [note, setNote] = useState("");
  const [purposeIndex, setPurposeIndex] = useState(0);
  const [isSaving, setIsSaving] = useState(false);

  const watchIdRef = useRef(null);
  const lastPointRef = useRef(null);
  const startTimeRef = useRef(null);
  const timerIdRef = useRef(null);
  const stateMilesRef = useRef({}); // { OH: 12.3, PA: 5.1, ... }
  const currentStateRef = useRef(null);
  const milesSinceStateCheckRef = useRef(0);
  const stateCheckInFlightRef = useRef(false);

  useEffect(() => {
    return () => {
      if (watchIdRef.current !== null) {
        if (Capacitor.isNativePlatform()) {
          BackgroundGeolocation.removeWatcher({ id: watchIdRef.current });
        } else {
          navigator.geolocation.clearWatch(watchIdRef.current);
        }
      }
      if (timerIdRef.current) clearInterval(timerIdRef.current);
    };
  }, []);

  /** Adds the miles accumulated since the last state check to whichever
   * state we were in during that stretch (a no-op the very first time,
   * since there's no prior state yet to attribute distance to). */
  const flushMilesToCurrentState = () => {
    if (currentStateRef.current && milesSinceStateCheckRef.current > 0) {
      const state = currentStateRef.current;
      stateMilesRef.current[state] = (stateMilesRef.current[state] || 0) + milesSinceStateCheckRef.current;
    }
    milesSinceStateCheckRef.current = 0;
  };

  /** Re-checks which state the given point is in, attributing miles driven
   * since the last check to the previous state first. Throttled to roughly
   * once per STATE_CHECK_INTERVAL_MILES so we're not doing a polygon lookup
   * on every single GPS update. Fire-and-forget: doesn't block the distance/
   * UI updates in handlePosition. */
  const maybeCheckState = (lat, lng) => {
    const isFirstCheck = currentStateRef.current === null && !stateCheckInFlightRef.current;
    if (!isFirstCheck && milesSinceStateCheckRef.current < STATE_CHECK_INTERVAL_MILES) return;
    if (stateCheckInFlightRef.current) return;

    stateCheckInFlightRef.current = true;
    getStateAtPoint(lat, lng)
      .then((state) => {
        flushMilesToCurrentState();
        currentStateRef.current = state;
      })
      .catch(() => {
        // Boundary lookup failed (e.g. offline on first load) -- keep
        // attributing to whatever state we last knew, try again next check.
      })
      .finally(() => {
        stateCheckInFlightRef.current = false;
      });
  };

  const handlePosition = (position) => {
    setError("");
    const { latitude, longitude, accuracy } = position.coords;
    setLastAccuracy(accuracy);

    if (accuracy > MAX_ACCEPTABLE_ACCURACY_METERS) return;

    const prev = lastPointRef.current;
    if (prev) {
      const delta = haversineMiles(prev.lat, prev.lng, latitude, longitude);
      if (delta >= MIN_MOVEMENT_MILES) {
        setDistanceMiles((d) => d + delta);
        milesSinceStateCheckRef.current += delta;
        lastPointRef.current = { lat: latitude, lng: longitude };
      }
    } else {
      lastPointRef.current = { lat: latitude, lng: longitude };
    }

    maybeCheckState(latitude, longitude);
  };

  const handlePositionError = (err) => {
    const isPermissionDenied =
      err.code === "NOT_AUTHORIZED" || (err.code != null && err.code === err.PERMISSION_DENIED);
    setError(
      isPermissionDenied
        ? t("mileageTracker.permissionDenied")
        : t("mileageTracker.locationError", { message: err.message || t("mileageTracker.signalUnavailable") })
    );
  };

  const startTrip = async () => {
    setError("");
    setDistanceMiles(0);
    setElapsedSeconds(0);
    lastPointRef.current = null;
    startTimeRef.current = Date.now();
    stateMilesRef.current = {};
    currentStateRef.current = null;
    milesSinceStateCheckRef.current = 0;

    if (Capacitor.isNativePlatform()) {
      try {
        watchIdRef.current = await BackgroundGeolocation.addWatcher(
          {
            backgroundTitle: "Meksova is tracking your trip",
            backgroundMessage: "Tap to return to the app.",
            requestPermissions: true,
            stale: false,
            distanceFilter: 0,
          },
          (position, err) => (err ? handlePositionError(err) : handlePosition({ coords: position }))
        );
      } catch (err) {
        handlePositionError(err);
        return;
      }
    } else {
      if (!("geolocation" in navigator)) {
        setError(t("mileageTracker.noGpsSupport"));
        return;
      }
      watchIdRef.current = navigator.geolocation.watchPosition(
        handlePosition,
        handlePositionError,
        { enableHighAccuracy: true, maximumAge: 0, timeout: 15000 }
      );
    }

    timerIdRef.current = setInterval(() => {
      setElapsedSeconds((Date.now() - startTimeRef.current) / 1000);
    }, 1000);

    setIsTracking(true);
  };

  const stopTrip = async () => {
    if (watchIdRef.current !== null) {
      if (Capacitor.isNativePlatform()) {
        await BackgroundGeolocation.removeWatcher({ id: watchIdRef.current });
      } else {
        navigator.geolocation.clearWatch(watchIdRef.current);
      }
      watchIdRef.current = null;
    }
    if (timerIdRef.current) {
      clearInterval(timerIdRef.current);
      timerIdRef.current = null;
    }
    flushMilesToCurrentState();
    const stateBreakdown = Object.entries(stateMilesRef.current).map(([state, miles]) => ({
      state,
      miles: Number(miles.toFixed(2)),
    }));

    setIsTracking(false);
    setTripType("business");
    setShowNoteField(false);
    setNote("");
    setPurposeIndex(0);
    setPendingTrip({
      miles: distanceMiles,
      durationSeconds: elapsedSeconds,
      endedAt: new Date(),
      stateBreakdown,
    });
  };

  const discardTrip = () => {
    setPendingTrip(null);
  };

  const confirmSaveTrip = async () => {
    if (!pendingTrip) return;
    setIsSaving(true);
    const now = pendingTrip.endedAt;
    try {
      await saveTrip({
        dateKey: dateKeyOf(now),
        date: now.toLocaleDateString("en-US", { month: "short", day: "numeric" }),
        time: now.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" }),
        miles: Number(pendingTrip.miles.toFixed(2)),
        durationSeconds: Math.round(pendingTrip.durationSeconds),
        type: tripType,
        purpose: PURPOSE_OPTIONS[purposeIndex],
        note: note.trim(),
        stateBreakdown: pendingTrip.stateBreakdown,
      });
      setPendingTrip(null);
      navigate("/customer/trip-history");
    } catch (err) {
      setError(t("mileageTracker.saveError"));
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="content">
      <PanelHeader size="sm" />

      <div style={{ maxWidth: "420px", margin: "0 auto" }}>
        <Card>
          <CardBody
            style={{
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              justifyContent: "center",
              gap: "28px",
              padding: "32px 20px",
              minHeight: "420px",
            }}
          >
            {error && (
              <div className="alert alert-danger" style={{ width: "100%" }} role="alert">
                {error}
              </div>
            )}

            {!isTracking ? (
              <Button
                onClick={startTrip}
                style={{
                  width: "200px",
                  height: "200px",
                  borderRadius: "50%",
                  background: "#096afa",
                  border: "none",
                  display: "flex",
                  flexDirection: "column",
                  alignItems: "center",
                  justifyContent: "center",
                  gap: "10px",
                  boxShadow: "0 8px 24px rgba(9,106,250,0.35)",
                }}
              >
                <svg width="36" height="36" viewBox="0 0 24 24" fill="var(--text-1)" stroke="none">
                  <path d="M7 5l12 7-12 7V5z" />
                </svg>
                <span style={{ fontWeight: 700, fontSize: "15px", color: "var(--text-1)", letterSpacing: "0.3px", textTransform: "uppercase" }}>
                  {t("mileageTracker.startTrip")}
                </span>
              </Button>
            ) : (
              <Button
                onClick={stopTrip}
                style={{
                  width: "200px",
                  height: "200px",
                  borderRadius: "50%",
                  background: "#e53e3e",
                  border: "none",
                  display: "flex",
                  flexDirection: "column",
                  alignItems: "center",
                  justifyContent: "center",
                  gap: "10px",
                  boxShadow: "0 0 0 10px rgba(229,62,62,0.15), 0 8px 24px rgba(229,62,62,0.35)",
                }}
              >
                <svg width="36" height="36" viewBox="0 0 24 24" fill="var(--text-1)" stroke="none">
                  <rect x="5" y="5" width="14" height="14" rx="1.5" />
                </svg>
                <span style={{ fontWeight: 700, fontSize: "15px", color: "var(--text-1)", letterSpacing: "0.3px", textTransform: "uppercase" }}>
                  {t("mileageTracker.stopTrip")}
                </span>
              </Button>
            )}

            <div style={{ display: "flex", alignItems: "center", gap: "24px" }}>
              <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: "4px" }}>
                <span style={{ fontSize: "20px", fontWeight: 700 }}>{distanceMiles.toFixed(2)}</span>
                <span style={{ fontSize: "10px", fontWeight: 700, letterSpacing: "0.6px", color: "#9A9A9A", textTransform: "uppercase" }}>
                  {t("mileageTracker.miles")}
                </span>
              </div>
              <div style={{ width: "1px", height: "32px", background: "var(--border)" }} />
              <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: "4px" }}>
                <span style={{ fontSize: "20px", fontWeight: 700 }}>{formatElapsed(elapsedSeconds)}</span>
                <span style={{ fontSize: "10px", fontWeight: 700, letterSpacing: "0.6px", color: "#9A9A9A", textTransform: "uppercase" }}>
                  {t("mileageTracker.elapsed")}
                </span>
              </div>
            </div>

            {isTracking && (
              <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
                <span style={{ width: "7px", height: "7px", borderRadius: "50%", background: "#11b981" }} />
                <span style={{ fontSize: "12px", color: "#9A9A9A" }}>
                  {lastAccuracy != null
                    ? t("mileageTracker.gpsLocked", { meters: Math.round(lastAccuracy) })
                    : t("mileageTracker.waitingForGps")}
                </span>
              </div>
            )}
          </CardBody>
        </Card>
      </div>

      {pendingTrip && (
        <div
          style={{
            position: "fixed",
            inset: 0,
            background: "rgba(0,0,0,0.6)",
            display: "flex",
            alignItems: "flex-end",
            justifyContent: "center",
            zIndex: 1050,
          }}
        >
          <div
            style={{
              width: "100%",
              maxWidth: "480px",
              background: "var(--surface-2)",
              borderRadius: "14px 14px 0 0",
              boxShadow: "0 -8px 30px rgba(0,0,0,0.45)",
              padding: "20px 20px 28px",
              display: "flex",
              flexDirection: "column",
              gap: "16px",
            }}
          >
            <div style={{ width: "36px", height: "4px", borderRadius: "2px", background: "var(--border)", alignSelf: "center" }} />

            <div style={{ display: "flex", alignItems: "baseline", justifyContent: "center", gap: "8px" }}>
              <span style={{ fontSize: "26px", fontWeight: 700, color: "var(--green)" }}>
                {pendingTrip.miles.toFixed(2)} mi
              </span>
              <span style={{ fontSize: "13px", color: "#9A9A9A" }}>
                · {formatElapsed(pendingTrip.durationSeconds)}
              </span>
            </div>

            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "12px" }}>
              <div
                onClick={() => setTripType("business")}
                style={{
                  cursor: "pointer",
                  background: tripType === "business" ? "rgba(9,106,250,0.14)" : "rgba(255,255,255,0.04)",
                  border: `1.5px solid ${tripType === "business" ? "#096afa" : "var(--border)"}`,
                  borderRadius: "3px",
                  padding: "16px 10px",
                  display: "flex",
                  flexDirection: "column",
                  alignItems: "center",
                  gap: "8px",
                }}
              >
                <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke={tripType === "business" ? "#096afa" : "#9A9A9A"} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                  <rect x="3" y="7" width="18" height="12" rx="2" />
                  <path d="M8 7V5a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
                </svg>
                <span style={{ fontSize: "13px", fontWeight: 600, color: "var(--text-1)" }}>{t("mileageTracker.business")}</span>
              </div>
              <div
                onClick={() => setTripType("personal")}
                style={{
                  cursor: "pointer",
                  background: tripType === "personal" ? "rgba(255,255,255,0.08)" : "rgba(255,255,255,0.04)",
                  border: `1.5px solid ${tripType === "personal" ? "#9A9A9A" : "var(--border)"}`,
                  borderRadius: "3px",
                  padding: "16px 10px",
                  display: "flex",
                  flexDirection: "column",
                  alignItems: "center",
                  gap: "8px",
                }}
              >
                <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#9A9A9A" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M4 11l8-7 8 7" />
                  <path d="M6 10v9h12v-9" />
                </svg>
                <span style={{ fontSize: "13px", fontWeight: 600, color: "#9A9A9A" }}>{t("mileageTracker.personal")}</span>
              </div>
            </div>

            {!showNoteField ? (
              <div
                onClick={() => setShowNoteField(true)}
                style={{ cursor: "pointer", display: "flex", alignItems: "center", gap: "6px" }}
              >
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#096afa" strokeWidth="2" strokeLinecap="round">
                  <path d="M12 5v14M5 12h14" />
                </svg>
                <span style={{ fontSize: "13px", color: "#096afa", fontWeight: 600 }}>{t("mileageTracker.addNote")}</span>
              </div>
            ) : (
              <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
                <select
                  className="form-control"
                  value={purposeIndex}
                  onChange={(e) => setPurposeIndex(Number(e.target.value))}
                  style={{ background: "rgba(255,255,255,0.05)", border: "1px solid var(--border)", color: "var(--text-1)" }}
                >
                  {PURPOSE_OPTIONS.map((p, i) => (
                    <option key={p} value={i}>{p}</option>
                  ))}
                </select>
                <input
                  type="text"
                  className="form-control"
                  placeholder={t("mileageTracker.notePlaceholder")}
                  value={note}
                  onChange={(e) => setNote(e.target.value)}
                  style={{ background: "rgba(255,255,255,0.05)", border: "1px solid var(--border)", color: "var(--text-1)" }}
                />
              </div>
            )}

            <Button
              onClick={confirmSaveTrip}
              disabled={isSaving}
              style={{
                width: "100%",
                background: "#096afa",
                border: "none",
                borderRadius: "3px",
                color: "var(--text-1)",
                fontWeight: 600,
                fontSize: "15px",
                padding: "15px",
                minHeight: "50px",
              }}
            >
              {isSaving ? t("mileageTracker.saving") : t("mileageTracker.saveTrip")}
            </Button>
            <Button
              onClick={discardTrip}
              disabled={isSaving}
              style={{ width: "100%", background: "transparent", border: "none", color: "#9A9A9A", fontWeight: 600, fontSize: "13px" }}
            >
              {t("mileageTracker.discardTrip")}
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}

export default MileageTracker;