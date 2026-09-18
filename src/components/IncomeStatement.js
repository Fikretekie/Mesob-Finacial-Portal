import React, { useState, useEffect } from "react";
import "../assets/css/IncomeStatement.css";
import { FINANCIAL_COLORS, getNetIncomeColor } from "utils/financialColors";

const IncomeStatement = ({ items = [] }) => {
  const [revenues, setRevenues] = useState({});
  const [expenses, setExpenses] = useState({});
  const [accountsPayable, setAccountsPayable] = useState({});

  useEffect(() => {
    if (items && items.length > 0) {
      calculateFinancials(items);
    }
  }, [items]);

  const calculateFinancials = (transactions) => {
    const newRevenues = {};
    const newExpenses = {};
    const newAccountsPayable = {};

    transactions.forEach((transaction) => {
      const amount = parseFloat(transaction.transactionAmount) || 0;
      if (transaction.transactionType === "Receive") {
        const purpose = transaction.transactionPurpose;
        newRevenues[purpose] = (newRevenues[purpose] || 0) + amount;
      } else if (
        transaction.transactionType === "Pay" ||
        transaction.transactionType === "Payable"
      ) {
        const purpose = transaction.transactionPurpose;
        newExpenses[purpose] = (newExpenses[purpose] || 0) + amount;
        if (transaction.transactionType === "Payable") {
          newAccountsPayable[purpose] =
            (newAccountsPayable[purpose] || 0) + amount;
        }
      }
    });

    setRevenues(newRevenues);
    setExpenses(newExpenses);
    setAccountsPayable(newAccountsPayable);
  };

  const calculateTotalRevenue = () => {
    return Object.values(revenues)
      .reduce((sum, amount) => sum + amount, 0)
      .toFixed(2);
  };

  const calculateTotalExpenses = () => {
    return Object.values(expenses)
      .reduce((sum, amount) => sum + amount, 0)
      .toFixed(2);
  };

  const calculateTotalPayable = () => {
    return Object.values(accountsPayable)
      .reduce((sum, amount) => sum + amount, 0)
      .toFixed(2);
  };

  return (
    <div className="income-statement">
      <h1>Income Statement</h1>
      <div className="statement-table">
        <table>
          <tbody>
            <tr>
              <td>
                <strong>Revenue</strong>
              </td>
              <td></td>
            </tr>
            {Object.entries(revenues).map(([purpose, amount]) => (
              <tr key={`revenue-${purpose}`}>
                <td>{purpose}</td>
                <td style={{ backgroundColor: "var(--text-1)" }}>
                  ${amount.toFixed(2)}
                </td>
              </tr>
            ))}
            <tr>
              <td>
                <strong>Total Revenue</strong>
              </td>
              <td style={{ backgroundColor: FINANCIAL_COLORS.income, color: "#000", fontWeight: "bold" }}>
                ${calculateTotalRevenue()}
              </td>
            </tr>

            <tr>
              <td>
                <strong>Expenses</strong>
              </td>
              <td></td>
            </tr>
            {Object.entries(expenses).map(([purpose, amount]) => (
              <tr key={`expense-${purpose}`}>
                <td>{purpose}</td>
                <td style={{ backgroundColor: "var(--text-1)" }}>
                  ${amount.toFixed(2)}
                </td>
              </tr>
            ))}
            <tr>
              <td>
                <strong>Total Expenses</strong>
              </td>
              <td style={{ backgroundColor: FINANCIAL_COLORS.expense, color: "#000" }}>
                ${calculateTotalExpenses()}
              </td>
            </tr>

            <tr>
              <td>
                <strong>
                  {parseFloat(calculateTotalRevenue()) -
                    parseFloat(calculateTotalExpenses()) <
                  0
                    ? "Net Loss"
                    : "Net Income"}
                </strong>
              </td>
              <td
                style={{
                  backgroundColor: getNetIncomeColor(
                    parseFloat(calculateTotalRevenue()) - parseFloat(calculateTotalExpenses())
                  ),
                  color: "#000",
                  fontWeight: "bold",
                }}
              >
                $
                {(
                  parseFloat(calculateTotalRevenue()) -
                  parseFloat(calculateTotalExpenses())
                ).toFixed(2)}
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>
  );
};

export default IncomeStatement;
