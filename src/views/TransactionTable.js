import React from "react";
import { useState } from "react";
import { BsTrashFill, BsReceipt, BsPencilFill } from "react-icons/bs";
import "./TransactionTable.css";
import { useTranslation } from "react-i18next";
import { translatePurpose } from "utils/translatedBusinessTypes";
import {
  FINANCIAL_COLORS,
  SALE_LINE_COLORS,
  getAmountPillStyle,
  isExpenseTransaction,
} from "utils/financialColors";

const stripBrackets = (text) =>
  (text ?? "")
    .replace(/\s*\([^)]*\)/g, "")
    .replace(/\s*\[[^\]]*\]/g, "")
    .replace(/\s{2,}/g, " ")
    .trim();

const formatJournalPurpose = (purpose) =>
  stripBrackets(translatePurpose(purpose));

const TransactionTable = ({
  items = [],
  handleDelete,
  handleEdit,
  handleReceiptClick,
  disabled,
  scheduleCount,
  userSubscription,
}) => {
  const { t } = useTranslation();
  const isFeatureEnabled = () => {
    return userSubscription || scheduleCount < 4;
  };
  const filteredItems = items.filter(
    (item) => item.transactionPurpose !== "Initial Cash Balance"
  );
  const [trialEndDate, setTrialEndDate] = useState(null);
  const formatDate = (dateString) => {
    const date = new Date(dateString);
    return date.toLocaleString("en-US", {
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      hour12: true,
    });
  };

  const sortedTransactions = [...filteredItems].sort((a, b) => {
    return new Date(b.createdAt) - new Date(a.createdAt);
  });

  const journalRows = [];
  sortedTransactions.forEach((transaction, index) => {
    const srNo = sortedTransactions.length - index;
    if (transaction.transactionType === "Receive" && transaction.subType === "sale_inventory") {
      const amt = parseFloat(transaction.transactionAmount) || 0;
      const cost = parseFloat(transaction.originalAmount) || 0;
      const name = transaction.transactionPurpose || transaction.assetName || "";
      const gain = Math.max(0, amt - cost);
      const loss = Math.max(0, cost - amt);
      journalRows.push({
        transaction,
        srNo,
        line: "sale_inventory",
        saleData: { amt, cost, name, gain, loss },
        isFirst: true
      });
    } else if (transaction.transactionType === "Receive" && transaction.subType === "sale_fixed") {
      const amt = parseFloat(transaction.transactionAmount) || 0;
      const cost = parseFloat(transaction.originalAmount) || 0;
      const name = transaction.transactionPurpose || transaction.assetName || "";
      const gain = Math.max(0, amt - cost);
      const loss = Math.max(0, cost - amt);
      journalRows.push({
        transaction,
        srNo,
        line: "sale_fixed",
        saleData: { amt, cost, name, gain, loss },
        isFirst: true
      });
    } else {
      journalRows.push({ transaction, srNo, line: "single", label: null, debit: null, credit: null, isFirst: true });
    }
  });

  const renderSaleRow = (row, idx, lineKey) => {
    const { transaction, srNo, saleData } = row;
    const { amt, cost, name, gain, loss } = saleData;
    const assetLabel =
      lineKey === "sale_inventory"
        ? stripBrackets(`${t("financialReport.inventory")} ${name}`)
        : stripBrackets(name);
    const fmt = (n) => n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    const pill = (color) => getAmountPillStyle(color);
    const dash = <span style={{ color: "#ffffff", fontSize: "14px" }}>-</span>;

    return (
      <tr key={`${transaction.id || idx}-${lineKey}`}>
        <td style={{ color: "#ffffff", verticalAlign: "top", paddingTop: "8px" }}>{formatDate(transaction.createdAt)}</td>
        <td style={{ color: "#ffffff", verticalAlign: "top", paddingTop: "8px" }}>{srNo}</td>
        <td colSpan={3} className="journal-sale-cell">
          <div className="journal-sale-grid">
            <div className="journal-sale-txn journal-sale-txn-bold">{stripBrackets(t('financialReport.receive'))}</div>
            <div className="journal-sale-debit"><span style={pill(SALE_LINE_COLORS.receive)}>${fmt(amt)}</span></div>
            <div className="journal-sale-credit">{dash}</div>

            <div className="journal-sale-txn">{assetLabel}</div>
            <div className="journal-sale-debit">{dash}</div>
            <div className="journal-sale-credit"><span style={pill(SALE_LINE_COLORS.inventory)}>${fmt(cost)}</span></div>

            {gain > 0 && (
              <>
                <div className="journal-sale-txn">{t('financialReport.gainOnSale')}</div>
                <div className="journal-sale-debit">{dash}</div>
                <div className="journal-sale-credit"><span style={pill(SALE_LINE_COLORS.gain)}>${fmt(gain)}</span></div>
              </>
            )}
            {loss > 0 && (
              <>
                <div className="journal-sale-txn">{t('financialReport.lossOnSale')}</div>
                <div className="journal-sale-debit"><span style={pill(SALE_LINE_COLORS.loss)}>${fmt(loss)}</span></div>
                <div className="journal-sale-credit">{dash}</div>
              </>
            )}
          </div>
        </td>
        <td className="transaction-table-actions" style={{ verticalAlign: "top", paddingTop: "8px" }}>
          <div style={{ display: "flex", gap: "10px", alignItems: "center", justifyContent: "center" }}>
            {handleEdit && <BsPencilFill className="edit-btn" onClick={() => isFeatureEnabled() && handleEdit(transaction)} style={{ cursor: isFeatureEnabled() ? "pointer" : "not-allowed", color: isFeatureEnabled() ? "#4a90e2" : "#ccc", opacity: isFeatureEnabled() ? 1 : 0.5 }} />}
            <BsTrashFill className="delete-btn" onClick={() => isFeatureEnabled() && handleDelete(transaction)} style={{ cursor: isFeatureEnabled() ? "pointer" : "not-allowed", color: isFeatureEnabled() ? "#e10d05" : "#ccc", opacity: isFeatureEnabled() ? 1 : 0.5 }} />
            {transaction.receiptUrl && <BsReceipt className="receipt-btn" onClick={() => isFeatureEnabled() && handleReceiptClick(transaction.receiptUrl)} style={{ cursor: isFeatureEnabled() ? "pointer" : "not-allowed", color: isFeatureEnabled() ? "#007bff" : "#ccc" }} />}
          </div>
        </td>
      </tr>
    );
  };

  const getDebitColor = (transaction) => {
    if (transaction.transactionType === "Receive") return FINANCIAL_COLORS.income;
    if (transaction.transactionType === "Payable") {
      if (isExpenseTransaction(transaction)) return FINANCIAL_COLORS.expense;
      if (transaction.subType === "New_Item") return FINANCIAL_COLORS.asset;
      return FINANCIAL_COLORS.payable;
    }
    if (["Pay", "New_Item"].includes(transaction.transactionType)) {
      return FINANCIAL_COLORS.cashOut;
    }
    return FINANCIAL_COLORS.cashOut;
  };

  const getCreditColor = (transaction) => {
    if (transaction.transactionType === "Receive") return FINANCIAL_COLORS.income;
    if (transaction.transactionType === "Payable") {
      if (isExpenseTransaction(transaction)) return FINANCIAL_COLORS.expense;
      if (transaction.subType === "New_Item") return FINANCIAL_COLORS.asset;
      return FINANCIAL_COLORS.payable;
    }
    if (["Pay", "New_Item"].includes(transaction.transactionType)) {
      return transaction.transactionType === "New_Item"
        ? FINANCIAL_COLORS.asset
        : FINANCIAL_COLORS.cashOut;
    }
    return FINANCIAL_COLORS.income;
  };

  return (
    <div className="table-container">
      <table className="transaction-table">
        <thead>
          <tr>
            <th>{t('financialReport.date')}</th>
            <th>{t('financialReport.srNo')}</th>
            <th>{t('financialReport.transaction')}</th>
            <th>{t('financialReport.debit')}</th>
            <th>{t('financialReport.credit')}</th>
            <th className="transaction-table-actions">{t('financialReport.actions')}</th>
          </tr>
        </thead>
        <tbody>
          {journalRows.map((row, idx) => {
            const { transaction, srNo, line, saleData } = row;

            if (line === "sale_inventory") return renderSaleRow(row, idx, "sale_inventory");
            if (line === "sale_fixed") return renderSaleRow(row, idx, "sale_fixed");

            if (line === "single") {
              const debitColor = getDebitColor(transaction);
              const creditColor = getCreditColor(transaction);
              const debitPill = getAmountPillStyle(debitColor, true);
              const creditPill = getAmountPillStyle(creditColor, true);

              return (
                <tr key={`${transaction.id || idx}-single`}>
                  <td style={{ color: "#ffffff" }}>{formatDate(transaction.createdAt)}</td>
                  <td style={{ color: "#ffffff" }}>{srNo}</td>
                  <td style={{ color: "#ffffff" }}>
                    {transaction.transactionType === "Receive" ? (
                      <>
                        <div style={{ fontWeight: "bold" }}>{stripBrackets(t('financialReport.receive'))}</div>
                        <div>{formatJournalPurpose(transaction.transactionPurpose)}</div>
                      </>
                    ) : (
                      <>
                        <div>
                          {transaction.transactionType === "Payable" && transaction.subType === "New_Item"
                            ? `${t('financialReport.purchasesOf')} ${formatJournalPurpose(transaction.assetName || transaction.transactionPurpose || "Item")}`
                            : formatJournalPurpose(transaction.transactionPurpose)}
                          {transaction.transactionType === "Payable" &&
                            transaction.subType !== "New_Item" &&
                            transaction.subType !== "Expense" &&
                            !transaction.transactionPurpose?.includes("(Expense)") ? " " + t('financialReport.expense') : ""}
                        </div>
                        <div style={{ fontWeight: "bold" }}>
                          {stripBrackets(
                            transaction.transactionType === "Pay"
                              ? t('financialReport.pay')
                              : transaction.transactionType === "Payable"
                                ? t('financialReport.payable')
                                : transaction.transactionType === "New_Item"
                                  ? t('financialReport.pay')
                                  : transaction.transactionType
                          )}
                        </div>
                      </>
                    )}
                  </td>
                  <td className="debit">
                    {transaction.transactionType === "Receive" && (
                      <>
                        <div className="debit-value" style={{ ...debitPill, marginBottom: "4px" }}>
                          $ {parseFloat(transaction.transactionAmount).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                        </div>
                        <div style={{ color: "#ffffff", fontSize: "14px" }}>-</div>
                      </>
                    )}
                    {transaction.transactionType === "Payable" && (
                      <>
                        <div className="debit-value" style={{ ...debitPill, marginBottom: "4px" }}>
                          $ {parseFloat(transaction.originalAmount || transaction.transactionAmount).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                        </div>
                        <div style={{ color: "#ffffff", fontSize: "14px" }}>-</div>
                      </>
                    )}
                    {["Pay", "New_Item"].includes(transaction.transactionType) && (
                      <>
                        <div className="debit-value" style={{ ...debitPill, marginBottom: "4px" }}>
                          $ {parseFloat(transaction.transactionAmount).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                        </div>
                        <div style={{ color: "#ffffff", fontSize: "14px" }}>-</div>
                      </>
                    )}
                  </td>
                  <td className="credit">
                    {transaction.transactionType === "Receive" && (
                      <>
                        <div style={{ color: "#ffffff", fontSize: "14px", marginBottom: "4px" }}>-</div>
                        <div className="credit-value" style={creditPill}>
                          $ {parseFloat(transaction.transactionAmount).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                        </div>
                      </>
                    )}
                    {transaction.transactionType === "Payable" && (
                      <>
                        <div style={{ color: "#ffffff", fontSize: "14px", marginBottom: "4px" }}>-</div>
                        <div className="credit-value" style={creditPill}>
                          $ {parseFloat(transaction.originalAmount || transaction.transactionAmount).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                        </div>
                      </>
                    )}
                    {["Pay", "New_Item"].includes(transaction.transactionType) && (
                      <>
                        <div style={{ color: "#ffffff", fontSize: "14px", marginBottom: "4px" }}>-</div>
                        <div className="credit-value" style={creditPill}>
                          $ {parseFloat(transaction.transactionAmount).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                        </div>
                      </>
                    )}
                  </td>
                  <td className="transaction-table-actions" style={{ verticalAlign: "middle" }}>
                    <div style={{ display: "flex", gap: "10px", alignItems: "center", justifyContent: "center" }}>
                      {handleEdit && <BsPencilFill className="edit-btn" onClick={() => isFeatureEnabled() && handleEdit(transaction)} style={{ cursor: isFeatureEnabled() ? "pointer" : "not-allowed", color: isFeatureEnabled() ? "#4a90e2" : "#ccc", opacity: isFeatureEnabled() ? 1 : 0.5, display: "flex", alignItems: "center", justifyContent: "center" }} />}
                      <BsTrashFill className="delete-btn" onClick={() => isFeatureEnabled() && handleDelete(transaction)} style={{ cursor: isFeatureEnabled() ? "pointer" : "not-allowed", color: isFeatureEnabled() ? "#e10d05" : "#ccc", opacity: isFeatureEnabled() ? 1 : 0.5, display: "flex", alignItems: "center", justifyContent: "center" }} />
                      {transaction.receiptUrl && <BsReceipt className="receipt-btn" onClick={() => isFeatureEnabled() && handleReceiptClick(transaction.receiptUrl)} style={{ cursor: isFeatureEnabled() ? "pointer" : "not-allowed", color: isFeatureEnabled() ? "#007bff" : "#ccc", opacity: isFeatureEnabled() ? 1 : 0.5, display: "flex", alignItems: "center", justifyContent: "center" }} />}
                    </div>
                  </td>
                </tr>
              );
            }
            return null;
          })}
        </tbody>
      </table>
    </div >
  );
};

export default TransactionTable;
