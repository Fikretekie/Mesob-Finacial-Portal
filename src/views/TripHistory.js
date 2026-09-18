import React, { useState, useEffect, useMemo } from "react";
import { useTranslation } from "react-i18next";
import { Card, CardBody } from "reactstrap";

import PanelHeader from "components/PanelHeader/PanelHeader.js";
import { fetchTrips, getTripsForDay, getMonthSummary, getYearBusinessMiles } from "utils/tripStorage";

const IRS_RATE_PER_MILE = 0.67;

function dateKeyOf(d) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function lastSevenDays() {
  const days = [];
  for (let i = 6; i >= 0; i--) {
    const d = new Date();
    d.setDate(d.getDate() - i);
    days.push(d);
  }
  return days;
}

function StatTile({ icon, iconBg, label, value, sub }) {
  return (
    <Card>
      <CardBody style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: "10px", padding: "18px 12px" }}>
        <div style={{ width: "36px", height: "36px", borderRadius: "50%", background: iconBg, display: "flex", alignItems: "center", justifyContent: "center" }}>
          {icon}
        </div>
        <span style={{ fontSize: "10px", fontWeight: 700, letterSpacing: "0.6px", color: "var(--text-3)", textTransform: "uppercase" }}>{label}</span>
        <span style={{ fontSize: "20px", fontWeight: 700, color: "var(--text-1)" }}>{value}</span>
        {sub && <span style={{ fontSize: "10px", color: "var(--text-3)" }}>{sub}</span>}
      </CardBody>
    </Card>
  );
}

