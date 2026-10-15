import React, { useState, useEffect, useMemo } from "react";
import {
  Modal,
  ModalHeader,
  ModalBody,
  Button,
  Spinner,
} from "reactstrap";
import i18n from "../i18n";
import { translatePurpose, translatePurposeToLanguage } from "../utils/translatedBusinessTypes";
import { currencySymbol, getCurrencyCode } from "../utils/currency";
import {
  filterItemsByTimeRange,
  calculateTotalRevenue as engRevenue,
  calculateTotalExpenses as engExpenses,
  calculateTotalCash as engCash,
  calculateTotalPayable as engPayable,
  calculateTotalInventory as engInventory,
  calculateCOGS as engCOGS,
  calculateOperatingExpenses as engOpex,
  calculateTotalFixedAssets as engFixedAtCost,
  calculateAccumulatedDepreciation as engAccumDep,
  calculateDepreciationExpense as engDepExpense,
} from "../utils/accounting";

import { jsPDF } from "jspdf";
import autoTable from "jspdf-autotable";
import html2canvas from 'html2canvas';
import ReactApexChart from "react-apexcharts";
import { FINANCIAL_COLORS } from "utils/financialColors";

// English fallbacks when translation is missing (show English or key, never blank)
const PDF_EN = {
  financialExecutiveReport: "FINANCIAL EXECUTIVE REPORT",
  statementSummary: "STATEMENT SUMMARY",
  totalCashOnHand: "TOTAL CASH ON HAND",
  grossRevenue: "GROSS REVENUE",
  totalPayableUnpaid: "TOTAL PAYABLE (UNPAID)",
  totalExpense: "TOTAL EXPENSE",
  balanceSheetDetails: "BALANCE SHEET DETAILS",
  accountDetail: "Account Detail",
  currentValue: "Current Value",
  totalAssets: "Total Assets (Cash & Cash Equivalents)",
  currentLiabilities: "Current Liabilities (Short-Term Payables)",
  totalOwnerEquity: "TOTAL OWNER EQUITY",
  incomeStatementSummary: "INCOME STATEMENT SUMMARY",
  category: "Category",
  amount: "Amount",
  revenue: "Revenue",
  freightRevenue: "Freight Revenue / Manual Sales",
  expenses: "Expenses",
  netIncome: "NET INCOME",
  verifiedJournalEntries: "VERIFIED JOURNAL ENTRIES",
  date: "Date",
  description: "Description",
  debit: "Debit",
  credit: "Credit",
  cashFlowTrend: "CASH FLOW TREND",
  revenueGrowth: "REVENUE GROWTH",
  totalPayable: "TOTAL PAYABLE",
  totalExpenses: "TOTAL EXPENSES",
  termsTitle: "TERMS & RESPONSIBILITY",
  termsText: "The user is fully responsible for the accuracy and completeness of information entered into the system. Meksova is not responsible for inaccuracies in user-input data.",
  financialReportingSystems: "Financial Reporting Systems",
  confidential: "Confidential",
  page: "Page",
  of: "of",
  incomeEntry: "Income Entry",
  expenseEntry: "Expense Entry",
};

