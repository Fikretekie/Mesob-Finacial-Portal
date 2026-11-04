import { apiUrl, ROUTES, CURRENT_ENV } from "../config/api";
import { Capacitor } from "@capacitor/core";
import { clearAppStorageKeepingSession, rememberSignIn } from "./authStorage";
import { openWebSignup } from "./webSignup";
import { takeNextPath } from "./afterLogin";
import { homePathForRole, storePerms } from "./staffAccess";

export const completeOAuthSignIn = async ({ email, name, provider, userId, navigate }) => {
  if (!email) {
    navigate(`/signup?provider=${provider}&needsEmail=true`, { replace: true });
    return;
  }

  try {
    const checkResponse = await fetch(
      apiUrl(`${ROUTES.EXISTING_USER_CHECK}?email=${encodeURIComponent(email)}`),
      { method: "GET", headers: { "Content-Type": "application/json" } }
    );
    if (!checkResponse.ok) throw new Error(`API error: ${checkResponse.status}`);
    const checkResult = await checkResponse.json();

    if (!checkResult.exists) {
      // Phone app: accounts are created on the website, not in the app.
      if (Capacitor.isNativePlatform()) {
        openWebSignup(email);
        navigate("/login", { state: { error: "no_account", email }, replace: true });
        return;
      }
      console.log(`New user (OAuth), redirecting to signup [env: ${CURRENT_ENV}]`);
      localStorage.setItem("socialSignup", "true");
      localStorage.setItem("socialEmail", email);
      localStorage.setItem("socialProvider", provider);
      navigate(
        `/signup?provider=${provider}&email=${encodeURIComponent(email)}` +
          `&userId=${encodeURIComponent(userId || "")}&name=${encodeURIComponent(name || "")}`,
        { replace: true }
      );
      return;
    }

    console.log(`Existing user, OAuth sign-in complete [env: ${CURRENT_ENV}]`);
    const userData = checkResult.user;
    clearAppStorageKeepingSession(userData.id);
    localStorage.setItem("userId", userData.id);
    localStorage.setItem("user_email", userData.email || email);
    localStorage.setItem("user_name", userData.name || "");
    localStorage.setItem("role", userData.role?.toString() || "2");
    storePerms(userData.staffPermissions);
    // Same account basics the email sign-in stores (Login.js).
    localStorage.setItem("businessType", userData.businessType === "Resturant/Cafe" ? "Cafe" : userData.businessType || "");
    localStorage.setItem("companyName", userData.companyName || "");
    localStorage.setItem("currency", userData.currency || "USD");
    localStorage.setItem("outstandingDebt", userData.outstandingDebt || "0");
    localStorage.setItem("valueableItems", userData.valueableItems || "0");
    localStorage.setItem("cashBalance", userData.cashBalance || "0");
    localStorage.setItem("authToken", "authenticated");
    rememberSignIn(userData.email || email, provider);

    const dashboardPath = homePathForRole(userData.role ?? 2);
    navigate(takeNextPath(dashboardPath), { replace: true });
  } catch (apiError) {
    console.error("OAuth completion API error:", apiError);
    navigate("/login", {
      state: { error: "api_failed", message: "Could not verify user account" },
      replace: true,
    });
  }
};