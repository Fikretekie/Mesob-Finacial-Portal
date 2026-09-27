import React, { useState, useEffect, useRef } from "react";
import { useNavigate, Link, useLocation } from "react-router-dom";
import { useTranslation } from "react-i18next";
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

// [storedValue, fallbackLabel, i18nKey under auth.signup.types]
const BUSINESS_TYPES = [
  ["Trucking", "Trucking", "truck"],
  ["RIDESHARE DRIVERS/PARTNERS", "Rideshare Drivers / Partners", "rideshare"],
  ["Groceries", "Groceries", "groceries"],
  ["Individual/Households", "Individual / Households", "individual"],
  ["Cafe", "Restaurant / Café", "cafe"],
  ["Cleaning Services", "Cleaning Services", "cleaning"],
  ["⁠Beauty & Grooming", "Beauty & Grooming (Salons, Barbershops)", "beauty"],
  ["E-commerce Sellers", "E-commerce Sellers (Shopify, Amazon, Etsy)", "ecommerce"],
  ["Construction Trades", "Construction Trades (Plumbing, Electrical, etc.)", "construction"],
  ["Content Creator", "Content Creator", "creator"],
  ["Other", "Other Businesses", "other"],
];

// [stepNumber, i18nKey under auth.signup]
const STEP_META = [
  { n: 1, key: "stepAccount" },
  { n: 2, key: "stepBusiness" },
  { n: 3, key: "stepFinances" },
];

// Country (ISO-2 from the phone picker) -> default currency code. Anything not
// listed keeps the current selection. All codes exist in utils/currencies.
const COUNTRY_CURRENCY = {
  US: "USD", CA: "CAD", GB: "GBP", AU: "AUD", NZ: "NZD",
  ET: "ETB", KE: "KES", NG: "NGN", GH: "GHS", ZA: "ZAR", TZ: "TZS", UG: "UGX", RW: "RWF",
  IN: "INR", PK: "PKR", BD: "BDT", LK: "LKR", NP: "NPR",
  AE: "AED", SA: "SAR", QA: "QAR", KW: "KWD", BH: "BHD", OM: "OMR", JO: "JOD",
  EG: "EGP", IL: "ILS", TR: "TRY",
  CN: "CNY", JP: "JPY", KR: "KRW", HK: "HKD", SG: "SGD", MY: "MYR", TH: "THB",
  ID: "IDR", PH: "PHP", VN: "VND", TW: "TWD",
  MX: "MXN", BR: "BRL", AR: "ARS", CL: "CLP", CO: "COP", PE: "PEN",
  RU: "RUB", UA: "UAH",
  DE: "EUR", FR: "EUR", ES: "EUR", IT: "EUR", NL: "EUR", IE: "EUR", PT: "EUR",
  BE: "EUR", AT: "EUR", FI: "EUR", GR: "EUR",
  CH: "CHF", SE: "SEK", NO: "NOK", DK: "DKK", PL: "PLN", CZ: "CZK", HU: "HUF", RO: "RON",
};

