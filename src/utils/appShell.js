import { Capacitor } from "@capacitor/core";

// True inside the Android/iOS app. In local development the app chrome can be
// previewed in a browser with: localStorage.setItem("mksv-app-shell-preview", "1")
export const isAppShell = () => {
  if (Capacitor.isNativePlatform()) return true;
  if (process.env.NODE_ENV !== "development") return false;
  try {
    return localStorage.getItem("mksv-app-shell-preview") === "1";
  } catch (e) {
    return false;
  }
};

export const isSignedIn = () => {
  try {
    return !!localStorage.getItem("user_email");
  } catch (e) {
    return false;
  }
};
