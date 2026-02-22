/**
 * @file src/db/geo.js
 * @description Geolocation helper functions for SQLite.
 */

/**
 * Calculates the Haversine distance between two points in kilometers.
 * @param {number} lat1 Latitude of point 1 (decimal degrees)
 * @param {number} lon1 Longitude of point 1 (decimal degrees)
 * @param {number} lat2 Latitude of point 2 (decimal degrees)
 * @param {number} lon2 Longitude of point 2 (decimal degrees)
 * @returns {number} Distance in kilometers
 */
export function haversineDistance(lat1, lon1, lat2, lon2) {
  const R = 6371; // Earth's radius in km
  const toRad = (val) => (val * Math.PI) / 180;

  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a = Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) * Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

/**
 * SQL compatible function to check if a point is within a radius range.
 * Note: Input coordinates from DB are integers (Real * 10,000,000).
 *
 * @param {number} latCiprnode Latitude from DB (Integer)
 * @param {number} lonCiprnode Longitude from DB (Integer)
 * @param {number} targetLat Latitude target (Real or Integer depending on usage, let's assume Real for query param)
 * @param {number} targetLon Longitude target (Real)
 * @param {number} minRadius Min radius in km
 * @param {number} maxRadius Max radius in km
 * @returns {number} 1 if within range, 0 otherwise
 */
export function isWithinRadius(
  latCiprnode,
  lonCiprnode,
  targetLat,
  targetLon,
  minRadius,
  maxRadius,
) {
  if (latCiprnode == null || lonCiprnode == null) return 0;

  // Convert DB Integer to Real
  const realLat = latCiprnode / 10000000;
  const realLon = lonCiprnode / 10000000;

  const distance = haversineDistance(realLat, realLon, targetLat, targetLon);

  if (minRadius >= 0 && distance < minRadius) return 0;
  if (maxRadius >= 0 && distance > maxRadius) return 0;

  return 1;
}
