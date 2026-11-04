import React, { useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { useNavigate } from "react-router-dom";
import { Helmet } from "react-helmet";
import { Spinner } from "reactstrap";
import { syncTransactions, confirmTransactions, fetchConnections } from "utils/connectionsStorage";
import { loadChargeMatches } from "utils/bankMatch";
import { apiUrl, ROUTES } from "config/api";
import "../assets/css/team.css";
import "../assets/css/connections.css";
import "../assets/css/transactionReview.css";

const EXPENSE_CATEGORIES = [
  "Fuel Expense",
  "Truck Repairs and Maintenance",
  "Driver Salaries/Wages",
  "Insurance Premiums",
  "Toll Charges",
  "Loan Payment",
  "Accounts Payable",
  "Other Expense",
];

const INCOME_CATEGORIES = [
  "Freight Income",
  "Lease Income",
  "Fuel Surcharge Revenue",
  "Accounts Receivable Payment",
  "Other Income",
];

/** Plaid's personal_finance_category.primary -> Meksova's existing category
 * list. Unmapped categories fall back to "Other Expense"/"Other Income" --
 * never blocks adding, it's a starting guess the user can change. */
const PLAID_CATEGORY_MAP = {
  TRANSPORTATION: "Fuel Expense",
  TRAVEL: "Fuel Expense",
  GENERAL_SERVICES: "Truck Repairs and Maintenance",
  LOAN_PAYMENTS: "Loan Payment",
  INSURANCE: "Insurance Premiums",
  INCOME: "Freight Income",
  TRANSFER_IN: "Freight Income",
};

function guessCategory(txn) {
  const isIncome = txn.amount < 0;
  const categories = isIncome ? INCOME_CATEGORIES : EXPENSE_CATEGORIES;
  const mapped = PLAID_CATEGORY_MAP[txn.category];
  if (mapped && categories.includes(mapped)) return mapped;
  return isIncome ? "Other Income" : "Other Expense";
}

function toBase64(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.readAsDataURL(file);
    reader.onload = () => resolve(reader.result.split(",")[1]);
    reader.onerror = reject;
  });
}

