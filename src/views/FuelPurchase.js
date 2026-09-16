import React, { useState, useEffect } from "react";
import { useTranslation } from "react-i18next";
import { Card, CardBody, Button } from "reactstrap";

import PanelHeader from "components/PanelHeader/PanelHeader.js";
import { fetchFuelPurchases, saveFuelPurchase } from "utils/fuelStorage";
import { US_STATES } from "utils/usStates";

function dateKeyOf(d) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function todayInputValue() {
  return dateKeyOf(new Date());
}

function FuelPurchase() {
  const { t } = useTranslation();

  const [purchases, setPurchases] = useState([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");

  const [date, setDate] = useState(todayInputValue());
  const [state, setState] = useState("");
  const [gallons, setGallons] = useState("");
  const [pricePerGallon, setPricePerGallon] = useState("");
  const [totalCost, setTotalCost] = useState("");
  const [isSaving, setIsSaving] = useState(false);
  const [saveError, setSaveError] = useState("");

  const loadPurchases = () => {
    setLoading(true);
    fetchFuelPurchases()
      .then((data) => setPurchases(data))
      .catch(() => setLoadError(t("fuelPurchase.loadError")))
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    loadPurchases();
  }, []);

  const resetForm = () => {
    setDate(todayInputValue());
    setState("");
    setGallons("");
    setPricePerGallon("");
    setTotalCost("");
  };

  const handleSave = async (e) => {
    e.preventDefault();
    setSaveError("");

    const gallonsNum = Number(gallons);
    if (!date || !state || !gallonsNum || gallonsNum <= 0) {
      setSaveError(t("fuelPurchase.validationRequired"));
      return;
    }

    setIsSaving(true);
    try {
      const dateObj = new Date(`${date}T00:00:00`);
      await saveFuelPurchase({
        dateKey: date,
        date: dateObj.toLocaleDateString("en-US", { month: "short", day: "numeric" }),
        state,
        gallons: gallonsNum,
        pricePerGallon: pricePerGallon ? Number(pricePerGallon) : null,
        totalCost: totalCost ? Number(totalCost) : null,
        source: "manual",
      });
      resetForm();
      loadPurchases();
    } catch (err) {
      setSaveError(t("fuelPurchase.saveError"));
    } finally {
      setIsSaving(false);
    }
  };

  const sortedPurchases = [...purchases].sort((a, b) => (a.dateKey < b.dateKey ? 1 : -1));

  return (
    <div className="content">
      <PanelHeader size="sm" />

      <div style={{ maxWidth: "560px", margin: "0 auto" }}>
        <Card>
          <CardBody style={{ padding: "20px" }}>
            <h4 style={{ marginTop: 0 }}>{t("fuelPurchase.title")}</h4>
            <p style={{ color: "#9A9A9A", fontSize: "13px", marginBottom: "20px" }}>
              {t("fuelPurchase.subtitle")}
            </p>

            {saveError && (
              <div className="alert alert-danger" role="alert">
                {saveError}
              </div>
            )}

            <form onSubmit={handleSave}>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "12px", marginBottom: "12px" }}>
                <div>
                  <label style={{ fontSize: "11px", color: "#9A9A9A", textTransform: "uppercase" }}>
                    {t("fuelPurchase.date")}
                  </label>
                  <input
                    type="date"
                    className="form-control"
                    value={date}
                    onChange={(e) => setDate(e.target.value)}
                    style={{ background: "rgba(255,255,255,0.05)", border: "1px solid #3a4555", color: "#fff" }}
                  />
                </div>
                <div>
                  <label style={{ fontSize: "11px", color: "#9A9A9A", textTransform: "uppercase" }}>
                    {t("fuelPurchase.state")}
                  </label>
                  <select
                    className="form-control"
                    value={state}
                    onChange={(e) => setState(e.target.value)}
                    style={{ background: "rgba(255,255,255,0.05)", border: "1px solid #3a4555", color: "#fff" }}
                  >
                    <option value="">{t("fuelPurchase.selectState")}</option>
                    {US_STATES.map((s) => (
                      <option key={s.abbr} value={s.abbr}>
                        {s.name}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: "12px", marginBottom: "20px" }}>
                <div>
                  <label style={{ fontSize: "11px", color: "#9A9A9A", textTransform: "uppercase" }}>
                    {t("fuelPurchase.gallons")}
                  </label>
                  <input
                    type="number"
                    step="0.01"
                    min="0"
                    className="form-control"
                    value={gallons}
                    onChange={(e) => setGallons(e.target.value)}
                    style={{ background: "rgba(255,255,255,0.05)", border: "1px solid #3a4555", color: "#fff" }}
                  />
                </div>
                <div>
                  <label style={{ fontSize: "11px", color: "#9A9A9A", textTransform: "uppercase" }}>
                    {t("fuelPurchase.pricePerGallon")}
                  </label>
                  <input
                    type="number"
                    step="0.01"
                    min="0"
                    className="form-control"
                    value={pricePerGallon}
                    onChange={(e) => setPricePerGallon(e.target.value)}
                    style={{ background: "rgba(255,255,255,0.05)", border: "1px solid #3a4555", color: "#fff" }}
                  />
                </div>
                <div>
                  <label style={{ fontSize: "11px", color: "#9A9A9A", textTransform: "uppercase" }}>
                    {t("fuelPurchase.totalCost")}
                  </label>
                  <input
                    type="number"
                    step="0.01"
                    min="0"
                    className="form-control"
                    value={totalCost}
                    onChange={(e) => setTotalCost(e.target.value)}
                    style={{ background: "rgba(255,255,255,0.05)", border: "1px solid #3a4555", color: "#fff" }}
                  />
                </div>
              </div>

              <Button
                type="submit"
                disabled={isSaving}
                style={{
                  width: "100%",
                  background: "#096afa",
                  border: "none",
                  borderRadius: "3px",
                  color: "#fff",
                  fontWeight: 600,
                  fontSize: "15px",
                  padding: "12px",
                }}
              >
                {isSaving ? t("fuelPurchase.saving") : t("fuelPurchase.save")}
              </Button>
            </form>
          </CardBody>
        </Card>

        <div style={{ margin: "18px 4px 8px" }}>
          <span style={{ fontSize: "15px", fontWeight: 600 }}>{t("fuelPurchase.recent")}</span>
        </div>

        {loadError && (
          <div className="alert alert-danger" role="alert">
            {loadError}
          </div>
        )}

        {loading ? (
          <div style={{ textAlign: "center", padding: "24px", color: "#9A9A9A" }}>{t("fuelPurchase.loading")}</div>
        ) : sortedPurchases.length === 0 ? (
          <Card>
            <CardBody style={{ textAlign: "center", padding: "24px", color: "#9A9A9A", fontSize: "13px" }}>
              {t("fuelPurchase.noPurchases")}
            </CardBody>
          </Card>
        ) : (
          sortedPurchases.map((p, i) => (
            <Card key={p.purchaseId || i}>
              <CardBody style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "14px 16px" }}>
                <div style={{ display: "flex", flexDirection: "column", gap: "2px" }}>
                  <span style={{ fontSize: "13px", fontWeight: 600 }}>
                    {p.state} · {p.date}
                  </span>
                  {p.totalCost ? (
                    <span style={{ fontSize: "11px", color: "#9A9A9A" }}>${Number(p.totalCost).toFixed(2)}</span>
                  ) : null}
                </div>
                <span style={{ fontSize: "14px", fontWeight: 600 }}>
                  {Number(p.gallons).toFixed(2)} {t("fuelPurchase.gallonsShort")}
                </span>
              </CardBody>
            </Card>
          ))
        )}
      </div>
    </div>
  );
}

export default FuelPurchase;