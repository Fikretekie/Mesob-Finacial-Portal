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
 * Logout is unchanged: it still uses `localStorage.clear()` + Amplify
 * `signOut()` to wipe everything, which is correct.
 */
export function clearAppStorageKeepingSession() {
  try {
    Object.keys(localStorage).forEach((key) => {
      const isSessionKey =
        key.startsWith("CognitoIdentityServiceProvider.") ||
        key.startsWith("amplify-") ||
        key.startsWith("aws.cognito.");
      if (!isSessionKey) localStorage.removeItem(key);
    });
  } catch (e) {
    // localStorage unavailable (private mode / blocked) — nothing to clear.
  }
}
