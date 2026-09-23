import React, { useState, useEffect, useRef } from "react";
import { useNavigate } from "react-router-dom";
import {
  Card,
  CardHeader,
  CardBody,
  CardTitle,
  Row,
  Col,
  Input,
  Spinner,
  Button,
  Modal,
  ModalHeader,
  ModalBody,
  FormGroup,
  Label,
  Container,
  ModalFooter,
  Popover,
  PopoverBody,
} from "reactstrap";
import "./mesobfinancial2.css";
import Select from "react-select";
import heic2any from "heic2any";
import imageCompression from "browser-image-compression";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faPlus, faDownload, faCircleInfo, faTimes } from "@fortawesome/free-solid-svg-icons";
import axios from "axios";
import { apiUrl, ROUTES, S3_BUCKET_NAME, normalizeReceiptUrl } from "../config/api";
import { authHeader } from "../utils/apiFetch";
import { Helmet } from "react-helmet";
import NotificationAlert from "react-notification-alert";
import "react-notification-alert/dist/animate.css";
import TransactionTable from "./TransactionTable";
import DownloadReportModal from "components/DownloadReportModal";
import QuickScanReceipt from "components/QuickScanReceipt";
import { setSelectedUser } from "../store/userSlice";
import { useDispatch, useSelector } from "react-redux";
import { Search, Maximize2, Minimize2 } from "lucide-react";
import { FaTimesCircle } from "react-icons/fa";
import { useLocation } from "react-router-dom";
import UserSubscriptionInfo from "./Payment/UserSubscriptionInfo";
import { useTranslation } from "react-i18next";
import i18n from "../i18n";
import { getTranslatedBusinessPurposes, translatePurpose } from "utils/translatedBusinessTypes";
import BalanceValue from "components/BalanceValue";
import {
  FINANCIAL_COLORS,
  getBalanceColor,
  getBalanceCardStyle,
  getNetIncomeColor,
} from "utils/financialColors";

const SUBSCRIPTION_ROUTE = "/customer/subscription";
const SUBSCRIPTION_UPDATE_HINT = "Subscription update needed";
const GAIN_ON_SALE_PREFIX = "Gain on Sale";
const LOSS_ON_SALE_PREFIX = "Loss on Sale";

const isGainOnSalePurpose = (purpose) =>
  typeof purpose === "string" && purpose.startsWith(GAIN_ON_SALE_PREFIX);

const FUEL_VENDOR_KEYWORDS = [
  "shell", "chevron", "exxon", "mobil", "bp", "marathon", "citgo", "sunoco",
  "valero", "pilot", "flying j", "love's", "loves travel", "ta travel",
  "speedway", "circle k", "76 ", "phillips 66", "casey's",
];

/** Best-guess expense category from an OCR-scanned vendor name. Only
 * covers Fuel Expense for Trucking accounts today -- other business
 * types/categories can be added here as needed. */
const guessCategoryFromVendor = (vendor, businessType) => {
  if (!vendor || businessType !== "Trucking") return "";
  const v = vendor.toLowerCase();
  return FUEL_VENDOR_KEYWORDS.some((kw) => v.includes(kw)) ? "Fuel Expense" : "";
};
const isLossOnSalePurpose = (purpose) =>
  typeof purpose === "string" && purpose.startsWith(LOSS_ON_SALE_PREFIX);

const stripBrackets = (text) =>
  (text ?? "")
    .replace(/\s*\([^)]*\)/g, "")
    .replace(/\s*\[[^\]]*\]/g, "")
    .replace(/\s{2,}/g, " ")
    .trim();

const recordAssetSaleGainLoss = (transaction, newRevenues, newExpenses) => {
  const salePrice = parseFloat(transaction.transactionAmount || 0);
  const bookValue = parseFloat(transaction.originalAmount || 0);
  const gain = salePrice - bookValue;
  const name = transaction.assetName || transaction.transactionPurpose || "Asset";
  if (gain > 0) {
    const purpose = `${GAIN_ON_SALE_PREFIX} (${name})`;
    newRevenues[purpose] = (newRevenues[purpose] || 0) + gain;
  } else if (gain < 0) {
    const purpose = `${LOSS_ON_SALE_PREFIX} (${name})`;
    newExpenses[purpose] = (newExpenses[purpose] || 0) + Math.abs(gain);
  }
};

const limitToTwoDecimals = (rawValue) => {
  if (rawValue === "" || rawValue === null || rawValue === undefined) return "";
  const value = String(rawValue);
  const dotIndex = value.indexOf(".");
  if (dotIndex === -1) return value;
  const decimals = value.slice(dotIndex + 1);
  if (decimals.length <= 2) return value;
  return value.slice(0, dotIndex + 3);
};

const AssetTypeLabel = () => {
  const { t } = useTranslation();
  const [infoOpen, setInfoOpen] = useState(false);
  const targetId = React.useId().replace(/:/g, "");
  const toggle = () => setInfoOpen((prev) => !prev);
  const close = () => setInfoOpen(false);

  return (
    <div className="asset-type-label-row" style={{ display: "flex", alignItems: "center", gap: "8px", marginBottom: "0.5rem" }}>
      <Label style={{ marginBottom: 0 }}>{t("financialReport.assetType")}:</Label>
      <button
        type="button"
        id={targetId}
        className="asset-type-info-btn"
        onClick={toggle}
        aria-expanded={infoOpen}
        aria-label={t("financialReport.assetTypeInfoTitle")}
      >
        <FontAwesomeIcon icon={faCircleInfo} />
      </button>
      <Popover
        placement="right"
        isOpen={infoOpen}
        target={targetId}
        toggle={toggle}
        className="asset-type-info-popover"
        fade={false}
      >
        <PopoverBody>
          <button
            type="button"
            className="asset-type-info-close-btn"
            onClick={close}
            aria-label={t("financialReport.close")}
          >
            <FontAwesomeIcon icon={faTimes} />
          </button>
          <div className="asset-type-info-item">
            <strong>{t("financialReport.currentAsset")}</strong>
            <p>{t("financialReport.currentAssetInfo")}</p>
          </div>
          <div className="asset-type-info-item">
            <strong>{t("financialReport.fixedAsset")}</strong>
            <p>{t("financialReport.fixedAssetInfo")}</p>
          </div>
        </PopoverBody>
      </Popover>
    </div>
  );
};