function TransactionReview() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [rows, setRows] = useState([]);
  const [autoImportAll, setAutoImportAll] = useState(false);
  const [saving, setSaving] = useState(false);
  const [uploadingId, setUploadingId] = useState(null);
  const [error, setError] = useState("");
  const [noBank, setNoBank] = useState(false);

  useEffect(() => {
    Promise.all([syncTransactions(), fetchConnections()])
      .then(async ([syncData, connData]) => {
        const txns = syncData?.transactions || [];
        // Charges already recorded (scanned receipt, fuel purchase, typed expense)
        // start unticked so they aren't counted twice.
        const matches = await loadChargeMatches(txns).catch(() => ({}));
        setRows(
          txns.map((txn) => ({
            ...txn,
            selected: !matches[txn.id],
            match: matches[txn.id] || null,
            purpose: guessCategory(txn),
            manualPurpose: "",
            receiptUrl: "",
          }))
        );
        setAutoImportAll(!!connData?.plaid?.autoImportAll);
      })
      .catch((err) => {
        // No bank linked yet: an empty state, not an error.
        if (err?.response?.status === 400 && /no bank connection/i.test(err.response.data?.message || "")) {
          setNoBank(true);
          return;
        }
        console.error("Sync failed:", err);
        setError(t("transactionReview.syncError"));
      })
      .finally(() => setLoading(false));
  }, [t]);

  const toggleRow = (id) => {
    setRows((rs) => rs.map((r) => (r.id === id ? { ...r, selected: !r.selected } : r)));
  };

  const setPurpose = (id, value) => {
    setRows((rs) => rs.map((r) => (r.id === id ? { ...r, purpose: value } : r)));
  };

  const setManualPurpose = (id, value) => {
    setRows((rs) => rs.map((r) => (r.id === id ? { ...r, manualPurpose: value } : r)));
  };

  const handleReceiptChange = async (id, file) => {
    if (!file) return;
    setUploadingId(id);
    try {
      const fileContent = await toBase64(file);
      const res = await fetch(apiUrl(ROUTES.RECEIPT), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          fileName: file.name,
          fileType: file.type,
          fileContent,
          userId: localStorage.getItem("userId"),
        }),
      });
      if (!res.ok) throw new Error(await res.text());
      const data = await res.json();
      setRows((rs) => rs.map((r) => (r.id === id ? { ...r, receiptUrl: data.url } : r)));
    } catch (err) {
      console.error("Receipt upload failed:", err);
    } finally {
      setUploadingId(null);
    }
  };

  const selectedRows = useMemo(() => rows.filter((r) => r.selected), [rows]);
  const matchedCount = useMemo(() => rows.filter((r) => r.match).length, [rows]);

  const matchLabel = (m) =>
    t(`transactionReview.match.${m.source}`, {
      purpose: m.purpose,
      date: new Date(m.day).toLocaleDateString(undefined, { month: "short", day: "numeric" }),
    });
  const netTotal = useMemo(() => selectedRows.reduce((sum, r) => sum - r.amount, 0), [selectedRows]);

  const handleToggleAutoImport = (checked) => {
    setAutoImportAll(checked);
    confirmTransactions([], [], checked).catch((err) => console.error("Auto-import toggle save failed:", err));
  };

  const handleConfirm = async () => {
    if (!selectedRows.length) return;
    setSaving(true);
    setError("");
    try {
      const payload = selectedRows.map((r) => ({
        id: r.id,
        amount: r.amount,
        date: r.date,
        category: r.purpose === "manual" ? r.manualPurpose || "Other" : r.purpose,
        receiptUrl: r.receiptUrl || "",
      }));
      const reviewedIds = rows.map((r) => r.id);
      await confirmTransactions(payload, reviewedIds, autoImportAll);
      navigate("/customer/connections");
    } catch (err) {
      console.error("Confirm failed:", err);
      setError(t("transactionReview.confirmError"));
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="tr-review-page tr-review-loading">
        <Spinner />
      </div>
    );
  }

  return (
    <div className="tr-review-page">
      <Helmet>
        <title>Review Transactions - Meksova</title>
      </Helmet>

      <div className="team-head">
        <div>
          <h2 className="team-title">{t("transactionReview.title")}</h2>
          <p className="team-sub">
            {rows.length
              ? t("transactionReview.subtitle", { selected: selectedRows.length, total: rows.length })
              : noBank || error
                ? null
                : t("transactionReview.noneFound")}
          </p>
        </div>
      </div>

      {error && <p className="tr-review-error">{error}</p>}
      {matchedCount > 0 && (
        <p className="tr-review-match-note" role="status">
          {t("transactionReview.matchNote", { count: matchedCount })}
        </p>
      )}

      {noBank ? (
        <div className="tr-review-caught-up">
          <div className="tr-review-caught-up-title">{t("transactionReview.noBankTitle")}</div>
          <p className="tr-review-caught-up-text">{t("transactionReview.noBankText")}</p>
          <button type="button" className="conn-btn" onClick={() => navigate("/customer/connections")}>
            {t("transactionReview.connectBank")}
          </button>
        </div>
      ) : error && rows.length === 0 ? null : rows.length === 0 ? (
        <div className="tr-review-caught-up">
          <div className="tr-review-caught-up-icon">✓</div>
          <div className="tr-review-caught-up-title">{t("transactionReview.caughtUpTitle")}</div>
          <p className="tr-review-caught-up-text">{t("transactionReview.caughtUpText")}</p>
        </div>
      ) : (
        <div className="tr-review-list">
          {rows.map((r) => {
            const isIncome = r.amount < 0;
            const categories = isIncome ? INCOME_CATEGORIES : EXPENSE_CATEGORIES;
            return (
              <div className={"tr-review-row" + (r.selected ? " tr-review-row--on" : "")} key={r.id}>
                <button
                  type="button"
                  className="tr-review-toggle"
                  aria-pressed={r.selected}
                  onClick={() => toggleRow(r.id)}
                >
                  <span className="tr-review-toggle-knob" />
                </button>

                <div className="tr-review-info">
                  <div className="tr-review-name">{r.name}</div>
                  <div className="tr-review-date">{r.date}</div>
                  {r.match && <div className="tr-review-match">{matchLabel(r.match)}</div>}
                </div>

                <div className="tr-review-category-wrap">
                  <select
                    className="tr-review-category"
                    value={r.purpose}
                    onChange={(e) => setPurpose(r.id, e.target.value)}
                  >
                    {categories.map((c) => (
                      <option key={c} value={c}>
                        {c}
                      </option>
                    ))}
                    <option value="manual">{t("transactionReview.enterManually")}</option>
                  </select>
                  {r.purpose === "manual" && (
                    <input
                      type="text"
                      className="tr-review-manual"
                      placeholder={t("transactionReview.categoryPlaceholder")}
                      value={r.manualPurpose}
                      onChange={(e) => setManualPurpose(r.id, e.target.value)}
                    />
                  )}
                </div>

                <label className="tr-review-receipt" title={t("transactionReview.addReceipt")}>
                  {uploadingId === r.id ? <Spinner size="sm" /> : r.receiptUrl ? "✓" : "📷"}
                  <input
                    type="file"
                    accept="image/*,application/pdf"
                    hidden
                    onChange={(e) => handleReceiptChange(r.id, e.target.files[0])}
                  />
                </label>

                <div className={"tr-review-amount" + (isIncome ? " tr-review-amount--pos" : "")}>
                  {isIncome ? "+" : "-"}${Math.abs(r.amount).toFixed(2)}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {!noBank && (
      <div className="tr-review-footer">
        <div className="tr-review-footer-left">
          {rows.length > 0 && (
            <>
              <button className="conn-btn" disabled={!selectedRows.length || saving} onClick={handleConfirm}>
                {saving ? <Spinner size="sm" /> : t("transactionReview.addButton", { count: selectedRows.length })}
              </button>
              {!!selectedRows.length && (
                <span className={"tr-review-net" + (netTotal >= 0 ? " tr-review-net--pos" : "")}>
                  {netTotal >= 0 ? "+" : "-"}${Math.abs(netTotal).toFixed(2)}
                </span>
              )}
            </>
          )}
        </div>
        <label className="tr-review-auto">
          <input
            type="checkbox"
            checked={autoImportAll}
            onChange={(e) => handleToggleAutoImport(e.target.checked)}
          />
          <span>{t("transactionReview.autoImportLabel")}</span>
        </label>
      </div>
      )}
    </div>
  );
}

export default TransactionReview;