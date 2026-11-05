import React, { useCallback, useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { useNavigate } from "react-router-dom";
import { Modal } from "reactstrap";
import { DRIVES_CHANGED, driveDetectionAvailable, driveReviewCount, getRecordedDrives, isUnconfirmedDrive } from "utils/driveMonitor";
import { isRideshare, isTrucking } from "utils/mileageRate";

// The pop-up is for opening the app, not for every refresh while it's in use.
// Home can mount more than once as it loads, so this counts from when they answer.
const ASK_AGAIN_AFTER_MS = 30 * 60 * 1000;
let answeredAt = 0;

// Home: "3 drives to review" — a state row (left edge bar), not decoration.
// When drives are waiting, opening the app also asks with a pop-up.
const DriveReviewBanner = () => {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const [count, setCount] = useState(0);
  const [miles, setMiles] = useState(0);
  const [asking, setAsking] = useState(false);

  const refresh = useCallback(async () => {
    const drives = await getRecordedDrives();
    const ready = await driveReviewCount(drives);
    setCount(ready);
    setMiles(drives.filter(isUnconfirmedDrive).reduce((sum, d) => sum + Number(d.miles || 0), 0));
    if (ready > 0 && Date.now() - answeredAt >= ASK_AGAIN_AFTER_MS) setAsking(true);
  }, []);

  const closePopup = () => {
    answeredAt = Date.now();
    setAsking(false);
  };

  useEffect(() => {
    if (!driveDetectionAvailable()) return undefined;
    refresh();
    window.addEventListener(DRIVES_CHANGED, refresh);
    return () => window.removeEventListener(DRIVES_CHANGED, refresh);
  }, [refresh]);

  if (!count) return null;

  const summary = `${miles.toFixed(1)} ${t("drives.review.mi")} · ${t(
    isTrucking() ? "drives.banner.subTrucking" : isRideshare() ? "drives.banner.subRideshare" : "drives.banner.sub"
  )}`;

  return (
    <>
      <button type="button" className="mksv-drive-banner" onClick={() => navigate("/customer/drives")}>
        <span className="mksv-row__icon" aria-hidden="true">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M5 17h14M6 17l1.5-6h9L18 17M7 17v2M17 17v2M8 11l1-4h6l1 4" />
          </svg>
        </span>
        <span className="mksv-row__body">
          <span className="mksv-row__title">{t("drives.banner.title", { count })}</span>
          <span className="mksv-row__sub">{summary}</span>
        </span>
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <path d="m9 6 6 6-6 6" />
        </svg>
      </button>

      <Modal isOpen={asking} toggle={closePopup} labelledBy="mksv-drive-popup-title" className="mksv-confirm-sheet">
        <div className="mksv-confirm">
          <h2 id="mksv-drive-popup-title" className="mksv-sheet__title mksv-confirm__title--alert">{t("drives.banner.title", { count })}</h2>
          <p className="mksv-confirm__body">{summary}</p>
          <button
            type="button"
            className="mksv-app-btn mksv-app-btn--alert"
            onClick={() => {
              closePopup();
              navigate("/customer/drives");
            }}
          >
            {t("drives.banner.reviewNow")}
          </button>
          <button type="button" className="mksv-app-btn mksv-app-btn--ghost" onClick={closePopup}>
            {t("drives.banner.later")}
          </button>
        </div>
      </Modal>
    </>
  );
};

export default DriveReviewBanner;