const MesobFinancial2 = () => {
  const location = useLocation();
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selectedTimeRange, setSelectedTimeRange] = useState("all");
  const notificationAlertRef = useRef(null);
  const [showDeleteConfirmation, setShowDeleteConfirmation] = useState(false);
  const [searchedDates, setSearchedDates] = useState(null);
  const [totalCashOnHand, setTotalCashOnHand] = useState(0);
  const [totalExpenses, setTotalExpenses] = useState(0);
  const [showAddTransaction, setShowAddTransaction] = useState(false);
  const [editingTransaction, setEditingTransaction] = useState(null);
  const [editModalOpen, setEditModalOpen] = useState(false);
  const [editType, setEditType] = useState("");
  const [editPurpose, setEditPurpose] = useState("");
  const [editAmount, setEditAmount] = useState("");
  const [savingEdit, setSavingEdit] = useState(false);
  const [transactionType, setTransactionType] = useState("");
  const [transactionPurpose, setTransactionPurpose] = useState("");
  const [transactionAmount, setTransactionAmount] = useState("");
  const [isAddingTransaction, setIsAddingTransaction] = useState(false);
  const [isUpdatingTransaction, setIsUpdatingTransaction] = useState(false);
  const [manualPurpose, setManualPurpose] = useState("");
  const [revenues, setRevenues] = useState({});
  const [expenses, setExpenses] = useState({});
  const [partialPaymentError, setPartialPaymentError] = useState(null);
  const [accountsPayable, setAccountsPayable] = useState({});
  const [paymentMode, setPaymentMode] = useState(null);
  const [unpaidTransactions, setUnpaidTransactions] = useState([]);
  const [users, setUsers] = useState([]);
  const userRole = parseInt(localStorage.getItem("role"));
  const [selectedUnpaidTransaction, setSelectedUnpaidTransaction] = useState(null);
  const [initialBalance, setInitialBalance] = useState(0);
  const [initialvalueableItems, setvalueableItems] = useState(0);
  const [initialoutstandingDebt, setoutstandingDebt] = useState(0);
  const [receipt, setReceipt] = useState(null);
  const fileInputRef = useRef(null);
  const [subType, setsubType] = useState("");
  const [fileContent, setfileContent] = useState(null);
  const [previewModal, setPreviewModal] = useState(false);
  const [selectedReceipt, setSelectedReceipt] = useState(null);
  const [formErrors, setFormErrors] = useState({});
  const navigate = useNavigate();
  const [companyName, setcompanyName] = useState();
  const [searchTerm, setSearchTerm] = useState("");
  const [showSearchInput, setShowSearchInput] = useState(false);
  // Which report card is expanded to fullscreen (null = none).
  const [expandedCard, setExpandedCard] = useState(null);
  useEffect(() => {
    if (!expandedCard) return;
    const onKey = (e) => { if (e.key === "Escape") setExpandedCard(null); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [expandedCard]);
  const [showInstallmentModal, setShowInstallmentModal] = useState(false);
  const [showDownloadReportModal, setShowDownloadReportModal] = useState(false);
  const [installmentAmount, setInstallmentAmount] = useState("");
  const [showInstallmentInput, setShowInstallmentInput] = useState(false);
  const [paymentOption, setPaymentOption] = useState(null);
  const [remainingAmount, setRemainingAmount] = useState(0);
  const [isBreakdownExpanded, setIsBreakdownExpanded] = useState(true);
  const [isRevenueExpanded, setIsRevenueExpanded] = useState(true);
  const [isExpenseExpanded, setIsExpenseExpanded] = useState(true);
  const [isOtherIncomeExpanded, setIsOtherIncomeExpanded] = useState(true);
  const [isOtherExpenseExpanded, setIsOtherExpenseExpanded] = useState(true);
  const [isInventoryExpanded, setIsInventoryExpanded] = useState(true);
  const dispatch = useDispatch();
  const { t } = useTranslation();
  const selectedUser = useSelector((state) => state.selectedUser);
  const [selectedUserId, setSelectedUserId] = useState(null);
  const firstLoadRef = useRef(true);
  const hasShownNotifyRef = useRef(false);
  const [isMobile, setIsMobile] = useState(window.innerWidth < 768);
  // Loading states for different API calls
  const [loadingUsers, setLoadingUsers] = useState(false);
  const [loadingTransactions, setLoadingTransactions] = useState(false);
  const [loadingUnpaidTransactions, setLoadingUnpaidTransactions] = useState(false);
  const [loadingUserInitialBalance, setLoadingUserInitialBalance] = useState(false);
  const [loadingSubscription, setLoadingSubscription] = useState(false);
  const [loadingInstallment, setLoadingInstallment] = useState(false);
  const [loadingReceipt, setLoadingReceipt] = useState(false);
  const [loadingDelete, setLoadingDelete] = useState(false);
  const [loadingDeleteAll, setLoadingDeleteAll] = useState(false);
  const currentLanguage = i18n.language; // already imported at top

  // business types
  const [selectedBusinessType, setSelectedBusinessType] = useState(
    localStorage.getItem("businessType") || ""
  );
  const [incomePurposes, setIncomePurposes] = useState([]);
  const [expensePurposes, setExpensePurposes] = useState([]);
  const [payablePurposes, setPayablePurposes] = useState([]);
  const [manualIncomePurposes, setManualIncomePurposes] = useState([]);
  const [manualExpensePurposes, setManualExpensePurposes] = useState([]);
  const [manualPayablePurposes, setManualPayablePurposes] = useState([]);
  const [newPurpose, setNewPurpose] = useState("");
  const [purposeType, setPurposeType] = useState("income");

  // Subscription
  const [userSubscription, setUserSubscription] = useState(false);
  const [trialEndDate, setTrialEndDate] = useState(null);
  const [scheduleCount, setScheduleCount] = useState(1);
  const [payableSubMode, setPayableSubMode] = useState(null);   // "expense" | "boughtItem"
  const [receiveSubMode, setReceiveSubMode] = useState(null);  // "saleCurrent" | "saleFixed" | "other"
  const [receiveSaleAssetName, setReceiveSaleAssetName] = useState("");
  const [receiveSaleAssetCost, setReceiveSaleAssetCost] = useState(0);  // cost for display/validation
  const [selectedSaleItem, setSelectedSaleItem] = useState(null);  // full transaction object for sale
  const [assetType, setAssetType] = useState("");                // "fixed" | "current"
  const [assetName, setAssetName] = useState("");                // selected or manual name
  const [assetNameManual, setAssetNameManual] = useState("");    // when "Enter manually" for asset
  const [boughtNewItemPurposes, setBoughtNewItemPurposes] = useState([]);
  // Add method to save new purposes
  const handleAddPurpose = () => {
    if (newPurpose.trim()) {
      switch (purposeType) {
        case "income":
          setManualIncomePurposes([...manualIncomePurposes, newPurpose]);
          break;
        case "expense":
          setManualExpensePurposes([...manualExpensePurposes, newPurpose]);
          break;
        case "payable":
          setManualPayablePurposes([...manualPayablePurposes, newPurpose]);
          break;
      }
      setNewPurpose("");
    }
  };

  const getBusinessPurposes = (type) => {
    if (type === "Other") {
      return {
        income: manualIncomePurposes,
        expenses: manualExpensePurposes,
        payables: manualPayablePurposes,
      };
    } else {
      // Use translated business purposes instead of static ones
      return getTranslatedBusinessPurposes(type);
    }
  };
  // Format users for react-select
  const userOptions = users.map((user) => ({
    value: user.id,
    label: user.email,
  }));

  const handleFullPayment = () => {
    handleUpdateTransaction(selectedUnpaidTransaction);
    setShowInstallmentModal(false);
  };

  const handleInstallmentPayment = async () => {
    if (!selectedUnpaidTransaction || !installmentAmount) {
      notify(
        "tr",
        t("financialReport.noUnpaidSelected"),
        "warning"
      );
      return;
    }

    const remainingAmount =
      selectedUnpaidTransaction.remainingAmount ||
      selectedUnpaidTransaction.transactionAmount;

    if (parseFloat(installmentAmount) > remainingAmount) {
      notify(
        "tr",
        t("financialReport.installmentExceedError", { amount: remainingAmount }),
        "warning"
      );
      return;
    }

    setLoadingInstallment(true);
    try {
      const response = await fetch(
        apiUrl(`${ROUTES.TRANSACTION}/${selectedUnpaidTransaction.id}`),
        {
          method: "PUT",
          headers: { "Content-Type": "application/json", ...(await authHeader()) },
          body: JSON.stringify({
            userId: localStorage.getItem("userId"),
            installmentAmount: parseFloat(installmentAmount),
            status:
              parseFloat(installmentAmount) === remainingAmount
                ? "Paid"
                : "Partially Paid",
            transactionType: "Payable",
            transactionPurpose: selectedUnpaidTransaction.transactionPurpose,
            transactionAmount: selectedUnpaidTransaction.transactionAmount,
          }),
        }
      );

      if (!response.ok) {
        const errorData = await response.json();
        console.error("Error response from backend:", errorData);
        throw new Error(errorData.message || "Failed to update transaction");
      }

      const result = await response.json();
      notify("tr", t("financialReport.paymentRecordedInstallment"), "success");

      // Create a new transaction for the installment payment
      const newPaymentResponse = await fetch(
        apiUrl(ROUTES.TRANSACTION),
        {
          method: "POST",
          headers: { "Content-Type": "application/json", ...(await authHeader()) },
          body: JSON.stringify({
            userId: localStorage.getItem("userId"),
            transactionType: "Pay",
            transactionPurpose: `Installment for ${selectedUnpaidTransaction.transactionPurpose}`,
            transactionAmount: parseFloat(installmentAmount),
            status: "Paid",
            payableId: selectedUnpaidTransaction.id,
          }),
        }
      );

      if (!newPaymentResponse.ok) {
        const errorData = await newPaymentResponse.json();
        console.error("Error creating new payment transaction:", errorData);
        throw new Error(
          errorData.message || "Failed to create new payment transaction"
        );
      }

      await fetchTransactions();
      setShowInstallmentModal(false);
      setInstallmentAmount("");
      setSelectedUnpaidTransaction(null);
      setShowInstallmentInput(false);
    } catch (error) {
      console.error("Error processing installment payment:", error);
      notify(
        "tr",
        `Error processing installment payment: ${error.message}`,
        "danger"
      );
    } finally {
      setLoadingInstallment(false);
    }
  };

  const fetchFinancialData = async (userId) => {
    setLoadingTransactions(true);
    try {
      console.log(
        "MesobFinancial2: Fetching financial data for user ID",
        userId
      );
      const response = await axios.get(
        apiUrl(`${ROUTES.TRANSACTION}?userId=${userId}`)
      );
      console.log("MesobFinancial2: Fetched data", response.data);
      setItems(response.data);
    } catch (error) {
      console.error("MesobFinancial2: Error fetching financial data:", error);
    } finally {
      setLoadingTransactions(false);
    }
  };

  // Add receipt handling function
  const handleReceiptClick = (receiptUrl) => {
    if (receiptUrl) {
      handlePreview(receiptUrl);
    } else {
      notify("tr", t("financialReport.noReceipt"), "warning");
    }
  };

  const handlePreview = async (receiptUrl) => {
    try {
      const keyMatch = (receiptUrl || "").match(/amazonaws\.com\/(.+?)(\?|$)/);
      const s3Key = keyMatch ? keyMatch[1] : null;

      if (!s3Key) {
        console.error("❌ Could not extract S3 key from URL:", receiptUrl);
        notify("tr", t("financialReport.noReceipt"), "warning");
        return;
      }

      const res = await fetch(
        apiUrl(`${ROUTES.RECEIPT}/view?key=${encodeURIComponent(s3Key)}`),
        { headers: { ...(await authHeader()) } }
      );
      const data = await res.json();

      if (!res.ok || !data.url) {
        throw new Error(data.error || "Failed to get preview URL");
      }

      setSelectedReceipt({ receiptUrl: data.url, originalUrl: receiptUrl });
      setPreviewModal(true);
    } catch (err) {
      console.error("❌ handlePreview error:", err);
      notify("tr", t("financialReport.noReceipt"), "warning");
    }
  };

  const handleReceiptUpload = async (e) => {
    let file = e.target.files[0];
    if (!file) return;

    try {
      // Check for HEIC file
      if (
        file.type === "image/heic" ||
        file.name.toLowerCase().endsWith(".heic")
      ) {
        const convertedBlob = await heic2any({
          blob: file,
          toType: "image/jpeg",
        });

        file = new File([convertedBlob], `${Date.now()}-converted.jpg`, {
          type: "image/jpeg",
        });
      }

            const reader = new FileReader();
      reader.onload = async (event) => {
        const filecontent = event.target.result.split(",")[1];
        setReceipt(file);
        setfileContent(filecontent);

        try {
          const res = await axios.post(apiUrl(ROUTES.RECEIPT_OCR), {
            imageBase64: filecontent,
          });
          const { vendor, total } = res.data || {};
          const totalNum = total
            ? parseFloat(String(total).replace(/[^0-9.]/g, ""))
            : null;

          if (totalNum && !transactionAmount) {
            setTransactionAmount(String(totalNum));
          }
          const guessedCategory = guessCategoryFromVendor(
            vendor,
            localStorage.getItem("businessType")
          );
          if (guessedCategory && !transactionPurpose) {
            setTransactionPurpose(guessedCategory);
          }
          if (vendor || totalNum) {
            notify(
              "tr",
              `Receipt scanned${vendor ? `: ${vendor}` : ""}${totalNum ? ` — $${totalNum}` : ""}. Please review before saving.`,
              "success"
            );
          }
        } catch (err) {
          console.error("Receipt OCR failed:", err);
        }
      };

      reader.readAsDataURL(file);
    } catch (error) {
      console.error("Error processing file:", error);
      notify(
        "tr",
        t("financialReport.uploadFailed"),
        "danger"
      );
    }
  };

  //fetching users
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
      notify("tr", t("financialReport.errorFetchingUsers"), "danger");
    } finally {
      setLoadingUsers(false);
    }
  };

  const calculateTotals = (transactions) => {
    let cashOnHand = initialBalance || 0;
    let expenses = 0;

    transactions.forEach((transaction) => {
      const amount = parseFloat(transaction.transactionAmount) || 0;
      if (transaction.transactionType === "Receive") {
        cashOnHand += amount;
      } else if (["Pay", "Payable"].includes(transaction.transactionType)) {
        expenses += amount;
      }
    });

    setTotalCashOnHand(cashOnHand);
    setTotalExpenses(expenses);
  };

  const userId = localStorage.getItem("userId");

  const notify = (place, message, type) => {
    notificationAlertRef.current.notificationAlert({
      place,
      message: <div>{message}</div>,
      type,
      icon: "now-ui-icons ui-1_bell-53",
      autoDismiss: 7,
    });
  };

  const handleAddTransaction = async () => {
    const errors = {};

    if (transactionPurpose === "manual" && !manualPurpose.trim()) {
      errors.manualPurpose = "Please enter a purpose manually";
    }

    // Bought new item (Payable or Paid Cash): require asset type and item name
    const isPayableBoughtItem =
      transactionType === "Payable" && payableSubMode === "boughtItem";
    const isPayBoughtItem =
      transactionType === "pay" && paymentMode === "boughtItem";
    if (isPayableBoughtItem || isPayBoughtItem) {
      if (!assetType) {
        errors.assetType = "Please select an asset type";
      }
      const resolvedAssetName =
        assetName === "manual" ? assetNameManual : assetName;
      if (!resolvedAssetName || !resolvedAssetName.trim()) {
        errors.assetName = "Please select or enter an item name";
      }
    }

    if (Object.keys(errors).length > 0) {
      setFormErrors(errors);
      return;
    }

    if (!transactionType || !transactionAmount) {
      notify("tr", t("financialReport.fillFields"), "warning");
      return;
    }
    if (transactionType === "receive" && (receiveSubMode === "saleCurrent" || receiveSubMode === "saleFixed") && !selectedSaleItem) {
      notify("tr", t("financialReport.selectItem") || "Please select an item", "warning");
      return;
    }

    setIsAddingTransaction(true);
    let Url = "";

    if (receipt) {
      Url = await uploadReceipt();
    }

    try {
      const purposeText =
        transactionPurpose === "manual"
          ? (manualPurpose || "").trim()
          : (transactionPurpose || "").trim();
      const resolvedAssetName =
        assetName === "manual" ? (assetNameManual || "").trim() : assetName || null;

      let newTransaction;

      if (transactionType === "receive" && (receiveSubMode === "saleCurrent" || receiveSubMode === "saleFixed")) {
        const cost = selectedSaleItem ? parseFloat(selectedSaleItem.amount) : parseFloat(receiveSaleAssetCost) || 0;
        const assetName = selectedSaleItem ? selectedSaleItem.name : receiveSaleAssetName;
        newTransaction = {
          userId: localStorage.getItem("userId"),
          transactionType: "Receive",
          subType: receiveSubMode === "saleCurrent" ? "sale_inventory" : "sale_fixed",
          transactionPurpose: assetName,
          transactionAmount: parseFloat(transactionAmount),
          originalAmount: cost,
          assetType: receiveSubMode === "saleCurrent" ? "current" : "fixed",
          assetName: assetName,
          soldTransactionId: selectedSaleItem ? selectedSaleItem.id : null,
          receiptUrl: Url || "",
        };
      } else if (isPayableBoughtItem) {
        // Haven't Yet Paid → Bought a new item (payable, not paid)
        newTransaction =
          assetType === "cogs"
            ? {
                // Cost of goods bought on credit — expensed as COGS, not capitalized.
                userId: localStorage.getItem("userId"),
                transactionType: "Payable",
                subType: "COGS",
                status: "Unpaid",
                transactionPurpose: resolvedAssetName || "",
                transactionAmount: parseFloat(transactionAmount),
                originalAmount: parseFloat(transactionAmount),
                remainingAmount: parseFloat(transactionAmount),
                assetName: resolvedAssetName || null,
                receiptUrl: Url || "",
              }
            : {
                userId: localStorage.getItem("userId"),
                transactionType: "Payable",
                subType: "New_Item",
                status: "Unpaid",
                transactionPurpose: resolvedAssetName || "",
                transactionAmount: parseFloat(transactionAmount),
                originalAmount: parseFloat(transactionAmount),
                assetType: assetType || null,
                assetName: resolvedAssetName || null,
                receiptUrl: Url || "",
              };
      } else if (isPayBoughtItem) {
        // Paid Cash → Bought a new item (item name only, no description)
        newTransaction =
          assetType === "cogs"
            ? {
                // Cost of goods paid in cash — expensed as COGS immediately.
                userId: localStorage.getItem("userId"),
                transactionType: "Pay",
                subType: "COGS",
                status: "Paid",
                transactionPurpose: resolvedAssetName || "",
                transactionAmount: parseFloat(transactionAmount),
                originalAmount: parseFloat(transactionAmount),
                assetName: resolvedAssetName || null,
                receiptUrl: Url || "",
              }
            : {
                userId: localStorage.getItem("userId"),
                transactionType: "New_Item",
                subType: "New_Item",
                status: "Paid",
                transactionPurpose: resolvedAssetName || "",
                transactionAmount: parseFloat(transactionAmount),
                originalAmount: parseFloat(transactionAmount),
                assetType: assetType || null,
                assetName: resolvedAssetName || null,
                receiptUrl: Url || "",
              };
      } else {
        // All other cases (receive other income, pay expense, pay recorded, pay bought item, Payable expense)
        newTransaction = {
          userId: localStorage.getItem("userId"),
          transactionType:
            transactionType === "receive"
              ? "Receive"
              : transactionType === "Payable"
                ? "Payable"
                : transactionType === "pay" && paymentMode === "boughtItem"
                  ? "New_Item"
                  : transactionType === "pay" && paymentMode !== "boughtItem"
                    ? "Pay"
                    : "New_Item",
          transactionPurpose: `${transactionPurpose}${manualPurpose ? ` ${manualPurpose}` : ""}`.trim(),
          transactionAmount: parseFloat(transactionAmount),
          originalAmount: parseFloat(transactionAmount),
          subType:
            transactionType === "receive" && receiveSubMode === "other"
              ? undefined
              : transactionType === "Payable" && payableSubMode === "expense"
                ? "Expense"
                : paymentMode === "boughtItem"
                  ? "New_Item"
                  : paymentMode === "new"
                    ? "Expense"
                    : subType,
          receiptUrl: Url || "",
          status: transactionType === "Payable" ? "Unpaid" : "Paid",
        };
      }

      const response = await axios.post(
        apiUrl(ROUTES.TRANSACTION),
        newTransaction
      );

      if (response.status === 200) {
        const successMessage =
          isPayableBoughtItem
            ? t("financialReport.newItemSuccess")
            : transactionType === "pay" && paymentMode === "boughtItem"
              ? t("financialReport.newItemSuccess")
              : t("financialReport.transactionAdded");
        notify("tr", successMessage, "success");
        resetForm();
        fetchTransactions();
        setShowAddTransaction(false);
      }
    } catch (error) {
      console.error("Error adding transaction:", error);
      notify("tr", "Error processing transaction", "danger");
    } finally {
      setIsAddingTransaction(false);
    }
  };

  const resetForm = () => {
    setTransactionType("");
    setTransactionPurpose("");
    setTransactionAmount("");
    setManualPurpose("");
    setsubType("");
    setPayableSubMode(null);
    setReceiveSubMode(null);
    setReceiveSaleAssetName("");
    setReceiveSaleAssetCost(0);
    setSelectedSaleItem(null);
    setAssetType("");
    setAssetName("");
    setAssetNameManual("");
    setEditingTransaction(null);
    setReceipt(null);
    setPaymentMode(null);
    setRemainingAmount(0);
    setSelectedUnpaidTransaction(null);
    if (fileInputRef.current) {
      fileInputRef.current.value = "";
    }
  };

  const uploadReceipt = async () => {
    if (!receipt) {
      notify("tr", "No receipt selected", "warning");
      return;
    }

    setLoadingReceipt(true);
    const maxFileSize = 4.0 * 1024 * 1024;
    const maxPayloadSize = 4.0 * 1024 * 1024; // Also check payload size

    console.log("Original file:", {
      name: receipt.name,
      type: receipt.type,
      sizeMB: (receipt.size / (1024 * 1024)).toFixed(2) + " MB",
    });
    // Notify user if file is large
    const fileSizeMB = receipt.size / (1024 * 1024);
    if (fileSizeMB > 2.0) {
      notify("tr", "Large file detected. Uploading may take a moment...", "info");
    }
    let fileToUpload = receipt;

    // Helper function to convert WEBP to JPEG (better compression than PNG)
    const convertWebpToSupportedFormat = (webpFile) => {
      return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = (e) => {
          const img = new Image();
          img.onload = () => {
            const canvas = document.createElement("canvas");
            canvas.width = img.width;
            canvas.height = img.height;
            const ctx = canvas.getContext("2d");
            ctx.drawImage(img, 0, 0);

            // Use JPEG for better compression
            canvas.toBlob(
              (blob) => {
                if (blob) {
                  const convertedFile = new File(
                    [blob],
                    webpFile.name.replace(/\.webp$/i, ".jpg"),
                    { type: "image/jpeg" }
                  );
                  console.log("WEBP converted to JPEG:", {
                    originalSize: (webpFile.size / (1024 * 1024)).toFixed(2) + " MB",
                    convertedSize: (convertedFile.size / (1024 * 1024)).toFixed(2) + " MB",
                  });
                  resolve(convertedFile);
                } else {
                  reject(new Error("Failed to convert WEBP to JPEG"));
                }
              },
              "image/jpeg",
              0.85 // Lower quality for better compression
            );
          };
          img.onerror = (err) => {
            console.error("Image load error:", err);
            reject(new Error("Failed to load WEBP image"));
          };
          img.src = e.target.result;
        };
        reader.onerror = (err) => {
          console.error("FileReader error:", err);
          reject(new Error("Failed to read WEBP file"));
        };
        reader.readAsDataURL(webpFile);
      });
    };

    // ALWAYS convert WEBP files first, regardless of size
    if (receipt.type === "image/webp") {
      try {
        notify("tr", "Converting WEBP image...", "info");
        console.log("Converting WEBP file to JPEG...");
        fileToUpload = await convertWebpToSupportedFormat(receipt);
        console.log("Converted file:", {
          name: fileToUpload.name,
          type: fileToUpload.type,
          sizeMB: (fileToUpload.size / (1024 * 1024)).toFixed(2) + " MB",
        });
      } catch (err) {
        console.error("WEBP conversion failed:", err);
        notify(
          "tr",
          "Failed to convert WEBP file. Please try a different format.",
          "danger"
        );
        setLoadingReceipt(false);
        return;
      }
    }

    // Compress if file is still too large
    if (fileToUpload.size > maxFileSize && fileToUpload.type.startsWith("image/")) {
      try {
        const options = {
          maxSizeMB: 3.5, // Target 3.5 MB to leave room for payload overhead
          maxWidthOrHeight: 1920,
          useWebWorker: true,
          fileType: fileToUpload.type, // Preserve the converted type
        };

        notify("tr", "Compressing large image before upload...", "info");
        console.log("Compressing image...");

        const compressedFile = await imageCompression(fileToUpload, options);

        console.log("Compressed file:", {
          name: compressedFile.name,
          type: compressedFile.type,
          sizeMB: (compressedFile.size / (1024 * 1024)).toFixed(2) + " MB",
        });

        if (compressedFile.size > maxFileSize) {
          notify(
            "tr",
            "The image is still too large after compression. Please upload a smaller file.",
            "danger"
          );
          setLoadingReceipt(false);
          return;
        }

        fileToUpload = compressedFile;
      } catch (err) {
        console.error("Image compression failed:", err);
        notify(
          "tr",
          "Image compression failed. Please upload a smaller file.",
          "danger"
        );
        setLoadingReceipt(false);
        return;
      }
    } else if (fileToUpload.size > maxFileSize) {
      notify(
        "tr",
        "File larger than 4.0 MB and cannot be compressed.",
        "danger"
      );
      setLoadingReceipt(false);
      return;
    }

    const toBase64 = (file) =>
      new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.readAsDataURL(file);
        reader.onload = () => resolve(reader.result.split(",")[1]);
        reader.onerror = reject;
      });

    let fileContent = await toBase64(fileToUpload);

    // Check payload size and compress further if needed
    let payload = {
      fileName: fileToUpload.name,
      fileType: fileToUpload.type,
      fileContent,
      userId: localStorage.getItem("userId"),
    };

    let payloadSize = JSON.stringify(payload).length;
    let payloadSizeMB = payloadSize / (1024 * 1024);

    console.log(
      "Base64 size (approx MB):",
      ((fileContent.length * 3) / 4 / (1024 * 1024)).toFixed(2)
    );

    console.log(
      "Payload size (MB):",
      payloadSizeMB.toFixed(2)
    );

    // If payload is still too large, compress more aggressively
    if (payloadSize > maxPayloadSize && fileToUpload.type.startsWith("image/")) {
      try {
        notify("tr", "Further compressing to meet size limit...", "info");
        const options = {
          maxSizeMB: 2.5, // More aggressive compression
          maxWidthOrHeight: 1600, // Smaller dimensions
          useWebWorker: true,
          fileType: fileToUpload.type,
        };

        const furtherCompressed = await imageCompression(fileToUpload, options);
        fileToUpload = furtherCompressed;
        fileContent = await toBase64(fileToUpload);

        payload = {
          fileName: fileToUpload.name,
          fileType: fileToUpload.type,
          fileContent,
          userId: localStorage.getItem("userId"),
        };

        payloadSize = JSON.stringify(payload).length;
        payloadSizeMB = payloadSize / (1024 * 1024);

        console.log("After further compression:", {
          fileSize: (fileToUpload.size / (1024 * 1024)).toFixed(2) + " MB",
          payloadSize: payloadSizeMB.toFixed(2) + " MB",
        });

        if (payloadSize > maxPayloadSize) {
          notify(
            "tr",
            "File is too large even after compression. Please use a smaller image.",
            "danger"
          );
          setLoadingReceipt(false);
          return;
        }
      } catch (err) {
        console.error("Further compression failed:", err);
        notify(
          "tr",
          "Unable to compress file to required size. Please use a smaller image.",
          "danger"
        );
        setLoadingReceipt(false);
        return;
      }
    }

    try {
      const response = await fetch(
        apiUrl(ROUTES.RECEIPT),
        {
          method: "POST",
          headers: { "Content-Type": "application/json", ...(await authHeader()) },
          body: JSON.stringify(payload),
        }
      );

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`Server responded ${response.status}: ${errorText}`);
      }

      const data = await response.json();
      notify("tr", "Receipt uploaded successfully", "success");
      setReceipt(null);
      return data.url;
    } catch (error) {
      console.error("Error uploading receipt:", error);
      notify(
        "tr",
        `Failed to upload receipt: ${error.message || "Unknown error"}`,
        "danger"
      );
    } finally {
      setLoadingReceipt(false);
    }
  };

  const handleUpdateTransaction = async (transaction) => {
    console.log("Transaction ID:", transaction.id);
    let Url = "";
    if (receipt) {
      Url = await uploadReceipt();
    }
    const paidAmount =
      paymentOption === "full"
        ? parseFloat(transaction.transactionAmount)
        : parseFloat(remainingAmount);

    setIsUpdatingTransaction(true);
    try {
      if (transaction.id !== "outstanding-debt") {
        // Handle regular payable transactions
        if (paidAmount > remainingAmount && paymentOption !== "full") {
          notify(
            "tr",
            t("financialReport.paymentExceedError", { remainingAmount }),
            "warning"
          );
          return;
        }

        const newRemainingAmount =
          parseFloat(transaction.transactionAmount) - paidAmount;

        const updatedTransaction = {
          ...transaction,
          receiptUrl: Url || transaction.receiptUrl,
          status: newRemainingAmount <= 0 ? "Paid" : "Partially Paid",
          updatedAt: new Date().toISOString(),
          paidAmount: (transaction.paidAmount || 0) + paidAmount,
          transactionAmount: newRemainingAmount,
          remainingAmount: newRemainingAmount,
        };

        const response = await fetch(
          apiUrl(`${ROUTES.TRANSACTION}/${transaction.id}`),
          {
            method: "PUT",
            headers: { "Content-Type": "application/json", ...(await authHeader()) },
            body: JSON.stringify(updatedTransaction),
          }
        );

        if (response.status !== 200) {
          throw new Error("Failed to update the transaction");
        }
      } else {
        // *** FIX: DON'T update user's outstandingDebt field ***
        // The outstanding debt is now calculated dynamically from payments
        console.log(
          "Outstanding debt payment - tracking via transactions only"
        );
      }

      // Create the payment transaction record
      const newPaidTransaction = {
        userId: localStorage.getItem("userId"),
        transactionType: "Pay",
        transactionPurpose:
          transaction.id === "outstanding-debt"
            ? "Payment for Outstanding Debt"
            : paymentOption === "full"
              ? `Full Payment for ${transaction.transactionPurpose}`
              : `Partial Payment for ${transaction.transactionPurpose}`,
        transactionAmount: paidAmount,
        receiptUrl: Url || "",
        payableId: transaction.id,
        createdAt: new Date().toISOString(),
      };

      const response2 = await axios.post(
        apiUrl(ROUTES.TRANSACTION),
        newPaidTransaction
      );

      if (response2.status === 200) {
        notify("tr", t("financialReport.paymentRecorded"), "success");
        fetchTransactions();
        fetchUserInitialBalance();
      } else {
        throw new Error("Failed to add the payment record");
      }
    } catch (error) {
      console.error("Error updating transaction:", error);
      notify("tr", `Error recording payment: ${error.message}`, "danger");
    } finally {
      setIsUpdatingTransaction(false);
      setSelectedUnpaidTransaction(null);
      setPaymentOption(null);
      setShowAddTransaction(false);
      setTransactionAmount("");
      setRemainingAmount(0);
    }
  };

  const filterItemsByTimeRange = (items, range, searchTerm) => {
    if (!range || !range.from || !range.to) {
      return items.filter((item) =>
        item.transactionPurpose.toLowerCase().includes(searchTerm.toLowerCase())
      );
    }

    const fromDate = new Date(range.from);
    fromDate.setHours(0, 0, 0, 0);

    const toDate = new Date(range.to);
    toDate.setHours(23, 59, 59, 999);

    return items.filter((item) => {
      const itemDate = new Date(item.createdAt);
      return (
        itemDate >= fromDate &&
        itemDate <= toDate &&
        item.transactionPurpose.toLowerCase().includes(searchTerm.toLowerCase())
      );
    });
  };

  const fetchUserInitialBalance = async (uid = null) => {
    setLoadingUserInitialBalance(true);
    try {
      const targetUserId = uid || localStorage.getItem("userId");
      const response = await axios.get(
        apiUrl(`${ROUTES.USERS}/${targetUserId}`)
      );
      if (response.data?.user) {
        if (response.data.user.businessType) {
          const bizType = response.data.user.businessType || "";
          setSelectedBusinessType(bizType);
          localStorage.setItem("businessType", bizType);
        }
        if (response.data.user.cashBalance) {
          setInitialBalance(parseFloat(response.data.user.cashBalance));
        }
        if (response.data.user.valueableItems) {
          setvalueableItems(parseFloat(response.data.user.valueableItems));
        }
        if (typeof response.data.user.companyName === "string") {
          setcompanyName(response.data.user.companyName);
        } else {
          setcompanyName("");
        }
        if (response.data.user.outstandingDebt) {
          setoutstandingDebt(parseFloat(response.data.user.outstandingDebt));
        }
      } else {
        setcompanyName("");
        console.warn("User data not found in user object:", response.data);
      }
    } catch (error) {
      console.error("Error fetching user data:", error);
      notify("tr", t("financialReport.errorInitialBalance"), "danger");
    } finally {
      setLoadingUserInitialBalance(false);
    }
  };

  // Prevent mouse wheel from incrementing/decrementing focused number inputs
  useEffect(() => {
    const handleWheel = (e) => {
      const { activeElement } = document;
      if (
        activeElement?.tagName === "INPUT" &&
        activeElement.type === "number"
      ) {
        e.preventDefault();
      }
    };
    document.addEventListener("wheel", handleWheel, { passive: false });
    return () => document.removeEventListener("wheel", handleWheel);
  }, []);

  useEffect(() => {
    console.log("Selected Business Type: ????", selectedBusinessType);
    const purposes = getBusinessPurposes(selectedBusinessType);
    console.log("Business Purposes:", purposes);
    setIncomePurposes(purposes.income || []);
    setExpensePurposes(purposes.expenses || []);
    setPayablePurposes(purposes.payables || []);
    setBoughtNewItemPurposes(purposes.boughtNewItemPurposes || []);
  }, [selectedBusinessType, i18n.language]); // ← ADD i18n.language dependency

  useEffect(() => {
    const savedIncome = JSON.parse(
      localStorage.getItem("manualIncome") || "[]"
    );
    const savedExpense = JSON.parse(
      localStorage.getItem("manualExpense") || "[]"
    );
    const savedPayable = JSON.parse(
      localStorage.getItem("manualPayable") || "[]"
    );

    setManualIncomePurposes(savedIncome);
    setManualExpensePurposes(savedExpense);
    setManualPayablePurposes(savedPayable);
  }, []);

  useEffect(() => {
    if (selectedBusinessType === "Other") {
      localStorage.setItem(
        "manualIncome",
        JSON.stringify(manualIncomePurposes)
      );
      localStorage.setItem(
        "manualExpense",
        JSON.stringify(manualExpensePurposes)
      );
      localStorage.setItem(
        "manualPayable",
        JSON.stringify(manualPayablePurposes)
      );
    }
  }, [manualIncomePurposes, manualExpensePurposes, manualPayablePurposes]);

  useEffect(() => {
    if (userRole === 0) {
      fetchUsers();
    } else {
      const initializeData = async () => {
        try {
          await fetchUserInitialBalance();
          await fetchTransactions();
        } catch (error) {
          console.error("Error initializing data:", error);
          notify("tr", "Error loading initial data", "danger");
        }
      };
      initializeData();
    }
  }, [userRole]);

  useEffect(() => {
    if (items && items.length > 0) {
      calculateFinancials(items);
    }
  }, [items]);

  useEffect(() => {
    if (showAddTransaction && transactionType === "pay") {
      fetchUnpaidTransactions();
    }
  }, [showAddTransaction, transactionType]);

  useEffect(() => {
    if (location.state?.openTransactionModal) {
      setShowAddTransaction(true);
      navigate(location.pathname, { replace: true });
    }
  }, [location.state, navigate]);

  // Subscriptions
  useEffect(() => {
    const fetchUserSubscriptionData = async () => {
      setLoadingSubscription(true);
      try {
        const userId = localStorage.getItem("userId");
        const response = await axios.get(
          apiUrl(`${ROUTES.USERS}/${userId}`)
        );

        if (response.data?.user) {
          const userData = response.data.user;
          console.log("Full userData=>>> ", userData);
          setUserSubscription(userData?.subscription || false);
          console.log("subscription=>>> ", userData?.subscription);
          setTrialEndDate(new Date(userData?.trialEndDate));
          console.log("trialEndDate=>>> ", userData?.trialEndDate);
          setScheduleCount(userData?.scheduleCount || 1);
        }
      } catch (error) {
        console.error("Error fetching user subscription data:", error);
      } finally {
        setLoadingSubscription(false);
      }
    };

    fetchUserSubscriptionData();
  }, []);

  const isTrialActive = () =>
    Boolean(trialEndDate) &&
    new Date() < trialEndDate &&
    scheduleCount < 4;

  const isSubscriptionGateActive = () =>
    userRole !== 1 && !userSubscription && !isTrialActive();

  const calculateFinancials = (transactions) => {
    const newRevenues = {};
    const newExpenses = {};
    const newAccountsPayable = {};

    const filteredTransactions = getFilteredItems();

    filteredTransactions.forEach((transaction) => {
      const amount = parseFloat(transaction.transactionAmount) || 0;

      if (transaction.transactionType === "Receive") {
        // Fixed-asset disposals book only their gain/loss (Other Income/Expense).
        if (transaction.subType === "sale_fixed") {
          recordAssetSaleGainLoss(transaction, newRevenues, newExpenses);
          return;
        }
        // Ordinary sales AND inventory sales are gross operating revenue; the cost
        // of inventory sold is recognized separately as COGS (calculateCOGS).
        const purpose = transaction.transactionPurpose;
        newRevenues[purpose] = (newRevenues[purpose] || 0) + amount;
      } else if (
        transaction.transactionType === "Pay" ||
        transaction.transactionType === "Payable"
      ) {
        const purpose = transaction.transactionPurpose;

        // Exclude Payable+New_Item (asset purchases on credit) from expenses
        const isPayableNewItem = transaction.transactionType === "Payable" && transaction.subType === "New_Item";

        // Exclude Pay transactions that are payments for New_Item Payables (asset purchases)
        let isPaymentForNewItem = false;
        if (transaction.transactionType === "Pay" && transaction.payableId && transaction.payableId !== "outstanding-debt") {
          const originalPayable = items.find(item => item.id === transaction.payableId);
          if (originalPayable && originalPayable.subType === "New_Item") {
            isPaymentForNewItem = true;
          }
        }

        if (
          transaction.payableId !== "outstanding-debt" &&
          !purpose.includes("Outstanding Debt") &&
          !isPayableNewItem &&
          !isPaymentForNewItem &&
          transaction.subType !== "COGS"
        ) {
          // COGS-tagged purchases are shown under Cost of Goods Sold, not in the
          // Operating Expenses detail — keep them out of the expenses map.
          newExpenses[purpose] = (newExpenses[purpose] || 0) + amount;
        }

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

  // Get individual current asset transactions (not grouped) for the dropdown
  const getCurrentAssetItems = () => {
    const result = [];
    const soldIds = new Set();

    // Track which transactions have been sold
    items.forEach((t) => {
      if (t.transactionType === "Receive" && t.subType === "sale_inventory" && t.soldTransactionId) {
        soldIds.add(t.soldTransactionId);
      }
    });

    items.forEach((t) => {
      // Skip if already sold
      if (soldIds.has(t.id)) return;

      // Explicit current assets with assetName
      const isNewItemCurrent = t.transactionType === "New_Item" && t.assetType === "current" && t.assetName;
      const isPayableCurrent = t.transactionType === "Payable" && t.assetType === "current" && t.subType === "New_Item" && t.assetName;
      // Include New_Item without assetType (default to current assets / inventory)
      const isNewItemDefault = t.transactionType === "New_Item" && !t.assetType && t.assetName;

      if (isNewItemCurrent || isPayableCurrent || isNewItemDefault) {
        // Use originalAmount for Payable (transactionAmount changes after payment)
        const amount = t.transactionType === "Payable"
          ? parseFloat(t.originalAmount || t.transactionAmount || 0)
          : parseFloat(t.transactionAmount || 0);
        result.push({
          id: t.id,
          name: t.assetName,
          amount: amount,
          purpose: t.transactionPurpose,
          displayName: `${t.assetName} - $${amount.toFixed(2)}`
        });
      }

      // Fallback: Payable+New_Item without assetType OR with assetType not fixed (default to current)
      const isPayableDefaultCurrent = t.transactionType === "Payable" &&
        t.subType === "New_Item" &&
        t.assetType !== "fixed" &&
        !t.assetName &&
        t.transactionPurpose;
      if (isPayableDefaultCurrent) {
        const amount = parseFloat(t.originalAmount || t.transactionAmount || 0);
        result.push({
          id: t.id,
          name: t.transactionPurpose,
          amount: amount,
          purpose: t.transactionPurpose,
          displayName: `${t.transactionPurpose} - $${amount.toFixed(2)}`
        });
      }
    });

    return result;
  };

  const getFixedAssetItems = () => {
    const result = [];
    const soldIds = new Set();

    // Track which transactions have been sold
    items.forEach((t) => {
      if (t.transactionType === "Receive" && t.subType === "sale_fixed" && t.soldTransactionId) {
        soldIds.add(t.soldTransactionId);
      }
    });

    items.forEach((t) => {
      // Skip if already sold
      if (soldIds.has(t.id)) return;

      // Explicit fixed assets with assetName
      const isNewItemFixed = t.transactionType === "New_Item" && t.assetType === "fixed" && t.assetName;
      const isPayableFixed = t.transactionType === "Payable" && t.assetType === "fixed" && t.subType === "New_Item" && t.assetName;

      if (isNewItemFixed || isPayableFixed) {
        // Use originalAmount for Payable (transactionAmount changes after payment)
        const amount = t.transactionType === "Payable"
          ? parseFloat(t.originalAmount || t.transactionAmount || 0)
          : parseFloat(t.transactionAmount || 0);
        result.push({
          id: t.id,
          name: t.assetName,
          amount: amount,
          purpose: t.transactionPurpose,
          displayName: `${t.assetName} - $${amount.toFixed(2)}`
        });
      }

      // Fallback: ANY Payable with subType New_Item without assetType but with fixed-asset related purpose
      const isFixedPayable = t.transactionType === "Payable" &&
        t.subType === "New_Item" &&
        !t.assetType &&
        t.transactionPurpose &&
        (t.transactionPurpose.toLowerCase().includes("equipment") ||
          t.transactionPurpose.toLowerCase().includes("vehicle") ||
          t.transactionPurpose.toLowerCase().includes("truck") ||
          t.transactionPurpose.toLowerCase().includes("machine") ||
          t.transactionPurpose.toLowerCase().includes("furniture") ||
          t.transactionPurpose.toLowerCase().includes("computer") ||
          t.transactionPurpose.toLowerCase().includes("fixed"));
      if (isFixedPayable) {
        const amount = parseFloat(t.originalAmount || t.transactionAmount || 0);
        result.push({
          id: t.id,
          name: t.transactionPurpose,
          amount: amount,
          purpose: t.transactionPurpose,
          displayName: `${t.transactionPurpose} - $${amount.toFixed(2)}`
        });
      }
    });

    return result;
  };

  // Remaining cost (book value) for an asset after subtracting sales (uses ALL items, not time-filtered)
  const getAssetCost = (name, type) => {
    let cost = 0;

    // Add purchases - check by assetName first, then by transactionPurpose for backward compatibility
    items.forEach((t) => {
      const matchesAssetName = t.assetName === name && t.assetType === type;
      const matchesPurpose = !t.assetType && t.transactionPurpose === name && t.transactionType === "Payable";

      if ((t.transactionType === "New_Item" || t.transactionType === "Payable") && (matchesAssetName || matchesPurpose)) {
        // Use originalAmount for Payable (transactionAmount changes after payment)
        const amount = t.transactionType === "Payable"
          ? parseFloat(t.originalAmount || t.transactionAmount || 0)
          : parseFloat(t.transactionAmount || 0);
        cost += amount;
      }
    });

    // Subtract sales
    const subType = type === "current" ? "sale_inventory" : "sale_fixed";
    items.forEach((t) => {
      if (t.transactionType === "Receive" && t.subType === subType && t.assetName === name) {
        cost -= parseFloat(t.originalAmount || 0);
      }
    });

    return Math.max(0, cost);
  };

  // Other income / expense are now DISPOSAL gains/losses on FIXED assets only.
  // Inventory (current-asset) sales are booked GROSS instead: full sale price in
  // operating revenue, book value (cost) in COGS — so the income statement shows
  // real Revenue / COGS / Gross Profit for merchandisers. Net income is unchanged
  // either way (gain = sale price − cost).
  const calculateOtherIncome = () => {
    const filteredItems = getFilteredItems();
    const total = filteredItems.reduce((sum, value) => {
      if (value.transactionType === "Receive" && value.subType === "sale_fixed") {
        const gain =
          parseFloat(value.transactionAmount || 0) -
          parseFloat(value.originalAmount || 0);
        if (gain > 0) return sum + gain;
      }
      return sum;
    }, 0);
    return total.toFixed(2);
  };

  const calculateOtherExpense = () => {
    const filteredItems = getFilteredItems();
    const total = filteredItems.reduce((sum, value) => {
      if (value.transactionType === "Receive" && value.subType === "sale_fixed") {
        const gain =
          parseFloat(value.transactionAmount || 0) -
          parseFloat(value.originalAmount || 0);
        if (gain < 0) return sum + Math.abs(gain);
      }
      return sum;
    }, 0);
    return total.toFixed(2);
  };

  const calculateOperatingRevenue = () => {
    const filteredItems = getFilteredItems();
    const total = filteredItems.reduce((sum, value) => {
      if (value.transactionType === "Receive") {
        // Fixed-asset disposals are not revenue (only their gain/loss is booked).
        if (value.subType === "sale_fixed") return sum;
        // Everything else — ordinary sales AND inventory sales — is gross revenue.
        return sum + parseFloat(value.transactionAmount || 0);
      }
      return sum;
    }, 0);
    return total.toFixed(2);
  };

  // Is this a Pay/unpaid-Payable that counts as an outflow on the P&L?
  // (excludes outstanding-debt settlement and asset purchases on credit/cash)
  const isCountableOutflow = (value) => {
    const isPayableNewItem =
      value.transactionType === "Payable" && value.subType === "New_Item";
    let isPaymentForNewItem = false;
    if (
      value.transactionType === "Pay" &&
      value.payableId &&
      value.payableId !== "outstanding-debt"
    ) {
      const originalPayable = items.find((item) => item.id === value.payableId);
      if (originalPayable && originalPayable.subType === "New_Item") {
        isPaymentForNewItem = true;
      }
    }
    return (
      (value.transactionType === "Pay" ||
        (value.transactionType === "Payable" && value.status !== "Paid")) &&
      value.payableId !== "outstanding-debt" &&
      !value.transactionPurpose.includes("Outstanding Debt") &&
      !isPayableNewItem &&
      !isPaymentForNewItem
    );
  };

  // Amount a Payable contributes: its REMAINING balance (installment Pay records
  // supply the paid portion, so remaining + payments = the original once). Pays
  // contribute their own amount. Mirrors the installment double-count fix.
  const outflowAmount = (value) =>
    value.transactionType === "Payable"
      ? parseFloat(
          value.remainingAmount != null
            ? value.remainingAmount
            : value.transactionAmount || 0
        ) || 0
      : parseFloat(value.transactionAmount || 0);

  // Cost of Goods Sold = book value (cost) of inventory sold + purchases the user
  // chose to expense at entry as cost-of-goods (subType "COGS").
  const calculateCOGS = () => {
    const filteredItems = getFilteredItems();
    const soldInventoryCost = filteredItems.reduce((sum, value) => {
      if (value.transactionType === "Receive" && value.subType === "sale_inventory") {
        return sum + parseFloat(value.originalAmount || 0);
      }
      return sum;
    }, 0);
    const directCogs = filteredItems.reduce((sum, value) => {
      if (value.subType === "COGS" && isCountableOutflow(value)) {
        return sum + outflowAmount(value);
      }
      return sum;
    }, 0);
    return (soldInventoryCost + directCogs).toFixed(2);
  };

  const calculateGrossProfit = () => {
    return (
      parseFloat(calculateOperatingRevenue()) - parseFloat(calculateCOGS())
    ).toFixed(2);
  };

  // Operating expenses = countable outflows that are NOT cost-of-goods and NOT
  // asset purchases. (Fixed-asset disposal losses live in Other Expense.)
  const calculateOperatingExpenses = () => {
    const filteredItems = getFilteredItems();
    const total = filteredItems.reduce((sum, value) => {
      if (value.subType !== "COGS" && isCountableOutflow(value)) {
        return sum + outflowAmount(value);
      }
      return sum;
    }, 0);
    return total.toFixed(2);
  };

  const calculateTotalRevenue = () => {
    return (
      parseFloat(calculateOperatingRevenue()) + parseFloat(calculateOtherIncome())
    ).toFixed(2);
  };

  const renderIncomeStatementRows = () => (
    <>
      <tr
        onClick={() => setIsRevenueExpanded(!isRevenueExpanded)}
        style={{ cursor: "pointer" }}
      >
        <td style={{ padding: "8px", border: "1px solid var(--border)", color: "var(--text-1)" }}>
          <strong>
            {t("financialReport.revenue")} {isRevenueExpanded ? "▼" : "▶"}
          </strong>
        </td>
        <td style={{ padding: "8px", border: "1px solid var(--border)", color: "var(--text-1)" }}></td>
      </tr>

      {isRevenueExpanded &&
        Object.entries(revenues)
          .filter(([purpose]) => {
            if (isGainOnSalePurpose(purpose)) return false;
            const filteredItems = getFilteredItems();
            return filteredItems.some(
              (item) =>
                item.transactionPurpose === purpose &&
                item.transactionType === "Receive" &&
                item.subType !== "sale_fixed"
            );
          })
          .map(([purpose]) => {
            const filteredItems = getFilteredItems();
            const totalAmount = filteredItems.reduce((sum, item) => {
              if (
                item.transactionPurpose === purpose &&
                item.transactionType === "Receive" &&
                item.subType !== "sale_fixed"
              ) {
                return sum + parseFloat(item.transactionAmount || 0);
              }
              return sum;
            }, 0);

            return (
              <tr key={`revenue-${purpose}`}>
                <td style={{ padding: "8px", border: "1px solid var(--border)", color: "var(--text-1)" }}>
                  {translatePurpose(purpose)}
                </td>
                <td
                  style={{
                    color: "var(--text-1)",
                    padding: "8px",
                    border: "1px solid var(--border)",
                    textAlign: "right",
                  }}
                >
                  $
                  {totalAmount.toLocaleString("en-US", {
                    minimumFractionDigits: 2,
                    maximumFractionDigits: 2,
                  })}
                </td>
              </tr>
            );
          })}

      <tr>
        <td
          style={{
            padding: "8px",
            border: "1px solid var(--border)",
            color: "var(--text-1)",
            fontWeight: "bold",
          }}
        >
          <strong>{t("financialReport.totalRevenue")}</strong>
        </td>
        <td
          style={{
            color: FINANCIAL_COLORS.income,
            fontWeight: "bold",
            padding: "8px",
            border: "1px solid var(--border)",
            textAlign: "right",
          }}
        >
          $
          {parseFloat(calculateOperatingRevenue()).toLocaleString("en-US", {
            minimumFractionDigits: 2,
            maximumFractionDigits: 2,
          })}
        </td>
      </tr>

      {parseFloat(calculateCOGS()) > 0 && (
        <>
          <tr>
            <td style={{ padding: "8px", border: "1px solid var(--border)", color: "var(--text-1)", fontWeight: "bold" }}>
              <strong>{t("financialReport.costOfGoodsSold")}</strong>
            </td>
            <td style={{ color: FINANCIAL_COLORS.expense, fontWeight: "bold", padding: "8px", border: "1px solid var(--border)", textAlign: "right" }}>
              $
              {parseFloat(calculateCOGS()).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
            </td>
          </tr>
          <tr>
            <td style={{ padding: "8px", border: "1px solid var(--border)", color: "var(--text-1)", fontWeight: "bold" }}>
              <strong>
                {parseFloat(calculateGrossProfit()) < 0
                  ? t("financialReport.grossLoss")
                  : t("financialReport.grossProfit")}
              </strong>
            </td>
            <td style={{ color: getNetIncomeColor(parseFloat(calculateGrossProfit())), fontWeight: "bold", padding: "8px", border: "1px solid var(--border)", textAlign: "right" }}>
              $
              {parseFloat(calculateGrossProfit()).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
            </td>
          </tr>
        </>
      )}

      <tr
        onClick={() => setIsOtherIncomeExpanded(!isOtherIncomeExpanded)}
        style={{ cursor: "pointer" }}
      >
        <td style={{ padding: "8px", border: "1px solid var(--border)", color: "var(--text-1)" }}>
          <strong>
            {t("businessTypes.income.otherIncome")}{" "}
            {isOtherIncomeExpanded ? "▼" : "▶"}
          </strong>
        </td>
        <td style={{ padding: "8px", border: "1px solid var(--border)", color: "var(--text-1)" }}></td>
      </tr>

      {isOtherIncomeExpanded &&
        Object.entries(revenues)
          .filter(([purpose]) => isGainOnSalePurpose(purpose))
          .map(([purpose, amount]) => (
            <tr key={`other-income-${purpose}`}>
              <td style={{ padding: "8px", border: "1px solid var(--border)", color: "var(--text-1)" }}>
                {translatePurpose(purpose)}
              </td>
              <td
                style={{
                  color: FINANCIAL_COLORS.income,
                  padding: "8px",
                  border: "1px solid var(--border)",
                  textAlign: "right",
                }}
              >
                $
                {parseFloat(amount || 0).toLocaleString("en-US", {
                  minimumFractionDigits: 2,
                  maximumFractionDigits: 2,
                })}
              </td>
            </tr>
          ))}

      <tr>
        <td
          style={{
            padding: "8px",
            border: "1px solid var(--border)",
            color: "var(--text-1)",
            fontWeight: "bold",
          }}
        >
          <strong>{t("financialReport.totalOtherIncome")}</strong>
        </td>
        <td
          style={{
            color: FINANCIAL_COLORS.income,
            fontWeight: "bold",
            padding: "8px",
            border: "1px solid var(--border)",
            textAlign: "right",
          }}
        >
          $
          {parseFloat(calculateOtherIncome()).toLocaleString("en-US", {
            minimumFractionDigits: 2,
            maximumFractionDigits: 2,
          })}
        </td>
      </tr>

      <tr
        onClick={() => setIsExpenseExpanded(!isExpenseExpanded)}
        style={{ cursor: "pointer" }}
      >
        <td style={{ padding: "8px", border: "1px solid var(--border)", color: "var(--text-1)" }}>
          <strong>
            {t("financialReport.expenses")} {isExpenseExpanded ? "▼" : "▶"}
          </strong>
        </td>
        <td style={{ padding: "8px", border: "1px solid var(--border)", color: "var(--text-1)" }}></td>
      </tr>

      {isExpenseExpanded &&
        Object.entries(expenses)
          .filter(([purpose]) => {
            if (isLossOnSalePurpose(purpose)) return false;
            const filteredItems = getFilteredItems();
            return filteredItems.some(
              (item) =>
                item.transactionPurpose === purpose &&
                (item.transactionType === "Pay" ||
                  (item.transactionType === "Payable" && item.status !== "Paid"))
            );
          })
          .map(([purpose]) => {
            const filteredItems = getFilteredItems();
            const totalAmount = filteredItems.reduce((sum, item) => {
              if (
                item.transactionPurpose === purpose &&
                (item.transactionType === "Pay" ||
                  (item.transactionType === "Payable" && item.status !== "Paid"))
              ) {
                return sum + parseFloat(item.transactionAmount || 0);
              }
              return sum;
            }, 0);

            return (
              <tr key={`expense-${purpose}`}>
                <td style={{ padding: "8px", border: "1px solid var(--border)", color: "var(--text-1)" }}>
                  {translatePurpose(purpose)}
                </td>
                <td
                  style={{
                    color: FINANCIAL_COLORS.expense,
                    padding: "8px",
                    border: "1px solid var(--border)",
                    textAlign: "right",
                  }}
                >
                  $
                  {totalAmount.toLocaleString("en-US", {
                    minimumFractionDigits: 2,
                    maximumFractionDigits: 2,
                  })}
                </td>
              </tr>
            );
          })}

      <tr>
        <td
          style={{
            padding: "8px",
            border: "1px solid var(--border)",
            color: FINANCIAL_COLORS.expense,
            fontWeight: "bold",
          }}
        >
          <strong>{t("financialReport.operatingExpenses")}</strong>
        </td>
        <td
          style={{
            color: FINANCIAL_COLORS.expense,
            fontWeight: "bold",
            padding: "8px",
            border: "1px solid var(--border)",
            textAlign: "right",
          }}
        >
          $
          {parseFloat(calculateOperatingExpenses()).toLocaleString("en-US", {
            minimumFractionDigits: 2,
            maximumFractionDigits: 2,
          })}
        </td>
      </tr>

      <tr
        onClick={() => setIsOtherExpenseExpanded(!isOtherExpenseExpanded)}
        style={{ cursor: "pointer" }}
      >
        <td style={{ padding: "8px", border: "1px solid var(--border)", color: "var(--text-1)" }}>
          <strong>
            {t("financialReport.otherExpense")}{" "}
            {isOtherExpenseExpanded ? "▼" : "▶"}
          </strong>
        </td>
        <td style={{ padding: "8px", border: "1px solid var(--border)", color: "var(--text-1)" }}></td>
      </tr>

      {isOtherExpenseExpanded &&
        Object.entries(expenses)
          .filter(([purpose]) => isLossOnSalePurpose(purpose))
          .map(([purpose, amount]) => (
            <tr key={`other-expense-${purpose}`}>
              <td style={{ padding: "8px", border: "1px solid var(--border)", color: "var(--text-1)" }}>
                {translatePurpose(purpose)}
              </td>
              <td
                style={{
                  color: FINANCIAL_COLORS.loss,
                  padding: "8px",
                  border: "1px solid var(--border)",
                  textAlign: "right",
                }}
              >
                $
                {parseFloat(amount || 0).toLocaleString("en-US", {
                  minimumFractionDigits: 2,
                  maximumFractionDigits: 2,
                })}
              </td>
            </tr>
          ))}

      <tr>
        <td
          style={{
            padding: "8px",
            border: "1px solid var(--border)",
            color: FINANCIAL_COLORS.loss,
            fontWeight: "bold",
          }}
        >
          <strong>{t("financialReport.totalOtherExpense")}</strong>
        </td>
        <td
          style={{
            color: FINANCIAL_COLORS.loss,
            fontWeight: "bold",
            padding: "8px",
            border: "1px solid var(--border)",
            textAlign: "right",
          }}
        >
          $
          {parseFloat(calculateOtherExpense()).toLocaleString("en-US", {
            minimumFractionDigits: 2,
            maximumFractionDigits: 2,
          })}
        </td>
      </tr>

      <tr>
        <td style={{ padding: "8px", border: "1px solid var(--border)", color: "var(--text-1)" }}>
          <strong>
            {parseFloat(calculateTotalRevenue()) - parseFloat(calculateTotalExpenses()) < 0
              ? t("financialReport.netLoss")
              : t("financialReport.netIncome")}
          </strong>
        </td>
        <td
          style={{
            color: getNetIncomeColor(
              parseFloat(calculateTotalRevenue()) - parseFloat(calculateTotalExpenses())
            ),
            fontWeight: "bold",
            padding: "8px",
            border: "1px solid var(--border)",
            textAlign: "right",
          }}
        >
          $
          {(
            parseFloat(calculateTotalRevenue()) - parseFloat(calculateTotalExpenses())
          ).toLocaleString("en-US", {
            minimumFractionDigits: 2,
            maximumFractionDigits: 2,
          })}
        </td>
      </tr>
    </>
  );

  const calculateTotalInventory = () => {
    const valueableItems = initialvalueableItems || 0;
    const filteredItems = getFilteredItems();

    const newItemsTotal = filteredItems.reduce((sum, item) => {
      // New_Item transactions with current asset type
      const isNewItemCurrent = item.transactionType === "New_Item" && item.assetType === "current";
      // Payable with current asset type and subType New_Item
      const isPayableCurrent = item.transactionType === "Payable" && item.assetType === "current" && item.subType === "New_Item";
      // Legacy/Default: New_Item without assetType (treat as inventory by default, unless explicitly fixed)
      const isLegacyNewItem = item.transactionType === "New_Item" && item.subType === "New_Item" && item.assetType !== "fixed";
      // Payable New_Item without assetType (treat as inventory by default)
      const isLegacyPayableNewItem = item.transactionType === "Payable" && item.subType === "New_Item" && !item.assetType;

      if (isNewItemCurrent || isPayableCurrent || isLegacyNewItem || isLegacyPayableNewItem) {
        // Use originalAmount for Payable (transactionAmount changes after payment)
        const amount = item.transactionType === "Payable"
          ? parseFloat(item.originalAmount || item.transactionAmount || 0)
          : parseFloat(item.transactionAmount || 0);
        return sum + amount;
      }
      return sum;
    }, 0);

    const saleInventoryCost = filteredItems.reduce((sum, item) => {
      if (item.transactionType === "Receive" && item.subType === "sale_inventory" && parseFloat(item.originalAmount || 0)) {
        return sum + parseFloat(item.originalAmount);
      }
      return sum;
    }, 0);

    const totalInventory = Math.max(0, newItemsTotal - saleInventoryCost + valueableItems);
    return totalInventory.toFixed(2);
  };

  const calculateTotalFixedAssets = () => {
    const filteredItems = getFilteredItems();
    const fixedAdded = filteredItems.reduce((sum, item) => {
      const isNewItemFixed = item.transactionType === "New_Item" && item.assetType === "fixed";
      const isPayableFixed = item.transactionType === "Payable" && item.assetType === "fixed" && item.subType === "New_Item";
      if (isNewItemFixed || isPayableFixed) {
        // Use originalAmount for Payable (transactionAmount changes after payment)
        const amount = item.transactionType === "Payable"
          ? parseFloat(item.originalAmount || item.transactionAmount || 0)
          : parseFloat(item.transactionAmount || 0);
        return sum + amount;
      }
      return sum;
    }, 0);
    const fixedSold = filteredItems.reduce((sum, item) => {
      if (item.transactionType === "Receive" && item.subType === "sale_fixed" && parseFloat(item.originalAmount || 0)) {
        return sum + parseFloat(item.originalAmount);
      }
      return sum;
    }, 0);
    return (fixedAdded - fixedSold).toFixed(2);
  };

  const getFixedAssetBreakdown = () => {
    const filteredItems = getFilteredItems();
    const byName = {};
    filteredItems.forEach((item) => {
      const isNewItemFixed = item.transactionType === "New_Item" && item.assetType === "fixed" && item.assetName;
      const isPayableFixed = item.transactionType === "Payable" && item.assetType === "fixed" && item.subType === "New_Item" && item.assetName;
      if (isNewItemFixed || isPayableFixed) {
        // Use originalAmount for Payable (transactionAmount changes after payment)
        const amount = item.transactionType === "Payable"
          ? parseFloat(item.originalAmount || item.transactionAmount || 0)
          : parseFloat(item.transactionAmount || 0);
        byName[item.assetName] = (byName[item.assetName] || 0) + amount;
      }
    });
    filteredItems.forEach((item) => {
      if (item.transactionType === "Receive" && item.subType === "sale_fixed" && item.assetName) {
        byName[item.assetName] = (byName[item.assetName] || 0) - parseFloat(item.originalAmount || 0);
      }
    });
    return Object.entries(byName).map(([name, balance]) => ({ name, balance: Math.max(0, balance) })).filter((x) => x.balance > 0);
  };

  const getInventoryBreakdown = () => {
    const filteredItems = getFilteredItems();
    const byName = {};
    filteredItems.forEach((item) => {
      const isNewItemCurrent = item.transactionType === "New_Item" && item.assetType === "current" && item.assetName;
      const isPayableCurrent = item.transactionType === "Payable" && item.assetType === "current" && item.subType === "New_Item" && item.assetName;
      if (isNewItemCurrent || isPayableCurrent) {
        // Use originalAmount for Payable (transactionAmount changes after payment)
        const amount = item.transactionType === "Payable"
          ? parseFloat(item.originalAmount || item.transactionAmount || 0)
          : parseFloat(item.transactionAmount || 0);
        byName[item.assetName] = (byName[item.assetName] || 0) + amount;
      }
    });
    filteredItems.forEach((item) => {
      if (item.transactionType === "Receive" && item.subType === "sale_inventory" && item.assetName) {
        byName[item.assetName] = (byName[item.assetName] || 0) - parseFloat(item.originalAmount || 0);
      }
    });
    return Object.entries(byName).map(([name, balance]) => ({ name, balance: Math.max(0, balance) })).filter((x) => x.balance > 0);
  };

  // Authoritative total expenses driving net income (Revenue − Expenses).
  // = Cost of Goods Sold + Operating Expenses + Other Expense (fixed-asset
  // disposal losses). The installment-remaining and asset-purchase exclusions
  // live in isCountableOutflow/outflowAmount, shared with the subtotals above.
  const calculateTotalExpenses = () => {
    return (
      parseFloat(calculateCOGS()) +
      parseFloat(calculateOperatingExpenses()) +
      parseFloat(calculateOtherExpense())
    ).toFixed(2);
  };

  const calculateTotalCash = () => {
    const filteredItems = getFilteredItems();

    const totalReceived = filteredItems.reduce((sum, value) => {
      if (value.transactionType === "Receive") {
        return sum + parseFloat(value.transactionAmount || 0);
      }
      return sum;
    }, 0);

    const New_ItemReceived = filteredItems.reduce((sum, value) => {
      if (value.transactionType === "New_Item") {
        return sum + parseFloat(value.transactionAmount || 0);
      }
      return sum;
    }, 0);

    // Include ALL Pay transactions (including outstanding debt payments)
    const totalExpenses = filteredItems.reduce((sum, value) => {
      if (value.transactionType === "Pay") {
        return sum + parseFloat(value.transactionAmount || 0);
      }
      return sum;
    }, 0);

    const totalCash =
      initialBalance + totalReceived - totalExpenses - New_ItemReceived;
    return totalCash.toFixed(2);
  };

  const calculateTotalPayable = () => {
    const filteredItems = getFilteredItems();

    // Count unpaid regular Payables
    const totalPayable = filteredItems.reduce((sum, value) => {
      if (value.transactionType === "Payable" && value.status !== "Paid") {
        return sum + parseFloat(value.transactionAmount || 0);
      }
      return sum;
    }, 0);

    // *** FIX: Use 'items' instead of 'filteredItems' for complete payment history ***
    const outstandingDebtPayments = items.reduce((sum, value) => {
      if (
        value.payableId === "outstanding-debt" &&
        value.transactionType === "Pay"
      ) {
        return sum + parseFloat(value.transactionAmount || 0);
      }
      return sum;
    }, 0);

    // Calculate remaining outstanding debt
    const remainingOutstandingDebt = Math.max(
      0,
      initialoutstandingDebt - outstandingDebtPayments
    );

    return (totalPayable + remainingOutstandingDebt).toFixed(2);
  };

  const fetchTransactions = (uid = null) => {
    setLoadingTransactions(true);
    const targetUserId = uid || localStorage.getItem("userId");

    axios
      .get(
        apiUrl(`${ROUTES.TRANSACTION}?userId=${targetUserId}`)
      )
      .then((response) => {
        if (response.data) {
          console.log("transactions data: ", response.data);
          const updatedTransactions = response.data.map((transaction) => {
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
          calculateTotals(updatedTransactions);
          setItems(updatedTransactions);
        }
      })
      .catch((error) => {
        notify("tr", "Error fetching transactions", "danger");
      })
      .finally(() => {
        setLoadingTransactions(false);
      });
  };

  const fetchUnpaidTransactions = () => {
    setLoadingUnpaidTransactions(true);
    axios
      .get(
        apiUrl(`${ROUTES.TRANSACTION}?userId=${userId}`)
      )
      .then((response) => {
        const unpaidOrPartiallyPaid = response.data
          .filter(
            (t) =>
              t.transactionType === "Payable" &&
              (!t.installmentPlan || t.installmentPlan.remainingAmount > 0)
          )
          .map((transaction) => ({
            ...transaction,
            remainingAmount: transaction.installmentPlan
              ? transaction.installmentPlan.remainingAmount
              : transaction.transactionAmount,
          }));

        // ✅ FIX: Calculate remaining outstanding debt dynamically
        const outstandingDebt = initialoutstandingDebt || 0;

        if (outstandingDebt > 0) {
          // Calculate total payments made toward outstanding debt
          const outstandingDebtPayments = response.data.reduce((sum, t) => {
            if (
              t.payableId === "outstanding-debt" &&
              t.transactionType === "Pay"
            ) {
              return sum + parseFloat(t.transactionAmount || 0);
            }
            return sum;
          }, 0);

          // Calculate remaining outstanding debt
          const remainingOutstandingDebt =
            outstandingDebt - outstandingDebtPayments;

          // Only add to list if there's still debt remaining
          if (remainingOutstandingDebt > 0) {
            unpaidOrPartiallyPaid.push({
              id: "outstanding-debt",
              transactionType: "Payable",
              transactionPurpose: "Initial Outstanding Debt",
              transactionAmount: remainingOutstandingDebt, // ✅ Now shows $900
              remainingAmount: remainingOutstandingDebt, // ✅ Now shows $900
              createdAt: new Date().toISOString(),
            });
          }
        }

        setUnpaidTransactions(unpaidOrPartiallyPaid);
      })
      .catch((error) => {
        console.error("Error fetching unpaid transactions:", error);
        notify("tr", "Error fetching unpaid transactions", "danger");
      })
      .finally(() => {
        setLoadingUnpaidTransactions(false);
      });
  };

  const handleSelectRange = (range) => {
    setSelectedTimeRange(range);
  };

  const handleClearFilters = () => {
    setSelectedTimeRange("all");
    setSearchedDates(null);
  };

  const handleAddExpense = (expense) => {
    console.log("New expense:", expense);
  };

  const handleDelete = async (transaction) => {
    if (window.confirm(t("financialReport.confirmDeleteRecord"))) {
      setLoadingDelete(true);
      try {
        if (transaction?.payableId === "outstanding-debt") {
          await handleOutstandingDebtDeletion(transaction);
        } else if (transaction.payableId) {
          await handlePayableDeletion(transaction);
        }

        const deleteResponse = await axios.delete(
          apiUrl(`${ROUTES.TRANSACTION}/${Number(transaction.id)}`),
          { headers: { "Content-Type": "application/json" } }
        );

        if (deleteResponse.status === 200) {
          notify("tr", "Record deleted successfully", "success");
          await fetchTransactions();
          await fetchUserInitialBalance();
        } else {
          throw new Error("Failed to delete record");
        }
      } catch (error) {
        console.error("Delete error:", error);
        notify(
          "tr",
          error.response?.data?.message || "Failed to delete record",
          "danger"
        );
      } finally {
        setLoadingDelete(false);
      }
    }
  };

  const handleEdit = (transaction) => {
    setEditingTransaction(transaction);
    setEditType(transaction.transactionType || "Receive");
    setEditPurpose(transaction.transactionPurpose || "");
    setEditAmount(String(transaction.transactionAmount ?? ""));
    setEditModalOpen(true);
  };

  const handleSaveEdit = async () => {
    if (!editingTransaction) return;
    const amt = parseFloat(editAmount);
    if (!editPurpose.trim() || isNaN(amt)) {
      notify("tr", "Please enter a purpose and a valid amount", "warning");
      return;
    }
    setSavingEdit(true);
    try {
      const updated = {
        ...editingTransaction,
        transactionType: editType,
        transactionPurpose: editPurpose.trim(),
        transactionAmount: amt,
        updatedAt: new Date().toISOString(),
      };
      const res = await axios.put(
        apiUrl(`${ROUTES.TRANSACTION}/${Number(editingTransaction.id)}`),
        updated,
        { headers: { "Content-Type": "application/json" } }
      );
      if (res.status === 200) {
        notify("tr", "Transaction updated successfully", "success");
        setEditModalOpen(false);
        setEditingTransaction(null);
        await fetchTransactions();
        await fetchUserInitialBalance();
      } else {
        throw new Error("Failed to update transaction");
      }
    } catch (error) {
      console.error("Edit error:", error);
      notify(
        "tr",
        error.response?.data?.message || "Failed to update transaction",
        "danger"
      );
    } finally {
      setSavingEdit(false);
    }
  };

  const handleOutstandingDebtDeletion = async (transaction) => {
    // When deleting an outstanding debt payment, we DON'T need to update the user table
    // because we're calculating it dynamically from transactions
    console.log("Deleting outstanding debt payment - no user update needed");
    // The payment transaction will be deleted, and calculateTotalPayable will reflect the change
  };

  const handlePayableDeletion = async (transaction) => {
    const payableItem = items.find((item) => item.id === transaction.payableId);
    if (payableItem) {
      const updatedTransaction = {
        ...payableItem,
        status: "Payable",
        transactionAmount: (
          parseFloat(payableItem.transactionAmount) +
          parseFloat(transaction.transactionAmount)
        ).toString(),
        updatedAt: new Date().toISOString(),
      };

      await axios.put(
        apiUrl(`${ROUTES.TRANSACTION}/${Number(transaction.payableId)}`),
        updatedTransaction,
        { headers: { "Content-Type": "application/json" } }
      );
    }
  };

  // CSV Generation function
  const generateCSV = (data) => {
    if (!data || data.length === 0) {
      return "";
    }

    const csvRows = [];
    const headers = Object.keys(data[0]);
    csvRows.push(headers.join(","));

    data.forEach((row) => {
      const values = headers.map((header) => {
        const cellValue = row[header];
        const escapedValue = String(cellValue).replace(/"/g, '""');
        return `"${escapedValue}"`;
      });
      csvRows.push(values.join(","));
    });

    return csvRows.join("\n");
  };

  const uploadCSVToS3 = async (csvData) => {
    try {
      const userId = localStorage.getItem("userId");
      const fileName = `transactions_${new Date().toISOString()}.csv`;
      const bucketName = S3_BUCKET_NAME;
      const folderPath = "backups/" + userId;
      const s3Key = `${folderPath}${fileName}`;

      const base64CsvData = btoa(unescape(encodeURIComponent(csvData)));

      const response = await axios.post(
        apiUrl(ROUTES.BACKUP),
        {
          bucketName: bucketName,
          key: s3Key,
          filename: fileName,
          userId: userId,
          fileContent: base64CsvData,
          type: "text/csv;charset=utf-8",
        },
        {
          headers: {
            "Content-Type": "application/json",
          },
        }
      );

      if (response.status === 200) {
        notify("tr", t("backupCSV.savedSuccess"), "success");
        return true;
      } else {
        notify("tr", t("backupCSV.saveFailed"), "danger");
        return false;
      }
    } catch (error) {
      console.error("Error uploading CSV to S3:", error);
      notify("tr", t("backupCSV.errorSaving"), "danger");
      return false;
    }
  };

  useEffect(() => {
    const persistedUserId = localStorage.getItem("selectedUserId");
    if (userRole !== 0) return;

    if (selectedUserId) {
      hasShownNotifyRef.current = false;
      fetchUserInitialBalance(selectedUserId);
      fetchTransactions(selectedUserId);
      return;
    }
    if (!selectedUserId && persistedUserId) {
      setSelectedUserId(persistedUserId);
      return;
    }
    const timeout = setTimeout(() => {
      firstLoadRef.current = false;

      if (!selectedUserId && !hasShownNotifyRef.current) {
        setLoading(false);
        notify("tr", "Please select a user", "warning");
        hasShownNotifyRef.current = true;
      }
    }, 400);

    return () => clearTimeout(timeout);
  }, [userRole, selectedUserId]);

  useEffect(() => {
    if (selectedUserId) {
      hasShownNotifyRef.current = false;
    }
  }, [selectedUserId]);

  // Expose PDF download trigger to window so Sidebar can call it from any page
  useEffect(() => {
    window.__mesobOpenDownloadReport = () => {
      setShowDownloadReportModal(true);
    };
    return () => {
      delete window.__mesobOpenDownloadReport;
    };
  }, []);

  useEffect(() => {
    if (location.state?.openDownloadModal) {
      // Small delay to let the page fully mount
      setTimeout(() => {
        setShowDownloadReportModal(true);
      }, 300);
      navigate(location.pathname, { replace: true }); // clear state
    }
  }, [location.state]);

  useEffect(() => {
    const handleSidebarReset = () => {
      confirmDeleteandsave();
    };
    const handleSidebarDownload = () => {
      setShowDownloadReportModal(true); // ← open PDF modal instead of CSV
    };

    window.addEventListener("mesob:resetAllTransactions", handleSidebarReset);
    window.addEventListener("mesob:downloadReport", handleSidebarDownload);

    return () => {
      window.removeEventListener("mesob:resetAllTransactions", handleSidebarReset);
      window.removeEventListener("mesob:downloadReport", handleSidebarDownload);
    };
  }, [items]);

  useEffect(() => {
    const handleResize = () => setIsMobile(window.innerWidth < 768);
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  const handleUserSelect = (selectedOption) => {
    if (!selectedOption) {
      setSelectedUserId(null);
      localStorage.removeItem("selectedUserId");
      setItems([]);
      setLoading(false);
      return;
    }
    const userId = selectedOption.value;
    setSelectedUserId(userId);
    localStorage.setItem("selectedUserId", userId);

    const selectedUserData = users.find((user) => user.id === userId);
    if (selectedUserData) {
      dispatch(setSelectedUser(selectedUserData));
      fetchFinancialData(userId);
    }
  };

  const confirmDeleteandsave = async () => {
    setLoadingDeleteAll(true);
    const userId = localStorage.getItem("userId");

    try {
      const csvData = generateCSV(items);
      if (csvData) {
        const blob = new Blob([csvData], { type: "text/csv;charset=utf-8" });
        saveAs(blob, "transactions.csv");
      }
      const uploadSuccess = await uploadCSVToS3(csvData);
      if (!uploadSuccess) {
        setLoadingDeleteAll(false);
        setShowDeleteConfirmation(false);
        return;
      }
      const response = await axios.delete(
        apiUrl(`${ROUTES.TRANSACTION}/deleteAll?userId=${userId}`),
        {
          headers: {
            "Content-Type": "application/json",
          },
        }
      );

      if (response.status === 200) {
        setItems([]);
        setTotalCashOnHand(0);
        setTotalExpenses(0);
        setRevenues({});
        setExpenses({});
        setAccountsPayable({});
        notify("tr", "All records deleted successfully", "success");
        window.location.reload();
      }
    } catch (error) {
      console.error("Error deleting all records:", error);
      notify("tr", "Error deleting records", "danger");
    } finally {
      setLoadingDeleteAll(false);
      setShowDeleteConfirmation(false);
    }
  };

  // Fullscreen expand/collapse toggle for a report card header.
  const ExpandToggle = ({ id }) => (
    <button
      type="button"
      className="card-expand-btn"
      aria-label={expandedCard === id ? "Collapse" : "Expand"}
      title={expandedCard === id ? "Collapse" : "Expand"}
      onClick={() => setExpandedCard((c) => (c === id ? null : id))}
    >
      {expandedCard === id ? <Minimize2 size={16} /> : <Maximize2 size={16} />}
    </button>
  );

  const RunButtons = ({ onSelectRange, onClearFilters }) => {
    const [fromDate, setFromDate] = useState("");
    const [toDate, setToDate] = useState("");
    const [preset, setPreset] = useState(null);
    const [customOpen, setCustomOpen] = useState(false);

    const ymd = (d) => {
      const y = d.getFullYear();
      const m = String(d.getMonth() + 1).padStart(2, "0");
      const day = String(d.getDate()).padStart(2, "0");
      return `${y}-${m}-${day}`;
    };

    const applyPreset = (key) => {
      if (isSubscriptionGateActive()) {
        navigate(SUBSCRIPTION_ROUTE);
        return;
      }
      if (key === "custom") {
        setPreset("custom");
        setCustomOpen((v) => !v);
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
        from = new Date(now.getFullYear(), 0, 1);
      }
      const f = ymd(from);
      const tt = ymd(to);
      setPreset(key);
      setCustomOpen(false);
      setFromDate(f);
      setToDate(tt);
      onSelectRange({ from: f, to: tt });
      setSearchedDates({ from: f, to: tt });
    };

    const handleRun = () => {
      if (fromDate && toDate) {
        onSelectRange({ from: fromDate, to: toDate });
        setSearchedDates({ from: fromDate, to: toDate });
      } else {
        notify("tr", t("financialReport.selectDates"), "warning");
      }
    };

    const handleClear = () => {
      setFromDate("");
      setToDate("");
      setPreset(null);
      setCustomOpen(false);
      onClearFilters();
    };

    return (
      <div className="dash-filter" style={{ margin: 0, opacity: isSubscriptionGateActive() ? 0.6 : 1 }}>
        <div className="dash-filter__presets" role="group" aria-label={t("financialReport.dateRange", "Date range")}>
          {[
            { key: "month", label: t("dashboard.presetThisMonth", "This month") },
            { key: "30d", label: t("dashboard.presetLast30", "Last 30 days") },
            { key: "quarter", label: t("dashboard.presetQuarter", "Quarter") },
            { key: "ytd", label: t("dashboard.presetYtd", "YTD") },
          ].map((p) => (
            <button
              key={p.key}
              type="button"
              className={`dash-preset${preset === p.key ? " is-active" : ""}`}
              onClick={() => applyPreset(p.key)}
              title={isSubscriptionGateActive() ? SUBSCRIPTION_UPDATE_HINT : undefined}
            >
              {p.label}
            </button>
          ))}
          <button
            type="button"
            className={`dash-preset dash-preset--custom${preset === "custom" || customOpen ? " is-active" : ""}`}
            aria-expanded={customOpen}
            onClick={() => applyPreset("custom")}
            title={isSubscriptionGateActive() ? SUBSCRIPTION_UPDATE_HINT : undefined}
          >
            {t("dashboard.presetCustom", "Custom")}
            <span className={`dash-preset__caret${customOpen ? " is-open" : ""}`} aria-hidden>▾</span>
          </button>
          {(preset || (selectedTimeRange && selectedTimeRange !== "all")) && (
            <button type="button" className="dash-preset dash-preset--clear" onClick={handleClear}>
              {t("financialReport.clearFilters", "Clear")}
            </button>
          )}
          <div className="dash-filter__search">
            {showSearchInput ? (
              <div className="dash-filter__searchbox">
                <Input
                  type="text"
                  placeholder={t("financialReport.searchJournal")}
                  value={searchTerm}
                  onChange={(e) => {
                    const value = e.target.value;
                    setSearchTerm(value);
                    if (value.trim() === "") {
                      setSearchTerm("");
                      setShowSearchInput(false);
                    }
                  }}
                  onBlur={() => {
                    if (searchTerm.trim() === "") setShowSearchInput(false);
                  }}
                  className="dash-filter__date"
                  style={{ paddingRight: "34px" }}
                  autoFocus
                />
                <button
                  type="button"
                  aria-label="Close search"
                  className="dash-filter__searchclose"
                  onClick={() => { setSearchTerm(""); setShowSearchInput(false); }}
                >
                  ×
                </button>
              </div>
            ) : (
              <button
                type="button"
                className="dash-preset dash-preset--icon"
                aria-label={t("financialReport.searchJournal")}
                title={isSubscriptionGateActive() ? SUBSCRIPTION_UPDATE_HINT : t("financialReport.searchJournal")}
                onClick={() => {
                  if (isSubscriptionGateActive()) {
                    navigate(SUBSCRIPTION_ROUTE);
                    return;
                  }
                  setShowSearchInput(true);
                }}
              >
                <Search size={16} />
              </button>
            )}
          </div>
        </div>
        {customOpen && (
          <div className="dash-filter__custom">
            <label className="dash-filter__field">
              <span className="dash-filter__lbl">{t("financialReport.from")}</span>
              <Input
                type="date"
                value={fromDate}
                onChange={(e) => setFromDate(e.target.value)}
                className="dash-filter__date"
              />
            </label>
            <label className="dash-filter__field">
              <span className="dash-filter__lbl">{t("financialReport.to")}</span>
              <Input
                type="date"
                value={toDate}
                onChange={(e) => setToDate(e.target.value)}
                className="dash-filter__date"
              />
            </label>
            <button type="button" className="dash-preset dash-preset--apply" onClick={handleRun}>
              {t("financialReport.run", "Apply")}
            </button>
          </div>
        )}
      </div>
    );
  };

  const getFilteredItems = () => {
    return filterItemsByTimeRange(items, selectedTimeRange, searchTerm);
  };

  useEffect(() => {
    if (items && items.length > 0) {
      calculateFinancials(items);
    }
  }, [items, selectedTimeRange, searchTerm]);

  const isLandscape = window.innerWidth > window.innerHeight;
  const isMobileLandscape = isMobile && isLandscape;
  return (
    <>
      <Helmet>
        <title>Meksova - Meksova</title>
      </Helmet>

      <NotificationAlert ref={notificationAlertRef} />

      {userRole === 0 && (
        <div
          className="content"
          style={{
            marginBottom: "-30px",
            minHeight: "100px",
            paddingInline: 15,
            marginTop: isMobile ? 8 : 80,
          }}
        >
          <Row style={{ margin: 0, padding: 0, marginTop: isMobile ? 8 : 12 }}>
            <Col xs={12} style={{ padding: 0 }}>
              <Card style={{ marginBottom: "5px" }}>
                <CardHeader>
                  <CardTitle style={{ marginBottom: 0 }} tag="h4">
                    {t('financialReport.selectUser')}
                  </CardTitle>
                </CardHeader>
                <CardBody style={{ paddingBottom: "5px" }}>
                  <FormGroup style={{ marginBottom: "0" }}>
                    <Label>{t('financialReport.selectUserToView')}</Label>
                    <Select
                      options={userOptions}
                      value={
                        userOptions.find(
                          (option) => option.value === selectedUserId
                        ) || null
                      }
                      onChange={handleUserSelect}
                      placeholder={t('financialReport.searchUser')}
                      isClearable
                      isSearchable
                      styles={{
                        control: (provided, state) => ({
                          ...provided,
                          minHeight: "38px",
                          height: "38px",
                          backgroundColor: "transparent",
                          color: "var(--text-1)",
                          borderColor: state.isFocused ? "var(--border-strong)" : "var(--border-strong)",
                          boxShadow: state.isFocused ? "0 0 0 1px var(--border-strong)" : "none",
                          "&:hover": {
                            borderColor: "var(--border-strong)",
                          },
                        }),
                        valueContainer: (provided) => ({
                          ...provided,
                          height: "38px",
                          padding: "0 6px",
                        }),
                        input: (provided) => ({
                          ...provided,
                          margin: "0px",
                          color: "var(--text-1)",
                        }),
                        singleValue: (provided) => ({
                          ...provided,
                          color: "var(--text-1)",
                        }),
                        placeholder: (provided) => ({
                          ...provided,
                          color: "var(--text-1)",
                          opacity: 0.7,
                        }),
                        indicatorsContainer: (provided) => ({
                          ...provided,
                          height: "38px",
                        }),
                        menu: (provided) => ({
                          ...provided,
                          backgroundColor: "transparent",
                          border: "1px solid var(--border-strong)",
                        }),
                        menuList: (provided) => ({
                          ...provided,
                          backgroundColor: "transparent",
                        }),
                        option: (provided, state) => ({
                          ...provided,
                          backgroundColor: state.isSelected
                            ? "#2b427d"
                            : state.isFocused
                              ? "var(--surface-3)"
                              : "transparent",
                          color: "var(--text-1)",
                          cursor: "pointer",
                          "&:active": {
                            backgroundColor: "#2b427d",
                          },
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

      <div className="content" style={{ marginTop: 80, paddingTop: "0", backgroundColor: "transparent" }}>
        {/* Transactions Table Section - First */}
        <Container fluid style={{ paddingInline: 0 }}>
          <div className="mksv-hero">
                       <div>
              <h1 className="mksv-hero-title">{t('financialReport.title', 'Financial Reports')}</h1>
              <p className="mksv-hero-sub">{t('financialReport.subtitle', 'Track, analyze, and grow your business.')}</p>
              <QuickScanReceipt />
            </div>
            <div className="mksv-hero-tag">SIMPLE TOOLS.<br />REAL GROWTH.</div>
            <svg className="mksv-hero-mtn" viewBox="0 0 300 80" fill="none" preserveAspectRatio="none">
              <path d="M0 80 L0 64 L52 36 L92 52 L132 20 L172 48 L216 24 L258 44 L300 28 L300 80 Z" fill="#3b82f6" fillOpacity="0.10" />
              <path d="M0 64 L52 36 L92 52 L132 20 L172 48 L216 24 L258 44 L300 28" stroke="#3b82f6" strokeOpacity="0.55" strokeWidth="1.5" />
            </svg>
          </div>
          <Row>
            <Col xs={12} style={{ paddingLeft: "1px", paddingRight: "1px" }}>
              <Card style={{ backgroundColor: "transparent", boxShadow: "var(--shadow-1), var(--glass-inset), var(--card-glow)", paddingBottom: 8, borderRadius: "8px" }}>
                <CardHeader
                  style={{
                    display: "flex",
                    justifyContent: "space-between",
                    alignItems: "center",
                    paddingInline: 20,

                    backgroundColor: "transparent",
                    flexWrap: "wrap",
                    gap: "15px",
                  }}
                >
                  {/* Left Section: RunButtons + Search */}
                  <div className="searchbtn" style={{ display: "flex", alignItems: "center", gap: "15px", flexWrap: "wrap" }}>
                    <RunButtons
                      onSelectRange={handleSelectRange}
                      onClearFilters={handleClearFilters}
                    />

                    {/* Search */}

                  </div>

                  {/* Right Section: Add Transaction + Subscription Info */}
                  <div
                    className="addtransction"
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: "15px",
                      flexWrap: "wrap",
                    }}
                  >
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
                        height: "38px",
                        borderRadius: "var(--r-sm)",
                        padding: "0 16px",
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                        opacity: isSubscriptionGateActive() ? 0.5 : 1,
                      }}
                    >
                      <FontAwesomeIcon
                        icon={faDownload}
                        style={{ marginRight: "5px" }}
                      />
                      {t('financialReport.downloadReport')}
                    </Button>
                    {userRole !== 0 && (
                      <Button
                        type="button"
                        title={isSubscriptionGateActive() ? SUBSCRIPTION_UPDATE_HINT : undefined}
                        onClick={() => {
                          if (isSubscriptionGateActive()) {
                            navigate(SUBSCRIPTION_ROUTE);
                            return;
                          }
                          setShowAddTransaction(true);
                        }}
                        style={{
                          backgroundColor: "var(--accent-solid)",
                          borderColor: "var(--accent-solid)",
                          color: "var(--accent-ink)",
                          height: "38px",
                          borderRadius: "var(--r-sm)",
                          padding: "0 16px",
                          display: "flex",
                          alignItems: "center",
                          justifyContent: "center",
                          opacity: isSubscriptionGateActive() ? 0.5 : 1,
                        }}
                      >
                        <FontAwesomeIcon
                          icon={faPlus}
                          style={{ marginRight: "5px" }}
                        />
                        {t('financialReport.addTransaction')}
                      </Button>
                    )}

                    {userRole === 2 && (
                      <UserSubscriptionInfo
                        userSubscription={userSubscription}
                        trialEndDate={trialEndDate}
                        scheduleCount={scheduleCount}
                      />
                    )}
                  </div>
                </CardHeader>
              </Card>
            </Col>
          </Row>

          {/* 2x2 Grid Layout for Summary, Journal Entry, Income Statement, Balance Sheet */}

          {/* Click-away backdrop for an expanded report card */}
          {expandedCard && (
            <div className="report-backdrop" onClick={() => setExpandedCard(null)} />
          )}

          {/* Desktop View */}
          <Row className="d-none d-md-flex" style={{ marginTop: "3px" }}>
            <Col
              xs={12}
              md={3}
              style={{ paddingLeft: "1px", paddingRight: "1px" }}
            >
              <Card className={`report-card${expandedCard === "summary" ? " is-expanded" : ""}`} style={{ marginBottom: "5px", height: "480px", backgroundColor: "transparent", boxShadow: "var(--shadow-1), var(--glass-inset), var(--card-glow)", borderRadius: "8px" }}>
                <CardHeader style={{ backgroundColor: "transparent" }}>
                  <CardTitle style={{ fontWeight: 600, color: "var(--text-1)" }} tag="h4">
                    {t('financialReport.summary')}
                  </CardTitle>
                  <ExpandToggle id="summary" />
                </CardHeader>
                <CardBody style={{ overflowY: "auto", overflowX: "visible", height: "400px", backgroundColor: "transparent" }}>
                  <div className="mksv-stats">
                    <div className="mksv-stat">
                      <div className="mksv-ico mksv-ico--income"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><rect x="3" y="6" width="18" height="12" rx="2" /><circle cx="12" cy="12" r="2.4" /></svg></div>
                      <div className="mksv-stat-main">
                        <div className="mksv-stat-label">{t('financialReport.totalCashOnHand')}</div>
                        <BalanceValue value={parseFloat(calculateTotalCash())} tooltip={t('financialReport.cashDeficitTooltip')} style={{ fontSize: "1.15rem", fontWeight: 800 }}>
                          ${parseFloat(calculateTotalCash()).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                        </BalanceValue>
                      </div>
                      <svg className="mksv-spark" viewBox="0 0 66 34" preserveAspectRatio="none"><path d="M2 26 12 24 22 25 32 18 42 20 52 10 64 6 64 34 2 34Z" fill="#34d39922" /><polyline points="2,26 12,24 22,25 32,18 42,20 52,10 64,6" fill="none" stroke="#34d399" strokeWidth="2" /></svg>
                    </div>

                    <div className="mksv-stat">
                      <div className="mksv-ico mksv-ico--payable"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><path d="M6 3h9l5 5v13H6z" /><path d="M9 12h7M9 16h7" /></svg></div>
                      <div className="mksv-stat-main">
                        <div className="mksv-stat-label">{t('financialReport.totalPayable')}</div>
                        <div className="mksv-stat-val" style={{ color: FINANCIAL_COLORS.payable }}>${parseFloat(calculateTotalPayable()).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</div>
                      </div>
                      <svg className="mksv-spark" viewBox="0 0 66 34" preserveAspectRatio="none"><polyline points="2,20 12,18 22,22 32,16 42,19 52,14 64,12" fill="none" stroke="#e6b25f" strokeWidth="2" /></svg>
                    </div>

                    <div className="mksv-stat">
                      <div className="mksv-ico mksv-ico--accent"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><path d="M4 19V5M4 19h16M8 15l3-4 3 2 5-7" /></svg></div>
                      <div className="mksv-stat-main">
                        <div className="mksv-stat-label">{t('financialReport.totalRevenue')}</div>
                        <div className="mksv-stat-val" style={{ color: "#3b82f6" }}>${parseFloat(calculateTotalRevenue()).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</div>
                      </div>
                      <svg className="mksv-spark" viewBox="0 0 66 34" preserveAspectRatio="none"><path d="M2 28 12 22 22 24 32 15 42 17 52 9 64 4 64 34 2 34Z" fill="#3b82f622" /><polyline points="2,28 12,22 22,24 32,15 42,17 52,9 64,4" fill="none" stroke="#3b82f6" strokeWidth="2" /></svg>
                    </div>

                    <div className="mksv-stat">
                      <div className="mksv-ico mksv-ico--expense"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><path d="M21 12a9 9 0 11-9-9v9z" /></svg></div>
                      <div className="mksv-stat-main">
                        <div className="mksv-stat-label">{t('financialReport.totalExpense')}</div>
                        <div className="mksv-stat-val" style={{ color: FINANCIAL_COLORS.expense }}>${parseFloat(calculateTotalExpenses(true)).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</div>
                      </div>
                      <svg className="mksv-spark" viewBox="0 0 66 34" preserveAspectRatio="none"><polyline points="2,14 12,16 22,13 32,17 42,15 52,19 64,17" fill="none" stroke="#a855f7" strokeWidth="2" /></svg>
                    </div>
                  </div>
                </CardBody>
              </Card>
            </Col>

            <Col
              xs={12}
              md={9}
              style={{ paddingLeft: "1px", paddingRight: "1px" }}
            >
              <Card className={`report-card${expandedCard === "journal" ? " is-expanded" : ""}`} style={{ marginBottom: "5px", height: "480px", backgroundColor: "transparent", borderRadius: "8px" }}>
                <CardHeader style={{ backgroundColor: "transparent" }}>
                  <CardTitle style={{ fontWeight: 600, color: "var(--text-1)" }} tag="h4">
                    {t('financialReport.journalEntry')}
                  </CardTitle>
                  <ExpandToggle id="journal" />
                </CardHeader>
                <CardBody
                  style={{
                    height: "380px",
                    overflowY: "auto",
                    overflowX: "hidden",
                    padding: "10px",
                    backgroundColor: "transparent",
                  }}
                >
                  {loadingTransactions ? (
                    <div className="d-flex flex-column align-items-center justify-content-center" style={{ height: "100%", minHeight: "300px" }}>
                      <Spinner color="primary" />
                      <p style={{ color: "var(--text-1)", marginTop: "1rem" }}>{t('financialReport.loadingTransactions')}</p>
                    </div>
                  ) : (
                    <div style={{ width: "100%" }}>
                      <TransactionTable
                        items={filterItemsByTimeRange(
                          items,
                          selectedTimeRange,
                          searchTerm
                        )}
                        disabled={
                          userRole === 1
                            ? false
                            : !userSubscription && scheduleCount >= 4
                        }
                        selectedTimeRange={selectedTimeRange}
                        handleDelete={handleDelete}
                        handleEdit={handleEdit}
                        handleAddExpense={handleAddExpense}
                        handleReceiptClick={handleReceiptClick}
                        scheduleCount={scheduleCount}
                        userSubscription={userSubscription}
                      />
                    </div>
                  )}
                </CardBody>
              </Card>
            </Col>
          </Row>

          <Row className="d-none d-md-flex" style={{ marginTop: "3px" }}>
            <Col
              xs={12}
              md={6}
              style={{ paddingLeft: "1px", paddingRight: "1px" }}
            >
              <Card className={`report-card${expandedCard === "income" ? " is-expanded" : ""}`} style={{ marginBottom: "5px", height: "480px", backgroundColor: "transparent", boxShadow: "var(--shadow-1), var(--glass-inset), var(--card-glow)", borderRadius: "8px" }}>
                <CardHeader style={{ backgroundColor: "transparent" }}>
                  <CardTitle tag="h4" style={{ fontWeight: 600, color: "var(--text-1)" }}>
                    {t('financialReport.incomeStatement')}
                  </CardTitle>
                  <ExpandToggle id="income" />
                </CardHeader>
                <CardBody
                  style={{
                    height: "380px",
                    overflowY: "auto",
                    overflowX: "hidden",
                    padding: "15px",
                    backgroundColor: "transparent",
                  }}
                >
                  <div
                    style={{
                      overflowX: "auto",
                      overflowY: "visible",
                      width: "100%",
                    }}
                  >
                    <table
                      style={{
                        width: "100%",
                        tableLayout: "auto",
                        borderCollapse: "collapse",
                      }}
                    >
                      <tbody>
                        {renderIncomeStatementRows()}
                      </tbody>
                    </table>
                  </div>
                </CardBody>
              </Card>
            </Col>
            <Col
              xs={12}
              md={6}
              style={{ paddingLeft: "1px", paddingRight: "1px" }}
            >
              <Card className={`report-card${expandedCard === "balance" ? " is-expanded" : ""}`} style={{ marginBottom: "5px", height: "480px", backgroundColor: "transparent", borderRadius: "8px" }}>
                <CardHeader style={{ backgroundColor: "transparent" }}>
                  <CardTitle tag="h4" style={{ fontWeight: 600, color: "var(--text-1)" }}>
                    {t('financialReport.balanceSheet')}
                  </CardTitle>
                  <ExpandToggle id="balance" />
                </CardHeader>
                <CardBody
                  style={{
                    overflowY: "auto",
                    height: "380px",
                    overflowX: "hidden",
                    padding: "15px",
                    backgroundColor: "transparent",
                  }}
                >
                  <div
                    style={{
                      overflowX: "auto",
                      overflowY: "visible",
                      width: "100%",
                    }}
                  >
                    <table
                      style={{
                        width: "100%",
                        tableLayout: "auto",
                        borderCollapse: "collapse",
                      }}
                    >
                      <tbody>
                        <tr>
                          <td
                            style={{
                              width: "40%",
                              padding: "8px",
                              border: "1px solid var(--border)",
                              color: "var(--text-1)",
                            }}
                          >
                            <strong>{t('financialReport.assets')}</strong>
                          </td>
                          <td
                            style={{
                              width: "30%",
                              textAlign: "right",
                              padding: "8px",
                              border: "1px solid var(--border)",
                              color: "var(--text-1)",
                            }}
                          >
                            <strong>{t('financialReport.amount2')}</strong>
                          </td>
                          <td
                            style={{
                              width: "30%",
                              textAlign: "right",
                              padding: "8px",
                              border: "1px solid var(--border)",
                              color: "var(--text-1)",
                            }}
                          >
                            <strong>{t('financialReport.amount2')}</strong>
                          </td>
                        </tr>
                        <tr>
                          <td style={{ padding: "8px", border: "1px solid var(--border)", color: "var(--text-1)", fontWeight: "bold" }}>
                            {t('financialReport.currentAssets')}
                          </td>
                          <td style={{ padding: "8px", border: "1px solid var(--border)", color: "var(--text-1)" }}></td>
                          <td style={{ padding: "8px", border: "1px solid var(--border)", color: "var(--text-1)" }}></td>
                        </tr>
                        <tr>
                          <td style={{ padding: "8px", border: "1px solid var(--border)", color: "var(--text-1)" }}>{t('financialReport.cash')}</td>
                          <td style={{ color: getBalanceColor(calculateTotalCash()), textAlign: "right", padding: "8px", border: "1px solid var(--border)" }}>
                            $ {parseFloat(calculateTotalCash()).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                          </td>
                          <td style={{ padding: "8px", border: "1px solid var(--border)", color: "var(--text-1)" }}></td>
                        </tr>
                        <tr
                          onClick={() => setIsInventoryExpanded(!isInventoryExpanded)}
                          style={{ cursor: "pointer" }}
                        >
                          <td style={{ padding: "8px", border: "1px solid var(--border)", color: "var(--text-1)", fontWeight: "bold" }}>
                            {t('financialReport.inventory')} {isInventoryExpanded ? "▼" : "▶"}
                          </td>
                          <td style={{ padding: "8px", border: "1px solid var(--border)", color: "var(--text-1)" }}></td>
                          <td style={{ padding: "8px", border: "1px solid var(--border)", color: "var(--text-1)" }}></td>
                        </tr>
                        {isInventoryExpanded && getInventoryBreakdown().map(({ name, balance }) => (
                          <tr key={name}>
                            <td style={{ padding: "8px", border: "1px solid var(--border)", color: "var(--text-1)", paddingLeft: "20px" }}>{name}</td>
                            <td style={{ color: FINANCIAL_COLORS.asset, textAlign: "right", padding: "8px", border: "1px solid var(--border)" }}>
                              $ {parseFloat(balance).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                            </td>
                            <td style={{ padding: "8px", border: "1px solid var(--border)", color: "var(--text-1)" }}></td>
                          </tr>
                        ))}
                        <tr>
                          <td style={{ padding: "8px", border: "1px solid var(--border)", color: "var(--text-1)", fontWeight: "bold" }}>
                            <strong>{t('financialReport.totalInventory')}</strong>
                          </td>
                          <td style={{ color: FINANCIAL_COLORS.asset, fontWeight: "bold", textAlign: "right", padding: "8px", border: "1px solid var(--border)" }}>
                            $ {parseFloat(calculateTotalInventory()).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                          </td>
                          <td style={{ padding: "8px", border: "1px solid var(--border)", color: "var(--text-1)" }}></td>
                        </tr>
                        <tr>
                          <td style={{ padding: "8px", border: "1px solid var(--border)", color: "var(--text-1)", fontWeight: "bold" }}>
                            <strong>{t('financialReport.totalCurrentAssets')}</strong>
                          </td>
                          <td style={{ color: FINANCIAL_COLORS.income, fontWeight: "bold", textAlign: "right", padding: "8px", border: "1px solid var(--border)" }}>
                            $ {(parseFloat(calculateTotalCash()) + parseFloat(calculateTotalInventory())).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                          </td>
                          <td style={{ padding: "8px", border: "1px solid var(--border)", color: "var(--text-1)" }}></td>
                        </tr>
                        <tr>
                          <td style={{ padding: "8px", border: "1px solid var(--border)", color: "var(--text-1)", fontWeight: "bold" }}>
                            {t('financialReport.fixedAssets')}
                          </td>
                          <td style={{ padding: "8px", border: "1px solid var(--border)", color: "var(--text-1)" }}></td>
                          <td style={{ padding: "8px", border: "1px solid var(--border)", color: "var(--text-1)" }}></td>
                        </tr>
                        {getFixedAssetBreakdown().map(({ name, balance }) => (
                          <tr key={name}>
                            <td style={{ padding: "8px", border: "1px solid var(--border)", color: "var(--text-1)", paddingLeft: "20px" }}>{name}</td>
                            <td style={{ color: "var(--text-1)", textAlign: "right", padding: "8px", border: "1px solid var(--border)" }}>
                              $ {parseFloat(balance).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                            </td>
                            <td style={{ padding: "8px", border: "1px solid var(--border)", color: "var(--text-1)" }}></td>
                          </tr>
                        ))}
                        <tr>
                          <td style={{ padding: "8px", border: "1px solid var(--border)", color: "var(--text-1)", fontWeight: "bold" }}>
                            <strong>{t('financialReport.totalFixedAssets')}</strong>
                          </td>
                          <td style={{ color: FINANCIAL_COLORS.income, fontWeight: "bold", textAlign: "right", padding: "8px", border: "1px solid var(--border)" }}>
                            $ {parseFloat(calculateTotalFixedAssets()).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                          </td>
                          <td style={{ padding: "8px", border: "1px solid var(--border)", color: "var(--text-1)" }}></td>
                        </tr>
                        <tr>
                          <td style={{ padding: "8px", border: "1px solid var(--border)", color: "var(--text-1)", fontWeight: "bold" }}>
                            <strong>{t('financialReport.totalAssets')}</strong>
                          </td>
                          <td style={{ color: FINANCIAL_COLORS.income, fontWeight: "bold", textAlign: "right", padding: "8px", border: "1px solid var(--border)" }}>
                            $ {(parseFloat(calculateTotalCash()) + parseFloat(calculateTotalInventory()) + parseFloat(calculateTotalFixedAssets())).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                          </td>
                          <td style={{ padding: "8px", border: "1px solid var(--border)", color: "var(--text-1)" }}></td>
                        </tr>
                        <tr>
                          <td
                            style={{ padding: "8px", border: "1px solid var(--border)", color: "var(--text-1)", fontWeight: "bold" }}
                          >
                            <strong>{t('financialReport.liabilitiesEquity')}</strong>
                          </td>
                          <td
                            style={{ padding: "8px", border: "1px solid var(--border)", color: "var(--text-1)" }}
                          ></td>
                          <td
                            style={{ padding: "8px", border: "1px solid var(--border)", color: "var(--text-1)" }}
                          ></td>
                        </tr>
                        <tr>
                          <td
                            style={{ padding: "8px", border: "1px solid var(--border)", color: "var(--text-1)" }}
                          >
                            {t('financialReport.payable')}
                          </td>
                          <td
                            style={{ padding: "8px", border: "1px solid var(--border)", color: "var(--text-1)" }}
                          ></td>
                          <td
                            style={{
                              color: FINANCIAL_COLORS.payable,
                              textAlign: "right",
                              padding: "8px",
                              border: "1px solid var(--border)",
                            }}
                          >
                            $
                            {parseFloat(calculateTotalPayable()).toLocaleString(
                              "en-US",
                              {
                                minimumFractionDigits: 2,
                                maximumFractionDigits: 2,
                              }
                            )}
                          </td>
                        </tr>
                        <tr>
                          <td
                            style={{ padding: "8px", border: "1px solid var(--border)", color: "var(--text-1)" }}
                          >
                            {t('financialReport.beginningEquity')}
                          </td>
                          <td
                            style={{ padding: "8px", border: "1px solid var(--border)", color: "var(--text-1)" }}
                          ></td>
                          <td
                            style={{
                              color: "var(--text-1)",
                              textAlign: "right",
                              padding: "8px",
                              border: "1px solid var(--border)",
                            }}
                          >
                            $
                            {(
                              initialBalance +
                              initialvalueableItems -
                              initialoutstandingDebt
                            ).toLocaleString("en-US", {
                              minimumFractionDigits: 2,
                              maximumFractionDigits: 2,
                            })}
                          </td>
                        </tr>
                        <tr>
                          <td
                            style={{ padding: "8px", border: "1px solid var(--border)", color: "var(--text-1)" }}
                          >
                            {t('financialReport.retainedEarnings')}
                          </td>
                          <td
                            style={{ padding: "8px", border: "1px solid var(--border)", color: "var(--text-1)" }}
                          ></td>
                          <td
                            style={{
                              color: getNetIncomeColor(
                                parseFloat(calculateTotalRevenue()) -
                                  parseFloat(calculateTotalExpenses())
                              ),
                              textAlign: "right",
                              padding: "8px",
                              border: "1px solid var(--border)",
                            }}
                          >
                            $
                            {(
                              parseFloat(calculateTotalRevenue()) -
                              parseFloat(calculateTotalExpenses())
                            ).toLocaleString("en-US", {
                              minimumFractionDigits: 2,
                              maximumFractionDigits: 2,
                            })}
                          </td>
                        </tr>
                        <tr>
                          <td
                            style={{ padding: "8px", border: "1px solid var(--border)", color: "var(--text-1)", fontWeight: "bold" }}
                          >
                            <strong>{t('financialReport.totalLiabilitiesEquity')}</strong>
                          </td>
                          <td
                            style={{ padding: "8px", border: "1px solid var(--border)", color: "var(--text-1)" }}
                          ></td>
                          <td
                            style={{
                              color: FINANCIAL_COLORS.income,
                              fontWeight: "bold",
                              textAlign: "right",
                              padding: "8px",
                              border: "1px solid var(--border)",
                            }}
                          >
                            $
                            {(
                              parseFloat(calculateTotalPayable()) +
                              (initialBalance + initialvalueableItems - initialoutstandingDebt) +
                              (parseFloat(calculateTotalRevenue()) - parseFloat(calculateTotalExpenses()))
                            ).toLocaleString("en-US", {
                              minimumFractionDigits: 2,
                              maximumFractionDigits: 2,
                            })}
                          </td>
                        </tr>

                        <tr>
                          <td
                            style={{ padding: "8px", border: "1px solid var(--border)" }}
                          >
                            <strong>{t('common.total')}</strong>
                          </td>
                          <td
                            style={{
                              textAlign: "right",
                              padding: "8px",
                              border: "1px solid var(--border)",
                            }}
                          >
                            ${(parseFloat(calculateTotalCash()) + parseFloat(calculateTotalInventory()) + parseFloat(calculateTotalFixedAssets())).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                          </td>
                          <td
                            style={{
                              textAlign: "right",
                              padding: "8px",
                              border: "1px solid var(--border)",
                            }}
                          >
                            $
                            {(
                              parseFloat(calculateTotalPayable()) +
                              initialBalance +
                              initialvalueableItems -
                              initialoutstandingDebt +
                              parseFloat(calculateTotalRevenue()) -
                              parseFloat(calculateTotalExpenses())
                            ).toLocaleString("en-US", {
                              minimumFractionDigits: 2,
                              maximumFractionDigits: 2,
                            })}
                          </td>
                        </tr>
                      </tbody>
                    </table>
                  </div>
                </CardBody>
              </Card>
            </Col>
          </Row>

          {/* Mobile View */}
          <Row className="d-flex d-md-none" style={{ marginTop: "3px" }}>
            <Col xs={12} style={{ paddingLeft: "1px", paddingRight: "1px" }}>
              <Card style={{ marginBottom: "5px", backgroundColor: "transparent", boxShadow: "var(--shadow-1), var(--glass-inset), var(--card-glow)", borderRadius: "8px" }}>
                <CardHeader style={{ backgroundColor: "transparent" }}>
                  <CardTitle style={{ fontWeight: 600, color: "var(--text-1)" }} tag="h4">
                    {t('financialReport.summary')}
                  </CardTitle>
                </CardHeader>
                <CardBody style={{ overflowY: "auto", overflowX: "visible", backgroundColor: "transparent" }}>
                  <div>
                    <div
                      style={getBalanceCardStyle(parseFloat(calculateTotalCash()), {
                        backgroundColor: "var(--surface-3)",
                        padding: "12px 15px",
                        borderRadius: "6px",
                        marginBottom: "12px",
                        border: "1px solid var(--border)",
                      })}
                    >
                      <div style={{ marginBottom: "8px", color: "var(--text-1)", fontWeight: "bold", fontSize: "0.9rem" }}>
                        {t('financialReport.totalCashOnHand')}
                      </div>
                      <BalanceValue
                        value={parseFloat(calculateTotalCash())}
                        tooltip={t("financialReport.cashDeficitTooltip")}
                        style={{ fontSize: "1.1rem" }}
                      >
                        $
                        {parseFloat(calculateTotalCash()).toLocaleString("en-US", {
                          minimumFractionDigits: 2,
                          maximumFractionDigits: 2,
                        })}
                      </BalanceValue>
                    </div>

                    <div
                      style={{
                        backgroundColor: "var(--surface-3)",
                        padding: "12px 15px",
                        borderRadius: "6px",
                        marginBottom: "12px",
                        border: "1px solid var(--border)",
                      }}
                    >
                      <div style={{ marginBottom: "8px", color: "var(--text-1)", fontWeight: "bold", fontSize: "0.9rem" }}>
                        {t('financialReport.totalPayable')}
                      </div>
                      <div
                        style={{
                          color: FINANCIAL_COLORS.payable,
                          fontWeight: "bold",
                          fontSize: "1.1rem",
                        }}
                      >
                        $
                        {parseFloat(calculateTotalPayable()).toLocaleString(
                          "en-US",
                          {
                            minimumFractionDigits: 2,
                            maximumFractionDigits: 2,
                          }
                        )}
                      </div>
                    </div>

                    <div style={{ marginTop: "0px" }}>
                      {/* Commented out dropdown functionality */}
                      {/* <div 
                        style={{ 
                          fontWeight: "bold", 
                          color: "var(--text-1)", 
                          marginBottom: "12px", 
                          fontSize: "0.95rem",
                          display: "flex",
                          alignItems: "center",
                          justifyContent: "space-between",
                          cursor: "pointer",
                          userSelect: "none"
                        }}
                        onClick={() => setIsBreakdownExpanded(!isBreakdownExpanded)}
                      >
                        <span>{t('financialReport.breakdown')}</span>
                        <span style={{ fontSize: "1.2rem", marginLeft: "8px" }}>
                          {isBreakdownExpanded ? "▼" : "▶"}
                        </span>
                      </div>
                      {isBreakdownExpanded && ( */}
                      {/* <div style={{ fontWeight: "bold", color: "var(--text-1)", marginBottom: "12px", fontSize: "0.95rem" }}>
                        {t('financialReport.breakdown')}
                      </div> */}
                      <div style={{ marginTop: "0px" }}>
                        <div
                          style={{
                            backgroundColor: "var(--surface-3)",
                            padding: "12px 15px",
                            borderRadius: "6px",
                            marginBottom: "12px",
                            border: "1px solid var(--border)",
                          }}
                        >
                          <div
                            style={{
                              marginBottom: "8px",
                              color: "var(--text-1)",
                              fontWeight: "bold",
                              fontSize: "0.9rem",
                            }}
                          >
                            {t("financialReport.totalRevenue")}
                          </div>
                          <div
                            style={{
                              color: FINANCIAL_COLORS.income,
                              fontWeight: "bold",
                              fontSize: "1.1rem",
                            }}
                          >
                            $
                            {parseFloat(calculateTotalRevenue()).toLocaleString(
                              "en-US",
                              {
                                minimumFractionDigits: 2,
                                maximumFractionDigits: 2,
                              }
                            )}
                          </div>
                        </div>
                        {/* <div style={{ marginTop: "12px", marginBottom: "12px", borderTop: "1px solid var(--border)", paddingTop: "12px" }}>
                          {Object.entries(revenues)
                            .filter(([purpose, amount]) => {
                              const filteredItems = getFilteredItems();
                              return filteredItems.some(
                                (item) =>
                                  item.transactionPurpose === purpose &&
                                  item.transactionType === "Receive"
                              );
                            })
                            .map(([purpose, amount]) => {
                              const filteredItems = getFilteredItems();
                              const totalAmount = filteredItems.reduce(
                                (sum, item) => {
                                  if (
                                    item.transactionPurpose === purpose &&
                                    item.transactionType === "Receive"
                                  ) {
                                    return (
                                      sum + parseFloat(item.transactionAmount || 0)
                                    );
                                  }
                                  return sum;
                                },
                                0
                              );

                              return (
                                <div
                                  key={purpose}
                                  style={{
                                    marginBottom: "8px",
                                    display: "flex",
                                    justifyContent: "space-between",
                                    alignItems: "center",
                                  }}
                                >
                                  <span style={{ color: "var(--text-1)", fontSize: "0.9rem" }}>
                                    <span style={{ color: "var(--text-1)", fontSize: "0.9rem", marginLeft: "10px" }}>
                                      {translatePurpose(purpose)}:
                                    </span>
                                  </span>
                                  <span
                                    style={{
                                      color: FINANCIAL_COLORS.income,
                                      fontWeight: "bold",
                                      fontSize: "0.9rem",
                                    }}
                                  >
                                    $
                                    {totalAmount.toLocaleString("en-US", {
                                      minimumFractionDigits: 2,
                                      maximumFractionDigits: 2,
                                    })}
                                  </span>
                                </div>
                              );
                            })}
                        </div> */}
                        <div
                          style={{
                            backgroundColor: "var(--surface-3)",
                            padding: "12px 15px",
                            borderRadius: "6px",
                            marginBottom: "12px",
                            border: "1px solid var(--border)",
                          }}
                        >
                          <div
                            style={{
                              marginBottom: "8px",
                              color: "var(--text-1)",
                              fontWeight: "bold",
                              fontSize: "0.9rem",
                            }}
                          >
                            {t("financialReport.totalExpense")}
                          </div>
                          <div
                            style={{
                              color: FINANCIAL_COLORS.expense,
                              fontWeight: "bold",
                              fontSize: "1.1rem",
                            }}
                          >
                            $
                            {parseFloat(
                              calculateTotalExpenses(true)
                            ).toLocaleString("en-US", {
                              minimumFractionDigits: 2,
                              maximumFractionDigits: 2,
                            })}
                          </div>
                        </div>
                        {/* <div style={{ marginTop: "12px", marginBottom: "12px", borderTop: "1px solid var(--border)", paddingTop: "12px" }}>
                          {Object.entries(expenses)
                            .filter(([purpose, amount]) => {
                              const filteredItems = getFilteredItems();
                              // Check for regular expenses (Pay/Payable) OR COGS expenses (sale_inventory)
                              const hasRegularExpense = filteredItems.some(
                                (item) =>
                                  item.transactionPurpose === purpose &&
                                  (item.transactionType === "Pay" ||
                                    (item.transactionType === "Payable" &&
                                      item.status !== "Paid"))
                              );
                              const hasCOGS = filteredItems.some(
                                (item) =>
                                  item.transactionType === "Receive" &&
                                  item.subType === "sale_inventory" &&
                                  (item.assetName === purpose || item.transactionPurpose === purpose)
                              );
                              return hasRegularExpense || hasCOGS;
                            })
                            .map(([purpose, amount]) => {
                              const filteredItems = getFilteredItems();
                              // Calculate total from regular expenses
                              let totalAmount = filteredItems.reduce(
                                (sum, item) => {
                                  if (
                                    item.transactionPurpose === purpose &&
                                    (item.transactionType === "Pay" ||
                                      (item.transactionType === "Payable" &&
                                        item.status !== "Paid"))
                                  ) {
                                    return (
                                      sum + parseFloat(item.transactionAmount || 0)
                                    );
                                  }
                                  return sum;
                                },
                                0
                              );
                              // Add COGS amount
                              filteredItems.forEach((item) => {
                                if (
                                  item.transactionType === "Receive" &&
                                  item.subType === "sale_inventory" &&
                                  (item.assetName === purpose || item.transactionPurpose === purpose)
                                ) {
                                  totalAmount += parseFloat(item.originalAmount || 0);
                                }
                              });

                              const isPaid = filteredItems.some(
                                (item) =>
                                  item.transactionPurpose === purpose &&
                                  item.transactionType === "Payable" &&
                                  item.status === "Paid"
                              );

                              // Check if this is a COGS expense
                              const isCOGS = filteredItems.some(
                                (item) =>
                                  item.transactionType === "Receive" &&
                                  item.subType === "sale_inventory" &&
                                  (item.assetName === purpose || item.transactionPurpose === purpose)
                              );

                              return (
                                <div
                                  key={purpose}
                                  style={{
                                    marginBottom: "8px",
                                    display: "flex",
                                    justifyContent: "space-between",
                                    alignItems: "center",
                                  }}
                                >
                                  <span style={{ color: "var(--text-1)", fontSize: "0.9rem" }}>
                                    {purpose}:
                                  </span>
                                  <span
                                    style={{
                                      color: isCOGS
                                        ? FINANCIAL_COLORS.cashOut
                                        : isPaid
                                          ? FINANCIAL_COLORS.payable
                                          : FINANCIAL_COLORS.expense,
                                      fontWeight: "bold",
                                      fontSize: "0.9rem",
                                    }}
                                  >
                                    $
                                    {totalAmount.toLocaleString(undefined, {
                                      minimumFractionDigits: 2,
                                      maximumFractionDigits: 2,
                                    })}
                                  </span>
                                </div>
                              );
                            })}
                        </div> */}
                      </div>
                      {/* )} Commented out closing bracket for dropdown */}
                    </div>
                  </div>
                </CardBody>
              </Card>

              <Card style={{ marginBottom: "5px" }}>
                <CardHeader>
                  <CardTitle style={{ fontWeight: 600 }} tag="h4">
                    Journal Entry
                  </CardTitle>
                </CardHeader>
                <CardBody
                  style={{
                    overflowY: "auto",
                    overflowX: "hidden",
                    padding: "10px",
                  }}
                >
                  {loadingTransactions ? (
                    <div className="d-flex flex-column align-items-center justify-content-center" style={{ height: "100%", minHeight: "300px" }}>
                      <Spinner color="primary" />
                      <p style={{ color: "var(--text-1)", marginTop: "1rem" }}>Loading transactions...</p>
                    </div>
                  ) : (
                    <div style={{ width: "100%" }}>
                      <TransactionTable
                        items={filterItemsByTimeRange(
                          items,
                          selectedTimeRange,
                          searchTerm
                        )}
                        disabled={
                          userRole === 1
                            ? false
                            : !userSubscription && scheduleCount >= 4
                        }
                        selectedTimeRange={selectedTimeRange}
                        handleDelete={handleDelete}
                        handleEdit={handleEdit}
                        handleAddExpense={handleAddExpense}
                        handleReceiptClick={handleReceiptClick}
                        scheduleCount={scheduleCount}
                        userSubscription={userSubscription}
                      />
                    </div>
                  )}
                </CardBody>
              </Card>

              <Card style={{ marginBottom: "5px", backgroundColor: "transparent", boxShadow: "var(--shadow-1), var(--glass-inset), var(--card-glow)", borderRadius: "8px" }}>
                <CardHeader style={{ backgroundColor: "transparent" }}>
                  <CardTitle tag="h4" style={{ fontWeight: 600, color: "var(--text-1)" }}>
                    {t('financialReport.incomeStatement')}
                  </CardTitle>
                </CardHeader>
                <CardBody
                  style={{
                    overflowY: "auto",
                    overflowX: "hidden",
                    padding: "15px",
                    backgroundColor: "transparent",
                  }}
                >
                  <div
                    style={{
                      overflowX: "auto",
                      overflowY: "visible",
                      width: "100%",
                    }}
                  >
                    <table
                      style={{
                        width: "100%",
                        tableLayout: "auto",
                        borderCollapse: "collapse",
                      }}
                    >
                      <tbody>
                        {renderIncomeStatementRows()}
                      </tbody>
                    </table>
                  </div>
                </CardBody>
              </Card>

              <Card style={{ marginBottom: "5px", backgroundColor: "transparent", boxShadow: "var(--shadow-1), var(--glass-inset), var(--card-glow)", borderRadius: "8px" }}>
                <CardHeader style={{ backgroundColor: "transparent" }}>
                  <CardTitle tag="h4" style={{ fontWeight: 600, color: "var(--text-1)" }}>
                    {t('financialReport.balanceSheet')}
                  </CardTitle>
                </CardHeader>
                <CardBody
                  style={{
                    overflowY: "auto",
                    overflowX: "hidden",
                    padding: "15px",
                    backgroundColor: "transparent",
                  }}
                >
                  <div
                    style={{
                      overflowX: "auto",
                      overflowY: "visible",
                      width: "100%",
                    }}
                  >
                    <table
                      style={{
                        width: "100%",
                        tableLayout: "auto",
                        borderCollapse: "collapse",
                      }}
                    >
                      <tbody>
                        <tr>
                          <td style={{ width: "40%", padding: "8px", border: "1px solid var(--border)", color: "var(--text-1)" }}>
                            <strong>{t('financialReport.assets')}</strong>
                          </td>
                          <td style={{ width: "30%", textAlign: "right", padding: "8px", border: "1px solid var(--border)", color: "var(--text-1)" }}>
                            <strong>{t('financialReport.amount2')}</strong>
                          </td>
                          <td style={{ width: "30%", textAlign: "right", padding: "8px", border: "1px solid var(--border)", color: "var(--text-1)" }}>
                            <strong>{t('financialReport.amount2')}</strong>
                          </td>
                        </tr>
                        <tr>
                          <td style={{ padding: "8px", border: "1px solid var(--border)", color: "var(--text-1)", fontWeight: "bold" }}>{t('financialReport.currentAssets')}</td>
                          <td style={{ padding: "8px", border: "1px solid var(--border)", color: "var(--text-1)" }}></td>
                          <td style={{ padding: "8px", border: "1px solid var(--border)", color: "var(--text-1)" }}></td>
                        </tr>
                        <tr>
                          <td style={{ padding: "8px", border: "1px solid var(--border)", color: "var(--text-1)" }}>{t('financialReport.cash')}</td>
                          <td style={{ color: getBalanceColor(calculateTotalCash()), textAlign: "right", padding: "8px", border: "1px solid var(--border)" }}>
                            $ {parseFloat(calculateTotalCash()).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                          </td>
                          <td style={{ padding: "8px", border: "1px solid var(--border)", color: "var(--text-1)" }}></td>
                        </tr>
                        <tr
                          onClick={() => setIsInventoryExpanded(!isInventoryExpanded)}
                          style={{ cursor: "pointer" }}
                        >
                          <td style={{ padding: "8px", border: "1px solid var(--border)", color: "var(--text-1)", fontWeight: "bold" }}>
                            {t('financialReport.inventory')} {isInventoryExpanded ? "▼" : "▶"}
                          </td>
                          <td style={{ padding: "8px", border: "1px solid var(--border)", color: "var(--text-1)" }}></td>
                          <td style={{ padding: "8px", border: "1px solid var(--border)", color: "var(--text-1)" }}></td>
                        </tr>
                        {isInventoryExpanded && getInventoryBreakdown().map(({ name, balance }) => (
                          <tr key={`bs2-inv-${name}`}>
                            <td style={{ padding: "8px", border: "1px solid var(--border)", color: "var(--text-1)", paddingLeft: "20px" }}>{name}</td>
                            <td style={{ color: FINANCIAL_COLORS.asset, textAlign: "right", padding: "8px", border: "1px solid var(--border)" }}>
                              $ {parseFloat(balance).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                            </td>
                            <td style={{ padding: "8px", border: "1px solid var(--border)", color: "var(--text-1)" }}></td>
                          </tr>
                        ))}
                        <tr>
                          <td style={{ padding: "8px", border: "1px solid var(--border)", color: "var(--text-1)", fontWeight: "bold" }}>
                            <strong>{t('financialReport.totalInventory')}</strong>
                          </td>
                          <td style={{ color: FINANCIAL_COLORS.asset, fontWeight: "bold", textAlign: "right", padding: "8px", border: "1px solid var(--border)" }}>
                            $ {parseFloat(calculateTotalInventory()).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                          </td>
                          <td style={{ padding: "8px", border: "1px solid var(--border)", color: "var(--text-1)" }}></td>
                        </tr>
                        <tr>
                          <td style={{ padding: "8px", border: "1px solid var(--border)", color: "var(--text-1)", fontWeight: "bold" }}><strong>{t('financialReport.totalCurrentAssets')}</strong></td>
                          <td style={{ color: FINANCIAL_COLORS.income, fontWeight: "bold", textAlign: "right", padding: "8px", border: "1px solid var(--border)" }}>
                            $ {(parseFloat(calculateTotalCash()) + parseFloat(calculateTotalInventory())).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                          </td>
                          <td style={{ padding: "8px", border: "1px solid var(--border)", color: "var(--text-1)" }}></td>
                        </tr>
                        <tr>
                          <td style={{ padding: "8px", border: "1px solid var(--border)", color: "var(--text-1)", fontWeight: "bold" }}>{t('financialReport.fixedAssets')}</td>
                          <td style={{ padding: "8px", border: "1px solid var(--border)", color: "var(--text-1)" }}></td>
                          <td style={{ padding: "8px", border: "1px solid var(--border)", color: "var(--text-1)" }}></td>
                        </tr>
                        {getFixedAssetBreakdown().map(({ name, balance }) => (
                          <tr key={`bs2-${name}`}>
                            <td style={{ padding: "8px", border: "1px solid var(--border)", color: "var(--text-1)", paddingLeft: "20px" }}>{name}</td>
                            <td style={{ color: "var(--text-1)", textAlign: "right", padding: "8px", border: "1px solid var(--border)" }}>
                              $ {parseFloat(balance).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                            </td>
                            <td style={{ padding: "8px", border: "1px solid var(--border)", color: "var(--text-1)" }}></td>
                          </tr>
                        ))}
                        <tr>
                          <td style={{ padding: "8px", border: "1px solid var(--border)", color: "var(--text-1)", fontWeight: "bold" }}><strong>{t('financialReport.totalFixedAssets')}</strong></td>
                          <td style={{ color: FINANCIAL_COLORS.income, fontWeight: "bold", textAlign: "right", padding: "8px", border: "1px solid var(--border)" }}>
                            $ {parseFloat(calculateTotalFixedAssets()).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                          </td>
                          <td style={{ padding: "8px", border: "1px solid var(--border)", color: "var(--text-1)" }}></td>
                        </tr>
                        <tr>
                          <td style={{ padding: "8px", border: "1px solid var(--border)", color: "var(--text-1)", fontWeight: "bold" }}><strong>{t('financialReport.totalAssets')}</strong></td>
                          <td style={{ color: FINANCIAL_COLORS.income, fontWeight: "bold", textAlign: "right", padding: "8px", border: "1px solid var(--border)" }}>
                            $ {(parseFloat(calculateTotalCash()) + parseFloat(calculateTotalInventory()) + parseFloat(calculateTotalFixedAssets())).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                          </td>
                          <td style={{ padding: "8px", border: "1px solid var(--border)", color: "var(--text-1)" }}></td>
                        </tr>
                        <tr>
                          <td style={{ padding: "8px", border: "1px solid var(--border)", color: "var(--text-1)", fontWeight: "bold" }}>
                            <strong>{t('financialReport.liabilitiesEquity')}</strong>
                          </td>
                          <td style={{ padding: "8px", border: "1px solid var(--border)", color: "var(--text-1)" }}></td>
                          <td
                            style={{ padding: "8px", border: "1px solid var(--border)", color: "var(--text-1)" }}
                          ></td>
                        </tr>
                        <tr>
                          <td
                            style={{ padding: "8px", border: "1px solid var(--border)", color: "var(--text-1)" }}
                          >
                            {t('financialReport.payable')}
                          </td>
                          <td
                            style={{ padding: "8px", border: "1px solid var(--border)", color: "var(--text-1)" }}
                          ></td>
                          <td
                            style={{
                              color: FINANCIAL_COLORS.payable,
                              textAlign: "right",
                              padding: "8px",
                              border: "1px solid var(--border)",
                            }}
                          >
                            $
                            {parseFloat(calculateTotalPayable()).toLocaleString(
                              "en-US",
                              {
                                minimumFractionDigits: 2,
                                maximumFractionDigits: 2,
                              }
                            )}
                          </td>
                        </tr>
                        <tr>
                          <td
                            style={{ padding: "8px", border: "1px solid var(--border)", color: "var(--text-1)" }}
                          >
                            {t('financialReport.beginningEquity')}
                          </td>
                          <td
                            style={{ padding: "8px", border: "1px solid var(--border)", color: "var(--text-1)" }}
                          ></td>
                          <td
                            style={{
                              color: "var(--text-1)",
                              textAlign: "right",
                              padding: "8px",
                              border: "1px solid var(--border)",
                            }}
                          >
                            $
                            {(
                              initialBalance +
                              initialvalueableItems -
                              initialoutstandingDebt
                            ).toLocaleString("en-US", {
                              minimumFractionDigits: 2,
                              maximumFractionDigits: 2,
                            })}
                          </td>
                        </tr>
                        <tr>
                          <td
                            style={{ padding: "8px", border: "1px solid var(--border)", color: "var(--text-1)" }}
                          >
                            {t('financialReport.retainedEarnings')}
                          </td>
                          <td
                            style={{ padding: "8px", border: "1px solid var(--border)", color: "var(--text-1)" }}
                          ></td>
                          <td
                            style={{
                              color: getNetIncomeColor(
                                parseFloat(calculateTotalRevenue()) -
                                  parseFloat(calculateTotalExpenses())
                              ),
                              textAlign: "right",
                              padding: "8px",
                              border: "1px solid var(--border)",
                            }}
                          >
                            $
                            {(
                              parseFloat(calculateTotalRevenue()) -
                              parseFloat(calculateTotalExpenses())
                            ).toLocaleString("en-US", {
                              minimumFractionDigits: 2,
                              maximumFractionDigits: 2,
                            })}
                          </td>
                        </tr>
                        <tr>
                          <td
                            style={{ padding: "8px", border: "1px solid var(--border)", color: "var(--text-1)", fontWeight: "bold" }}
                          >
                            <strong>{t('financialReport.totalLiabilitiesEquity')}</strong>
                          </td>
                          <td
                            style={{ padding: "8px", border: "1px solid var(--border)", color: "var(--text-1)" }}
                          ></td>
                          <td
                            style={{
                              color: FINANCIAL_COLORS.income,
                              fontWeight: "bold",
                              textAlign: "right",
                              padding: "8px",
                              border: "1px solid var(--border)",
                            }}
                          >
                            $
                            {(
                              parseFloat(calculateTotalPayable()) +
                              (initialBalance + initialvalueableItems - initialoutstandingDebt) +
                              (parseFloat(calculateTotalRevenue()) - parseFloat(calculateTotalExpenses()))
                            ).toLocaleString("en-US", {
                              minimumFractionDigits: 2,
                              maximumFractionDigits: 2,
                            })}
                          </td>
                        </tr>
                      </tbody>
                    </table>
                  </div>
                </CardBody>
              </Card>
            </Col>
          </Row>
        </Container>
        <Modal isOpen={editModalOpen} toggle={() => setEditModalOpen(false)}>
          <ModalHeader toggle={() => setEditModalOpen(false)}>
            {t('financialReport.editTransaction')}
          </ModalHeader>
          <ModalBody>
            <FormGroup>
              <Label>Type</Label>
              <Input
                type="select"
                value={editType}
                onChange={(e) => setEditType(e.target.value)}
              >
                {!["Receive", "Pay"].includes(editType) && (
                  <option value={editType}>{editType}</option>
                )}
                <option value="Receive">Receive</option>
                <option value="Pay">Pay</option>
              </Input>
            </FormGroup>
            <FormGroup>
              <Label>Purpose</Label>
              <Input
                type="text"
                value={editPurpose}
                onChange={(e) => setEditPurpose(e.target.value)}
                placeholder="Transaction purpose"
              />
            </FormGroup>
            <FormGroup>
              <Label>Amount</Label>
              <Input
                type="number"
                min="0"
                step="0.01"
                value={editAmount}
                onChange={(e) => setEditAmount(e.target.value)}
                placeholder="0.00"
              />
            </FormGroup>
          </ModalBody>
          <ModalFooter>
            <Button
              color="secondary"
              onClick={() => setEditModalOpen(false)}
              disabled={savingEdit}
            >
              Cancel
            </Button>
            <Button color="primary" onClick={handleSaveEdit} disabled={savingEdit}>
              {savingEdit ? <Spinner size="sm" /> : "Save"}
            </Button>
          </ModalFooter>
        </Modal>

        {/* <Modal
          isOpen={showDeleteConfirmation}
          toggle={() => setShowDeleteConfirmation(false)}
        >
          <ModalHeader toggle={() => setShowDeleteConfirmation(false)}>
         {t('financialReport.confirmDelete')}
          </ModalHeader>
          <ModalBody>
           {t('financialReport.confirmDeleteMessage')}
            <div className="modal-footer">
              <Button
                color="danger"
                onClick={() => {
                  confirmDeleteandsave();
                }}
              >
              {t('financialReport.saveAndDeleteAll')}
              </Button>
              <Button
                color="secondary"
                onClick={() => setShowDeleteConfirmation(false)}
              >
                {t('common.cancel')}
              </Button>
              <Button color="danger" onClick={confirmDelete}>
             {t('financialReport.deleteAll')}
              </Button>
            </div>
          </ModalBody>
        </Modal> */}

        <Modal
          isOpen={showAddTransaction}
          toggle={() => {
            resetForm();
            setShowAddTransaction(false);
          }}
          className="add-transaction-modal"
        >
          <ModalHeader
            toggle={() => {
              resetForm();
              setShowAddTransaction(false);
            }}
          >
            {editingTransaction ? t('financialReport.editTransaction') : t('financialReport.addTransaction')}
            <span className="mksv-modal-sub">
              {t('financialReport.addTransactionSubtitle', 'Record money in, money out, or what you owe.')}
            </span>
          </ModalHeader>
          <ModalBody>
            <FormGroup>
              <Label>{t('financialReport.type')}:</Label>
              <div style={{ display: "flex", gap: "10px" }}>
                <Button
                  color={
                    transactionType === "receive" ? "primary" : "secondary"
                  }
                  className="transaction-type-btn type-in"
                  onClick={() => {
                    setTransactionType("receive");
                    setPaymentMode(null);
                    setReceiveSubMode(null);
                    setReceiveSaleAssetName("");
                    setReceiveSaleAssetCost(0);
                  }}
                >
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M12 5v10" /><path d="m7 12 5 5 5-5" /><path d="M5 20h14" /></svg>
                  {t('financialReport.receivedCash')}
                </Button>
                <Button
                  color={transactionType === "pay" ? "primary" : "secondary"}
                  className="transaction-type-btn type-out"
                  onClick={() => {
                    setTransactionType("pay");
                    setPaymentMode(null);
                  }}
                >
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M12 19V9" /><path d="m7 12 5-5 5 5" /><path d="M5 4h14" /></svg>
                  {t('financialReport.paidCash')}
                </Button>
                <Button
                  color={
                    transactionType === "Payable" ? "primary" : "secondary"
                  }
                  className="transaction-type-btn type-owed"
                  onClick={() => {
                    setTransactionType("Payable");
                    setPaymentMode(null);
                  }}
                >
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="9" /><path d="M12 7v5l3 2" /></svg>
                  {t('financialReport.haventYetPaid')}
                </Button>
              </div>
            </FormGroup>
            {/* Show action buttons for Pay Cash */}
            {transactionType === "pay" && (
              <FormGroup>
                <Label>{t('financialReport.selectAction')}:</Label>
                <div
                  className="mksv-actions mksv-actions--out"
                  style={{
                    display: "flex",
                    gap: "5px",
                    marginBottom: "15px",
                  }}
                >
                  <Button
                    color="secondary"
                    className={`transaction-action-btn${paymentMode === "recorded" ? " is-selected" : ""}`}
                    onClick={() => {
                      setsubType("Recorded");
                      setPaymentMode("recorded");
                    }}
                  >
                    {t('financialReport.recordedEarlierAsPayable')}
                  </Button>

                  <Button
                    color="secondary"
                    className={`transaction-action-btn action-expense${paymentMode === "new" ? " is-selected" : ""}`}
                    onClick={() => {
                      setsubType("Expense");
                      setPaymentMode("new");
                    }}
                  >
                    {t('financialReport.newExpense')}
                  </Button>
                  <Button
                    color="secondary"
                    className={`transaction-action-btn action-new-item${paymentMode === "boughtItem" ? " is-selected" : ""}`}
                    onClick={() => {
                      setsubType("New_Item");
                      setPaymentMode("boughtItem");
                    }}
                  >
                    {t('financialReport.boughtNewItem')}
                  </Button>
                </div>
              </FormGroup>
            )}
            {/* Receive Cash: Select Action */}
            {transactionType === "receive" && (
              <FormGroup>
                <Label>{t('financialReport.selectAction')}:</Label>
                <div className="mksv-actions mksv-actions--in" style={{ display: "flex", gap: "5px", marginBottom: "15px", flexWrap: "wrap" }}>
                  {getCurrentAssetItems().length > 0 && (
                  <Button
                    color={receiveSubMode === "saleCurrent" ? "primary" : "secondary"}
                    className="transaction-action-btn"
                    onClick={() => {
                      setReceiveSubMode("saleCurrent");
                      setReceiveSaleAssetName("");
                      setReceiveSaleAssetCost(0);
                      setSelectedSaleItem(null);
                    }}
                  >
                    {t('financialReport.recordedEarlierAsCurrentAssets')}
                  </Button>
                  )}
                  {getFixedAssetItems().length > 0 && (
                  <Button
                    color={receiveSubMode === "saleFixed" ? "primary" : "secondary"}
                    className="transaction-action-btn"
                    onClick={() => {
                      setReceiveSubMode("saleFixed");
                      setReceiveSaleAssetName("");
                      setReceiveSaleAssetCost(0);
                      setSelectedSaleItem(null);
                    }}
                  >
                    {t('financialReport.recordedEarlierAsFixedAsset')}
                  </Button>
                  )}
                  <Button
                    color={receiveSubMode === "other" ? "primary" : "secondary"}
                    className="transaction-action-btn"
                    onClick={() => {
                      setReceiveSubMode("other");
                      setReceiveSaleAssetName("");
                      setReceiveSaleAssetCost(0);
                      setSelectedSaleItem(null);
                    }}
                  >
                    {t('financialReport.otherIncome')}
                  </Button>
                </div>
              </FormGroup>
            )}
            {/* Show dropdown for recorded payment mode under Pay Cash */}
            {selectedBusinessType === "Other" && (
              <div className="manual-purpose-management">
                <h4>{t('financialReport.manageCustomPurposes')}</h4>
                <Input
                  type="text"
                  value={newPurpose}
                  onChange={(e) => setNewPurpose(e.target.value)}
                  placeholder={t('financialReport.enterNewPurpose')}
                />
                <Input
                  type="select"
                  value={purposeType}
                  onChange={(e) => setPurposeType(e.target.value)}
                >
                  <option value="income">{t('financialReport.incomePurpose')}</option>
                  <option value="expense">{t('financialReport.expensePurpose')}</option>
                  <option value="payable">{t('financialReport.payablePurpose')}</option>
                </Input>
                <Button onClick={handleAddPurpose}>{t('financialReport.addPurpose')}</Button>
              </div>
            )}

            {/* Show action buttons for Haven't Yet Paid (Payable) */}
            {transactionType === "Payable" && (
              <FormGroup>
                <Label>{t('financialReport.selectAction')}:</Label>
                <div
                  className="mksv-actions mksv-actions--owed"
                  style={{ display: "flex", gap: "5px", marginBottom: "15px" }}
                >
                  <Button
                    color="secondary"
                    className={`transaction-action-btn action-expense${payableSubMode === "expense" ? " is-selected" : ""}`}
                    onClick={() => {
                      setPayableSubMode("expense");
                      setPaymentMode(null);
                    }}
                  >
                    {t('financialReport.expense')}
                  </Button>
                  <Button
                    color="secondary"
                    className={`transaction-action-btn action-new-item${payableSubMode === "boughtItem" ? " is-selected" : ""}`}
                    onClick={() => {
                      setPayableSubMode("boughtItem");
                      setPaymentMode(null);
                    }}
                  >
                    {t('financialReport.boughtNewItem')}
                  </Button>
                </div>
              </FormGroup>
            )}

            {transactionType === "pay" && paymentMode === "recorded" && (
              <>

                <FormGroup>
                  <Label>{t('financialReport.selectUnpaidTransaction')}:</Label>
                  <Input
                    type="select"
                    value={
                      selectedUnpaidTransaction
                        ? selectedUnpaidTransaction.id
                        : ""
                    }
                    onChange={(e) => {
                      const selected = unpaidTransactions.find(
                        (t) =>
                          t.id ===
                          (e.target.value === "outstanding-debt"
                            ? e.target.value
                            : parseInt(e.target.value))
                      );
                      setSelectedUnpaidTransaction(selected);
                      setPaymentOption(null);
                      setPartialPaymentError(null); // Add this line
                    }}
                  >
                    <option value="">{t('financialReport.selectTransaction')}</option>
                    {unpaidTransactions
                      .filter(
                        (t) => t.status !== "Paid" && t.transactionAmount !== 0
                      )
                      .map((t) => {
                        // Show what's LEFT to pay, not the original amount. After a
                        // partial payment the remaining balance is what matters; if
                        // some has been paid, also show the original for context.
                        const original = parseFloat(t.originalAmount || t.transactionAmount) || 0;
                        const remaining =
                          parseFloat(t.remainingAmount != null ? t.remainingAmount : t.transactionAmount) || 0;
                        // Show assetName if available, otherwise transactionPurpose
                        const displayName = t.assetName || t.transactionPurpose;
                        const label =
                          remaining < original
                            ? `${displayName} - $${remaining.toFixed(2)} left (of $${original.toFixed(2)})`
                            : `${displayName} - $${original.toFixed(2)}`;
                        return (
                          <option key={t.id} value={t.id}>
                            {label}
                          </option>
                        );
                      })}
                  </Input>
                </FormGroup>

                {selectedUnpaidTransaction && (
                  <FormGroup tag="fieldset">
                    <legend>{t('financialReport.paymentOption')}:</legend>
                    <FormGroup check>
                      <Label check>
                        <Input
                          type="radio"
                          name="paymentOption"
                          value="full"
                          checked={paymentOption === "full"}
                          onChange={() => setPaymentOption("full")}
                        />{" "}
                        {t('financialReport.fullPayment')}
                      </Label>
                    </FormGroup>
                    <FormGroup check>
                      <Label check>
                        <Input
                          type="radio"
                          name="paymentOption"
                          value="partial"
                          checked={paymentOption === "partial"}
                          onChange={() => setPaymentOption("partial")}
                        />{" "}
                        {t('financialReport.partialPayment')}
                      </Label>
                    </FormGroup>
                  </FormGroup>
                )}


                {selectedUnpaidTransaction && paymentOption === "partial" && (
                  <FormGroup>
                    <Label>{t('financialReport.partialPaymentAmount')}:</Label>
                    <Input
                      className="no-number-spinner"
                      type="number"
                      value={remainingAmount}
                      onChange={(e) => {
                        const limited = limitToTwoDecimals(e.target.value);
                        const value = parseFloat(limited);
                        setRemainingAmount(limited);

                        const currentRemaining = selectedUnpaidTransaction.remainingAmount || selectedUnpaidTransaction.transactionAmount;

                        // Validate that partial payment is less than or equal to remaining amount
                        if (value > currentRemaining) {
                          setPartialPaymentError(
                            `Partial payment cannot exceed $${currentRemaining.toFixed(2)}`
                          );
                        } else if (value <= 0) {
                          setPartialPaymentError(
                            "Amount must be greater than $0"
                          );
                        } else {
                          setPartialPaymentError(null);
                        }
                      }}
                      min="0.01"
                      max={selectedUnpaidTransaction.remainingAmount || selectedUnpaidTransaction.transactionAmount}
                      step="0.01"
                      invalid={!!partialPaymentError}
                    />
                    {partialPaymentError && (
                      <div
                        className="text-danger mt-1"
                        style={{ fontSize: "0.875rem" }}
                      >
                        {partialPaymentError}
                      </div>
                    )}
                    <small className="text-muted">
                      Maximum: $
                      {(
                        selectedUnpaidTransaction.remainingAmount || selectedUnpaidTransaction.transactionAmount
                      ).toFixed(2)}
                    </small>
                    <div className="mt-2" style={{ fontSize: "0.9rem" }}>
                      <strong>{t('financialReport.amountRemaining')}:</strong>{" "}
                      ${Math.max(
                        0,
                        (selectedUnpaidTransaction.remainingAmount || selectedUnpaidTransaction.transactionAmount) -
                          (parseFloat(remainingAmount) || 0)
                      ).toFixed(2)}
                    </div>
                  </FormGroup>
                )}
                {/* Receipts form */}
                <FormGroup>
                  <Label>{t('financialReport.receipt')}:</Label>
                  <div
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: "10px",
                    }}
                  >
                    <Button
                      color="info"
                      onClick={() => fileInputRef.current.click()}
                      style={{ marginBottom: "0" }}
                    >
                      {receipt ? t('financialReport.changeReceipt') : t('financialReport.uploadReceipt')}
                    </Button>
                    {receipt && (
                      <span style={{ color: "green" }}>✓ {receipt.name}</span>
                    )}
                  </div>
                  <Input
                    type="file"
                    innerRef={fileInputRef}
                    onChange={handleReceiptUpload}
                    accept="image/*,.pdf"
                    style={{ display: "none" }}
                  />
                </FormGroup>
                <Button
                  color="success"
                  onClick={() =>
                    handleUpdateTransaction(selectedUnpaidTransaction)
                  }
                  // disabled={!selectedUnpaidTransaction || isUpdatingTransaction}
                  disabled={
                    paymentOption === "partial" &&
                    (!remainingAmount ||
                      partialPaymentError ||
                      parseFloat(remainingAmount) > (selectedUnpaidTransaction.remainingAmount || selectedUnpaidTransaction.transactionAmount) ||
                      parseFloat(remainingAmount) <= 0)
                  }
                >
                  {isUpdatingTransaction ? (
                    <Spinner size="sm" />
                  ) : (
                    "Update to Paid"
                  )}
                </Button>
              </>
            )}
            {transactionType === "pay" && paymentMode === "boughtItem" && (
              <>
                <FormGroup>
                  <AssetTypeLabel />
                  <Input type="select" value={assetType} onChange={(e) => { setAssetType(e.target.value); setAssetName("manual"); setAssetNameManual(""); }}>
                    <option value="">{t('financialReport.selectAssetType')}</option>
                    <option value="fixed">{t('financialReport.fixedAsset')}</option>
                    <option value="current">{t('financialReport.currentAsset')}</option>
                    <option value="cogs">{t('financialReport.costOfGoodsExpense')}</option>
                  </Input>
                  {assetType === "cogs" && (
                    <small style={{ display: "block", marginTop: "6px", color: "var(--text-3)", fontSize: "12px" }}>
                      {t('financialReport.costOfGoodsHint')}
                    </small>
                  )}
                </FormGroup>
                {assetType && (
                  <FormGroup>
                    <Label>{t('financialReport.itemName')}:</Label>
                    <Input
                      type="text"
                      placeholder={t('financialReport.enterItemName')}
                      value={assetNameManual}
                      onChange={(e) => setAssetNameManual(e.target.value)}
                    />
                  </FormGroup>
                )}

                <FormGroup>
                  <Label>{t('financialReport.amount')}:</Label>
                  <Input
                    className="no-number-spinner"
                    type="number"
                    step="0.01"
                    value={transactionAmount}
                    onChange={(e) => setTransactionAmount(limitToTwoDecimals(e.target.value))}
                  />
                </FormGroup>
                <FormGroup>
                  <Label>{t('financialReport.receipt')}:</Label>
                  <div
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: "10px",
                    }}
                  >
                    <Button
                      color="info"
                      onClick={() => fileInputRef.current.click()}
                      style={{ marginBottom: "0" }}
                    >
                      {receipt ? t('financialReport.changeReceipt') : t('financialReport.uploadReceipt')}
                    </Button>
                    {receipt && (
                      <span style={{ color: "green" }}>✓ {receipt.name}</span>
                    )}
                  </div>
                  <Input
                    type="file"
                    innerRef={fileInputRef}
                    onChange={handleReceiptUpload}
                    accept="image/*,.pdf"
                    style={{ display: "none" }}
                  />
                </FormGroup>

                <Button
                  color="success"
                  onClick={handleAddTransaction}
                  disabled={isAddingTransaction || !assetType || !(assetNameManual || "").trim()}
                >
                  {isAddingTransaction ? <Spinner size="sm" /> : t('financialReport.save')}
                </Button>
              </>
            )}
            {transactionType === "Payable" && payableSubMode === "boughtItem" && (
              <>
                {/* <FormGroup>
                  <Label>{t('financialReport.purpose')}:</Label>
                  <Input type="select" value={transactionPurpose} onChange={(e) => setTransactionPurpose(e.target.value)}>
                    <option value="">{t('financialReport.selectPurpose')}</option>
                    {boughtNewItemPurposes.map((p, i) => <option key={i} value={p}>{p}</option>)}
                    <option value="manual">{t('financialReport.enterManually')}</option>
                  </Input>
                  {transactionPurpose === "manual" && (
                    <Input type="text" placeholder={t('financialReport.enterPurposeManually')} value={manualPurpose} onChange={(e) => setManualPurpose(e.target.value)} />
                  )}
                </FormGroup> */}
                <FormGroup>
                  <AssetTypeLabel />
                  <Input type="select" value={assetType} onChange={(e) => { setAssetType(e.target.value); setAssetName("manual"); setAssetNameManual(""); }}>
                    <option value="">{t('financialReport.selectAssetType')}</option>
                    <option value="fixed">{t('financialReport.fixedAsset')}</option>
                    <option value="current">{t('financialReport.currentAsset')}</option>
                    <option value="cogs">{t('financialReport.costOfGoodsExpense')}</option>
                  </Input>
                  {assetType === "cogs" && (
                    <small style={{ display: "block", marginTop: "6px", color: "var(--text-3)", fontSize: "12px" }}>
                      {t('financialReport.costOfGoodsHint')}
                    </small>
                  )}
                </FormGroup>
                {assetType && (
                  <FormGroup>
                    <Label>{t('financialReport.itemName')}:</Label>
                    <Input
                      type="text"
                      placeholder={t('financialReport.enterItemName')}
                      value={assetNameManual}
                      onChange={(e) => setAssetNameManual(e.target.value)}
                    />
                  </FormGroup>
                )}
                <FormGroup>
                  <Label>{t('financialReport.amount')}:</Label>
                  <Input className="no-number-spinner" type="number" step="0.01" value={transactionAmount} onChange={(e) => setTransactionAmount(limitToTwoDecimals(e.target.value))} />
                </FormGroup>
                <Button color="success" onClick={handleAddTransaction} disabled={isAddingTransaction || !assetType || !(assetNameManual || "").trim()}>
                  {isAddingTransaction ? <Spinner size="sm" /> : t('financialReport.save')}
                </Button>
              </>
            )}
            {/* Receive: Recorded earlier as current assets */}
            {transactionType === "receive" && receiveSubMode === "saleCurrent" && (
              <>
                <FormGroup>
                  <Label>{t('financialReport.itemName')} ({t('financialReport.recordedEarlierAsCurrentAssets')}):</Label>
                  <Input
                    type="select"
                    value={selectedSaleItem ? selectedSaleItem.id : ""}
                    onChange={(e) => {
                      const selectedId = e.target.value;
                      const item = getCurrentAssetItems().find(i => String(i.id) === selectedId);
                      if (item) {
                        setSelectedSaleItem(item);
                        setReceiveSaleAssetName(item.name);
                        setReceiveSaleAssetCost(item.amount);
                      } else {
                        setSelectedSaleItem(null);
                        setReceiveSaleAssetName("");
                        setReceiveSaleAssetCost(0);
                      }
                    }}
                  >
                    <option value="">{t('financialReport.selectItem')}</option>
                    {getCurrentAssetItems().map((item) => (
                      <option key={item.id} value={item.id}>{item.displayName}</option>
                    ))}
                  </Input>
                  {selectedSaleItem && (
                    <small style={{ color: "#aaa" }}>Cost (book value): ${parseFloat(selectedSaleItem.amount).toFixed(2)}</small>
                  )}
                </FormGroup>
                <FormGroup>
                  <Label>{t('financialReport.amount')}:</Label>
                  <Input className="no-number-spinner" type="number" step="0.01" value={transactionAmount} onChange={(e) => setTransactionAmount(limitToTwoDecimals(e.target.value))} placeholder="e.g. 1500" />
                </FormGroup>
                <Button color="success" onClick={handleAddTransaction} disabled={isAddingTransaction || !selectedSaleItem || !transactionAmount}>
                  {isAddingTransaction ? <Spinner size="sm" /> : t('financialReport.save')}
                </Button>
              </>
            )}
            {/* Receive: Recorded earlier as fixed asset */}
            {transactionType === "receive" && receiveSubMode === "saleFixed" && (
              <>
                <FormGroup>
                  <Label>{t('financialReport.itemName')} ({t('financialReport.recordedEarlierAsFixedAsset')}):</Label>
                  <Input
                    type="select"
                    value={selectedSaleItem ? selectedSaleItem.id : ""}
                    onChange={(e) => {
                      const selectedId = e.target.value;
                      const item = getFixedAssetItems().find(i => String(i.id) === selectedId);
                      if (item) {
                        setSelectedSaleItem(item);
                        setReceiveSaleAssetName(item.name);
                        setReceiveSaleAssetCost(item.amount);
                      } else {
                        setSelectedSaleItem(null);
                        setReceiveSaleAssetName("");
                        setReceiveSaleAssetCost(0);
                      }
                    }}
                  >
                    <option value="">{t('financialReport.selectItem')}</option>
                    {getFixedAssetItems().map((item) => (
                      <option key={item.id} value={item.id}>{item.displayName}</option>
                    ))}
                  </Input>
                  {selectedSaleItem && (
                    <small style={{ color: "#aaa" }}>Book value: ${parseFloat(selectedSaleItem.amount).toFixed(2)}</small>
                  )}
                </FormGroup>
                <FormGroup>
                  <Label>{t('financialReport.amount')}:</Label>
                  <Input className="no-number-spinner" type="number" step="0.01" value={transactionAmount} onChange={(e) => setTransactionAmount(limitToTwoDecimals(e.target.value))} placeholder="Sale amount" />
                </FormGroup>
                <Button color="success" onClick={handleAddTransaction} disabled={isAddingTransaction || !selectedSaleItem || !transactionAmount}>
                  {isAddingTransaction ? <Spinner size="sm" /> : t('financialReport.save')}
                </Button>
              </>
            )}
            {/* Show regular form fields for other cases (Other income, Pay expense, Payable expense) */}
            {((transactionType === "receive" && receiveSubMode === "other") ||
              (transactionType === "pay" && paymentMode === "new") ||
              (transactionType === "Payable" && payableSubMode === "expense")) && (
                <>
                  <FormGroup>
                    <Label>{t('financialReport.purpose')}:</Label>

                    <Input
                      type="select"
                      value={transactionPurpose}
                      onChange={(e) => setTransactionPurpose(e.target.value)}
                    >
                      <option value="">{t('financialReport.selectPurpose')}</option>
                      {transactionType === "receive" && receiveSubMode === "other" && (
                        <>
                          {incomePurposes.map((purpose, index) => (
                            <option key={index} value={purpose}>
                              {stripBrackets(purpose)}
                            </option>
                          ))}
                          <option value="manual">{t('financialReport.enterManually')}</option>
                        </>
                      )}
                      {transactionType === "pay" && paymentMode === "new" && (
                        <>
                          {expensePurposes.map((purpose, index) => (
                            <option key={index} value={purpose}>
                              {stripBrackets(purpose)}
                            </option>
                          ))}
                          <option value="manual">{t('financialReport.enterManually')}</option>
                        </>
                      )}
                      {transactionType === "Payable" && payableSubMode === "expense" && (
                        <>
                          {payablePurposes
                            .filter(
                              (p) =>
                                p !== t("businessTypes.payables.inventoryPurchases") &&
                                p !== t("businessTypes.payables.inventoryAdjustments")
                            )
                            .map((purpose, index) => (
                              <option key={index} value={purpose}>
                                {stripBrackets(purpose)}
                              </option>
                            ))}
                          <option value="manual">{t('financialReport.enterManually')}</option>
                        </>
                      )}
                    </Input>
                    {((transactionType === "receive" &&
                      transactionPurpose === "manual") ||
                      (transactionType === "pay" &&
                        paymentMode === "new" &&
                        transactionPurpose === "manual") ||
                      (transactionType === "Payable" &&
                        transactionPurpose === "manual")) && (
                        <FormGroup>
                          <Input
                            type="text"
                            placeholder="Enter purpose manually"
                            value={manualPurpose}
                            onChange={(e) => {
                              setManualPurpose(e.target.value);
                              setFormErrors({ ...formErrors, manualPurpose: "" });
                            }}
                            style={{ marginTop: "10px" }}
                            invalid={!!formErrors.manualPurpose}
                          />
                          {formErrors.manualPurpose && (
                            <div className="text-danger">
                              {formErrors.manualPurpose}
                            </div>
                          )}
                        </FormGroup>
                      )}
                  </FormGroup>

                  <FormGroup>
                    <Label>{t('financialReport.amount')}:</Label>
                    <Input
                      className="no-number-spinner"
                      type="number"
                      step="0.01"
                      value={transactionAmount}
                      onChange={(e) => setTransactionAmount(limitToTwoDecimals(e.target.value))}
                    />
                  </FormGroup>
                  {transactionType === "pay" && paymentMode === "new" && (
                    <FormGroup>
                      <Label>Receipt:</Label>
                      <div
                        style={{
                          display: "flex",
                          alignItems: "center",
                          gap: "10px",
                        }}
                      >
                        <Button
                          color="info"
                          onClick={() => fileInputRef.current.click()}
                          style={{ marginBottom: "0" }}
                        >
                          {receipt ? "Change Receipt" : "Upload Receipt"}
                        </Button>
                        {receipt && (
                          <span style={{ color: "green" }}>✓ {receipt.name}</span>
                        )}
                      </div>
                      <Input
                        type="file"
                        innerRef={fileInputRef}
                        onChange={handleReceiptUpload}
                        accept="image/*,.pdf"
                        style={{ display: "none" }}
                      />
                    </FormGroup>
                  )}
                  <Button
                    color="success"
                    onClick={handleAddTransaction}
                    disabled={isAddingTransaction}
                  >
                    {isAddingTransaction ? <Spinner size="sm" /> : t('financialReport.save')}
                  </Button>
                </>
              )}
          </ModalBody>
        </Modal>
        {/* Previe modal */}
        <Modal
          isOpen={previewModal}
          toggle={() => setPreviewModal(false)}
          size="lg"
        >
          <ModalHeader toggle={() => setPreviewModal(false)}>
            {t('receipts.receiptPreview')}
          </ModalHeader>
          <ModalBody>
            {selectedReceipt?.receiptUrl && (
              <>
                {(selectedReceipt.receiptUrl.includes(".pdf") || selectedReceipt.originalUrl?.includes(".pdf")) ? (
                  <object
                    data={selectedReceipt.receiptUrl}
                    type="application/pdf"
                    width="100%"
                    height="600px"
                  >
                    <p>
                      Your browser does not support PDFs.{" "}
                      <a
                        href={selectedReceipt.receiptUrl}
                        target="_blank"
                        rel="noreferrer"
                      >
                        View PDF
                      </a>
                    </p>
                  </object>
                ) : (
                  <img
                    src={selectedReceipt.receiptUrl}
                    alt="Receipt"
                    style={{
                      maxWidth: "100%",
                      height: "auto",
                      display: "block",
                      margin: "0 auto",
                      objectFit: "contain",
                    }}
                  />
                )}
              </>
            )}
          </ModalBody>
        </Modal>

        <Modal
          isOpen={showInstallmentModal}
          toggle={() => setShowInstallmentModal(false)}
        >
          <ModalHeader toggle={() => setShowInstallmentModal(false)}>
            {t('financialReport.installmentPaymentFor')}{" "}
            {selectedUnpaidTransaction?.transactionPurpose}
          </ModalHeader>
          <ModalBody>
            <FormGroup>
              <Label>{t('financialReport.selectPaymentType')}:</Label>
              <div>
                <Button color="primary" onClick={handleFullPayment}>
                  {t('financialReport.payFullAmount')} ($
                  {selectedUnpaidTransaction?.transactionAmount})
                </Button>
                <Button
                  color="primary"
                  onClick={() => setShowInstallmentInput(true)}
                >
                  {t('financialReport.payInstallment')}
                </Button>
              </div>
            </FormGroup>
            {showInstallmentInput && (
              <FormGroup>
                <Label>{t('financialReport.installmentAmount')}:</Label>
                <Input
                  className="no-number-spinner"
                  type="number"
                  step="0.01"
                  value={installmentAmount}
                  onChange={(e) => setInstallmentAmount(limitToTwoDecimals(e.target.value))}
                  max={selectedUnpaidTransaction?.transactionAmount}
                />
              </FormGroup>
            )}
          </ModalBody>
          <ModalFooter>
            <Button color="success" onClick={handleInstallmentPayment}>
              {t('financialReport.pay2')}
            </Button>
            <Button
              color="secondary"
              onClick={() => setShowInstallmentModal(false)}
            >
              {t('common.cancel')}
            </Button>
          </ModalFooter>
        </Modal>

        {/* Download Report Modal */}
        <DownloadReportModal
          isOpen={showDownloadReportModal}
          toggle={() => setShowDownloadReportModal(false)}
          companyName={companyName}
          items={filterItemsByTimeRange(items, selectedTimeRange, searchTerm)}
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
          searchedDates={searchedDates}
               currentLanguage={currentLanguage}
        />
      </div>
    </>
  );
};

export default MesobFinancial2;