const SignupPage = () => {
  const { t } = useTranslation();
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
  const [personalizing, setPersonalizing] = useState(false);
  const [personalizeIdx, setPersonalizeIdx] = useState(0);

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
          localStorage.setItem("currency", selectedCurrency || "USD");
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
      setIsLoading(false);
      // Show the industry personalization sequence, then advance to step 3.
      await runPersonalization();
    }
  };

  const handlePhoneChange = (value, data) => {
    const formattedPhone = "+" + value.replace(/[^\d]/g, "");
    setPhone(formattedPhone);
    // Match the currency to the country picked in the phone selector.
    // react-phone-input-2 passes the ISO-2 code in data.countryCode.
    const iso2 = data?.countryCode ? data.countryCode.toUpperCase() : "";
    const mapped = COUNTRY_CURRENCY[iso2];
    if (mapped && currencies[mapped]) setSelectedCurrency(mapped);
  };

  const handleBusinessTypeChange = (type) => {
    setSelectedBusinessType(type);
    localStorage.setItem("businessType", type);
  };

  const goBack = () => setStep((s) => Math.max(1, s - 1));

  // ── Industry personalization ────────────────────────────────────────────
  const industryLabel = (() => {
    if (selectedBusinessType === "Other")
      return otherBusinessType.trim() || t("auth.signup.types.other");
    const found = BUSINESS_TYPES.find(([value]) => value === selectedBusinessType);
    return found ? t(`auth.signup.types.${found[2]}`) : selectedBusinessType || "";
  })();

  const industryData = businessTypes[selectedBusinessType] || null;
  const tailoredSamples = industryData
    ? [...(industryData.income || []).slice(0, 2), ...(industryData.expenses || []).slice(0, 3)]
    : [];
  const tailoredCount = industryData
    ? (industryData.income?.length || 0) + (industryData.expenses?.length || 0)
    : 0;

  const personalizeItems = [
    industryData
      ? t("auth.signup.pLoadCats", { count: tailoredCount, industry: industryLabel })
      : t("auth.signup.pSetupCats", { industry: industryLabel }),
    t("auth.signup.pConfigure"),
    t("auth.signup.pTailor"),
    t("auth.signup.pFinish"),
  ];

  const runPersonalization = async () => {
    setPersonalizeIdx(0);
    setPersonalizing(true);
    for (let i = 0; i < personalizeItems.length; i++) {
      await new Promise((r) => setTimeout(r, 620));
      setPersonalizeIdx(i + 1);
    }
    await new Promise((r) => setTimeout(r, 480));
    setPersonalizing(false);
    setStep(3);
  };

  const renderStepContent = () => {
    switch (step) {
      case 1:
        return (
          <>
            <h2 className="signup-title">{t("auth.signup.title1")}</h2>
            <p className="signup-sub">{t("auth.signup.sub1")}</p>

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
                      <Spinner color="light" size="sm" /> {t("auth.signup.processing")}
                    </>
                  ) : (
                    <>
                      <img src="/googlelogo.png" alt="Google" className="social-icon" />
                      {t("auth.signup.google")}
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
                      <Spinner color="light" size="sm" /> {t("auth.signup.processing")}
                    </>
                  ) : (
                    <>
                      <FontAwesomeIcon
                        icon={faApple}
                        className="social-icon"
                        style={{ color: "var(--text-1)" }}
                      />
                      {t("auth.signup.apple")}
                    </>
                  )}
                </button>

                <div className="separator">
                  <span>{t("auth.signup.orEmail")}</span>
                </div>
              </>
            )}

            {isSocialSignup && (
              <p className="signup-social-note">
                {t("auth.signup.socialNote", { provider })}
              </p>
            )}

            <div className="login-input-group">
              <label>{t("auth.signup.email")}</label>
              <input
                type="email"
                placeholder={t("auth.signup.emailPlaceholder")}
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
                <label>{t("auth.signup.password")}</label>
                <div className="password-container">
                  <input
                    type={showPassword ? "text" : "password"}
                    placeholder={t("auth.signup.passwordPlaceholder")}
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
                  <p className="signup-hint">{t("auth.signup.passwordHint")}</p>
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
                  <Spinner color="light" size="sm" /> {t("auth.signup.pleaseWait")}
                </>
              ) : isSocialSignup ? (
                t("auth.signup.continue")
              ) : (
                t("auth.signup.createAccount")
              )}
            </button>

            <p className="signup-trust">{t("auth.signup.trust")}</p>
            <p className="login-signup-prompt">
              {t("auth.signup.haveAccount")}{" "}
              <Link to="/login">{t("auth.common.login")}</Link>
            </p>
          </>
        );
      case 2:
        return (
          <>
            <h2 className="signup-title">{t("auth.signup.title2")}</h2>
            <p className="signup-sub">{t("auth.signup.sub2")}</p>

            <div className="login-input-group">
              <label>{t("auth.signup.yourName")}</label>
              <input
                type="text"
                placeholder={t("auth.signup.yourNamePlaceholder")}
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
              <label>{t("auth.signup.companyName")}</label>
              <input
                type="text"
                placeholder={t("auth.signup.companyPlaceholder")}
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
              <label>{t("auth.signup.phone")}</label>
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
              <label>{t("auth.signup.businessType")}</label>
              <select
                value={selectedBusinessType}
                className={errors.businessType ? "has-error" : ""}
                onChange={(e) => {
                  handleBusinessTypeChange(e.target.value);
                  setErrors((prev) => ({ ...prev, businessType: "" }));
                }}
              >
                <option value="">{t("auth.signup.selectType")}</option>
                {BUSINESS_TYPES.map(([value, label, key]) => (
                  <option key={value} value={value}>
                    {t(`auth.signup.types.${key}`, label)}
                  </option>
                ))}
              </select>
              {errors.businessType && (
                <p className="signup-error">{errors.businessType}</p>
              )}
            </div>

            {industryData && tailoredSamples.length > 0 && (
              <div className="signup-preview">
                <span className="signup-preview__eyebrow">
                  <span className="signup-preview__ic" aria-hidden="true">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <line x1="4" y1="21" x2="4" y2="14" />
                      <line x1="4" y1="10" x2="4" y2="3" />
                      <line x1="12" y1="21" x2="12" y2="12" />
                      <line x1="12" y1="8" x2="12" y2="3" />
                      <line x1="20" y1="21" x2="20" y2="16" />
                      <line x1="20" y1="12" x2="20" y2="3" />
                      <line x1="1" y1="14" x2="7" y2="14" />
                      <line x1="9" y1="8" x2="15" y2="8" />
                      <line x1="17" y1="16" x2="23" y2="16" />
                    </svg>
                  </span>
                  {t("auth.signup.tailored", { industry: industryLabel, count: tailoredCount })}
                </span>
                <div className="signup-preview__chips">
                  {tailoredSamples.map((c) => (
                    <span className="signup-chip" key={c}>
                      {c}
                    </span>
                  ))}
                </div>
              </div>
            )}

            {selectedBusinessType === "Other" && (
              <div className="login-input-group">
                <label>{t("auth.signup.specifyType")}</label>
                <input
                  type="text"
                  placeholder={t("auth.signup.specifyPlaceholder")}
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
              <label>{t("auth.signup.currency")}</label>
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
                ← {t("auth.common.back")}
              </button>
              <button
                type="button"
                onClick={handleNextStep}
                className="login-btn"
                disabled={isLoading}
              >
                {isLoading ? (
                  <>
                    <Spinner color="light" size="sm" /> {t("auth.signup.pleaseWait")}
                  </>
                ) : (
                  t("auth.signup.continue")
                )}
              </button>
            </div>
          </>
        );
      case 3:
        return (
          <>
            <h2 className="signup-title">{t("auth.signup.title3")}</h2>
            <p className="signup-sub">{t("auth.signup.sub3")}</p>

            <div className="signup-info-card">
              {t("auth.signup.infoCard")}{" "}
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
                {t("auth.signup.startFromZero")}
              </a>
            </div>

            <div className="login-input-group">
              <label>{t("auth.signup.cashBalance")}</label>
              <input
                type="text"
                placeholder={t("auth.signup.cashPlaceholder")}
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
              <label>{t("auth.signup.debt")}</label>
              <input
                type="text"
                placeholder={t("auth.signup.debtPlaceholder")}
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
              <label>{t("auth.signup.valuable")}</label>
              <input
                type="text"
                placeholder={t("auth.signup.valuablePlaceholder")}
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
                {t("auth.signup.agree")}{" "}
                <Link to="/terms-of-use" target="_blank" rel="noopener noreferrer">
                  {t("auth.signup.terms")}
                </Link>
              </span>
            </label>

            <div className="signup-actions">
              <button type="button" className="signup-back" onClick={goBack}>
                ← {t("auth.common.back")}
              </button>
              <button
                type="button"
                onClick={(e) => handleSignup(e, 1)}
                className="login-btn"
                disabled={!termsChecked || isSubmitting}
              >
                {isSubmitting ? (
                  <>
                    <Spinner color="light" size="sm" /> {t("auth.signup.saving")}
                  </>
                ) : (
                  t("auth.signup.finish")
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
            <p className="auth__eyebrow">{t("auth.signup.eyebrow")}</p>
            <h1 className="auth__headline">
              {t("auth.signup.headline1")}
              <br />
              <span>{t("auth.signup.headline2")}</span>
            </h1>
            <p className="auth__sub">{t("auth.signup.brandSub")}</p>
            <ul className="auth__benefits">
              <li>{t("auth.signup.benefit1")}</li>
              <li>{t("auth.signup.benefit2")}</li>
              <li>{t("auth.signup.benefit3")}</li>
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
            {personalizing ? (
              <div className="signup-personalize">
                <div className="signup-personalize__ring" aria-hidden="true">
                  <img src={logo} alt="" />
                </div>
                <h2 className="signup-title">
                  {t("auth.signup.pTitle", { industry: industryLabel })}
                </h2>
                <p className="signup-sub">{t("auth.signup.pSub")}</p>
                <ul className="signup-personalize__list">
                  {personalizeItems.map((label, i) => (
                    <li
                      key={i}
                      className={
                        i < personalizeIdx
                          ? "is-done"
                          : i === personalizeIdx
                          ? "is-active"
                          : ""
                      }
                    >
                      <span className="signup-personalize__tick">
                        {i < personalizeIdx ? (
                          "✓"
                        ) : i === personalizeIdx ? (
                          <Spinner size="sm" />
                        ) : (
                          ""
                        )}
                      </span>
                      <span>{label}</span>
                    </li>
                  ))}
                </ul>
                {tailoredSamples.length > 0 && (
                  <div className="signup-preview__chips signup-personalize__chips">
                    {tailoredSamples.map((c) => (
                      <span className="signup-chip" key={c}>
                        {c}
                      </span>
                    ))}
                  </div>
                )}
              </div>
            ) : (
              <>
                <div
                  className="signup-steps"
                  aria-label={`Step ${step} of 3`}
                >
                  {STEP_META.map((s, i) => (
                    <React.Fragment key={s.n}>
                      {i > 0 && (
                        <span
                          className={`signup-steps__line ${
                            step > i ? "is-done" : ""
                          }`}
                          aria-hidden="true"
                        />
                      )}
                      <div
                        className={`signup-step ${
                          step === s.n ? "is-active" : ""
                        } ${step > s.n ? "is-done" : ""}`}
                      >
                        <span className="signup-step__dot">
                          {step > s.n ? "✓" : s.n}
                        </span>
                        <span className="signup-step__label">
                          {t(`auth.signup.${s.key}`)}
                        </span>
                      </div>
                    </React.Fragment>
                  ))}
                </div>

                {renderStepContent()}
              </>
            )}
          </div>
        </main>
      </div>
    </>
  );
};

export default SignupPage;
