/**
 * Reset the app's own localStorage flags on login WITHOUT destroying the
 * Amplify / Cognito session tokens.
 *
 * Why this exists: both login paths used to call `localStorage.clear()` right
 * after a successful Cognito sign-in, which wiped the ID/access/refresh tokens
 * Amplify had just stored. That left the app with no real session — it
 * "remembered" the user only via a client-set `userId` flag, and the backend
 * trusted that id with no verification (see the security work / axios
 * interceptor in index.js).
 *
 * Keeping the Cognito keys means `fetchAuthSession()` returns a valid ID token,
 * so the interceptor can send `Authorization: Bearer <idToken>` on every API
 * request — which is what the (upcoming) API Gateway Cognito authorizer will
 * validate.
 *
 * Logout uses clearForSignOut() (below) + Amplify `signOut()`: everything
 * goes except this phone's preferences and the person's drive settings.
 */
import { SETUP_DONE_KEY } from "./appSetup";

// This phone's own choices, not account data: kept across sign-ins and
// sign-outs. "mksv-last-email" is the "remember me" email on the sign-in screen.
export const LAST_EMAIL_KEY = "mksv-last-email";
// How that account signs in: "email", "google" or "apple".
export const LAST_PROVIDER_KEY = "mksv-last-provider";
const DEVICE_PREF_KEYS = ["mksv-theme", "selectedLanguage", LAST_EMAIL_KEY, LAST_PROVIDER_KEY];
// Who signed out last, so their own settings come back if they sign in again.
const LAST_USER_KEY = "mksv-last-user";
// Drive detection settings (and saved work places) belong to the person:
// kept only when the same account signs back in. Wiping them used to switch
// background drive detection off after every re-login.
const SAME_USER_KEYS = ["mksv-drive-settings", "mksv-drive-resume", SETUP_DONE_KEY];

export function clearAppStorageKeepingSession(nextUserId) {
  try {
    const previous = localStorage.getItem("userId") || localStorage.getItem(LAST_USER_KEY);
    const sameUser = !!nextUserId && previous === String(nextUserId);
    Object.keys(localStorage).forEach((key) => {
      if (DEVICE_PREF_KEYS.includes(key)) return;
      if (sameUser && SAME_USER_KEYS.includes(key)) return;
      const isSessionKey =
        key.startsWith("CognitoIdentityServiceProvider.") ||
        key.startsWith("amplify-") ||
        key.startsWith("aws.cognito.") ||
        // Native-app Google/Apple sign-in keeps its own Cognito tokens
        // (utils/nativeOAuth.js); wiping them left every API call unauthenticated.
        key.startsWith("nativeSession");
      if (!isSessionKey) localStorage.removeItem(key);
    });
  } catch (e) {
    // localStorage unavailable (private mode / blocked) — nothing to clear.
  }
}

/**
 * Sign-out: wipe the account's data but keep this phone's preferences (theme,
 * language, remembered email) and the person's drive settings, which only come
 * back if the same account signs in again.
 */
export function clearForSignOut() {
  try {
    const userId = localStorage.getItem("userId");
    Object.keys(localStorage).forEach((key) => {
      if (DEVICE_PREF_KEYS.includes(key) || SAME_USER_KEYS.includes(key)) return;
      localStorage.removeItem(key);
    });
    if (userId) localStorage.setItem(LAST_USER_KEY, userId);
  } catch (e) {
    // localStorage unavailable — nothing to clear.
  }
}

/** Remember who signed in on this phone (never the password). */
export function rememberSignIn(email, provider) {
  if (!email) return;
  const p = /apple/i.test(provider || "") ? "apple" : /google/i.test(provider || "") ? "google" : "email";
  try {
    localStorage.setItem(LAST_EMAIL_KEY, email.trim());
    localStorage.setItem(LAST_PROVIDER_KEY, p);
  } catch (e) {
    // Not remembered — the sign-in screen just starts blank.
  }
}

/** "Use a different account": forget the remembered account on this phone. */
export function forgetLastEmail() {
  try {
    localStorage.removeItem(LAST_EMAIL_KEY);
    localStorage.removeItem(LAST_PROVIDER_KEY);
  } catch (e) {
    // Nothing stored.
  }
}
