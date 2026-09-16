/**
 * Meksova System – API base URL and route definitions.
 * Use API_BASE_URL + ROUTES.* (or apiUrl helper) for all backend calls.
 *
 * Env is set at BUILD time (e.g. in GitHub Actions via .env from secrets).
 * No .env on S3 – values are baked into the JS bundle when you run npm run build.
 * Fallback: when env missing, derive from hostname so deployed app still works.
 */

function getEnv() {
  // Prefer hostname on known deployment hosts so login always uses the correct Cognito pool
  if (typeof window !== "undefined" && window.location?.hostname) {
    const h = window.location.hostname;
    if (h === "app.meksova.com") return "production";
    if (h === "staging.meksova.com") return "staging";
  }
  const raw = process.env.REACT_APP_ENV;
  if (raw) return String(raw).toLowerCase().trim();
  return process.env.NODE_ENV === "production" ? "production" : "staging";
}

const ENV = getEnv();
export { getEnv };
export const CURRENT_ENV = ENV; // "staging" | "production" for logging

/**
 * Stripe **monthly** subscription Price ID (UI + PayPal selection matching).
 * Uses {@link getEnv} (hostname: app.meksova.com → production, staging.meksova.com → staging).
 * Optional REACT_APP_STRIPE_PRICE_MONTHLY_* vars are baked in at build time (CI secrets).
 *
 * Yearly plans use a fixed placeholder in SubscriptionPlans unless you extend this.
 */
export function getStripeMonthlyPriceId() {
  const env = getEnv();
  if (env === "production") {
    console.log("process.env.REACT_APP_STRIPE_PRICE_MONTHLY_PRODUCTION");
    return (
      process.env.REACT_APP_STRIPE_PRICE_MONTHLY_PRODUCTION
    );
  }
  if (env === "staging") {
    console.log("process.env.REACT_APP_STRIPE_PRICE_MONTHLY_STAGING");
    return (
      process.env.REACT_APP_STRIPE_PRICE_MONTHLY_STAGING
    );
  }
  // return (
  //   process.env.REACT_APP_STRIPE_PRICE_MONTHLY_LOCAL ||
  //   process.env.REACT_APP_STRIPE_PRICE_MONTHLY_STAGING 
  // );
}

/** Cognito domain for current ENV (for OAuth userInfo URL). */
const COGNITO_DOMAIN =
  ENV === "production"
    ? (process.env.REACT_APP_PRODUCTION_COGNITO_DOMAIN || "us-east-1avaiojcoe.auth.us-east-1.amazoncognito.com")
    : (process.env.REACT_APP_STAGING_COGNITO_DOMAIN || "");
export const COGNITO_USERINFO_URL = COGNITO_DOMAIN
  ? `https://${COGNITO_DOMAIN}/oauth2/userInfo`
  : "";

export const API_BASE_URL =
  `https://iaqwrjhk4f.execute-api.us-east-1.amazonaws.com/${ENV}/MesobFinancialSystem`;

/** Staging / welcome-email (or other staging) API base URL. */
export const STAGING_API_URL =
  `https://axv5d700vg.execute-api.us-east-1.amazonaws.com/${ENV}`;

export const S3_BUCKET_NAME =
  ENV === "production" ? "app.meksova.com" : "staging.meksova.com";

/** Base URL for backups/CSV (production: app.meksova.com, staging: staging.meksova.com). */
export const BACKUP_BASE_URL = `https://${S3_BUCKET_NAME}`;

/**
 * Normalize S3 receipt URLs for browser preview/download.
 *
 * Virtual-hosted URLs like `https://staging.meksova.com.s3.amazonaws.com/key` use a
 * hostname whose SSL certificate does not match buckets that contain **dots** in the name
 * (`ERR_CERT_COMMON_NAME_INVALID`). Convert those to **path-style**:
 * `https://s3.amazonaws.com/staging.meksova.com/key` (cert matches `s3.amazonaws.com`).
 *
 * Buckets without dots keep the original URL (virtual-hosted works with default S3 certs).
 *
 * @param {string} rawUrl - Receipt URL
 * @returns {string} Same URL, or path-style when needed
 */
