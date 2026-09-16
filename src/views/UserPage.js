import React, { useState, useEffect } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import axios from "axios";
import {
  Button,
  Card,
  CardHeader,
  CardBody,
  FormGroup,
  Form,
  Input,
  Row,
  Col,
  Alert,
  Nav,
  NavItem,
  NavLink,
  TabContent,
  TabPane,
  Modal,
  ModalHeader,
  ModalBody,
  ModalFooter,
  Spinner,
} from "reactstrap";
import PanelHeader from "components/PanelHeader/PanelHeader.js";
import { apiUrl, ROUTES, S3_BUCKET_NAME } from "../config/api";
import "./UserPage.css";
import { saveAs } from "file-saver";

function UserPage() {
  const [activeTab, setActiveTab] = useState("1");
  const [showResetModal, setShowResetModal] = useState(false);
  const [resetConfirmText, setResetConfirmText] = useState("");
  const [isWorking, setIsWorking] = useState(false);
  const [userData, setUserData] = useState({
    id: "",
    name: "",
    email: "",
    phone: "",
    companyName: "",
    businessType: "",
    cashBalance: "",
    outstandingDebt: "",
    valueableItems: "",
    role: null,
  });
  const [isEditing, setIsEditing] = useState(false);
  const [isCustomer, setIsCustomer] = useState(false);
  const [originalData, setOriginalData] = useState({});
  const [hasChanges, setHasChanges] = useState(false);
  const [error, setError] = useState(null);
  const [success, setSuccess] = useState(null);
  const [editDisabled, setEditDisabled] = useState(false);
  const [subscriptionData, setSubscriptionData] = useState(null);
  const [loadingSubscription, setLoadingSubscription] = useState(false);
  const [showCancelModal, setShowCancelModal] = useState(false);
  const [cancelLoading, setCancelLoading] = useState(false);
  const navigate = useNavigate();
  const location = useLocation();
  const userRole = parseInt(localStorage.getItem("role") || "1");

  /** Profile layout: tabs overflow horizontally on small phones — stack + tighten padding */
  const [viewportWidth, setViewportWidth] = useState(
    typeof window !== "undefined" ? window.innerWidth : 1024
  );
  useEffect(() => {
    const onResize = () => setViewportWidth(window.innerWidth);
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, []);
  const isCompactProfile = viewportWidth < 480;
  const isVeryNarrow = viewportWidth < 360;
  const isUltraNarrow = viewportWidth < 300;

  const profileTabLinkStyle = (isActive) => ({
    cursor: "pointer",
    backgroundColor: "#000000",
    color: isActive ? "var(--text-1)" : "var(--text-3)",
    borderColor: "var(--border)",
    ...(isCompactProfile && {
      width: "100%",
      maxWidth: "100%",
      textAlign: "center",
      boxSizing: "border-box",
      borderRadius: "8px",
      border: `1px solid ${isActive ? "var(--text-1)" : "var(--border)"}`,
      whiteSpace: "normal",
      lineHeight: 1.25,
    }),
    ...(isUltraNarrow && {
      fontSize: "0.68rem",
      padding: "0.35rem 0.35rem",
    }),
    ...(!isUltraNarrow &&
      isVeryNarrow && {
        fontSize: "0.78rem",
        padding: "0.45rem 0.5rem",
      }),
  });

  useEffect(() => {
    const fetchUserData = async () => {
      try {
        const userId = localStorage.getItem("userId");
        const response = await axios.get(
          apiUrl(`${ROUTES.USERS}/${userId}`)
        );
        console.log("api response", response);
        const user = response.data?.user;
        if (user) {
          // Save both the current and the original copy
          const legacyBusinessType =
            user.businessType === "Resturant/Cafe" ? "Cafe" : user.businessType;
          const fullUser = { ...user, id: userId, businessType: legacyBusinessType };
          setUserData(fullUser);
          setOriginalData(fullUser);
                    localStorage.setItem("businessType", legacyBusinessType || "");
          // setUserData({ ...user, id: userId });
          setIsCustomer(user.role === 2 || user.role === 1);
        } else {
          setUserData({ id: userId });
          setIsCustomer(false);
          setError("User data not found. Please contact support.");
        }
      } catch (error) {
        console.error("Error fetching user data:", error);
        setError("Failed to fetch user data. Please try again later.");
      }
    };

    fetchUserData();
  }, []);


  useEffect(() => {
    const fetchSubscription = async () => {
      const userId = localStorage.getItem("userId");
      const res = await axios.get(
        apiUrl(`${ROUTES.USERS}/${userId}`)
      );
      // Use optional chaining and sensible defaults
      setEditDisabled(
        !res.data?.user?.subscription &&
        (res.data?.user?.scheduleCount ?? 0) >= 4
      );
    };
    fetchSubscription();
  }, []);

  useEffect(() => {
    const fetchSubscriptionDetails = async () => {
      if (activeTab === "2") {
        setLoadingSubscription(true);
        try {
          const userId = localStorage.getItem("userId");
          const response = await axios.get(
            apiUrl(`${ROUTES.SUBSCRIPTION}/${userId}`)
          );
          console.log("Subscription API response:", response.data);
          const data = response.data?.data;
          if (data && data.isPaid && data.subscriptionId && data.subscriptionDetails) {
            setSubscriptionData(data);
          } else {
            setSubscriptionData(null);
          }
        } catch (error) {
          console.error("Error fetching subscription details:", error);
          setSubscriptionData(null);
        } finally {
          setLoadingSubscription(false);
        }
      }
    };
    fetchSubscriptionDetails();
  }, [activeTab]);

  // Discard changes → restore original data
  const handleDiscard = () => {
    setUserData(originalData);
    setIsEditing(false);
    setHasChanges(false);
    setSuccess(null);
    setError(null);
  };

  const handleInputChange = (e) => {
    const { name, value } = e.target;
    setUserData({ ...userData, [name]: value });
    setHasChanges(true);
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (isEditing && hasChanges) {
      try {
        const { id, ...updateFields } = userData;

        console.log("Sending update request for ID:", id);
        console.log("Payload:", updateFields);

        const response = await axios.put(
          apiUrl(`${ROUTES.USERS}/${id}`),
          updateFields
        );

        console.log("Update response:", response.data);
                localStorage.setItem("businessType", userData.businessType || "");
        setIsEditing(false);
        setHasChanges(false);
        setSuccess("Profile updated successfully!");
        setError(null);
      } catch (error) {
        console.error(
          "Error updating user data:",
          error.response?.data || error.message
        );
        setError("Failed to update profile. Please try again.");
        setSuccess(null);
      }
    } else {
      setIsEditing(true);
    }
  };
  const handleDelete = async () => {
    const confirmDelete = window.confirm(
      "Are you sure you want to delete your account? This action cannot be undone."
    );
    if (!confirmDelete) return;

    try {
      const userId = localStorage.getItem("userId");
      await axios.delete(
        apiUrl(`${ROUTES.USERS}/${userId}`)
      );
      localStorage.clear(); // Clear user data
      alert("Account deleted successfully.");
      navigate("/login"); // Redirect to login or homepage
    } catch (error) {
      console.error("Error deleting user:", error);
      setError("Failed to delete account. Please try again.");
    }
  };

  // ——— Data Management (Reset) ———
  const isIOSDevice = () => /iPad|iPhone|iPod/.test(navigator.userAgent) && !window.MSStream;
  const fetchWithRetry = async (url, options = {}, retries = 2, delayMs = 800) => {
    for (let attempt = 0; attempt <= retries; attempt++) {
      try {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 60000);
        const res = await fetch(url, { ...options, signal: controller.signal });
        clearTimeout(timeoutId);
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        return res;
      } catch (err) {
        if (attempt === retries) throw err;
        await new Promise((r) => setTimeout(r, delayMs));
      }
    }
  };
  const fetchTransactionsForExport = async () => {
    const userId = localStorage.getItem("userId");
    const res = await fetchWithRetry(apiUrl(`${ROUTES.TRANSACTION}?userId=${userId}`));
    const data = await res.json();
    return data || [];
  };
  const generateCSV = (data) => {
    if (!data || data.length === 0) return "";
    const headers = Object.keys(data[0]);
    const rows = data.map((row) =>
      headers.map((h) => `"${String(row[h]).replace(/"/g, '""')}"`).join(",")
    );
    return [headers.join(","), ...rows].join("\n");
  };
  const downloadCSV = (csvData, fileName) => {
    try {
      const blob = new Blob([csvData], { type: "text/csv;charset=utf-8" });
      if (isIOSDevice()) {
        const url = URL.createObjectURL(blob);
        const newTab = window.open(url, "_blank");
        if (!newTab) {
          const link = document.createElement("a");
          link.href = url;
          link.download = fileName;
          document.body.appendChild(link);
          link.click();
          document.body.removeChild(link);
        }
        setTimeout(() => URL.revokeObjectURL(url), 5000);
      } else {
        saveAs(blob, fileName);
      }
      return true;
    } catch (e) {
      return false;
    }
  };
  const uploadCSVToS3 = async (csvData) => {
    const userId = localStorage.getItem("userId");
    const fileName = `transactions_${new Date().toISOString()}.csv`;
    const s3Key = `backups/${userId}${fileName}`;
    const base64CsvData = btoa(unescape(encodeURIComponent(csvData)));
    const payload = {
      bucketName: S3_BUCKET_NAME,
      key: s3Key,
      filename: fileName,
      userId,
      fileContent: base64CsvData,
      type: "text/csv;charset=utf-8",
    };
    const response = await fetchWithRetry(apiUrl(ROUTES.BACKUP), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    return response.json();
  };
  const handleDownloadReport = () => {
    if (location.pathname.includes("financial-report")) {
      window.dispatchEvent(new Event("mesob:downloadReport"));
    } else {
      navigate("/customer/financial-report", { state: { openDownloadModal: true } });
    }
  };
  const handleOpenResetModal = () => {
    setResetConfirmText("");
    setShowResetModal(true);
    fetch(apiUrl(`${ROUTES.TRANSACTION}?userId=ping`)).catch(() => {});
  };
  // Cancel Subscription Functions
  const cancelStripeSubscription = async () => {
    try {
      setCancelLoading(true);
      setError("");
      if (!subscriptionData?.subscriptionId) {
        setError("Subscription ID missing.");
        return;
      }
      await axios.delete(
        apiUrl(`${ROUTES.SUBSCRIPTION}/${subscriptionData.subscriptionId}`)
      );
      setSuccess("Subscription cancelled successfully!");
      setShowCancelModal(false);
      // Refresh subscription data
      setTimeout(() => {
        window.location.reload();
      }, 1500);
    } catch (err) {
      console.error("Error cancelling subscription:", err);
      setError("Failed to cancel subscription. Please try again.");
    } finally {
      setCancelLoading(false);
    }
  };

  /** Cancels at period end via backend PayPal API (same path as SubscriptionPlans). */
  const cancelPaypalSubscription = async () => {
    try {
      setCancelLoading(true);
      setError("");
      if (!subscriptionData?.subscriptionId) {
        setError("Subscription ID missing.");
        return;
      }
      await axios.delete(
        apiUrl(
          `${ROUTES.PAYPAL_SUBSCRIPTION}/${subscriptionData.subscriptionId}`
        )
      );
      setSuccess("Subscription cancelled successfully!");
      setShowCancelModal(false);
      setTimeout(() => {
        window.location.reload();
      }, 1500);
    } catch (err) {
      console.error("Error cancelling PayPal subscription:", err);
      setError(
        err.response?.data?.message ||
          "Failed to cancel PayPal subscription. Please try again or manage it in your PayPal account."
      );
    } finally {
      setCancelLoading(false);
    }
  };

  const handleCancelSubscription = () => {
    if (subscriptionData?.paymentType === "STRIPE") {
      cancelStripeSubscription();
    } else if (subscriptionData?.paymentType === "PAYPAL") {
      cancelPaypalSubscription();
    } else {
      setError("Unable to determine payment type. Please contact support.");
    }
  };

  const handleUpdatePaymentMethod = async () => {
    // Manage/update payment method within the CURRENT provider (no provider switching).
    await handleUpdateCurrentProvider();
  };

  const handleUpdateCurrentProvider = async () => {
    try {
      setLoadingSubscription(true);
      setError("");
      const userId = localStorage.getItem("userId");
      const currentProvider = subscriptionData?.paymentType;
      
      if (currentProvider === "STRIPE") {
        // Create Stripe Customer Portal session
        const response = await axios.post(
          apiUrl(ROUTES.CREATE_PORTAL_SESSION),
          { userId }
        );
        
        if (response.data?.url) {
          window.location.href = response.data.url;
        } else {
          setError("Failed to create portal session. Please try again.");
          setLoadingSubscription(false);
        }
      } else if (currentProvider === "PAYPAL") {
        // For PayPal, payment method updates are done in the user's PayPal account (autopay/subscriptions).
        const isLocal =
          typeof window !== "undefined" &&
          ["localhost", "127.0.0.1"].includes(window.location.hostname);
        const paypalManageUrl = isLocal
          ? "https://www.sandbox.paypal.com/myaccount/autopay/"
          : "https://www.paypal.com/myaccount/autopay/";
        window.open(paypalManageUrl, "_blank", "noopener,noreferrer");
        setLoadingSubscription(false);
      } else {
        setError("Unable to determine payment provider. Please contact support.");
        setLoadingSubscription(false);
      }
    } catch (error) {
      console.error("Error updating payment method:", error);
      setError("Failed to open payment settings. Please try again or contact support.");
      setLoadingSubscription(false);
    }
  };

  const handleConfirmReset = async () => {
    if (resetConfirmText !== "RESET") return;
    try {
      setIsWorking(true);
      const userId = localStorage.getItem("userId");
      const items = await fetchTransactionsForExport();
      if (items.length) {
        const csvData = generateCSV(items);
        const fileName = `transactions_backup_${new Date().toISOString().slice(0, 10)}.csv`;
        try {
          if (isIOSDevice()) {
            downloadCSV(csvData, fileName);
            await new Promise((r) => setTimeout(r, 500));
          } else {
            downloadCSV(csvData, fileName);
          }
        } catch (e) {}
        try {
          await uploadCSVToS3(csvData);
        } catch (e) {}
      }
      try {
        await fetchWithRetry(apiUrl(`${ROUTES.TRANSACTION}/deleteAll?userId=${userId}`), {
          method: "DELETE",
          headers: { "Content-Type": "application/json" },
        });
      } catch (deleteErr) {
        alert(`Reset failed: ${deleteErr?.message || "Unknown error"}`);
        setIsWorking(false);
        return;
      }
      setShowResetModal(false);
      setResetConfirmText("");
      navigate("/customer/financial-report");
      setTimeout(() => window.location.reload(), 500);
    } catch (err) {
      alert(`Reset failed: ${err?.message}`);
    } finally {
      setIsWorking(false);
    }
  };

  return (
    <>
      <PanelHeader size="sm" />
      <div
        className="content"
        style={{
          paddingLeft: isUltraNarrow ? 4 : isVeryNarrow ? 8 : undefined,
          paddingRight: isUltraNarrow ? 4 : isVeryNarrow ? 8 : undefined,
          maxWidth: "100%",
          overflowX: "hidden",
        }}
      >
        <Row className="g-0" style={{ marginLeft: 0, marginRight: 0 }}>
          <Col
            xs="12"
            md="8"
            style={{
              paddingInline: isUltraNarrow ? 0 : 0,
              minWidth: 0,
              maxWidth: "100%",
            }}
          >
            <Card
              style={{
                backgroundColor: "var(--surface-2)",
                boxShadow: "0 4px 12px rgba(0, 0, 0, 0.4), 0 2px 6px rgba(0, 0, 0, 0.3)",
                maxWidth: "100%",
              }}
            >
              <CardHeader
                style={{
                  backgroundColor: "var(--surface-2)",
                  padding: isUltraNarrow ? "0.5rem 0.35rem" : isVeryNarrow ? "0.65rem 0.5rem" : undefined,
                }}
              >
                <h5
                  className="title mb-0"
                  style={{
                    color: "#ffffff",
                    fontSize: isUltraNarrow ? "1rem" : undefined,
                  }}
                >
                  Account
                </h5>
                <Nav
                  tabs
                  className={`profile-page-nav${isCompactProfile ? " flex-column align-items-stretch" : ""}`}
                  style={{
                    borderBottom: isCompactProfile ? "none" : "1px solid var(--border)",
                    marginTop: "12px",
                    gap: isCompactProfile ? "6px" : 0,
                    width: "100%",
                    flexWrap: isCompactProfile ? "nowrap" : "wrap",
                  }}
                >
                  <NavItem style={isCompactProfile ? { width: "100%", maxWidth: "100%" } : {}}>
                    <NavLink
                      className={activeTab === "1" ? "active" : ""}
                      onClick={() => setActiveTab("1")}
                      style={profileTabLinkStyle(activeTab === "1")}
                    >
                      Personal Info
                    </NavLink>
                  </NavItem>
                
                  <NavItem style={isCompactProfile ? { width: "100%", maxWidth: "100%" } : {}}>
                    <NavLink
                      className={activeTab === "3" ? "active" : ""}
                      onClick={() => setActiveTab("3")}
                      style={profileTabLinkStyle(activeTab === "3")}
                    >
                      Data Management
                    </NavLink>
                  </NavItem>
                    <NavItem style={isCompactProfile ? { width: "100%", maxWidth: "100%" } : {}}>
                    <NavLink
                      className={activeTab === "2" ? "active" : ""}
                      onClick={() => setActiveTab("2")}
                      style={profileTabLinkStyle(activeTab === "2")}
                    >
                      Payment Info
                    </NavLink>
                  </NavItem>
                </Nav>
              </CardHeader>
              <CardBody
                style={{
                  backgroundColor: "var(--surface-2)",
                  padding: isUltraNarrow ? "0.5rem 0.35rem" : isVeryNarrow ? "0.65rem 0.5rem" : undefined,
                }}
              >
                <TabContent activeTab={activeTab}>
                  <TabPane tabId="1">
                {error && <Alert color="danger">{error}</Alert>}
                {success && <Alert color="success">{success}</Alert>}
                <Form onSubmit={handleSubmit}>
                  <Row >
                    <Col className="pr-1" md="6" >
                      <FormGroup>
                        <label style={{ color: "#ffffff" }}>Name</label>
                        <Input
                          name="name"
                          value={userData.name}
                          onChange={handleInputChange}
                          disabled={!isEditing}
                          type="text"
                          style={{ backgroundColor: "var(--surface-3)", color: "#ffffff", border: "1px solid var(--border)", borderRadius: "4px" }}
                        />
                      </FormGroup>
                    </Col>
                    <Col className="pl-1" md="6">
                      <FormGroup>
                        <label style={{ color: "#ffffff" }}>Email address</label>
                        <Input
                          name="email"
                          value={userData.email}
                          onChange={handleInputChange}
                          disabled={!isEditing}
                          type="email"
                          style={{ backgroundColor: "var(--surface-3)", color: "#ffffff", border: "1px solid var(--border)", borderRadius: "4px" }}
                        />
                      </FormGroup>
                    </Col>
                  </Row>
                  <Row>
                    <Col className="pr-1" md="6">
                      <FormGroup>
                        <label style={{ color: "#ffffff" }}>Phone</label>
                        <Input
                          name="phone"
                          value={userData.phone_number}
                          onChange={handleInputChange}
                          disabled={!isEditing}
                          type="text"
                          style={{ backgroundColor: "var(--surface-3)", color: "#ffffff", border: "1px solid var(--border)", borderRadius: "4px" }}
                        />
                      </FormGroup>
                    </Col>
                    <Col className="pl-1" md="6">
                      <FormGroup>
                        <label style={{ color: "#ffffff" }}>Company Name</label>
                        <Input
                          name="companyName"
                          value={userData.companyName}
                          onChange={handleInputChange}
                          disabled={!isEditing}
                          type="text"
                          style={{ backgroundColor: "var(--surface-3)", color: "#ffffff", border: "1px solid var(--border)", borderRadius: "4px" }}
                        />
                      </FormGroup>
                    </Col>
                  </Row>
                  <Row>
                    <Col md="12">
                      <FormGroup>
                        <label style={{ color: "#ffffff" }}>Business Type</label>
                        {isEditing ? (
                          <Input
                            type="select"
                            name="businessType"
                            value={userData.businessType || ""}
                            onChange={handleInputChange}
                            style={{ backgroundColor: "var(--surface-3)", color: "#ffffff", border: "1px solid var(--border)", borderRadius: "4px" }}
                          >
                            <option value="">Select Business Type</option>
                            <option value="Trucking">Trucking</option>
                            <option value="RIDESHARE DRIVERS/PARTNERS">
                              RIDESHARE DRIVERS/PARTNERS
                            </option>
                            <option value="Groceries">Groceries</option>
                            <option value="Individual/Households">
                              Individual/Households
                            </option>
                            <option value="Cafe">Restaurant / Café</option>
                            <option value="Cleaning Services">Cleaning Services</option>
                            <option value="Beauty & Grooming">
                              Beauty & Grooming (Salons, Barbershops)
                            </option>
                            <option value="E-commerce Sellers">
                              E-commerce Sellers (Shopify, Amazon, Etsy)
                            </option>
                            <option value="Construction Trades">
                              Construction Trades (Plumbing, Electrical, Painting, etc.)
                            </option>
                            <option value="Content Creator">Content Creator</option>
                            <option value="Other">Other Businesses</option>
                          </Input>
                        ) : (
                          <Input
                            value={userData.businessType || "—"}
                            disabled
                            type="text"
                            placeholder="Not specified"
                            style={{ backgroundColor: "var(--surface-3)", color: "#ffffff", border: "1px solid var(--border)", borderRadius: "4px" }}
                          />
                        )}
                      </FormGroup>
                    </Col>
                  </Row>
                  <Row>
                    <Col className="pr-1" md="4">
                      <FormGroup>
                        <label style={{ color: "#ffffff" }}>Cash Balance</label>
                        <Input
                          name="cashBalance"
                          value={userData.cashBalance}
                          onChange={handleInputChange}
                          disabled={!isEditing}
                          type="text"
                          style={{ backgroundColor: "var(--surface-3)", color: "#ffffff", border: "1px solid var(--border)", borderRadius: "4px" }}
                        />
                      </FormGroup>
                    </Col>
                    <Col className="px-1" md="4">
                      <FormGroup>
                        <label style={{ color: "#ffffff" }}>Outstanding Debt</label>
                        <Input
                          name="outstandingDebt"
                          value={userData.outstandingDebt}
                          onChange={handleInputChange}
                          disabled={!isEditing}
                          type="text"
                          style={{ backgroundColor: "var(--surface-3)", color: "#ffffff", border: "1px solid var(--border)", borderRadius: "4px" }}
                        />
                      </FormGroup>
                    </Col>
                    <Col className="pl-1" md="4">
                      <FormGroup>
                        <label style={{ color: "#ffffff" }}>Valuable Items</label>
                        <Input
                          name="valueableItems"
                          value={userData.valueableItems}
                          onChange={handleInputChange}
                          disabled={!isEditing}
                          type="text"
                          style={{ backgroundColor: "var(--surface-3)", color: "#ffffff", border: "1px solid var(--border)", borderRadius: "4px" }}
                        />
                      </FormGroup>
                    </Col>
                  </Row>
                 
                  {isCustomer && (
                    <>
                      {/* Save + Discard when editing and there are changes */}
                      {isEditing && hasChanges && (
                        <Row>
                          <Col md="12">
                            <div
                              className="d-flex"
                              style={{
                                gap: "12px",
                                flexDirection: isCompactProfile ? "column" : "row",
                                flexWrap: "wrap",
                              }}
                            >
                              <Button color="success" type="submit" style={isCompactProfile ? { width: "100%" } : undefined}>
                                Save Changes
                              </Button>
                              <Button
                                color="secondary"
                                className={isCompactProfile ? "" : "ml-2"}
                                onClick={handleDiscard}
                                style={isCompactProfile ? { width: "100%", marginLeft: 0 } : undefined}
                              >
                                Discard
                              </Button>
                            </div>
                          </Col>
                        </Row>
                      )}

                      {/* Edit button when NOT editing or no changes */}
                      {(!isEditing || !hasChanges) && (
                        <Row>
                          <Col md="12">
                            <div
                              className="d-flex"
                              style={{
                                gap: "12px",
                                flexDirection: isCompactProfile ? "column" : "row",
                                flexWrap: "wrap",
                                alignItems: "stretch",
                              }}
                            >
                              <Button
                                color="primary"
                                onClick={() => setIsEditing(true)}
                                disabled={editDisabled}
                                style={isCompactProfile ? { width: "100%" } : undefined}
                              >
                                Edit Profile
                              </Button>
                              <Button
                                color="danger"
                                onClick={handleDelete}
                                style={isCompactProfile ? { width: "100%" } : undefined}
                              >
                                Delete Account
                              </Button>
                            </div>
                          </Col>
                        </Row>
                      )}

                      {/* Delete account button when editing */}
                      {isEditing && (
                        <Row className="mt-3">
                          <Col md="12">
                            <Button color="danger" onClick={handleDelete}>
                              Delete Account
                            </Button>
                          </Col>
                        </Row>
                      )}
                    </>
                  )}
                </Form>
                  </TabPane>
                  <TabPane tabId="2">
                    {loadingSubscription ? (
                      <div style={{ padding: "40px", textAlign: "center", color: "var(--text-3)" }}>
                        <div className="spinner-border text-primary" role="status">
                          <span className="sr-only">Loading...</span>
                        </div>
                        <p style={{ marginTop: "16px" }}>Loading subscription details...</p>
                      </div>
                    ) : subscriptionData && subscriptionData.isPaid && subscriptionData.subscriptionDetails ? (
                      <div style={{ padding: "20px" }}>
                        {/* Subscription Status Card */}
                        <div style={{
                          backgroundColor: "var(--surface-2)",
                          borderRadius: "12px",
                          padding: "24px",
                          marginBottom: "24px",
                          border: "1px solid var(--surface-3)",
                          boxShadow: "0 4px 12px rgba(0, 0, 0, 0.3)"
                        }}>
                          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "20px" }}>
                            <div>
                            
                              <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                                <span style={{
                                  backgroundColor: subscriptionData.subscriptionDetails.status === "active" ? "var(--accent-solid)" : "#f59e0b",
                                  color: "#ffffff",
                                  padding: "4px 12px",
                                  borderRadius: "12px",
                                  fontSize: "12px",
                                  fontWeight: "600",
                                  textTransform: "capitalize"
                                }}>
                                  {subscriptionData.subscriptionDetails.status === "active" ? "✓ Active" : subscriptionData.subscriptionDetails.status}
                                </span>
                                <span style={{ color: "var(--text-3)", fontSize: "14px" }}>
                                  {subscriptionData.paymentType || "STRIPE"}
                                </span>
                              </div>
                            </div>
                            <div style={{ textAlign: "right" }}>
                              <div style={{ fontSize: "32px", fontWeight: "700", color: "#ffffff" }}>
                                ${subscriptionData.subscriptionDetails.amount}
                              </div>
                              <div style={{ color: "var(--text-3)", fontSize: "14px" }}>
                                per {subscriptionData.subscriptionDetails.interval}
                              </div>
                            </div>
                          </div>

                          {/* Subscription Details */}
                          <div style={{
                            display: "grid",
                            gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))",
                            gap: "16px",
                            marginTop: "24px",
                            paddingTop: "24px",
                            borderTop: "1px solid var(--surface-3)"
                          }}>
                            <div>
                              <div style={{ color: "var(--text-3)", fontSize: "12px", marginBottom: "4px" }}>
                                Subscription ID
                              </div>
                              <div style={{ color: "var(--text-1)", fontSize: "14px", fontFamily: "monospace", wordBreak: "break-all" }}>
                                {subscriptionData.subscriptionId}
                              </div>
                            </div>
                            <div>
                              <div style={{ color: "var(--text-3)", fontSize: "12px", marginBottom: "4px" }}>
                                Provider
                              </div>
                              <div style={{ color: "var(--text-1)", fontSize: "14px", textTransform: "capitalize" }}>
                                {subscriptionData.subscriptionDetails.provider || "Stripe"}
                              </div>
                            </div>
                            <div>
                              <div style={{ color: "var(--text-3)", fontSize: "12px", marginBottom: "4px" }}>
                                Next Billing Date
                              </div>
                              <div style={{ color: "var(--text-1)", fontSize: "14px" }}>
                                {new Date(subscriptionData.subscriptionDetails.nextBillingDate).toLocaleDateString("en-US", {
                                  year: "numeric",
                                  month: "long",
                                  day: "numeric"
                                })}
                              </div>
                            </div>
                            <div>
                              <div style={{ color: "var(--text-3)", fontSize: "12px", marginBottom: "4px" }}>
                                Billing Cycle
                              </div>
                              <div style={{ color: "var(--text-1)", fontSize: "14px", textTransform: "capitalize" }}>
                                {subscriptionData.subscriptionDetails.interval}ly
                              </div>
                            </div>
                            <div>
                              <div style={{ color: "var(--text-3)", fontSize: "12px", marginBottom: "4px" }}>
                                Currency
                              </div>
                              <div style={{ color: "var(--text-1)", fontSize: "14px", textTransform: "uppercase" }}>
                                {subscriptionData.subscriptionDetails.currency}
                              </div>
                            </div>
                            <div>
                              <div style={{ color: "var(--text-3)", fontSize: "12px", marginBottom: "4px" }}>
                                Auto-Renewal
                              </div>
                              <div style={{ color: "var(--text-1)", fontSize: "14px" }}>
                                {subscriptionData.subscriptionDetails.cancelAtPeriodEnd ? "Disabled (Canceling)" : "Enabled"}
                              </div>
                            </div>
                          </div>
                        </div>

                        {/* Cancellation Notice */}
                        {subscriptionData.subscriptionDetails.cancelAtPeriodEnd && (
                          <div style={{
                            backgroundColor: "#451a03",
                            borderRadius: "12px",
                            padding: "16px",
                            marginBottom: "24px",
                            border: "1px solid #f59e0b",
                            display: "flex",
                            alignItems: "center",
                            gap: "12px"
                          }}>
                            <span style={{ fontSize: "24px" }}>⚠️</span>
                            <div>
                              <div style={{ color: "#fbbf24", fontWeight: "600", marginBottom: "4px" }}>
                                Subscription Ending
                              </div>
                              <div style={{ color: "#fcd34d", fontSize: "14px" }}>
                                Your subscription will end on {new Date(subscriptionData.subscriptionDetails.nextBillingDate).toLocaleDateString("en-US", {
                                  year: "numeric",
                                  month: "long",
                                  day: "numeric"
                                })}. You can reactivate it anytime before this date.
                              </div>
                            </div>
                          </div>
                        )}
 {/* Invoices Section */}
 {subscriptionData.invoices && subscriptionData.invoices.length > 0 && (
                          <div style={{
                            backgroundColor: "var(--surface-2)",
                            borderRadius: "12px",
                            padding: "24px",
                            marginBottom: "24px",
                            border: "1px solid var(--surface-3)"
                          }}>
                            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "16px" }}>
                              <h5 style={{ color: "#ffffff", fontSize: "16px", fontWeight: "600", margin: 0 }}>
                                Billing History
                              </h5>
                              <span style={{ color: "var(--text-3)", fontSize: "14px" }}>
                                {subscriptionData.invoiceCount || subscriptionData.invoices.length} {subscriptionData.invoices.length === 1 ? 'Invoice' : 'Invoices'}
                              </span>
                            </div>
                            
                            <div style={{ overflowX: "auto" }}>
                              <table style={{ width: "100%", borderCollapse: "collapse" }}>
                                <thead>
                                  <tr style={{ borderBottom: "1px solid var(--surface-3)" }}>
                                    <th style={{ padding: "12px 8px", textAlign: "left", color: "var(--text-3)", fontSize: "12px", fontWeight: "600", textTransform: "uppercase" }}>
                                      Invoice
                                    </th>
                                    <th style={{ padding: "12px 8px", textAlign: "left", color: "var(--text-3)", fontSize: "12px", fontWeight: "600", textTransform: "uppercase" }}>
                                      Date
                                    </th>
                                    <th style={{ padding: "12px 8px", textAlign: "left", color: "var(--text-3)", fontSize: "12px", fontWeight: "600", textTransform: "uppercase" }}>
                                      Amount
                                    </th>
                                    <th style={{ padding: "12px 8px", textAlign: "left", color: "var(--text-3)", fontSize: "12px", fontWeight: "600", textTransform: "uppercase" }}>
                                      Status
                                    </th>
                                    <th style={{ padding: "12px 8px", textAlign: "right", color: "var(--text-3)", fontSize: "12px", fontWeight: "600", textTransform: "uppercase" }}>
                                      Actions
                                    </th>
                                  </tr>
                                </thead>
                                <tbody>
                                  {subscriptionData.invoices.map((invoice, index) => (
                                    <tr key={invoice.invoiceId || index} style={{ borderBottom: "1px solid var(--surface-3)" }}>
                                      <td style={{ padding: "16px 8px" }}>
                                        <div style={{ color: "var(--text-1)", fontSize: "14px", fontWeight: "500", marginBottom: "4px" }}>
                                          {invoice.invoiceNumber || invoice.invoiceId}
                                        </div>
                                        <div style={{ color: "var(--text-3)", fontSize: "12px" }}>
                                          {invoice.description || `${invoice.frequency || 'Monthly'} Subscription`}
                                        </div>
                                      </td>
                                      <td style={{ padding: "16px 8px" }}>
                                        <div style={{ color: "var(--text-1)", fontSize: "14px" }}>
                                          {new Date(invoice.paidAt || invoice.createdAt).toLocaleDateString("en-US", {
                                            year: "numeric",
                                            month: "short",
                                            day: "numeric"
                                          })}
                                        </div>
                                      </td>
                                      <td style={{ padding: "16px 8px" }}>
                                        <div style={{ color: "var(--text-1)", fontSize: "14px", fontWeight: "500" }}>
                                          ${invoice.amountPaid || invoice.amount}
                                        </div>
                                        <div style={{ color: "var(--text-3)", fontSize: "12px" }}>
                                          {(invoice.currency || 'USD').toUpperCase()}
                                        </div>
                                      </td>
                                      <td style={{ padding: "16px 8px" }}>
                                        <span style={{
                                          backgroundColor: invoice.status === "paid" ? "var(--accent-solid)20" : invoice.status === "open" ? "#f59e0b20" : "#ef444420",
                                          color: invoice.status === "paid" ? "var(--accent-solid)" : invoice.status === "open" ? "#f59e0b" : "#ef4444",
                                          padding: "4px 10px",
                                          borderRadius: "12px",
                                          fontSize: "12px",
                                          fontWeight: "600",
                                          textTransform: "capitalize"
                                        }}>
                                          {invoice.status}
                                        </span>
                                      </td>
                                      <td style={{ padding: "16px 8px", textAlign: "right" }}>
                                        <div style={{ display: "flex", gap: "8px", justifyContent: "flex-end" }}>
                                          {invoice.pdfUrl && (
                                            <a
                                              href={invoice.pdfUrl}
                                              target="_blank"
                                              rel="noopener noreferrer"
                                              style={{
                                                backgroundColor: "var(--surface-3)",
                                                color: "var(--text-1)",
                                                padding: "6px 12px",
                                                borderRadius: "6px",
                                                fontSize: "12px",
                                                textDecoration: "none",
                                                display: "inline-flex",
                                                alignItems: "center",
                                                gap: "4px",
                                                transition: "background-color 0.2s"
                                              }}
                                              onMouseEnter={(e) => e.target.style.backgroundColor = "var(--border)"}
                                              onMouseLeave={(e) => e.target.style.backgroundColor = "var(--surface-3)"}
                                            >
                                              📄 PDF
                                            </a>
                                          )}
                                          {invoice.hostedUrl && (
                                            <a
                                              href={invoice.hostedUrl}
                                              target="_blank"
                                              rel="noopener noreferrer"
                                              style={{
                                                backgroundColor: "var(--surface-3)",
                                                color: "var(--text-1)",
                                                padding: "6px 12px",
                                                borderRadius: "6px",
                                                fontSize: "12px",
                                                textDecoration: "none",
                                                display: "inline-flex",
                                                alignItems: "center",
                                                gap: "4px",
                                                transition: "background-color 0.2s"
                                              }}
                                              onMouseEnter={(e) => e.target.style.backgroundColor = "var(--border)"}
                                              onMouseLeave={(e) => e.target.style.backgroundColor = "var(--surface-3)"}
                                            >
                                              🔗 View
                                            </a>
                                          )}
                                        </div>
                                      </td>
                                    </tr>
                                  ))}
                                </tbody>
                              </table>
                            </div>
                          </div>
                        )}
                      

                        {/* Payment Method Card */}
                        <div style={{
                          backgroundColor: "var(--surface-2)",
                          borderRadius: "12px",
                          padding: "24px",
                          marginBottom: "24px",
                          border: "1px solid var(--surface-3)"
                        }}>
                          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "16px" }}>
                            <h5 style={{ color: "#ffffff", fontSize: "16px", fontWeight: "600", margin: 0 }}>
                              Payment Method
                            </h5>
                            <Button
                              size="sm"
                              style={{
                                backgroundColor: "var(--accent)",
                                borderColor: "var(--accent)",
                                fontSize: "12px",
                                padding: "6px 16px"
                              }}
                              onClick={handleUpdatePaymentMethod}
                              disabled={loadingSubscription}
                            >
                              {loadingSubscription ? (
                                <>
                                  <Spinner size="sm" style={{ marginRight: "4px" }} />
                                  Loading...
                                </>
                              ) : (
                                "Manage Payment"
                              )}
                            </Button>
                          </div>

                          <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
                            <div style={{
                              backgroundColor: "var(--surface-3)",
                              padding: "12px",
                              borderRadius: "8px",
                              fontSize: "24px"
                            }}>
                              {subscriptionData.paymentType === "STRIPE" ? "💳" : "🅿️"}
                            </div>
                            <div>
                              <div style={{ color: "var(--text-1)", fontSize: "14px", fontWeight: "500" }}>
                                {subscriptionData.paymentType === "STRIPE" ? "Credit/Debit Card (Stripe)" : "PayPal"}
                              </div>
                              <div style={{ color: "var(--text-3)", fontSize: "12px" }}>
                                {subscriptionData.paymentType === "STRIPE" ? "Managed via Stripe" : "Managed via PayPal"}
                              </div>
                            </div>
                          </div>
                        </div>

                       

                        {/* Actions */}
                        <div style={{
                          backgroundColor: "var(--surface-2)",
                          borderRadius: "12px",
                          padding: "24px",
                          border: "1px solid var(--surface-3)"
                        }}>
                          <h5 style={{ color: "#ffffff", marginBottom: "16px", fontSize: "16px", fontWeight: "600" }}>
                            Manage Subscription
                          </h5>
                          <div style={{ display: "flex", gap: "12px", flexWrap: "wrap" }}>
                            <Button
                              style={{
                                backgroundColor: "var(--accent)",
                                borderColor: "var(--accent)",
                                fontSize: "14px"
                              }}
                              onClick={() => navigate(location.pathname.includes("admin") ? "/admin/subscriptions" : "/customer/subscription")}
                            >
                              View Plans & Pricing
                            </Button>
                            <Button
                              style={{
                                backgroundColor: "#e53e3e",
                                borderColor: "#e53e3e",
                                color: "#ffffff",
                                fontSize: "14px"
                              }}
                              onClick={() => setShowCancelModal(true)}
                              disabled={cancelLoading}
                            >
                              {cancelLoading ? <><Spinner size="sm" /> Cancelling...</> : "Cancel Subscription"}
                            </Button>
                          </div>
                          <p style={{ color: "var(--text-3)", fontSize: "12px", marginTop: "16px", marginBottom: 0 }}>
                            Need help? Contact our support team at info@meksova.com
                          </p>
                        </div>
                      </div>
                    ) : (
                      <div style={{ padding: "40px", textAlign: "center" }}>
                        <div style={{
                          backgroundColor: "var(--surface-2)",
                          borderRadius: "12px",
                          padding: "40px",
                          border: "1px solid var(--surface-3)"
                        }}>
                          <div style={{ fontSize: "48px", marginBottom: "16px" }}>📋</div>
                          <h4 style={{ color: "#ffffff", marginBottom: "12px" }}>No Active Subscription</h4>
                          <p style={{ color: "var(--text-3)", marginBottom: "24px", maxWidth: "400px", margin: "0 auto 24px" }}>
                            Subscribe to Pro Plan to unlock unlimited transactions, advanced reports, and more features.
                          </p>
                          <Button
                            color="primary"
                            style={{ backgroundColor: "var(--accent)", borderColor: "var(--accent)", fontSize: "14px" }}
                            onClick={() => navigate(location.pathname.includes("admin") ? "/admin/subscriptions" : "/customer/subscription")}
                          >
                            View Plans & Subscribe
                          </Button>
                        </div>
                      </div>
                    )}
                  </TabPane>
                  <TabPane tabId="3">
                    <div
                      style={{
                        marginTop: "12px",
                        padding: "15px",
                        backgroundColor: "var(--surface-2)",
                        borderRadius: "8px",
                        border: "1px solid var(--surface-3)",
                      }}
                    >
                      <div style={{ display: "flex", alignItems: "center", gap: "8px", marginBottom: "8px" }}>
                        <span style={{ fontSize: "14px" }}>⚠️</span>
                        <span style={{ color: "#e53e3e", fontWeight: "bold", fontSize: "13px" }}>
                          Data Management
                        </span>
                      </div>
                      <p style={{ color: "var(--text-3)", fontSize: "13px", marginBottom: "12px", lineHeight: "1.4" }}>
                        Reset all accounting records and start fresh. Make sure to download your reports first.
                      </p>
                      <Button
                        onClick={handleOpenResetModal}
                        disabled={isWorking}
                        style={{
                          backgroundColor: "#e53e3e",
                          borderColor: "#e53e3e",
                          color: "#ffffff",
                          fontSize: "12px",
                          padding: "8px 16px",
                          borderRadius: "6px",
                        }}
                      >
                        Reset All Transactions
                      </Button>
                    </div>
                  </TabPane>
                </TabContent>
              </CardBody>
            </Card>
          </Col>
        </Row>
      </div>

      <Modal isOpen={showResetModal} toggle={() => { setShowResetModal(false); setResetConfirmText(""); }}>
        <ModalHeader
          toggle={() => { setShowResetModal(false); setResetConfirmText(""); }}
          style={{ backgroundColor: "var(--surface-2)", border: "none" }}
        >
          <span style={{ color: "#e53e3e", fontWeight: "bold" }}>Reset All Transactions</span>
        </ModalHeader>
        <ModalBody style={{ backgroundColor: "var(--surface-2)", color: "#ffffff" }}>
          <p style={{ color: "#ffffff", marginBottom: "12px" }}>
            This will permanently delete <strong>all transactions</strong> and reset your dashboard balances to zero.
          </p>
          <p style={{ color: "#e53e3e", marginBottom: "20px", fontWeight: "500" }}>
            We strongly recommend downloading your financial reports before continuing. This action cannot be undone.
          </p>
          <p style={{ color: "#ffffff", marginBottom: "8px" }}>Type <strong>RESET</strong> to confirm:</p>
          <Input
            type="text"
            placeholder="Type RESET here"
            value={resetConfirmText}
            onChange={(e) => setResetConfirmText(e.target.value)}
            style={{
              backgroundColor: "var(--surface-2)",
              color: "#ffffff",
              border: "1px solid var(--border)",
              marginBottom: "20px",
            }}
          />
          <div style={{ display: "flex", gap: "10px", flexWrap: "wrap" }}>
            <Button
              onClick={handleDownloadReport}
              disabled={isWorking}
              style={{ backgroundColor: "var(--accent)", borderColor: "var(--accent)", color: "#ffffff", flex: "1" }}
            >
              {isWorking ? "Downloading..." : "Download Financial Report"}
            </Button>
            <Button color="secondary" onClick={() => { setShowResetModal(false); setResetConfirmText(""); }}>
              Cancel
            </Button>
            <Button
              onClick={handleConfirmReset}
              disabled={resetConfirmText !== "RESET" || isWorking}
              style={{
                backgroundColor: resetConfirmText === "RESET" ? "#e53e3e" : "#666",
                borderColor: resetConfirmText === "RESET" ? "#e53e3e" : "#666",
                color: "#ffffff",
              }}
            >
              {isWorking ? "Processing..." : "Confirm Reset"}
            </Button>
          </div>
        </ModalBody>
      </Modal>

      {/* Cancel Subscription Confirmation Modal */}
      <Modal isOpen={showCancelModal} toggle={() => setShowCancelModal(false)}>
        <ModalHeader
          toggle={() => setShowCancelModal(false)}
          style={{ backgroundColor: "var(--surface-2)", border: "none" }}
        >
          <span style={{ color: "#e53e3e", fontWeight: "bold" }}>Cancel Subscription</span>
        </ModalHeader>
        <ModalBody style={{ backgroundColor: "var(--surface-2)", color: "#ffffff" }}>
          <p style={{ color: "#ffffff", marginBottom: "12px" }}>
            Are you sure you want to cancel your subscription?
          </p>
          <p style={{ color: "#fbbf24", marginBottom: "20px", fontWeight: "500" }}>
            Your subscription will remain active until the end of your current billing period on{" "}
            <strong>
              {subscriptionData?.subscriptionDetails?.nextBillingDate
                ? new Date(subscriptionData.subscriptionDetails.nextBillingDate).toLocaleDateString("en-US", {
                    year: "numeric",
                    month: "long",
                    day: "numeric"
                  })
                : "the end of the billing period"}
            </strong>.
          </p>
          <p style={{ color: "var(--text-3)", fontSize: "14px" }}>
            After cancellation, you'll lose access to:
          </p>
          <ul style={{ color: "var(--text-3)", fontSize: "14px", marginBottom: "20px" }}>
            <li>Unlimited transactions</li>
            <li>Advanced financial reports</li>
            <li>Balance sheet and income statement</li>
            <li>Receipt management</li>
          </ul>
        </ModalBody>
        <ModalFooter style={{ backgroundColor: "var(--surface-2)", borderTop: "1px solid var(--border)" }}>
          <Button
            color="secondary"
            onClick={() => setShowCancelModal(false)}
            disabled={cancelLoading}
            style={{ backgroundColor: "var(--surface-3)", borderColor: "var(--border)" }}
          >
            Keep Subscription
          </Button>
          <Button
            onClick={handleCancelSubscription}
            disabled={cancelLoading}
            style={{
              backgroundColor: "#e53e3e",
              borderColor: "#e53e3e",
              color: "#ffffff"
            }}
          >
            {cancelLoading ? (
              <>
                <Spinner size="sm" style={{ marginRight: "8px" }} />
                Cancelling...
              </>
            ) : (
              "Yes, Cancel Subscription"
            )}
          </Button>
        </ModalFooter>
      </Modal>
    </>
  );
}

export default UserPage;
