
import React, { useState, useEffect, useRef } from "react";
import axios from "axios";
import { apiUrl, ROUTES, normalizeReceiptUrl } from "../config/api";
import { authHeader } from "../utils/apiFetch";
import {
  Card,
  CardHeader,
  CardBody,
  CardTitle,
  Row,
  Col,
  Spinner,
  Input,
  Table,
  Modal,
  ModalHeader,
  ModalBody,
  FormGroup,
  Label,
  Button,
} from "reactstrap";
import Select from "react-select";
import PanelHeader from "components/PanelHeader/PanelHeader.js";
import { Helmet } from "react-helmet";
import { FaEye, FaDownload } from "react-icons/fa";
import NotificationAlert from "react-notification-alert";
import JSZip from "jszip";
import { saveAs } from "file-saver";
import LanguageSelector from "components/Languageselector/LanguageSelector";
import { useTranslation } from "react-i18next";

const Receipts = ({ selectedUser }) => {
  const { t } = useTranslation();
  const [receipts, setReceipts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selectedType, setSelectedType] = useState("all");
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [previewModal, setPreviewModal] = useState(false);
  const [selectedReceipt, setSelectedReceipt] = useState(null);
  const [fromDate, setFromDate] = useState("");
  const [toDate, setToDate] = useState("");
  const [searchedDates, setSearchedDates] = useState(null);
  const notificationAlertRef = useRef(null);
  const [disabled, setDisabled] = useState(false);
  const [selectedUserId, setSelectedUserId] = useState(null);
  const [users, setUsers] = useState([]);
  const userRole = parseInt(localStorage.getItem("role") || 1);
  const [isMobile, setIsMobile] = useState(window.innerWidth < 768);
  const [isLandscape, setIsLandscape] = useState(window.innerWidth > window.innerHeight);
  const isMobileLandscape = isMobile && isLandscape;

  useEffect(() => {
    if (userRole === 0 && !selectedUserId) return;

    fetchReceipts();
  }, [selectedUserId, startDate, endDate, selectedType]);

  useEffect(() => {
    const persistedUserId = localStorage.getItem("selectedUserId");

    if (userRole !== 0) return;
    if (!selectedUserId && !persistedUserId) {
      notify("tr", t('receipts.pleaseSelectUser'), "warning");
      setLoading(false);
      return;
    }

    if (!selectedUserId && persistedUserId) {
      setSelectedUserId(persistedUserId);
      return;
    }

    if (selectedUserId) {
      fetchReceipts();
    }
  }, [userRole, selectedUserId, startDate, endDate, selectedType, t]);

  useEffect(() => {
    const checkSubscription = async () => {
      const userId = localStorage.getItem("userId");
      const res = await axios.get(
        apiUrl(`${ROUTES.USERS}/${userId}`)
      );
      setDisabled(
        userRole !== 1 &&
        !res.data.user.subscription &&
        res.data.user.scheduleCount >= 4
      );
    };
    checkSubscription();
  }, [userRole]);

  useEffect(() => {
    if (userRole === 0) {
      const fetchUsers = async () => {
        try {
          const response = await axios.get(
            apiUrl(ROUTES.USERS)
          );
          setUsers(response.data || []);
        } catch (error) {
          console.error("Error fetching users:", error);
          notify("tr", "Error fetching users", "danger");
        }
      };
      fetchUsers();
    }
  }, [userRole]);

  const fetchReceipts = async () => {
    setLoading(true);
    try {
      const getUserId = () => {
        if (userRole === 0) return selectedUserId;
        return localStorage.getItem("userId");
      };
      const userId = getUserId();
      if (!userId) {
        setReceipts([]);
        setLoading(false);
        return;
      }

      const response = await axios.get(
        apiUrl(`${ROUTES.TRANSACTION}?userId=${userId}`)
      );

      let receiptsData = response.data.filter(
        (transaction) =>
          transaction.receiptUrl && transaction.receiptUrl.trim() !== ""
      );

      if (startDate && endDate) {
        receiptsData = receiptsData.filter((receipt) => {
          const receiptDate = new Date(receipt.createdAt);
          return (
            receiptDate >= new Date(startDate) &&
            receiptDate <= new Date(endDate)
          );
        });
      }

      if (selectedType !== "all") {
        receiptsData = receiptsData.filter(
          (receipt) => receipt.transactionType === selectedType
        );
      }
      receiptsData.sort(
        (a, b) => new Date(b.createdAt) - new Date(a.createdAt)
      );
      setReceipts(receiptsData);
    } catch (error) {
      console.error("Error fetching receipts:", error);
      notify("tr", "Error fetching receipts", "danger");
    } finally {
      setLoading(false);
    }
  };

 const handlePreview = async (receipt) => {
  try {
    console.log("🧾 Raw receipt object:", receipt);
    console.log("🔗 Raw receiptUrl:", receipt.receiptUrl);

    // Extract the S3 key from the stored URL
    // Stored format: https://bucket.s3.amazonaws.com/uploads/timestamp-file.jpg
    const url = receipt.receiptUrl || "";
    const keyMatch = url.match(/amazonaws\.com\/(.+)$/);
    const s3Key = keyMatch ? keyMatch[1] : null;

    if (!s3Key) {
      console.error("❌ Could not extract S3 key from URL:", url);
      notify("tr", "Could not load receipt preview.", "danger");
      return;
    }

    console.log("🔑 Extracted S3 key:", s3Key);

    // Get a fresh presigned URL
    const res = await fetch(
      apiUrl(`${ROUTES.RECEIPT}/view?key=${encodeURIComponent(s3Key)}`),
      { headers: { ...(await authHeader()) } }
    );
    const data = await res.json();

    if (!res.ok || !data.url) {
      throw new Error(data.error || "Failed to get preview URL");
    }

    console.log("✅ Presigned view URL:", data.url);
    setSelectedReceipt({ receiptUrl: data.url, originalUrl: url });
    setPreviewModal(true);
  } catch (err) {
    console.error("❌ handlePreview error:", err);
    notify("tr", "Could not load receipt preview.", "danger");
  }
};

 const handleDownload = async (receipt) => {
  try {
    if (!receipt || !receipt.receiptUrl) {
      throw new Error("Invalid receipt or missing URL");
    }

    // Extract S3 key and get presigned URL
    const url = receipt.receiptUrl || "";
    const keyMatch = url.match(/amazonaws\.com\/(.+)$/);
    const s3Key = keyMatch ? keyMatch[1] : null;

    if (!s3Key) throw new Error("Could not extract S3 key from URL");

    const res = await fetch(
      apiUrl(`${ROUTES.RECEIPT}/view?key=${encodeURIComponent(s3Key)}`),
      { headers: { ...(await authHeader()) } }
    );
    const data = await res.json();
    if (!res.ok || !data.url) throw new Error(data.error || "Failed to get download URL");

    const response = await fetch(data.url);
    if (!response.ok) throw new Error(`HTTP error! Status: ${response.status}`);

    const contentType = response.headers.get("content-type") || "";
    let fileExtension = "bin";
    if (contentType.startsWith("image/")) fileExtension = contentType.split("/")[1];
    else if (contentType === "application/pdf") fileExtension = "pdf";

    const blob = await response.blob();
    const fileName = `receipt-${receipt.transactionPurpose || "unknown"}-${Date.now()}.${fileExtension}`;
    const downloadUrl = window.URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = downloadUrl;
    link.download = fileName;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    window.URL.revokeObjectURL(downloadUrl);
  } catch (error) {
    console.error("Error downloading receipt:", error);
    notify("tr", `Error downloading receipt: ${error.message}`, "danger");
  }
};

  const handleRun = () => {
    if (fromDate && toDate) {
      const startDateTime = new Date(fromDate);
      startDateTime.setHours(0, 0, 0, 0);

      const endDateTime = new Date(toDate);
      endDateTime.setHours(23, 59, 59, 999);

      setStartDate(startDateTime.toISOString());
      setEndDate(endDateTime.toISOString());
      setSearchedDates({ from: fromDate, to: toDate });
    } else {
      notify("tr", "Please select both From and To dates", "warning");
    }
  };

  const handleClear = () => {
    setFromDate("");
    setToDate("");
    setStartDate("");
    setEndDate("");
    setSearchedDates(null);
    setSelectedType("all");
  };

  const handleDownloadAll = async () => {
    try {
      if (receipts.length === 0) {
        notify("tr", "No receipts to download.", "warning");
        return;
      }

      notify("tr", "Preparing receipts for download...", "info");

      const zip = new JSZip();

      const downloadPromises = receipts.map((receipt, index) =>
        (async () => {
          try {
            const url = normalizeReceiptUrl(receipt.receiptUrl);
            const response = await fetch(url, { mode: "cors" });
            if (!response.ok) {
              throw new Error(`HTTP error! Status: ${response.status}`);
            }

            const contentType = response.headers.get("content-type");
            let fileExtension;
            if (contentType) {
              if (contentType.startsWith("image/")) {
                fileExtension = contentType.split("/")[1];
              } else if (contentType === "application/pdf") {
                fileExtension = "pdf";
              } else {
                fileExtension = "bin";
              }
            } else {
              const urlParts = url.split(".");
              fileExtension = urlParts.length > 1 ? urlParts.pop() : "bin";
            }

            const blob = await response.blob();
            const fileName = `receipt-${receipt.transactionPurpose || "unknown"
              }-${index + 1}.${fileExtension}`;

            zip.file(fileName, blob);
          } catch (error) {
            console.error(
              `Error downloading receipt ${receipt.transactionPurpose || index
              }:`,
              error
            );
            notify(
              "tr",
              `Error downloading receipt ${receipt.transactionPurpose || "unknown"
              }: ${error.message}`,
              "danger"
            );
          }
        })()
      );

      await Promise.all(downloadPromises);

      const blob = await zip.generateAsync({ type: "blob" });
      saveAs(blob, "receipts.zip");
      notify("tr", "All receipts downloaded successfully!", "success");
    } catch (error) {
      console.error("Error downloading all receipts:", error);
      notify("tr", "Error creating zip file", "danger");
    }
  };

  const notify = (place, message, type) => {
    notificationAlertRef.current.notificationAlert({
      place,
      message: <div>{message}</div>,
      type,
      icon: "now-ui-icons ui-1_bell-53",
      autoDismiss: 7,
    });
  };

  return (
    <>
      <Helmet>
        <title>{t('receipts.title')} - Meksova</title>
      </Helmet>
      <NotificationAlert ref={notificationAlertRef} />
      <div className="content" style={{ paddingInline: 15, backgroundColor: "var(--surface-2)" }}>


        {userRole === 0 && (
          <Row style={{ margin: 0, paddingInline: 0, marginTop: isMobile ? 8 : 80 }}>
            <Col xs={12} style={{ paddingInline: 0 }}>
              <Card style={{ marginBottom: "5px", backgroundColor: "var(--surface-2)", boxShadow: "0 4px 12px rgba(0, 0, 0, 0.4), 0 2px 6px rgba(0, 0, 0, 0.3)", borderRadius: "8px" }}>
                <CardHeader style={{ backgroundColor: "var(--surface-2)" }}></CardHeader>
                <CardBody style={{ paddingBottom: "15px", backgroundColor: "var(--surface-2)" }}>
                  <FormGroup style={{ marginBottom: "0" }}>
                    <Label style={{ color: "var(--text-1)" }}>
                      {t('receipts.selectUserToView')}
                    </Label>
                    <Select
                      options={users.map((user) => ({
                        value: user.id,
                        label: user.email,
                      }))}
                      value={
                        users.find((u) => u.id === selectedUserId)
                          ? {
                            value: selectedUserId,
                            label: users.find((u) => u.id === selectedUserId)
                              .email,
                          }
                          : null
                      }
                      onChange={(option) => {
                        const userId = option ? option.value : null;
                        setSelectedUserId(userId);
                        if (userId) {
                          localStorage.setItem("selectedUserId", userId);
                        } else {
                          localStorage.removeItem("selectedUserId");
                        }
                      }}
                      isClearable
                      isSearchable
                      placeholder={t('receipts.searchUser')}
                      styles={{
                        control: (provided) => ({
                          ...provided,
                          minHeight: "38px",
                          height: "38px",
                          backgroundColor: "var(--surface-3) !important",
                          borderColor: "var(--border) !important",
                          color: "var(--text-1) !important",
                        }),
                        valueContainer: (provided) => ({
                          ...provided,
                          height: "38px",
                          padding: "0 6px",
                          color: "var(--text-1) !important",
                        }),
                        input: (provided) => ({
                          ...provided,
                          margin: "0px",
                          color: "var(--text-1) !important",
                        }),
                        indicatorsContainer: (provided) => ({
                          ...provided,
                          height: "38px",
                        }),
                        singleValue: (provided) => ({
                          ...provided,
                          color: "var(--text-1) !important",
                        }),
                        placeholder: (provided) => ({
                          ...provided,
                          color: "var(--text-3) !important",
                        }),
                        menu: (provided) => ({
                          ...provided,
                          backgroundColor: "var(--surface-3)",
                        }),
                        option: (provided, state) => ({
                          ...provided,
                          backgroundColor: state.isFocused ? "var(--border)" : "var(--surface-3)",
                          color: "var(--text-1)",
                        }),
                      }}
                    />
                  </FormGroup>
                </CardBody>
              </Card>
            </Col>
          </Row>
        )}

        <Row style={{ marginTop: userRole === 0 ? (isMobile ? 8 : 12) : 80 }}>
          <Col xs={12}>
            <Card style={{ backgroundColor: "var(--surface-2)", boxShadow: "0 4px 12px rgba(0, 0, 0, 0.4), 0 2px 6px rgba(0, 0, 0, 0.3)", borderRadius: "8px" }}>
              <CardHeader style={{ backgroundColor: "var(--surface-2)" }}>
                <div className="d-flex flex-column flex-md-row justify-content-between align-items-start align-items-md-center gap-3">
                  <CardTitle tag="h4" className="mb-0" style={{ color: "var(--accent-solid)" }}>
                    {t('receipts.title')}
                  </CardTitle>

                  <div className="d-flex flex-column flex-lg-row gap-3 w-100 align-items-lg-end">
                    <div className="d-flex flex-column flex-sm-row gap-3 flex-lg-grow-1">
                      <FormGroup className="mb-0 flex-fill p-2">
                        <Label for="fromDate" className="mb-1" style={{ color: "var(--text-1)" }}>
                          {t('receipts.from')}
                        </Label>
                        <Input
                          type="date"
                          id="fromDate"
                          value={fromDate}
                          onChange={(e) => setFromDate(e.target.value)}
                          className="w-100"
                          style={{ backgroundColor: "var(--surface-3)", color: "var(--text-1)", border: "1px solid var(--border)", borderRadius: "4px" }}
                        />
                      </FormGroup>
                      <FormGroup className="mb-0 flex-fill p-2">
                        <Label for="toDate" className="mb-1" style={{ color: "var(--text-1)" }}>
                          {t('receipts.to')}
                        </Label>
                        <Input
                          type="date"
                          id="toDate"
                          value={toDate}
                          onChange={(e) => setToDate(e.target.value)}
                          className="w-100"
                          style={{ backgroundColor: "var(--surface-3)", color: "var(--text-1)", border: "1px solid var(--border)", borderRadius: "4px" }}
                        />
                      </FormGroup>
                    </div>
                    <div className="d-flex gap-2">
                      <Button
                        onClick={handleRun}
                        style={{ minWidth: "90px", backgroundColor: "var(--accent)", borderColor: "var(--accent)", color: "var(--text-1)" }}
                      >
                        {t('receipts.run')}
                      </Button>
                      <Button
                        onClick={handleClear}
                        style={{ minWidth: "90px", backgroundColor: "var(--surface-3)", borderColor: "var(--surface-3)", color: "var(--text-1)" }}
                      >
                        {t('receipts.clear')}
                      </Button>
                      <Button
                        onClick={handleDownloadAll}
                        disabled={disabled}
                        style={{ minWidth: "120px", backgroundColor: "var(--accent-solid)", borderColor: "var(--accent-solid)", color: "var(--accent-ink)" }}
                      >
                        {t('receipts.downloadAll')}
                      </Button>
                    </div>
                  </div>
                </div>
              </CardHeader>
              <CardBody style={{ backgroundColor: "var(--surface-2)" }}>
                {userRole === 0 && !selectedUserId && (
                  <div className="text-center my-4" style={{ color: "var(--text-1)" }}>
                    {t('receipts.pleaseSelectUser')}
                  </div>
                )}

                {loading ? (
                  <div className="text-center py-4">
                    <Spinner color="primary" />
                    <p className="mt-2" style={{ color: "var(--text-1)" }}>
                      {t('receipts.loadingReceipts')}
                    </p>
                  </div>
                ) : receipts.length === 0 ? (
                  <div className="text-center py-4">
                    <p style={{ color: "var(--text-1)" }}>
                      {t('receipts.noReceipts')}
                    </p>
                  </div>
                ) : (
                  <>
                    {searchedDates && (
                      <div className="mb-3" style={{ color: "var(--text-1)" }}>
                        <strong>{t('receipts.searchedDates')}</strong> {searchedDates.from} - {searchedDates.to}
                      </div>
                    )}

                    {/* Desktop Table */}
                    <div className="d-none d-md-block">
                      <Table responsive style={{ backgroundColor: "var(--surface-2)" }}>
                        <thead>
                          <tr>
                            <th style={{ color: "var(--text-1)", borderColor: "var(--border)" }}>
                              {t('receipts.srNo')}
                            </th>
                            <th style={{ color: "var(--text-1)", borderColor: "var(--border)" }}>
                              {t('receipts.date')}
                            </th>
                            <th style={{ color: "var(--text-1)", borderColor: "var(--border)" }}>
                              {t('receipts.purpose')}
                            </th>
                            <th style={{ color: "var(--text-1)", borderColor: "var(--border)" }}>
                              {t('receipts.amount')}
                            </th>
                            <th style={{ color: "var(--text-1)", borderColor: "var(--border)" }}>
                              {t('receipts.type')}
                            </th>
                            <th style={{ color: "var(--text-1)", borderColor: "var(--border)" }}>
                              {t('receipts.category')}
                            </th>
                            <th style={{ color: "var(--text-1)", borderColor: "var(--border)" }}>
                              {t('receipts.actions')}
                            </th>
                          </tr>
                        </thead>
                        <tbody>
                          {receipts.map((receipt, index) => (
                            <tr key={receipt.id || receipt.receiptUrl} style={{ borderColor: "var(--border)" }}>
                              <td style={{ color: "var(--text-1)", borderColor: "var(--border)" }}>{index + 1}</td>
                              <td style={{ color: "var(--text-1)", borderColor: "var(--border)" }}>
                                {new Date(receipt.createdAt).toLocaleDateString()}
                              </td>
                              <td style={{ color: "var(--text-1)", borderColor: "var(--border)" }}>{receipt.transactionPurpose}</td>
                              <td style={{ color: "var(--text-1)", borderColor: "var(--border)" }}>${receipt.transactionAmount}</td>
                              <td style={{ color: "var(--text-1)", borderColor: "var(--border)" }}>{receipt.transactionType}</td>
                              <td style={{ color: "var(--text-1)", borderColor: "var(--border)" }}>{receipt.subType || "-"}</td>
                              <td>
                                <FaEye
                                  onClick={
                                    !disabled
                                      ? () => handlePreview(receipt)
                                      : undefined
                                  }
                                  style={{
                                    cursor: disabled ? "not-allowed" : "pointer",
                                    marginRight: "1rem",
                                    color: disabled ? "#666" : "var(--accent)",
                                  }}
                                  title={t('receipts.preview')}
                                />
                                <FaDownload
                                  onClick={
                                    !disabled
                                      ? () => handleDownload(receipt)
                                      : undefined
                                  }
                                  style={{
                                    cursor: disabled ? "not-allowed" : "pointer",
                                    color: disabled ? "#666" : "var(--accent-solid)",
                                  }}
                                  title={t('receipts.download')}
                                />
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </Table>
                    </div>

                    {/* Mobile Cards */}
                    <div className="d-block d-md-none">
                      {receipts.map((receipt, index) => (
                        <Card
                          key={receipt.id || receipt.receiptUrl}
                          className="mb-3"
                          style={{ backgroundColor: "var(--surface-2)", boxShadow: "0 4px 12px rgba(0, 0, 0, 0.4), 0 2px 6px rgba(0, 0, 0, 0.3)", borderRadius: "8px" }}
                        >
                          <CardBody style={{ backgroundColor: "var(--surface-2)" }}>
                            <Row>
                              <Col xs={6}>
                                <strong style={{ color: "var(--text-1)" }}>{t('receipts.srNo')}:</strong>
                              </Col>
                              <Col xs={6} style={{ color: "var(--text-1)" }}>
                                {index + 1}
                              </Col>
                            </Row>
                            <Row className="mt-2">
                              <Col xs={6}>
                                <strong style={{ color: "var(--text-1)" }}>{t('receipts.date')}:</strong>
                              </Col>
                              <Col xs={6} style={{ color: "var(--text-1)" }}>
                                {new Date(receipt.createdAt).toLocaleDateString()}
                              </Col>
                            </Row>
                            <Row className="mt-2">
                              <Col xs={6}>
                                <strong style={{ color: "var(--text-1)" }}>{t('receipts.purpose')}:</strong>
                              </Col>
                              <Col xs={6} style={{ color: "var(--text-1)" }}>{receipt.transactionPurpose}</Col>
                            </Row>
                            <Row className="mt-2">
                              <Col xs={6}>
                                <strong style={{ color: "var(--text-1)" }}>{t('receipts.amount')}:</strong>
                              </Col>
                              <Col xs={6} style={{ color: "var(--text-1)" }}>${receipt.transactionAmount}</Col>
                            </Row>
                            <Row className="mt-2">
                              <Col xs={6}>
                                <strong style={{ color: "var(--text-1)" }}>{t('receipts.type')}:</strong>
                              </Col>
                              <Col xs={6} style={{ color: "var(--text-1)" }}>{receipt.transactionType}</Col>
                            </Row>
                            <Row className="mt-2">
                              <Col xs={6}>
                                <strong style={{ color: "var(--text-1)" }}>{t('receipts.category')}:</strong>
                              </Col>
                              <Col xs={6} style={{ color: "var(--text-1)" }}>{receipt.subType || "-"}</Col>
                            </Row>
                            <Row className="mt-3">
                              <Col xs={12}>
                                <div className="d-flex justify-content-center gap-3">
                                  <Button
                                    size="sm"
                                    onClick={
                                      !disabled
                                        ? () => handlePreview(receipt)
                                        : undefined
                                    }
                                    disabled={disabled}
                                    style={{ backgroundColor: "var(--accent-solid)", borderColor: "var(--accent-solid)", color: "var(--accent-ink)" }}
                                  >
                                    <FaEye className="me-1" />
                                    {t('receipts.preview')}
                                  </Button>
                                  <Button
                                    size="sm"
                                    onClick={
                                      !disabled
                                        ? () => handleDownload(receipt)
                                        : undefined
                                    }
                                    disabled={disabled}
                                    style={{ backgroundColor: "var(--accent-solid)", borderColor: "var(--accent-solid)", color: "var(--accent-ink)" }}
                                  >
                                    <FaDownload className="me-1" />
                                    {t('receipts.download')}
                                  </Button>
                                </div>
                              </Col>
                            </Row>
                          </CardBody>
                        </Card>
                      ))}
                    </div>
                  </>
                )}
              </CardBody>
            </Card>
          </Col>
        </Row>
      </div>

      <Modal
        isOpen={previewModal}
        toggle={() => setPreviewModal(false)}
        size="lg"
        className="modal-dialog-centered"
      >
        <ModalHeader toggle={() => setPreviewModal(false)}>
          {t('receipts.receiptPreview')}
        </ModalHeader>
        <ModalBody>
          {selectedReceipt && selectedReceipt.receiptUrl && (
            <>
              {console.log("🖼️ Rendering preview for URL:", selectedReceipt.receiptUrl)}

              {(selectedReceipt.receiptUrl.includes(".pdf") || selectedReceipt.originalUrl?.includes(".pdf")) ? (
                <object
                  data={selectedReceipt.receiptUrl}
                  type="application/pdf"
                  width="100%"
                  height="500px"
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
                  onLoad={() => console.log("✅ Image loaded successfully:", selectedReceipt.receiptUrl)}
                  onError={(e) => console.error("❌ Image failed to load:", selectedReceipt.receiptUrl, e)}
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
    </>
  );
};

export default Receipts;