// export function normalizeReceiptUrl(rawUrl) {
//   if (!rawUrl || typeof rawUrl !== "string") return rawUrl;
//   const trimmed = rawUrl.trim();

//   let base = trimmed;
//   let suffix = "";
//   const q = trimmed.indexOf("?");
//   const h = trimmed.indexOf("#");
//   if (q >= 0) {
//     base = trimmed.slice(0, q);
//     suffix = trimmed.slice(q);
//   } else if (h >= 0) {
//     base = trimmed.slice(0, h);
//     suffix = trimmed.slice(h);
//   }

//   // Virtual-hosted: https://bucket.s3.amazonaws.com/key
//   // Regional:       https://bucket.s3.us-east-1.amazonaws.com/key
//   const vh = base.match(
//     /^https?:\/\/([^/]+)\.s3(?:\.([^.]+))?\.amazonaws\.com\/(.+)$/i
//   );
//   if (vh) {
//     const bucket = vh[1];
//     const region = vh[2];
//     const key = vh[3];
//     if (bucket.includes(".")) {
//       if (region) {
//         return `https://s3.${region}.amazonaws.com/${bucket}/${key}${suffix}`;
//       }
//       // Legacy global endpoint (common for us-east-1)
//       return `https://s3.amazonaws.com/${bucket}/${key}${suffix}`;
//     }
//   }

//   return trimmed;
// }
export function normalizeReceiptUrl(rawUrl) {
  if (!rawUrl || typeof rawUrl !== "string") return rawUrl;
  const trimmed = rawUrl.trim();

  const vh = trimmed.match(
    /^https?:\/\/([^/]+)\.s3(?:\.([\w-]+))?\.amazonaws\.com\/(.+)$/i
  );

  if (vh) {
    const bucket = vh[1];
    const region = vh[2] || "us-east-1"; // default region
    const key = vh[3];

    if (bucket.includes(".")) {
      // Use REGIONAL path-style — avoids dot-bucket SSL cert issues
      // and works with modern AWS (unlike the deprecated global s3.amazonaws.com)
      return `https://s3.${region}.amazonaws.com/${bucket}/${key}`;
    }
  }

  return trimmed;
}

/** Route path segments (no leading slash; append to API_BASE_URL). */
export const ROUTES = {
  USERS: "Users",
   MILEAGE_TRIP: "MileageTrip",
     /** IFTA fuel-purchase log (state, gallons). Not yet implemented on the
   * backend -- see CLAUDE.md IFTA notes. */
  FUEL_PURCHASE: "FuelPurchase",
  USERS: "Users",
  TRANSACTION: "Transaction",
  RECEIPT: "Receipt",
  BACKUP: "backup",
  SUBSCRIPTION: "Subscription",
  /** PayPal subscription cancel / lifecycle (API Gateway resource name). */
  PAYPAL_SUBSCRIPTION: "PaypalSubscription",
  /** Stripe Billing Portal session (update card / Apple Pay / Google Pay, etc.). */
  CREATE_PORTAL_SESSION: "Subscription/PortalSession",
  PRICE: "price",
  EXISTING_USER_CHECK: "existingusercheck",
  CREATE_EVENT: "createevent",
  SIGNIN: "Signin",
  SIGN_UP: "SignUp",
  /**
   * Documents (S3). Upload uses POST; delete uses POST + JSON body
   * `{ action: "deleteDocument", userId, key }` so localhost works without API Gateway allowing DELETE in CORS.
   */
  DOCUMENT: "Document",
  /** Must match Documents.js delete payload (Lambda POST branch). */
  DOCUMENT_DELETE_ACTION: "deleteDocument",
};

/**
 * Build full API URL from a path (path can include query string).
 * @param {string} path - Path segment, e.g. ROUTES.USERS or `${ROUTES.USERS}/${id}`
 * @returns {string} Full URL
 */
export const apiUrl = (path) =>
  `${API_BASE_URL}/${path.replace(/^\//, "")}`;
