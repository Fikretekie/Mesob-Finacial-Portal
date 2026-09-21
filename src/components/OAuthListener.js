import { useEffect } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { COGNITO_USERINFO_URL, CURRENT_ENV } from "../config/api";
import { getCurrentUser, fetchAuthSession } from "aws-amplify/auth";
import { Hub } from "aws-amplify/utils";
import { completeOAuthSignIn } from "../utils/postOAuthComplete";

const OAuthListener = () => {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();

  const fetchUserInfoFromOAuth = async () => {
    try {
      const session = await fetchAuthSession();
      const accessToken = session.tokens?.accessToken?.toString();
      if (!accessToken) throw new Error("No access token available");

      const url = COGNITO_USERINFO_URL || "https://us-east-1avaiojcoe.auth.us-east-1.amazoncognito.com/oauth2/userInfo";
      const response = await fetch(url, {
        headers: {
          Authorization: `Bearer ${accessToken}`,
        },
      });
      if (!response.ok)
        throw new Error(`UserInfo request failed: ${response.status}`);
      const userInfo = await response.json();
      console.log("🔍 User info from /oauth2/userInfo:", userInfo);
      return userInfo;
    } catch (error) {
      console.error("❌ Failed to fetch user info from OAuth endpoint:", error);
      throw error;
    }
  };

  useEffect(() => {
    const handleOAuthFlow = async () => {
      try {
        console.log("🔵 OAuthListener started...");
        console.log("🔵 Full URL:", window.location.href);

        const error = searchParams.get("error");
        const errorDescription = searchParams.get("error_description");
        if (error) {
          console.error("🔴 OAuth error:", error, errorDescription);
          navigate("/login", {
            state: {
              error: "oauth_failed",
              message: errorDescription || "OAuth error",
            },
            replace: true,
          });
          return;
        }

        console.log("🟢 Listening for sign-in...");

        const stopListening = Hub.listen("auth", async ({ payload }) => {
          console.log("🟡 Auth Event:", payload);

          if (payload.event === "signedIn") {
            console.log(`✅ Cognito sign-in (OAuth) [env: ${CURRENT_ENV}], fetching user...`);

            try {
              const user = await getCurrentUser();

              let provider = localStorage.getItem("provider");

              if (user.username && user.username.startsWith("apple_")) {
                provider = "Apple";
              } else if (user.username && user.username.startsWith("google_")) {
                provider = "Google";
              }
              console.log("✅ User:", user);

              let email = null;
              let userName = null;

              if (
                user.signInDetails?.loginId &&
                user.signInDetails.loginId.includes("@")
              ) {
                email = user.signInDetails.loginId;
                console.log("📧 Email from signInDetails:", email);
              }

              if (!email) {
                console.log(
                  "🔍 Fetching user info from OAuth userInfo endpoint..."
                );
                try {
                  const userInfo = await fetchUserInfoFromOAuth();
                  email = userInfo.email;
                  userName = userInfo.name || userInfo.given_name || "";
                  console.log("📧 Email from OAuth userInfo:", email);
                  console.log("👤 Name from OAuth userInfo:", userName);
                } catch (userInfoError) {
                  console.error(
                    "❌ Could not fetch from OAuth userInfo:",
                    userInfoError
                  );
                  navigate(`/signup?provider=${provider}&needsEmail=true`, {
                    replace: true,
                  });
                  return;
                }
              }

              console.log("📧 Final email:", email);

              await completeOAuthSignIn({
                email,
                name: userName,
                provider,
                userId: user.userId,
                navigate,
              });
            } catch (err) {
              console.error("🔴 Sign-in processing error:", err);
              navigate("/login", {
                state: {
                  error: "auth_failed",
                  message: err.message || "Authentication failed",
                },
                replace: true,
              });
            } finally {
              stopListening();
            }
          }
        });
      } catch (error) {
        console.error("🔴 OAuth flow error:", error);
        navigate("/login", {
          state: {
            error: "oauth_failed",
            message: error.message || "OAuth flow failed",
          },
          replace: true,
        });
      }
    };

    handleOAuthFlow();
  }, [navigate, searchParams]);

  return (
    <div
      style={{
        display: "flex",
        justifyContent: "center",
        alignItems: "center",
        height: "100vh",
      }}
    >
      <div>Processing sign-in...</div>
    </div>
  );
};

export default OAuthListener;