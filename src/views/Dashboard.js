import React, { useEffect, useState, useRef, useMemo } from "react";
import {
  Card,
  CardHeader,
  CardBody,
  CardTitle,
  Row,
  Col,
  FormGroup,
  Label,
  Input,
  Button,
  Popover,
  PopoverBody,
  Spinner,
} from "reactstrap";
import ReactApexChart from "react-apexcharts";
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  Title,
  Tooltip,
  Legend,
} from "chart.js";
import PanelHeader from "components/PanelHeader/PanelHeader.js";
import axios from "axios";
import { apiUrl, ROUTES } from "../config/api";
import Select from "react-select";
import { Helmet } from "react-helmet";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { useNavigate, useLocation } from "react-router-dom";
import { useTranslation } from "react-i18next";
import i18n from "../i18n";
import LanguageSelector from "components/Languageselector/LanguageSelector";
import { faPlus, faDownload, faSearch } from "@fortawesome/free-solid-svg-icons";
import DownloadReportModal from "components/DownloadReportModal";
import QuickScanReceipt from "components/QuickScanReceipt";
import BalanceValue from "components/BalanceValue";
import {
  FINANCIAL_COLORS,
  getBalanceColor,
  getBalanceCardStyle,
} from "utils/financialColors";

const CHART_TOOLBAR_DOWNLOAD_ICON =
  '<svg xmlns="http://www.w3.org/2000/svg" width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" x2="12" y1="15" y2="3"/></svg>';

ChartJS.register(
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  Title,
  Tooltip,
  Legend
);

