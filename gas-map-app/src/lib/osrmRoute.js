/**
 * Driving route via public OSRM demo server (OpenStreetMap routing).
 * @see https://project-osrm.org/
 * Coordinates: lat/lng in; OSRM URL uses lng,lat pairs.
 */

const OSRM_BASE = 'https://router.project-osrm.org/route/v1/driving';

function isValidCoord(lat, lng) {
  return (
    Number.isFinite(Number(lat)) &&
    Number.isFinite(Number(lng)) &&
    Math.abs(Number(lat)) <= 90 &&
    Math.abs(Number(lng)) <= 180
  );
}

/**
 * @param {{ lat: number, lng: number }} from
 * @param {{ lat: number, lng: number }} to
 * @returns {Promise<{ positions: [number, number][], distanceM: number, durationS: number } | null>}
 */
export async function fetchDrivingRoute(from, to) {
  if (!isValidCoord(from.lat, from.lng) || !isValidCoord(to.lat, to.lng)) return null;
  const a = `${Number(to.lng)},${Number(to.lat)}`;
  const b = `${Number(from.lng)},${Number(from.lat)}`;
  const url = `${OSRM_BASE}/${b};${a}?overview=full&geometries=geojson`;
  try {
    const res = await fetch(url);
    if (!res.ok) return null;
    const data = await res.json();
    if (data.code !== 'Ok' || !data.routes?.[0]?.geometry?.coordinates) return null;
    const coords = data.routes[0].geometry.coordinates;
    const positions = coords.map(([lng, lat]) => [lat, lng]);
    return {
      positions,
      distanceM: data.routes[0].distance,
      durationS: data.routes[0].duration,
    };
  } catch {
    return null;
  }
}

export { isValidCoord as isValidCoordPair };
