/**
 * Attaches the signed-in user's Cognito access token as an
 * `Authorization: Bearer <token>` header to every outgoing request --
 * but ONLY requests going to our own backend (API_BASE_URL /
 * STAGING_API_URL). Requests to any other host (Cognito, Google,
 * Stripe, PayPal, S3, etc.) are left untouched, so the token is never
 * sent to a third party.
 *
 * Patches both `axios` (used by most of the app) and the global
 * `fetch` (used by a handful of views), since between them they cover
 * every API call in the codebase. Import this once, early, in
 * src/index.js -- it has no exports, it just installs the patches as
 * a side effect.
 *
 * If there's no signed-in session (e.g. on the login/signup screens),
 * fetchAuthSession() resolves with no tokens and requests go out
 * exactly as before -- this never blocks or breaks an unauthenticated
 * call, it only adds a header when one is available.
 */
import axios from "axios";
import { fetchAuthSession } from "aws-amplify/auth";
import { API_BASE_URL, STAGING_API_URL } from "config/api";

const OUR_API_HOSTS = [API_BASE_URL, STAGING_API_URL]
  .map((url) => {
    try {
      return new URL(url).host;
    } catch {
      return null;
    }
  })
  .filter(Boolean);

function isOurApi(url) {
  try {
    return OUR_API_HOSTS.includes(new URL(url, window.location.origin).host);
  } catch {
    return false;
  }
}

async function getBearerToken() {
  try {
    const session = await fetchAuthSession();
        return session.tokens?.idToken?.toString() || session.tokens?.accessToken?.toString() || null;
  } catch {
    return null;
  }
}

axios.interceptors.request.use(async (config) => {
  const url = config.url ? new URL(config.url, API_BASE_URL).toString() : "";
  if (isOurApi(url)) {
    const token = await getBearerToken();
    if (token) {
      config.headers = config.headers || {};
      config.headers.Authorization = `Bearer ${token}`;
    }
  }
  return config;
});

const originalFetch = window.fetch.bind(window);
window.fetch = async (input, init = {}) => {
  const url = typeof input === "string" ? input : input.url;
  if (isOurApi(url)) {
    const token = await getBearerToken();
    if (token) {
      init = {
        ...init,
        headers: { ...(init.headers || {}), Authorization: `Bearer ${token}` },
      };
    }
  }
  return originalFetch(input, init);
};