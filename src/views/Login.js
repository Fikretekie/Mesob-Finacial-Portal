// import React, { useState, useEffect, useRef } from "react";
// import { useNavigate, useLocation, Link } from "react-router-dom";
// import "../assets/css/Login.css";
// import { Helmet } from "react-helmet";
// import { Spinner } from "reactstrap";
// import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
// import { faEye, faEyeSlash } from "@fortawesome/free-solid-svg-icons";
// import { faApple } from "@fortawesome/free-brands-svg-icons";
// import { signIn, signInWithRedirect, signOut } from "aws-amplify/auth";
// import { useTranslation } from "react-i18next";
// import getUserInfo from "utils/Getuser";
// import NotificationAlert from "react-notification-alert";
// import LanguageSelector from "components/Languageselector/LanguageSelector";
// import { apiUrl, ROUTES, CURRENT_ENV } from "../config/api";

// const logo = "/transparent.png";
// const MARKETING_SITE_URL = "https://meksova.com";

// const Login = () => {
//   const { t } = useTranslation();
//   const [email, setEmail] = useState("");
//   const [password, setPassword] = useState("");
//   const [showPassword, setShowPassword] = useState(false);
//   const [loading, setLoading] = useState(false);
//   const [socialAuth, setSocialAuth] = useState("");
//   const navigate = useNavigate();
//   const location = useLocation();
//   const notificationAlertRef = useRef(null);

//   const { state } = location;
//   const error =
//     state?.error || new URLSearchParams(location.search).get("error");
//   const errorMessage =
//     state?.message || new URLSearchParams(location.search).get("message");

//   useEffect(() => {
//     if (error) {
//       console.error("Login error:", errorMessage || "Login failed.");
//     }
//   }, [error, errorMessage]);

//   const handleGoogleSignIn = async () => {
//     try {
//       setLoading(true);
//       setSocialAuth("google");
//       console.log(`🔵 Initiating Google sign-in with redirect... [env: ${CURRENT_ENV}]`);
//       await signOut();
//       await signInWithRedirect({
//         provider: "Google",
//         customState: "google_login",
//       });
//       localStorage.setItem("provider", "Google");
//     } catch (err) {
//       console.error("🔴 Google sign-in error:", err);
//       setLoading(false);
//       setSocialAuth("");
//     }
//   };

//   const handleAppleSignIn = async () => {
//     try {
//       setLoading(true);
//       setSocialAuth("apple");
//       await signOut();
//       console.log(`🔵 Initiating Apple sign-in with redirect... [env: ${CURRENT_ENV}]`);
//       await signInWithRedirect({ provider: "SignInWithApple" });
//       localStorage.setItem("provider", "Apple");
//     } catch (err) {
//       console.error("🔴 Apple sign-in error:", err);
//       setLoading(false);
//       setSocialAuth("");
//     }
//   };

//   const handleSubmit = async (e) => {
//     e.preventDefault();
//     setLoading(true);

//     if (!email.trim()) {
//       console.error("Email is required");
//       setLoading(false);
//       return;
//     }

//     try {
//       console.log("🔵 Signing in with email:", email);
//       await signOut();

//       const res = await signIn({ username: email, password });
//       if (res.isSignedIn) {
//         console.log(`✅ Email sign-in successful [env: ${CURRENT_ENV}]`);
//         const user = await getUserInfo();
//         const response = await fetch(
//           apiUrl(`${ROUTES.USERS}/${user?.userId}`),
//           {
//             method: "GET",
//             headers: {
//               "Content-Type": "application/json",
//               Accept: "application/json",
//             },
//           }
//         );

//         const result = await response.json();
//         console.log("🔍 User data:", result);
//         if (!response.ok || !result.user) {
//           await signOut();
//           notify("danger", t("auth.login.accountNotFound"));
//           setLoading(false);
//           return;
//         }
//         localStorage.clear();
//         localStorage.setItem("provider", "Email");
//         localStorage.setItem("userId", user.userId);
//         localStorage.setItem("user_email", result.user?.email || "");
//         localStorage.setItem("user_name", result.user?.name || "");
//         localStorage.setItem("role", result.user?.role?.toString() || "2");
//         localStorage.setItem(
//           "outstandingDebt",
//           result.user?.outstandingDebt || "0"
//         );
//         localStorage.setItem(
//           "valueableItems",
//           result.user?.valueableItems || "0"
//         );
//         localStorage.setItem("cashBalance", result.user?.cashBalance || "0");
//         localStorage.setItem("authToken", "authenticated");

