import React, { useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { Modal, ModalHeader, ModalBody, ModalFooter, Button, Input, FormGroup, Label, Spinner } from "reactstrap";
import axios from "axios";
import imageCompression from "browser-image-compression";
import { apiUrl, ROUTES } from "config/api";
import { businessTypes } from "views/BusinessTypes";
import { getCurrentBusinessId } from "utils/businessStorage";
import { getStateAtPoint } from "utils/geoState";
import { US_STATES } from "utils/usStates";
import { can } from "utils/permissions";
import { clearFuelStop, fuelCategory, readFuelStop, repairCategory } from "utils/fuelStop";
import { enqueue } from "utils/offline";
import { isAppShell } from "utils/appShell";
import { Capacitor } from "@capacitor/core";
import { Camera, CameraResultType, CameraSource } from "@capacitor/camera";
import { FilePicker } from "@capawesome/capacitor-file-picker";

const FUEL_VENDOR_KEYWORDS = [
  "shell", "chevron", "exxon", "mobil", "bp", "marathon", "citgo", "sunoco",
  "valero", "pilot", "flying j", "love's", "loves travel", "ta travel",
  "speedway", "circle k", "76 ", "phillips 66", "casey's",
  "sam's club", "costco", "kroger fuel", "murphy usa", "murphy express",
];

const guessCategoryFromVendor = (vendor, businessType) => {
  if (!vendor || businessType !== "Trucking") return "";
  const v = vendor.toLowerCase();
  return FUEL_VENDOR_KEYWORDS.some((kw) => v.includes(kw)) ? "Fuel Expense" : "";
};

const toBase64 = (file) =>
  new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.readAsDataURL(file);
    reader.onload = () => resolve(reader.result.split(",")[1]);
    reader.onerror = reject;
  });

/** Single-tap "scan a receipt" flow: camera -> OCR pre-fill -> review -> save.
 * Additive to the existing Pay Expense form -- doesn't touch it. For
 * Trucking accounts scanning a Fuel Expense, also asks for State/Gallons
 * and writes a FuelPurchase record alongside the normal Transaction, so it
 * counts toward IFTA too. */
const isPdf = (file) => file.type === "application/pdf" || /\.pdf$/i.test(file.name || "");

// E-receipts often arrive as PDFs. The receipt reader takes images, so render
// page 1 to a JPEG here (pdf.js loads only when a PDF is actually picked).
async function pdfToImage(file) {
  const pdfjs = await import("pdfjs-dist/legacy/build/pdf");
  // Runs pdf.js in-page instead of a separate worker file; fine for a one-page receipt.
  await import("pdfjs-dist/legacy/build/pdf.worker.entry");
  const doc = await pdfjs.getDocument({ data: await file.arrayBuffer(), isEvalSupported: false }).promise;
  const page = await doc.getPage(1);
  const base = page.getViewport({ scale: 1 });
  const viewport = page.getViewport({ scale: Math.min(3, 1600 / base.width) });
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(viewport.width);
  canvas.height = Math.round(viewport.height);
  const ctx = canvas.getContext("2d");
  ctx.fillStyle = "#fff"; // PDFs are transparent where nothing is printed
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  await page.render({ canvasContext: ctx, viewport }).promise;
  const blob = await new Promise((resolve) => canvas.toBlob(resolve, "image/jpeg", 0.9));
  doc.destroy();
  return new File([blob], (file.name || "receipt").replace(/\.pdf$/i, "") + ".jpg", { type: "image/jpeg" });
}

