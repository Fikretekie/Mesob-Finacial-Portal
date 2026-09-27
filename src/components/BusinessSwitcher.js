import React, { useEffect, useState } from "react";
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
} from "reactstrap";
import { businessTypes } from "views/BusinessTypes";
import {
  fetchBusinesses,
  createBusiness,
  deleteBusiness,
  getCurrentBusinessId,
  getDefaultBusinessName,
  switchToBusiness,
  switchToDefaultBusiness,
} from "utils/businessStorage";

function BusinessSwitcher() {
  const [businesses, setBusinesses] = useState([]);
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const [showAddModal, setShowAddModal] = useState(false);
  const [newName, setNewName] = useState("");
  const [newType, setNewType] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    fetchBusinesses().then(setBusinesses).catch(() => {});
  }, []);

  const currentId = getCurrentBusinessId();
  const currentName = localStorage.getItem("companyName") || getDefaultBusinessName();

  const handleAddBusiness = async () => {
    if (!newName.trim() || !newType) {
      setError("Enter a business name and type.");
      return;
    }
    setSaving(true);
    setError("");
    try {
      const created = await createBusiness(newName.trim(), newType);
      switchToBusiness(created); // reloads the app on the new business
    } catch (err) {
      console.error("Add business failed:", err);
      setError("Could not add business. Please try again.");
      setSaving(false);
    }
  };

  const handleDeleteBusiness = async (business) => {
    if (!window.confirm(`Delete "${business.name}"? This cannot be undone.`)) return;
    try {
      await deleteBusiness(business.businessId);
      if (currentId === business.businessId) {
        switchToDefaultBusiness(); // reloads
        return;
      }
      setBusinesses((prev) => prev.filter((b) => b.businessId !== business.businessId));
    } catch (err) {
      console.error("Delete business failed:", err);
      alert("Could not delete business. Please try again.");
    }
  };

  return (
    <>
      <Dropdown isOpen={dropdownOpen} toggle={() => setDropdownOpen((o) => !o)}>
        <DropdownToggle
          caret
          style={{
            background: "var(--surface-3)",
            border: "1px solid var(--border-strong)",
            color: "var(--text-1)",
            height: "36px",
            borderRadius: "var(--r-sm)",
            fontSize: "12px",
            fontWeight: 600,
            padding: "0 12px",
          }}
        >
          {currentName}
        </DropdownToggle>
        <DropdownMenu end>
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
                style={{ cursor: "pointer", color: "var(--text-2)", fontSize: "13px" }}
                onClick={(e) => {
                  e.stopPropagation();
                  handleDeleteBusiness(b);
                }}
              >
                ✕
              </span>
            </DropdownItem>
          ))}
          <DropdownItem divider />
          <DropdownItem onClick={() => setShowAddModal(true)}>+ Add Business</DropdownItem>
        </DropdownMenu>
      </Dropdown>

      <Modal isOpen={showAddModal} toggle={() => !saving && setShowAddModal(false)}>
        <ModalHeader toggle={() => !saving && setShowAddModal(false)}>Add Business</ModalHeader>
        <ModalBody>
          {error && (
            <div className="alert alert-danger" role="alert">
              {error}
            </div>
          )}
          <p style={{ color: "var(--text-2)", fontSize: "13px" }}>
            Additional businesses are billed at $10/month, added to your subscription.
          </p>
          <FormGroup>
            <Label>Business Name</Label>
            <Input value={newName} onChange={(e) => setNewName(e.target.value)} placeholder="e.g. Truck 2" />
          </FormGroup>
          <FormGroup>
            <Label>Business Type</Label>
            <Input type="select" value={newType} onChange={(e) => setNewType(e.target.value)}>
              <option value="">Select type...</option>
              {Object.keys(businessTypes).map((type) => (
                <option key={type} value={type}>
                  {type}
                </option>
              ))}
            </Input>
          </FormGroup>
        </ModalBody>
        <ModalFooter>
          <Button color="secondary" onClick={() => setShowAddModal(false)} disabled={saving}>
            Cancel
          </Button>
          <Button color="primary" onClick={handleAddBusiness} disabled={saving}>
            {saving ? "Adding..." : "Add Business"}
          </Button>
        </ModalFooter>
      </Modal>
    </>
  );
}

export default BusinessSwitcher;