import axios from "axios";
import { apiUrl, ROUTES } from "config/api";
import { getCurrentBusinessId } from "utils/businessStorage";

function currentUserId() {
  return localStorage.getItem("userId") || "anonymous";
}

// The backend has no way to delete or edit a trip, so a removal is a 0-mile entry
// that cancels the original: the record stays, and every screen leaves both out.
const VOID_PREFIX = "void:";
const isVoidEntry = (trip) => Number(trip.miles) === 0 && String(trip.note || "").startsWith(VOID_PREFIX);

/** Drops void entries and the trips they cancel. */
export function applyVoids(trips) {
  const voided = new Set(trips.filter(isVoidEntry).map((t) => String(t.note).slice(VOID_PREFIX.length)));
  return trips.filter((t) => !isVoidEntry(t) && !voided.has(String(t.tripId)));
}

/** Fetches all trips for the current user + active business from the backend. */
export async function fetchTrips() {
  const userId = currentUserId();
  const businessId = getCurrentBusinessId();
  const params = businessId ? { userId, businessId } : { userId };
  const res = await axios.get(apiUrl(ROUTES.MILEAGE_TRIP), { params });
  return Array.isArray(res.data) ? applyVoids(res.data) : [];
}

let cache = null;

/** fetchTrips, shared for a few seconds so screens opening together make one request. */
export function fetchTripsShared(maxAgeMs = 15000) {
  if (!cache || Date.now() - cache.at > maxAgeMs) {
    cache = { at: Date.now(), promise: fetchTrips() };
    cache.promise.catch(() => {
      cache = null;
    });
  }
  return cache.promise;
}

/** Saves one trip to the backend, tagged with the active business.
 * Returns the saved trip (with its tripId). */
export async function saveTrip(trip) {
  const userId = currentUserId();
  const businessId = getCurrentBusinessId();
  const taggedTrip = businessId ? { ...trip, businessId } : trip;
  const res = await axios.post(apiUrl(ROUTES.MILEAGE_TRIP), { userId, trip: taggedTrip });
  cache = null;
  return res.data;
}

/** Takes a saved trip out of every total. */
export async function removeTrip(trip) {
  await saveTrip({
    dateKey: trip.dateKey,
    date: trip.date,
    time: trip.time,
    miles: 0,
    durationSeconds: 0,
    type: "personal",
    purpose: "Removed",
    note: `${VOID_PREFIX}${trip.tripId}`,
    stateBreakdown: [],
  });
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