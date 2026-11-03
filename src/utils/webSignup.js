import { Browser } from "@capacitor/browser";
import { BACKUP_BASE_URL } from "config/api";

// Store rule (Google Play + App Store): the phone app sells nothing. Accounts
// are created — and plans paid for — on the website, so the app only ever
// opens the website's sign-up page, in the system browser.
export function webSignupUrl(email) {
  const url = new URL("/signup", BACKUP_BASE_URL);
  if (email) url.searchParams.set("email", email);
  return url.toString();
}

export function openWebSignup(email) {
  return Browser.open({ url: webSignupUrl(email) });
}
