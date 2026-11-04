import React from "react";
import { useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";

// Phone-app stand-in for the Subscribe page. The app sells nothing and never
// points to where to pay (the store-safe pattern QuickBooks/Slack use
// everywhere, no enrollment needed); it only states the plan status.
// Trial-ending emails carry the payment link.
const AppPlanNotice = () => {
  const { t } = useTranslation();
  const navigate = useNavigate();

  return (
    <div className="content">
      <section className="mksv-plan-notice" aria-labelledby="mksv-plan-notice-title">
        <span className="mksv-plan-notice__icon" aria-hidden="true">
          <svg width="30" height="30" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
            <rect x="3" y="11" width="18" height="10" rx="2" />
            <path d="M7 11V7a5 5 0 0 1 10 0v4" />
          </svg>
        </span>
        <h1 id="mksv-plan-notice-title" className="mksv-plan-notice__title">{t("app.planTitle")}</h1>
        <p className="mksv-plan-notice__body">{t("app.planBody")}</p>
        <button
          type="button"
          className="mksv-app-btn mksv-app-btn--primary"
          onClick={() => navigate("/customer/dashboard")}
        >
          {t("app.planBack")}
        </button>
      </section>
    </div>
  );
};

export default AppPlanNotice;
