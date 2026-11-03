import { useEffect } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { Capacitor } from "@capacitor/core";
import { App as CapacitorApp } from "@capacitor/app";

// Pages where Back should leave the app rather than walk history (which would
// otherwise land a signed-in user back on the login screen).
const ROOT_PATHS = ["/login", "/admin/dashboard", "/customer/dashboard"];

const NativeBackButton = () => {
  const navigate = useNavigate();
  const { pathname } = useLocation();

  useEffect(() => {
    if (!Capacitor.isNativePlatform()) return undefined;
    const listenerPromise = CapacitorApp.addListener("backButton", ({ canGoBack }) => {
      // Lock and offline screens cover the app; Back must not navigate underneath them.
      if (document.querySelector(".mksv-app-lock")) {
        CapacitorApp.minimizeApp();
        return;
      }
      // Sidebar drawer open: Back closes it, via the navbar toggle that owns its state.
      if (document.documentElement.classList.contains("nav-open")) {
        document.querySelector(".navbar-toggle .navbar-toggler")?.click();
        return;
      }
      // An open reactstrap/Bootstrap modal closes on Escape; Back should do the same.
      const modal = document.querySelector(".modal.show");
      if (modal) {
        modal.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", keyCode: 27, bubbles: true }));
        return;
      }
      if (!canGoBack || ROOT_PATHS.includes(pathname)) {
        CapacitorApp.minimizeApp();
        return;
      }
      navigate(-1);
    });
    return () => {
      listenerPromise.then((l) => l.remove());
    };
  }, [navigate, pathname]);

  return null;
};

export default NativeBackButton;
