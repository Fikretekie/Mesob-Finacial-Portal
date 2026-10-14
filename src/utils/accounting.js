// ─────────────────────────────────────────────────────────────────────────────
// Shared accounting engine — the single source of truth for both the Financial
// Report (mesobfinancial2.js) and the Dashboard (Dashboard.js), so the two
// screens can never show different numbers for the same data.
//
// Ported verbatim from the Financial Report's (accrual-correct) calculations:
//   - inventory sales booked GROSS (full price -> revenue, cost -> COGS)
//   - fixed-asset sales booked NET (gain -> other income / loss -> other expense)
//   - a partially-paid Payable contributes only its REMAINING balance (the
//     installment Pay records supply the paid portion)
//   - asset purchases (New_Item / Payable+New_Item) are capitalized, not expensed
//   - net income = total revenue − total expenses
//
// All money functions return a 2-decimal STRING (matching the original call
// sites, which do parseFloat(...)); item helpers return arrays.
// ─────────────────────────────────────────────────────────────────────────────

import { currencySymbol } from "./currency";

const num = (x) => parseFloat(x) || 0;

/**
 * Normalize raw transactions from the API so installment payables expose a
 * derived `status` and `remainingAmount`. The Report already did this in its
 * fetch; the Dashboard did not — which was a source of divergence. Both should
 * normalize before feeding the engine.
 */
export function normalizeTransactions(raw) {
  const list = Array.isArray(raw) ? raw : raw?.transactions || raw?.data || [];
  return list.map((transaction) => {
    if (transaction.installmentPlan) {
      return {
        ...transaction,
        status:
          transaction.installmentPlan.remainingAmount > 0
            ? "Partially Paid"
            : "Paid",
        paidAmount: transaction.installmentPlan.paidAmount,
        remainingAmount: transaction.installmentPlan.remainingAmount,
      };
    }
    return transaction;
  });
}

/** Filter by an optional {from,to} date range and a purpose search term. */
export function filterItemsByTimeRange(items, range, searchTerm = "") {
  const term = (searchTerm || "").toLowerCase();
  if (!range || !range.from || !range.to) {
    return (items || []).filter((item) =>
      (item.transactionPurpose || "").toLowerCase().includes(term)
    );
  }
  const fromDate = new Date(range.from);
  fromDate.setHours(0, 0, 0, 0);
  const toDate = new Date(range.to);
  toDate.setHours(23, 59, 59, 999);
  return (items || []).filter((item) => {
    const itemDate = new Date(item.createdAt);
    return (
      itemDate >= fromDate &&
      itemDate <= toDate &&
      (item.transactionPurpose || "").toLowerCase().includes(term)
    );
  });
}

// ── Income statement ─────────────────────────────────────────────────────────

export function calculateOperatingRevenue(filteredItems) {
  const total = (filteredItems || []).reduce((sum, value) => {
    if (value.transactionType === "Receive") {
      if (value.subType === "sale_fixed") return sum; // disposal, not revenue
      return sum + num(value.transactionAmount);
    }
    return sum;
  }, 0);
  return total.toFixed(2);
}

export function calculateOtherIncome(filteredItems) {
  const total = (filteredItems || []).reduce((sum, value) => {
    if (value.transactionType === "Receive" && value.subType === "sale_fixed") {
      const gain = num(value.transactionAmount) - num(value.originalAmount);
      if (gain > 0) return sum + gain;
    }
    return sum;
  }, 0);
  return total.toFixed(2);
}

export function calculateOtherExpense(filteredItems) {
  const total = (filteredItems || []).reduce((sum, value) => {
    if (value.transactionType === "Receive" && value.subType === "sale_fixed") {
      const gain = num(value.transactionAmount) - num(value.originalAmount);
      if (gain < 0) return sum + Math.abs(gain);
    }
    return sum;
  }, 0);
  return total.toFixed(2);
}

/** Countable P&L outflow? Excludes outstanding-debt and asset purchases.
 *  `allItems` is the full (unfiltered) list, needed to resolve payableId. */
export function isCountableOutflow(value, allItems) {
  const isPayableNewItem =
    value.transactionType === "Payable" && value.subType === "New_Item";
  let isPaymentForNewItem = false;
  if (
    value.transactionType === "Pay" &&
    value.payableId &&
    value.payableId !== "outstanding-debt"
  ) {
    const originalPayable = (allItems || []).find((item) => item.id === value.payableId);
    if (originalPayable && originalPayable.subType === "New_Item") {
      isPaymentForNewItem = true;
    }
  }
  return (
    (value.transactionType === "Pay" ||
      (value.transactionType === "Payable" && value.status !== "Paid")) &&
    value.payableId !== "outstanding-debt" &&
    !(value.transactionPurpose || "").includes("Outstanding Debt") &&
    !isPayableNewItem &&
    !isPaymentForNewItem
  );
}

