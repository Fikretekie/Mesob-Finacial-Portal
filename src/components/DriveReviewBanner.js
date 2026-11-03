import React, { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { useNavigate } from "react-router-dom";
import { DRIVES_CHANGED, driveDetectionAvailable, getRecordedDrives } from "utils/driveMonitor";

// Home: "3 drives to review" — a state row (left edge bar), not decoration.
const DriveReviewBanner = () => {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const [count, setCount] = useState(0);

  useEffect(() => {
    if (!driveDetectionAvailable()) return undefined;
    getRecordedDrives().then((d) => setCount(d.filter((x) => !x.type).length));
    const onChange = (e) => setCount(e.detail || 0);
    window.addEventListener(DRIVES_CHANGED, onChange);
    return () => window.removeEventListener(DRIVES_CHANGED, onChange);
  }, []);

  if (!count) return null;

  return (
    <button type="button" className="mksv-drive-banner" onClick={() => navigate("/customer/drives")}>
      <span className="mksv-row__icon" aria-hidden="true">
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M5 17h14M6 17l1.5-6h9L18 17M7 17v2M17 17v2M8 11l1-4h6l1 4" />
        </svg>
      </span>
      <span className="mksv-row__body">
        <span className="mksv-row__title">{t("drives.banner.title", { count })}</span>
        <span className="mksv-row__sub">{t("drives.banner.sub")}</span>
      </span>
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <path d="m9 6 6 6-6 6" />
      </svg>
    </button>
  );
};

export default DriveReviewBanner;
