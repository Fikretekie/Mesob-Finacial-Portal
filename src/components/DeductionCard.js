import React, { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { useNavigate } from "react-router-dom";
import { fetchTripsShared, getMilesByState, getTripsForQuarter, getYearBusinessMiles } from "utils/tripStorage";
import { currentRateLabel, isTrucking, yearDeduction } from "utils/mileageRate";

// Home: what the logged miles are worth. Most businesses: the year's mileage
// deduction. Trucking (no mileage deduction): this quarter's IFTA miles and
// states. Renders nothing until there are miles, so non-drivers never see it.
const DeductionCard = () => {
  const { t, i18n } = useTranslation();
  const navigate = useNavigate();
  const [data, setData] = useState(null);
  const trucking = isTrucking();

  useEffect(() => {
    let live = true;
    const load = () =>
      fetchTripsShared()
        .then((trips) => {
          if (!live) return;
          const now = new Date();
          const year = now.getFullYear();
          if (trucking) {
            const quarter = Math.floor(now.getMonth() / 3) + 1;
            const byState = getMilesByState(getTripsForQuarter(trips, year, quarter));
            const miles = Object.values(byState).reduce((a, b) => a + b, 0);
            setData({ miles, states: Object.keys(byState).length, quarter, year });
          } else {
            setData({ miles: getYearBusinessMiles(trips, year), amount: yearDeduction(trips, year), year });
          }
        })
        .catch(() => {});
    load();
    window.addEventListener("mksv-trips-changed", load);
    return () => {
      live = false;
      window.removeEventListener("mksv-trips-changed", load);
    };
  }, [trucking]);

  if (!data || data.miles < 0.05) return null;

  const fmtMiles = new Intl.NumberFormat(i18n.language, { maximumFractionDigits: 1 }).format(data.miles);

  if (trucking) {
    return (
      <button type="button" className="mksv-deduction" onClick={() => navigate("/customer/ifta-report")}>
        <span className="mksv-deduction__label">{t("drives.ifta.label", { quarter: data.quarter, year: data.year })}</span>
        <span className="mksv-deduction__amount mksv-deduction__amount--neutral">
          {fmtMiles} <small>{t("drives.review.mi")}</small>
        </span>
        <span className="mksv-deduction__sub">{t("drives.ifta.sub", { count: data.states })}</span>
      </button>
    );
  }

  const fmtMoney = new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: data.amount < 100 ? 2 : 0,
  }).format(data.amount);

  return (
    <button type="button" className="mksv-deduction" onClick={() => navigate("/customer/trip-history")}>
      <span className="mksv-deduction__label">{t("drives.deduction.label", { year: data.year })}</span>
      <span className="mksv-deduction__amount">{fmtMoney}</span>
      <span className="mksv-deduction__sub">{t("drives.deduction.sub", { miles: fmtMiles, rate: currentRateLabel() })}</span>
    </button>
  );
};

export default DeductionCard;
