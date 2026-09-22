import React, { useRef, useState } from "react";
import { Modal, ModalHeader, ModalBody, ModalFooter, Button, Input, FormGroup, Label, Spinner } from "reactstrap";
import axios from "axios";
import imageCompression from "browser-image-compression";
import { apiUrl, ROUTES } from "config/api";
import { businessTypes } from "views/BusinessTypes";
import { getStateAtPoint } from "utils/geoState";
import { US_STATES } from "utils/usStates";

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
function QuickScanReceipt() {
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

  const businessType = localStorage.getItem("businessType") || "";
  const expenseOptions = businessTypes[businessType]?.expenses || [];
  const isAssetDestination = destination === "inventory" || destination === "fixed";
  // Fuel handling (State/Gallons + IFTA FuelPurchase) only applies to a fuel
  // operating expense, not to goods capitalized as inventory/assets.
  const isFuelTunnel =
    businessType === "Trucking" && category === "Fuel Expense" && destination === "expense";

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
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  const tryAutoFillState = async () => {
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
    const file = e.target.files[0];
    if (!file) return;

    setIsBusy(true);
    setError("");
    setShowReview(true);
    try {
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
      if (vendor) setItemName(String(vendor));
      const guessed = guessCategoryFromVendor(vendor, businessType);
      setCategory(guessed);
      if (guessed === "Fuel Expense") {
        tryAutoFillState();
        const gallonsNum = ocrGallons ? parseFloat(String(ocrGallons).replace(/[^0-9.]/g, "")) : null;
        if (gallonsNum) setGallons(String(gallonsNum));
      }
    } catch (err) {
      console.error("Quick scan failed:", err);
      setError("Could not read the receipt. You can still enter the amount manually below.");
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
    try {
      const userId = localStorage.getItem("userId");
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
            receiptUrl,
          }
        : {
            // Operating expense, or cost of goods expensed now (subType "COGS").
            userId,
            transactionType: "Pay",
            transactionPurpose: category || "Other",
            transactionAmount: amountNum,
            originalAmount: amountNum,
            subType: destination === "cogs" ? "COGS" : "Expense",
            receiptUrl,
            status: "Paid",
          };
      await axios.post(apiUrl(ROUTES.TRANSACTION), transaction);

      if (isFuelTunnel) {
        const today = new Date();
        const dateKey = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, "0")}-${String(today.getDate()).padStart(2, "0")}`;
        await axios.post(apiUrl(ROUTES.FUEL_PURCHASE), {
          userId,
          purchase: {
            dateKey,
            date: today.toLocaleDateString("en-US", { month: "short", day: "numeric" }),
            state,
            gallons: parseFloat(gallons),
            totalCost: amountNum,
            source: "manual",
          },
        });
      }

      resetAndClose();
    } catch (err) {
      console.error("Quick scan save failed:", err);
      setError("Could not save. Please try again.");
    } finally {
      setIsSaving(false);
    }
  };

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
      <button
        onClick={() => fileInputRef.current?.click()}
        disabled={isBusy}
        title="Scan Receipt"
        style={{
          marginTop: "10px",
          height: "32px",
          borderRadius: "999px",
          background: "transparent",
          border: "1px dashed var(--accent-solid, #096afa)",
          display: "inline-flex",
          alignItems: "center",
          justifyContent: "center",
          padding: "0 8px 0 12px",
          gap: "7px",
          cursor: isBusy ? "default" : "pointer",
          color: "var(--text-1, #12151c)",
          fontSize: "13px",
          fontWeight: 600,
          whiteSpace: "nowrap",
        }}
      >
        {isBusy ? (
          <Spinner size="sm" style={{ color: "var(--accent-solid, #096afa)" }} />
        ) : (
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z" />
            <circle cx="12" cy="13" r="4" />
          </svg>
        )}
        {!isBusy && "Scan Receipt"}
        {!isBusy && (
          <span
            style={{
              fontSize: "9px",
              fontWeight: 800,
              letterSpacing: "0.04em",
              color: "var(--accent-ink, #ffffff)",
              background: "var(--accent-solid, #096afa)",
              borderRadius: "4px",
              padding: "2px 5px",
              textTransform: "uppercase",
            }}
          >
            New
          </span>
        )}
      </button>

      <Modal isOpen={showReview} toggle={isBusy ? undefined : resetAndClose}>
        <ModalHeader toggle={isBusy ? undefined : resetAndClose}>Scanned Receipt</ModalHeader>
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
              <span>Reading receipt...</span>
            </div>
          ) : (
            <>
              <FormGroup>
                <Label>Amount</Label>
                <Input type="number" step="0.01" value={amount} onChange={(e) => setAmount(e.target.value)} />
              </FormGroup>
              <FormGroup>
                <Label>Record as</Label>
                <Input type="select" value={destination} onChange={(e) => setDestination(e.target.value)}>
                  <option value="expense">Operating expense</option>
                  <option value="cogs">Goods for resale</option>
                  <option value="inventory">Inventory (keep as stock)</option>
                  <option value="fixed">Fixed asset</option>
                </Input>
                {destination === "cogs" && (
                  <small style={{ display: "block", marginTop: "6px", color: "var(--text-3)", fontSize: "12px" }}>
                    Recorded as cost of items sold right away — for resale goods you buy and sell quickly.
                  </small>
                )}
                {isAssetDestination && (
                  <small style={{ display: "block", marginTop: "6px", color: "var(--text-3)", fontSize: "12px" }}>
                    Capitalized as {destination === "fixed" ? "a fixed asset" : "inventory"} — it won't hit expenses until sold or disposed.
                  </small>
                )}
              </FormGroup>
              {isAssetDestination ? (
                <FormGroup>
                  <Label>Item name</Label>
                  <Input
                    type="text"
                    value={itemName}
                    onChange={(e) => setItemName(e.target.value)}
                    placeholder="e.g. Inventory purchase"
                  />
                </FormGroup>
              ) : (
                <FormGroup>
                  <Label>Category</Label>
                  <Input type="select" value={category} onChange={(e) => setCategory(e.target.value)}>
                    <option value="">Select category...</option>
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
                      State{isLocating && <Spinner size="sm" style={{ marginLeft: "8px" }} />}
                    </Label>
                    <Input
                      type="select"
                      value={state}
                      onChange={(e) => setState(e.target.value)}
                      disabled={isLocating}
                    >
                      <option value="">
                        {isLocating ? "Detecting your location..." : "Select a state..."}
                      </option>
                      {US_STATES.map((s) => (
                        <option key={s.abbr} value={s.abbr}>{s.name}</option>
                      ))}
                    </Input>
                  </FormGroup>
                  <FormGroup>
                    <Label>Gallons</Label>
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
              Cancel
            </Button>
            <Button color="primary" onClick={handleSave} disabled={isSaving}>
              {isSaving ? "Saving..." : "Save"}
            </Button>
          </ModalFooter>
        )}
      </Modal>
    </>
  );
}

export default QuickScanReceipt;