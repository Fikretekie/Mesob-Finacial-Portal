const CACHE = new Map();

async function loadBoundaries() {
  if (!CACHE.has("data")) {
    const mod = await import("assets/data/usStateBoundaries.json");
    CACHE.set("data", mod.default || mod);
  }
  return CACHE.get("data");
}

function pointInRing(lat, lng, ring) {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [xi, yi] = ring[i];
    const [xj, yj] = ring[j];
    const intersects =
      yi > lat !== yj > lat &&
      lng < ((xj - xi) * (lat - yi)) / (yj - yi) + xi;
    if (intersects) inside = !inside;
  }
  return inside;
}

function pointInPolygon(lat, lng, polygon) {
  if (!pointInRing(lat, lng, polygon[0])) return false;
  for (let i = 1; i < polygon.length; i++) {
    if (pointInRing(lat, lng, polygon[i])) return false;
  }
  return true;
}

/** Returns the USPS abbreviation of the US state containing (lat, lng),
 * or null if the point isn't in any state (e.g. over water, or off the
 * bundled state boundary data). */
export async function getStateAtPoint(lat, lng) {
  const states = await loadBoundaries();
  for (const { abbr, polygons } of states) {
    for (const polygon of polygons) {
      if (pointInPolygon(lat, lng, polygon)) return abbr;
    }
  }
  return null;
}