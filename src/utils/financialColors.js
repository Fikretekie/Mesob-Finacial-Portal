/** Shared financial color palette and helpers (positive / zero / negative balances + transaction types). */

export const FINANCIAL_COLORS = {
  positive: "#00D97E",
  zero: "#A0A0A0",
  negative: "#FF4D4D",
  income: "#00D97E",
  cashOut: "#FF4D4D",
  loss: "#FF4D4D",
  payable: "#FFA53B",
  asset: "#00B4D8",
  expense: "#A855F7",
  negativeBg: "rgba(255, 77, 77, 0.12)",
  negativeBorder: "rgba(255, 77, 77, 0.35)",
};

export const SALE_LINE_COLORS = {
  receive: FINANCIAL_COLORS.income,
  inventory: FINANCIAL_COLORS.asset,
  gain: FINANCIAL_COLORS.income,
  loss: FINANCIAL_COLORS.loss,
};

export const parseAmount = (value) => {
  const n = parseFloat(value);
  return Number.isFinite(n) ? n : 0;
};

export const getBalanceColor = (value) => {
  const n = parseAmount(value);
  if (n > 0) return FINANCIAL_COLORS.positive;
  if (n === 0) return FINANCIAL_COLORS.zero;
  return FINANCIAL_COLORS.negative;
};

export const getBalanceState = (value) => {
  const n = parseAmount(value);
  if (n > 0) return "positive";
  if (n === 0) return "zero";
  return "negative";
};

export const getBalanceCardStyle = (value, baseStyle = {}) => {
  if (getBalanceState(value) === "negative") {
    return {
      ...baseStyle,
      backgroundColor: FINANCIAL_COLORS.negativeBg,
      borderColor: FINANCIAL_COLORS.negativeBorder,
    };
  }
  return baseStyle;
};

export const getNetIncomeColor = (value) => getBalanceColor(value);

export const isExpenseTransaction = (transaction) => {
  if (!transaction) return false;
  return (
    transaction.subType === "Expense" ||
    Boolean(transaction.transactionPurpose?.includes("(Expense)"))
  );
};

export const isInventoryTransaction = (transaction) => {
  if (!transaction) return false;
  return (
    transaction.subType === "New_Item" ||
    transaction.subType === "sale_inventory" ||
    transaction.transactionType === "New_Item"
  );
};

/**
 * @param {object} transaction
 * @param {'default'|'debit'|'credit'|'gain'|'loss'|'inventory'|'asset'} context
 */
export const getTransactionColor = (transaction, context = "default") => {
  if (!transaction) return FINANCIAL_COLORS.income;

  if (context === "gain") return FINANCIAL_COLORS.income;
  if (context === "loss") return FINANCIAL_COLORS.loss;
  if (context === "inventory" || context === "asset") return FINANCIAL_COLORS.asset;

  const { transactionType: type, subType } = transaction;

  if (type === "Receive") return FINANCIAL_COLORS.income;

  if (type === "Pay") return FINANCIAL_COLORS.cashOut;

  if (type === "New_Item") {
    return context === "credit" ? FINANCIAL_COLORS.asset : FINANCIAL_COLORS.cashOut;
  }

  if (type === "Payable") {
    if (isExpenseTransaction(transaction)) return FINANCIAL_COLORS.expense;
    if (subType === "New_Item") {
      return context === "credit" ? FINANCIAL_COLORS.asset : FINANCIAL_COLORS.asset;
    }
    return context === "credit" ? FINANCIAL_COLORS.payable : FINANCIAL_COLORS.payable;
  }

  return FINANCIAL_COLORS.income;
};

// Map the fixed data hexes to theme tokens so pills adapt to light/dark.
const HEX_TO_VAR = {
  "#00D97E": "var(--green)",
  "#FF4D4D": "var(--red)",
  "#FFA53B": "var(--amber)",
  "#00B4D8": "var(--teal)",
  "#A855F7": "var(--purple)",
  "#A0A0A0": "var(--text-3)",
};

// Soft "glassy" pill: a low-alpha wash of the colour with colour-matched mono
// text, instead of a solid block. color-mix keeps the wash correct in both
// themes (falls back to just the coloured text if unsupported).
export const getAmountPillStyle = (color, compact = false) => {
  const c = HEX_TO_VAR[String(color).toUpperCase()] || color;
  return {
    backgroundColor: `color-mix(in srgb, ${c} 15%, transparent)`,
    color: c,
    fontWeight: 700,
    padding: compact ? "4px 9px" : "5px 11px",
    borderRadius: "8px",
    fontFamily: 'var(--font-mono, ui-monospace, "JetBrains Mono", Menlo, monospace)',
    fontVariantNumeric: "tabular-nums",
    whiteSpace: "nowrap",
    display: "inline-block",
    boxSizing: "border-box",
  };
};

export const getJournalPillStyle = (transaction, context, compact = false) =>
  getAmountPillStyle(getTransactionColor(transaction, context), compact);