//         const path =
//           result.user?.role === 2
//             ? "/customer/dashboard"
//             : result.user?.role === 0
//               ? "/admin/dashboard"
//               : "/customer/dashboard";
//         navigate(path, { replace: true });
//       } else {
//         console.error("Invalid credentials");
//       }
//     } catch (err) {
//       console.error("🔴 Email sign-in error:", err);
//       notify("danger", err?.message || t("auth.login.loginFailed"));
//     } finally {
//       setLoading(false);
//     }
//   };

//   const notify = (type, message) => {
//     notificationAlertRef.current?.notificationAlert({
//       place: "tr",
//       message: <div>{message}</div>,
//       type,
//       icon: "now-ui-icons ui-1_bell-53",
//       autoDismiss: 5,
//     });
//   };

//   return (
//     <>
//       <Helmet>
//         <title>{t("auth.login.pageTitle")}</title>
//       </Helmet>
//       <div className="login-page">
//         <div className="login-lang-bar">
//           <LanguageSelector />
//         </div>
//         <NotificationAlert ref={notificationAlertRef} />
//         <div className="login-layout">
//           <section className="login-marketing" aria-label={t("auth.marketing.headline")}>
//             <p className="login-marketing-trust">{t("auth.marketing.trustedBy")}</p>
//             <h1 className="login-marketing-headline">
//               {t("auth.marketing.headline")}{" "}
//               <span className="login-marketing-accent">{t("auth.marketing.headlineAccent")}</span>
//             </h1>
//             <blockquote className="login-marketing-quote">
//               <p>{t("auth.marketing.testimonial")}</p>
//               <footer>— {t("auth.marketing.testimonialAuthor")}</footer>
//             </blockquote>
//             <a
//               className="login-marketing-cta"
//               href={MARKETING_SITE_URL}
//               target="_blank"
//               rel="noopener noreferrer"
//             >
//               {t("auth.marketing.learnMore")}
//             </a>
//             <span className="login-marketing-watermark" aria-hidden="true">
//               {t("auth.marketing.watermark")}
//             </span>
//           </section>

//           <div className="login-box">
//             <img src={logo} alt={t("auth.login.brandName")} className="logo_img" />
//             <h2>{t("auth.login.title")}</h2>
//             <p className="login-welcome">
//               {t("auth.login.welcome")}{" "}
//               <span className="login-brand">{t("auth.login.brandName")}</span>
//             </p>
//             {loading && (
//               <div className="loading-message">
//                 {socialAuth === "google" && (
//                   <>
//                     {t("auth.login.processingGoogle")}{" "}
//                     <Spinner color="secondary" size="sm" />
//                   </>
//                 )}
//                 {socialAuth === "apple" && (
//                   <>
//                     {t("auth.login.processingApple")}{" "}
//                     <Spinner color="secondary" size="sm" />
//                   </>
//                 )}
//                 {!socialAuth && (
//                   <>
//                     {t("auth.login.processing")}{" "}
//                     <Spinner color="secondary" size="sm" />
//                   </>
//                 )}
//               </div>
//             )}
//             {!loading && (
//               <>
//                 <form onSubmit={handleSubmit}>
//                   <div className="login-input-group">
//                     <label>{t("auth.login.email")}</label>
//                     <input
//                       type="email"
//                       value={email}
//                       onChange={(e) => setEmail(e.target.value)}
//                       required
//                       autoComplete="email"
//                       placeholder={t("auth.login.emailPlaceholder")}
//                     />
//                   </div>
//                   <div className="login-input-group">
//                     <label>{t("auth.login.password")}</label>
//                     <div className="password-container">
//                       <input
//                         type={showPassword ? "text" : "password"}
//                         value={password}
//                         onChange={(e) => setPassword(e.target.value)}
//                         required
//                         autoComplete="current-password"
//                         placeholder={t("auth.login.passwordPlaceholder")}
//                       />
//                       <button
//                         type="button"
//                         className="toggle-password"
//                         onClick={() => setShowPassword(!showPassword)}
//                         aria-label={t("auth.login.password")}
//                       >
//                         <FontAwesomeIcon
//                           icon={showPassword ? faEyeSlash : faEye}
//                           size="lg"
//                         />
//                       </button>
//                     </div>
//                   </div>
//                   <div className="forgot-password-link">
//                     <Link to="/forgot-password">{t("auth.login.forgotPassword")}</Link>
//                   </div>
//                   <button type="submit" className="login-btn" disabled={loading}>
//                     {loading ? (
//                       <>
//                         <Spinner color="secondary" size="sm" /> {t("auth.login.pleaseWait")}
//                       </>
//                     ) : (
//                       t("auth.login.submit")
//                     )}
//                   </button>
//                 </form>
//                 <div className="separator">
//                   <span>{t("auth.login.or")}</span>
//                 </div>
//                 <button
//                   type="button"
//                   onClick={handleGoogleSignIn}
//                   className="social-login-btn google"
//                   disabled={loading}
//                 >
//                   {socialAuth === "google" && loading ? (
//                     <>
//                       <Spinner color="light" size="sm" /> {t("auth.login.processing")}
//                     </>
//                   ) : (
//                     <>
//                       <img
//                         src="/googlelogo.png"
//                         alt="Google"
//                         className="social-icon"
//                       />
//                       {t("auth.login.continueGoogle")}
//                     </>
//                   )}
//                 </button>

