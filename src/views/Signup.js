import React, { useState, useEffect, useRef } from "react";
import { useNavigate, Link, useLocation } from "react-router-dom";
import { Helmet } from "react-helmet";
import NotificationAlert from "react-notification-alert";
import "react-notification-alert/dist/animate.css";
import { FaEye, FaEyeSlash } from "react-icons/fa";
import PhoneInput from "react-phone-input-2";
import "react-phone-input-2/lib/style.css";
import { deleteUser, signUp } from "aws-amplify/auth";
import axios from "axios";
import { apiUrl, ROUTES, STAGING_API_URL, CURRENT_ENV } from "../config/api";
import { businessTypes } from "./BusinessTypes";
import { currencies } from "utils/currencies";
import TermsOfUse from "./Terms";

import { signInWithRedirect, signOut } from "aws-amplify/auth";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faApple } from "@fortawesome/free-brands-svg-icons";
import { Spinner } from "reactstrap";
import "../assets/css/Login.css";

const logo = "/transparent.png";

const BUSINESS_TYPES = [
  ["Trucking", "Trucking"],
  ["RIDESHARE DRIVERS/PARTNERS", "Rideshare Drivers / Partners"],
  ["Groceries", "Groceries"],
  ["Individual/Households", "Individual / Households"],
  ["Cafe", "Restaurant / Café"],
  ["Cleaning Services", "Cleaning Services"],
  ["⁠Beauty & Grooming", "Beauty & Grooming (Salons, Barbershops)"],
  ["E-commerce Sellers", "E-commerce Sellers (Shopify, Amazon, Etsy)"],
  ["Construction Trades", "Construction Trades (Plumbing, Electrical, etc.)"],
  ["Content Creator", "Content Creator"],
  ["Other", "Other Businesses"],
];

const STEP_META = [
  { n: 1, label: "Account" },
  { n: 2, label: "Business" },
  { n: 3, label: "Finances" },
];

