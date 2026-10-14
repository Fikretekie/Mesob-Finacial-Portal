import React, { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { fetchConnections } from "utils/connectionsStorage";
import "../assets/css/pendingReviewBanner.css";

/** Nags until the user actually reviews bank-imported transactions, instead
 * of relying on them to remember to check the Connections page. */
function PendingReviewBanner() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const [pendingCount, setPendingCount] = useState(0);

  useEffect(() => {
    fetchConnections()
      .then((data) => setPendingCount(data?.plaid?.pendingCount || 0))
      .catch(() => setPendingCount(0));
  }, []);

  if (!pendingCount) return null;

  return (
    <div className="pending-review-banner">
      <span>{t("transactionReview.bannerText", { count: pendingCount })}</span>
      <button className="pending-review-banner-btn" onClick={() => navigate("/customer/review-transactions")}>
        {t("transactionReview.bannerButton")}
      </button>
    </div>
  );
}

export default PendingReviewBanner;