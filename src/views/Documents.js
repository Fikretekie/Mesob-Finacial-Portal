import React, { useState, useEffect, useRef } from "react";
import {
  Card,
  CardHeader,
  CardBody,
  CardTitle,
  Row,
  Col,
  Button,
  Input,
  FormGroup,
  Label,
  Spinner,
  Modal,
  ModalHeader,
  ModalBody,
  ModalFooter,
  Table,
  Progress,
} from "reactstrap";
import { Helmet } from "react-helmet";
import { useTranslation } from "react-i18next";
import axios from "axios";
import Select from "react-select";
import { FaUpload, FaDownload, FaEye, FaTrash, FaCompressArrowsAlt } from "react-icons/fa";
import NotificationAlert from "react-notification-alert";
import { apiUrl, ROUTES, S3_BUCKET_NAME } from "../config/api";
import { authHeader } from "../utils/apiFetch";

const DOCUMENT_DELETE_ACTION = ROUTES.DOCUMENT_DELETE_ACTION;

const MAX_FILE_SIZE_MB = 10;
const MAX_FILE_SIZE_BYTES = MAX_FILE_SIZE_MB * 1024 * 1024;
const COMPRESSION_TARGET_BYTES = Math.floor(MAX_FILE_SIZE_BYTES * 0.72);

const ACCEPT_TYPES = "image/*,.pdf,.doc,.docx,.xls,.xlsx,.txt,.csv";

/** Compressible image MIME types */
const COMPRESSIBLE_IMAGE_TYPES = ["image/jpeg", "image/jpg", "image/png", "image/webp", "image/bmp"];

const userSelectStyles = {
  control: (provided) => ({
    ...provided,
    minHeight: "38px",
    height: "38px",
    backgroundColor: "var(--surface-3) !important",
    borderColor: "var(--border) !important",
    color: "#ffffff !important",
  }),
  valueContainer: (provided) => ({
    ...provided,
    height: "38px",
    padding: "0 6px",
    color: "#ffffff !important",
  }),
  input: (provided) => ({
    ...provided,
    margin: "0px",
    color: "#ffffff !important",
  }),
  indicatorsContainer: (provided) => ({
    ...provided,
    height: "38px",
  }),
  singleValue: (provided) => ({
    ...provided,
    color: "#ffffff !important",
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
    color: "#ffffff",
  }),
};

/** Keep original extension if user omits it */
function resolveUploadFileName(inputName, originalFileName) {
  const trimmed = (inputName || "").trim();
  if (!trimmed) return originalFileName;
  const lastDot = originalFileName.lastIndexOf(".");
  const ext = lastDot >= 0 ? originalFileName.slice(lastDot) : "";
  if (!ext) return trimmed;
  if (trimmed.toLowerCase().endsWith(ext.toLowerCase())) return trimmed;
  return trimmed + ext;
}

function formatSize(bytes) {
  if (bytes == null) return "—";
  if (bytes < 1024) return bytes + " B";
  if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + " KB";
  return (bytes / (1024 * 1024)).toFixed(2) + " MB";
}

/**
 * Compress an image File using Canvas API.
 * Progressively reduces quality (and scale if needed) until under maxBytes.
 * Returns a new File with the compressed data.
 */