const SignupPage = () => {
  const [step, setStep] = useState(1);
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [name, setName] = useState("");
  const [companyName, setCompanyName] = useState("");
  const [businessType, setBusinessType] = useState("");
  const [otherBusinessType, setOtherBusinessType] = useState("");
  const [cashBalance, setCashBalance] = useState("");
  const [outstandingDebt, setOutstandingDebt] = useState("");
  const [valueableItems, setValueableItems] = useState("");
  const [errors, setErrors] = useState({});
  const [isSignupSuccessful, setIsSignupSuccessful] = useState(false);
  const notificationAlertRef = useRef(null);
  const navigate = useNavigate();
  const [termsChecked, setTermsChecked] = useState(false);
  const [incomePurposes, setIncomePurposes] = useState([]);
  const [expensePurposes, setExpensePurposes] = useState([]);
  const [payablePurposes, setPayablePurposes] = useState([]);
  const [manualIncomePurposes, setManualIncomePurposes] = useState([]);
  const [manualExpensePurposes, setManualExpensePurposes] = useState([]);
  const [manualPayablePurposes, setManualPayablePurposes] = useState([]);
  const [selectedBusinessType, setSelectedBusinessType] = useState("");
  const [selectedCurrency, setSelectedCurrency] = useState("USD");
  const [loading, setLoading] = useState(true);

  const location = useLocation();
  const searchParams = new URLSearchParams(location.search);
  const provider = searchParams.get("provider");
  const socialEmail = searchParams.get("email");
  const socialUserId = searchParams.get("userId");
  const socialName = searchParams.get("name");
  const isSocialSignup = provider === "Google" || provider === "Apple";
  const [isLoading, setIsLoading] = useState(false);
  const [socialAuth, setSocialAuth] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [startFromZeroConfirmed, setStartFromZeroConfirmed] = useState(false);

  const getBusinessPurposes = (businessType) => {
    if (businessType === "Other") {
      return { income: [], expenses: [], payables: [] };
    }
    return (
      businessTypes[businessType] || { income: [], expenses: [], payables: [] }
    );
  };

  useEffect(() => {
    if (selectedBusinessType) {
      if (selectedBusinessType === "Other") {
        setIncomePurposes(manualIncomePurposes);
        setExpensePurposes(manualExpensePurposes);
        setPayablePurposes(manualPayablePurposes);
      } else {
        const purposes = getBusinessPurposes(selectedBusinessType);
        setIncomePurposes(purposes.income || []);
        setExpensePurposes(purposes.expenses || []);
        setPayablePurposes(purposes.payables || []);
      }
    }
  }, [
    selectedBusinessType,
    manualIncomePurposes,
    manualExpensePurposes,
    manualPayablePurposes,
  ]);

  useEffect(() => {
    if (isSignupSuccessful) {
      setLoading(false);
      navigate("/admin/dashboard");
    }
  }, [isSignupSuccessful, navigate]);

  useEffect(() => {
    if ((provider === "Google" || provider === "Apple") && socialEmail) {
      setEmail(socialEmail);
      setLoading(false);
      if (socialName) setName(socialName);
    }
  }, [provider, socialEmail, socialName]);

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

  const validatePassword = (password) => {
    const minLength = 8;
    const hasUpperCase = /[A-Z]/.test(password);
    const hasLowerCase = /[a-z]/.test(password);
    const hasNumber = /\d/.test(password);
    const hasSpecialChar = /[!@#$%^&*(),.?":{}|<>]/.test(password);

    if (password.length < minLength) {
      return "Password must be at least 8 characters long.";
    }
    if (!hasUpperCase) {
      return "Password must contain at least one uppercase letter.";
    }
    if (!hasLowerCase) {
      return "Password must contain at least one lowercase letter.";
    }
    if (!hasNumber) {
      return "Password must contain at least one number.";
    }
    if (!hasSpecialChar) {
      return "Password must contain at least one special character.";
    }
    return "";
  };

  const validateStep1 = () => {
    const newErrors = {};
    if (!email) newErrors.email = "Email is required.";
    else if (!/\S+@\S+\.\S+/.test(email))
      newErrors.email = "Please enter a valid email address.";

    if (!isSocialSignup) {
      if (!password) newErrors.password = "Password is required.";
      else {
        const passwordError = validatePassword(password);
        if (passwordError) {
          newErrors.password = passwordError;
        }
      }
    }
    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const validateStep2 = () => {
    const newErrors = {};
    if (!name) newErrors.name = "Name is required.";
    if (!companyName) newErrors.companyName = "Company name is required.";
    if (!phone) newErrors.phone = "Phone number is required.";
    if (!selectedBusinessType) {
      newErrors.businessType = "Business type is required.";
    }
    if (selectedBusinessType === "Other" && !otherBusinessType.trim()) {
      newErrors.otherBusinessType = "Please specify your business type.";
    }
    if (!selectedCurrency) {
      newErrors.currency = "Currency is required.";
    }
    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const validateStep3 = () => {
    const newErrors = {};
    if (!cashBalance) newErrors.cashBalance = "Cash balance is required.";
    if (!outstandingDebt)
      newErrors.outstandingDebt = "Outstanding debt is required.";
    if (!valueableItems)
      newErrors.valueableItems = "Valuable items are required.";
    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleGoogleSignUp = async () => {
    try {
      setLoading(true);
      setSocialAuth("google");
      await signOut();
      await signInWithRedirect({
        provider: "Google",
        customState: "google_signup",
      });
      localStorage.setItem("provider", "Google");
    } catch (error) {
      console.error("Google sign-up error:", error);
      setLoading(false);
      setSocialAuth("");
    }
  };

  const handleAppleSignUp = async () => {
    try {
      setLoading(true);
      setSocialAuth("apple");
      await signOut();
      await signInWithRedirect({ provider: "SignInWithApple" });
      localStorage.setItem("provider", "Apple");
    } catch (error) {
      console.error("Apple sign-up error:", error);
      setLoading(false);
      setSocialAuth("");
    }
  };

  const handleSignup = async (e, type) => {
    if (isSubmitting) return;
    setIsSubmitting(true);
    if (type !== 0 && !validateStep3()) {
      setIsSubmitting(false);
      return;
    }
    e.preventDefault();
    setLoading(true);
    const creationDate = new Date().toISOString();
    const trialEndDate = new Date(
      Date.now() + 30 * 24 * 60 * 60 * 1000
    ).toISOString();
    const businessTypeValue =
      selectedBusinessType === "Other"
        ? otherBusinessType
        : selectedBusinessType;

    const data = {
      username: email,
      name,
      companyName,
      email,
      phone_number: phone,
      businessType: businessTypeValue,
      cashBalance: type === 0 ? "0" : cashBalance,
      outstandingDebt: type === 0 ? "0" : outstandingDebt,
      valueableItems: type === 0 ? "0" : valueableItems,
      role: 2,
      startFromZero: type === 0,
      creationDate,
      trialEndDate,
      isPaid: false,
      subscription: false,
      scheduleCount: 1,
      createdAt: creationDate,
      currency: selectedCurrency,
      provider: provider || "Email",
    };

    if (provider === "Google" || provider === "Apple") {
      try {
        console.log(`🔵 Processing OAuth signup... [env: ${CURRENT_ENV}]`, provider);
        console.log("socialUserId", socialUserId);
        const response = await axios.put(
          apiUrl(`${ROUTES.USERS}/${socialUserId}`),
          data
        );

        console.log("Google signup response:", response);

        if (response.status === 200) {
          localStorage.setItem("userId", socialUserId || "");
          localStorage.setItem("user_email", email);
          localStorage.setItem("user_name", name);
          localStorage.setItem("role", "2");
          localStorage.setItem("businessType", businessTypeValue);
          localStorage.setItem("cashBalance", type === 0 ? "0" : cashBalance);
          localStorage.setItem(
            "outstandingDebt",
            type === 0 ? "0" : outstandingDebt
          );
          localStorage.setItem(
            "valueableItems",
            type === 0 ? "0" : valueableItems
          );
          setLoading(false);

          localStorage.setItem("authToken", "authenticated");

          const emailData = {
            email: email,
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

    <p>Best regards,<br>
    The Meksova Team</p>
  </div>
`,
          };

          try {
            await axios.post(STAGING_API_URL, emailData);
            console.log("Welcome email sent successfully");
          } catch (emailError) {
            console.warn("Failed to send welcome email:", emailError);
          }

          showNotification("success", provider, "signup successful!");

          setTimeout(() => {
            setLoading(false);
            navigate("/customer/dashboard", { replace: true });
          }, 1000);
        }
      } catch (dbError) {
        console.error(`${provider} signup database error:`, dbError);
        setLoading(false);

        if (dbError.response?.status === 409) {
          setLoading(false);
          showNotification(
            "danger",
            "User already exists in our system. Please login."
          );
        } else {
          setLoading(false);
          showNotification("danger", "Error saving user data. Please try again.");
        }
        return;
      } finally {
        setIsSubmitting(false);
      }
      return;
    }

    try {
      console.log(`🔵 Processing regular email/password signup... [env: ${CURRENT_ENV}]`);

      const res = await signUp({
        username: email,
        password: password,
        options: {
          userAttributes: {
            email: email,
            phone_number: phone,
          },
        },
      });
      console.log(`✅ Cognito sign-up successful [env: ${CURRENT_ENV}]`, res);

      setLoading(false);
      showNotification("success", "Signup successful! Check your email for the code.");

      setTimeout(() => {
        setLoading(false);
        navigate("/confirm", {
          state: {
            email,
            id: res.userId,
            userId: res.userId,
            phone_number: phone,
            name: name,
            password,
            data,
          },
        });
      }, 1000);
    } catch (cognitoError) {
      setLoading(false);
      console.error("Cognito signup error:", cognitoError);

      if (cognitoError.name === "UsernameExistsException") {
        setLoading(false);
        showNotification("danger", "User already exists. Please login instead.");
      } else {
        setLoading(false);
        showNotification(
          "danger",
          `Signup failed: ${cognitoError.message || "Unknown error"}`
        );
      }
    } finally {
      setIsLoading(false);
      setIsSubmitting(false);
    }
  };

  const checkEmailExists = async (email) => {
    try {
      const response = await fetch(
        apiUrl(`${ROUTES.EXISTING_USER_CHECK}?email=${encodeURIComponent(email)}`),
        {
          method: "GET",
          headers: { "Content-Type": "application/json" },
        }
      );

      const result = await response.json();
      console.log("✅ Email check response:", result);
      return result.exists === true;
    } catch (error) {
      console.error("❌ Email check API error:", error);
      return false;
    }
  };

  const handleNextStep = async () => {
    if (isLoading) return;
    setIsLoading(true);

    if (step === 1) {
      if (!validateStep1()) {
        setIsLoading(false);
        return;
      }

      try {
        const exists = await checkEmailExists(email);

        if (exists) {
          setErrors((prev) => ({
            ...prev,
            email: "This email is already registered. Please login.",
          }));
          showNotification(
            "warning",
            "This email is already registered. Please use another."
          );
          setIsLoading(false);
          return;
        }

        setTimeout(() => {
          setStep(2);
          setIsLoading(false);
        }, 500);
      } catch (err) {
        console.error("❌ Email check error:", err);
        showNotification("danger", "An error occurred while checking email");
        setIsLoading(false);
      }
    } else if (step === 2) {
      if (!validateStep2()) {
        setIsLoading(false);
        return;
      }

      setTimeout(() => {
        setStep(3);
        setIsLoading(false);
      }, 500);
    }
  };

  const handlePhoneChange = (value) => {
    const formattedPhone = "+" + value.replace(/[^\d]/g, "");
    setPhone(formattedPhone);
  };

  const handleBusinessTypeChange = (type) => {
    setSelectedBusinessType(type);
    localStorage.setItem("businessType", type);
  };

  const goBack = () => setStep((s) => Math.max(1, s - 1));

  const renderStepContent = () => {
    switch (step) {
      case 1:
        return (
          <>
            <h2 className="signup-title">Create your free account</h2>
            <p className="signup-sub">
              See your profit in minutes — no credit card required.
            </p>

            {!isSocialSignup && (
              <>
                <button
                  type="button"
                  onClick={handleGoogleSignUp}
                  className="social-login-btn google"
                  disabled={socialAuth === "google"}
                >
                  {socialAuth === "google" ? (
                    <>
                      <Spinner color="light" size="sm" /> Processing…
                    </>
                  ) : (
                    <>
                      <img src="/googlelogo.png" alt="Google" className="social-icon" />
                      Continue with Google
                    </>
                  )}
                </button>

                <button
                  type="button"
                  onClick={handleAppleSignUp}
                  className="social-login-btn apple"
                  disabled={socialAuth === "apple"}
                >
                  {socialAuth === "apple" ? (
                    <>
                      <Spinner color="light" size="sm" /> Processing…
                    </>
                  ) : (
                    <>
                      <FontAwesomeIcon
                        icon={faApple}
                        className="social-icon"
                        style={{ color: "var(--text-1)" }}
                      />
                      Continue with Apple
                    </>
                  )}
                </button>

                <div className="separator">
                  <span>or sign up with email</span>
                </div>
              </>
            )}

            {isSocialSignup && (
              <p className="signup-social-note">
                Signed in with <strong>{provider}</strong>. Confirm your details to
                continue.
              </p>
            )}

            <div className="login-input-group">
              <label>Email address</label>
              <input
                type="email"
                placeholder="you@business.com"
                value={email}
                readOnly={isSocialSignup}
                className={errors.email ? "has-error" : ""}
                onChange={(e) => {
                  if (!isSocialSignup) setEmail(e.target.value);
                  setErrors((prev) => ({ ...prev, email: "" }));
                }}
              />
              {errors.email && <p className="signup-error">{errors.email}</p>}
            </div>

            {!isSocialSignup && (
              <div className="login-input-group">
                <label>Password</label>
                <div className="password-container">
                  <input
                    type={showPassword ? "text" : "password"}
                    placeholder="Create a password"
                    value={password}
                    className={errors.password ? "has-error" : ""}
                    onChange={(e) => {
                      setPassword(e.target.value);
                      setErrors((prev) => ({ ...prev, password: "" }));
                    }}
                  />
                  <button
                    type="button"
                    className="toggle-password"
                    onClick={() => setShowPassword(!showPassword)}
                    aria-label={showPassword ? "Hide password" : "Show password"}
                  >
                    {showPassword ? <FaEyeSlash /> : <FaEye />}
                  </button>
                </div>
                {errors.password ? (
                  <p className="signup-error">{errors.password}</p>
                ) : (
                  <p className="signup-hint">
                    At least 8 characters, with a number &amp; symbol.
                  </p>
                )}
              </div>
            )}

            <button
              type="button"
              onClick={handleNextStep}
              className="login-btn"
              disabled={isLoading}
            >
              {isLoading ? (
                <>
                  <Spinner color="light" size="sm" /> Please wait
                </>
              ) : isSocialSignup ? (
                "Continue"
              ) : (
                "Create free account"
              )}
            </button>

            <p className="signup-trust">
              No credit card required · Secure &amp; encrypted · Cancel anytime
            </p>
            <p className="login-signup-prompt">
              Already have an account? <Link to="/login">Log in</Link>
            </p>
          </>
        );
      case 2:
        return (
          <>
            <h2 className="signup-title">Tell us about your business</h2>
            <p className="signup-sub">
              This tailors your dashboard, categories and reports.
            </p>

            <div className="login-input-group">
              <label>Your name</label>
              <input
                type="text"
                placeholder="Full name"
                value={name}
                className={errors.name ? "has-error" : ""}
                onChange={(e) => {
                  setName(e.target.value);
                  setErrors((prev) => ({ ...prev, name: "" }));
                }}
              />
              {errors.name && <p className="signup-error">{errors.name}</p>}
            </div>

            <div className="login-input-group">
              <label>Company name</label>
              <input
                type="text"
                placeholder="Business or company name"
                value={companyName}
                className={errors.companyName ? "has-error" : ""}
                onChange={(e) => {
                  setCompanyName(e.target.value);
                  setErrors((prev) => ({ ...prev, companyName: "" }));
                }}
              />
              {errors.companyName && (
                <p className="signup-error">{errors.companyName}</p>
              )}
            </div>

            <div className="login-input-group signup-phone-group">
              <label>Phone number</label>
              <PhoneInput
                country={"us"}
                value={phone}
                onChange={handlePhoneChange}
                containerClass="signup-phone"
                inputClass={errors.phone ? "has-error" : ""}
              />
              {errors.phone && <p className="signup-error">{errors.phone}</p>}
            </div>

            <div className="login-input-group">
              <label>Business type</label>
              <select
                value={selectedBusinessType}
                className={errors.businessType ? "has-error" : ""}
                onChange={(e) => {
                  handleBusinessTypeChange(e.target.value);
                  setErrors((prev) => ({ ...prev, businessType: "" }));
                }}
              >
                <option value="">Select business type</option>
                {BUSINESS_TYPES.map(([value, label]) => (
                  <option key={value} value={value}>
                    {label}
                  </option>
                ))}
              </select>
              {errors.businessType && (
                <p className="signup-error">{errors.businessType}</p>
              )}
            </div>

            {selectedBusinessType === "Other" && (
              <div className="login-input-group">
                <label>Specify business type</label>
                <input
                  type="text"
                  placeholder="e.g. Photography studio"
                  value={otherBusinessType}
                  className={errors.otherBusinessType ? "has-error" : ""}
                  onChange={(e) => {
                    setOtherBusinessType(e.target.value);
                    setErrors((prev) => ({ ...prev, otherBusinessType: "" }));
                  }}
                />
                {errors.otherBusinessType && (
                  <p className="signup-error">{errors.otherBusinessType}</p>
                )}
              </div>
            )}

            <div className="login-input-group">
              <label>Currency</label>
              <select
                value={selectedCurrency}
                onChange={(e) => setSelectedCurrency(e.target.value)}
              >
                {Object.entries(currencies).map(([code, { symbol, name }]) => (
                  <option key={code} value={code}>
                    {symbol} {code} — {name}
                  </option>
                ))}
              </select>
            </div>

            <div className="signup-actions">
              <button type="button" className="signup-back" onClick={goBack}>
                ← Back
              </button>
              <button
                type="button"
                onClick={handleNextStep}
                className="login-btn"
                disabled={isLoading}
              >
                {isLoading ? (
                  <>
                    <Spinner color="light" size="sm" /> Please wait
                  </>
                ) : (
                  "Continue"
                )}
              </button>
            </div>
          </>
        );
      case 3:
        return (
          <>
            <h2 className="signup-title">Your starting numbers</h2>
            <p className="signup-sub">
              Where does your business stand today? This builds an accurate
              picture from day one.
            </p>

            <div className="signup-info-card">
              Enter your current cash, any debt you owe, and the value of what you
              own (inventory, equipment). Not ready?{" "}
              <a
                href="#"
                onClick={(e) => {
                  e.preventDefault();
                  if (!termsChecked) {
                    showNotification(
                      "warning",
                      "Please accept the Terms of Use to proceed."
                    );
                    return;
                  }
                  if (!isSubmitting) handleSignup(e, 0);
                }}
              >
                Start from zero →
              </a>
            </div>

            <div className="login-input-group">
              <label>Cash balance</label>
              <input
                type="text"
                placeholder="e.g. 10,000"
                value={cashBalance}
                className={errors.cashBalance ? "has-error" : ""}
                onChange={(e) => {
                  setCashBalance(e.target.value);
                  setErrors((prev) => ({ ...prev, cashBalance: "" }));
                }}
              />
              {errors.cashBalance && (
                <p className="signup-error">{errors.cashBalance}</p>
              )}
            </div>

            <div className="login-input-group">
              <label>Outstanding debt</label>
              <input
                type="text"
                placeholder="e.g. 5,000"
                value={outstandingDebt}
                className={errors.outstandingDebt ? "has-error" : ""}
                onChange={(e) => {
                  setOutstandingDebt(e.target.value);
                  setErrors((prev) => ({ ...prev, outstandingDebt: "" }));
                }}
              />
              {errors.outstandingDebt && (
                <p className="signup-error">{errors.outstandingDebt}</p>
              )}
            </div>

            <div className="login-input-group">
              <label>Valuable items</label>
              <input
                type="text"
                placeholder="e.g. Truck worth 50,000"
                value={valueableItems}
                className={errors.valueableItems ? "has-error" : ""}
                onChange={(e) => {
                  setValueableItems(e.target.value);
                  setErrors((prev) => ({ ...prev, valueableItems: "" }));
                }}
              />
              {errors.valueableItems && (
                <p className="signup-error">{errors.valueableItems}</p>
              )}
            </div>

            <label className="signup-terms">
              <input
                type="checkbox"
                checked={termsChecked}
                onChange={(e) => setTermsChecked(e.target.checked)}
              />
              <span>
                I agree to the{" "}
                <Link to="/terms-of-use" target="_blank" rel="noopener noreferrer">
                  Terms of Use
                </Link>
              </span>
            </label>

            <div className="signup-actions">
              <button type="button" className="signup-back" onClick={goBack}>
                ← Back
              </button>
              <button
                type="button"
                onClick={(e) => handleSignup(e, 1)}
                className="login-btn"
                disabled={!termsChecked || isSubmitting}
              >
                {isSubmitting ? (
                  <>
                    <Spinner color="light" size="sm" /> Saving…
                  </>
                ) : (
                  "Finish & go to dashboard"
                )}
              </button>
            </div>
          </>
        );
      default:
        return null;
    }
  };

  return (
    <>
      <Helmet>
        <title>Sign up - Meksova</title>
      </Helmet>
      <NotificationAlert ref={notificationAlertRef} />
      <div className="auth">
        <aside className="auth__brand">
          <div className="auth__logo">
            <img src={logo} alt="Meksova Finance" />
          </div>
          <div className="auth__brand-body">
            <p className="auth__eyebrow">Meksova Finance · Free 30-day trial</p>
            <h1 className="auth__headline">
              Start free.
              <br />
              <span>See your profit in minutes.</span>
            </h1>
            <p className="auth__sub">
              Create your account, tell us about your business, and we'll build
              your financial picture from day one.
            </p>
            <ul className="auth__benefits">
              <li>Track revenue, expenses &amp; cash in one place</li>
              <li>Tax-ready reports &amp; one-tap receipt scanning</li>
              <li>No credit card · cancel anytime</li>
            </ul>
          </div>
          <div className="auth__brand-foot">
            <span>Bilingual</span>
            <span>·</span>
            <span>Trusted by hundreds of small businesses</span>
          </div>
        </aside>

        <main className="auth__panel">
          <div className="login-box signup-box">
            <div className="signup-steps" aria-label={`Step ${step} of 3`}>
              {STEP_META.map((s, i) => (
                <React.Fragment key={s.n}>
                  {i > 0 && (
                    <span
                      className={`signup-steps__line ${step > i ? "is-done" : ""}`}
                      aria-hidden="true"
                    />
                  )}
                  <div
                    className={`signup-step ${step === s.n ? "is-active" : ""} ${
                      step > s.n ? "is-done" : ""
                    }`}
                  >
                    <span className="signup-step__dot">
                      {step > s.n ? "✓" : s.n}
                    </span>
                    <span className="signup-step__label">{s.label}</span>
                  </div>
                </React.Fragment>
              ))}
            </div>

            {renderStepContent()}
          </div>
        </main>
      </div>
    </>
  );
};

export default SignupPage;
