import { Capacitor } from "@capacitor/core";
import { Haptics, ImpactStyle } from "@capacitor/haptics";

// Small physical confirmations on key actions. No-op on the website.
// kind: "selection" (tab change, threshold crossed) | "light" | "medium" | "success"
export function haptic(kind = "light") {
  if (!Capacitor.isNativePlatform()) return;
  let p;
  if (kind === "selection") p = Haptics.selectionChanged();
  else if (kind === "success") p = Haptics.notification({ type: "SUCCESS" });
  else p = Haptics.impact({ style: kind === "medium" ? ImpactStyle.Medium : ImpactStyle.Light });
  p?.catch?.(() => {});
}
