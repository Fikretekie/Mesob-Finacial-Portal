import React, { useEffect } from "react";
import ReactDOM from "react-dom/client";
import {
  BrowserRouter,
  Route,
  Routes,
  Navigate,
  useLocation,
} from "react-router-dom";
import { Provider, useDispatch } from "react-redux";
import { configureStore } from "@reduxjs/toolkit";
import { Amplify } from "aws-amplify";
import { fetchAuthSession } from "aws-amplify/auth";
import axios from "axios";
import userReducer from "./store/userSlice";
import currencyReducer, { setCurrency } from "./store/currencySlice";
import { getUserCurrencyFromIP } from "./utils/currencyUtils";

import "bootstrap/dist/css/bootstrap.css";
import "assets/scss/now-ui-dashboard.scss?v1.5.0";
import "assets/css/demo.css";
import "assets/css/tokens.css";
import "assets/css/components.css";
import "assets/css/app-chrome.css";

import AdminLayout from "layouts/Admin.js";
import FinancialLayout from "layouts/financial.js";
import Login from "../src/views/Login";
import MesobFinanceLogin from "views/MesobFinanceLogin";
import SignupPage from "./views/Signup";
import CustomerLayout from "layouts/Customer";
import ForgotPassword from "views/ForgotPassword";
import SubscriptionPlans from "views/Payment/SubscriptionPlans";
import SubscriptionPage from "views/Payment/Subscription";
import Confirm from "views/Confirm";
import OAuthListener from "components/OAuthListener";
import TermsOfUse from "views/Terms";
import CompleteProfile from "views/CompleteProfile";
import "./i18n";
import { getEnv } from "./config/api";

// Create Redux store
const store = configureStore({
  reducer: {
    selectedUser: userReducer,
  },
});


const ENV = getEnv();
const isProduction = ENV === "production";
const isLocalhost =
  typeof window !== "undefined" &&
  (window.location?.hostname === "localhost" || window.location?.hostname === "127.0.0.1");

/** Mask secret IDs for logs (never log full pool/client IDs in production). */
const maskId = (value) =>
  value && typeof value === "string" && value.length > 0
    ? `${value.slice(0, 8)}…`
    : "MISSING";

const cognitoUserPoolId = isProduction
  ? process.env.REACT_APP_PRODUCTION_COGNITO_USER_POOL_ID
  : process.env.REACT_APP_STAGING_COGNITO_USER_POOL_ID;
const cognitoClientId = isProduction
  ? process.env.REACT_APP_PRODUCTION_COGNITO_CLIENT_ID
  : process.env.REACT_APP_STAGING_COGNITO_CLIENT_ID;
const cognitoDomain = isProduction
  ? process.env.REACT_APP_PRODUCTION_COGNITO_DOMAIN
  : process.env.REACT_APP_STAGING_COGNITO_DOMAIN;

const appOrigin = isProduction ? "https://app.meksova.com" : "https://staging.meksova.com";
const googleClientId = isProduction
  ? process.env.REACT_APP_PRODUCTION_GOOGLE_CLIENT_ID
  : process.env.REACT_APP_STAGING_GOOGLE_CLIENT_ID;

// OAuth scopes per env: production's Cognito app client allows "profile",
// staging's does not (requesting it returns invalid_scope). Verified against
// each pool's /oauth2/authorize. Keep production as-is; drop profile on staging.
const oauthScopes = isProduction
  ? ["openid", "email", "profile"]
  : ["openid", "email"];

const authConfigOk =
  Boolean(cognitoUserPoolId) && Boolean(cognitoClientId) && Boolean(cognitoDomain);

