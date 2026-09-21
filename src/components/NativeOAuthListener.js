import { useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { App as CapacitorApp } from "@capacitor/app";
import { Browser } from "@capacitor/browser";
import {
  isNativeApp,
  exchangeNativeAuthCode,
  getStoredNativeProvider,
  NATIVE_OAUTH_REDIRECT_URI,
  nativeOAuthState,
} from "../utils/nativeOAuth";
import { completeOAuthSignIn } from "../utils/postOAuthComplete";

const NativeOAuthListener = () => {
  const navigate = useNavigate();

  useEffect(() => {
    if (!isNativeApp()) return undefined;

     const listenerPromise = CapacitorApp.addListener("appUrlOpen", async ({ url }) => {
      if (!url || !url.startsWith(NATIVE_OAUTH_REDIRECT_URI)) return;
      nativeOAuthState.pending = false;

      try {
        await Browser.close();
      } catch (e) {
        // Already closed -- fine.
      }

      try {
        const params = new URL(url).searchParams;
        const error = params.get("error");
        if (error) {
          navigate("/login", {
            state: { error: "oauth_failed", message: params.get("error_description") || error },
            replace: true,
          });
          return;
        }

        const code = params.get("code");
        if (!code) return;

        const provider = getStoredNativeProvider();
        const payload = await exchangeNativeAuthCode(code);

        await completeOAuthSignIn({
          email: payload.email,
          name: payload.name || payload.given_name || "",
          provider,
          userId: payload.sub,
          navigate,
        });
      } catch (err) {
        console.error("Native OAuth completion error:", err);
        navigate("/login", {
          state: { error: "auth_failed", message: err.message || "Sign-in failed" },
          replace: true,
        });
      }
    });

    return () => {
      listenerPromise.then((handle) => handle.remove());
    };
  }, [navigate]);

  return null;
};

export default NativeOAuthListener;