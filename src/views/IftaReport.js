import React, { useState, useEffect, useMemo } from "react";
import { useTranslation } from "react-i18next";
import { Card, CardBody, Button } from "reactstrap";
import { saveAs } from "file-saver";

import PanelHeader from "components/PanelHeader/PanelHeader.js";
import { fetchTrips, getTripsForQuarter, getMilesByState } from "utils/tripStorage";
import { fetchFuelPurchases, getFuelPurchasesForQuarter, getGallonsByState } from "utils/fuelStorage";

function currentQuarter() {
  return Math.floor(new Date().getMonth() / 3) + 1;
}

function IftaReport() {
  const { t } = useTranslation();

  const [year, setYear] = useState(new Date().getFullYear());
  const [quarter, setQuarter] = useState(currentQuarter());

  const [trips, setTrips] = useState([]);
  const [fuelPurchases, setFuelPurchases] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    Promise.all([fetchTrips(), fetchFuelPurchases()])
      .then(([tripData, fuelData]) => {
        if (cancelled) return;
        setTrips(tripData);
        setFuelPurchases(fuelData);
      })
      .catch(() => {
        if (!cancelled) setError(t("iftaReport.title"));
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const rows = useMemo(() => {
    const quarterTrips = getTripsForQuarter(trips, year, quarter);
    const quarterFuel = getFuelPurchasesForQuarter(fuelPurchases, year, quarter);
    const milesByState = getMilesByState(quarterTrips);
    const gallonsByState = getGallonsByState(quarterFuel);

    const allStates = new Set([...Object.keys(milesByState), ...Object.keys(gallonsByState)]);
    return Array.from(allStates)
      .map((state) => ({
        state,
        miles: milesByState[state] || 0,
        gallons: gallonsByState[state] || 0,
      }))
      .sort((a, b) => b.miles - a.miles);
  }, [trips, fuelPurchases, year, quarter]);

  const totalMiles = rows.reduce((sum, r) => sum + r.miles, 0);
  const totalGallons = rows.reduce((sum, r) => sum + r.gallons, 0);

  const handleExport = () => {
    const header = "Jurisdiction,Miles,Gallons Purchased\n";
    const body = rows.map((r) => `${r.state},${r.miles.toFixed(2)},${r.gallons.toFixed(2)}`).join("\n");
    const footer = `\nTotal,${totalMiles.toFixed(2)},${totalGallons.toFixed(2)}\n`;
    const blob = new Blob([header + body + footer], { type: "text/csv;charset=utf-8" });
    saveAs(blob, `ifta-report-${year}-Q${quarter}.csv`);
  };

  return (
    <div className="content">
      <PanelHeader size="sm" />

      <div style={{ maxWidth: "760px", margin: "0 auto" }}>
        <Card>
          <CardBody style={{ padding: "20px" }}>
            <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", flexWrap: "wrap", gap: "12px" }}>
              <div>
                <h4 style={{ marginTop: 0, marginBottom: "4px" }}>{t("iftaReport.title")}</h4>
                <p style={{ color: "var(--text-3)", fontSize: "13px", margin: 0 }}>{t("iftaReport.subtitle")}</p>
              </div>
              <Button
                onClick={handleExport}
                disabled={loading || rows.length === 0}
                style={{ background: "#096afa", border: "none", borderRadius: "3px", color: "var(--accent-ink)", fontWeight: 600, fontSize: "13px" }}
              >
                {t("iftaReport.exportCsv")}
              </Button>
            </div>

            <div style={{ display: "flex", gap: "12px", margin: "20px 0" }}>
              <div>
                <label style={{ fontSize: "11px", color: "var(--text-3)", textTransform: "uppercase" }}>
                  {t("iftaReport.quarter")}
                </label>
                <select
                  className="form-control"
                  value={quarter}
                  onChange={(e) => setQuarter(Number(e.target.value))}
                  style={{ background: "rgba(255,255,255,0.05)", border: "1px solid var(--border)", color: "var(--text-1)" }}
                >
                  <option value={1}>Q1 (Jan–Mar)</option>
                  <option value={2}>Q2 (Apr–Jun)</option>
                  <option value={3}>Q3 (Jul–Sep)</option>
                  <option value={4}>Q4 (Oct–Dec)</option>
                </select>
              </div>
              <div>
                <label style={{ fontSize: "11px", color: "var(--text-3)", textTransform: "uppercase" }}>
                  {t("iftaReport.year")}
                </label>
                <input
                  type="number"
                  className="form-control"
                  value={year}
                  onChange={(e) => setYear(Number(e.target.value))}
                  style={{ background: "rgba(255,255,255,0.05)", border: "1px solid var(--border)", color: "var(--text-1)", width: "100px" }}
                />
              </div>
            </div>

            {error && (
              <div className="alert alert-danger" role="alert">
                {error}
              </div>
            )}

            {loading ? (
              <div style={{ textAlign: "center", padding: "24px", color: "var(--text-3)" }}>...</div>
            ) : rows.length === 0 ? (
              <div style={{ textAlign: "center", padding: "24px", color: "var(--text-3)", fontSize: "13px" }}>
                {t("iftaReport.noData")}
              </div>
            ) : (
              <div style={{ overflowX: "auto" }}>
                <table className="table" style={{ color: "var(--text-1)", marginBottom: 0 }}>
                  <thead>
                    <tr style={{ color: "var(--text-3)", fontSize: "11px", textTransform: "uppercase" }}>
                      <th>{t("iftaReport.jurisdiction")}</th>
                      <th style={{ textAlign: "right" }}>{t("iftaReport.miles")}</th>
                      <th style={{ textAlign: "right" }}>{t("iftaReport.gallonsPurchased")}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {rows.map((r) => (
                      <tr key={r.state}>
                        <td style={{ fontWeight: 600 }}>{r.state}</td>
                        <td style={{ textAlign: "right" }}>{r.miles.toFixed(2)}</td>
                        <td style={{ textAlign: "right" }}>{r.gallons > 0 ? r.gallons.toFixed(2) : "—"}</td>
                      </tr>
                    ))}
                  </tbody>
                  <tfoot>
                    <tr style={{ fontWeight: 700, borderTop: "1.5px solid var(--border)" }}>
                      <td>{t("iftaReport.totalMiles")}</td>
                      <td style={{ textAlign: "right" }}>{totalMiles.toFixed(2)}</td>
                      <td style={{ textAlign: "right" }}>{totalGallons > 0 ? totalGallons.toFixed(2) : "—"}</td>
                    </tr>
                  </tfoot>
                </table>
              </div>
            )}

            <p style={{ color: "var(--text-3)", fontSize: "11px", marginTop: "16px", marginBottom: 0 }}>
              {t("iftaReport.note")}
            </p>
          </CardBody>
        </Card>
      </div>
    </div>
  );
}

export default IftaReport;