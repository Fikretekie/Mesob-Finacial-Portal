import React, { useState, useEffect, useMemo } from "react";
import { useTranslation } from "react-i18next";
import { Card, CardBody, Button } from "reactstrap";
import { saveFile } from "utils/saveFile";

import PanelHeader from "components/PanelHeader/PanelHeader.js";
import { fetchTrips, getTripsForQuarter } from "utils/tripStorage";
import { fetchFuelPurchases, getFuelPurchasesForQuarter } from "utils/fuelStorage";
import { getCurrentBusinessId } from "utils/businessStorage";
import { buildIfta, iftaCsv, iftaPdf } from "utils/iftaExport";
import "../assets/css/iftaReport.css";

function currentQuarter() {
  return Math.floor(new Date().getMonth() / 3) + 1;
}

// Carrier details printed on the report. Kept on this device, per account + business.
const carrierKey = () => `mksv-ifta-carrier:${localStorage.getItem("userId") || ""}:${getCurrentBusinessId()}`;

function loadCarrier() {
  try {
    const saved = JSON.parse(localStorage.getItem(carrierKey()) || "null");
    if (saved) return saved;
  } catch (e) {
    // Fall through to defaults.
  }
  return { name: localStorage.getItem("companyName") || localStorage.getItem("defaultCompanyName") || "", account: "", base: "" };
}

function saveCarrier(carrier) {
  try {
    localStorage.setItem(carrierKey(), JSON.stringify(carrier));
  } catch (e) {
    // Storage blocked — the fields still apply to this export.
  }
}

const fmt = (n) => (n === null || n === undefined ? "—" : Math.round(n).toLocaleString());