const DownloadReportModal = ({
  isOpen,
  toggle,
  companyName,
  items,
  allItems,
  revenues,
  expenses,
  initialBalance,
  initialvalueableItems,
  initialoutstandingDebt,
  calculateTotalCash,
  calculateTotalRevenue,
  calculateTotalExpenses,
  calculateTotalPayable,
  calculateTotalInventory,
  searchedDates,
  currentLanguage,
}) => {
  const [isGenerating, setIsGenerating] = useState(false);
  const [cashOnHandOptions, setCashOnHandOptions] = useState(null);
  const [revenueOptions, setRevenueOptions] = useState(null);
  const [payableOptions, setPayableOptions] = useState(null);
  const [expensesOptions, setExpensesOptions] = useState(null);

  // ── Export options ──────────────────────────────────────────────────────────
  const [reportType, setReportType] = useState("statements"); // statements | overview | complete
  const [includeCharts, setIncludeCharts] = useState(false);
  const [includeLedger, setIncludeLedger] = useState(false);
  const [period, setPeriod] = useState("current");            // current | month | last-month | quarter | ytd | custom
  const [fromDate, setFromDate] = useState("");
  const [toDate, setToDate] = useState("");

  const num = (v) => parseFloat(String(v ?? 0).replace(/,/g, "")) || 0;

  // filterItemsByTimeRange only filters on a {from,to} range, so turn each
  // preset into concrete dates. Returns null for "all" (no bound).
  const periodRange = () => {
    const iso = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
    const now = new Date();
    const y = now.getFullYear();
    const m = now.getMonth();
    if (period === "custom") return fromDate && toDate ? { from: fromDate, to: toDate } : null;
    if (period === "month") return { from: iso(new Date(y, m, 1)), to: iso(new Date(y, m + 1, 0)) };
    if (period === "last-month") return { from: iso(new Date(y, m - 1, 1)), to: iso(new Date(y, m, 0)) };
    if (period === "quarter") { const qs = Math.floor(m / 3) * 3; return { from: iso(new Date(y, qs, 1)), to: iso(new Date(y, qs + 3, 0)) }; }
    if (period === "ytd") return { from: iso(new Date(y, 0, 1)), to: iso(now) };
    // "current": reuse the page's active custom range if it has one.
    if (searchedDates && searchedDates.from && searchedDates.to) return { from: searchedDates.from, to: searchedDates.to };
    return null;
  };

  // The data the report renders. "current" reuses exactly what the page passed
  // (its already-correct numbers). Any other period re-filters the FULL set and
  // recomputes through the same shared accounting engine the pages delegate to,
  // so the figures match what that period shows on screen.
  const report = useMemo(() => {
    if (period === "current") {
      return {
        items: Array.isArray(items) ? items : [],
        revenues: revenues || {},
        expenses: expenses || {},
        totalCash: num(calculateTotalCash && calculateTotalCash()),
        totalRevenue: num(calculateTotalRevenue && calculateTotalRevenue()),
        totalExpenses: num(calculateTotalExpenses && calculateTotalExpenses()),
        totalPayable: num(calculateTotalPayable && calculateTotalPayable()),
        totalInventory: num(calculateTotalInventory && calculateTotalInventory()),
      };
    }
    const source =
      Array.isArray(allItems) && allItems.length
        ? allItems
        : Array.isArray(items)
        ? items
        : [];
    const filtered = filterItemsByTimeRange(source, periodRange(), "");
    const rev = {};
    const exp = {};
    filtered.forEach((t) => {
      const amt = parseFloat(t.transactionAmount) || 0;
      const p = t.transactionPurpose || t.purpose || "";
      if (t.transactionType === "Receive") rev[p] = (rev[p] || 0) + amt;
      else if (t.transactionType === "Pay" && t.subType !== "New_Item" && !t.payableId)
        exp[p] = (exp[p] || 0) + amt;
    });
    return {
      items: filtered,
      revenues: rev,
      expenses: exp,
      totalCash: num(engCash(filtered, Number(initialBalance) || 0)),
      totalRevenue: num(engRevenue(filtered)),
      totalExpenses: num(engExpenses(filtered, source)),
      totalPayable: num(engPayable(filtered, source, Number(initialoutstandingDebt) || 0)),
      totalInventory: num(engInventory(filtered, Number(initialvalueableItems) || 0)),
    };
  }, [
    period, fromDate, toDate, items, allItems, revenues, expenses,
    calculateTotalCash, calculateTotalRevenue, calculateTotalExpenses,
    calculateTotalPayable, calculateTotalInventory,
    initialBalance, initialoutstandingDebt, initialvalueableItems,
  ]);

  // Full professional-statement line items (P&L + Balance Sheet), recomputed
  // from the engine for the selected period so they are internally consistent.
  const statements = useMemo(() => {
    const source = Array.isArray(allItems) && allItems.length ? allItems : (Array.isArray(items) ? items : []);
    const filtered = Array.isArray(report.items) ? report.items : [];
    const r = periodRange();
    const asOf = r && r.to ? new Date(r.to) : new Date();
    const n = (v) => parseFloat(v) || 0;

    const totalRevenue = n(engRevenue(filtered));
    const cogs = n(engCOGS(filtered, source));
    const grossProfit = totalRevenue - cogs;
    const operatingExpenses = n(engOpex(filtered, source));
    const depreciation = n(engDepExpense(source, r));
    const totalExp = n(engExpenses(filtered, source)); // cogs + opex + otherExpense
    const otherExpense = Math.max(0, totalExp - cogs - operatingExpenses);
    const netIncome = totalRevenue - cogs - operatingExpenses - otherExpense - depreciation;

    const cash = n(engCash(filtered, Number(initialBalance) || 0));
    const inventory = n(engInventory(filtered, Number(initialvalueableItems) || 0));
    const fixedAtCost = n(engFixedAtCost(filtered));
    const accumDep = n(engAccumDep(source, asOf));
    const netFixed = fixedAtCost - accumDep;
    const payable = n(engPayable(filtered, source, Number(initialoutstandingDebt) || 0));
    const openingEquity = (Number(initialBalance) || 0) + (Number(initialvalueableItems) || 0) - (Number(initialoutstandingDebt) || 0);
    const retained = netIncome;

    const totalCurrentAssets = cash + inventory;
    const totalAssets = totalCurrentAssets + netFixed;
    const totalEquity = openingEquity + retained;
    const totalLE = payable + totalEquity;

    const revLines = Object.entries(report.revenues || {}).filter(([, a]) => Math.abs(a) > 0.005);
    const expLines = Object.entries(report.expenses || {}).filter(([, a]) => Math.abs(a) > 0.005);

    return {
      totalRevenue, cogs, grossProfit, operatingExpenses, depreciation, otherExpense, netIncome,
      cash, inventory, totalCurrentAssets, fixedAtCost, accumDep, netFixed, totalAssets,
      payable, openingEquity, retained, totalEquity, totalLE, revLines, expLines, asOf,
      balanced: Math.abs(totalAssets - totalLE) < 0.01,
    };
  }, [report, items, allItems, initialBalance, initialvalueableItems, initialoutstandingDebt, period, fromDate, toDate, searchedDates]);

  // Translate PDF label: current language → English → key (never blank)
  const pt = (key) => {
    const fullKey = `pdf.${key}`;
    const v = i18n.t(fullKey, { fallbackLng: "en" });
    if (v && String(v).trim() && v !== fullKey) return v;
    return PDF_EN[key] != null ? PDF_EN[key] : key.replace(/[._]/g, " ");
  };
  const dt = (key) => {
    const fullKey = `downloadReport.${key}`;
    const v = i18n.t(fullKey, { fallbackLng: "en" });
    if (v && String(v).trim() && v !== fullKey) return v;
    return key.replace(/[._]/g, " ");
  };

  useEffect(() => {
    const list = Array.isArray(report.items) ? report.items : [];
    const bal = Number(initialBalance) || 0;
    const debt = Number(initialoutstandingDebt) || 0;

    let cashOnHand = bal;
    let revenue = 0;
    let payable = debt;
    let expenses = 0;
    let newItem = 0;

    const dailyData = {
      Initial: {
        date: "Initial Balance",
        cashOnHand: bal,
        revenue: 0,
        payable: debt,
        expenses: 0,
        newItem: 0,
        paidPayables: 0,
      },
    };

    const sortedItems = [...list].sort((a, b) => new Date(a.createdAt) - new Date(b.createdAt));

    sortedItems.forEach((transaction) => {
      const amount = parseFloat(transaction.transactionAmount);
      const date = new Date(transaction.createdAt);
      const dateKey = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;

      if (!dailyData[dateKey]) {
        dailyData[dateKey] = {
          date: dateKey,
          cashOnHand: cashOnHand,
          revenue: 0,
          payable: payable,
          expenses: 0,
          newItem: 0,
          paidPayables: 0,
        };
      }

      if (transaction.transactionType === "Receive") {
        cashOnHand += amount;
        revenue += amount;
        dailyData[dateKey].revenue += amount;
      } else if (transaction.transactionType === "Pay") {
        expenses += amount;
        cashOnHand -= amount;
        dailyData[dateKey].expenses += amount;
        if (transaction.subType === "New_Item") {
          newItem += amount;
          dailyData[dateKey].newItem += amount;
        }
        if (transaction.payableId) {
          payable -= amount;
          dailyData[dateKey].paidPayables += amount;
        }
      } else if (transaction.transactionType === "Payable" && (transaction.status === "Payable" || transaction.status === "Partially Paid")) {
        payable += amount;
      }

      dailyData[dateKey].payable = payable;
      dailyData[dateKey].cashOnHand = cashOnHand;
    });

    const sortedDailyData = Object.values(dailyData).sort((a, b) => {
      if (a.date === "Initial Balance") return -1;
      if (b.date === "Initial Balance") return 1;
      return new Date(a.date) - new Date(b.date);
    });

    const formatDateLabel = (dateStr) => {
      if (dateStr === "Initial Balance") return "Initial";
      const date = new Date(dateStr);
      return date.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
    };

    const getChartOptions = (title, data, labels, color) => ({
      chart: { type: "area", toolbar: { show: false }, zoom: { enabled: false }, animations: { enabled: false } },
      title: { text: title, align: "left", style: { fontSize: "12px", color: "#333" } },
      series: [{ name: title, data }],
      xaxis: { categories: labels, labels: { show: false } },
      yaxis: { labels: { show: false } },
      stroke: { curve: "smooth", width: 2 },
      fill: { type: "solid", opacity: 0.3 },
      colors: [color],
      markers: { size: 0 },
      grid: { show: false },
      tooltip: { enabled: false },
      dataLabels: { enabled: false },
      legend: { show: false },
    });

    setCashOnHandOptions(getChartOptions(pt("cashFlowTrend"), sortedDailyData.map((i) => i.cashOnHand), sortedDailyData.map((i) => formatDateLabel(i.date)), FINANCIAL_COLORS.positive));
    setRevenueOptions(getChartOptions(pt("revenueGrowth"), sortedDailyData.map((i) => i.revenue), sortedDailyData.map((i) => formatDateLabel(i.date)), FINANCIAL_COLORS.income));
    setPayableOptions(getChartOptions(pt("totalPayable"), sortedDailyData.map((i) => i.payable), sortedDailyData.map((i) => formatDateLabel(i.date)), FINANCIAL_COLORS.payable));
    setExpensesOptions(getChartOptions(pt("totalExpenses"), sortedDailyData.map((i) => i.expenses), sortedDailyData.map((i) => formatDateLabel(i.date)), FINANCIAL_COLORS.expense));
  }, [report, initialBalance, initialoutstandingDebt]);

  // Wait for hidden chart divs to be in the DOM (so dashboard-only PDF can capture them)
  const waitForChartElements = (ids, timeoutMs = 6000, intervalMs = 100) =>
    new Promise((resolve) => {
      const start = Date.now();
      const check = () => {
        const allPresent = ids.every((id) => document.querySelector(`#${id}`));
        if (allPresent || Date.now() - start >= timeoutMs) return resolve(allPresent);
        setTimeout(check, intervalMs);
      };
      check();
    });

const captureChartAsImage = async (chartElementId) => {
  try {
    const chartElement = document.querySelector(`#${chartElementId}`);
    if (!chartElement) {
      console.warn(`Chart element #${chartElementId} not found`);
      return null;
    }
    // No setTimeout here — we wait once upfront in generatePDF
    const canvas = await html2canvas(chartElement, {
      backgroundColor: 'var(--text-1)', // ← white background so charts aren't transparent/blank
      scale: 2,
      logging: false,
      useCORS: true,
      allowTaint: true,
      width: chartElement.scrollWidth,
      height: chartElement.scrollHeight,
    });
    return canvas.toDataURL('image/png');
  } catch (error) {
    console.error(`Error capturing chart ${chartElementId}:`, error);
    return null;
  }
};

  const formatCurrency = (amount) => {
    const num = parseFloat(amount) || 0;
    // jsPDF's base font only renders Latin glyphs, so non-Latin currency symbols
    // (₹, ₦, ฿, Amharic/Arabic marks) would draw as tofu boxes in the PDF. Use the
    // symbol when it is ASCII ($, Br, kr, R$, A$…), otherwise fall back to the ISO
    // code (e.g. "INR 1,000.00"), which always renders and is unambiguous.
    const sym = currencySymbol();
    const prefix = /^[\x20-\x7E]+$/.test(sym) ? sym : `${getCurrencyCode()} `;
    return prefix + num.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  };

  const formatDate = (dateString) => {
    const date = new Date(dateString);
    return date.toLocaleDateString("en-US", { month: "2-digit", day: "2-digit", year: "numeric" });
  };

  const getDateRange = () => {
    if (searchedDates && searchedDates.from && searchedDates.to) {
      const fromDate = new Date(searchedDates.from);
      const toDate = new Date(searchedDates.to);
      return `${fromDate.toLocaleDateString("en-US", { month: "short", day: "2-digit", year: "numeric" }).toUpperCase()} – ${toDate.toLocaleDateString("en-US", { month: "short", day: "2-digit", year: "numeric" }).toUpperCase()}`;
    }
    if (items && items.length > 0) {
      const dates = items.map((item) => new Date(item.createdAt));
      const minDate = new Date(Math.min(...dates));
      const maxDate = new Date(Math.max(...dates));
      return `${minDate.toLocaleDateString("en-US", { month: "short", day: "2-digit", year: "numeric" }).toUpperCase()} – ${maxDate.toLocaleDateString("en-US", { month: "short", day: "2-digit", year: "numeric" }).toUpperCase()}`;
    }
    return new Date().toLocaleDateString("en-US", { month: "short", day: "2-digit", year: "numeric" }).toUpperCase();
  };

  const generateVerificationId = () => {
    const now = new Date();
    const month = now.toLocaleDateString("en-US", { month: "short" }).toUpperCase();
    const year = now.getFullYear();
    const companyAbbrev = (companyName || "MF").substring(0, 2).toUpperCase();
    return `${companyAbbrev}-${year}-${month}`;
  };

  // Use Helvetica for numbers/currency/dates so they render when Ethiopic font is used (am/ti)
  const dataFont = (f) => (f === "NotoSansEthiopic" ? "helvetica" : f);

  // Detect script in dynamic text (saved in DB) so we can pick the right font for PDF
  const hasEthiopic = (s) => /[\u1200-\u137F\u1380-\u1399\u2D80-\u2DDF\uAB00-\uAB2F]/.test(String(s));
  const hasArabic = (s) => /[\u0600-\u06FF\u0750-\u077F\u08A0-\u08FF]/.test(String(s));
  const fontForDynamicText = (cellText, scriptFonts, defaultFont) => {
    if (!scriptFonts) return defaultFont;
    if (scriptFonts.ethiopic && hasEthiopic(cellText)) return scriptFonts.ethiopic;
    if (scriptFonts.arabic && hasArabic(cellText)) return scriptFonts.arabic;
    return defaultFont;
  };

  // ── Shared: Company header banner ─────────────────────────────────────────
  const addHeader = (doc, pageWidth, fontName = "helvetica") => {
    doc.setFillColor(16, 25, 38);
    doc.rect(0, 0, pageWidth, 40, "F");
    doc.setTextColor(255, 255, 255);
    doc.setFontSize(20);
    const companyPart = String(companyName || "Company").trim();
    const titlePart = " - " + pt("financialExecutiveReport");
    if (fontName === "NotoSansEthiopic" && companyPart) {
      doc.setFont(dataFont(fontName), "bold");
      const w1 = doc.getTextWidth(companyPart);
      doc.setFont(fontName, "bold");
      const w2 = doc.getTextWidth(titlePart);
      const startX = (pageWidth - (w1 + w2)) / 2;
      doc.setFont(dataFont(fontName), "bold");
      doc.text(companyPart, startX, 20);
      doc.setFont(fontName, "bold");
      doc.text(titlePart, startX + w1, 20);
    } else {
      doc.setFont(fontName, "bold");
      doc.text(`${companyPart}${titlePart}`, pageWidth / 2, 20, { align: "center" });
    }
    doc.setFontSize(10);
    doc.setFont(dataFont(fontName), "normal");
    doc.setTextColor(200, 200, 200);
    doc.text(getDateRange(), pageWidth / 2, 32, { align: "center" });
  };

  // ── Shared: Footer ─────────────────────────────────────────────────────────
  const addFooter = (doc, pageWidth, pageHeight, pageNum, totalPages, isVerified = false, fontName = "helvetica") => {
    const footerY = pageHeight - 15;
    doc.setFillColor(245, 245, 245);
    doc.rect(0, footerY - 10, pageWidth, pageHeight - (footerY - 10), "F");
    doc.setTextColor(80, 80, 80);
    doc.setFontSize(7);
    doc.setFont(fontName, "bold");
    doc.text(pt("termsTitle"), 15, footerY - 5);
    doc.setFont(fontName, "normal");
    doc.setFontSize(6.5);
    doc.text(pt("termsText"), 15, footerY, { maxWidth: pageWidth - 30 });
    const footerLineY = pageHeight - 8;
    doc.setDrawColor(200, 200, 200);
    doc.setLineWidth(0.3);
    doc.line(15, footerLineY - 2, pageWidth - 15, footerLineY - 2);
    doc.setTextColor(100, 100, 100);
    doc.setFontSize(7);
    doc.setFont(isVerified ? dataFont(fontName) : fontName, "normal");
    doc.text(isVerified ? `Verification ID: ${generateVerificationId()}` : pt("financialReportingSystems"), 15, footerLineY);
    const footerCompany = String(companyName || "Company").trim();
    const footerConfidential = " | " + pt("confidential");
    if (fontName === "NotoSansEthiopic" && footerCompany) {
      doc.setFont(dataFont(fontName), "normal");
      const fw1 = doc.getTextWidth(footerCompany);
      doc.setFont(fontName, "normal");
      const fw2 = doc.getTextWidth(footerConfidential);
      const startFx = (pageWidth - (fw1 + fw2)) / 2;
      doc.setFont(dataFont(fontName), "normal");
      doc.text(footerCompany, startFx, footerLineY);
      doc.setFont(fontName, "normal");
      doc.text(footerConfidential, startFx + fw1, footerLineY);
    } else {
      doc.setFont(fontName, "normal");
      doc.text(`${footerCompany}${footerConfidential}`, pageWidth / 2, footerLineY, { align: "center" });
    }
    doc.setFont(dataFont(fontName), "normal");
    doc.text(`${pt("page")} ${pageNum} ${pt("of")} ${totalPages}`, pageWidth - 15, footerLineY, { align: "right" });
  };

  const addStatementSummary = (doc, pageWidth, yPos, totalCash, totalRevenue, totalExpenses, totalPayable, fontName = "helvetica") => {
    const leftColX = 20;
    const rightColX = pageWidth / 2 + 10;
    const labelWidth = (pageWidth / 2) - 25;

    // Blue header bar
    doc.setFillColor(43, 66, 125);
    doc.rect(15, yPos, pageWidth - 30, 8, "F");
    doc.setFillColor(66, 133, 244);
    doc.rect(15, yPos, 3, 8, "F");
    doc.setTextColor(255, 255, 255);
    doc.setFontSize(9);
    doc.setFont(fontName, "bold");
    doc.text(pt("statementSummary"), 23, yPos + 5.5);
    yPos += 13;

    // Row 1: Cash on Hand | Gross Revenue
    doc.setTextColor(130, 130, 130);
    doc.setFontSize(8.5);
    doc.setFont(fontName, "normal");
    doc.text(pt("totalCashOnHand"), leftColX, yPos);
    doc.setTextColor(65, 146, 111);
    doc.setFontSize(11);
    doc.setFont(dataFont(fontName), "bold");
    doc.text(`${formatCurrency(totalCash)}`, leftColX + labelWidth, yPos, { align: "right" });

    doc.setTextColor(130, 130, 130);
    doc.setFontSize(8.5);
    doc.setFont(fontName, "normal");
    doc.text(pt("grossRevenue"), rightColX, yPos);
    doc.setTextColor(43, 66, 125);
    doc.setFontSize(11);
    doc.setFont(dataFont(fontName), "bold");
    doc.text(`${formatCurrency(totalRevenue)}`, pageWidth - 20, yPos, { align: "right" });

    yPos += 10;

    // Row 2: Total Payable | Total Expense
    doc.setTextColor(130, 130, 130);
    doc.setFontSize(8.5);
    doc.setFont(fontName, "normal");
    doc.text(pt("totalPayableUnpaid"), leftColX, yPos);
    doc.setTextColor(167, 86, 93);
    doc.setFontSize(11);
    doc.setFont(dataFont(fontName), "bold");
    doc.text(`${formatCurrency(totalPayable)}`, leftColX + labelWidth, yPos, { align: "right" });

    doc.setTextColor(130, 130, 130);
    doc.setFontSize(8.5);
    doc.setFont(fontName, "normal");
    doc.text(pt("totalExpense"), rightColX, yPos);
    doc.setTextColor(167, 86, 93);
    doc.setFontSize(11);
    doc.setFont(dataFont(fontName), "bold");
    doc.text(`${formatCurrency(totalExpenses)}`, pageWidth - 20, yPos, { align: "right" });

    yPos += 20;
    return yPos; // ← caller must use this returned value
  };

  // ── Shared: 4 summary tiles (Dashboard only) ──────────────────────────────
  const addSummaryTiles = (doc, pageWidth, yPos, totalCash, totalRevenue, totalExpenses, totalPayable, fontName = "helvetica") => {
    const totalWidth = pageWidth - 30;
    const gap = 5;
    const boxWidth = (totalWidth - (3 * gap)) / 4;
    const boxHeight = 35;
    const startX = 15;

    const summaryData = [
      { label: pt("totalCashOnHand"),    value: totalCash,     color: [65, 146, 111] },
      { label: pt("grossRevenue"),       value: totalRevenue,  color: [43, 66, 125] },
      { label: pt("totalExpense"),       value: totalExpenses, color: [167, 86, 93] },
      { label: pt("totalPayableUnpaid"), value: totalPayable,  color: [199, 174, 79] },
    ];

    summaryData.forEach((item, index) => {
      const boxX = startX + index * (boxWidth + gap);
      doc.setFillColor(255, 255, 255);
      doc.roundedRect(boxX, yPos, boxWidth, boxHeight, 3, 3, "F");
      doc.setFillColor(...item.color);
      doc.rect(boxX, yPos + boxHeight - 2, boxWidth, 2, "F");
      doc.setDrawColor(240, 240, 240);
      doc.setLineWidth(0.2);
      doc.roundedRect(boxX, yPos, boxWidth, boxHeight, 3, 3, "S");
      doc.setTextColor(130, 130, 130);
      doc.setFontSize(7.5);
      doc.setFont(fontName, "bold");
      doc.text(item.label, boxX + boxWidth / 2, yPos + 13, { align: "center" });
      doc.setTextColor(40, 40, 40);
      doc.setFontSize(13);
      doc.setFont(dataFont(fontName), "bold");
      doc.text(`${formatCurrency(item.value)}`, boxX + boxWidth / 2, yPos + 24, { align: "center" });
    });

    return yPos + boxHeight;
  };

  // ── Shared: 2×2 chart grid ────────────────────────────────────────────────
  const addCharts = (doc, pageWidth, yPos, chartImages, fontName = "helvetica") => {
    const chartWidth = (pageWidth - 45) / 2;
    const chartHeight = 60;
    const chartGap = 10;
    const { cashFlowImg, revenueImg, payableImg, expensesImg } = chartImages;

    doc.setFont(fontName, "normal");
    // Row 1
    if (cashFlowImg) {
      doc.addImage(cashFlowImg, 'PNG', 15, yPos, chartWidth, chartHeight);
    } else {
      doc.setFillColor(245, 250, 245); doc.roundedRect(15, yPos, chartWidth, chartHeight, 2, 2, "F");
      doc.setTextColor(150, 180, 150); doc.setFontSize(10);
      doc.text(pt("cashFlowTrend"), 15 + chartWidth / 2, yPos + chartHeight / 2, { align: "center" });
    }
    if (revenueImg) {
      doc.addImage(revenueImg, 'PNG', 30 + chartWidth, yPos, chartWidth, chartHeight);
    } else {
      doc.setFillColor(245, 245, 250); doc.roundedRect(30 + chartWidth, yPos, chartWidth, chartHeight, 2, 2, "F");
      doc.setTextColor(150, 150, 180); doc.setFontSize(10);
      doc.text(pt("revenueGrowth"), 30 + chartWidth + chartWidth / 2, yPos + chartHeight / 2, { align: "center" });
    }

    yPos += chartHeight + chartGap;

    // Row 2
    if (payableImg) {
      doc.addImage(payableImg, 'PNG', 15, yPos, chartWidth, chartHeight);
    } else {
      doc.setFillColor(250, 245, 245); doc.roundedRect(15, yPos, chartWidth, chartHeight, 2, 2, "F");
      doc.setTextColor(180, 150, 150); doc.setFontSize(10);
      doc.text(pt("totalPayable"), 15 + chartWidth / 2, yPos + chartHeight / 2, { align: "center" });
    }
    if (expensesImg) {
      doc.addImage(expensesImg, 'PNG', 30 + chartWidth, yPos, chartWidth, chartHeight);
    } else {
      doc.setFillColor(250, 245, 245); doc.roundedRect(30 + chartWidth, yPos, chartWidth, chartHeight, 2, 2, "F");
      doc.setTextColor(180, 150, 150); doc.setFontSize(10);
      doc.text(pt("totalExpenses"), 30 + chartWidth + chartWidth / 2, yPos + chartHeight / 2, { align: "center" });
    }
  };

  // ── Shared: Balance Sheet table ────────────────────────────────────────────
  const addBalanceSheet = (doc, pageWidth, yPos, totalCash, totalInventory, totalPayable, fontName = "helvetica") => {
    const ownerEquity = totalCash - totalPayable;
    doc.setDrawColor(66, 133, 244); doc.setLineWidth(3);
    doc.line(15, yPos, 15, yPos + 8);
    doc.setTextColor(33, 33, 33); doc.setFontSize(10); doc.setFont(fontName, "bold");
    doc.text(pt("balanceSheetDetails"), 21, yPos + 6);
    yPos += 10;

    const balanceSheetData = [
      [pt("accountDetail"), pt("currentValue")],
      [pt("totalAssets"),        `${formatCurrency(totalCash + totalInventory)}`],
      [pt("currentLiabilities"), `(${formatCurrency(totalPayable)})`],
      [pt("totalOwnerEquity"),   `${formatCurrency(ownerEquity)}`],
    ];

    autoTable(doc, {
      startY: yPos,
      head: [balanceSheetData[0]],
      body: balanceSheetData.slice(1),
      theme: "plain",
      headStyles: { fillColor: [240,240,240], textColor: [60,60,60], fontStyle: "bold", fontSize: 9, font: fontName, lineColor: [220,220,220], lineWidth: 0.1 },
      styles: { fontSize: 9, font: fontName, cellPadding: 3.5, lineColor: [220,220,220], lineWidth: 0.1 },
      columnStyles: { 0: { cellWidth: (pageWidth - 30) * 0.6 }, 1: { cellWidth: (pageWidth - 30) * 0.4, halign: "right" } },
      margin: { left: 15, right: 15 },
      didParseCell: (data) => {
        if (data.section === "body" && fontName === "NotoSansEthiopic") {
          if (data.column.index === 1) data.cell.styles.font = "helvetica";
          if (data.column.index === 0) {
            const cellText = String(data.cell.text[0] || "");
            if (/^[\d\s\.,\$\(\)\-\/]+$/.test(cellText)) data.cell.styles.font = "helvetica";
          }
        }
        if (data.row.index === 2 && data.section === "body") { data.cell.styles.fontStyle = "bold"; data.cell.styles.fillColor = [245,245,245]; }
        if (data.row.index === 1 && data.section === "body" && data.column.index === 1) { data.cell.styles.textColor = [167,86,93]; }
      },
    });
    return doc.lastAutoTable.finalY + 15;
  };

  // ── Shared: Income Statement table ────────────────────────────────────────
  const addIncomeStatement = (doc, pageWidth, yPos, totalRevenue, totalExpenses, fontName = "helvetica", scriptFonts = null, pdfLanguage = null) => {
    const netIncome = totalRevenue - totalExpenses;
    doc.setDrawColor(66, 133, 244); doc.setLineWidth(3);
    doc.line(15, yPos, 15, yPos + 8);
    doc.setTextColor(33, 33, 33); doc.setFontSize(10); doc.setFont(fontName, "bold");
    doc.text(pt("incomeStatementSummary"), 21, yPos + 6);
    yPos += 10;

    const incomeStatementData = [[pt("category"), pt("amount")]];
    incomeStatementData.push([pt("revenue"), `${formatCurrency(totalRevenue)}`]);
    const purposeToPdf = (p) => (pdfLanguage ? translatePurposeToLanguage(p, pdfLanguage) : translatePurpose(p));
    if (report.revenues && Object.keys(report.revenues).length > 0) {
      Object.entries(report.revenues).forEach(([purpose, amount]) =>
        incomeStatementData.push([`    ${purposeToPdf(purpose)}`, `${formatCurrency(amount)}`])
      );
    } else {
      incomeStatementData.push([`    ${pt("freightRevenue")}`, `${formatCurrency(totalRevenue)}`]);
    }
    incomeStatementData.push([pt("expenses"), `(${formatCurrency(totalExpenses)})`]);
    if (report.expenses && Object.keys(report.expenses).length > 0) {
      Object.entries(report.expenses).forEach(([purpose, amount]) =>
        incomeStatementData.push([`    ${purposeToPdf(purpose)}`, `(${formatCurrency(amount)})`])
      );
    }
    incomeStatementData.push([pt("netIncome"), `${formatCurrency(netIncome)}`]);

    autoTable(doc, {
      startY: yPos,
      head: [incomeStatementData[0]],
      body: incomeStatementData.slice(1),
      theme: "plain",
      headStyles: { fillColor: [240,240,240], textColor: [60,60,60], fontStyle: "bold", fontSize: 9, font: fontName, lineColor: [220,220,220], lineWidth: 0.1 },
      styles: { fontSize: 9, font: fontName, cellPadding: 3, lineColor: [220,220,220], lineWidth: 0.1 },
      columnStyles: { 0: { cellWidth: (pageWidth - 30) * 0.6 }, 1: { cellWidth: (pageWidth - 30) * 0.4, halign: "right" } },
      margin: { left: 15, right: 15, bottom: 35 },
        pageBreak: 'auto',
        rowPageBreak: 'avoid',
        didDrawPage: (data) => {
          if (data.pageNumber > 1) {
            addHeader(doc, pageWidth, fontName);
          }
        },
      didParseCell: (data) => {
        if (data.section === "body" && fontName === "NotoSansEthiopic") {
          if (data.column.index === 1) data.cell.styles.font = "helvetica";
          if (data.column.index === 0) {
            const cellText = String(data.cell.text[0] || "");
            if (/^[\d\s\.,\$\(\)\-\/]+$/.test(cellText)) data.cell.styles.font = "helvetica";
          }
        }
        if (data.section === "body") {
          const cellText = String(data.cell.text[0] || "");
          if (cellText === pt("revenue") || cellText === pt("expenses")) { data.cell.styles.fontStyle = "bold"; data.cell.styles.textColor = [33,33,33]; }
          else if (cellText === pt("netIncome")) { data.cell.styles.fontStyle = "bold"; data.cell.styles.fillColor = [245,245,245]; data.cell.styles.textColor = [33,33,33]; }
          else if (cellText.startsWith("    ")) {
            data.cell.styles.textColor = [100,100,100];
            data.cell.styles.font = fontForDynamicText(cellText, scriptFonts, fontName);
            data.cell.styles.fontStyle = "normal";
          }
          if (data.row.index === incomeStatementData.length - 2 && data.column.index === 1) { data.cell.styles.textColor = [65,146,111]; }
        }
      },
    });
    return doc.lastAutoTable.finalY + 15;
  };

  // ── Shared: Journal Entries table ─────────────────────────────────────────
const addJournalEntries = (doc, pageWidth, pageHeight, yPos, fontName = "helvetica", scriptFonts = null, pdfLanguage = null) => {
  // ── If title would overlap footer, start fresh on a new page ──────────────
  if (yPos > pageHeight - 80) {
    doc.addPage();
    addHeader(doc, pageWidth, fontName);
    yPos = 50;
  }

  doc.setDrawColor(66, 133, 244); doc.setLineWidth(3);
  doc.line(15, yPos, 15, yPos + 8);
  doc.setTextColor(33, 33, 33); doc.setFontSize(10); doc.setFont(fontName, "bold");
  doc.text(pt("verifiedJournalEntries"), 21, yPos + 6);
  yPos += 10;

  const safeItems = Array.isArray(report.items) ? report.items : [];
  const filteredItems = safeItems
    .filter((item) => (item.transactionPurpose || item.purpose || "") !== "Initial Cash Balance")
    .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));

  const journalData = [[pt("date"), pt("description"), pt("debit"), pt("credit")]];
  filteredItems.forEach((item) => {
    const debit = item.transactionType === "Receive" ? `${formatCurrency(item.transactionAmount)}` : "-";
    const credit = item.transactionType !== "Receive" ? `${formatCurrency(item.transactionAmount)}` : "-";
    const purpose = String(item.transactionPurpose || item.purpose || item.description || "").trim();
    const description = purpose
      ? (pdfLanguage ? translatePurposeToLanguage(purpose, pdfLanguage) : translatePurpose(purpose))
      : (item.transactionType === "Receive" ? pt("incomeEntry") : pt("expenseEntry"));
    journalData.push([formatDate(item.createdAt), description, debit, credit]);
  });

  if (journalData.length > 1) {
    const startPage = doc.internal.getNumberOfPages();
    autoTable(doc, {
      startY: yPos,
      head: [journalData[0]],
      body: journalData.slice(1),
      theme: "plain",
      headStyles: { fillColor: [240,240,240], textColor: [60,60,60], fontStyle: "bold", fontSize: 8, font: fontName, lineColor: [220,220,220], lineWidth: 0.1 },
      styles: { fontSize: 8, font: fontName, cellPadding: 3, lineColor: [220,220,220], lineWidth: 0.1 },
      columnStyles: { 0: { cellWidth: 35 }, 1: { cellWidth: (pageWidth - 30) - 125 }, 2: { cellWidth: 45, halign: "right" }, 3: { cellWidth: 45, halign: "right" } },
      margin: { left: 15, right: 15, bottom: 35, top: 50 }, // ← top:50 keeps content below header on overflow pages
      pageBreak: 'auto',
      rowPageBreak: 'avoid',
      didDrawPage: (data) => {
        if (data.pageNumber > 1) {
          // Only draw header on overflow pages (page 1 already has it)
          addHeader(doc, pageWidth, fontName);
        }
      },
      didParseCell: (data) => {
        if (data.section === "body" && fontName === "NotoSansEthiopic") {
          if (data.column.index === 0 || data.column.index === 2 || data.column.index === 3) data.cell.styles.font = "helvetica";
        }
        if (data.section === "body" && data.column.index === 1) {
          const cellText = String(data.cell.text[0] || "");
          data.cell.styles.font = fontForDynamicText(cellText, scriptFonts, fontName);
        }
        if (data.section === "body") {
          if (data.column.index === 2 && data.cell.text[0] !== "-") { data.cell.styles.textColor = [65,146,111]; }
          if (data.column.index === 3 && data.cell.text[0] !== "-") { data.cell.styles.textColor = [199,174,79]; }
        }
      },
    });

    // ── Stamp footers AFTER knowing real total pages ────────────────────────
    const endPage = doc.internal.getNumberOfPages();
    for (let i = startPage; i <= endPage; i++) {
      doc.setPage(i);
      addFooter(doc, pageWidth, pageHeight, i, endPage, true, fontName);
    }
  }
};

  // ══════════════════════════════════════════════════════════════════════════
  // "Download Financial Report"
  // Page 1: header + statement summary + balance sheet + income statement
  // Page 2+: header + journal entries
  // ══════════════════════════════════════════════════════════════════════════
  const generateFinancialOnlyPages = (doc, pageWidth, pageHeight, chartImages, pdfFont = "helvetica", scriptFonts = null, pdfLanguage = null) => {
  const { totalCash, totalRevenue, totalExpenses, totalPayable, totalInventory } = report;

  addHeader(doc, pageWidth, pdfFont);
  let yPos = 50;
  yPos = addStatementSummary(doc, pageWidth, yPos, totalCash, totalRevenue, totalExpenses, totalPayable, pdfFont);
  yPos = addBalanceSheet(doc, pageWidth, yPos, totalCash, totalInventory, totalPayable, pdfFont);
  yPos = addIncomeStatement(doc, pageWidth, yPos, totalRevenue, totalExpenses, pdfFont, scriptFonts, pdfLanguage);

  // Optional: trend charts on their own page.
  if (includeCharts && chartImages) {
    doc.addPage();
    addHeader(doc, pageWidth, pdfFont);
    addCharts(doc, pageWidth, 50, chartImages, pdfFont);
  }
  // Pages drawn so far (statements, maybe charts) — these need footers stamped
  // below. The ledger goes on its OWN fresh page and stamps its own footers.
  const nonLedgerPages = doc.internal.getNumberOfPages();
  if (includeLedger) {
    doc.addPage();
    addHeader(doc, pageWidth, pdfFont);
    addJournalEntries(doc, pageWidth, pageHeight, 50, pdfFont, scriptFonts, pdfLanguage);
  }

  const totalPages = doc.internal.getNumberOfPages();
  for (let i = 1; i <= nonLedgerPages; i++) {
    doc.setPage(i);
    addFooter(doc, pageWidth, pageHeight, i, totalPages, false, pdfFont);
  }
};

  // ══════════════════════════════════════════════════════════════════════════
  // "Download Dashboard"
  // Page 1: header + 4 tiles + 2×2 charts + footer
  // ══════════════════════════════════════════════════════════════════════════
  const generateDashboardOnlyPage = async (doc, pageWidth, pageHeight, chartImages, pdfFont = "helvetica", scriptFonts = null, pdfLanguage = null) => {
    const { totalCash, totalRevenue, totalExpenses, totalPayable } = report;
    addHeader(doc, pageWidth, pdfFont);
    let yPos = 50;
    yPos = addSummaryTiles(doc, pageWidth, yPos, totalCash, totalRevenue, totalExpenses, totalPayable, pdfFont);
    yPos += 15;
    if (includeCharts && chartImages) {
      addCharts(doc, pageWidth, yPos, chartImages, pdfFont);
    }

    const nonLedgerPages = doc.internal.getNumberOfPages();
    if (includeLedger) {
      doc.addPage();
      addHeader(doc, pageWidth, pdfFont);
      addJournalEntries(doc, pageWidth, pageHeight, 50, pdfFont, scriptFonts, pdfLanguage);
    }
    const totalPages = doc.internal.getNumberOfPages();
    for (let i = 1; i <= nonLedgerPages; i++) {
      doc.setPage(i);
      addFooter(doc, pageWidth, pageHeight, i, totalPages, false, pdfFont);
    }
  };

  // ══════════════════════════════════════════════════════════════════════════
  // "Download Both"
  // Page 1: header + 4 tiles + charts        ← DASHBOARD
  // Page 2: header + statement summary + balance sheet + income statement
  // Page 3+: header + journal entries
  // ══════════════════════════════════════════════════════════════════════════
  const generateBothPages = async (doc, pageWidth, pageHeight, chartImages, pdfFont = "helvetica", scriptFonts = null, pdfLanguage = null) => {
    const { totalCash, totalRevenue, totalExpenses, totalPayable, totalInventory } = report;

    // ── Page 1: Overview — tiles (+ charts if requested) ────────────────────
    addHeader(doc, pageWidth, pdfFont);
    let dashYPos = 50;
    dashYPos = addSummaryTiles(doc, pageWidth, dashYPos, totalCash, totalRevenue, totalExpenses, totalPayable, pdfFont);
    dashYPos += 15;
    if (includeCharts && chartImages) {
      addCharts(doc, pageWidth, dashYPos, chartImages, pdfFont);
    }

    // ── Page 2: Financial statements ────────────────────────────────────────
    doc.addPage();
    addHeader(doc, pageWidth, pdfFont);
    let finYPos = 50;
    finYPos = addStatementSummary(doc, pageWidth, finYPos, totalCash, totalRevenue, totalExpenses, totalPayable, pdfFont);
    finYPos = addBalanceSheet(doc, pageWidth, finYPos, totalCash, totalInventory, totalPayable, pdfFont);
    finYPos = addIncomeStatement(doc, pageWidth, finYPos, totalRevenue, totalExpenses, pdfFont, scriptFonts, pdfLanguage);

    // ── Optional ledger on its own fresh page (stamps its own footers) ──────
    const nonLedgerPages = doc.internal.getNumberOfPages();
    if (includeLedger) {
      doc.addPage();
      addHeader(doc, pageWidth, pdfFont);
      addJournalEntries(doc, pageWidth, pageHeight, 50, pdfFont, scriptFonts, pdfLanguage);
    }

    const totalPages = doc.internal.getNumberOfPages();
    for (let i = 1; i <= nonLedgerPages; i++) {
      doc.setPage(i);
      addFooter(doc, pageWidth, pageHeight, i, totalPages, false, pdfFont);
    }
  };

  // Load Ethiopic (Amharic/Tigrinya) font for jsPDF. Requires NotoSansEthiopic-Regular.ttf in public/fonts/
  const loadEthiopicFont = async () => {
    try {
      const response = await fetch('/fonts/NotoSansEthiopic-Regular.ttf');
      if (!response.ok) return null;
      const buffer = await response.arrayBuffer();
      const bytes = new Uint8Array(buffer);
      let binary = '';
      for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i]);
      return btoa(binary);
    } catch (e) {
      console.warn('Ethiopic font load failed:', e);
      return null;
    }
  };

  // Load Arabic font for jsPDF. Requires Amiri-Regular.ttf in public/fonts/
  const loadArabicFont = async () => {
    try {
      const response = await fetch('/fonts/Amiri-Regular.ttf');
      if (!response.ok) return null;
      const buffer = await response.arrayBuffer();
      const bytes = new Uint8Array(buffer);
      let binary = '';
      for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i]);
      return btoa(binary);
    } catch (e) {
      console.warn('Arabic font load failed:', e);
      return null;
    }
  };
  // Capture a hidden HTML sheet into the PDF, slicing a tall sheet across as
  // many pages as needed (so a long ledger paginates). `first` tells it whether
  // the current doc page is still blank (reuse it) or a new page is needed.
  const addHtmlSheet = async (doc, elementId, pageWidth, pageHeight, first, paginate = false) => {
    const el = document.getElementById(elementId);
    if (!el) return first;
    const canvas = await html2canvas(el, { scale: 2, backgroundColor: "#ffffff", logging: false, useCORS: true });
    const pxPerMm = canvas.width / pageWidth;
    const imgHeightMm = canvas.height / pxPerMm;

    // Statement/overview/chart sheets are one-page designs. If one overflows a
    // page, scale it DOWN to fit rather than slicing it -- slicing cuts a chart
    // in half ("out of frame") and spills a sliver onto a near-blank page. Only
    // the ledger (a genuinely long table) paginates by slicing.
    if (!paginate || imgHeightMm <= pageHeight) {
      if (!first) doc.addPage();
      let drawW = pageWidth;
      let drawH = imgHeightMm;
      if (drawH > pageHeight) {
        drawW = pageWidth * (pageHeight / drawH);
        drawH = pageHeight;
      }
      const offsetX = (pageWidth - drawW) / 2; // center when scaled narrower
      doc.addImage(canvas.toDataURL("image/png"), "PNG", offsetX, 0, drawW, drawH);
      return false;
    }

    // Ledger: slice the tall table across as many pages as needed.
    const pageHpx = Math.floor(pageHeight * pxPerMm);
    let rendered = 0;
    let isFirst = first;
    while (rendered < canvas.height) {
      const sliceH = Math.min(pageHpx, canvas.height - rendered);
      const slice = document.createElement("canvas");
      slice.width = canvas.width;
      slice.height = sliceH;
      const ctx = slice.getContext("2d");
      ctx.fillStyle = "#ffffff";
      ctx.fillRect(0, 0, slice.width, slice.height);
      ctx.drawImage(canvas, 0, rendered, canvas.width, sliceH, 0, 0, canvas.width, sliceH);
      if (!isFirst) doc.addPage();
      isFirst = false;
      doc.addImage(slice.toDataURL("image/png"), "PNG", 0, 0, pageWidth, sliceH / pxPerMm);
      rendered += sliceH;
    }
    return false;
  };

  // Compose the whole report from HTML sheets so every page shares the same
  // professional look (no old jsPDF tiles/charts/tables).
  const composeReport = async (doc, pageWidth, pageHeight) => {
    const wantStatements = reportType === "statements" || reportType === "complete";
    const wantOverview = reportType === "overview" || reportType === "complete";
    let first = true;
    const sheet = async (id) => { first = await addHtmlSheet(doc, id, pageWidth, pageHeight, first, id === "ledgerSheet"); };

    if (wantStatements) { await sheet("pnlSheet"); await sheet("bsSheet"); }
    if (wantOverview) await sheet("glanceSheet");
    if (includeCharts) await sheet("chartsSheet");
    if (includeLedger) await sheet("ledgerSheet");
  };

  // ══════════════════════════════════════════════════════════════════════════
  // Main PDF generator
  // ══════════════════════════════════════════════════════════════════════════
 const generatePDF = async () => {
  setIsGenerating(true);
  try {
    // The whole PDF is now rendered from HTML sheets (the browser handles fonts,
    // including Amharic/Arabic/Tigrinya), so no jsPDF font embedding is needed.
    // Give any charts a moment to finish painting before capture.
    if (includeCharts) {
      await new Promise((resolve) => setTimeout(resolve, 1200));
    }

    const doc = new jsPDF({ orientation: "portrait", unit: "mm", format: "letter" });
    const pageWidth = doc.internal.pageSize.getWidth();
    const pageHeight = doc.internal.pageSize.getHeight();

    await composeReport(doc, pageWidth, pageHeight);

    const dateStr = new Date().toISOString().split("T")[0];
    const filename = `${(companyName || "Financial").replace(/\s+/g, "_")}_Report_${dateStr}.pdf`;
    doc.save(filename);
    toggle();
  } catch (error) {
    console.error("PDF generation error:", error);
    alert("Error generating PDF. Please try again.");
  } finally {
    setIsGenerating(false);
  }
};

  return (
    <Modal isOpen={isOpen} toggle={toggle} centered>
      <ModalHeader toggle={toggle} style={{ backgroundColor: "transparent", color: "var(--text-1)", borderBottom: "1px solid var(--border)" }}>
     {dt("title")}
      </ModalHeader>
      <ModalBody style={{ backgroundColor: "transparent", padding: "24px" }}>
        {/* ── Hidden professional statement sheets (captured to the PDF) ───────── */}
        {(() => {
          const s = statements;
          const n2 = (v) => (Math.abs(Number(v) || 0)).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
          const money = (v) => formatCurrency(Math.abs(v));
          const neg = (v) => `(${n2(v)})`;
          const pr = periodRange();
          const dLong = (d) => new Date(d).toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric" });
          const endDate = pr && pr.to ? dLong(pr.to) : dLong(new Date());
          const startDate = pr && pr.from ? dLong(pr.from) : null;
          const preparedOn = dLong(new Date());
          const entity = (companyName && String(companyName).trim()) || "Your Business";
          const periodText = startDate ? `${startDate} – ${endDate}` : `Up to ${endDate}`;

          // ── Clean-corporate (Stripe / Mercury) palette ──────────────────────
          const SANS = "'Segoe UI','Helvetica Neue',Helvetica,Arial,system-ui,sans-serif";
          const INK = "#111418", BODY = "#3b424c", MUTE = "#6b7280", FAINT = "#9aa1ab";
          const HAIR = "#ebedf0", HAIRS = "#d7dbe0", ACCENT = "#1f3a5f", SOFT = "#f4f7fb", POS = "#15803d";
          const C = ["#1f3a5f", "#2f7d7b", "#c08a2d", "#a85d4a", "#7a8796"];

          // ── Which sheet is last → carries the Notes & responsibility block ──
          const wantStatements = reportType === "statements" || reportType === "complete";
          const wantOverview = reportType === "overview" || reportType === "complete";
          const lastSheet = includeLedger ? "ledgerSheet" : includeCharts ? "chartsSheet" : wantOverview ? "glanceSheet" : wantStatements ? "bsSheet" : "glanceSheet";

          // ── Top-expenses donut slices (top 5, rest grouped as "Other") ──────
          let expEntries = Object.entries(report.expenses || {}).map(([p, a]) => [translatePurpose(p) || p, Math.abs(a)]).filter(([, a]) => a > 0.005);
          if (s.depreciation > 0.005) expEntries.push(["Depreciation", s.depreciation]);
          expEntries.sort((a, b) => b[1] - a[1]);
          let slices = expEntries;
          if (expEntries.length > 5) {
            const other = expEntries.slice(4).reduce((t, [, a]) => t + a, 0);
            slices = [...expEntries.slice(0, 4), ["Other", other]];
          }
          const expTotal = slices.reduce((t, [, a]) => t + a, 0);
          const hasDonut = slices.length >= 2;

          // ── Cash trend endpoint value + growth for the hero chart ───────────
          const cData = (cashOnHandOptions && cashOnHandOptions.series && cashOnHandOptions.series[0] && cashOnHandOptions.series[0].data) || [];
          const cCats = (cashOnHandOptions && cashOnHandOptions.xaxis && cashOnHandOptions.xaxis.categories) || [];
          const cFirst = cData.find((v) => Math.abs(v) > 0.005);
          const cLast = cData.length ? cData[cData.length - 1] : 0;
          const cDelta = cFirst && Math.abs(cFirst) > 0.005 ? ((cLast - cFirst) / Math.abs(cFirst)) * 100 : null;

          // ── Style objects ───────────────────────────────────────────────────
          const sheet = { width: "720px", background: "#ffffff", color: INK, padding: "44px 50px 38px", fontFamily: SANS, boxSizing: "border-box", marginBottom: "40px", fontVariantNumeric: "tabular-nums" };
          const tdc = { padding: "7px 0", fontSize: "13px", verticalAlign: "baseline" };
          const numTd = { ...tdc, textAlign: "right", width: "28%", whiteSpace: "nowrap" };
          const grp = { ...tdc, fontWeight: 600, paddingTop: "14px", color: INK };
          const item = { ...tdc, paddingLeft: "20px", color: BODY };
          const itemNum = { ...numTd, color: BODY };
          const sub = { ...tdc, fontWeight: 600, borderTop: `1px solid ${HAIR}`, paddingTop: "8px" };
          const subNum = { ...numTd, fontWeight: 600, borderTop: `1px solid ${HAIR}`, paddingTop: "8px" };
          const tot = { ...tdc, fontWeight: 700, fontSize: "14px", borderTop: `1.5px solid ${INK}`, paddingTop: "9px" };
          const totNum = { ...numTd, fontWeight: 700, fontSize: "14px", borderTop: `1.5px solid ${INK}`, paddingTop: "9px" };
          const totBand = { ...tot, background: SOFT, paddingLeft: "12px", borderTopLeftRadius: "4px" };
          const totBandNum = { ...totNum, background: SOFT, paddingRight: "12px", borderTopRightRadius: "4px" };
          const cardStyle = { border: `1px solid ${HAIR}`, borderRadius: "8px", padding: "14px 16px 10px", marginTop: "14px" };
          const cardHead = { display: "flex", justifyContent: "space-between", alignItems: "baseline", gap: "12px", marginBottom: "8px" };
          const cardTitle = { fontSize: "10px", letterSpacing: "0.08em", textTransform: "uppercase", color: MUTE, fontWeight: 700 };
          const cardVal = { fontSize: "19px", fontWeight: 600, letterSpacing: "-0.01em", color: INK, whiteSpace: "nowrap" };

          // ── Chart option builders (clean light restyle of the dashboard data) ─
          const heroOpts = (opt) => ({
            ...opt, title: { text: "" }, colors: [ACCENT], fill: { type: "solid", opacity: 0.1 },
            stroke: { curve: "smooth", width: 2 }, dataLabels: { enabled: false },
            chart: { ...(opt.chart || {}), type: "area", toolbar: { show: false }, zoom: { enabled: false }, animations: { enabled: false }, background: "transparent" },
            grid: { show: true, borderColor: HAIR, xaxis: { lines: { show: false } } },
            xaxis: { ...(opt.xaxis || {}), labels: { show: true, style: { colors: MUTE, fontSize: "9px" } }, axisBorder: { show: false }, axisTicks: { show: false }, tooltip: { enabled: false } },
            yaxis: { labels: { show: true, style: { colors: FAINT, fontSize: "9px" }, formatter: (v) => formatCurrency(v) } },
            markers: { size: 0 }, legend: { show: false }, tooltip: { enabled: false },
            annotations: cData.length && cCats.length ? { points: [{ x: cCats[cCats.length - 1], y: cLast, marker: { size: 4, fillColor: ACCENT, strokeColor: "#ffffff", strokeWidth: 2 }, label: { borderColor: ACCENT, offsetY: 0, style: { background: ACCENT, color: "#ffffff", fontSize: "10px", fontWeight: 700, padding: { left: 7, right: 7, top: 3, bottom: 3 } }, text: formatCurrency(cLast) } }] } : {},
          });
          const tileOpts = (opt, color) => ({
            ...opt, title: { text: "" }, colors: [color], fill: { type: "solid", opacity: 0.1 },
            stroke: { curve: "smooth", width: 2 }, dataLabels: { enabled: false },
            chart: { ...(opt.chart || {}), type: "area", toolbar: { show: false }, zoom: { enabled: false }, animations: { enabled: false }, sparkline: { enabled: true } },
            grid: { show: false }, markers: { size: 0 }, legend: { show: false }, tooltip: { enabled: false },
            xaxis: { ...(opt.xaxis || {}), labels: { show: false }, axisBorder: { show: false }, axisTicks: { show: false } },
            yaxis: { labels: { show: false } },
          });
          const donutOpts = {
            chart: { type: "donut", animations: { enabled: false }, toolbar: { show: false }, background: "transparent" },
            labels: slices.map((x) => x[0]), colors: C, legend: { show: false }, dataLabels: { enabled: false },
            stroke: { width: 1, colors: ["#ffffff"] }, tooltip: { enabled: false },
            plotOptions: { pie: { donut: { size: "70%", labels: { show: true, name: { show: false }, value: { show: true, fontSize: "17px", fontWeight: 700, color: INK, offsetY: 6, formatter: (v) => formatCurrency(v) }, total: { show: true, showAlways: true, label: "TOTAL", fontSize: "10px", color: MUTE, formatter: () => formatCurrency(expTotal) } } } } },
          };

          // ── Shared components ────────────────────────────────────────────────
          const Head = ({ statement, metaLabel, metaValue }) => (
            <div>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", paddingBottom: "17px", borderBottom: `1px solid ${HAIRS}` }}>
                <div>
                  <div style={{ fontSize: "22px", fontWeight: 600, letterSpacing: "-0.01em", lineHeight: 1.15 }}>{entity}</div>
                  <div style={{ fontSize: "10px", letterSpacing: "0.16em", textTransform: "uppercase", color: MUTE, marginTop: "7px", fontWeight: 600 }}>Financial Statements</div>
                </div>
                <div style={{ textAlign: "right" }}>
                  <div style={{ fontSize: "13px", letterSpacing: "0.26em", textTransform: "uppercase", fontWeight: 700, color: ACCENT }}>Meksova</div>
                  <div style={{ fontSize: "9.5px", letterSpacing: "0.1em", textTransform: "uppercase", color: FAINT, marginTop: "5px", fontWeight: 600 }}>Prepared {preparedOn}</div>
                </div>
              </div>
              <div style={{ display: "flex", flexWrap: "wrap", gap: "14px 32px", margin: "17px 0 2px" }}>
                {[["Statement", statement], [metaLabel, metaValue], ["Currency", getCurrencyCode()], ["Basis", "Accrual"]].map(([k, v]) => (
                  <div key={k}>
                    <div style={{ fontSize: "9px", letterSpacing: "0.09em", textTransform: "uppercase", color: FAINT, fontWeight: 700 }}>{k}</div>
                    <div style={{ fontSize: "12px", color: INK, fontWeight: 500, marginTop: "2px" }}>{v}</div>
                  </div>
                ))}
              </div>
            </div>
          );
          const Kpis = ({ items }) => (
            <div style={{ display: "grid", gridTemplateColumns: "repeat(3,1fr)", gap: "1px", background: HAIRS, border: `1px solid ${HAIRS}`, borderRadius: "6px", overflow: "hidden", margin: "24px 0 6px" }}>
              {items.map(([l, v]) => (
                <div key={l} style={{ background: SOFT, padding: "14px 18px" }}>
                  <div style={{ fontSize: "9.5px", letterSpacing: "0.09em", textTransform: "uppercase", color: ACCENT, fontWeight: 700 }}>{l}</div>
                  <div style={{ fontSize: "21px", fontWeight: 600, letterSpacing: "-0.01em", marginTop: "6px", color: INK }}>{v}</div>
                </div>
              ))}
            </div>
          );
          const Sec = ({ children }) => (
            <div style={{ fontSize: "15px", fontWeight: 600, margin: "28px 0 6px", paddingLeft: "11px", borderLeft: `3px solid ${ACCENT}`, letterSpacing: "-0.005em" }}>{children}</div>
          );
          const Foot = ({ id }) => (
            <>
              {id === lastSheet && (
                <div style={{ marginTop: "24px", padding: "14px 16px", border: `1px solid ${HAIRS}`, borderLeft: `3px solid ${ACCENT}`, borderRadius: "6px", background: SOFT }}>
                  <div style={{ fontSize: "10px", letterSpacing: "0.12em", textTransform: "uppercase", color: ACCENT, fontWeight: 700, marginBottom: "7px" }}>Notes &amp; responsibility</div>
                  <div style={{ fontSize: "11px", lineHeight: 1.65, color: BODY }}>These statements are prepared on an accrual basis from records entered by the business in Meksova, and are unaudited. The user is solely responsible for the accuracy and completeness of the information entered. Meksova is not responsible for inaccuracies in user-provided data. These statements are not a substitute for a tax return or an independent audit.</div>
                </div>
              )}
              <div style={{ marginTop: "24px", paddingTop: "12px", borderTop: `1px solid ${HAIR}`, fontSize: "10px", color: MUTE, display: "flex", justifyContent: "space-between", gap: "20px" }}>
                <span>Unaudited · {entity} · Confidential</span>
                <span style={{ color: FAINT }}>Prepared with Meksova</span>
              </div>
            </>
          );

          return (
            <div style={{ position: "absolute", left: "-10000px", top: 0 }} aria-hidden="true">
              {/* ===== Profit & Loss ===== */}
              <div id="pnlSheet" style={sheet}>
                <Head statement="Profit & Loss" metaLabel="Period" metaValue={periodText} />
                <Kpis items={[
                  ["Total revenue", money(s.totalRevenue)],
                  ["Net income", s.netIncome < 0 ? `(${money(s.netIncome)})` : money(s.netIncome)],
                  ["Net margin", s.totalRevenue > 0.005 ? `${((100 * s.netIncome) / s.totalRevenue).toFixed(1)}%` : "—"],
                ]} />
                <Sec>Statement of Profit &amp; Loss</Sec>
                <table style={{ width: "100%", borderCollapse: "collapse" }}>
                  <tbody>
                    <tr><td style={grp}>Revenue</td><td style={numTd}></td></tr>
                    {s.revLines.length ? s.revLines.map(([p, a]) => (
                      <tr key={"r" + p}><td style={item}>{translatePurpose(p) || "Income"}</td><td style={itemNum}>{n2(a)}</td></tr>
                    )) : <tr><td style={item}>Sales &amp; services</td><td style={itemNum}>{n2(s.totalRevenue)}</td></tr>}
                    <tr><td style={sub}>Total revenue</td><td style={subNum}>{n2(s.totalRevenue)}</td></tr>
                    {s.cogs > 0.005 && <tr><td style={item}>Cost of goods sold</td><td style={itemNum}>{neg(s.cogs)}</td></tr>}
                    <tr><td style={sub}>Gross profit</td><td style={subNum}>{n2(s.grossProfit)}</td></tr>
                    <tr><td style={grp}>Operating expenses</td><td style={numTd}></td></tr>
                    {s.expLines.map(([p, a]) => (
                      <tr key={"e" + p}><td style={item}>{translatePurpose(p) || "Expense"}</td><td style={itemNum}>{neg(a)}</td></tr>
                    ))}
                    {s.depreciation > 0.005 && <tr><td style={item}>Depreciation</td><td style={itemNum}>{neg(s.depreciation)}</td></tr>}
                    {s.otherExpense > 0.005 && <tr><td style={item}>Other expense</td><td style={itemNum}>{neg(s.otherExpense)}</td></tr>}
                    <tr><td style={sub}>Total operating expenses</td><td style={subNum}>{neg(s.operatingExpenses + s.depreciation + s.otherExpense)}</td></tr>
                    <tr><td style={totBand}>Net income</td><td style={{ ...totBandNum, color: s.netIncome < 0 ? BODY : POS }}>{s.netIncome < 0 ? `(${money(s.netIncome)})` : money(s.netIncome)}</td></tr>
                  </tbody>
                </table>
                <Foot id="pnlSheet" />
              </div>

              {/* ===== Balance Sheet ===== */}
              <div id="bsSheet" style={sheet}>
                <Head statement="Balance Sheet" metaLabel="As at" metaValue={endDate} />
                <Kpis items={[
                  ["Total assets", money(s.totalAssets)],
                  ["Liabilities", money(s.payable)],
                  ["Owner's equity", money(s.totalEquity)],
                ]} />
                <Sec>Balance Sheet</Sec>
                <table style={{ width: "100%", borderCollapse: "collapse" }}>
                  <tbody>
                    <tr><td style={grp}>Assets</td><td style={numTd}></td></tr>
                    <tr><td style={item}>Cash on hand</td><td style={itemNum}>{n2(s.cash)}</td></tr>
                    <tr><td style={item}>Inventory</td><td style={itemNum}>{n2(s.inventory)}</td></tr>
                    <tr><td style={sub}>Total current assets</td><td style={subNum}>{n2(s.totalCurrentAssets)}</td></tr>
                    {s.fixedAtCost > 0.005 && <>
                      <tr><td style={item}>Equipment &amp; vehicles, at cost</td><td style={itemNum}>{n2(s.fixedAtCost)}</td></tr>
                      <tr><td style={item}>Less: accumulated depreciation</td><td style={itemNum}>{neg(s.accumDep)}</td></tr>
                      <tr><td style={sub}>Net fixed assets</td><td style={subNum}>{n2(s.netFixed)}</td></tr>
                    </>}
                    <tr><td style={tot}>Total assets</td><td style={totNum}>{money(s.totalAssets)}</td></tr>
                    <tr><td style={{ height: "10px" }}></td><td></td></tr>
                    <tr><td style={grp}>Liabilities</td><td style={numTd}></td></tr>
                    <tr><td style={item}>Accounts payable</td><td style={itemNum}>{n2(s.payable)}</td></tr>
                    <tr><td style={sub}>Total liabilities</td><td style={subNum}>{n2(s.payable)}</td></tr>
                    <tr><td style={grp}>Equity</td><td style={numTd}></td></tr>
                    <tr><td style={item}>Owner's capital — opening</td><td style={itemNum}>{n2(s.openingEquity)}</td></tr>
                    <tr><td style={item}>Retained earnings (net income)</td><td style={itemNum}>{s.retained < 0 ? neg(s.retained) : n2(s.retained)}</td></tr>
                    <tr><td style={sub}>Total equity</td><td style={subNum}>{n2(s.totalEquity)}</td></tr>
                    <tr><td style={totBand}>Total liabilities &amp; equity</td><td style={totBandNum}>{money(s.totalLE)}</td></tr>
                  </tbody>
                </table>
                <div style={{ display: "inline-flex", alignItems: "center", gap: "7px", marginTop: "14px", fontSize: "11px", fontWeight: 600, color: s.balanced ? ACCENT : "#8f3a3a", background: s.balanced ? SOFT : "#fbeeee", border: `1px solid ${s.balanced ? "#dbe4f0" : "#f0d4d4"}`, padding: "7px 12px", borderRadius: "6px" }}>
                  <span style={{ width: "7px", height: "7px", borderRadius: "50%", background: s.balanced ? POS : "#8f3a3a", display: "inline-block" }}></span>
                  {s.balanced ? `Balanced — assets equal liabilities plus equity: ${money(s.totalAssets)} = ${money(s.totalLE)}` : `Assets ${money(s.totalAssets)} vs liabilities + equity ${money(s.totalLE)} (period-scoped balance sheet).`}
                </div>
                <Foot id="bsSheet" />
              </div>

              {/* ===== Performance Overview (at a glance) ===== */}
              <div id="glanceSheet" style={sheet}>
                <Head statement="Performance Overview" metaLabel="Period" metaValue={periodText} />
                <Sec>At a glance</Sec>
                <table style={{ width: "100%", borderCollapse: "collapse" }}>
                  <tbody>
                    {[
                      ["Total revenue", money(s.totalRevenue), false],
                      ["Cost of goods sold", s.cogs > 0.005 ? neg(s.cogs) : n2(0), false],
                      ["Gross profit", n2(s.grossProfit), false],
                      ["Operating expenses", neg(s.operatingExpenses + s.depreciation + s.otherExpense), false],
                      ["Net income", s.netIncome < 0 ? `(${money(s.netIncome)})` : money(s.netIncome), true],
                      ["Net margin", s.totalRevenue > 0.005 ? `${((100 * s.netIncome) / s.totalRevenue).toFixed(1)}%` : "—", false],
                      ["Cash on hand", money(s.cash), false],
                      ["Total payable (unpaid)", money(s.payable), false],
                    ].map(([k, v, key]) => (
                      <tr key={k} style={{ borderBottom: `1px solid ${HAIR}` }}>
                        <td style={{ padding: "9px 0", fontSize: "13px", color: BODY, fontWeight: key ? 700 : 400 }}>{k}</td>
                        <td style={{ padding: "9px 0", fontSize: "13px", textAlign: "right", fontWeight: key ? 700 : 500, color: key && s.netIncome >= 0 ? POS : INK }}>{v}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                <Foot id="glanceSheet" />
              </div>

              {/* ===== Trends (dashboard-style charts) ===== */}
              <div id="chartsSheet" style={sheet}>
                <Head statement="Trends" metaLabel="Period" metaValue={periodText} />
                <Sec>Trends</Sec>

                <div style={cardStyle}>
                  <div style={cardHead}>
                    <div style={cardTitle}>Cash on hand</div>
                    <div style={cardVal}>
                      {money(report.totalCash)}
                      {cDelta != null && <span style={{ fontSize: "11px", fontWeight: 600, marginLeft: "7px", color: cDelta >= 0 ? POS : "#a85d4a" }}>{cDelta >= 0 ? "▲" : "▼"} {Math.abs(cDelta).toFixed(0)}%</span>}
                    </div>
                  </div>
                  {cashOnHandOptions ? <ReactApexChart options={heroOpts(cashOnHandOptions)} series={cashOnHandOptions.series} type="area" height={180} width={618} /> : <div style={{ height: 180 }} />}
                </div>

                {hasDonut && (
                  <div style={cardStyle}>
                    <div style={cardTitle}>Top expenses</div>
                    <div style={{ display: "flex", gap: "18px", alignItems: "center", flexWrap: "wrap", marginTop: "6px" }}>
                      <ReactApexChart options={donutOpts} series={slices.map((x) => x[1])} type="donut" width={210} height={210} />
                      <div style={{ flex: 1, minWidth: "230px" }}>
                        {slices.map(([name, amt], i) => (
                          <div key={name} style={{ display: "flex", alignItems: "center", gap: "9px", padding: "5px 0", fontSize: "12px", borderBottom: `1px solid ${HAIR}` }}>
                            <span style={{ width: "10px", height: "10px", borderRadius: "2px", flex: "none", background: C[i % C.length] }}></span>
                            <span style={{ flex: 1, color: BODY }}>{name}</span>
                            <span style={{ fontWeight: 600, color: INK }}>{money(amt)}</span>
                            <span style={{ color: FAINT, width: "46px", textAlign: "right" }}>{expTotal > 0 ? Math.round((100 * amt) / expTotal) : 0}%</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>
                )}

                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "14px", marginTop: "14px" }}>
                  <div style={{ ...cardStyle, marginTop: 0 }}>
                    <div style={cardHead}><div style={cardTitle}>Revenue</div><div style={{ ...cardVal, fontSize: "15px" }}>{money(report.totalRevenue)}</div></div>
                    {revenueOptions ? <ReactApexChart options={tileOpts(revenueOptions, "#2f7d7b")} series={revenueOptions.series} type="area" height={120} width={267} /> : <div style={{ height: 120 }} />}
                  </div>
                  <div style={{ ...cardStyle, marginTop: 0 }}>
                    <div style={cardHead}><div style={cardTitle}>Total payable</div><div style={{ ...cardVal, fontSize: "15px" }}>{money(report.totalPayable)}</div></div>
                    {payableOptions ? <ReactApexChart options={tileOpts(payableOptions, "#a85d4a")} series={payableOptions.series} type="area" height={120} width={267} /> : <div style={{ height: 120 }} />}
                  </div>
                </div>

                <Foot id="chartsSheet" />
              </div>

              {/* ===== Transaction Ledger ===== */}
              <div id="ledgerSheet" style={sheet}>
                <Head statement="Transaction Ledger" metaLabel="Period" metaValue={periodText} />
                <Sec>Transaction Ledger</Sec>
                <table style={{ width: "100%", borderCollapse: "collapse" }}>
                  <thead>
                    <tr>
                      {["Date", "Description", "Debit", "Credit"].map((h, i) => (
                        <th key={h} style={{ fontSize: "9px", letterSpacing: "0.07em", textTransform: "uppercase", color: FAINT, fontWeight: 700, textAlign: i >= 2 ? "right" : "left", padding: "0 0 8px", borderBottom: `1px solid ${HAIRS}` }}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {(Array.isArray(report.items) ? report.items : [])
                      .filter((t) => (t.transactionPurpose || t.purpose || "") !== "Initial Cash Balance")
                      .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt))
                      .map((t, i) => {
                        const amt = n2(parseFloat(t.transactionAmount) || 0);
                        const isRec = t.transactionType === "Receive";
                        const desc = translatePurpose(t.transactionPurpose || t.purpose || "") || (isRec ? "Income" : "Expense");
                        return (
                          <tr key={i} style={{ borderBottom: `1px solid ${HAIR}` }}>
                            <td style={{ padding: "6px 0", fontSize: "11px", color: MUTE, whiteSpace: "nowrap", verticalAlign: "top" }}>{formatDate(t.createdAt)}</td>
                            <td style={{ padding: "6px 10px 6px 0", fontSize: "12px", color: BODY }}>{desc}</td>
                            <td style={{ padding: "6px 0", fontSize: "12px", textAlign: "right", color: INK }}>{isRec ? amt : "–"}</td>
                            <td style={{ padding: "6px 0", fontSize: "12px", textAlign: "right", color: INK }}>{!isRec ? amt : "–"}</td>
                          </tr>
                        );
                      })}
                  </tbody>
                </table>
                <Foot id="ledgerSheet" />
              </div>
            </div>
          );
        })()}

        {(() => {
          const sectionLabel = { color: "var(--text-3)", fontSize: "11px", fontWeight: 700, letterSpacing: "0.06em", textTransform: "uppercase", margin: "0 0 8px" };
          const chip = (active) => ({ padding: "7px 12px", borderRadius: "999px", border: `1px solid ${active ? "var(--accent-solid)" : "var(--border)"}`, background: active ? "rgba(59,130,246,0.14)" : "var(--surface-3)", color: "var(--text-1)", fontSize: "12.5px", cursor: "pointer", fontWeight: active ? 700 : 500 });
          const typeCard = (active) => ({ textAlign: "left", padding: "12px 14px", borderRadius: "10px", border: `1px solid ${active ? "var(--accent-solid)" : "var(--border)"}`, background: active ? "rgba(59,130,246,0.10)" : "var(--surface-3)", color: "var(--text-1)", cursor: "pointer", width: "100%" });
          const PERIODS = [
            ["current", dt("periodCurrent")], ["month", dt("periodThisMonth")],
            ["last-month", dt("periodLastMonth")], ["quarter", dt("periodQuarter")],
            ["ytd", dt("periodYtd")], ["custom", dt("periodCustom")],
          ];
          const TYPES = [
            ["statements", dt("typeStatements"), dt("typeStatementsDesc")],
            ["overview", dt("typeOverview"), dt("typeOverviewDesc")],
            ["complete", dt("typeComplete"), dt("typeCompleteDesc")],
          ];
          return (
            <div style={{ display: "flex", flexDirection: "column", gap: "18px" }}>
              <div>
                <p style={sectionLabel}>{dt("reportPeriod")}</p>
                <div style={{ display: "flex", flexWrap: "wrap", gap: "7px" }}>
                  {PERIODS.map(([k, label]) => (
                    <button key={k} type="button" style={chip(period === k)} onClick={() => setPeriod(k)}>{label}</button>
                  ))}
                </div>
                {period === "custom" && (
                  <div style={{ display: "flex", gap: "10px", marginTop: "10px", flexWrap: "wrap" }}>
                    <label style={{ fontSize: "12px", color: "var(--text-2)", display: "flex", flexDirection: "column", gap: "4px", flex: 1, minWidth: "130px" }}>
                      {dt("from")}
                      <input type="date" value={fromDate} max={toDate || undefined} onChange={(e) => setFromDate(e.target.value)}
                        style={{ background: "var(--surface-3)", color: "var(--text-1)", border: "1px solid var(--border)", borderRadius: "6px", padding: "7px 9px" }} />
                    </label>
                    <label style={{ fontSize: "12px", color: "var(--text-2)", display: "flex", flexDirection: "column", gap: "4px", flex: 1, minWidth: "130px" }}>
                      {dt("to")}
                      <input type="date" value={toDate} min={fromDate || undefined} onChange={(e) => setToDate(e.target.value)}
                        style={{ background: "var(--surface-3)", color: "var(--text-1)", border: "1px solid var(--border)", borderRadius: "6px", padding: "7px 9px" }} />
                    </label>
                  </div>
                )}
              </div>

              <div>
                <p style={sectionLabel}>{dt("reportTypeLabel")}</p>
                <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
                  {TYPES.map(([k, title, desc]) => (
                    <button key={k} type="button" style={typeCard(reportType === k)} onClick={() => setReportType(k)}>
                      <div style={{ fontWeight: 700, fontSize: "13.5px" }}>{title}</div>
                      <div style={{ fontSize: "12px", color: "var(--text-2)", marginTop: "2px" }}>{desc}</div>
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <p style={sectionLabel}>{dt("includeLabel")}</p>
                <label style={{ display: "flex", gap: "9px", alignItems: "center", color: "var(--text-1)", fontSize: "13px", cursor: "pointer", marginBottom: "6px" }}>
                  <input type="checkbox" checked={includeCharts} onChange={(e) => setIncludeCharts(e.target.checked)} />
                  {dt("includeCharts")}
                </label>
                <label style={{ display: "flex", gap: "9px", alignItems: "center", color: "var(--text-1)", fontSize: "13px", cursor: "pointer" }}>
                  <input type="checkbox" checked={includeLedger} onChange={(e) => setIncludeLedger(e.target.checked)} />
                  {dt("includeLedger")}
                </label>
              </div>

              <Button onClick={() => generatePDF()} disabled={isGenerating || (period === "custom" && (!fromDate || !toDate))}
                style={{ backgroundColor: "var(--accent-solid)", borderColor: "var(--accent-solid)", color: "var(--accent-ink, #fff)", padding: "13px 20px", fontSize: "14px", fontWeight: 700, borderRadius: "var(--r-md)" }}>
                {isGenerating ? <Spinner size="sm" /> : dt("generateReport")}
              </Button>
              <p style={{ color: "var(--text-3)", fontSize: "12px", textAlign: "center", margin: 0 }}>
                {dt("pdfNote")}
              </p>
            </div>
          );
        })()}
      </ModalBody>
    </Modal>
  );
};

export default DownloadReportModal;