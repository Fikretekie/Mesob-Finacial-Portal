import React, { useState, useRef, useEffect } from "react";
import { useNavigate, Link } from "react-router-dom";
import { apiUrl, ROUTES } from "../config/api";
import NotificationAlert from "react-notification-alert";
import "react-notification-alert/dist/animate.css";
import { Spinner } from "reactstrap";
import { Helmet } from "react-helmet";
import { resetPassword, confirmResetPassword } from "aws-amplify/auth";
import { FaEye, FaEyeSlash } from "react-icons/fa"; // Import eye icons
import "../assets/css/Login.css";

const logo = "/transparent.png";

const ForgotPassword = () => {
  const [email, setEmail] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmationCode, setConfirmationCode] = useState("");
  const [loading, setLoading] = useState(false);
  const [codeSent, setCodeSent] = useState(false);
  const navigate = useNavigate();
  const notificationAlertRef = useRef(null);
  const [showPassword, setShowPassword] = useState(false); // New state for password visibility
  const [resendDisabled, setResendDisabled] = useState(false);
  const [resendTimer, setResendTimer] = useState(0);

  const showNotification = (type, message) => {
    const options = {
      place: "tr",
      message: <div>{message}</div>,
      type: type,
      icon: "now-ui-icons ui-1_bell-53",
      autoDismiss: 5,
    };
    notificationAlertRef.current.notificationAlert(options);
  };

  const checkEmailExists = async (email) => {
    try {
      const response = await fetch(
        apiUrl(`${ROUTES.EXISTING_USER_CHECK}?email=${encodeURIComponent(email)}`),
        {
          method: "GET",
          headers: {
            "Content-Type": "application/json",
          },
        }
      );

      const result = await response.json();
      console.log("✅ Email check response:", result);

      // Return the entire result for more flexibility
      return result;
    } catch (error) {
      console.error("❌ Email check API error:", error);
      return { exists: false }; // Fail-safe: assume not exists on error
    }
  };

  const handleSendCode = async (e) => {
    e.preventDefault();
    setLoading(true);

    const emailCheckResult = await checkEmailExists(email);

    if (emailCheckResult.exists === true) {
      try {
        await resetPassword({ username: email });
        setCodeSent(true);
        showNotification("success", "Verification code sent to your email!");
        startResendTimer(); // Start timer after successful send
      } catch (error) {
        console.error("Error sending verification code:", error);

        // Handle Amplify-specific errors
        if (error.name === "InvalidParameterException") {
          showNotification(
            "danger",
            "No account found with this email or the email is not verified."
          );
        } else if (error.name === "UserNotFoundException") {
          showNotification("danger", "No user is registered with this email.");
        } else {
          showNotification(
            "danger",
            "Failed to send verification code. Please try again."
          );
        }
      }
    } else {
      showNotification("danger", "Email does not exist. Please check and try again.");
    }

    setLoading(false);
  };

  const handleResendCode = async () => {
    if (resendDisabled) return; // Prevent resend during cooldown
    setLoading(true);
    setResendDisabled(true);

    const emailCheckResult = await checkEmailExists(email);

    if (emailCheckResult.exists === true) {
      try {
        await resetPassword({ username: email });
        showNotification("success", "Verification code resent to your email!");
        startResendTimer(); // Restart timer after resend
      } catch (error) {
        console.error("Error resending verification code:", error);
        showNotification(
          "danger",
          "Failed to resend verification code. Please try again."
        );
      }
    } else {
      showNotification("danger", "Email does not exist. Please check and try again.");
    }

    setLoading(false);
  };

  const startResendTimer = () => {
    const cooldown = 30; // 30 seconds cooldown
    setResendTimer(cooldown);
    setResendDisabled(true);

    const timer = setInterval(() => {
      setResendTimer((prev) => {
        if (prev <= 1) {
          clearInterval(timer);
          setResendDisabled(false);
          return 0;
        }
        return prev - 1;
      });
    }, 1000);
  };

  const togglePasswordVisibility = () => {
    setShowPassword(!showPassword);
  };

  const handleResetPassword = async (e) => {
    e.preventDefault();
    setLoading(true);

    try {
      await confirmResetPassword({
        username: email,
        confirmationCode,
        newPassword,
      });
      showNotification("success", "Password has been reset successfully!");
      setTimeout(() => navigate("/login"), 2000);
    } catch (error) {
      console.error("Error during password reset:", error);
      showNotification("danger", "Failed to reset password. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    // Cleanup timer on unmount
    return () => {
      if (resendTimer > 0) clearInterval();
    };
  }, [resendTimer]);

  return (
    <>
      <Helmet>
        <title>Reset Password - Meksova</title>
      </Helmet>
      <NotificationAlert ref={notificationAlertRef} />
      <div className="auth">
        <aside className="auth__brand">
          <div className="auth__logo">
            <img src={logo} alt="Meksova Finance" />
          </div>
          <div className="auth__brand-body">
            <p className="auth__eyebrow">Meksova Finance · Account recovery</p>
            <h1 className="auth__headline">
              Forgot your password?
              <br />
              <span>Let's get you back in.</span>
            </h1>
            <p className="auth__sub">
              We'll email you a verification code so you can set a new password
              and pick up right where you left off.
            </p>
            <ul className="auth__benefits">
              <li>Secure, code-verified reset</li>
              <li>Your data stays exactly as you left it</li>
              <li>Back to your dashboard in a minute</li>
            </ul>
          </div>
          <div className="auth__brand-foot">
            <span>Bilingual</span>
            <span>·</span>
            <span>Trusted by hundreds of small businesses</span>
          </div>
        </aside>

        <main className="auth__panel">
          <div className="login-box">
            <img src={logo} alt="Meksova" className="logo_img" />
            <h2>Reset password</h2>
            <p className="login-welcome">
              {codeSent
                ? "Enter the code we emailed you and choose a new password."
                : "Enter your email and we'll send you a reset code."}
            </p>

            <form onSubmit={codeSent ? handleResetPassword : handleSendCode}>
              <div className="login-input-group">
                <label>Email</label>
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  required
                  disabled={codeSent}
                  autoComplete="email"
                  placeholder="you@business.com"
                />
              </div>

              {codeSent && (
                <>
                  <div className="login-input-group">
                    <label>Verification code</label>
                    <input
                      type="text"
                      inputMode="numeric"
                      value={confirmationCode}
                      onChange={(e) => setConfirmationCode(e.target.value)}
                      required
                      placeholder="6-digit code"
                    />
                  </div>

                  <div className="login-input-group">
                    <label>New password</label>
                    <div className="password-container">
                      <input
                        type={showPassword ? "text" : "password"}
                        value={newPassword}
                        onChange={(e) => setNewPassword(e.target.value)}
                        required
                        autoComplete="new-password"
                        placeholder="Create a new password"
                      />
                      <button
                        type="button"
                        className="toggle-password"
                        onClick={togglePasswordVisibility}
                        aria-label={showPassword ? "Hide password" : "Show password"}
                      >
                        {showPassword ? <FaEyeSlash /> : <FaEye />}
                      </button>
                    </div>
                  </div>
                </>
              )}

              <button type="submit" className="login-btn" disabled={loading}>
                {loading ? (
                  <>
                    <Spinner color="light" size="sm" />{" "}
                    {codeSent ? "Resetting…" : "Sending…"}
                  </>
                ) : codeSent ? (
                  "Reset password"
                ) : (
                  "Send reset code"
                )}
              </button>

              {codeSent && (
                <button
                  type="button"
                  className="social-login-btn"
                  onClick={handleResendCode}
                  disabled={resendDisabled || loading}
                >
                  {resendDisabled ? `Resend code (${resendTimer}s)` : "Resend code"}
                </button>
              )}
            </form>

            <p className="login-signup-prompt">
              Remember your password? <Link to="/login">Log in</Link>
            </p>
          </div>
        </main>
      </div>
    </>
  );
};

export default ForgotPassword;