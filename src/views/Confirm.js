import React, { useState, useRef, useEffect } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import { confirmSignUp, resendSignUpCode, signIn } from "aws-amplify/auth";
import NotificationAlert from "react-notification-alert";
import "react-notification-alert/dist/animate.css";
import axios from "axios";
import { apiUrl, ROUTES, STAGING_API_URL, CURRENT_ENV } from "../config/api";

const Confirm = () => {
  const [code, setCode] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [name, setName] = useState("");
  const [isHovered, setIsHovered] = useState(false);
  const navigate = useNavigate();
  const location = useLocation();
  const notificationAlertRef = useRef(null);
  const [isLoading, setIsLoading] = useState(false);
  useEffect(() => {
    if (location.state && location.state.email) {
      setEmail(location.state.email);
    }
    if (location.state.name) setName(location.state.name);
    if (location.state.password) setPassword(location.state.password);
  }, [location.state]);

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

  const handleConfirm = async (e) => {
    e.preventDefault();
    if (!email) {
      showNotification(
        "danger",
        "Email is missing. Please try signing up again."
      );
      return;
    }
    if (!code) {
      showNotification("warning", "Please enter the confirmation code.");
      return;
    }

    setIsLoading(true);
    try {
      // Confirm user sign up with AWS Amplify
      await confirmSignUp({ username: email, confirmationCode: code });
      console.log(`✅ Cognito sign-up confirmed (email) [env: ${CURRENT_ENV}]`);

      showNotification("success", "Account confirmed successfully!");

      // Prepare welcome email content
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

      // Send welcome email (handle failure gracefully)
      try {
        await axios.post(
          STAGING_API_URL,
          emailData
        );
        console.log("Welcome email sent successfully");
        console.log("location id on confirm", location.state.id);

        const response = await fetch(
          apiUrl(`${ROUTES.USERS}/${location.state.id}`),
          {
            method: "GET",
            headers: {
              "Content-Type": "application/json",
              Accept: "application/json",
            },
          }
        );

        const result = await response.json();
        console.log("🔍 User data:", result);

        localStorage.clear();
        localStorage.setItem("provider", "Email");
        localStorage.setItem("userId", location.state.id);
        localStorage.setItem("user_email", result.user?.email || "");
        localStorage.setItem("user_name", result.user?.name || "");
        localStorage.setItem("role", result.user?.role?.toString() || "2");
        localStorage.setItem("businessType", result.user?.businessType || "");
        localStorage.setItem(
          "outstandingDebt",
          result.user?.outstandingDebt || "0"
        );
        localStorage.setItem(
          "valueableItems",
          result.user?.valueableItems || "0"
        );
        localStorage.setItem("cashBalance", result.user?.cashBalance || "0");
        localStorage.setItem("authToken", "authenticated");

        try {
          const response = await fetch(
            apiUrl(ROUTES.CREATE_EVENT),

            {
              method: "POST",
              headers: {
                "Content-Type": "application/json",
                Accept: "application/json",
              },
              body: JSON.stringify({
                id: location.state.id,
                email: email,
                name: name,
              }),
            }
          );
          console.log(
            "📅 EventBridge scheduling triggered successfully.",
            response
          );
        } catch (scheduleError) {
          console.warn(
            "⚠️ Failed to trigger EventBridge scheduling:",
            scheduleError
          );
        }

        const path =
          result.user?.role === 2 ? "/customer/dashboard" : result.user?.role === 0 ? "/admin/dashboard" : "/customer/dashboard";
        navigate(path, { replace: true });
      } catch (emailError) {
        console.warn("Failed to send welcome email:", emailError);
      }

      // Check if password is available for automatic sign-in
      if (!password) {
        showNotification(
          "warning",
          "Please login manually. Password not available for automatic sign-in."
        );
        setTimeout(() => navigate("/login"), 2000);
        return; // Exit so signIn does not run without password
      }

      // Attempt to sign in the user automatically
    } catch (error) {
      console.error("Error confirming sign up", error);
      showNotification("danger", "Error confirming account. Please try again.");
    }
  };

  const handleResendCode = async () => {
    try {
      const { codeDeliveryDetails } = await resendSignUpCode({
        username: email,
      });
      console.log(">>>>>>>", codeDeliveryDetails);
      showNotification("success", "Code resent successfully");
    } catch (error) {
      console.error("Error resending code", error);
      showNotification("danger", "Failed to resend code. Please try again.");
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div style={styles.container}>
      <NotificationAlert ref={notificationAlertRef} />
      <div style={styles.card}>
        <h2>Confirm Your Account</h2>
        <div className="login-input-group">
        <input
          type="text"
          placeholder="Enter confirmation code"
          value={code}
          onChange={(e) => setCode(e.target.value)}
          style={styles.input}
          disabled={isLoading}
        />
        <button
          onClick={handleConfirm}
          style={{
            ...styles.button,
            backgroundColor: isHovered ? "blue" : "#3b82f6",
            opacity: isLoading ? 0.6 : 1,
            cursor: isLoading ? "not-allowed" : "pointer",
          }}
          onMouseOver={() => setIsHovered(true)}
          onMouseLeave={() => setIsHovered(false)}
          disabled={isLoading}
        >
          {isLoading ? "Confirming..." : "Confirm"}
        </button>
        </div>
        <button onClick={handleResendCode} style={styles.resendButton}>
          Resend Code
        </button>
      </div>
    </div>
  );
};

const styles = {
  container: {
    display: "flex",
    justifyContent: "center",
    alignItems: "center",
    height: "100vh",
    backgroundColor: "#1d212c",
    color: "#000",
  },
  card: {
    padding: "20px",
    borderRadius: "10px",
    backgroundColor: "#181b26",
    boxShadow: "0px 0px 10px rgba(0, 0, 0, 0.5)",
    width: "400px",
  },
  input: {
    width: "100%",
    padding: "10px",
    marginBottom: "10px",
    borderRadius: "5px",
    border: "0.5px solid #dedede",
    backgroundColor: "#fff",
    color: "#000",
  },
  button: {
    width: "100%",
    padding: "10px",
    borderRadius: "5px",
    border: "none",
    cursor: "pointer",
    color: "#fff",
    marginBottom: "10px",
  },
  resendButton: {
    width: "100%",
    padding: "10px",
    borderRadius: "5px",
    border: "1px solid #3b82f6",
    backgroundColor: "#fff",
    color: "#3b82f6",
    cursor: "pointer",
  },
};

export default Confirm;