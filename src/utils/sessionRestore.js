import { fetchAuthSession } from "aws-amplify/auth";
import { getNativeIdToken } from "./nativeOAuth";
import { homePathForRole } from "./staffAccess";

// The app opens on /login every launch. If the stored Cognito session is still
// good (or refreshable), return where the user belongs so Login can skip
// straight past itself; otherwise null.
export async function getRestorablePath() {
  if (!localStorage.getItem("user_email")) return null;

  let idToken = null;
  try {
    const { tokens } = await fetchAuthSession();
    idToken = tokens?.idToken?.toString() || null;
  } catch (e) {
    // No Amplify session (native Google/Apple sign-in) — check our own below.
  }
  if (!idToken) idToken = await getNativeIdToken().catch(() => null);
  if (!idToken) return null;

  return homePathForRole(localStorage.getItem("role") || 2);
}

// A profile with no usable session (expired refresh token, or a build that
// lost its tokens): drop the "signed in" markers so nothing treats it as live.
export function forgetStaleSignIn() {
  ["user_email", "authToken", "userId", "role"].forEach((k) => localStorage.removeItem(k));
}
