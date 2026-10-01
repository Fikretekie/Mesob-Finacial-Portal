import React, { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  Dropdown,
  DropdownToggle,
  DropdownMenu,
  DropdownItem,
  Modal,
  ModalHeader,
  ModalBody,
  ModalFooter,
  Button,
  Input,
  FormGroup,
  Label,
  Spinner,
} from "reactstrap";
import { businessTypes } from "views/BusinessTypes";
import { getTranslatedBusinessTypeName } from "utils/translatedBusinessTypes";
import {
  fetchBusinesses,
  createBusiness,
  deleteBusiness,
  getCurrentBusinessId,
  getDefaultBusinessName,
  switchToBusiness,
  switchToDefaultBusiness,
  previewBusinessSeat,
  addBusinessSeat,
  removeBusinessSeat,
} from "utils/businessStorage";

/** Lets an account switch between multiple businesses, or add a new one.
 * Always visible in the navbar -- additive, doesn't change single-business
 * accounts' behavior until they actually add a second business. */
function BusinessSwitcher() {
  const navigate = useNavigate();
  const [businesses, setBusinesses] = useState([]);
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const [showAddModal, setShowAddModal] = useState(false);
  // "form" (enter name/type) -> "confirm" (show the exact charge, require
  // an explicit confirm click before anything is actually charged).
  const [addStep, setAddStep] = useState("form");
  const [newName, setNewName] = useState("");
  const [newType, setNewType] = useState("");
  const [preview, setPreview] = useState(null);
  const [checkingPreview, setCheckingPreview] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  // Delete flow -- a deliberate confirmation modal (not a native confirm()
  // that's easy to click through by habit), with a nudge to back up data
  // first, since deleting a business is destructive and permanent.
  const [deleteTarget, setDeleteTarget] = useState(null);
  const [deleting, setDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState("");

  useEffect(() => {
    fetchBusinesses().then(setBusinesses).catch(() => {});
  }, []);

  const currentId = getCurrentBusinessId();
  const currentName = localStorage.getItem("companyName") || getDefaultBusinessName();

  const resetAddModal = () => {
    setShowAddModal(false);
    setAddStep("form");
    setNewName("");
    setNewType("");
    setPreview(null);
    setError("");
  };

  // Step 1: validate the form, then ask the backend what this would cost --
  // no charge happens yet, this is just a lookup.
  const handleContinue = async () => {
    if (!newName.trim() || !newType) {
      setError("Enter a business name and type.");
      return;
    }
    setCheckingPreview(true);
    setError("");
    try {
      const result = await previewBusinessSeat();
      if (!result.eligible) {
        setError(result.reason || "Switch your subscription to card billing to add more businesses.");
        return;
      }
      setPreview(result);
      setAddStep("confirm");
    } catch (err) {
      console.error("Preview business seat failed:", err);
      setError("Could not check pricing. Please try again.");
    } finally {
      setCheckingPreview(false);
    }
  };

  // Step 2: user has seen and confirmed the exact charge -- now actually
  // create the business and add the charge to the subscription.
  const handleConfirmAdd = async () => {
    setSaving(true);
    setError("");
    try {
      const created = await createBusiness(newName.trim(), newType);
      await addBusinessSeat();
      switchToBusiness(created); // reloads the app on the new business
    } catch (err) {
      console.error("Add business failed:", err);
      setError("Could not add business. Please try again.");
      setSaving(false);
    }
  };

  const closeDeleteModal = () => {
    setDeleteTarget(null);
    setDeleteError("");
  };

  const goDownloadDataFirst = () => {
    closeDeleteModal();
    setDropdownOpen(false);
    navigate("/customer/csv");
  };

  const handleConfirmDelete = async () => {
    const business = deleteTarget;
    setDeleting(true);
    setDeleteError("");
    try {
      await deleteBusiness(business.businessId);
      await removeBusinessSeat();
      if (currentId === business.businessId) {
        switchToDefaultBusiness(); // reloads
        return;
      }
      setBusinesses((prev) => prev.filter((b) => b.businessId !== business.businessId));
      closeDeleteModal();
    } catch (err) {
      console.error("Delete business failed:", err);
      setDeleteError("Could not delete business. Please try again.");
    } finally {
      setDeleting(false);
    }
  };

  return (
    <>
      <Dropdown isOpen={dropdownOpen} toggle={() => setDropdownOpen((o) => !o)}>
        <DropdownToggle
          aria-label={`Switch business (current: ${currentName})`}
          title={`Switch business (current: ${currentName})`}
          style={{
            width: 38,
            height: 38,
            display: "grid",
            placeItems: "center",
            borderRadius: "var(--r-sm, 8px)",
            background: dropdownOpen ? "var(--accent-soft, rgba(59,130,246,.14))" : "var(--surface-3)",
            border: dropdownOpen ? "1.5px solid var(--accent-solid, #3b82f6)" : "1px solid var(--border-strong)",
            color: "var(--text-1)",
            flex: "0 0 auto",
          }}
        >
          <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
            <rect x="3" y="7" width="18" height="13" rx="2" />
            <path d="M8 7V5a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
          </svg>
        </DropdownToggle>
        <DropdownMenu end style={{ maxWidth: "calc(100vw - 16px)" }}>
          <DropdownItem
            active={!currentId}
            onClick={() => {
              if (currentId) switchToDefaultBusiness();
            }}
          >
            {getDefaultBusinessName()}
          </DropdownItem>
          {businesses.map((b) => (
            <DropdownItem
              key={b.businessId}
              active={currentId === b.businessId}
              toggle={false}
              style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: "10px" }}
            >
              <span
                style={{ flex: 1, cursor: "pointer" }}
                onClick={() => {
                  if (currentId !== b.businessId) switchToBusiness(b);
                }}
              >
                {b.name}
              </span>
              <span
                title="Delete business"
                style={{
                  cursor: "pointer",
                  color: "#ef4444",
                  fontSize: "13px",
                  fontWeight: 700,
                  width: 20,
                  height: 20,
                  display: "grid",
                  placeItems: "center",
                  borderRadius: "4px",
                  flexShrink: 0,
                }}
                onClick={(e) => {
                  e.stopPropagation();
                  setDeleteTarget(b);
                }}
              >
                ✕
              </span>
            </DropdownItem>
          ))}
          <DropdownItem divider />
          <DropdownItem
            onClick={() => setShowAddModal(true)}
            style={{
              color: "var(--accent, #3b82f6)",
              fontWeight: 600,
              fontSize: "13px",
              display: "flex",
              alignItems: "center",
              gap: "8px",
            }}
          >
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
              <line x1="12" y1="5" x2="12" y2="19" />
              <line x1="5" y1="12" x2="19" y2="12" />
            </svg>
            Add another business
          </DropdownItem>
        </DropdownMenu>
      </Dropdown>

      <Modal isOpen={showAddModal} toggle={() => !saving && resetAddModal()} className="add-transaction-modal add-business-modal">
        <ModalHeader toggle={() => !saving && resetAddModal()}>
          Add a business
          <span className="mksv-modal-sub">
            Run a second company on its own clean set of books.
          </span>
        </ModalHeader>
        <ModalBody>
          {error && (
            <div className="alert alert-danger" role="alert">
              {error}
            </div>
          )}

          {addStep === "form" && (
            <>
              <div className="add-business-note">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                  <circle cx="12" cy="12" r="10" />
                  <line x1="12" y1="16" x2="12" y2="12" />
                  <line x1="12" y1="8" x2="12.01" y2="8" />
                </svg>
                <span>Each business keeps its own transactions, reports, and receipts. It's billed on top of your current plan.</span>
              </div>
              <FormGroup>
                <Label>Business name</Label>
                <Input value={newName} onChange={(e) => setNewName(e.target.value)} placeholder="e.g. Truck 2" />
              </FormGroup>
              <FormGroup>
                <Label>Business type</Label>
                <Input type="select" value={newType} onChange={(e) => setNewType(e.target.value)}>
                  <option value="">Select type…</option>
                  {Object.keys(businessTypes).map((type) => (
                    <option key={type} value={type}>
                      {getTranslatedBusinessTypeName(type)}
                    </option>
                  ))}
                </Input>
              </FormGroup>
            </>
          )}

          {addStep === "confirm" && preview && (
            <>
              <p style={{ color: "var(--text-1)", fontSize: "14px", fontWeight: 600 }}>
                Adding "{newName.trim()}"
              </p>
              <div
                style={{
                  background: "var(--surface-3, #1a2130)",
                  border: "1px solid var(--border-strong, #2a3444)",
                  borderRadius: "8px",
                  padding: "12px 14px",
                  fontSize: "13px",
                  color: "var(--text-1)",
                }}
              >
                {preview.previewText}
              </div>
            </>
          )}
        </ModalBody>
        <ModalFooter>
          <Button color="secondary" onClick={resetAddModal} disabled={saving || checkingPreview}>
            Cancel
          </Button>
          {addStep === "form" ? (
            <Button color="primary" onClick={handleContinue} disabled={checkingPreview}>
              {checkingPreview ? <Spinner size="sm" /> : "Continue"}
            </Button>
          ) : (
            <Button color="primary" onClick={handleConfirmAdd} disabled={saving}>
              {saving ? <Spinner size="sm" /> : "Confirm & Add Business"}
            </Button>
          )}
        </ModalFooter>
      </Modal>

      <Modal isOpen={!!deleteTarget} toggle={() => !deleting && closeDeleteModal()} className="add-transaction-modal add-business-modal">
        <ModalHeader toggle={() => !deleting && closeDeleteModal()}>
          Delete "{deleteTarget?.name}"?
        </ModalHeader>
        <ModalBody>
          {deleteError && (
            <div className="alert alert-danger" role="alert">
              {deleteError}
            </div>
          )}
          <p style={{ color: "var(--text-1)", fontSize: "14px", fontWeight: 600, marginBottom: "8px" }}>
            This cannot be undone.
          </p>
          <p style={{ color: "var(--text-2)", fontSize: "13px" }}>
            All transactions, receipts, and records for this business will be permanently lost.
            We recommend downloading a backup of your data before deleting.
          </p>
        </ModalBody>
        <ModalFooter style={{ flexWrap: "wrap", gap: "8px" }}>
          <Button color="secondary" onClick={closeDeleteModal} disabled={deleting}>
            Cancel
          </Button>
          <Button color="primary" outline onClick={goDownloadDataFirst} disabled={deleting}>
            Download My Data First
          </Button>
          <Button color="danger" onClick={handleConfirmDelete} disabled={deleting}>
            {deleting ? <Spinner size="sm" /> : "Delete Anyway"}
          </Button>
        </ModalFooter>
      </Modal>
    </>
  );
}

export default BusinessSwitcher;