function QuickScanReceipt({ renderTrigger } = {}) {
  const { t } = useTranslation();
  const fileInputRef = useRef(null);
  const [isBusy, setIsBusy] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [isLocating, setIsLocating] = useState(false);
  const [showReview, setShowReview] = useState(false);
  const [error, setError] = useState("");

  const [receiptFile, setReceiptFile] = useState(null);
  const [receiptPreviewUrl, setReceiptPreviewUrl] = useState("");
  const [amount, setAmount] = useState("");
  const [category, setCategory] = useState("");
  const [state, setState] = useState("");
  const [gallons, setGallons] = useState("");
  // How the scanned purchase is recorded on the books:
  //   expense   -> operating expense (Pay / subType "Expense") — the default
  //   cogs      -> cost of goods sold now (Pay / subType "COGS")
  //   inventory -> capitalized as current asset (New_Item / assetType "current")
  //   fixed     -> capitalized as fixed asset (New_Item / assetType "fixed")
  const [destination, setDestination] = useState("expense");
  const [itemName, setItemName] = useState("");
  // Set when the scan came from a fuel-stop notification: { lat, lng, at, station }.
  const [fuelStop, setFuelStop] = useState(null);

  const businessType = localStorage.getItem("businessType") || "";
  const expenseOptions = businessTypes[businessType]?.expenses || [];
  const isAssetDestination = destination === "inventory" || destination === "fixed";
  // Fuel handling (State/Gallons + IFTA FuelPurchase) only applies to a fuel
  // operating expense, not to goods capitalized as inventory/assets.
  const isFuelTunnel =
    businessType === "Trucking" && category === "Fuel Expense" && destination === "expense";

  // A stop from a notification already says what the receipt is: fuel, or a
  // repair (maintenance). A store stop leaves the category to the vendor guess.
  const stopCategory = (stop) => {
    if (!stop) return "";
    const kind = stop.kind || "fuel";
    if (kind === "fuel") return fuelCategory(businessType, expenseOptions);
    if (kind === "repair") return repairCategory(businessType, expenseOptions);
    return "";
  };

  const resetAndClose = () => {
    setShowReview(false);
    setReceiptFile(null);
    setReceiptPreviewUrl("");
    setAmount("");
    setCategory("");
    setState("");
    setGallons("");
    setDestination("expense");
    setItemName("");
    setError("");
    setFuelStop(null);
    clearFuelStop();
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  const tryAutoFillState = async (stop) => {
    if (stop) {
      setIsLocating(true);
      getStateAtPoint(stop.lat, stop.lng)
        .then((detected) => detected && setState(detected))
        .catch(() => {})
        .finally(() => setIsLocating(false));
      return;
    }
    if (!("geolocation" in navigator)) return;
    setIsLocating(true);
    navigator.geolocation.getCurrentPosition(
      async (position) => {
        try {
          const detected = await getStateAtPoint(
            position.coords.latitude,
            position.coords.longitude
          );
          if (detected) setState(detected);
        } catch {
          // Leave state for manual selection.
        } finally {
          setIsLocating(false);
        }
      },
      () => setIsLocating(false),
      { enableHighAccuracy: false, timeout: 8000 }
    );
  };

  const handleFileSelected = async (e) => {
    let file = e.target.files[0];
    if (!file) return;

    setIsBusy(true);
    setError("");
    setShowReview(true);
    try {
      if (isPdf(file)) file = await pdfToImage(file);
      const compressed = await imageCompression(file, {
        maxSizeMB: 3,
        maxWidthOrHeight: 1920,
        useWebWorker: true,
      });
      setReceiptFile(compressed);
      setReceiptPreviewUrl(URL.createObjectURL(compressed));

      const imageBase64 = await toBase64(compressed);

      const ocrRes = await axios.post(apiUrl(ROUTES.RECEIPT_OCR), { imageBase64 });
      const { vendor, total, gallons: ocrGallons } = ocrRes.data || {};
      const totalNum = total ? parseFloat(String(total).replace(/[^0-9.]/g, "")) : null;

      setAmount(totalNum ? String(totalNum) : "");
      const stop = readFuelStop();
      setFuelStop(stop);
      if (vendor) setItemName(String(vendor));
      else if (stop?.station) setItemName(stop.station);
      // From a fuel / repair-shop notification we already know the category, whatever the vendor reads as.
      const guessed = stopCategory(stop) || guessCategoryFromVendor(vendor, businessType);
      setCategory(guessed);
      if (guessed === "Fuel Expense") {
        tryAutoFillState(stop);
        const gallonsNum = ocrGallons ? parseFloat(String(ocrGallons).replace(/[^0-9.]/g, "")) : null;
        if (gallonsNum) setGallons(String(gallonsNum));
      }
    } catch (err) {
      console.error("Quick scan failed:", err);
      setError("Could not read the receipt. You can still enter the amount manually below.");
      // Unreadable (or offline): a stop still pre-fills its category (+ the fuel stop's state).
      const stop = readFuelStop();
      const known = stopCategory(stop);
      if (stop) {
        setFuelStop(stop);
        if (stop.station) setItemName(stop.station);
      }
      if (known) {
        setCategory(known);
        if (known === "Fuel Expense") tryAutoFillState(stop);
      }
    } finally {
      setIsBusy(false);
    }
  };

  const handleSave = async () => {
    const amountNum = parseFloat(amount);
    if (!amountNum || amountNum <= 0) {
      setError("Enter a valid amount.");
      return;
    }
    if (isAssetDestination && !itemName.trim()) {
      setError("Enter an item name.");
      return;
    }
    if (isFuelTunnel && (!state || !gallons)) {
      setError("State and gallons are required for a fuel expense.");
      return;
    }

    setIsSaving(true);
    setError("");
    const userId = localStorage.getItem("userId");
    const businessId = getCurrentBusinessId();

    const transaction = isAssetDestination
      ? {
          // Capitalize: goods kept as stock, or equipment. Not an expense/COGS.
          userId,
          transactionType: "New_Item",
          subType: "New_Item",
          status: "Paid",
          transactionPurpose: itemName.trim(),
          transactionAmount: amountNum,
          originalAmount: amountNum,
          assetType: destination === "fixed" ? "fixed" : "current",
          assetName: itemName.trim(),
          ...(businessId ? { businessId } : {}),
        }
      : {
          // Operating expense, or cost of goods expensed now (subType "COGS").
          userId,
          transactionType: "Pay",
          transactionPurpose: category || "Other",
          transactionAmount: amountNum,
          originalAmount: amountNum,
          subType: destination === "cogs" ? "COGS" : "Expense",
          status: "Paid",
          ...(businessId ? { businessId } : {}),
        };

    let fuelPurchase = null;
    if (isFuelTunnel) {
      // IFTA date = the day of the stop, when the scan came from its notification.
      const day = fuelStop ? new Date(fuelStop.at) : new Date();
      fuelPurchase = {
        userId,
        purchase: {
          dateKey: `${day.getFullYear()}-${String(day.getMonth() + 1).padStart(2, "0")}-${String(day.getDate()).padStart(2, "0")}`,
          date: day.toLocaleDateString("en-US", { month: "short", day: "numeric" }),
          state,
          gallons: parseFloat(gallons),
          pricePerGallon: Number((amountNum / parseFloat(gallons)).toFixed(3)),
          totalCost: amountNum,
          source: "manual",
          ...(businessId ? { businessId } : {}),
        },
      };
    }

    // No signal (phone app): keep the whole scan — photo, transaction, fuel —
    // and send it when the connection is back.
    const queueScan = async () => {
      await enqueue({
        type: "scan",
        upload: receiptFile
          ? {
              url: apiUrl(ROUTES.RECEIPT),
              body: JSON.stringify({ fileName: receiptFile.name, fileType: receiptFile.type, fileContent: await toBase64(receiptFile), userId }),
            }
          : null,
        transaction: { url: apiUrl(ROUTES.TRANSACTION), data: transaction },
        fuel: fuelPurchase ? { url: apiUrl(ROUTES.FUEL_PURCHASE), data: fuelPurchase } : null,
      });
      resetAndClose();
    };

    let transactionSent = false;
    try {
      if (isAppShell() && navigator.onLine === false) {
        await queueScan();
        return;
      }

      let receiptUrl = "";
      if (receiptFile) {
        const fileContent = await toBase64(receiptFile);
        const uploadRes = await axios.post(apiUrl(ROUTES.RECEIPT), {
          fileName: receiptFile.name,
          fileType: receiptFile.type,
          fileContent,
          userId,
        });
        receiptUrl = uploadRes.data?.url || "";
      }

      await axios.post(apiUrl(ROUTES.TRANSACTION), { ...transaction, receiptUrl });
      transactionSent = true;
      if (fuelPurchase) await axios.post(apiUrl(ROUTES.FUEL_PURCHASE), fuelPurchase);

      // Auto-sync: tell whichever screen is open (Dashboard / Financial Report)
      // to refetch so the scanned transaction appears immediately, for the
      // active business — no manual refresh needed.
      window.dispatchEvent(new CustomEvent("mesob:transactionAdded", { detail: { source: "scan" } }));

      resetAndClose();
    } catch (err) {
      // Connection dropped before anything was saved: queue the whole scan instead.
      if (isAppShell() && !err.response && !transactionSent) {
        try {
          await queueScan();
          return;
        } catch (e) {
          // Fall through to the error.
        }
      }
      console.error("Quick scan save failed:", err);
      setError("Could not save. Please try again.");
    } finally {
      setIsSaving(false);
    }
  };

  // Phone app: the native camera or photo picker. Unlike the hidden file input,
  // it doesn't need a tap inside the page, so a notification button can open
  // it straight away. "upload" picks an existing photo or screenshot.
  const openNative = async (mode) => {
    if (!Capacitor.isNativePlatform()) {
      fileInputRef.current?.click();
      return;
    }
    try {
      let file;
      if (mode === "upload") {
        // Photos, screenshots and PDF e-receipts, from the phone's file picker.
        const { files } = await FilePicker.pickFiles({ types: ["image/*", "application/pdf"], limit: 1 });
        const picked = files && files[0];
        if (!picked) return;
        const src = picked.webPath || (picked.path ? Capacitor.convertFileSrc(picked.path) : "");
        const blob = picked.blob || (await (await fetch(src)).blob());
        file = new File([blob], picked.name || "receipt", { type: picked.mimeType || blob.type });
      } else {
        const photo = await Camera.getPhoto({
          source: CameraSource.Camera,
          resultType: CameraResultType.Uri,
          quality: 85,
          correctOrientation: true,
        });
        const blob = await (await fetch(photo.webPath)).blob();
        file = new File([blob], `receipt.${photo.format || "jpeg"}`, { type: blob.type || "image/jpeg" });
      }
      await handleFileSelected({ target: { files: [file] } });
    } catch (e) {
      // Cancelled, or permission refused — nothing to save.
    }
  };

  // Scanning a receipt creates a transaction — hide it from teammates without "add".
  if (!can("add")) return null;

  return (
    <>
      <input
        ref={fileInputRef}
        type="file"
        accept="image/*"
        capture="environment"
        style={{ display: "none" }}
        onChange={handleFileSelected}
      />
      {renderTrigger ? renderTrigger({ open: () => fileInputRef.current?.click(), openNative, busy: isBusy }) : (
      <button
        onClick={() => fileInputRef.current?.click()}
        disabled={isBusy}
        title={t("quickScan.scanReceipt")}
        className="mksv-scan-btn"
      >
        {isBusy ? (
          <Spinner size="sm" style={{ color: "#ffffff" }} />
        ) : (
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z" />
            <circle cx="12" cy="13" r="4" />
          </svg>
        )}
        {!isBusy && t("quickScan.scanReceipt")}
      </button>
      )}

      <Modal isOpen={showReview} toggle={isBusy ? undefined : resetAndClose}>
        <ModalHeader toggle={isBusy ? undefined : resetAndClose}>{t("quickScan.scannedReceipt")}</ModalHeader>
        <ModalBody>
          {error && (
            <div className="alert alert-danger" role="alert">
              {error}
            </div>
          )}
          {receiptPreviewUrl && (
            <img
              src={receiptPreviewUrl}
              alt="Receipt"
              style={{ maxWidth: "100%", maxHeight: "160px", display: "block", margin: "0 auto 16px", borderRadius: "4px" }}
            />
          )}
          {isBusy ? (
            <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: "12px", padding: "24px 0" }}>
              <Spinner color="primary" />
              <span>{t("quickScan.readingReceipt")}</span>
            </div>
          ) : (
            <>
              <FormGroup>
                <Label>{t("quickScan.amount")}</Label>
                <Input type="number" step="0.01" value={amount} onChange={(e) => setAmount(e.target.value)} />
              </FormGroup>
              <FormGroup>
                <Label>{t("quickScan.recordAs")}</Label>
                <Input type="select" value={destination} onChange={(e) => setDestination(e.target.value)}>
                  <option value="expense">{t("quickScan.destExpense")}</option>
                  <option value="cogs">{t("quickScan.destCogs")}</option>
                  <option value="inventory">{t("quickScan.destInventory")}</option>
                  <option value="fixed">{t("quickScan.destFixed")}</option>
                </Input>
                {destination === "cogs" && (
                  <small style={{ display: "block", marginTop: "6px", color: "var(--text-3)", fontSize: "12px" }}>
                    {t("quickScan.cogsHint")}
                  </small>
                )}
                {isAssetDestination && (
                  <small style={{ display: "block", marginTop: "6px", color: "var(--text-3)", fontSize: "12px" }}>
                    {t("quickScan.assetHint", { kind: destination === "fixed" ? t("quickScan.kindFixed") : t("quickScan.kindInventory") })}
                  </small>
                )}
              </FormGroup>
              {isAssetDestination ? (
                <FormGroup>
                  <Label>{t("quickScan.itemName")}</Label>
                  <Input
                    type="text"
                    value={itemName}
                    onChange={(e) => setItemName(e.target.value)}
                    placeholder={t("quickScan.itemNamePlaceholder")}
                  />
                </FormGroup>
              ) : (
                <FormGroup>
                  <Label>{t("quickScan.category")}</Label>
                  <Input type="select" value={category} onChange={(e) => setCategory(e.target.value)}>
                    <option value="">{t("quickScan.selectCategory")}</option>
                    {expenseOptions.map((c) => (
                      <option key={c} value={c}>{c}</option>
                    ))}
                  </Input>
                </FormGroup>
              )}
              {isFuelTunnel && (
                <>
                  <FormGroup>
                    <Label>
                      {t("quickScan.state")}{isLocating && <Spinner size="sm" style={{ marginLeft: "8px" }} />}
                    </Label>
                    <Input
                      type="select"
                      value={state}
                      onChange={(e) => setState(e.target.value)}
                      disabled={isLocating}
                    >
                      <option value="">
                        {isLocating ? t("quickScan.detectingLocation") : t("quickScan.selectState")}
                      </option>
                      {US_STATES.map((s) => (
                        <option key={s.abbr} value={s.abbr}>{s.name}</option>
                      ))}
                    </Input>
                  </FormGroup>
                  <FormGroup>
                    <Label>{t("quickScan.gallons")}</Label>
                    <Input type="number" step="0.01" value={gallons} onChange={(e) => setGallons(e.target.value)} />
                  </FormGroup>
                </>
              )}
            </>
          )}
        </ModalBody>
        {!isBusy && (
          <ModalFooter>
            <Button color="secondary" onClick={resetAndClose} disabled={isSaving}>
              {t("quickScan.cancel")}
            </Button>
            <Button color="primary" onClick={handleSave} disabled={isSaving}>
              {isSaving ? t("quickScan.saving") : t("quickScan.save")}
            </Button>
          </ModalFooter>
        )}
      </Modal>
    </>
  );
}

export default QuickScanReceipt;