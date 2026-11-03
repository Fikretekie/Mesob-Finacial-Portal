// The stop a "Scan your receipt" notification was about. For fuel the scan
// screen files the receipt under the stop's state and date (IFTA counts the
// state the fuel was bought in, not wherever the user happens to scan it later).
// kind: "fuel" | "store" | "repair" (repairs are filed as maintenance).
const KEY = "mksv-fuel-stop";
const MAX_AGE_MS = 12 * 60 * 60 * 1000;

export function saveFuelStop(stop) {
  try {
    sessionStorage.setItem(KEY, JSON.stringify(stop));
  } catch (e) {
    // Storage blocked — the scan falls back to the current location.
  }
}

export function readFuelStop() {
  try {
    const stop = JSON.parse(sessionStorage.getItem(KEY) || "null");
    return stop && Date.now() - stop.at < MAX_AGE_MS ? stop : null;
  } catch (e) {
    return null;
  }
}

export function clearFuelStop() {
  try {
    sessionStorage.removeItem(KEY);
  } catch (e) {
    // Nothing to clear.
  }
}

/** The account's maintenance/repair category, if its business type has one. */
export function repairCategory(businessType, expenseOptions) {
  if (businessType === "Trucking") return "Truck Repairs and Maintenance";
  return expenseOptions.find((c) => /repair|mainten/i.test(c)) || "";
}

/** The account's fuel category: "Fuel Expense" for trucking, else a gas/fuel one if the type has it. */
export function fuelCategory(businessType, expenseOptions) {
  if (businessType === "Trucking") return "Fuel Expense";
  return expenseOptions.find((c) => /fuel|gas/i.test(c)) || "";
}