//                 <button
//                   type="button"
//                   onClick={handleAppleSignIn}
//                   className="social-login-btn apple"
//                   disabled={loading}
//                 >
//                   {socialAuth === "apple" && loading ? (
//                     <>
//                       <Spinner color="light" size="sm" /> {t("auth.login.processing")}
//                     </>
//                   ) : (
//                     <>
//                       <FontAwesomeIcon
//                         icon={faApple}
//                         className="social-icon"
//                         style={{ color: "#ffffff" }}
//                       />
//                       {t("auth.login.continueApple")}
//                     </>
//                   )}
//                 </button>
//                 <p className="login-signup-prompt">
//                   {t("auth.login.noAccount")}{" "}
//                   <Link to="/signup">{t("auth.login.signUp")}</Link>
//                 </p>
//               </>
//             )}
//           </div>
//         </div>
//       </div>
//     </>
//   );
// };

// export default Login;



import React, { useState, useEffect, useRef } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import "../assets/css/Login.css";
import { Helmet } from "react-helmet";
import { Spinner } from "reactstrap";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faEye, faEyeSlash } from "@fortawesome/free-solid-svg-icons";
import { faApple } from "@fortawesome/free-brands-svg-icons";
import { Link } from "react-router-dom";
import { signIn, signInWithRedirect, signOut } from "aws-amplify/auth";
import { isNativeApp, openNativeSocialSignIn, nativeOAuthState } from "utils/nativeOAuth";
import { clearAppStorageKeepingSession } from "utils/authStorage";
import { authHeader } from "utils/apiFetch";
import { getMyOwner } from "utils/teamStorage";
import getUserInfo from "utils/Getuser";
import NotificationAlert from "react-notification-alert";
import { apiUrl, ROUTES, CURRENT_ENV } from "../config/api";
import LanguageSelector from "components/Languageselector/LanguageSelector";
import { useTranslation } from "react-i18next";
const logo = "/transparent.png";

