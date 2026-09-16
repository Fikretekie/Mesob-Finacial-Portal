import axios from "axios";
import { apiUrl, ROUTES } from "config/api";

function currentUserId() {
  return localStorage.getItem("userId") || "anonymous";
}

/** Fetches all trips for the current user from the backend. */
export async function fetchTrips() {
  const userId = currentUserId();
  const res = await axios.get(apiUrl(ROUTES.MILEAGE_TRIP), { params: { userId } });
  return Array.isArray(res.data) ? res.data : [];
}

/** Saves one trip to the backend. Returns the saved trip (with its tripId). */
export async function saveTrip(trip) {
  const userId = currentUserId();
  const res = await axios.post(apiUrl(ROUTES.MILEAGE_TRIP), { userId, trip });
  return res.data;
}

/** Trips for one calendar day (dateKey format: YYYY-MM-DD), from an already-fetched list. */
export function getTripsForDay(trips, dateKey) {
  return trips.filter((t) => t.dateKey === dateKey);
}

/** Summary stats for a given month (monthKey format: YYYY-MM), from an already-fetched list. */
export function getMonthSummary(trips, monthKey) {
  const monthTrips = trips.filter((t) => t.dateKey.startsWith(monthKey));
  const businessMiles = monthTrips
    .filter((t) => t.type === "business")
    .reduce((sum, t) => sum + t.miles, 0);
  const personalMiles = monthTrips
    .filter((t) => t.type === "personal")
    .reduce((sum, t) => sum + t.miles, 0);
  return { businessMiles, personalMiles, tripCount: monthTrips.length };
}

export function getYearBusinessMiles(trips, year) {
  return trips
    .filter((t) => t.dateKey.startsWith(String(year)) && t.type === "business")
    .reduce((sum, t) => sum + t.miles, 0);
}

/** Trips within a given quarter (year + quarter 1-4), from an
 * already-fetched list. dateKey format: YYYY-MM-DD. */
export function getTripsForQuarter(trips, year, quarter) {
  const startMonth = (quarter - 1) * 3 + 1;
  const endMonth = startMonth + 2;
  return trips.filter((t) => {
    const [y, m] = t.dateKey.split("-").map(Number);
    return y === year && m >= startMonth && m <= endMonth;
  });
}

/** Total miles per state across a set of trips, from each trip's
 * stateBreakdown (trips without one -- e.g. saved before this feature
 * existed, or web fallback with no GPS state detection -- are skipped). */
export function getMilesByState(trips) {
  const totals = {};
  for (const trip of trips) {
    if (!Array.isArray(trip.stateBreakdown)) continue;
    for (const { state, miles } of trip.stateBreakdown) {
      totals[state] = (totals[state] || 0) + miles;
    }
  }
  return totals;
}