function TripHistory() {
  const { t } = useTranslation();
  const days = useMemo(() => lastSevenDays(), []);
  const [selectedDateKey, setSelectedDateKey] = useState(dateKeyOf(new Date()));
  const [trips, setTrips] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    fetchTrips()
      .then((data) => {
        if (!cancelled) setTrips(data);
      })
      .catch(() => {
        if (!cancelled) setError(t("tripHistory.loadError"));
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
    
  }, []);

  const dayTrips = getTripsForDay(trips, selectedDateKey);
  const dayTotal = dayTrips.reduce((sum, t2) => sum + t2.miles, 0);

  const now = new Date();
  const monthKey = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
  const monthSummary = getMonthSummary(trips, monthKey);
  const yearBusinessMiles = getYearBusinessMiles(trips, now.getFullYear());
  const deduction = yearBusinessMiles * IRS_RATE_PER_MILE;

  if (loading) {
    return (
      <div className="content">
        <PanelHeader size="sm" />
        <div style={{ textAlign: "center", padding: "40px", color: "var(--text-3)" }}>{t("tripHistory.loading")}</div>
      </div>
    );
  }

  return (
    <div className="content">
      <PanelHeader size="sm" />

      <div style={{ maxWidth: "760px", margin: "0 auto" }}>
        {error && (
          <div className="alert alert-danger" role="alert">
            {error}
          </div>
        )}

        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(140px, 1fr))", gap: "14px", marginBottom: "20px" }}>
          <StatTile
            label={t("tripHistory.businessMiles")}
            value={`${yearBusinessMiles.toFixed(1)} mi`}
            sub={t("tripHistory.thisYear")}
            iconBg="rgba(9,106,250,0.14)"
            icon={<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#096afa" strokeWidth="1.8" strokeLinecap="round"><path d="M4 19c3-6 6-9 9-9s6 3 6 3" /></svg>}
          />
          <StatTile
            label={t("tripHistory.estDeduction")}
            value={`$${deduction.toFixed(2)}`}
            sub={t("tripHistory.perMile", { rate: `$${IRS_RATE_PER_MILE.toFixed(2)}` })}
            iconBg="rgba(0,217,126,0.14)"
            icon={<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="var(--green)" strokeWidth="1.8" strokeLinecap="round"><path d="M12 2v20M17 6H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6" /></svg>}
          />
          <StatTile
            label={t("tripHistory.thisMonth")}
            value={`${(monthSummary.businessMiles + monthSummary.personalMiles).toFixed(1)} mi`}
            sub={now.toLocaleDateString("en-US", { month: "long", year: "numeric" })}
            iconBg="rgba(168,85,247,0.14)"
            icon={<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="var(--purple)" strokeWidth="1.8" strokeLinecap="round"><rect x="3" y="4" width="18" height="17" rx="2" /><path d="M3 9h18M8 3v3M16 3v3" /></svg>}
          />
          <StatTile
            label={t("tripHistory.trips")}
            value={trips.length}
            sub={t("tripHistory.allTime")}
            iconBg="rgba(255,165,59,0.14)"
            icon={<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="var(--amber)" strokeWidth="1.8" strokeLinecap="round"><path d="M3 17l6-6 4 4 8-8" /></svg>}
          />
        </div>

        <Card>
          <CardBody style={{ padding: "16px" }}>
            <div style={{ display: "flex", gap: "8px", overflowX: "auto", paddingBottom: "4px" }}>
              {days.map((d) => {
                const key = dateKeyOf(d);
                const isSelected = key === selectedDateKey;
                const total = getTripsForDay(trips, key).reduce((sum, t2) => sum + t2.miles, 0);
                return (
                  <div
                    key={key}
                    onClick={() => setSelectedDateKey(key)}
                    style={{
                      cursor: "pointer",
                      minWidth: "56px",
                      display: "flex",
                      flexDirection: "column",
                      alignItems: "center",
                      gap: "4px",
                      padding: "10px 4px",
                      borderRadius: "3px",
                      background: isSelected ? "#096afa" : "transparent",
                    }}
                  >
                    <span style={{ fontSize: "10px", color: isSelected ? "var(--text-1)" : "var(--text-3)" }}>
                      {d.toLocaleDateString("en-US", { weekday: "short" })}
                    </span>
                    <span style={{ fontSize: "14px", fontWeight: 700, color: "var(--text-1)" }}>
                      {d.getDate()}
                    </span>
                    <span style={{ fontSize: "10px", color: isSelected ? "var(--text-1)" : "var(--text-3)" }}>
                      {total.toFixed(1)} mi
                    </span>
                  </div>
                );
              })}
            </div>
          </CardBody>
        </Card>

        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", margin: "18px 4px 8px" }}>
          <span style={{ fontSize: "15px", fontWeight: 600 }}>
            {new Date(selectedDateKey + "T00:00:00").toLocaleDateString("en-US", { weekday: "long", month: "short", day: "numeric" })}
          </span>
          <span style={{ fontSize: "12px", color: "var(--text-3)" }}>{dayTotal.toFixed(1)} {t("tripHistory.miTotal")}</span>
        </div>

        {dayTrips.length === 0 ? (
          <Card>
            <CardBody style={{ textAlign: "center", padding: "24px", color: "var(--text-3)", fontSize: "13px" }}>
              {t("tripHistory.noTrips")}
            </CardBody>
          </Card>
        ) : (
          dayTrips.map((trip) => (
            <Card key={trip.tripId}>
              <CardBody style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "16px" }}>
                <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
                  <div
                    style={{
                      width: "36px",
                      height: "36px",
                      borderRadius: "50%",
                      background: trip.type === "business" ? "rgba(9,106,250,0.14)" : "rgba(255,255,255,0.06)",
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                    }}
                  >
                    {trip.type === "business" ? (
                      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#096afa" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="7" width="18" height="12" rx="2" /><path d="M8 7V5a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" /></svg>
                    ) : (
                      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="var(--text-3)" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M4 11l8-7 8 7" /><path d="M6 10v9h12v-9" /></svg>
                    )}
                  </div>
                  <div style={{ display: "flex", flexDirection: "column", gap: "2px" }}>
                    <span style={{ fontSize: "13px", fontWeight: 600 }}>{trip.purpose || "Trip"}</span>
                    <span style={{ fontSize: "11px", color: "var(--text-3)" }}>
                      {trip.time} · {Math.round((trip.durationSeconds || 0) / 60)} {t("tripHistory.min")}
                    </span>
                    {trip.note && <span style={{ fontSize: "11px", color: "#096afa" }}>{trip.note}</span>}
                  </div>
                </div>
                <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", gap: "2px" }}>
                  <span style={{ fontSize: "14px", fontWeight: 600 }}>{trip.miles.toFixed(2)} mi</span>
                  <span
                    style={{
                      fontSize: "10px",
                      fontWeight: 700,
                      letterSpacing: "0.4px",
                      textTransform: "uppercase",
                      color: trip.type === "business" ? "#096afa" : "var(--text-3)",
                    }}
                  >
                    {trip.type === "business" ? t("mileageTracker.business") : t("mileageTracker.personal")}
                  </span>
                </div>
              </CardBody>
            </Card>
          ))
        )}
      </div>
    </div>
  );
}

export default TripHistory;