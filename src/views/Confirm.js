import React, { useState, useRef, useEffect } from "react";
import { useNavigate, useLocation, Link } from "react-router-dom";
import { confirmSignUp, resendSignUpCode, signIn, signOut } from "aws-amplify/auth";
import { Helmet } from "react-helmet";
import { useTranslation } from "react-i18next";
import { Spinner } from "reactstrap";
import NotificationAlert from "react-notification-alert";
import "react-notification-alert/dist/animate.css";
import axios from "axios";
import { apiUrl, ROUTES, STAGING_API_URL, CURRENT_ENV } from "../config/api";
import { authHeader } from "../utils/apiFetch";
import "../assets/css/Login.css";

const logo = "/transparent.png";
const CODE_LENGTH = 6;

const Confirm = () => {
  const { t } = useTranslation();
  const [digits, setDigits] = useState(Array(CODE_LENGTH).fill(""));
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [name, setName] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [resending, setResending] = useState(false);
  const navigate = useNavigate();
  const location = useLocation();
  const notificationAlertRef = useRef(null);
  const inputsRef = useRef([]);

  const code = digits.join("");

  useEffect(() => {
    // Reached directly (no signup state) — send them back to sign up.
    if (!location.state || !location.state.email) {
      navigate("/signup", { replace: true });
      return;
    }
    setEmail(location.state.email);
    if (location.state.name) setName(location.state.name);
    if (location.state.password) setPassword(location.state.password);
    // Focus the first code box.
    setTimeout(() => inputsRef.current[0]?.focus(), 60);
  }, [location.state, navigate]);

  const showNotification = (type, message) => {
    notificationAlertRef.current?.notificationAlert({
      place: "tr",
      message: <div>{message}</div>,
      type,
      icon: "now-ui-icons ui-1_bell-53",
      autoDismiss: 5,
    });
  };

  const setDigit = (i, val) => {
    const v = val.replace(/\D/g, "").slice(-1);
    setDigits((prev) => {
      const next = [...prev];
      next[i] = v;
      return next;
    });
    if (v && i < CODE_LENGTH - 1) inputsRef.current[i + 1]?.focus();
  };

  const handleKeyDown = (i, e) => {
    if (e.key === "Backspace" && !digits[i] && i > 0) {
      inputsRef.current[i - 1]?.focus();
    } else if (e.key === "ArrowLeft" && i > 0) {
      inputsRef.current[i - 1]?.focus();
    } else if (e.key === "ArrowRight" && i < CODE_LENGTH - 1) {
      inputsRef.current[i + 1]?.focus();
    } else if (e.key === "Enter") {
      handleConfirm(e);
    }
  };

  const handlePaste = (e) => {
    const text = (e.clipboardData.getData("text") || "").replace(/\D/g, "").slice(0, CODE_LENGTH);
    if (!text) return;
    e.preventDefault();
    const next = Array(CODE_LENGTH).fill("");
    for (let k = 0; k < text.length; k++) next[k] = text[k];
    setDigits(next);
    inputsRef.current[Math.min(text.length, CODE_LENGTH - 1)]?.focus();
  };

  const handleConfirm = async (e) => {
    if (e && e.preventDefault) e.preventDefault();
    if (!email) {
      showNotification("danger", "Email is missing. Please try signing up again.");
      return;
    }
    if (code.length < CODE_LENGTH) {
      showNotification("warning", "Please enter the 6-digit confirmation code.");
      return;
    }

    setIsLoading(true);
    try {
      await confirmSignUp({ username: email, confirmationCode: code });
      console.log(`✅ Cognito sign-up confirmed (email) [env: ${CURRENT_ENV}]`);

      const signupPassword = location.state?.password || password;
      if (signupPassword) {
        try {
          await signOut();
        } catch (err) {
          // no existing session to clear — fine
        }
        await signIn({ username: email, password: signupPassword });
        console.log(`✅ Signed in after confirmation [env: ${CURRENT_ENV}]`);
      }

      const newUserId = location.state?.userId || location.state?.id;
      const signupData = location.state?.data;
      if (signupData && newUserId) {
        await axios.put(apiUrl(`${ROUTES.USERS}/${newUserId}`), signupData);
        console.log("✅ User record created after sign-in");
      }

      showNotification("success", "Account confirmed successfully!");

      const emailData = {
        email,
        subject: "Welcome to Meksova – You're All Set!",
        message: `
  <div style="font-family: Arial, sans-serif; line-height: 1.6; color: #333; padding: 20px;">
    <p>Dear <strong>${name}</strong>,</p>
    <p>Welcome to <strong>Meksova</strong>! Your account has been successfully created and you're ready to start managing your business finances.</p>
    <p>Here's what you can do next:</p>
    <ul style="padding-left: 20px;">
      <li>Set up your financial dashboard</li>
      <li>Track your income and expenses</li>
      <li>Monitor your cash flow</li>
      <li>Generate financial reports</li>
    </ul>
    <p><strong>Ready to unlock all features?</strong></p>
    <p>
      <a href="https://app.meksova.com/customer/subscription" style="color: #1e90ff; text-decoration: none;">
        Click here to view or upgrade your subscription
      </a>
    </p>
    <p>If you have any questions, feel free to reach out to our support team.</p>
    <p>Best regards,<br>The Meksova Team</p>
  </div>
`,
      };

      try {
        await axios.post(STAGING_API_URL, emailData);
        console.log("Welcome email sent successfully");

        const response = await fetch(apiUrl(`${ROUTES.USERS}/${location.state.id}`), {
          method: "GET",
          headers: {
            "Content-Type": "application/json",
            Accept: "application/json",
            ...(await authHeader()),
          },
        });

        const result = await response.json();
        console.log("🔍 User data:", result);

        localStorage.clear();
        localStorage.setItem("provider", "Email");
        localStorage.setItem("userId", location.state.id);
        localStorage.setItem("user_email", result.user?.email || "");
        localStorage.setItem("user_name", result.user?.name || "");
        localStorage.setItem("role", result.user?.role?.toString() || "2");
        localStorage.setItem("businessType", result.user?.businessType || "");
        localStorage.setItem("outstandingDebt", result.user?.outstandingDebt || "0");
        localStorage.setItem("valueableItems", result.user?.valueableItems || "0");
        localStorage.setItem("cashBalance", result.user?.cashBalance || "0");
        localStorage.setItem("currency", result.user?.currency || "USD");
        localStorage.setItem("authToken", "authenticated");

        try {
          const evtResponse = await fetch(apiUrl(ROUTES.CREATE_EVENT), {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              Accept: "application/json",
              ...(await authHeader()),
            },
            body: JSON.stringify({
              id: location.state.id,
              email: email,
              name: name,
            }),
          });
          console.log("📅 EventBridge scheduling triggered successfully.", evtResponse);
        } catch (scheduleError) {
          console.warn("⚠️ Failed to trigger EventBridge scheduling:", scheduleError);
        }

        const path =
          result.user?.role === 2
            ? "/customer/dashboard"
            : result.user?.role === 0
              ? "/admin/dashboard"
              : "/customer/dashboard";
        navigate(path, { replace: true });
      } catch (emailError) {
        console.warn("Failed to send welcome email:", emailError);
      }

      if (!password) {
        showNotification(
          "warning",
          "Please login manually. Password not available for automatic sign-in."
        );
        setTimeout(() => navigate("/login"), 2000);
        return;
      }
    } catch (error) {
      console.error("Error confirming sign up", error);
      showNotification("danger", "Error confirming account. Please try again.");
    } finally {
      setIsLoading(false);
    }
  };

  const handleResendCode = async () => {
    if (resending) return;
    setResending(true);
    try {
      const { codeDeliveryDetails } = await resendSignUpCode({ username: email });
      console.log(">>>>>>>", codeDeliveryDetails);
      showNotification("success", "A fresh code is on its way to your inbox.");
      setDigits(Array(CODE_LENGTH).fill(""));
      inputsRef.current[0]?.focus();
    } catch (error) {
      console.error("Error resending code", error);
      showNotification("danger", "Failed to resend code. Please try again.");
    } finally {
      setResending(false);
    }
  };

  const maskedEmail = (() => {
    if (!email || !email.includes("@")) return email;
    const [user, domain] = email.split("@");
    const head = user.slice(0, Math.min(2, user.length));
    return `${head}${"•".repeat(Math.max(1, user.length - 2))}@${domain}`;
  })();

  return (
    <>
      <Helmet>
        <title>Confirm your email - Meksova</title>
      </Helmet>
      <NotificationAlert ref={notificationAlertRef} />
      <div className="auth">
        <aside className="auth__brand">
          <div className="auth__logo">
            <img src={logo} alt="Meksova Finance" />
          </div>
          <div className="auth__brand-body">
            <p className="auth__eyebrow">{t("auth.confirm.eyebrow")}</p>
            <h1 className="auth__headline">
              {t("auth.confirm.headline1")}
              <br />
              <span>{t("auth.confirm.headline2")}</span>
            </h1>
            <p className="auth__sub">{t("auth.confirm.sub")}</p>
            <ul className="auth__benefits">
              <li>{t("auth.confirm.benefit1")}</li>
              <li>{t("auth.confirm.benefit2")}</li>
              <li>{t("auth.confirm.benefit3")}</li>
            </ul>
          </div>
          <div className="auth__brand-foot">
            <span>{t("auth.common.bilingual")}</span>
            <span>·</span>
            <span>{t("auth.common.trusted")}</span>
          </div>
        </aside>

        <main className="auth__panel">
          <div className="login-box signup-box">
            <img src={logo} alt="Meksova" className="logo_img" />
            <h2 className="signup-title" style={{ textAlign: "center" }}>
              {t("auth.confirm.title")}
            </h2>
            <p className="signup-sub" style={{ textAlign: "center" }}>
              {t("auth.confirm.codeSentTo")}{" "}
              <strong style={{ color: "var(--text-1)" }}>{maskedEmail}</strong>
            </p>

            <div className="otp" onPaste={handlePaste}>
              {digits.map((d, i) => (
                <input
                  key={i}
                  ref={(el) => (inputsRef.current[i] = el)}
                  className="otp__box"
                  type="text"
                  inputMode="numeric"
                  autoComplete={i === 0 ? "one-time-code" : "off"}
                  maxLength={1}
                  value={d}
                  disabled={isLoading}
                  onChange={(e) => setDigit(i, e.target.value)}
                  onKeyDown={(e) => handleKeyDown(i, e)}
                  onFocus={(e) => e.target.select()}
                  aria-label={`Digit ${i + 1}`}
                />
              ))}
            </div>

            <button
              type="button"
              onClick={handleConfirm}
              className="login-btn"
              disabled={isLoading || code.length < CODE_LENGTH}
            >
              {isLoading ? (
                <>
                  <Spinner color="light" size="sm" /> {t("auth.confirm.confirming")}
                </>
              ) : (
                t("auth.confirm.confirm")
              )}
            </button>

            <p className="signup-trust">
              {t("auth.confirm.resendPrompt")}{" "}
              <button
                type="button"
                className="otp__resend"
                onClick={handleResendCode}
                disabled={resending}
              >
                {resending ? t("auth.confirm.resending") : t("auth.confirm.resend")}
              </button>
            </p>

            <p className="login-signup-prompt">
              {t("auth.confirm.wrongEmail")}{" "}
              <Link to="/signup">{t("auth.confirm.backToSignup")}</Link>
            </p>
          </div>
        </main>
      </div>
    </>
  );
};

export default Confirm;
