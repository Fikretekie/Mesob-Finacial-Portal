import React from "react";
import { Button } from "reactstrap";
import { useNavigate } from "react-router-dom";

const UserSubscriptionInfo = ({
  userSubscription,
  trialEndDate,
  scheduleCount,
}) => {
  const navigate = useNavigate();

  // Teammates don't manage billing — never show them subscribe/trial prompts.
  if (localStorage.getItem("isTeamMember") === "true") return null;

  const isTrialActive = () => {
    return new Date() < trialEndDate && scheduleCount < 4;
  };

  const renderSubscribeButton = () => {
    if (!userSubscription && (!isTrialActive() || scheduleCount >= 4)) {
      return (
        <Button
          onClick={() => navigate("/customer/subscription")}
          style={{
            backgroundColor: "var(--accent-soft)",
            borderColor: "var(--accent)",
            color: "var(--accent)",
            height: "38px",
            borderRadius: "var(--r-sm)",
            padding: "0 16px",
            fontWeight: 600,
            display: "inline-flex",
            alignItems: "center",
            justifyContent: "center",
            margin: 0,
          }}
        >
          Subscribe
        </Button>
      );
    }
    return null;
  };

  const renderTrialTimer = () => {
    if (userSubscription) return null;

    if (isTrialActive() && scheduleCount < 4) {
      return (
        <div>
          Trial ends in:{" "}
          {Math.ceil((trialEndDate - new Date()) / (1000 * 60 * 60 * 24))} days
        </div>
      );
    }
    return null;
  };

  return (
    <div>
      {renderSubscribeButton()}
      {renderTrialTimer()}
    </div>
  );
};

export default UserSubscriptionInfo;
