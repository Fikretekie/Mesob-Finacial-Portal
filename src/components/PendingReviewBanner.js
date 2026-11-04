import React, { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { fetchConnections, syncTransactions } from "utils/connectionsStorage";
import { loadChargeMatches } from "utils/bankMatch";
import "../assets/css/pendingReviewBanner.css";

/** Nags until the user actually reviews bank-imported transactions, instead
 * of relying on them to remember to check the Connections page. */
function PendingReviewBanner() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const [pendingCount, setPendingCount] = useState(0);
  const [matchedCount, setMatchedCount] = useState(0);

  useEffect(() => {
    let alive = true;
    fetchConnections()
      .then(async (data) => {
        const count = data?.plaid?.pendingCount || 0;
        if (!alive) return;
        setPendingCount(count);
        if (!count) return;
        // How many of them are expenses already recorded (receipt, fuel, typed in).
        const sync = await syncTransactions();
        const matches = await loadChargeMatches(sync?.transactions || []);
        if (alive) setMatchedCount(Object.keys(matches).length);
      })
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, []);

  if (!pendingCount) return null;

  return (
    <div className="pending-review-banner">
      <span>
        {t("transactionReview.bannerText", { count: pendingCount })}
        {matchedCount > 0 && ` · ${t("transactionReview.bannerMatches", { count: matchedCount })}`}
      </span>
      <button className="pending-review-banner-btn" onClick={() => navigate("/customer/review-transactions")}>
        {t("transactionReview.bannerButton")}
      </button>
    </div>
  );
}

export default PendingReviewBanner;