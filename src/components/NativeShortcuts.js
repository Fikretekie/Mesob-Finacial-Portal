import { useEffect, useRef } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { Capacitor } from "@capacitor/core";
import { App as CapacitorApp } from "@capacitor/app";
import { LocalNotifications } from "@capacitor/local-notifications";
import { saveFuelStop } from "utils/fuelStop";
import { SCAN_REQUEST } from "components/AppTabBar";

const PREFIX = "meksova://action/";

// Fuel / store notifications carry where/when the stop was; the scan screen
// uses it for the IFTA state and date, and the category (utils/fuelStop.js).
function rememberFuelStop(query, kind) {
  const q = new URLSearchParams(query);
  const stop = {
    kind: q.get("kind") || kind,
    lat: Number(q.get("lat")),
    lng: Number(q.get("lng")),
    at: Number(q.get("at")),
    station: q.get("station") || "",
  };
  if (Number.isFinite(stop.lat) && Number.isFinite(stop.lng) && stop.at) saveFuelStop(stop);
  return stop;
}

// App-icon long-press shortcuts (android/app/src/main/res/xml/shortcuts.xml)
// and notification taps (drive detection, deadline reminders).
// A shortcut can arrive before the user is through session restore / login,
// so it is held until the app is on a signed-in /customer page.
const NativeShortcuts = () => {
  const navigate = useNavigate();
  const { pathname } = useLocation();
  const pending = useRef(null);

  useEffect(() => {
    if (!Capacitor.isNativePlatform()) return undefined;
    const take = (url) => {
      if (url && url.startsWith(PREFIX)) pending.current = url.slice(PREFIX.length);
    };
    CapacitorApp.getLaunchUrl().then((r) => take(r?.url)).catch(() => {});
    const listener = CapacitorApp.addListener("appUrlOpen", ({ url }) => {
      take(url);
      // Already inside the app: act now instead of waiting for a route change.
      if (window.location.pathname.startsWith("/customer")) run();
    });
    // Deadline reminders carry the page to open (utils/taxReminders.js).
    const reminder = LocalNotifications.addListener("localNotificationActionPerformed", ({ notification }) => {
      const route = notification?.extra?.route;
      if (typeof route === "string" && route.startsWith("/customer/")) take(PREFIX + "go" + route);
      if (window.location.pathname.startsWith("/customer")) run();
    });
    return () => {
      listener.then((l) => l.remove());
      reminder.then((l) => l.remove());
    };
    // eslint-disable-next-line
  }, []);

  const run = () => {
    const action = pending.current;
    if (!action) return;
    pending.current = null;
    if (action === "trip") {
      navigate("/customer/mileage-tracker");
    } else if (action === "trip-start") {
      navigate("/customer/mileage-tracker", { state: { autoStart: true } });
    } else if (action === "drives") {
      navigate("/customer/drives");
    } else if (action.startsWith("go/customer/")) {
      navigate(action.slice(2));
    } else if (action === "add") {
      navigate("/customer/financial-report", { state: { openTransactionModal: true } });
    } else if (action === "scan" || action.startsWith("fuel") || action.startsWith("store?")) {
      const stop = action.startsWith("fuel?")
        ? rememberFuelStop(action.slice(5), "fuel")
        : action.startsWith("store?")
          ? rememberFuelStop(action.slice(6), "store")
          : null;
      navigate("/customer/dashboard");
      // mode: "camera" / "upload" from a notification button (the app icon's
      // Scan shortcut is the camera too); none = the tab bar's choice sheet.
      const query = action.includes("?") ? new URLSearchParams(action.slice(action.indexOf("?") + 1)) : null;
      const mode = action === "scan" ? "camera" : query?.get("mode") || undefined;
      const base = stop ? { station: stop.station, kind: stop.kind } : action.startsWith("fuel") ? { station: "", kind: "fuel" } : {};
      const detail = { ...base, mode };
      setTimeout(() => window.dispatchEvent(new CustomEvent(SCAN_REQUEST, { detail })), 300);
    }
  };

  useEffect(() => {
    if (pathname.startsWith("/customer")) run();
    // eslint-disable-next-line
  }, [pathname]);

  return null;
};

export default NativeShortcuts;