if (typeof window !== "undefined") {
  const hostname = window.location?.hostname;

  // Inspect on deployed site: open DevTools → Console → __MESOB_AUTH_DEBUG__
  window.__MESOB_AUTH_DEBUG__ = {
    env: ENV,
    hostname,
    pool: isProduction ? "production" : "staging",
    userPoolId: maskId(cognitoUserPoolId),
    clientId: maskId(cognitoClientId),
    cognitoDomain: cognitoDomain || "MISSING",
    authConfigOk,
    hint:
      isProduction && !isLocalhost
        ? "Production bundle must be built with REACT_APP_PRODUCTION_COGNITO_* in CI. .env on the server does not change an already-built JS file."
        : undefined,
  };

  console.log("[Auth] Cognito (masked):", {
    ENV,
    hostname,
    userPoolId: maskId(cognitoUserPoolId),
    clientId: maskId(cognitoClientId),
    cognitoDomain: cognitoDomain || "MISSING",
    authConfigOk,
    appOrigin,
  });

  if (isLocalhost) {
    console.log(
      `[Auth] Localhost → using ${isProduction ? "PRODUCTION" : "STAGING"} pool (from REACT_APP_ENV / .env). Restart dev server after .env changes.`
    );
  }

  if (isProduction && !authConfigOk) {
    console.error(
      "[Auth] Production Cognito is not configured in this JS bundle. " +
        "Set REACT_APP_PRODUCTION_COGNITO_USER_POOL_ID, REACT_APP_PRODUCTION_COGNITO_CLIENT_ID, and REACT_APP_PRODUCTION_COGNITO_DOMAIN " +
        "in your build pipeline (GitHub Actions / Amplify / etc.), then run npm run build and redeploy. " +
        "Values are baked in at build time, not read from the server at runtime."
    );
  }

  if (!isProduction && (!cognitoClientId || !cognitoDomain)) {
    console.warn(
      "[Auth] Staging needs REACT_APP_STAGING_COGNITO_CLIENT_ID and REACT_APP_STAGING_COGNITO_DOMAIN in .env (restart dev server after adding)."
    );
  }
}

Amplify.configure({
  Auth: {
    Cognito: {
      userPoolId: cognitoUserPoolId,
      userPoolClientId: cognitoClientId,
      loginWith: {
        oauth: {
          region: "us-east-1",
          domain: cognitoDomain,
          scopes: oauthScopes,
          redirectSignIn: [`${appOrigin}/oauth-redirect`, "http://localhost:3000/oauth-redirect"],
          redirectSignOut: [appOrigin, "http://localhost:3000"],
          responseType: "code",
          providers: [
            { provider: "Google", scopes: oauthScopes, clientId: googleClientId },
            { provider: "SignInWithApple", clientId: isProduction ? "com.mesob.financial" : "com.mesob.financial.staging" },
          ],
        },
      },
    },
  },
});

// ── Attach the Cognito ID token to every backend API request ────────────────
// Prepares the frontend for a Cognito authorizer on API Gateway (see security
// brief). Scoped to our own execute-api hosts so the token is never sent to S3
// or third parties. Safe to ship before the authorizer exists: the API ignores
// the header today; the day the authorizer is enabled, requests already carry a
// valid token. NOTE: fetch()-based API calls (a few in Documents/OAuthListener)
// are not covered by this axios interceptor and must attach the token manually.
axios.interceptors.request.use(async (config) => {
  try {
    const url = config.url || "";
    if (url.includes("execute-api.us-east-1.amazonaws.com")) {
      const { tokens } = await fetchAuthSession();
      const idToken = tokens?.idToken?.toString();
      if (idToken) {
        config.headers = config.headers || {};
        // API Gateway REST Cognito authorizers reject the "Bearer " prefix —
        // they parse the header value as the raw JWT. Send the raw ID token.
        config.headers.Authorization = idToken;
      }
    }
  } catch (e) {
    // Not signed in yet (or session refresh failed) — leave the request as-is.
  }
  return config;
});

const root = ReactDOM.createRoot(document.getElementById("root"));

root.render(
  <Provider store={store}>
    <BrowserRouter>
      <Routes>
        {/* Route for the Login page */}
        <Route path="/login" element={<Login />} />
        <Route path="/oauth-redirect" element={<OAuthListener />} />
        <Route path="/forgot-password" element={<ForgotPassword />} />
        <Route path="/mesonfinancelogin" element={<MesobFinanceLogin />} />
        <Route path="/complete-profile" element={<CompleteProfile />} />
        <Route path="/signup" element={<SignupPage />} />
        {/* New Confirm route */}
        <Route path="/confirm" element={<Confirm />} />
        {/* Admin routes */}
        <Route path="/financial/*" element={<FinancialLayout />} />

        {/* Admin routes */}
        <Route path="/admin/*" element={<AdminLayout />} />
        <Route path="/customer/*" element={<CustomerLayout />} />
        {/* Subscription Routes */}
        <Route path="/subscription" element={<SubscriptionPlans />} />
        <Route path="/terms-of-use" element={<TermsOfUse />} />
        {/* Redirect any unknown routes to /login */}
        <Route path="*" element={<Navigate to="/login" replace />} />
      </Routes>
    </BrowserRouter>
  </Provider>
);