/** A Payable contributes its REMAINING balance; a Pay contributes its amount. */
export function outflowAmount(value) {
  return value.transactionType === "Payable"
    ? num(value.remainingAmount != null ? value.remainingAmount : value.transactionAmount)
    : num(value.transactionAmount);
}

export function calculateCOGS(filteredItems, allItems) {
  const soldInventoryCost = (filteredItems || []).reduce((sum, value) => {
    if (value.transactionType === "Receive" && value.subType === "sale_inventory") {
      return sum + num(value.originalAmount);
    }
    return sum;
  }, 0);
  const directCogs = (filteredItems || []).reduce((sum, value) => {
    if (value.subType === "COGS" && isCountableOutflow(value, allItems)) {
      return sum + outflowAmount(value);
    }
    return sum;
  }, 0);
  return (soldInventoryCost + directCogs).toFixed(2);
}

export function calculateOperatingExpenses(filteredItems, allItems) {
  const total = (filteredItems || []).reduce((sum, value) => {
    if (value.subType !== "COGS" && isCountableOutflow(value, allItems)) {
      return sum + outflowAmount(value);
    }
    return sum;
  }, 0);
  return total.toFixed(2);
}

export function calculateGrossProfit(filteredItems, allItems) {
  return (
    parseFloat(calculateOperatingRevenue(filteredItems)) -
    parseFloat(calculateCOGS(filteredItems, allItems))
  ).toFixed(2);
}

export function calculateTotalRevenue(filteredItems) {
  return (
    parseFloat(calculateOperatingRevenue(filteredItems)) +
    parseFloat(calculateOtherIncome(filteredItems))
  ).toFixed(2);
}

export function calculateTotalExpenses(filteredItems, allItems) {
  return (
    parseFloat(calculateCOGS(filteredItems, allItems)) +
    parseFloat(calculateOperatingExpenses(filteredItems, allItems)) +
    parseFloat(calculateOtherExpense(filteredItems))
  ).toFixed(2);
}

export function calculateNetIncome(filteredItems, allItems) {
  return (
    parseFloat(calculateTotalRevenue(filteredItems)) -
    parseFloat(calculateTotalExpenses(filteredItems, allItems))
  ).toFixed(2);
}

/** Tax set-aside estimate: 30% of net profit, $0 on a loss. */
export function calculateEstimatedTax(filteredItems, allItems) {
  return (Math.max(0, parseFloat(calculateNetIncome(filteredItems, allItems))) * 0.3).toFixed(2);
}

// ── Balance-sheet-ish ────────────────────────────────────────────────────────

export function calculateTotalCash(filteredItems, initialBalance = 0) {
  const totalReceived = (filteredItems || []).reduce(
    (sum, v) => (v.transactionType === "Receive" ? sum + num(v.transactionAmount) : sum),
    0
  );
  const newItemReceived = (filteredItems || []).reduce(
    (sum, v) => (v.transactionType === "New_Item" ? sum + num(v.transactionAmount) : sum),
    0
  );
  const totalPaid = (filteredItems || []).reduce(
    (sum, v) => (v.transactionType === "Pay" ? sum + num(v.transactionAmount) : sum),
    0
  );
  return (num(initialBalance) + totalReceived - totalPaid - newItemReceived).toFixed(2);
}

export function calculateTotalPayable(filteredItems, allItems, initialOutstandingDebt = 0) {
  const totalPayable = (filteredItems || []).reduce(
    (sum, v) =>
      v.transactionType === "Payable" && v.status !== "Paid"
        ? sum + num(v.transactionAmount)
        : sum,
    0
  );
  const outstandingDebtPayments = (allItems || []).reduce(
    (sum, v) =>
      v.payableId === "outstanding-debt" && v.transactionType === "Pay"
        ? sum + num(v.transactionAmount)
        : sum,
    0
  );
  const remainingOutstandingDebt = Math.max(0, num(initialOutstandingDebt) - outstandingDebtPayments);
  return (totalPayable + remainingOutstandingDebt).toFixed(2);
}

export function calculateTotalInventory(filteredItems, initialValueableItems = 0) {
  const newItemsTotal = (filteredItems || []).reduce((sum, item) => {
    const isNewItemCurrent = item.transactionType === "New_Item" && item.assetType === "current";
    const isPayableCurrent = item.transactionType === "Payable" && item.assetType === "current" && item.subType === "New_Item";
    const isLegacyNewItem = item.transactionType === "New_Item" && item.subType === "New_Item" && item.assetType !== "fixed";
    const isLegacyPayableNewItem = item.transactionType === "Payable" && item.subType === "New_Item" && !item.assetType;
    if (isNewItemCurrent || isPayableCurrent || isLegacyNewItem || isLegacyPayableNewItem) {
      const amount = item.transactionType === "Payable"
        ? num(item.originalAmount || item.transactionAmount)
        : num(item.transactionAmount);
      return sum + amount;
    }
    return sum;
  }, 0);
  const saleInventoryCost = (filteredItems || []).reduce((sum, item) => {
    if (item.transactionType === "Receive" && item.subType === "sale_inventory" && num(item.originalAmount)) {
      return sum + num(item.originalAmount);
    }
    return sum;
  }, 0);
  return Math.max(0, newItemsTotal - saleInventoryCost + num(initialValueableItems)).toFixed(2);
}

