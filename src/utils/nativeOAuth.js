import { Capacitor } from "@capacitor/core";
import { Browser } from "@capacitor/browser";
import { getEnv } from "config/api";

export const NATIVE_OAUTH_REDIRECT_URI = "meksovaauth://oauth-redirect";

const NATIVE_VERIFIER_KEY = "nativeOAuthCodeVerifier";
const NATIVE_PROVIDER_KEY = "nativeOAuthProvider";

const SESSION_ID_TOKEN_KEY = "nativeSessionIdToken";
const SESSION_ACCESS_TOKEN_KEY = "nativeSessionAccessToken";
const SESSION_REFRESH_TOKEN_KEY = "nativeSessionRefreshToken";
const SESSION_EXPIRES_AT_KEY = "nativeSessionExpiresAt";
export const isNativeApp = () => Capacitor.isNativePlatform();

export const nativeOAuthState = { pending: false };

const getCognitoConfig = () => {
  const isProduction = getEnv() === "production";
  return {
    cognitoDomain: isProduction
      ? process.env.REACT_APP_PRODUCTION_COGNITO_DOMAIN
      : process.env.REACT_APP_STAGING_COGNITO_DOMAIN,
    cognitoClientId: isProduction
      ? process.env.REACT_APP_PRODUCTION_COGNITO_CLIENT_ID
      : process.env.REACT_APP_STAGING_COGNITO_CLIENT_ID,
    scopes: isProduction ? "openid email profile" : "openid email",
  };
};

const base64UrlEncode = (bytes) => {
  let binary = "";
  for (let i = 0; i < bytes.byteLength; i++) binary += String.fromCharCode(bytes[i]);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
};

const generateCodeVerifier = () => {
  const random = new Uint8Array(32);
  crypto.getRandomValues(random);
  return base64UrlEncode(random);
};

const generateCodeChallenge = async (verifier) => {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(verifier));
  return base64UrlEncode(new Uint8Array(digest));
};

export const openNativeSocialSignIn = async (provider) => {
  const { cognitoDomain, cognitoClientId, scopes } = getCognitoConfig();
  const codeVerifier = generateCodeVerifier();
  const codeChallenge = await generateCodeChallenge(codeVerifier);

   localStorage.setItem(NATIVE_VERIFIER_KEY, codeVerifier);
  localStorage.setItem(NATIVE_PROVIDER_KEY, provider);
  nativeOAuthState.pending = true;

  const authorizeUrl =
    `https://${cognitoDomain}/oauth2/authorize` +
    `?identity_provider=${encodeURIComponent(provider)}` +
    `&redirect_uri=${encodeURIComponent(NATIVE_OAUTH_REDIRECT_URI)}` +
    `&response_type=code` +
    `&client_id=${cognitoClientId}` +
    `&scope=${encodeURIComponent(scopes)}` +
    `&code_challenge=${codeChallenge}` +
    `&code_challenge_method=S256` +
    `&state=${encodeURIComponent(provider)}`;

  await Browser.open({ url: authorizeUrl });
};

const storeNativeSession = (tokens) => {
  localStorage.setItem(SESSION_ID_TOKEN_KEY, tokens.id_token);
  localStorage.setItem(SESSION_ACCESS_TOKEN_KEY, tokens.access_token);
  if (tokens.refresh_token) localStorage.setItem(SESSION_REFRESH_TOKEN_KEY, tokens.refresh_token);
  localStorage.setItem(SESSION_EXPIRES_AT_KEY, String(Date.now() + tokens.expires_in * 1000));
};

export const exchangeNativeAuthCode = async (code) => {
  const { cognitoDomain, cognitoClientId } = getCognitoConfig();
  const codeVerifier = localStorage.getItem(NATIVE_VERIFIER_KEY);

  const body = new URLSearchParams({
    grant_type: "authorization_code",
    client_id: cognitoClientId,
    code,
    redirect_uri: NATIVE_OAUTH_REDIRECT_URI,
    code_verifier: codeVerifier || "",
  });

  const res = await fetch(`https://${cognitoDomain}/oauth2/token`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: body.toString(),
  });
  if (!res.ok) throw new Error(`Token exchange failed: ${res.status}`);
  const tokens = await res.json();
  storeNativeSession(tokens);

  localStorage.removeItem(NATIVE_VERIFIER_KEY);

  const payload = JSON.parse(atob(tokens.id_token.split(".")[1]));
  return payload;
};

const refreshNativeSession = async () => {
  const refreshToken = localStorage.getItem(SESSION_REFRESH_TOKEN_KEY);
  if (!refreshToken) return null;

  const { cognitoDomain, cognitoClientId } = getCognitoConfig();
  const body = new URLSearchParams({
    grant_type: "refresh_token",
    client_id: cognitoClientId,
    refresh_token: refreshToken,
  });

  const res = await fetch(`https://${cognitoDomain}/oauth2/token`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: body.toString(),
  });
  if (!res.ok) return null;
  const tokens = await res.json();
  if (!tokens.refresh_token) tokens.refresh_token = refreshToken;
  storeNativeSession(tokens);
  return tokens.id_token;
};

export const getNativeIdToken = async () => {
  const idToken = localStorage.getItem(SESSION_ID_TOKEN_KEY);
  if (!idToken) return null;

  const expiresAt = Number(localStorage.getItem(SESSION_EXPIRES_AT_KEY) || 0);
  if (Date.now() < expiresAt - 60000) return idToken;

  return refreshNativeSession();
};

export const clearNativeSession = () => {
  [SESSION_ID_TOKEN_KEY, SESSION_ACCESS_TOKEN_KEY, SESSION_REFRESH_TOKEN_KEY, SESSION_EXPIRES_AT_KEY].forEach(
    (key) => localStorage.removeItem(key)
  );
};

export const getStoredNativeProvider = () => localStorage.getItem(NATIVE_PROVIDER_KEY) || "";