function computeDashboardMetrics(
  transactions,
  initialCashBalance,
  outstandingDebt,
  dateRange,
  searchQuery
) {
  const q = (searchQuery || "").trim().toLowerCase();
  const matches = (tx) =>
    !q || String(tx.transactionPurpose || "").toLowerCase().includes(q);

  const sortedTransactions = [...(transactions || [])].sort(
    (a, b) => new Date(a.createdAt) - new Date(b.createdAt)
  );

  let fromMs = null;
  let toMs = null;
  if (dateRange?.from && dateRange?.to) {
    const a = new Date(dateRange.from);
    a.setHours(0, 0, 0, 0);
    fromMs = a.getTime();
    const b = new Date(dateRange.to);
    b.setHours(23, 59, 59, 999);
    toMs = b.getTime();
  }

  const filteredForPdf = sortedTransactions.filter((tx) => {
    if (!matches(tx)) return false;
    if (fromMs == null || toMs == null) return true;
    const t = new Date(tx.createdAt).getTime();
    return t >= fromMs && t <= toMs;
  });

  const dateKeyOf = (createdAt) => {
    const date = new Date(createdAt);
    return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(
      2,
      "0"
    )}-${String(date.getDate()).padStart(2, "0")}`;
  };

  let cashOnHand = initialCashBalance;
  let payable = outstandingDebt;
  let revenue = 0;
  let expenses = 0;
  let newItem = 0;
  const dailyData = {};

  const applyLedgerOnly = (tx) => {
    const amount = parseFloat(tx.transactionAmount) || 0;
    if (tx.transactionType === "Receive") {
      cashOnHand += amount;
    } else if (tx.transactionType === "Pay") {
      cashOnHand -= amount;
      if (tx.payableId) payable -= amount;
    } else if (tx.transactionType === "Pay" && tx.subType === "New_Item") {
      cashOnHand -= amount;
    } else if (tx.transactionType === "New_Item") {
      cashOnHand -= amount;
    } else if (
      tx.transactionType === "Payable" &&
      (tx.status === "Payable" || tx.status === "Partially Paid")
    ) {
      payable += amount;
    }
  };

  const applyTxToDay = (tx, dateKey) => {
    const amount = parseFloat(tx.transactionAmount) || 0;
    const m = matches(tx);

    if (!dailyData[dateKey]) {
      dailyData[dateKey] = {
        date: dateKey,
        cashOnHand,
        revenue: 0,
        payable,
        expenses: 0,
        newItem: 0,
        paidPayables: 0,
      };
    }

    if (tx.transactionType === "Receive") {
      cashOnHand += amount;
      if (m) {
        revenue += amount;
        dailyData[dateKey].revenue += amount;
      }
    } else if (tx.transactionType === "Pay") {
      cashOnHand -= amount;
      if (m) {
        expenses += amount;
        dailyData[dateKey].expenses += amount;
      }
      if (tx.payableId) {
        payable -= amount;
        if (m) dailyData[dateKey].paidPayables += amount;
      }
    } else if (
      tx.transactionType === "Pay" &&
      tx.subType === "New_Item"
    ) {
      newItem += m ? amount : 0;
      cashOnHand -= amount;
      if (m) {
        expenses += amount;
        dailyData[dateKey].expenses += amount;
        dailyData[dateKey].newItem += amount;
      }
    } else if (tx.transactionType === "New_Item") {
      // Asset purchase — capitalized, NOT an operating expense (matches the
      // Financial Report). It reduces cash and adds to assets (newItem), but must
      // not hit the expenses total or net income, or the Dashboard shows a false
      // loss whenever a user buys equipment/inventory.
      newItem += m ? amount : 0;
      cashOnHand -= amount;
      if (m) {
        dailyData[dateKey].newItem += amount;
      }
    } else if (
      tx.transactionType === "Payable" &&
      (tx.status === "Payable" || tx.status === "Partially Paid")
    ) {
      payable += amount;
    }

    dailyData[dateKey].payable = payable;
    dailyData[dateKey].cashOnHand = cashOnHand;
  };

  if (fromMs == null || toMs == null) {
    dailyData.Initial = {
      date: "Initial Balance",
      cashOnHand: initialCashBalance,
      revenue: 0,
      payable: outstandingDebt,
      expenses: 0,
      newItem: 0,
      paidPayables: 0,
    };

    sortedTransactions.forEach((tx) => {
      applyTxToDay(tx, dateKeyOf(tx.createdAt));
    });
  } else {
    for (const tx of sortedTransactions) {
      const t = new Date(tx.createdAt).getTime();
      if (t >= fromMs) break;
      applyLedgerOnly(tx);
    }

    dailyData[dateRange.from] = {
      date: dateRange.from,
      cashOnHand,
      payable,
      revenue: 0,
      expenses: 0,
      newItem: 0,
      paidPayables: 0,
    };

    revenue = 0;
    expenses = 0;
    newItem = 0;

    sortedTransactions.forEach((tx) => {
      const t = new Date(tx.createdAt).getTime();
      if (t < fromMs || t > toMs) return;
      applyTxToDay(tx, dateKeyOf(tx.createdAt));
    });

    cashOnHand = initialCashBalance;
    payable = outstandingDebt;
    for (const tx of sortedTransactions) {
      const t = new Date(tx.createdAt).getTime();
      if (t > toMs) break;
      applyLedgerOnly(tx);
    }
  }

  const sortedDailyData = Object.values(dailyData).sort((a, b) => {
    if (a.date === "Initial Balance") return -1;
    if (b.date === "Initial Balance") return 1;
    return new Date(a.date) - new Date(b.date);
  });

  return {
    totalCashOnHand: cashOnHand,
    totalExpenses: expenses,
    totalrevenue: revenue,
    totalPayable: payable,
    monthlySales: sortedDailyData,
    filteredTransactions: filteredForPdf,
  };
}

const SUBSCRIPTION_ROUTE = "/customer/subscription";
const SUBSCRIPTION_UPDATE_HINT = "Subscription update needed";

function Dashboard() {
  const userId = localStorage.getItem("userId");
  const location = useLocation();
  const [loading, setLoading] = useState(true);
  const [items, setItems] = useState([]);
  const [totalCashOnHand, setTotalCashOnHand] = useState(0);
  const [totalrevenue, settotalRevenue] = useState(0);
  const [totalExpenses, setTotalExpenses] = useState(0);
  const [initialBalance, setInitialBalance] = useState(0);
  const [initialvalueableItems, setvalueableItems] = useState(0);
  const [initialoutstandingDebt, setoutstandingDebt] = useState(0);
  const [totalPayable, setTotalPayable] = useState(0);
  const [monthlySales, setMonthlySales] = useState([]);
  const [users, setUsers] = useState([]);
  const [trialEndDate, setTrialEndDate] = useState(null);
  const [showDownloadReportModal, setShowDownloadReportModal] = useState(false);
  // Which metric drives the big hero panel + overview chart (tiles select it).
  const [heroMetric, setHeroMetric] = useState("cash");
  const [loadingFinancialData, setLoadingFinancialData] = useState(false);
  const [loadingUsers, setLoadingUsers] = useState(false);
  const [loadingCompanyName, setLoadingCompanyName] = useState(false);
  const [loadingSubscription, setLoadingSubscription] = useState(false);
  const persistedUserId = localStorage.getItem("selectedUserId");
  const userRole = parseInt(localStorage.getItem("role"));
  const { t } = useTranslation();
  const [selectedUserId, setSelectedUserId] = useState(persistedUserId || null);
  const navigate = useNavigate();
  const [companyName, setCompanyName] = useState("");
  const [userSubscription, setUserSubscription] = useState(false);
  const [scheduleCount, setScheduleCount] = useState(0);

  const [allTransactions, setAllTransactions] = useState([]);
  const [dashboardDateRange, setDashboardDateRange] = useState(null);
  const [dashboardSearchTerm, setDashboardSearchTerm] = useState("");
  const [dashFromDate, setDashFromDate] = useState("");
  const [dashToDate, setDashToDate] = useState("");
  const [dashShowSearch, setDashShowSearch] = useState(false);
  const [dashPreset, setDashPreset] = useState(null);
  const [dashCustomOpen, setDashCustomOpen] = useState(false);

  const dashboardDateRangeRef = useRef(null);
  const dashboardSearchRef = useRef("");
  const totalCashOnHandRef = useRef(0);

  useEffect(() => {
    dashboardDateRangeRef.current = dashboardDateRange;
  }, [dashboardDateRange]);
  useEffect(() => {
    dashboardSearchRef.current = dashboardSearchTerm;
  }, [dashboardSearchTerm]);

  const [isMobile, setIsMobile] = useState(window.innerWidth < 768);
  const [isLandscape, setIsLandscape] = useState(window.innerWidth > window.innerHeight);

  // ── Refs so PDF modal always gets fresh values regardless of closure timing ─
  const itemsRef = useRef([]);
  const initialBalanceRef = useRef(0);
  const initialvalueableItemsRef = useRef(0);
  const initialoutstandingDebtRef = useRef(0);
  const totalrevenueRef = useRef(0);
  const totalExpensesRef = useRef(0);
  const totalPayableRef = useRef(0);

  // Keep refs in sync with state
  useEffect(() => { itemsRef.current = items; }, [items]);
  useEffect(() => { initialBalanceRef.current = initialBalance; }, [initialBalance]);
  useEffect(() => { initialvalueableItemsRef.current = initialvalueableItems; }, [initialvalueableItems]);
  useEffect(() => { initialoutstandingDebtRef.current = initialoutstandingDebt; }, [initialoutstandingDebt]);
  useEffect(() => { totalrevenueRef.current = totalrevenue; }, [totalrevenue]);
  useEffect(() => { totalExpensesRef.current = totalExpenses; }, [totalExpenses]);
  useEffect(() => { totalPayableRef.current = totalPayable; }, [totalPayable]);

  // Derive revenues/expenses by purpose for PDF report (same shape as financial-report page)
  const { revenues, expenses } = useMemo(() => {
    const rev = {};
    const exp = {};
    const list = Array.isArray(items) ? items : [];
    list.forEach((transaction) => {
      const amount = parseFloat(transaction.transactionAmount) || 0;
      const purpose = transaction.transactionPurpose || "";
      if (transaction.transactionType === "Receive") {
        rev[purpose] = (rev[purpose] || 0) + amount;
      } else if (
        (transaction.transactionType === "Pay" || transaction.transactionType === "Payable") &&
        transaction.payableId !== "outstanding-debt" &&
        !String(purpose).includes("Outstanding Debt")
      ) {
        exp[purpose] = (exp[purpose] || 0) + amount;
      }
    });
    return { revenues: rev, expenses: exp };
  }, [items]);

  useEffect(() => {
    const handleResize = () => {
      setIsMobile(window.innerWidth < 768);
      setIsLandscape(window.innerWidth > window.innerHeight);
    };
    window.addEventListener("resize", handleResize);
    return () => window.removeEventListener("resize", handleResize);
  }, []);

  const isMobileLandscape = isMobile && isLandscape;

  useEffect(() => {
    if (userRole === "0" && !location.pathname.includes("/admin")) {
      navigate("/admin/dashboard", { replace: true });
    } else if (userRole === "2" && !location.pathname.includes("/customer")) {
      navigate("/customer/dashboard", { replace: true });
    }
  }, [userRole, location.pathname, navigate]);

  const userOptions = users.map((user) => ({
    value: user.id,
    label: user.email,
  }));

  // ── Calculate functions using REFS ─────────────────────────────────────────
  // These are passed as callbacks to DownloadReportModal and called at PDF
  // generation time (not at render time), so they MUST read from refs to avoid
  // stale closure issues. All return plain "0.00" decimal strings — same format
  // as meksova.com2 — so DownloadReportModal's parseFloat() always works.

  const calculateTotalCash = () =>
    (totalCashOnHandRef.current || 0).toFixed(2);

  const calculateTotalRevenue = () => {
    return (totalrevenueRef.current || 0).toFixed(2);
  };

  const calculateTotalExpenses = () => {
    return (totalExpensesRef.current || 0).toFixed(2);
  };

  const calculateTotalPayable = () => {
    return (totalPayableRef.current || 0).toFixed(2);
  };

  const calculateTotalInventory = () => {
    return (initialvalueableItemsRef.current || 0).toFixed(2);
  };

  const fetchUsers = async () => {
    setLoadingUsers(true);
    try {
      const response = await axios.get(
        apiUrl(ROUTES.USERS)
      );
      if (response.data) {
        setUsers(response.data);
      }
    } catch (error) {
      console.error("Error fetching users:", error);
    } finally {
      setLoadingUsers(false);
    }
  };

  const getChartOptions = (title, data, labels, color = "var(--accent-solid)") => {
    const lastIdx = Array.isArray(data) ? data.length - 1 : -1;
    const lastVal = lastIdx >= 0 ? Number(data[lastIdx]) || 0 : 0;
    return {
      theme: {
        mode: "dark",
      },
      // Emphasised endpoint with a value callout on the last data point.
      annotations: {
        points:
          lastIdx >= 0
            ? [
                {
                  x: labels[lastIdx],
                  y: lastVal,
                  marker: {
                    size: 5,
                    fillColor: color,
                    strokeColor: "var(--bg)",
                    strokeWidth: 2,
                    radius: 2,
                  },
                  label: {
                    text: `$${lastVal.toLocaleString(undefined, { maximumFractionDigits: 0 })}`,
                    borderColor: color,
                    borderWidth: 1,
                    offsetY: -2,
                    style: {
                      background: "var(--surface-2)",
                      color: "var(--text-1)",
                      fontSize: "11px",
                      fontFamily: "JetBrains Mono, monospace",
                      padding: { left: 8, right: 8, top: 4, bottom: 4 },
                    },
                  },
                },
              ]
            : [],
      },
      chart: {
        type: "area",
        background: "transparent",
        toolbar: {
          show: false,
          tools: {
            download: CHART_TOOLBAR_DOWNLOAD_ICON,
            zoom: true,
            zoomin: true,
            zoomout: true,
            pan: true,
            reset: true,
          },
        },
        zoom: {
          enabled: true,
          type: "x",
          autoScaleYaxis: true,
        },
        animations: {
          enabled: true,
          easing: "easeinout",
          speed: 800,
        },
      },
      series: [
        {
          name: title,
          data: data,
        },
      ],
      xaxis: {
        categories: labels,
        axisBorder: { show: false },
        axisTicks: { show: false },
        tooltip: { enabled: false },
        labels: {
          rotate: -45,
          rotateAlways: false,
          hideOverlappingLabels: true,
          style: {
            fontSize: "10px",
            colors: "var(--text-3)",
            fontFamily: "JetBrains Mono, monospace",
          },
        },
      },
      yaxis: {
        title: { text: "" },
        labels: {
          formatter: function (value) {
            if (!value) return "$0";
            return (
              "$" +
              value.toLocaleString(undefined, {
                minimumFractionDigits: 0,
                maximumFractionDigits: 0,
              })
            );
          },
          style: {
            colors: "var(--text-3)",
            fontSize: "10px",
            fontFamily: "JetBrains Mono, monospace",
          },
        },
        tickAmount: 5,
        min: 0,
        max: function (max) {
          return max > 0 ? max * 1.1 : 100;
        },
      },
      stroke: {
        curve: "smooth",
        width: 2.5,
        lineCap: "round",
      },
      fill: {
        type: "gradient",
        gradient: {
          shadeIntensity: 1,
          opacityFrom: 0.32,
          opacityTo: 0,
          stops: [0, 100],
        },
      },
      colors: [color],
      markers: {
        size: 0,
        colors: [color],
        strokeColors: color,
        strokeWidth: 2,
        hover: {
          size: 6,
          sizeOffset: 3,
        },
      },
      grid: {
        show: true,
        borderColor: "rgba(255,255,255,0.06)",
        strokeDashArray: 3,
        row: {
          colors: ["transparent", "transparent"],
          opacity: 0,
        },
        padding: {
          top: 0,
          right: 10,
          bottom: 0,
          left: 10,
        },
      },
      tooltip: {
        enabled: true,
        shared: true,
        intersect: false,
        theme: "dark",
        style: {
          fontSize: "12px",
        },
        y: {
          formatter: function (value) {
            return (
              "$" +
              value.toLocaleString(undefined, {
                minimumFractionDigits: 2,
                maximumFractionDigits: 2,
              })
            );
          },
        },
      },
      dataLabels: {
        enabled: false,
      },
      legend: {
        show: false,
        position: "top",
        horizontalAlign: "right",
        labels: {
          colors: "var(--text-1)",
        },
      },
    };
  };

  const formatDateLabel = (dateStr) => {
    if (dateStr === "Initial Balance") return "Initial";

    const date = new Date(dateStr);
    return date.toLocaleDateString("en-US", {
      month: "short",
      day: "numeric",
      year: "numeric",
    });
  };

  const cashOnHandChartData = getChartOptions(
    t('dashboard.totalCashOnHandChart'),
    monthlySales.map((item) => item.cashOnHand),
    monthlySales.map((item) => formatDateLabel(item.date)),
    FINANCIAL_COLORS.asset
  );

  const revenueChartData = getChartOptions(
    t('dashboard.revenueChart'),
    monthlySales.map((item) => item.revenue),
    monthlySales.map((item) => formatDateLabel(item.date)),
    FINANCIAL_COLORS.income
  );

  const payableChartData = getChartOptions(
    t('dashboard.totalPayableChart'),
    monthlySales.map((item) => item.payable),
    monthlySales.map((item) => formatDateLabel(item.date)),
    FINANCIAL_COLORS.payable
  );

  const expensesChartData = getChartOptions(
    t('dashboard.totalExpensesChart'),
    monthlySales.map((item) => item.expenses),
    monthlySales.map((item) => formatDateLabel(item.date)),
    FINANCIAL_COLORS.expense
  );

  const fetchFinancialData = async (uid = null) => {
    setLoadingFinancialData(true);

    try {
      let resolvedUserId;
      if (selectedUserId) {
        resolvedUserId = selectedUserId;
      } else {
        resolvedUserId = uid || localStorage.getItem("userId");
      }

      const userResponse = await axios.get(
        apiUrl(`${ROUTES.USERS}/${resolvedUserId}`)
      );

      const initialCashBalance =
        parseFloat(userResponse.data?.user?.cashBalance) || 0;
      const outstandingDebt =
        parseFloat(userResponse.data?.user?.outstandingDebt) || 0;
      const valuableItems =
        parseFloat(userResponse.data?.user?.valueableItems) || 0;

      setInitialBalance(initialCashBalance);
      setoutstandingDebt(outstandingDebt);
      setvalueableItems(valuableItems);

      // Sync refs immediately so PDF modal callbacks read correct values
      initialBalanceRef.current = initialCashBalance;
      initialoutstandingDebtRef.current = outstandingDebt;
      initialvalueableItemsRef.current = valuableItems;

      const response = await axios.get(
        apiUrl(`${ROUTES.TRANSACTION}?userId=${resolvedUserId}`)
      );
      // Ensure we always have an array (API may return array or { data/transactions: [...] })
      const raw = response.data;
      const transactions = Array.isArray(raw)
        ? raw
        : (raw?.transactions || raw?.data || []);
      setAllTransactions(transactions);
      setLoading(false);
    } catch (error) {
      console.error("Error fetching financial data:", error);
      setLoading(false);
    } finally {
      setLoadingFinancialData(false);
    }
  };

  useEffect(() => {
    const result = computeDashboardMetrics(
      allTransactions,
      initialBalance,
      initialoutstandingDebt,
      dashboardDateRange,
      dashboardSearchTerm
    );
    setTotalCashOnHand(result.totalCashOnHand);
    setTotalExpenses(result.totalExpenses);
    settotalRevenue(result.totalrevenue);
    setTotalPayable(result.totalPayable);
    setMonthlySales(result.monthlySales);
    setItems(result.filteredTransactions);
    itemsRef.current = result.filteredTransactions;
    totalrevenueRef.current = result.totalrevenue;
    totalExpensesRef.current = result.totalExpenses;
    totalPayableRef.current = result.totalPayable;
    totalCashOnHandRef.current = result.totalCashOnHand;
  }, [
    allTransactions,
    dashboardDateRange,
    dashboardSearchTerm,
    initialBalance,
    initialoutstandingDebt,
  ]);

  const isTrialActive = () =>
    trialEndDate && new Date() < trialEndDate && scheduleCount < 4;

  const isSubscriptionGateActive = () =>
    userRole !== 1 && !userSubscription && !isTrialActive();

  const handleAddTransactionClick = () => {
    if (isSubscriptionGateActive()) {
      navigate(SUBSCRIPTION_ROUTE);
      return;
    }
    navigate("/customer/financial-report", {
      state: { openTransactionModal: true },
    });
  };

  const calculatePercentageChange = (currentValue, previousValue) => {
    if (!previousValue || previousValue === 0) {
      if (currentValue === 0) return { text: "— No change", value: 0, isPositive: null };
      return { text: "+100% vs last month", value: 100, isPositive: true };
    }
    const change = ((currentValue - previousValue) / previousValue) * 100;
    const roundedChange = Math.round(change);
    if (roundedChange === 0) {
      return { text: "— No change", value: 0, isPositive: null };
    }
    const sign = roundedChange > 0 ? "+" : "";
    return {
      text: `${sign}${roundedChange}% vs last month`,
      value: roundedChange,
      isPositive: roundedChange > 0,
    };
  };

  const getPreviousMonthValues = () => {
    if (!monthlySales || monthlySales.length < 2) {
      return { cashOnHand: 0, expenses: 0, payable: 0, revenue: 0 };
    }
    const previousIndex = monthlySales.length - 2;
    const previous = monthlySales[previousIndex];
    return {
      cashOnHand: previous?.cashOnHand || 0,
      expenses: previous?.expenses || 0,
      payable: previous?.payable || 0,
      revenue: previous?.revenue || 0,
    };
  };

  useEffect(() => {
    const fetchCompanyName = async () => {
      setLoadingCompanyName(true);
      try {
        const targetUserId = selectedUserId || localStorage.getItem("userId");
        const userResponse = await axios.get(
          apiUrl(`${ROUTES.USERS}/${targetUserId}`)
        );
        setCompanyName(userResponse.data?.user?.companyName || "");
      } catch (error) {
        console.error("Error fetching company name:", error);
      } finally {
        setLoadingCompanyName(false);
      }
    };
    fetchCompanyName();
  }, [selectedUserId]);

  useEffect(() => {
    if (userRole === 0) {
      fetchUsers();
    } else {
      fetchFinancialData();
    }
  }, [userRole]);

  useEffect(() => {
    fetchUsers().then(() => {
      console.log("Users fetched:", users);
    });
  }, []);

  useEffect(() => {
    const fetchSubscription = async () => {
      setLoadingSubscription(true);
      const userId = localStorage.getItem("userId");
      try {
        const response = await axios.get(
          apiUrl(`${ROUTES.USERS}/${userId}`)
        );
        if (response.data && response.data.user) {
          setUserSubscription(response.data.user.subscription);
          setTrialEndDate(new Date(response.data.user?.trialEndDate));
          setScheduleCount(response.data.user.scheduleCount || 1);
        } else {
          setUserSubscription(false);
          setScheduleCount(1);
        }
      } catch (error) {
        console.error("Error fetching subscription:", error);
        setUserSubscription(false);
        setScheduleCount(1);
      } finally {
        setLoadingSubscription(false);
      }
    };
    fetchSubscription();
  }, []);

  // When user clicks "Download Report" in the navbar while on dashboard, open this page's modal (with real data)
  useEffect(() => {
    const handleDashboardDownload = () => setShowDownloadReportModal(true);
    window.addEventListener("dashboard:downloadReport", handleDashboardDownload);
    return () => window.removeEventListener("dashboard:downloadReport", handleDashboardDownload);
  }, []);

  const LoadingOverlay = ({ loading, text = "Loading..." }) => {
    if (!loading) return null;
    return (
      <div
        style={{
          position: "absolute",
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          backgroundColor: "rgba(10, 10, 11, 0.66)",
          backdropFilter: "blur(8px)",
          WebkitBackdropFilter: "blur(8px)",
          display: "flex",
          justifyContent: "center",
          alignItems: "center",
          zIndex: 1000,
          borderRadius: "inherit",
        }}
        aria-busy="true"
        aria-live="polite"
      >
        <div className="text-center" style={{ padding: "0.5rem" }}>
          <Spinner
            color="light"
            style={{
              width: "1.85rem",
              height: "1.85rem",
              opacity: 0.95,
            }}
          />
          <p
            className="mt-2 mb-0"
            style={{
              color: "rgba(203, 213, 225, 0.95)",
              fontSize: "0.8125rem",
              fontWeight: 500,
              letterSpacing: "0.03em",
            }}
          >
            {text}
          </p>
        </div>
      </div>
    );
  };

  // Compact inline trend line for the stat tiles. Pure presentational,
  // built from the monthlySales series already loaded. `id` must be unique
  // per instance (gradient defs).
  const Sparkline = ({ id, data = [], color = "var(--accent)", width = 76, height = 28, fluid = false }) => {
    const nums = (data || []).map((n) => Number(n) || 0);
    if (nums.length < 2) return null;
    const min = Math.min(...nums);
    const max = Math.max(...nums);
    const span = max - min || 1;
    const stepX = width / (nums.length - 1);
    const pts = nums.map((n, i) => [
      i * stepX,
      height - ((n - min) / span) * (height - 5) - 3,
    ]);
    const line = pts
      .map((p, i) => `${i === 0 ? "M" : "L"}${p[0].toFixed(1)},${p[1].toFixed(1)}`)
      .join(" ");
    const area = `${line} L${width.toFixed(1)},${height} L0,${height} Z`;
    return (
      <svg width={fluid ? "100%" : width} height={height} viewBox={`0 0 ${width} ${height}`}
        preserveAspectRatio="none" aria-hidden="true"
        style={{ display: "block", width: fluid ? "100%" : undefined }}>
        <defs>
          <linearGradient id={id} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stopColor={color} stopOpacity="0.28" />
            <stop offset="1" stopColor={color} stopOpacity="0" />
          </linearGradient>
        </defs>
        <path d={area} fill={`url(#${id})`} />
        <path d={line} fill="none" stroke={color} strokeWidth="1.6"
          strokeLinejoin="round" strokeLinecap="round" />
      </svg>
    );
  };

  const handleUserSelect = (selectedOption) => {
    setDashboardDateRange(null);
    setDashFromDate("");
    setDashToDate("");
    setDashboardSearchTerm("");
    setDashShowSearch(false);
    if (!selectedOption) {
      setSelectedUserId(null);
      localStorage.removeItem("selectedUserId");
      setAllTransactions([]);
      fetchFinancialData(null);
      return;
    }
    const uid = selectedOption.value;
    setSelectedUserId(uid);
    localStorage.setItem("selectedUserId", uid);
    fetchFinancialData(uid);
  };

  const filterActionsLocked =
    userRole === 1 ? false : !userSubscription && !isTrialActive();
  const dashboardFilterDisabled = userRole === 0 && !selectedUserId;

  const handleDashboardFilterRun = () => {
    if (!dashFromDate || !dashToDate) {
      window.alert(t("financialReport.selectDates"));
      return;
    }
    setDashboardDateRange({ from: dashFromDate, to: dashToDate });
  };

  const handleDashboardClearFilters = () => {
    setDashFromDate("");
    setDashToDate("");
    setDashboardDateRange(null);
    setDashboardSearchTerm("");
    setDashShowSearch(false);
  };

  // Local YYYY-MM-DD (avoids the UTC day-shift that toISOString causes for
  // users behind UTC). Matches the string a native date input produces.
  const dashLocalYMD = (d) => {
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, "0");
    const day = String(d.getDate()).padStart(2, "0");
    return `${y}-${m}-${day}`;
  };

  const applyDashPreset = (key) => {
    if (dashboardFilterDisabled) return;
    if (filterActionsLocked) {
      navigate(SUBSCRIPTION_ROUTE);
      return;
    }
    if (key === "custom") {
      setDashPreset("custom");
      setDashCustomOpen((v) => !v);
      return;
    }
    const now = new Date();
    const to = new Date();
    let from;
    if (key === "month") {
      from = new Date(now.getFullYear(), now.getMonth(), 1);
    } else if (key === "30d") {
      from = new Date();
      from.setDate(from.getDate() - 29);
    } else if (key === "quarter") {
      const q = Math.floor(now.getMonth() / 3);
      from = new Date(now.getFullYear(), q * 3, 1);
    } else {
      from = new Date(now.getFullYear(), 0, 1); // ytd
    }
    const f = dashLocalYMD(from);
    const tt = dashLocalYMD(to);
    setDashPreset(key);
    setDashCustomOpen(false);
    setDashFromDate(f);
    setDashToDate(tt);
    setDashboardDateRange({ from: f, to: tt });
  };

  const resetDashFilter = () => {
    setDashPreset(null);
    setDashCustomOpen(false);
    handleDashboardClearFilters();
  };

  const showDashboardFilters = userRole !== 0 || selectedUserId;

  useEffect(() => {
    const persistedUserId = localStorage.getItem("selectedUserId");
    if (persistedUserId) {
      setSelectedUserId(persistedUserId);
      fetchFinancialData(persistedUserId);
    }
  }, []);

  useEffect(() => {
    if (selectedUserId) {
      fetchFinancialData(selectedUserId);
    }
  }, [selectedUserId]);

  useEffect(() => {
    const style = document.createElement('style');
    style.textContent = `
      .apexcharts-menu-item { color: #000000 !important; }
      .apexcharts-menu-item:hover { color: #000000 !important; }
      .apexcharts-menu-item:active { color: #000000 !important; }
      .apexcharts-menu-item:focus { color: #000000 !important; }
    `;
    document.head.appendChild(style);
    return () => { if (document.head.contains(style)) document.head.removeChild(style); };
  }, []);

  useEffect(() => {
    const handleResize = () => setIsMobile(window.innerWidth < 768);
    window.addEventListener("resize", handleResize);
    return () => window.removeEventListener("resize", handleResize);
  }, []);

  // Metric registry — drives the interactive hero panel + overview chart.
  const heroMetrics = {
    cash: {
      key: "cash", label: t("dashboard.cashOnHand"), value: parseFloat(calculateTotalCash()),
      prev: getPreviousMonthValues().cashOnHand, color: FINANCIAL_COLORS.asset, icon: "fas fa-wallet",
      chart: cashOnHandChartData, chartTitle: t("dashboard.totalCashOnHandChart"),
      spark: monthlySales.map((m) => m.cashOnHand),
    },
    revenue: {
      key: "revenue", label: t("dashboard.revenue"), value: totalrevenue,
      prev: getPreviousMonthValues().revenue, color: FINANCIAL_COLORS.income, icon: "fas fa-arrow-up",
      chart: revenueChartData, chartTitle: t("dashboard.revenueChart"),
      spark: monthlySales.map((m) => m.revenue),
    },
    expenses: {
      key: "expenses", label: t("dashboard.totalExpenses"), value: totalExpenses,
      prev: getPreviousMonthValues().expenses, color: FINANCIAL_COLORS.expense, icon: "fas fa-arrow-down",
      chart: expensesChartData, chartTitle: t("dashboard.totalExpensesChart"),
      spark: monthlySales.map((m) => m.expenses),
    },
    payable: {
      key: "payable", label: t("dashboard.totalPayable"), value: totalPayable,
      prev: getPreviousMonthValues().payable, color: FINANCIAL_COLORS.payable, icon: "fas fa-file-invoice",
      chart: payableChartData, chartTitle: t("dashboard.totalPayableChart"),
      spark: monthlySales.map((m) => m.payable),
    },
  };
  const activeMetric = heroMetrics[heroMetric] || heroMetrics.cash;

  return (
    <>
      <Helmet>
        <title>Dashboard - Meksova </title>
      </Helmet>
      {isMobile ?
        <PanelHeader
          size={isMobileLandscape ? "md" : isMobile ? "sm" : "sm"}
          content={
            <>
              {isMobile && (
                <div style={{
                  position: "absolute",
                  top: 0, left: 0, right: 0,
                  display: "flex",
                  marginTop: 70,
                  justifyContent: 'center',
                  paddingLeft: 5,
                  paddingRight: 5,
                  gap: "10px",
                }}>
                  <Button
                    type="button"
                    title={isSubscriptionGateActive() ? SUBSCRIPTION_UPDATE_HINT : undefined}
                    onClick={() => {
                      if (isSubscriptionGateActive()) {
                        navigate(SUBSCRIPTION_ROUTE);
                        return;
                      }
                      setShowDownloadReportModal(true);
                    }}
                    style={{
                      backgroundColor: "var(--surface-3)",
                      borderColor: "var(--border-strong)",
                      color: "var(--text-1)",
                      height: "44px",
                      borderRadius: "10px",
                      width: "45%",
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      fontSize: "13px",
                      fontWeight: "600",
                      whiteSpace: "nowrap",
                      margin: 0,
                      opacity: isSubscriptionGateActive() ? 0.5 : 1,
                    }}
                  >
                    <FontAwesomeIcon icon={faDownload} style={{ marginRight: "8px" }} />
                    {t('financialReport.downloadReport')}
                  </Button>

                  {userRole !== 0 && (
                    <Button
                      type="button"
                      title={isSubscriptionGateActive() ? SUBSCRIPTION_UPDATE_HINT : undefined}
                      onClick={handleAddTransactionClick}
                      style={{
                        backgroundColor: "var(--accent-solid)",
                        borderColor: "var(--accent-solid)",
                        color: "var(--accent-ink)",
                        height: "44px",
                        borderRadius: "10px",
                        width: "45%",
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                        fontSize: "13px",
                        fontWeight: "600",
                        whiteSpace: "nowrap",
                        margin: 0,
                        opacity: isSubscriptionGateActive() ? 0.5 : 1,
                      }}
                    >
                      <FontAwesomeIcon icon={faPlus} style={{ marginRight: "8px" }} />
                      {t('dashboard.addTransaction')}
                    </Button>
                  )}
                </div>
              )}
            </>
          }
        />
        : null}
      {userRole === 0 && (
        <div
          className="content "
          style={{
            marginBottom: "5px",
            minHeight: "100px",
            paddingInline: 15,
            marginTop: isMobile ? 8 : 80,
          }}
        >
          <Row style={{ marginTop: isMobile ? 8 : 12 }}>
            <Col xs={12}>
              <Card style={{ backgroundColor: "var(--surface-2)" }}>
                <CardHeader>
                  <CardTitle style={{ marginBottom: 0, color: "var(--text-1)" }} tag="h4">
                    {t('dashboard.selectUser')}
                  </CardTitle>
                </CardHeader>
                <CardBody style={{ position: "relative" }}>
                  <LoadingOverlay loading={loadingUsers} text="Loading users..." />
                  <FormGroup>
                    <Label>{t('dashboard.selectUserToView')}</Label>
                    <Select
                      options={userOptions}
                      value={userOptions.find((option) => option.value === selectedUserId)}
                      onChange={handleUserSelect}
                      placeholder="Search or select a user..."
                      isClearable
                      isSearchable
                      styles={{
                        control: (provided, state) => ({
                          ...provided,
                          minHeight: "38px",
                          height: "38px",
                          backgroundColor: "var(--surface-2)",
                          color: "var(--text-1)",
                          borderColor: state.isFocused ? "var(--text-1)" : "var(--text-1)",
                          boxShadow: state.isFocused ? "0 0 0 1px var(--text-1)" : "none",
                          "&:hover": { borderColor: "var(--accent)" },
                        }),
                        valueContainer: (provided) => ({ ...provided, height: "38px", padding: "0 6px" }),
                        input: (provided) => ({ ...provided, margin: "0px", color: "var(--text-1)" }),
                        singleValue: (provided) => ({ ...provided, color: "var(--text-1)" }),
                        placeholder: (provided) => ({ ...provided, color: "var(--text-1)", opacity: 0.7 }),
                        indicatorsContainer: (provided) => ({ ...provided, height: "38px" }),
                        menu: (provided) => ({ ...provided, backgroundColor: "var(--surface-2)", border: "1px solid var(--text-1)" }),
                        menuList: (provided) => ({ ...provided, backgroundColor: "var(--surface-2)" }),
                        option: (provided, state) => ({
                          ...provided,
                          backgroundColor: state.isSelected ? "var(--accent-solid)" : state.isFocused ? "var(--surface-1)" : "var(--surface-2)",
                          color: "var(--text-1)",
                          cursor: "pointer",
                          "&:active": { backgroundColor: "var(--accent-solid)" },
                        }),
                      }}
                    />
                  </FormGroup>
                </CardBody>
              </Card>
            </Col>
          </Row>
        </div>
      )}

      <div className="content" style={{ position: "relative", marginTop: isMobile ? 0 : 80 }}>
        <LoadingOverlay loading={loadingFinancialData} text="Loading financial data..." />


        <div className="dash-overview">
          <div>
            <h2 className="dash-overview__title">
              {(() => {
                const h = new Date().getHours();
                const g =
                  h < 12
                    ? t("dashboard.morning", "Good morning")
                    : h < 18
                      ? t("dashboard.afternoon", "Good afternoon")
                      : t("dashboard.evening", "Good evening");
                const nm = String(localStorage.getItem("user_name") || "").trim().split(" ")[0];
                return nm ? `${g}, ${nm}` : g;
              })()}
            </h2>
                       <p className="dash-overview__sub">
              {t("dashboard.overviewSubtitle", "Here's your financial overview for")}{" "}
              {new Date().toLocaleDateString(undefined, { month: "long", year: "numeric" })}
            </p>
            <QuickScanReceipt />
          </div>
          <span className="dash-overview__meta">
            {t("dashboard.booksCurrent", "Books current")} ·{" "}
            {new Date().toLocaleDateString(undefined, { month: "short", year: "numeric" })}
          </span>
        </div>

        {showDashboardFilters && (
          <div className="dash-filter" style={{ opacity: dashboardFilterDisabled ? 0.5 : 1 }}>
            <div
              className="dash-filter__presets"
              role="group"
              aria-label={t("financialReport.dateRange", "Date range")}
            >
              {[
                { key: "month", label: t("dashboard.presetThisMonth", "This month") },
                { key: "30d", label: t("dashboard.presetLast30", "Last 30 days") },
                { key: "quarter", label: t("dashboard.presetQuarter", "Quarter") },
                { key: "ytd", label: t("dashboard.presetYtd", "YTD") },
              ].map((p) => (
                <button
                  key={p.key}
                  type="button"
                  className={`dash-preset${dashPreset === p.key ? " is-active" : ""}`}
                  onClick={() => applyDashPreset(p.key)}
                  disabled={dashboardFilterDisabled}
                  title={
                    !dashboardFilterDisabled && filterActionsLocked
                      ? SUBSCRIPTION_UPDATE_HINT
                      : undefined
                  }
                >
                  {p.label}
                </button>
              ))}
              <button
                type="button"
                className={`dash-preset dash-preset--custom${
                  dashPreset === "custom" || dashCustomOpen ? " is-active" : ""
                }`}
                aria-expanded={dashCustomOpen}
                onClick={() => applyDashPreset("custom")}
                disabled={dashboardFilterDisabled}
                title={
                  !dashboardFilterDisabled && filterActionsLocked
                    ? SUBSCRIPTION_UPDATE_HINT
                    : undefined
                }
              >
                {t("dashboard.presetCustom", "Custom")}
                <span
                  className={`dash-preset__caret${dashCustomOpen ? " is-open" : ""}`}
                  aria-hidden
                >
                  ▾
                </span>
              </button>
              {(dashPreset || dashboardDateRange) && (
                <button
                  type="button"
                  className="dash-preset dash-preset--clear"
                  onClick={resetDashFilter}
                  disabled={dashboardFilterDisabled}
                >
                  {t("financialReport.clearFilters", "Clear")}
                </button>
              )}

              <div className="dash-filter__search">
                {dashShowSearch ? (
                  <div className="dash-filter__searchbox">
                    <Input
                      type="text"
                      placeholder={t("financialReport.searchJournal")}
                      value={dashboardSearchTerm}
                      onChange={(e) => setDashboardSearchTerm(e.target.value)}
                      onBlur={() => {
                        if (dashboardSearchTerm.trim() === "") setDashShowSearch(false);
                      }}
                      disabled={dashboardFilterDisabled}
                      className="dash-filter__date"
                      style={{ paddingRight: "34px" }}
                      autoFocus
                    />
                    <button
                      type="button"
                      aria-label="Close search"
                      className="dash-filter__searchclose"
                      onClick={() => {
                        setDashboardSearchTerm("");
                        setDashShowSearch(false);
                      }}
                    >
                      ×
                    </button>
                  </div>
                ) : (
                  <button
                    type="button"
                    className="dash-preset dash-preset--icon"
                    aria-label={t("financialReport.searchJournal")}
                    title={
                      !dashboardFilterDisabled && filterActionsLocked
                        ? SUBSCRIPTION_UPDATE_HINT
                        : t("financialReport.searchJournal")
                    }
                    onClick={() => {
                      if (dashboardFilterDisabled) return;
                      if (filterActionsLocked) {
                        navigate(SUBSCRIPTION_ROUTE);
                        return;
                      }
                      setDashShowSearch(true);
                    }}
                    disabled={dashboardFilterDisabled}
                  >
                    <FontAwesomeIcon icon={faSearch} />
                  </button>
                )}
              </div>
            </div>

            {dashCustomOpen && (
              <div className="dash-filter__custom">
                <label className="dash-filter__field">
                  <span className="dash-filter__lbl">{t("financialReport.from")}</span>
                  <Input
                    type="date"
                    value={dashFromDate}
                    onChange={(e) => setDashFromDate(e.target.value)}
                    disabled={dashboardFilterDisabled}
                    className="dash-filter__date"
                  />
                </label>
                <label className="dash-filter__field">
                  <span className="dash-filter__lbl">{t("financialReport.to")}</span>
                  <Input
                    type="date"
                    value={dashToDate}
                    onChange={(e) => setDashToDate(e.target.value)}
                    disabled={dashboardFilterDisabled}
                    className="dash-filter__date"
                  />
                </label>
                <button
                  type="button"
                  className="dash-preset dash-preset--apply"
                  onClick={handleDashboardFilterRun}
                  disabled={dashboardFilterDisabled}
                >
                  {t("financialReport.run", "Apply")}
                </button>
              </div>
            )}
          </div>
        )}

        <Row style={{ marginBottom: "5px", marginTop: 0 }}>
          <Col lg="5" md="12" xs="12" style={{ paddingLeft: "3px", paddingRight: "3px", marginBottom: "4px" }}>
            <Card
              className="card-stats card-stats--hero"
              style={{
                position: "relative",
                ...getBalanceCardStyle(activeMetric.value),
              }}
            >
              <LoadingOverlay loading={loadingFinancialData} text="Loading..." />
              <CardBody className="hero-body">
                <p className="card-category" style={{ marginBottom: "0.5rem" }}>{activeMetric.label}</p>
                <div className="hero-figure">
                  <CardTitle tag="h3" style={{ margin: 0 }}>
                    {loadingFinancialData ? (
                      <Spinner size="sm" />
                    ) : activeMetric.key === "cash" ? (
                      <BalanceValue
                        value={activeMetric.value}
                        tooltip={t("financialReport.cashDeficitTooltip")}
                      >
                        {`$${activeMetric.value.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`}
                      </BalanceValue>
                    ) : (
                      <span style={{ color: activeMetric.color }}>
                        {`$${activeMetric.value.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`}
                      </span>
                    )}
                  </CardTitle>
                  {!loadingFinancialData && (
                    <span className="hero-delta" style={{ color: activeMetric.key === "cash" ? getBalanceColor(activeMetric.value) : activeMetric.color }}>
                      {calculatePercentageChange(activeMetric.value, activeMetric.prev).text}
                    </span>
                  )}
                </div>
                {!loadingFinancialData && (() => {
                  const income = parseFloat(calculateTotalRevenue()) || 0;
                  const outflow = parseFloat(calculateTotalExpenses()) || 0;
                  const total = income + outflow;
                  const inPct = total > 0 ? (income / total) * 100 : 50;
                  const outPct = total > 0 ? (outflow / total) * 100 : 50;
                  const net = income - outflow;
                  const fmt = (n) =>
                    `$${Math.abs(n).toLocaleString(undefined, { maximumFractionDigits: 0 })}`;
                  return (
                    <div className="hero-flow">
                      <div className="hero-flow__row">
                        <span className="hero-flow__lbl">
                          <span className="hero-flow__dot" style={{ background: FINANCIAL_COLORS.positive }} />
                          {t("dashboard.moneyIn", "Money in")}
                        </span>
                        <span className="hero-flow__val">{fmt(income)}</span>
                      </div>
                      <div className="hero-flow__bar">
                        <span style={{ width: `${inPct}%`, background: FINANCIAL_COLORS.positive, opacity: total > 0 ? 1 : 0.28 }} />
                        <span style={{ width: `${outPct}%`, background: FINANCIAL_COLORS.negative, opacity: total > 0 ? 1 : 0.28 }} />
                      </div>
                      <div className="hero-flow__row">
                        <span className="hero-flow__lbl">
                          <span className="hero-flow__dot" style={{ background: FINANCIAL_COLORS.negative }} />
                          {t("dashboard.moneyOut", "Money out")}
                        </span>
                        <span className="hero-flow__val">{fmt(outflow)}</span>
                      </div>
                      <div className="hero-flow__net">
                        <span className="hk">{t("dashboard.netFlow", "Net this period")}</span>
                        <span
                          className="hv"
                          style={{ color: net >= 0 ? FINANCIAL_COLORS.positive : FINANCIAL_COLORS.negative }}
                        >
                          {net < 0 ? "−" : "+"}
                          {fmt(net)}
                        </span>
                      </div>
                    </div>
                  );
                })()}
                {!loadingFinancialData && (
                  <div className="hero-subline">
                    <div>
                      <span className="hk">{t("dashboard.previousMonth", "Prev. month")}</span>
                      <span className="hv">${Number(activeMetric.prev || 0).toLocaleString(undefined, { maximumFractionDigits: 0 })}</span>
                    </div>
                    {activeMetric.key === "cash" && (
                      <div>
                        <span className="hk">{t("dashboard.taxEstimation", "Tax set-aside")}</span>
                        <span className="hv">${(parseFloat(calculateTotalCash()) * 0.3).toLocaleString(undefined, { maximumFractionDigits: 0 })}</span>
                      </div>
                    )}
                  </div>
                )}
              </CardBody>
            </Card>
          </Col>

          <Col lg="7" md="12" xs="12" style={{ paddingLeft: "3px", paddingRight: "3px", marginBottom: "4px" }}>
            <Card className="chart-card" style={{ height: "100%" }}>
              <LoadingOverlay loading={loadingFinancialData} text="Loading chart..." />
              <CardBody style={{ border: "none", display: "flex", flexDirection: "column", height: "100%" }}>
                <div className="dash-panel-head" style={{ marginBottom: 8 }}>
                  <span className="mk-chip mk-chip--sm" style={{ backgroundColor: `${activeMetric.color}26`, color: activeMetric.color }}>
                    <i className={activeMetric.icon} />
                  </span>
                  <div>
                    <span className="chart-card__title" style={{ display: "block", margin: 0 }}>{activeMetric.chartTitle}</span>
                    {!loadingFinancialData && (
                      <span className="chart-card__sub">
                        ${activeMetric.value.toLocaleString(undefined, { maximumFractionDigits: 0 })}
                        {" · "}
                        {calculatePercentageChange(activeMetric.value, activeMetric.prev).text}
                      </span>
                    )}
                  </div>
                </div>
                <div id="cashFlowChart" style={{ flex: 1, minHeight: 0 }}>
                  <ReactApexChart options={activeMetric.chart} series={activeMetric.chart.series} type="area" height={280} />
                </div>
              </CardBody>
            </Card>
          </Col>
        </Row>

        <Row className="no-gutters-x" style={{ marginBottom: "5px" }}>
          {["cash", "revenue", "expenses", "payable"].map((key) => {
            const m = heroMetrics[key];
            const selected = key === heroMetric;
            return (
              <Col key={key} md="3" sm="6" xs="12" style={{ paddingLeft: "3px", paddingRight: "3px", marginBottom: "4px" }}>
                <Card
                  className={`card-stats card-stats--selectable${selected ? " is-selected" : ""}`}
                  style={{
                    position: "relative",
                    cursor: "pointer",
                    "--tile-tint": `${m.color}1f`,
                    "--tile-border": `${m.color}59`,
                    "--tile-ring": m.color,
                  }}
                  onClick={() => setHeroMetric(key)}
                  role="button"
                  tabIndex={0}
                  aria-pressed={selected}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" || e.key === " ") { e.preventDefault(); setHeroMetric(key); }
                  }}
                >
                  <LoadingOverlay loading={loadingFinancialData} text="Loading..." />
                  <CardBody>
                    <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 12 }}>
                      <span className="mk-chip" style={{ backgroundColor: `${m.color}26`, color: m.color }}>
                        <i className={m.icon} />
                      </span>
                      <span className="card-category" style={{ margin: 0 }}>{m.label}</span>
                    </div>
                    <CardTitle tag="h3" style={{ color: "var(--text-1)", margin: 0 }}>
                      {loadingFinancialData ? (
                        <Spinner size="sm" />
                      ) : (
                        `$${m.value.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
                      )}
                    </CardTitle>
                    {!loadingFinancialData && (
                      <div style={{ display: "flex", alignItems: "flex-end", justifyContent: "space-between", gap: 8, marginTop: 6 }}>
                        <span style={{ color: m.color, fontSize: "0.75rem" }}>
                          {calculatePercentageChange(m.value, m.prev).text}
                        </span>
                        <Sparkline id={`sp-tile-${key}`} data={m.spark} color={m.color} />
                      </div>
                    )}
                  </CardBody>
                </Card>
              </Col>
            );
          })}
        </Row>

        {/* Trends grid removed — the switchable overview chart + tile sparklines
            cover every metric's trend (matches the overview design). The chart
            data objects are still used by the hero metric selector above. */}

        {/* Recent activity + status — design concept, added on top of existing features */}
        <Row style={{ marginTop: 12 }}>
          <Col lg="7" style={{ paddingInline: 3, marginBottom: 5 }}>
            <div className="mk-card dash-recent" style={{ position: "relative" }}>
              <LoadingOverlay loading={loadingFinancialData} text="Loading..." />
              <div className="dash-panel-head">
                <span className="mk-chip mk-chip--sm" style={{ backgroundColor: "var(--accent-soft)", color: "var(--accent)" }}>
                  <i className="fas fa-clock" />
                </span>
                <span className="mk-eyebrow">{t("dashboard.recentActivity", "Recent activity")}</span>
                <button type="button" className="dash-viewall" onClick={() => navigate("/customer/financial-report")}>
                  {t("dashboard.viewAll", "View all")} →
                </button>
              </div>
              {(() => {
                const txs = (allTransactions || [])
                  .slice()
                  .sort(
                    (a, b) =>
                      new Date(b.date || b.createdAt || 0) -
                      new Date(a.date || a.createdAt || 0)
                  )
                  .slice(0, 6);
                if (txs.length === 0) {
                  return (
                    <div className="dash-empty">
                      {t("dashboard.noActivity", "No transactions yet.")}
                    </div>
                  );
                }
                return txs.map((tx, i) => {
                  const type = tx.transactionType;
                  const isIncome = type === "Receive";
                  const isExpense = type === "Pay" || type === "New_Item";
                  const amt = Math.abs(parseFloat(tx.transactionAmount) || 0);
                  const when = tx.createdAt || tx.date;
                  const name =
                    tx.transactionPurpose ||
                    tx.title ||
                    tx.description ||
                    t("dashboard.transaction", "Transaction");
                  const rowColor = isIncome
                    ? FINANCIAL_COLORS.positive
                    : isExpense
                      ? FINANCIAL_COLORS.negative
                      : FINANCIAL_COLORS.payable;
                  const sign = isIncome ? "+" : isExpense ? "−" : "";
                  return (
                    <div className="dash-tx" key={tx.id || i}>
                      <span className="dash-tx__cat" style={{ backgroundColor: rowColor }} />
                      <div>
                        <div className="dash-tx__nm">{name}</div>
                        <div className="dash-tx__sub">
                          {when
                            ? new Date(when).toLocaleDateString(undefined, {
                                month: "short",
                                day: "numeric",
                              })
                            : ""}
                          {type ? ` · ${type}` : ""}
                        </div>
                      </div>
                      <span className="dash-tx__amt" style={{ color: rowColor }}>
                        {sign}$
                        {amt.toLocaleString(undefined, {
                          minimumFractionDigits: 2,
                          maximumFractionDigits: 2,
                        })}
                      </span>
                    </div>
                  );
                });
              })()}
            </div>
          </Col>
          <Col lg="5" style={{ paddingInline: 3, marginBottom: 5 }}>
            <div className="mk-card" style={{ position: "relative", marginBottom: 14 }}>
              <div className="dash-panel-head">
                <span className="mk-chip mk-chip--sm" style={{ backgroundColor: "rgba(168,85,247,0.14)", color: FINANCIAL_COLORS.expense }}>
                  <i className="fas fa-chart-pie" />
                </span>
                <span className="mk-eyebrow">{t("dashboard.topExpenses", "Top expenses")}</span>
              </div>
              {(() => {
                const groups = {};
                (allTransactions || []).forEach((tx) => {
                  const isExp =
                    tx.transactionType === "Pay" || tx.transactionType === "New_Item";
                  if (!isExp) return;
                  const key =
                    String(tx.transactionPurpose || "")
                      .replace(/\s*\(Expense\)\s*/i, "")
                      .trim() ||
                    t("dashboard.otherExpense", "Other");
                  groups[key] = (groups[key] || 0) + Math.abs(parseFloat(tx.transactionAmount) || 0);
                });
                const rows = Object.entries(groups)
                  .sort((a, b) => b[1] - a[1])
                  .slice(0, 5);
                if (rows.length === 0) {
                  return (
                    <div className="dash-empty">
                      {t("dashboard.noExpenses", "No expenses yet.")}
                    </div>
                  );
                }
                const totalExp = rows.reduce((s, [, v]) => s + v, 0);
                const expenseColors = ["var(--purple)", "#C084FC", "#8B5CF6", "#7C3AED", "#6D28D9"];
                const donutOptions = {
                  chart: {
                    type: "donut",
                    background: "transparent",
                    fontFamily: "JetBrains Mono, monospace",
                    toolbar: { show: false },
                  },
                  labels: rows.map(([name]) => name),
                  colors: expenseColors,
                  legend: { show: false },
                  dataLabels: { enabled: false },
                  stroke: { width: 2, colors: ["var(--bg)"] },
                  tooltip: {
                    theme: "dark",
                    y: {
                      formatter: (v) =>
                        `$${Number(v).toLocaleString(undefined, { maximumFractionDigits: 0 })}`,
                    },
                  },
                  plotOptions: {
                    pie: {
                      donut: {
                        size: "72%",
                        labels: {
                          show: true,
                          name: { color: "var(--text-2)", fontSize: "11px", offsetY: 2 },
                          value: {
                            color: "var(--text-1)",
                            fontSize: "17px",
                            fontWeight: 700,
                            offsetY: 2,
                            formatter: (v) =>
                              `$${Number(v).toLocaleString(undefined, { maximumFractionDigits: 0 })}`,
                          },
                          total: {
                            show: true,
                            showAlways: true,
                            label: t("dashboard.totalExpenses", "Total"),
                            color: "var(--text-3)",
                            fontSize: "10px",
                            formatter: () =>
                              `$${totalExp.toLocaleString(undefined, { maximumFractionDigits: 0 })}`,
                          },
                        },
                      },
                    },
                  },
                };
                return (
                  <div className="dash-donut">
                    <div className="dash-donut__chart">
                      <ReactApexChart
                        options={donutOptions}
                        series={rows.map(([, v]) => v)}
                        type="donut"
                        height={172}
                      />
                    </div>
                    <ul className="dash-donut__legend">
                      {rows.map(([name, val], i) => (
                        <li key={i}>
                          <span
                            className="dash-donut__dot"
                            style={{ background: expenseColors[i % expenseColors.length] }}
                          />
                          <span className="dash-donut__nm" title={name}>{name}</span>
                          <span className="dash-donut__val">
                            ${val.toLocaleString(undefined, { maximumFractionDigits: 0 })}
                          </span>
                        </li>
                      ))}
                    </ul>
                  </div>
                );
              })()}
            </div>
            <div className="mk-card" style={{ position: "relative" }}>
              <div className="dash-panel-head">
                <span className="mk-chip mk-chip--sm" style={{ backgroundColor: "rgba(0,217,126,0.14)", color: FINANCIAL_COLORS.positive }}>
                  <i className="fas fa-circle-check" />
                </span>
                <span className="mk-eyebrow">{t("dashboard.status", "Status")}</span>
              </div>
              <div className="dash-status__row">
                <span className="dash-status__k">
                  {t("dashboard.totalPayable", "Payable outstanding")}
                </span>
                <span className="mk-badge mk-badge--warn">
                  ${totalPayable.toLocaleString(undefined, { maximumFractionDigits: 0 })}
                </span>
              </div>
              <div className="dash-status__row">
                <span className="dash-status__k">
                  {t("dashboard.taxEstimation", "Tax set-aside")}
                </span>
                <span className="mk-badge mk-badge--info">
                  ${(parseFloat(calculateTotalCash()) * 0.3).toLocaleString(undefined, { maximumFractionDigits: 0 })}
                </span>
              </div>
              <div className="dash-status__row">
                <span className="dash-status__k">
                  {t("dashboard.recordedTransactions", "Recorded transactions")}
                </span>
                <span className="mk-badge mk-badge--ok">
                  {(allTransactions || []).length}
                </span>
              </div>
            </div>
          </Col>
        </Row>
      </div >

      {/* ── Download Report Modal ──────────────────────────────────────────── */}
      < DownloadReportModal
        isOpen={showDownloadReportModal}
        toggle={() => setShowDownloadReportModal(false)
        }
        companyName={companyName}
        items={items || []}
        revenues={revenues}
        expenses={expenses}
        initialBalance={initialBalance}
        initialvalueableItems={initialvalueableItems}
        initialoutstandingDebt={initialoutstandingDebt}
        calculateTotalCash={calculateTotalCash}
        calculateTotalRevenue={calculateTotalRevenue}
        calculateTotalExpenses={calculateTotalExpenses}
        calculateTotalPayable={calculateTotalPayable}
        calculateTotalInventory={calculateTotalInventory}
        searchedDates={dashboardDateRange}
         currentLanguage={i18n.language}
      />
    </>
  );
}

export default Dashboard;