// ── Depreciation (book) ──────────────────────────────────────────────────────
// Fixed assets lose value over time. Two methods are supported per asset:
//   - straight_line: cost spread evenly over `usefulLifeYears` (monthly prorated)
//   - section_179:   full cost written off in the period it was purchased
// These are book estimates to help a small business see net asset value and a
// more realistic profit — not a substitute for a tax preparer's schedule.

/** Whole months an asset has been in service, under the full-month (a.k.a.
 *  mid-month) convention small businesses keep their books on: the month an
 *  asset is placed in service counts as a full month, and depreciation then
 *  accrues one whole month at a time. This avoids the odd daily-prorated cents
 *  (e.g. $3.30 on a week-old asset) that continuous proration produced, and
 *  matches how a monthly depreciation schedule actually reads ($15, $30, …). */
function monthsInService(start, asOf) {
  if (!start || asOf < start) return 0;
  const months =
    (asOf.getFullYear() - start.getFullYear()) * 12 +
    (asOf.getMonth() - start.getMonth()) +
    1; // +1: the acquisition month itself counts as a full month
  return Math.max(0, months);
}

/** Fixed-asset purchases, as depreciable lots. Assets that have since been sold
 *  (a sale_fixed disposal referencing them) are excluded — you don't depreciate
 *  something you no longer own; its gain/loss already captures the economics. */
export function getFixedAssetLots(allItems) {
  const disposedIds = new Set(
    (allItems || [])
      .filter(
        (t) =>
          t.transactionType === "Receive" &&
          t.subType === "sale_fixed" &&
          t.soldTransactionId != null
      )
      .map((t) => t.soldTransactionId)
  );
  return (allItems || [])
    .filter((t) => {
      const isNewItemFixed = t.transactionType === "New_Item" && t.assetType === "fixed";
      const isPayableFixed =
        t.transactionType === "Payable" && t.assetType === "fixed" && t.subType === "New_Item";
      return (isNewItemFixed || isPayableFixed) && !disposedIds.has(t.id);
    })
    .map((t) => ({
      cost: num(t.originalAmount || t.transactionAmount),
      date: t.createdAt ? new Date(t.createdAt) : null,
      method: t.depreciationMethod === "section_179" ? "section_179" : "straight_line",
      lifeYears: num(t.usefulLifeYears) > 0 ? num(t.usefulLifeYears) : 5,
      name: t.assetName || t.transactionPurpose || "Fixed asset",
    }));
}

/** Accumulated depreciation of one lot as of a date. */
function lotAccumulated(lot, asOf) {
  if (!lot.date || asOf < lot.date) return 0;
  if (lot.method === "section_179") return lot.cost; // fully expensed at purchase
  const monthsElapsed = monthsInService(lot.date, asOf);
  const annual = lot.cost / lot.lifeYears;
  const accumulated = (monthsElapsed / 12) * annual;
  return Math.min(lot.cost, Math.max(0, accumulated));
}

/** Total accumulated depreciation across all fixed assets as of a date. */
export function calculateAccumulatedDepreciation(allItems, asOf = new Date()) {
  const when = asOf ? new Date(asOf) : new Date();
  return getFixedAssetLots(allItems)
    .reduce((sum, lot) => sum + lotAccumulated(lot, when), 0)
    .toFixed(2);
}

/** Depreciation expense recognized within a period (range = {from,to} or null
 *  for "up to now"). It is the change in accumulated depreciation over the
 *  window, so each dollar of cost is expensed exactly once over the asset's life. */
export function calculateDepreciationExpense(allItems, range = null) {
  const to = range && range.to ? new Date(range.to) : new Date();
  const from = range && range.from ? new Date(range.from) : new Date(0);
  return getFixedAssetLots(allItems)
    .reduce((sum, lot) => sum + (lotAccumulated(lot, to) - lotAccumulated(lot, from)), 0)
    .toFixed(2);
}

