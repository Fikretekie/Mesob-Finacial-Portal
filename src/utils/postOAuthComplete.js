import { apiUrl, ROUTES, CURRENT_ENV } from "../config/api";
import { clearAppStorageKeepingSession } from "./authStorage";

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
    clearAppStorageKeepingSession();
    localStorage.setItem("userId", userData.id);
    localStorage.setItem("user_email", userData.email || email);
    localStorage.setItem("user_name", userData.name || "");
    localStorage.setItem("role", userData.role?.toString() || "2");
    localStorage.setItem("outstandingDebt", userData.outstandingDebt || "0");
    localStorage.setItem("valueableItems", userData.valueableItems || "0");
    localStorage.setItem("cashBalance", userData.cashBalance || "0");
    localStorage.setItem("authToken", "authenticated");

    const dashboardPath = userData.role === 2 ? "/customer/dashboard" : "/admin/dashboard";
    navigate(dashboardPath, { replace: true });
  } catch (apiError) {
    console.error("OAuth completion API error:", apiError);
    navigate("/login", {
      state: { error: "api_failed", message: "Could not verify user account" },
      replace: true,
    });
  }
};