async function compressImage(file, maxBytes, onProgress) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    const objectUrl = URL.createObjectURL(file);

    img.onload = () => {
      URL.revokeObjectURL(objectUrl);

      console.log("[compressImage] Image loaded:", {
        naturalWidth: img.naturalWidth,
        naturalHeight: img.naturalHeight,
        fileSizeMB: (file.size / (1024 * 1024)).toFixed(2),
      });

      const canvas = document.createElement("canvas");
      const { width, height } = img;

      // Always output as JPEG for max compression (PNG is lossless — terrible for size reduction)
      const outputType = "image/jpeg";

      const attemptCompress = (scale, quality) => {
        const newW = Math.max(1, Math.round(width * scale));
        const newH = Math.max(1, Math.round(height * scale));
        canvas.width = newW;
        canvas.height = newH;
        const ctx = canvas.getContext("2d");
        ctx.fillStyle = "#ffffff";
        ctx.fillRect(0, 0, newW, newH);
        ctx.drawImage(img, 0, 0, newW, newH);

        console.log(`[compressImage] Trying scale=${scale} quality=${quality} → ${newW}x${newH}`);

        return new Promise((res) => canvas.toBlob(res, outputType, quality));
      };

      // More aggressive steps: quality 0.9→0.3, scale 1.0→0.3
      const qualitySteps = [0.9, 0.8, 0.7, 0.6, 0.5, 0.4, 0.3];
      const scaleSteps   = [1.0, 0.85, 0.7, 0.55, 0.4, 0.3];
      const totalSteps   = qualitySteps.length * scaleSteps.length;
      let stepIndex = 0;

      const tryNext = async () => {
        const qi = stepIndex % qualitySteps.length;
        const si = Math.floor(stepIndex / qualitySteps.length);

        if (si >= scaleSteps.length) {
          console.warn("[compressImage] All combinations exhausted — still above limit");
          resolve(null);
          return;
        }

        const quality = qualitySteps[qi];
        const scale   = scaleSteps[si];

        onProgress && onProgress(Math.round((stepIndex / totalSteps) * 90));

        const blob = await attemptCompress(scale, quality);

        if (!blob) {
          console.error("[compressImage] canvas.toBlob() returned null at step", stepIndex);
          reject(new Error("canvas.toBlob() returned null"));
          return;
        }

        const blobMB = (blob.size / (1024 * 1024)).toFixed(2);
        console.log(`[compressImage] Step ${stepIndex}: blob=${blobMB}MB, limit=${(maxBytes / (1024 * 1024)).toFixed(2)}MB`);

        if (blob.size <= maxBytes) {
          console.log("[compressImage] ✅ Under limit at step", stepIndex);
          const ext = ".jpg";
          const baseName = file.name.replace(/\.[^.]+$/, "");
          const compressedFile = new File([blob], baseName + ext, { type: outputType });
          onProgress && onProgress(100);
          resolve(compressedFile);
        } else {
          stepIndex++;
          await tryNext();
        }
      };

      tryNext().catch(reject);
    };

    img.onerror = (e) => {
      URL.revokeObjectURL(objectUrl);
      console.error("[compressImage] img.onerror fired:", e);
      reject(new Error("Failed to load image for compression"));
    };

    img.src = objectUrl;
  });
}