const Login = () => {
  const { t } = useTranslation();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [socialAuth, setSocialAuth] = useState("");
  const navigate = useNavigate();
  const location = useLocation();
  const notificationAlertRef = useRef(null);

  // Check for error from redirect - now just console.log if any
  const { state } = location;
  const error =
    state?.error || new URLSearchParams(location.search).get("error");
  const errorMessage =
    state?.message || new URLSearchParams(location.search).get("message");

      useEffect(() => {
    if (error) {
      console.error("Login error:", errorMessage || "Login failed.");
      setLoading(false);
      setSocialAuth("");
    }
  }, [error, errorMessage]);

  useEffect(() => {
    if (!isNativeApp()) return undefined;
    let listenerPromise;
    import("@capacitor/app").then(({ App: CapacitorApp }) => {
      listenerPromise = CapacitorApp.addListener("resume", () => {
        setTimeout(() => {
          if (nativeOAuthState.pending) {
            nativeOAuthState.pending = false;
            setLoading(false);
            setSocialAuth("");
          }
        }, 600);
      });
    });
    return () => {
      if (listenerPromise) listenerPromise.then((h) => h.remove());
    };
  }, []);

  const handleGoogleSignIn = async () => {
    try {
      setLoading(true);
      setSocialAuth("google");
      if (isNativeApp()) {
        await openNativeSocialSignIn("Google");
        return;
      }
      console.log(`🔵 Initiating Google sign-in with redirect... [env: ${CURRENT_ENV}]`);
      await signOut();
      await signInWithRedirect({
        provider: "Google",
        customState: "google_login",
      });
      localStorage.setItem("provider", "Google");
    } catch (error) {
      console.error("🔴 Google sign-in error:", error);
      setLoading(false);
      setSocialAuth("");
    }
  };

  const handleAppleSignIn = async () => {
    try {
      setLoading(true);
      setSocialAuth("apple");
      if (isNativeApp()) {
        await openNativeSocialSignIn("SignInWithApple");
        return;
      }
      await signOut();

      console.log(`🔵 Initiating Apple sign-in with redirect... [env: ${CURRENT_ENV}]`);
      await signInWithRedirect({ provider: "SignInWithApple" });
      localStorage.setItem("provider", "Apple");
    } catch (error) {
      console.error("🔴 Apple sign-in error:", error);
      setLoading(false);
      setSocialAuth("");
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);

    if (!email.trim()) {
      console.error("Email is required");
      setLoading(false);
      return;
    }

    try {
      console.log("🔵 Signing in with email:", email);
      await signOut();

      const res = await signIn({ username: email, password });
      if (res.isSignedIn) {
        console.log(`✅ Email sign-in successful [env: ${CURRENT_ENV}]`);
        const user = await getUserInfo();
        const response = await fetch(
          apiUrl(`${ROUTES.USERS}/${user?.userId}`),
          {
            method: "GET",
            headers: {
              "Content-Type": "application/json",
              Accept: "application/json",
              ...(await authHeader()),
            },
          }
        );

        const result = await response.json();
        console.log("🔍 User data:", result);

        // Resolve which account to load. Normally it's the user's own record.
        // A team member has no Users record of their own — resolve the owner
        // they belong to and load THAT account (so they work on the owner's books).
        let acct = result.user;
        let acctId = user.userId;
        let teamRole = null;
        let memberEmail = null;
        let memberBiz = null;

        if (!response.ok || !result.user) {
          const who = await getMyOwner();
          if (who?.ownerId) {
            const oRes = await fetch(apiUrl(`${ROUTES.USERS}/${who.ownerId}`), {
              method: "GET",
              headers: {
                "Content-Type": "application/json",
                Accept: "application/json",
                ...(await authHeader()),
              },
            });
            const oData = await oRes.json();
            if (oRes.ok && oData.user) {
              acct = oData.user;
              acctId = who.ownerId;
              teamRole = who.role || "member";
              memberEmail = user?.signInDetails?.loginId || email;
              memberBiz = Array.isArray(who.businessIds) ? who.businessIds : [];
            }
          }
          if (!acct) {
            await signOut();
            notify("danger", "Account not found. Please sign up or contact support.");
            setLoading(false);
            return;
          }
        }

        // Keep the Cognito session Amplify just stored (was localStorage.clear()).
        clearAppStorageKeepingSession();
        localStorage.setItem("provider", "Email");
        localStorage.setItem("userId", acctId);
        localStorage.setItem("user_email", acct?.email || "");
        localStorage.setItem("user_name", acct?.name || "");
        localStorage.setItem("role", acct?.role?.toString() || "2");
        localStorage.setItem("businessType", acct?.businessType || "");
        localStorage.setItem("outstandingDebt", acct?.outstandingDebt || "0");
        localStorage.setItem("valueableItems", acct?.valueableItems || "0");
        localStorage.setItem("cashBalance", acct?.cashBalance || "0");
        localStorage.setItem("currency", acct?.currency || "USD");
        localStorage.setItem("authToken", "authenticated");
        if (teamRole) {
          // Signed in as a teammate on someone else's account.
          localStorage.setItem("isTeamMember", "true");
          localStorage.setItem("teamRole", teamRole);
          localStorage.setItem("memberId", user.userId);
          localStorage.setItem("memberEmail", memberEmail || "");
          localStorage.setItem("allowedBusinessIds", JSON.stringify(memberBiz || []));
        }

        const path =
          acct?.role === 2
            ? "/customer/dashboard"
            : acct?.role === 0
              ? "/admin/dashboard"
              : "/customer/dashboard";
        navigate(path, { replace: true });
      } else {
        console.error("Invalid credentials");
      }
    } catch (error) {
      console.error("🔴 Email sign-in error:", error);
      notify("danger", error?.message || "Login failed. Please try again.");
    } finally {
      setLoading(false);
    }
  };
  const notify = (type, message) => {
    notificationAlertRef.current?.notificationAlert({
      place: "tr",
      message: <div>{message}</div>,
      type, // "danger", "success", "warning", "info"
      icon: "now-ui-icons ui-1_bell-53",
      autoDismiss: 5,
    });
  };
  return (
    <>
      <Helmet>
        <title>Login - Meksova</title>
      </Helmet>
      <NotificationAlert ref={notificationAlertRef} />
      <div className="auth">
        <div className="auth__lang">
          <LanguageSelector />
        </div>
        <aside className="auth__brand">
          <div className="auth__logo">
            <img src={logo} alt="Meksova Finance" />
          </div>
          <div className="auth__brand-body">
            <p className="auth__eyebrow">{t("auth.login.eyebrow")}</p>
            <h1 className="auth__headline">
              {t("auth.login.headline1")} <span>{t("auth.login.headline2")}</span>
            </h1>
            <p className="auth__sub">{t("auth.login.sub")}</p>
            <div className="auth__glimpse" aria-hidden="true">
              <div className="auth__tile">
                <span className="auth__tile-label">{t("auth.login.cashOnHand")}</span>
                <span className="auth__tile-num">$87,091</span>
                <span className="auth__tile-delta up">↗ 12.4%</span>
              </div>
              <div className="auth__tile">
                <span className="auth__tile-label">{t("auth.login.netThisMonth")}</span>
                <span className="auth__tile-num">+$61,720</span>
                <span className="auth__tile-delta up">↗ 9.8%</span>
              </div>
            </div>
          </div>
          <div className="auth__brand-foot">
            <span>{t("auth.common.bilingual")}</span><span>·</span><span>{t("auth.login.builtFor")}</span>
          </div>
        </aside>
        <main className="auth__panel">
        <div className="login-box">
          <img src={logo} alt="Logo" className="logo_img" />
          <h2>{t("auth.login.title")}</h2>
          <p className="login-welcome">{t("auth.login.welcome")} <span className="login-brand">Meksova</span></p>
          {loading && (
            <div
              className="loading-message"
              style={{ color: "#666", marginBottom: "1rem" }}
            >
              {socialAuth === "google" && (
                <>
                  {t("auth.login.processingGoogle")}{" "}
                  <Spinner color="secondary" size="sm" />
                </>
              )}
              {socialAuth === "apple" && (
                <>
                  {t("auth.login.processingApple")}{" "}
                  <Spinner color="secondary" size="sm" />
                </>
              )}
              {!socialAuth && (
                <>
                  {t("auth.login.processing")} <Spinner color="secondary" size="sm" />
                </>
              )}
            </div>
          )}
          {!loading && (
            <>
              <form onSubmit={handleSubmit}>
                <div className="login-input-group">
                  <label>{t("auth.login.email")}</label>
                  <input
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    required
                    autoComplete="email"
                    placeholder={t("auth.login.emailPlaceholder")}
                  />
                </div>
                <div className="login-input-group">
                  <label>{t("auth.login.password")}</label>
                  <div className="password-container">
                    <input
                      type={showPassword ? "text" : "password"}
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      required
                      autoComplete="current-password"
                      placeholder={t("auth.login.passwordPlaceholder")}
                    />
                    <button
                      type="button"
                      className="toggle-password"
                      aria-label={showPassword ? "Hide password" : "Show password"}
                      aria-pressed={showPassword}
                      onClick={() => setShowPassword(!showPassword)}
                    >
                      <FontAwesomeIcon
                        icon={showPassword ? faEyeSlash : faEye}
                        size="lg"
                      />
                    </button>
                  </div>
                </div>
                <div className="forgot-password-link">
                  <Link to="/forgot-password">{t("auth.login.forgot")}</Link>
                </div>
                <button type="submit" className="login-btn" disabled={loading}>
                  {loading ? (
                    <>
                      <Spinner color="secondary" size="sm" /> {t("auth.login.pleaseWait")}
                    </>
                  ) : (
                    t("auth.login.loginBtn")
                  )}
                </button>
              </form>
              <div className="separator">
                <span>{t("auth.login.or")}</span>
              </div>
              <button
                onClick={handleGoogleSignIn}
                className="social-login-btn google"
                disabled={loading}
              >
                {socialAuth === "google" && loading ? (
                  <>
                    <Spinner color="light" size="sm" /> {t("auth.login.processing")}
                  </>
                ) : (
                  <>
                    <img
                      src="/googlelogo.png"
                      alt="Google"
                      className="social-icon"
                    />
                    {t("auth.login.google")}
                  </>
                )}
              </button>

              <button
                onClick={handleAppleSignIn}
                className="social-login-btn apple"
                disabled={loading}
              >
                {socialAuth === "apple" && loading ? (
                  <>
                    <Spinner color="light" size="sm" /> {t("auth.login.processing")}
                  </>
                ) : (
                  <>
                    <FontAwesomeIcon
                      icon={faApple}
                      className="social-icon"
                      style={{ color: "#ffffff" }}
                    />
                    {t("auth.login.apple")}
                  </>
                )}
              </button>
              <p className="login-signup-prompt">
                {t("auth.login.noAccount")} <Link to="/signup">{t("auth.login.signup")}</Link>
              </p>
            </>
          )}
        </div>
        </main>
      </div>
    </>
  );
};

export default Login;