import { fetchAuthSession } from "aws-amplify/auth";

// Returns { Authorization: <raw Cognito ID token> } for our API Gateway calls,
// or {} when the user is not signed in. API Gateway REST Cognito authorizers
// parse the Authorization value as the raw JWT (NO "Bearer " prefix). This
// mirrors the axios request interceptor in index.js for the handful of backend
// calls that use fetch() instead of axios (which the interceptor never sees).
// Spread the result into a fetch's headers ONLY for our execute-api endpoints —
// never send it to S3 presigned URLs or any third-party host.
export const authHeader = async () => {
  try {
    const { tokens } = await fetchAuthSession();
    const idToken = tokens?.idToken?.toString();
    return idToken ? { Authorization: idToken } : {};
  } catch (e) {
    // Not signed in yet (or session refresh failed) — send the request as-is.
    return {};
  }
};