const Documents = () => {
  const { t } = useTranslation();
  const notificationAlertRef = useRef(null);
  const fileInputRef = useRef(null);

  const [documents, setDocuments] = useState([]);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [previewModal, setPreviewModal] = useState(false);
  const [previewItem, setPreviewItem] = useState(null);
  const [previewUrl, setPreviewUrl] = useState(null);
  const [previewLoading, setPreviewLoading] = useState(false);
  const [downloadingAll, setDownloadingAll] = useState(false);
  const [deletingKey, setDeletingKey] = useState(null);
  const [uploadNameModal, setUploadNameModal] = useState(false);
  const [pendingUploadFile, setPendingUploadFile] = useState(null);
  const [uploadDisplayName, setUploadDisplayName] = useState("");
  const [isMobile, setIsMobile] = useState(window.innerWidth < 768);

  // Compression state
  const [compressing, setCompressing] = useState(false);
  const [compressionProgress, setCompressionProgress] = useState(0);
  const [compressionModal, setCompressionModal] = useState(false);
  const [compressionInfo, setCompressionInfo] = useState(null); // { originalSize, compressedSize }

  const userRole = parseInt(localStorage.getItem("role") || "1", 10);
  const isAdminView = userRole === 0;
  const [selectedUserId, setSelectedUserId] = useState(
    () => localStorage.getItem("selectedUserId") || null
  );
  const [users, setUsers] = useState([]);

  const effectiveUserId =
    isAdminView ? selectedUserId : localStorage.getItem("userId");

  useEffect(() => {
    const handleResize = () => setIsMobile(window.innerWidth < 768);
    window.addEventListener("resize", handleResize);
    return () => window.removeEventListener("resize", handleResize);
  }, []);

  useEffect(() => {
    if (!isAdminView) return;
    const fetchUsers = async () => {
      try {
        const response = await axios.get(apiUrl(ROUTES.USERS));
        setUsers(response.data || []);
      } catch (error) {
        console.error("Error fetching users:", error);
        notify("tr", t("documents.errorList"), "danger");
      }
    };
    fetchUsers();
  }, [isAdminView, t]);

  useEffect(() => {
    if (isAdminView && !selectedUserId) {
      setDocuments([]);
      setLoading(false);
      return;
    }
    if (effectiveUserId) fetchDocuments(effectiveUserId);
  }, [isAdminView, selectedUserId, effectiveUserId]);

  const notify = (place, message, type) => {
    if (notificationAlertRef.current)
      notificationAlertRef.current.notificationAlert({
        place,
        message: <div>{message}</div>,
        type,
        icon: "now-ui-icons ui-1_bell-53",
        autoDismiss: 7,
      });
  };

  const fetchDocuments = async (targetUserId) => {
    const uid =
      targetUserId ??
      (isAdminView ? selectedUserId : localStorage.getItem("userId"));
    if (!uid) return;
    setLoading(true);
    try {
      const res = await fetch(
        apiUrl(`${ROUTES.DOCUMENT}?userId=${encodeURIComponent(uid)}`),
        { headers: { ...(await authHeader()) } }
      );
      const data = await res.json();
      if (res.ok && Array.isArray(data)) {
        setDocuments(data);
      } else if (res.ok && data?.documents) {
        setDocuments(data.documents);
      } else if (res.ok && data?.items) {
        setDocuments(data.items);
      } else {
        setDocuments([]);
      }
    } catch (err) {
      console.error("Error fetching documents:", err);
      setDocuments([]);
      notify("tr", t("documents.errorList"), "danger");
    } finally {
      setLoading(false);
    }
  };

  const getDocumentUrl = async (key) => {
    try {
      const res = await fetch(
        apiUrl(`${ROUTES.DOCUMENT}/url?key=${encodeURIComponent(key)}`),
        { headers: { ...(await authHeader()) } }
      );
      const data = await res.json();
      return data?.url || data?.previewUrl || null;
    } catch {
      return null;
    }
  };

  const closeUploadNameModal = () => {
    setUploadNameModal(false);
    setPendingUploadFile(null);
    setUploadDisplayName("");
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  const closeCompressionModal = () => {
    setCompressionModal(false);
    setCompressionInfo(null);
    setCompressionProgress(0);
  };

  /**
   * Main entry point when a file is selected.
   * Handles size check → compression (if needed) → name modal.
   */
  const handleFileSelected = async (e) => {
    const files = e.target.files;
    if (!files?.length || !effectiveUserId) return;
    const file = files[0];
  console.log("[Upload] File selected:", {
      name: file.name,
      type: file.type,
      size: formatSize(file.size),
      isOverLimit: file.size > MAX_FILE_SIZE_BYTES,
      isCompressibleImage: COMPRESSIBLE_IMAGE_TYPES.includes(file.type),
    });
    if (file.size <= MAX_FILE_SIZE_BYTES) {
      // File is within limit — go straight to name modal
      setPendingUploadFile(file);
      setUploadDisplayName(file.name);
      setUploadNameModal(true);
      return;
    }

    // File exceeds limit — can we compress it?
    const isImage = COMPRESSIBLE_IMAGE_TYPES.includes(file.type);

  if (!isImage) {
  // Non-image large file — skip compression, go straight to upload via presigned URL
  console.log("[Upload] Large non-image file, skipping compression, will use presigned URL:", {
    fileName: file.name,
    fileType: file.name.split(".").pop().toUpperCase(),
    fileSize: formatSize(file.size),
  });
  setPendingUploadFile(file);
  setUploadDisplayName(file.name);
  setUploadNameModal(true);
  return;
}

    // Show compression modal and start compressing
    setCompressionInfo({ originalSize: file.size, compressedSize: null });
    setCompressionProgress(0);
    setCompressionModal(true);
    setCompressing(true);

   try {
  console.log("[Compression] Starting:", {
    fileName: file.name,
    fileType: file.type,
    fileSizeMB: (file.size / (1024 * 1024)).toFixed(2),
    maxAllowedMB: MAX_FILE_SIZE_MB,
  });

const compressed = await compressImage(file, COMPRESSION_TARGET_BYTES, (pct) => {
  console.log("[Compression] Progress:", pct + "%");
  setCompressionProgress(pct);
});

  console.log("[Compression] Result:", compressed
    ? { name: compressed.name, type: compressed.type, sizeMB: (compressed.size / (1024 * 1024)).toFixed(2) }
    : "null — could not compress below limit"
  );

  setCompressing(false);

  if (!compressed) {
    setCompressionModal(false);
    notify("tr", t("documents.compressionFailed", { max: MAX_FILE_SIZE_MB }), "danger");
    if (fileInputRef.current) fileInputRef.current.value = "";
    return;
  }

  console.log("[Compression] Updating UI with success state");
  setCompressionInfo({ originalSize: file.size, compressedSize: compressed.size });
  setCompressionProgress(100);

  await new Promise((r) => setTimeout(r, 900));

  const baseName = file.name.replace(/\.[^.]+$/, "");
  const newExt = compressed.name.split(".").pop();
  const suggestedName = baseName + "." + newExt;
  console.log("[Compression] Opening name modal, suggestedName:", suggestedName);

  setCompressionModal(false);
  setPendingUploadFile(compressed);
  setUploadDisplayName(suggestedName);
  setUploadNameModal(true);
} catch (err) {
  console.error("[Compression] CAUGHT ERROR:", {
    message: err?.message,
    stack: err?.stack,
    errorName: err?.name,
  });
  setCompressing(false);
  setCompressionModal(false);
  notify("tr", t("documents.compressionError"), "danger");
  if (fileInputRef.current) fileInputRef.current.value = "";
}
  };

  const confirmUploadWithName = () => {
    if (!pendingUploadFile) return;
    const resolved = resolveUploadFileName(uploadDisplayName, pendingUploadFile.name);
    if (!resolved.trim()) {
      notify("tr", t("documents.nameDocumentEmpty"), "warning");
      return;
    }
    const file = pendingUploadFile;
    setUploadNameModal(false);
    setPendingUploadFile(null);
    setUploadDisplayName("");
    if (fileInputRef.current) fileInputRef.current.value = "";
    performUpload(file, resolved);
  };

 const performUpload = async (file, fileNameForApi) => {
  setUploading(true);
  try {
    console.log("[performUpload] Requesting presigned URL:", {
      fileName: fileNameForApi,
      contentType: file.type,
      sizeMB: (file.size / (1024 * 1024)).toFixed(2),
    });

    // Step 1 — get presigned URL from Lambda
    const presignRes = await fetch(
      apiUrl(
        `${ROUTES.DOCUMENT}/presign?userId=${encodeURIComponent(effectiveUserId)}&fileName=${encodeURIComponent(fileNameForApi)}&contentType=${encodeURIComponent(file.type || "application/octet-stream")}`
      ),
      { headers: { ...(await authHeader()) } }
    );

    if (!presignRes.ok) {
      const err = await presignRes.json().catch(() => ({}));
      throw new Error(err.error || `Failed to get upload URL: HTTP ${presignRes.status}`);
    }

    const { presignedUrl, key } = await presignRes.json();
    console.log("[performUpload] Got presigned URL, uploading directly to S3, key:", key);

    // Step 2 — PUT file directly to S3 (bypasses API Gateway, no size limit)
    const uploadRes = await fetch(presignedUrl, {
      method: "PUT",
      headers: { "Content-Type": file.type || "application/octet-stream" },
      body: file,
    });

    if (!uploadRes.ok) {
      console.error("[performUpload] S3 PUT failed:", uploadRes.status, uploadRes.statusText);
      throw new Error(`S3 upload failed: HTTP ${uploadRes.status}`);
    }

    console.log("[performUpload] ✅ Upload successful, key:", key);
    notify("tr", t("documents.uploadSuccess"), "success");
    fetchDocuments(effectiveUserId);
  } catch (err) {
    console.error("[performUpload] Error:", { message: err?.message, stack: err?.stack });
    notify("tr", t("documents.uploadError") + " " + (err.message || ""), "danger");
  } finally {
    setUploading(false);
  }
};

  const handleDownload = async (item) => {
    const key = item.key || item.s3Key;
    const name = item.name || item.fileName || key?.split("/").pop() || "document";
    let url = item.url || item.previewUrl;
    if (!url && key) url = await getDocumentUrl(key);
    if (url) {
      try {
        const response = await fetch(url, { mode: "cors" });
        const blob = await response.blob();
        const link = document.createElement("a");
        link.href = window.URL.createObjectURL(blob);
        link.download = name;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        window.URL.revokeObjectURL(link.href);
        notify("tr", t("documents.downloadStarted"), "success");
      } catch (err) {
        window.open(url, "_blank");
      }
    } else {
      notify("tr", t("documents.noUrl"), "warning");
    }
  };

  const handleDelete = async (item) => {
    const key = item.key || item.s3Key;
    if (!key || !effectiveUserId) {
      notify("tr", t("documents.noUrl"), "warning");
      return;
    }
    if (!window.confirm(t("documents.deleteConfirm"))) return;

    setDeletingKey(key);
    try {
      const res = await fetch(apiUrl(ROUTES.DOCUMENT), {
        method: "DELETE",
        headers: { "Content-Type": "application/json", ...(await authHeader()) },
        body: JSON.stringify({
          action: DOCUMENT_DELETE_ACTION,
          userId: effectiveUserId,
          key,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        const msg = data.error || data.message || "";
        if (
          res.status === 400 &&
          (msg.includes("fileContent") || msg.includes("fileName"))
        ) {
          console.error(
            "Document delete: POST /Document must call deleteDocument when body.action is deleteDocument (before uploadDocument). See backend-lambda-document-post-router.mjs."
          );
          throw new Error(t("documents.deleteErrorBackend"));
        }
        throw new Error(msg || `HTTP ${res.status}`);
      }
      notify("tr", t("documents.deleteSuccess"), "success");
      if (previewModal && (previewItem?.key === key || previewItem?.s3Key === key)) {
        setPreviewModal(false);
        setPreviewItem(null);
        setPreviewUrl(null);
      }
      fetchDocuments(effectiveUserId);
    } catch (err) {
      console.error("Delete error:", err);
      notify("tr", `${t("documents.deleteError")} ${err.message || ""}`, "danger");
    } finally {
      setDeletingKey(null);
    }
  };

  const handleDownloadAll = async () => {
    if (!documents.length) return;
    setDownloadingAll(true);
    for (let i = 0; i < documents.length; i++) {
      await handleDownload(documents[i]);
      if (i < documents.length - 1) await new Promise((r) => setTimeout(r, 400));
    }
    setDownloadingAll(false);
    notify("tr", t("documents.downloadAllDone", { count: documents.length }), "success");
  };

  const handlePreview = async (item) => {
    setPreviewItem(item);
    setPreviewModal(true);
    setPreviewUrl(null);
    setPreviewLoading(true);
    const key = item.key || item.s3Key;
    let url = item.url || item.previewUrl;
    if (!url && key) url = await getDocumentUrl(key);
    setPreviewUrl(url || null);
    setPreviewLoading(false);
  };

  const isPreviewable = (item) => {
    const name = (item.name || item.fileName || "").toLowerCase();
    return /\.(pdf|jpe?g|png|gif|webp|bmp)$/i.test(name);
  };

  // ─── Shared action buttons renderer ───────────────────────────────────────
  const renderActions = (doc) => (
    <div className="d-flex flex-wrap" style={{ gap: "12px" }}>
      {isPreviewable(doc) && (
        <Button
          size="sm"
          style={{ backgroundColor: "var(--surface-3)", borderColor: "var(--border)", color: "var(--text-1)" }}
          onClick={() => handlePreview(doc)}
          aria-label={t("documents.preview")}
          title={t("documents.preview")}
        >
          <FaEye />
        </Button>
      )}
      <Button
        size="sm"
        style={{ backgroundColor: "var(--accent)", borderColor: "var(--accent)", color: "#fff" }}
        onClick={() => handleDownload(doc)}
        aria-label={t("documents.download")}
        title={t("documents.download")}
      >
        <FaDownload />
      </Button>
      {!isAdminView && (
        <Button
          size="sm"
          disabled={deletingKey === (doc.key || doc.s3Key)}
          style={{ backgroundColor: "#dc2626", borderColor: "#b91c1c", color: "#fff" }}
          onClick={() => handleDelete(doc)}
          aria-label={t("documents.delete")}
          title={t("documents.delete")}
        >
          {deletingKey === (doc.key || doc.s3Key) ? <Spinner size="sm" /> : <FaTrash />}
        </Button>
      )}
    </div>
  );

  return (
    <>
      <Helmet>
        <title>{t("documents.title")} - Meksova</title>
      </Helmet>
      <NotificationAlert ref={notificationAlertRef} />

      <div
        className="content"
        style={{ paddingInline: 15, backgroundColor: "var(--surface-2)", minHeight: "100vh" }}
      >
        {isAdminView && (
          <Row style={{ margin: 0, paddingInline: 0, marginTop: isMobile ? 8 : 80 }}>
            <Col xs={12} style={{ paddingInline: 0 }}>
              <Card
                style={{
                  marginBottom: "5px",
                  backgroundColor: "var(--surface-2)",
                  boxShadow: "0 4px 12px rgba(0, 0, 0, 0.4), 0 2px 6px rgba(0, 0, 0, 0.3)",
                  borderRadius: "8px",
                }}
              >
                <CardHeader style={{ backgroundColor: "var(--surface-2)" }} />
                <CardBody style={{ paddingBottom: "15px", backgroundColor: "var(--surface-2)" }}>
                  <FormGroup style={{ marginBottom: 0 }}>
                    <Label style={{ color: "#ffffff" }}>
                      {t("documents.selectUserToView")}
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
                              label: users.find((u) => u.id === selectedUserId).email,
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
                      placeholder={t("documents.searchUser")}
                      styles={userSelectStyles}
                    />
                  </FormGroup>
                </CardBody>
              </Card>
            </Col>
          </Row>
        )}

        <Row style={{ marginTop: isAdminView ? (isMobile ? 8 : 12) : 80 }}>
          <Col xs={12}>
            <Card
              style={{
                backgroundColor: "var(--surface-2)",
                boxShadow: "0 4px 12px rgba(0,0,0,0.4)",
                borderRadius: "8px",
                border: "1px solid var(--border)",
              }}
            >
              <CardHeader style={{ backgroundColor: "var(--surface-2)", borderBottom: "1px solid var(--border)" }}>
                <div className="d-flex flex-column flex-md-row justify-content-between align-items-start align-items-md-center gap-3">
                  <CardTitle tag="h4" className="mb-0" style={{ color: "var(--text-1)" }}>
                    {t("documents.title")}
                  </CardTitle>
                  <div className="d-flex flex-wrap align-items-center" style={{ gap: "14px" }}>
                    {!isAdminView && (
                      <>
                        <input
                          ref={fileInputRef}
                          type="file"
                          accept={ACCEPT_TYPES}
                          onChange={handleFileSelected}
                          style={{ display: "none" }}
                        />
                        <Button
                          color="primary"
                          disabled={uploading || compressing || !effectiveUserId}
                          onClick={() => fileInputRef.current?.click()}
                          style={{
                            backgroundColor: "var(--accent)",
                            borderColor: "var(--accent)",
                            display: "inline-flex",
                            alignItems: "center",
                            gap: "8px",
                          }}
                        >
                          {uploading ? <Spinner size="sm" /> : <FaUpload />}
                          {uploading ? t("documents.uploading") : t("documents.upload")}
                        </Button>
                      </>
                    )}
                    {documents.length > 0 && (
                      <Button
                        color="secondary"
                        disabled={downloadingAll || !effectiveUserId}
                        onClick={handleDownloadAll}
                        style={{
                          backgroundColor: "var(--accent)",
                          borderColor: "var(--accent)",
                          display: "inline-flex",
                          alignItems: "center",
                          gap: "8px",
                        }}
                      >
                        {downloadingAll ? <Spinner size="sm" /> : <FaDownload />}
                        {downloadingAll ? t("documents.downloadingAll") : t("documents.downloadAll")}
                      </Button>
                    )}
                  </div>
                </div>
                <p className="mb-0 mt-2" style={{ color: "var(--text-3)", fontSize: "0.875rem" }}>
                  {isAdminView
                    ? t("documents.adminSubtitle")
                    : `${t("documents.subtitle")} ${MAX_FILE_SIZE_MB} MB. ${t("documents.subtitleCompress")}`}
                </p>
              </CardHeader>

              <CardBody style={{ backgroundColor: "var(--surface-2)" }}>
                {isAdminView && !selectedUserId ? (
                  <div className="text-center py-5" style={{ color: "var(--text-3)" }}>
                    <p className="mb-0">{t("documents.pleaseSelectUser")}</p>
                  </div>
                ) : loading ? (
                  <div className="text-center py-5">
                    <Spinner color="primary" />
                    <p className="mt-2" style={{ color: "var(--text-1)" }}>
                      {t("documents.loading")}
                    </p>
                  </div>
                ) : documents.length === 0 ? (
                  <div className="text-center py-5" style={{ color: "var(--text-3)" }}>
                    <p className={isAdminView ? "mb-0" : "mb-2"}>
                      {isAdminView ? t("documents.adminNoDocuments") : t("documents.noDocuments")}
                    </p>
                    {!isAdminView && (
                      <Button
                        color="primary"
                        style={{ backgroundColor: "var(--accent)", borderColor: "var(--accent)" }}
                        disabled={!effectiveUserId}
                        onClick={() => fileInputRef.current?.click()}
                      >
                        {t("documents.uploadFirst")}
                      </Button>
                    )}
                  </div>
                ) : (
                  <>
                    {isMobile ? (
                      <div className="d-flex flex-column gap-3">
                        {documents.map((doc, idx) => (
                          <div
                            key={doc.key || doc.id || idx}
                            style={{
                              padding: "12px",
                              backgroundColor: "var(--surface-2)",
                              borderRadius: "8px",
                              border: "1px solid var(--border)",
                            }}
                          >
                            <div
                              style={{ color: "var(--text-1)", fontWeight: 500, marginBottom: "8px" }}
                            >
                              {doc.name || doc.fileName || doc.key?.split("/").pop() || "—"}
                            </div>
                            <div
                              style={{
                                color: "var(--text-3)",
                                fontSize: "0.875rem",
                                marginBottom: "8px",
                              }}
                            >
                              {formatSize(doc.size)} ·{" "}
                              {doc.uploadedAt
                                ? new Date(doc.uploadedAt).toLocaleDateString()
                                : "—"}
                            </div>
                            {renderActions(doc)}
                          </div>
                        ))}
                      </div>
                    ) : (
                      <Table responsive style={{ backgroundColor: "var(--surface-2)" }}>
                        <thead>
                          <tr>
                            <th style={{ color: "var(--text-3)", borderColor: "var(--border)" }}>
                              {t("documents.name")}
                            </th>
                            <th style={{ color: "var(--text-3)", borderColor: "var(--border)" }}>
                              {t("documents.size")}
                            </th>
                            <th style={{ color: "var(--text-3)", borderColor: "var(--border)" }}>
                              {t("documents.date")}
                            </th>
                            <th style={{ color: "var(--text-3)", borderColor: "var(--border)" }}>
                              {t("documents.actions")}
                            </th>
                          </tr>
                        </thead>
                        <tbody>
                          {documents.map((doc, idx) => (
                            <tr key={doc.key || doc.id || idx} style={{ borderColor: "var(--border)" }}>
                              <td style={{ color: "var(--text-1)", borderColor: "var(--border)" }}>
                                {doc.name || doc.fileName || doc.key?.split("/").pop() || "—"}
                              </td>
                              <td style={{ color: "var(--text-3)", borderColor: "var(--border)" }}>
                                {formatSize(doc.size)}
                              </td>
                              <td style={{ color: "var(--text-3)", borderColor: "var(--border)" }}>
                                {doc.uploadedAt
                                  ? new Date(doc.uploadedAt).toLocaleDateString()
                                  : "—"}
                              </td>
                              <td style={{ borderColor: "var(--border)" }}>{renderActions(doc)}</td>
                            </tr>
                          ))}
                        </tbody>
                      </Table>
                    )}
                  </>
                )}
              </CardBody>
            </Card>
          </Col>
        </Row>
      </div>

      {/* ── Compression Progress Modal ──────────────────────────────────────── */}
      <Modal isOpen={compressionModal} backdrop="static" keyboard={false} style={{ maxWidth: "420px" }}>
        <ModalHeader style={{ backgroundColor: "var(--surface-2)", color: "var(--text-1)", borderBottom: "1px solid var(--border)" }}>
          <span style={{ display: "inline-flex", alignItems: "center", gap: "8px" }}>
            <FaCompressArrowsAlt style={{ color: "var(--text-1)" }} />
            {compressing ? t("documents.compressing") : t("documents.compressionDone")}
          </span>
        </ModalHeader>
        <ModalBody style={{ backgroundColor: "var(--surface-2)", color: "var(--text-1)" }}>
          {compressionInfo && (
            <div className="mb-3" style={{ fontSize: "0.875rem", color: "var(--text-3)" }}>
              <div style={{ marginBottom: "4px" }}>
                {t("documents.originalSize")}: <strong style={{ color: "var(--text-1)" }}>{formatSize(compressionInfo.originalSize)}</strong>
              </div>
              {compressionInfo.compressedSize != null && (
                <div>
                  {t("documents.compressedSize")}:{" "}
                  <strong style={{ color: "#4ade80" }}>{formatSize(compressionInfo.compressedSize)}</strong>
                  {" "}
                  <span style={{ color: "var(--text-3)" }}>
                    (−{Math.round((1 - compressionInfo.compressedSize / compressionInfo.originalSize) * 100)}%)
                  </span>
                </div>
              )}
            </div>
          )}
          <Progress
            value={compressionProgress}
            style={{ height: "8px", backgroundColor: "var(--surface-2)" }}
            color={compressionProgress === 100 ? "success" : "info"}
          />
          <p className="mb-0 mt-2" style={{ color: "var(--text-3)", fontSize: "0.8rem" }}>
            {compressing
              ? t("documents.compressionHint")
              : t("documents.compressionSuccessHint")}
          </p>
        </ModalBody>
      </Modal>

      {/* ── Upload Name Modal ───────────────────────────────────────────────── */}
      <Modal isOpen={uploadNameModal} toggle={closeUploadNameModal} style={{ maxWidth: "480px" }}>
        <ModalHeader
          toggle={closeUploadNameModal}
          style={{ backgroundColor: "var(--surface-2)", color: "var(--text-1)", borderBottom: "1px solid var(--border)" }}
        >
          {t("documents.nameDocumentTitle")}
        </ModalHeader>
        <ModalBody style={{ backgroundColor: "var(--surface-2)", color: "var(--text-1)" }}>
          <FormGroup>
            <Label for="doc-upload-name" style={{ color: "var(--text-3)" }}>
              {t("documents.nameDocumentLabel")}
            </Label>
            <Input
              id="doc-upload-name"
              type="text"
              value={uploadDisplayName}
              onChange={(e) => setUploadDisplayName(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") { e.preventDefault(); confirmUploadWithName(); }
              }}
              style={{ backgroundColor: "var(--surface-2)", borderColor: "var(--border)", color: "var(--text-1)" }}
              autoFocus
            />
            <p className="mb-0 mt-2 small" style={{ color: "var(--text-3)" }}>
              {t("documents.nameDocumentHint")}
            </p>
          </FormGroup>
        </ModalBody>
        <ModalFooter style={{ backgroundColor: "var(--surface-2)", borderTop: "1px solid var(--border)" }}>
          <Button color="secondary" outline onClick={closeUploadNameModal}>
            {t("common.cancel")}
          </Button>
          <Button
            color="primary"
            style={{ backgroundColor: "var(--accent)", borderColor: "var(--accent)" }}
            disabled={!uploadDisplayName.trim()}
            onClick={confirmUploadWithName}
          >
            {t("documents.uploadConfirm")}
          </Button>
        </ModalFooter>
      </Modal>

      {/* ── Preview Modal ───────────────────────────────────────────────────── */}
      <Modal
        isOpen={previewModal}
        toggle={() => { setPreviewModal(false); setPreviewItem(null); setPreviewUrl(null); }}
        size="lg"
        style={{ maxWidth: "90vw" }}
      >
        <ModalHeader
          toggle={() => { setPreviewModal(false); setPreviewItem(null); setPreviewUrl(null); }}
          style={{ backgroundColor: "var(--surface-2)", color: "var(--text-1)", borderBottom: "1px solid var(--border)" }}
        >
          {previewItem?.name || previewItem?.fileName || t("documents.preview")}
        </ModalHeader>
        <ModalBody
          style={{ backgroundColor: "var(--surface-2)", color: "var(--text-1)", minHeight: "400px" }}
        >
          {previewLoading ? (
            <div className="text-center py-5">
              <Spinner color="light" />
              <p className="mt-2">{t("documents.loading")}</p>
            </div>
          ) : previewUrl ? (
            <>
              {/\.pdf$/i.test(previewItem?.name || previewItem?.fileName || "") ? (
                <object
                  data={previewUrl}
                  type="application/pdf"
                  width="100%"
                  height="500px"
                  style={{ borderRadius: "8px" }}
                >
                  <p>
                    <a
                      href={previewUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      style={{ color: "var(--text-1)" }}
                    >
                      {t("documents.openPdf")}
                    </a>
                  </p>
                </object>
              ) : (
                <img
                  src={previewUrl}
                  alt="Preview"
                  style={{ maxWidth: "100%", height: "auto", borderRadius: "8px" }}
                />
              )}
            </>
          ) : (
            <p className="mb-0">{t("documents.previewNotAvailable")}</p>
          )}
        </ModalBody>
      </Modal>
    </>
  );
};

export default Documents;