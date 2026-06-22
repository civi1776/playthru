// ─── Geo / Distance Math ──────────────────────────────────────────────────────
// Haversine formula utilities for GPS distance and bearing calculations.
// All functions use the WGS-84 mean Earth radius (6371000 m).
// Invalid or missing inputs return null rather than throwing.

const EARTH_RADIUS_M  = 6371000;       // WGS-84 mean Earth radius in meters
const YARDS_PER_METER = 1.0936133;     // exact conversion factor

/** @param {number} deg - degrees */
function toRad(deg) {
  return (deg * Math.PI) / 180;
}

/**
 * Returns true if every argument is a finite number (not null, undefined, NaN, ±Infinity).
 * @param {...*} values
 */
function allValid(...values) {
  return values.every(v => typeof v === 'number' && isFinite(v));
}

/**
 * haversineMeters
 *
 * Calculates the great-circle distance in meters between two GPS coordinates
 * using the Haversine formula.
 *
 * @param {number} lat1 - Latitude of point 1 in decimal degrees
 * @param {number} lng1 - Longitude of point 1 in decimal degrees
 * @param {number} lat2 - Latitude of point 2 in decimal degrees
 * @param {number} lng2 - Longitude of point 2 in decimal degrees
 * @returns {number|null} Distance in whole meters, or null if any input is invalid
 */
export function haversineMeters(lat1, lng1, lat2, lng2) {
  if (!allValid(lat1, lng1, lat2, lng2)) return null;

  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);

  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) *
    Math.sin(dLng / 2) * Math.sin(dLng / 2);

  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));

  return Math.round(EARTH_RADIUS_M * c);
}

/**
 * haversineYards
 *
 * Calculates the great-circle distance in yards between two GPS coordinates
 * using the Haversine formula. Useful for golf rangefinder distances.
 *
 * @param {number} lat1 - Latitude of point 1 in decimal degrees
 * @param {number} lng1 - Longitude of point 1 in decimal degrees
 * @param {number} lat2 - Latitude of point 2 in decimal degrees
 * @param {number} lng2 - Longitude of point 2 in decimal degrees
 * @returns {number|null} Distance in whole yards, or null if any input is invalid
 */
export function haversineYards(lat1, lng1, lat2, lng2) {
  const meters = haversineMeters(lat1, lng1, lat2, lng2);
  if (meters === null) return null;
  return Math.round(meters * YARDS_PER_METER);
}

/**
 * bearingDegrees
 *
 * Calculates the initial compass bearing from point 1 to point 2.
 * Returns a value in the range [0, 360) where 0 = North, 90 = East,
 * 180 = South, 270 = West.
 *
 * @param {number} lat1 - Latitude of origin point in decimal degrees
 * @param {number} lng1 - Longitude of origin point in decimal degrees
 * @param {number} lat2 - Latitude of destination point in decimal degrees
 * @param {number} lng2 - Longitude of destination point in decimal degrees
 * @returns {number|null} Bearing in degrees (0–360), or null if any input is invalid
 */
export function bearingDegrees(lat1, lng1, lat2, lng2) {
  if (!allValid(lat1, lng1, lat2, lng2)) return null;

  const φ1 = toRad(lat1);
  const φ2 = toRad(lat2);
  const Δλ = toRad(lng2 - lng1);

  const x = Math.sin(Δλ) * Math.cos(φ2);
  const y = Math.cos(φ1) * Math.sin(φ2) - Math.sin(φ1) * Math.cos(φ2) * Math.cos(Δλ);

  const θ = Math.atan2(x, y);

  // Convert from radians to degrees and normalise to [0, 360)
  return (θ * 180 / Math.PI + 360) % 360;
}

/*
 * ─── Commented-out test block ────────────────────────────────────────────────
 * Known reference: TPC Sawgrass clubhouse (~30.1976, -81.3953) to
 * the island green on hole 17 (~30.1963, -81.3942).
 *
 * Expected results (approximate):
 *   haversineMeters(30.1976, -81.3953, 30.1963, -81.3942)  → ~173 m
 *   haversineYards( 30.1976, -81.3953, 30.1963, -81.3942)  → ~189 y
 *   bearingDegrees( 30.1976, -81.3953, 30.1963, -81.3942)  → ~144° (SE)
 *
 * Null-input guard:
 *   haversineYards(null, -81.3953, 30.1963, -81.3942)       → null
 *   haversineYards(NaN,  -81.3953, 30.1963, -81.3942)       → null
 *   bearingDegrees(30.1976, undefined, 30.1963, -81.3942)   → null
 */