export function calculateTotalFixedAssets(filteredItems) {
  const fixedAdded = (filteredItems || []).reduce((sum, item) => {
    const isNewItemFixed = item.transactionType === "New_Item" && item.assetType === "fixed";
    const isPayableFixed = item.transactionType === "Payable" && item.assetType === "fixed" && item.subType === "New_Item";
    if (isNewItemFixed || isPayableFixed) {
      const amount = item.transactionType === "Payable"
        ? num(item.originalAmount || item.transactionAmount)
        : num(item.transactionAmount);
      return sum + amount;
    }
    return sum;
  }, 0);
  const fixedSold = (filteredItems || []).reduce((sum, item) => {
    if (item.transactionType === "Receive" && item.subType === "sale_fixed" && num(item.originalAmount)) {
      return sum + num(item.originalAmount);
    }
    return sum;
  }, 0);
  return (fixedAdded - fixedSold).toFixed(2);
}

/** Inventory lots still in stock, with remaining cost/qty (partial-sale aware). */
export function getCurrentAssetItems(allItems) {
  const result = [];
  const soldCostById = {};
  const soldQtyById = {};
  (allItems || []).forEach((t) => {
    if (t.transactionType === "Receive" && t.subType === "sale_inventory" && t.soldTransactionId != null) {
      const id = t.soldTransactionId;
      soldCostById[id] = (soldCostById[id] || 0) + num(t.originalAmount);
      soldQtyById[id] = (soldQtyById[id] || 0) + num(t.quantitySold);
    }
  });
  const pushLot = (t, name) => {
    const originalCost = num(t.originalAmount || t.transactionAmount);
    const originalQty = t.quantity != null && t.quantity !== "" ? num(t.quantity) : null;
    const remainingCost = originalCost - (soldCostById[t.id] || 0);
    if (remainingCost <= 0.005) return;
    const remainingQty = originalQty != null ? originalQty - (soldQtyById[t.id] || 0) : null;
    const unitCost = originalQty && originalQty > 0 ? originalCost / originalQty : null;
    const qtyLabel = remainingQty != null ? ` · ${remainingQty} left` : "";
    result.push({
      id: t.id,
      name,
      amount: remainingCost,
      originalCost,
      originalQty,
      unitCost,
      remainingQty,
      purpose: t.transactionPurpose,
      displayName: `${name} - ${currencySymbol()}${remainingCost.toFixed(2)}${qtyLabel}`,
    });
  };
  (allItems || []).forEach((t) => {
    const isNewItemCurrent = t.transactionType === "New_Item" && t.assetType === "current" && t.assetName;
    const isPayableCurrent = t.transactionType === "Payable" && t.assetType === "current" && t.subType === "New_Item" && t.assetName;
    const isNewItemDefault = t.transactionType === "New_Item" && !t.assetType && t.assetName;
    if (isNewItemCurrent || isPayableCurrent || isNewItemDefault) {
      pushLot(t, t.assetName);
      return;
    }
    const isPayableDefaultCurrent = t.transactionType === "Payable" &&
      t.subType === "New_Item" &&
      t.assetType !== "fixed" &&
      !t.assetName &&
      t.transactionPurpose;
    if (isPayableDefaultCurrent) {
      pushLot(t, t.transactionPurpose);
    }
  });
  return result;
}

/**
 * One call that returns all the headline numbers a screen shows, from the same
 * engine — so the Dashboard and Report always agree.
 */
export function computeSummary(rawItems, opts = {}) {
  const {
    range = null,
    searchTerm = "",
    initialBalance = 0,
    initialOutstandingDebt = 0,
    initialValueableItems = 0,
    normalize = true,
  } = opts;
  const items = normalize ? normalizeTransactions(rawItems) : (rawItems || []);
  const filtered = filterItemsByTimeRange(items, range, searchTerm);
  return {
    items,
    filtered,
    operatingRevenue: parseFloat(calculateOperatingRevenue(filtered)),
    otherIncome: parseFloat(calculateOtherIncome(filtered)),
    otherExpense: parseFloat(calculateOtherExpense(filtered)),
    cogs: parseFloat(calculateCOGS(filtered, items)),
    grossProfit: parseFloat(calculateGrossProfit(filtered, items)),
    operatingExpenses: parseFloat(calculateOperatingExpenses(filtered, items)),
    totalRevenue: parseFloat(calculateTotalRevenue(filtered)),
    totalExpenses: parseFloat(calculateTotalExpenses(filtered, items)),
    netIncome: parseFloat(calculateNetIncome(filtered, items)),
    estimatedTax: parseFloat(calculateEstimatedTax(filtered, items)),
    totalCash: parseFloat(calculateTotalCash(filtered, initialBalance)),
    totalPayable: parseFloat(calculateTotalPayable(filtered, items, initialOutstandingDebt)),
    totalInventory: parseFloat(calculateTotalInventory(filtered, initialValueableItems)),
    totalFixedAssets: parseFloat(calculateTotalFixedAssets(filtered)),
  };
}
