import React, { useState, useEffect } from "react";
import {
  Modal,
  ModalHeader,
  ModalBody,
  Button,
  Spinner,
} from "reactstrap";
import i18n from "../i18n";
import { translatePurpose, translatePurposeToLanguage } from "../utils/translatedBusinessTypes";

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
    const list = Array.isArray(items) ? items : [];
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
  }, [items, initialBalance, initialoutstandingDebt]);

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
    return num.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
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
    doc.text(`$${formatCurrency(totalCash)}`, leftColX + labelWidth, yPos, { align: "right" });

    doc.setTextColor(130, 130, 130);
    doc.setFontSize(8.5);
    doc.setFont(fontName, "normal");
    doc.text(pt("grossRevenue"), rightColX, yPos);
    doc.setTextColor(43, 66, 125);
    doc.setFontSize(11);
    doc.setFont(dataFont(fontName), "bold");
    doc.text(`$${formatCurrency(totalRevenue)}`, pageWidth - 20, yPos, { align: "right" });

    yPos += 10;

    // Row 2: Total Payable | Total Expense
    doc.setTextColor(130, 130, 130);
    doc.setFontSize(8.5);
    doc.setFont(fontName, "normal");
    doc.text(pt("totalPayableUnpaid"), leftColX, yPos);
    doc.setTextColor(167, 86, 93);
    doc.setFontSize(11);
    doc.setFont(dataFont(fontName), "bold");
    doc.text(`$${formatCurrency(totalPayable)}`, leftColX + labelWidth, yPos, { align: "right" });

    doc.setTextColor(130, 130, 130);
    doc.setFontSize(8.5);
    doc.setFont(fontName, "normal");
    doc.text(pt("totalExpense"), rightColX, yPos);
    doc.setTextColor(167, 86, 93);
    doc.setFontSize(11);
    doc.setFont(dataFont(fontName), "bold");
    doc.text(`$${formatCurrency(totalExpenses)}`, pageWidth - 20, yPos, { align: "right" });

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
      doc.text(`$${formatCurrency(item.value)}`, boxX + boxWidth / 2, yPos + 24, { align: "center" });
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
      [pt("totalAssets"),        `$${formatCurrency(totalCash + totalInventory)}`],
      [pt("currentLiabilities"), `($${formatCurrency(totalPayable)})`],
      [pt("totalOwnerEquity"),   `$${formatCurrency(ownerEquity)}`],
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
    incomeStatementData.push([pt("revenue"), `$${formatCurrency(totalRevenue)}`]);
    const purposeToPdf = (p) => (pdfLanguage ? translatePurposeToLanguage(p, pdfLanguage) : translatePurpose(p));
    if (revenues && Object.keys(revenues).length > 0) {
      Object.entries(revenues).forEach(([purpose, amount]) =>
        incomeStatementData.push([`    ${purposeToPdf(purpose)}`, `$${formatCurrency(amount)}`])
      );
    } else {
      incomeStatementData.push([`    ${pt("freightRevenue")}`, `$${formatCurrency(totalRevenue)}`]);
    }
    incomeStatementData.push([pt("expenses"), `($${formatCurrency(totalExpenses)})`]);
    if (expenses && Object.keys(expenses).length > 0) {
      Object.entries(expenses).forEach(([purpose, amount]) =>
        incomeStatementData.push([`    ${purposeToPdf(purpose)}`, `($${formatCurrency(amount)})`])
      );
    }
    incomeStatementData.push([pt("netIncome"), `$${formatCurrency(netIncome)}`]);

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

  const safeItems = Array.isArray(items) ? items : [];
  const filteredItems = safeItems
    .filter((item) => (item.transactionPurpose || item.purpose || "") !== "Initial Cash Balance")
    .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));

  const journalData = [[pt("date"), pt("description"), pt("debit"), pt("credit")]];
  filteredItems.forEach((item) => {
    const debit = item.transactionType === "Receive" ? `$${formatCurrency(item.transactionAmount)}` : "-";
    const credit = item.transactionType !== "Receive" ? `$${formatCurrency(item.transactionAmount)}` : "-";
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
  const generateFinancialOnlyPages = (doc, pageWidth, pageHeight, pdfFont = "helvetica", scriptFonts = null, pdfLanguage = null) => {
  const totalCash      = parseFloat(calculateTotalCash().replace(/,/g, "")) || 0;
  const totalRevenue   = parseFloat(calculateTotalRevenue()) || 0;
  const totalExpenses  = parseFloat(calculateTotalExpenses()) || 0;
  const totalPayable   = parseFloat(calculateTotalPayable()) || 0;
  const totalInventory = parseFloat(calculateTotalInventory()) || 0;

  addHeader(doc, pageWidth, pdfFont);
  let yPos = 50;
  yPos = addStatementSummary(doc, pageWidth, yPos, totalCash, totalRevenue, totalExpenses, totalPayable, pdfFont);
  yPos = addBalanceSheet(doc, pageWidth, yPos, totalCash, totalInventory, totalPayable, pdfFont);
  yPos = addIncomeStatement(doc, pageWidth, yPos, totalRevenue, totalExpenses, pdfFont, scriptFonts, pdfLanguage);
  addJournalEntries(doc, pageWidth, pageHeight, yPos, pdfFont, scriptFonts, pdfLanguage);

  // ── Stamp page 1 footer LAST so totalPages is correct ─────────────────────
  const totalPages = doc.internal.getNumberOfPages();
  doc.setPage(1);
  addFooter(doc, pageWidth, pageHeight, 1, totalPages, false, pdfFont); // page 1 = not verified
};

  // ══════════════════════════════════════════════════════════════════════════
  // "Download Dashboard"
  // Page 1: header + 4 tiles + 2×2 charts + footer
  // ══════════════════════════════════════════════════════════════════════════
  const generateDashboardOnlyPage = async (doc, pageWidth, pageHeight, chartImages, pdfFont = "helvetica") => {
     // 🔍 DEBUG LOGS
  const rawCash     = calculateTotalCash();
  const rawRevenue  = calculateTotalRevenue();
  const rawExpenses = calculateTotalExpenses();
  const rawPayable  = calculateTotalPayable();

  console.log("=== RAW RETURN VALUES ===");
  console.log("calculateTotalCash()     →", rawCash,     "| type:", typeof rawCash);
  console.log("calculateTotalRevenue()  →", rawRevenue,  "| type:", typeof rawRevenue);
  console.log("calculateTotalExpenses() →", rawExpenses, "| type:", typeof rawExpenses);
  console.log("calculateTotalPayable()  →", rawPayable,  "| type:", typeof rawPayable);

  const totalCash     = parseFloat(rawCash.toString().replace(/,/g, ""))     || 0;
  const totalRevenue  = parseFloat(rawRevenue.toString().replace(/,/g, ""))  || 0;
  const totalExpenses = parseFloat(rawExpenses.toString().replace(/,/g, "")) || 0;
  const totalPayable  = parseFloat(rawPayable.toString().replace(/,/g, ""))  || 0;

  console.log("=== PARSED VALUES ===");
  console.log("totalCash     →", totalCash);
  console.log("totalRevenue  →", totalRevenue);
  console.log("totalExpenses →", totalExpenses);
  console.log("totalPayable  →", totalPayable);
    addHeader(doc, pageWidth, pdfFont);
    let yPos = 50;
    yPos = addSummaryTiles(doc, pageWidth, yPos, totalCash, totalRevenue, totalExpenses, totalPayable, pdfFont);
    yPos += 15;
    addCharts(doc, pageWidth, yPos, chartImages, pdfFont);

    const totalPages = doc.internal.getNumberOfPages();
    addFooter(doc, pageWidth, pageHeight, 1, totalPages, false, pdfFont);
  };

  // ══════════════════════════════════════════════════════════════════════════
  // "Download Both"
  // Page 1: header + 4 tiles + charts        ← DASHBOARD
  // Page 2: header + statement summary + balance sheet + income statement
  // Page 3+: header + journal entries
  // ══════════════════════════════════════════════════════════════════════════
  const generateBothPages = async (doc, pageWidth, pageHeight, chartImages, pdfFont = "helvetica", scriptFonts = null, pdfLanguage = null) => {
    const totalCash      = parseFloat(calculateTotalCash().replace(/,/g, "")) || 0;
    const totalRevenue   = parseFloat(calculateTotalRevenue()) || 0;
    const totalExpenses  = parseFloat(calculateTotalExpenses()) || 0;
    const totalPayable   = parseFloat(calculateTotalPayable()) || 0;
    const totalInventory = parseFloat(calculateTotalInventory()) || 0;

    // ── Page 1: Dashboard — tiles + charts ──────────────────────────────────
    addHeader(doc, pageWidth, pdfFont);
    let dashYPos = 50; // ← own variable, never shared with Page 2
    dashYPos = addSummaryTiles(doc, pageWidth, dashYPos, totalCash, totalRevenue, totalExpenses, totalPayable, pdfFont);
    dashYPos += 15;
    addCharts(doc, pageWidth, dashYPos, chartImages, pdfFont);
    // footer stamped at end once totalPages is known

    // ── Page 2: Financial Summary ────────────────────────────────────────────
    doc.addPage();
    addHeader(doc, pageWidth, pdfFont);
    let finYPos = 50; // ← own variable, fresh start at top of page 2
    finYPos = addStatementSummary(doc, pageWidth, finYPos, totalCash, totalRevenue, totalExpenses, totalPayable, pdfFont);
    finYPos = addBalanceSheet(doc, pageWidth, finYPos, totalCash, totalInventory, totalPayable, pdfFont);
    finYPos = addIncomeStatement(doc, pageWidth, finYPos, totalRevenue, totalExpenses, pdfFont, scriptFonts, pdfLanguage);
    // footer stamped at end once totalPages is known

    
    // ── Page 3+: Journal Entries ─────────────────────────────────────────────
   addJournalEntries(doc, pageWidth, pageHeight, finYPos, pdfFont, scriptFonts, pdfLanguage); // ← pass finYPos directly

    // addJournalEntries stamps its own footers, but totalPages will be wrong — fixed below

    // Fix all footers now that we know the real total page count
    const totalPages = doc.internal.getNumberOfPages();
    doc.setPage(1);
    addFooter(doc, pageWidth, pageHeight, 1, totalPages, false, pdfFont);
    doc.setPage(2);
    addFooter(doc, pageWidth, pageHeight, 2, totalPages, false, pdfFont);
    for (let i = 3; i <= totalPages; i++) {
      doc.setPage(i);
      addFooter(doc, pageWidth, pageHeight, i, totalPages, true, pdfFont);
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
  // ══════════════════════════════════════════════════════════════════════════
  // Main PDF generator
  // ══════════════════════════════════════════════════════════════════════════
 const generatePDF = async (type) => {
  setIsGenerating(true);
  try {
    let chartImages = {};

    if (type === "dashboard" || type === "both") {
      const chartIds = ["cashFlowChart", "revenueChart", "payableChart", "expensesChart"];
      await waitForChartElements(chartIds);
      // Wait for ApexCharts to paint inside the hidden divs
      await new Promise((resolve) => setTimeout(resolve, 3000));

      // Capture all 4 charts in parallel instead of sequentially
      const [cashFlowImg, revenueImg, payableImg, expensesImg] = await Promise.all([
        captureChartAsImage('cashFlowChart'),
        captureChartAsImage('revenueChart'),
        captureChartAsImage('payableChart'),
        captureChartAsImage('expensesChart'),
      ]);

      console.log('Chart capture:', {
        cashFlow: cashFlowImg ? 'ok' : 'fail',
        revenue: revenueImg ? 'ok' : 'fail',
        payable: payableImg ? 'ok' : 'fail',
        expenses: expensesImg ? 'ok' : 'fail'
      });

      chartImages = { cashFlowImg, revenueImg, payableImg, expensesImg };
    }

    const doc = new jsPDF({ orientation: "portrait", unit: "mm", format: "letter" });
    const pageWidth  = doc.internal.pageSize.getWidth();
    const pageHeight = doc.internal.pageSize.getHeight();

    // Use script-specific fonts so non-Latin text (Arabic, Amharic, Tigrinya) renders correctly
    const lang = currentLanguage || i18n.language || "en";
    let pdfFont = "helvetica";
    const scriptFonts = { ethiopic: null, arabic: null };

    if (lang === "am" || lang === "ti") {
      const ethiopicBase64 = await loadEthiopicFont();
      if (ethiopicBase64) {
        try {
          doc.addFileToVFS("NotoSansEthiopic-Regular.ttf", ethiopicBase64);
          doc.addFont("NotoSansEthiopic-Regular.ttf", "NotoSansEthiopic", "normal");
          doc.addFont("NotoSansEthiopic-Regular.ttf", "NotoSansEthiopic", "bold");
          pdfFont = "NotoSansEthiopic";
          scriptFonts.ethiopic = "NotoSansEthiopic";
        } catch (e) {
          console.warn("Could not register Ethiopic font:", e);
        }
      } else {
        console.warn("Add NotoSansEthiopic-Regular.ttf to public/fonts/ for Amharic/Tigrinya PDF support.");
      }
    } else if (lang === "ar") {
      const arabicBase64 = await loadArabicFont();
      if (arabicBase64) {
        try {
          doc.addFileToVFS("Amiri-Regular.ttf", arabicBase64);
          doc.addFont("Amiri-Regular.ttf", "Amiri", "normal");
          doc.addFont("Amiri-Regular.ttf", "Amiri", "bold");
          pdfFont = "Amiri";
          scriptFonts.arabic = "Amiri";
        } catch (e) {
          console.warn("Could not register Arabic font:", e);
        }
      } else {
        console.warn("Add Amiri-Regular.ttf to public/fonts/ for Arabic PDF support.");
      }
    }

    // For financial/both reports, load Ethiopic and Arabic so dynamic content (e.g. descriptions saved in am/ar) renders correctly in any PDF language
    if (type === "financial" || type === "both") {
      if (!scriptFonts.ethiopic) {
        const ethiopicBase64 = await loadEthiopicFont();
        if (ethiopicBase64) {
          try {
            doc.addFileToVFS("NotoSansEthiopic-Regular.ttf", ethiopicBase64);
            doc.addFont("NotoSansEthiopic-Regular.ttf", "NotoSansEthiopic", "normal");
            doc.addFont("NotoSansEthiopic-Regular.ttf", "NotoSansEthiopic", "bold");
            scriptFonts.ethiopic = "NotoSansEthiopic";
          } catch (e) { /* already added or failed */ }
        }
      }
      if (!scriptFonts.arabic) {
        const arabicBase64 = await loadArabicFont();
        if (arabicBase64) {
          try {
            doc.addFileToVFS("Amiri-Regular.ttf", arabicBase64);
            doc.addFont("Amiri-Regular.ttf", "Amiri", "normal");
            doc.addFont("Amiri-Regular.ttf", "Amiri", "bold");
            scriptFonts.arabic = "Amiri";
          } catch (e) { /* already added or failed */ }
        }
      }
    }

    if (type === "financial") {
      generateFinancialOnlyPages(doc, pageWidth, pageHeight, pdfFont, scriptFonts, lang);
    } else if (type === "dashboard") {
      await generateDashboardOnlyPage(doc, pageWidth, pageHeight, chartImages, pdfFont);
    } else if (type === "both") {
      await generateBothPages(doc, pageWidth, pageHeight, chartImages, pdfFont, scriptFonts, lang);
    }

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
        {/* Hidden off-screen charts for capture */}
        {cashOnHandOptions && (
          <div style={{ position: 'absolute', left: '-10000px', width: '500px', height: '300px' }}>
            <div id="cashFlowChart"><ReactApexChart options={cashOnHandOptions} series={cashOnHandOptions.series} type="area" height={300} width={500} /></div>
          </div>
        )}
        {revenueOptions && (
          <div style={{ position: 'absolute', left: '-10000px', width: '500px', height: '300px' }}>
            <div id="revenueChart"><ReactApexChart options={revenueOptions} series={revenueOptions.series} type="area" height={300} width={500} /></div>
          </div>
        )}
        {payableOptions && (
          <div style={{ position: 'absolute', left: '-10000px', width: '500px', height: '300px' }}>
            <div id="payableChart"><ReactApexChart options={payableOptions} series={payableOptions.series} type="area" height={300} width={500} /></div>
          </div>
        )}
        {expensesOptions && (
          <div style={{ position: 'absolute', left: '-10000px', width: '500px', height: '300px' }}>
            <div id="expensesChart"><ReactApexChart options={expensesOptions} series={expensesOptions.series} type="area" height={300} width={500} /></div>
          </div>
        )}

        <div style={{ display: "flex", flexDirection: "column", gap: "15px" }}>
          <Button onClick={() => generatePDF("financial")} disabled={isGenerating}
            style={{ backgroundColor: "var(--surface-3)", borderColor: "var(--border-strong)", color: "var(--text-1)", padding: "12px 20px", fontSize: "14px", fontWeight: "600", borderRadius: "var(--r-md)" }}>
            {isGenerating ? <Spinner size="sm" /> : dt("downloadFinancialReport")}
          </Button>
          <Button onClick={() => generatePDF("dashboard")} disabled={isGenerating}
            style={{ backgroundColor: "var(--surface-3)", borderColor: "var(--border-strong)", color: "var(--text-1)", padding: "12px 20px", fontSize: "14px", fontWeight: "600", borderRadius: "var(--r-md)" }}>
            {isGenerating ? <Spinner size="sm" /> : dt("downloadDashboard")}
          </Button>
          <Button onClick={() => generatePDF("both")} disabled={isGenerating}
            style={{ backgroundColor: "var(--accent-solid)", borderColor: "var(--accent-solid)", color: "var(--accent-ink)", padding: "12px 20px", fontSize: "14px", fontWeight: "700", borderRadius: "var(--r-md)" }}>
            {isGenerating ? <Spinner size="sm" /> : dt("downloadBoth")}
          </Button>
        </div>

        <p style={{ color: "var(--text-3)", fontSize: "12px", marginTop: "20px", textAlign: "center", marginBottom: "0" }}>
          {dt("pdfNote")}
        </p>
      </ModalBody>
    </Modal>
  );
};

export default DownloadReportModal;