function IftaReport() {
  const { t } = useTranslation();

  const [year, setYear] = useState(new Date().getFullYear());
  const [quarter, setQuarter] = useState(currentQuarter());

  const [trips, setTrips] = useState([]);
  const [fuelPurchases, setFuelPurchases] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [carrier, setCarrier] = useState(loadCarrier);
  const [exporting, setExporting] = useState(false);

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
        if (!cancelled) setError(t("iftaReport.loadError"));
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const quarterTrips = useMemo(() => getTripsForQuarter(trips, year, quarter), [trips, year, quarter]);
  const quarterFuel = useMemo(() => getFuelPurchasesForQuarter(fuelPurchases, year, quarter), [fuelPurchases, year, quarter]);
  const report = useMemo(() => buildIfta(quarterTrips, quarterFuel), [quarterTrips, quarterFuel]);
  const rows = report.rows;

  const updateCarrier = (field, value) => {
    setCarrier((c) => {
      const next = { ...c, [field]: value };
      saveCarrier(next);
      return next;
    });
  };

  const exportOpts = { year, quarter, carrier, trips: quarterTrips, fuel: quarterFuel };

  const handleCsv = () => {
    // BOM so Excel reads it as UTF-8 (the date range has an en dash).
    const blob = new Blob(["﻿" + iftaCsv(report, exportOpts)], { type: "text/csv;charset=utf-8" });
    saveFile(blob, `ifta-${year}-Q${quarter}.csv`);
  };

  const handlePdf = async () => {
    setExporting(true);
    setError("");
    try {
      const doc = await iftaPdf(report, exportOpts);
      await saveFile(doc.output("blob"), `ifta-${year}-Q${quarter}.pdf`);
    } catch (e) {
      setError(t("iftaReport.exportError"));
    } finally {
      setExporting(false);
    }
  };

  return (
    <div className="content">
      <PanelHeader size="sm" />

      <div className="ifta-page">
        <Card>
          <CardBody className="ifta-card">
            <div className="ifta-head">
              <div>
                <h4 className="ifta-title">{t("iftaReport.title")}</h4>
                <p className="ifta-sub">{t("iftaReport.subtitle")}</p>
              </div>
              <div className="ifta-exports">
                <Button className="ifta-btn ifta-btn--primary" onClick={handlePdf} disabled={loading || rows.length === 0 || exporting}>
                  {exporting ? t("iftaReport.exporting") : t("iftaReport.exportPdf")}
                </Button>
                <Button className="ifta-btn" onClick={handleCsv} disabled={loading || rows.length === 0}>
                  {t("iftaReport.exportCsv")}
                </Button>
              </div>
            </div>

            <div className="ifta-filters">
              <label className="ifta-field">
                <span>{t("iftaReport.quarter")}</span>
                <select className="form-control" value={quarter} onChange={(e) => setQuarter(Number(e.target.value))}>
                  <option value={1}>Q1 (Jan–Mar)</option>
                  <option value={2}>Q2 (Apr–Jun)</option>
                  <option value={3}>Q3 (Jul–Sep)</option>
                  <option value={4}>Q4 (Oct–Dec)</option>
                </select>
              </label>
              <label className="ifta-field ifta-field--year">
                <span>{t("iftaReport.year")}</span>
                <input type="number" className="form-control" value={year} onChange={(e) => setYear(Number(e.target.value))} />
              </label>
            </div>

            <fieldset className="ifta-carrier">
              <legend>{t("iftaReport.carrierTitle")}</legend>
              <label className="ifta-field">
                <span>{t("iftaReport.carrierName")}</span>
                <input className="form-control" value={carrier.name} onChange={(e) => updateCarrier("name", e.target.value)} />
              </label>
              <label className="ifta-field">
                <span>{t("iftaReport.carrierAccount")}</span>
                <input className="form-control" value={carrier.account} onChange={(e) => updateCarrier("account", e.target.value)} />
              </label>
              <label className="ifta-field">
                <span>{t("iftaReport.carrierBase")}</span>
                <input
                  className="form-control"
                  value={carrier.base}
                  maxLength={2}
                  placeholder="OH"
                  onChange={(e) => updateCarrier("base", e.target.value.toUpperCase())}
                />
              </label>
            </fieldset>

            {error && (
              <div className="alert alert-danger" role="alert">
                {error}
              </div>
            )}

            {loading ? (
              <div className="ifta-empty">…</div>
            ) : rows.length === 0 ? (
              <div className="ifta-empty">{t("iftaReport.noData")}</div>
            ) : (
              <>
                <div className="ifta-stats">
                  <div className="ifta-stat">
                    <span>{t("iftaReport.totalMiles")}</span>
                    <strong>{fmt(report.totalMiles)}</strong>
                  </div>
                  <div className="ifta-stat">
                    <span>{t("iftaReport.totalGallons")}</span>
                    <strong>{fmt(report.totalGallons)}</strong>
                  </div>
                  <div className="ifta-stat">
                    <span>{t("iftaReport.fleetMpg")}</span>
                    <strong>{report.mpg === null ? "—" : report.mpg.toFixed(2)}</strong>
                  </div>
                </div>

                {report.mpg === null && <p className="ifta-warn">{t("iftaReport.noFuel")}</p>}
                {report.unassignedTrips > 0 && (
                  <p className="ifta-warn">
                    {t("iftaReport.unassigned", { count: report.unassignedTrips, miles: report.unassignedMiles.toFixed(1) })}
                  </p>
                )}

                <div className="ifta-table-wrap">
                  <table className="table ifta-table">
                    <thead>
                      <tr>
                        <th>{t("iftaReport.jurisdiction")}</th>
                        <th>{t("iftaReport.miles")}</th>
                        <th>{t("iftaReport.taxableGallons")}</th>
                        <th>{t("iftaReport.gallonsPurchased")}</th>
                        <th>{t("iftaReport.netGallons")}</th>
                      </tr>
                    </thead>
                    <tbody>
                      {rows.map((r) => (
                        <tr key={r.state}>
                          <td>{r.state}</td>
                          <td>{fmt(r.miles)}</td>
                          <td>{fmt(r.taxableGallons)}</td>
                          <td>{r.paidGallons > 0 ? fmt(r.paidGallons) : "—"}</td>
                          <td>{fmt(r.netGallons)}</td>
                        </tr>
                      ))}
                    </tbody>
                    <tfoot>
                      <tr>
                        <td>{t("iftaReport.total")}</td>
                        <td>{fmt(report.totalMiles)}</td>
                        <td>{fmt(report.totalTaxableGallons)}</td>
                        <td>{fmt(report.totalGallons)}</td>
                        <td>{fmt(report.totalNetGallons)}</td>
                      </tr>
                    </tfoot>
                  </table>
                </div>
              </>
            )}

            <p className="ifta-note">{t("iftaReport.note")}</p>
          </CardBody>
        </Card>
      </div>
    </div>
  );
}

export default IftaReport;
