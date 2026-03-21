/**
 * External maps deep links for web/PWA (no in-app turn-by-turn).
 */

function isValidCoord(lat, lng) {
  return (
    Number.isFinite(Number(lat)) &&
    Number.isFinite(Number(lng)) &&
    Math.abs(Number(lat)) <= 90 &&
    Math.abs(Number(lng)) <= 180
  );
}

/**
 * Google Maps directions: optional origin from user location.
 * @see https://developers.google.com/maps/documentation/urls/get-started#directions-action
 */
export function googleMapsDirectionsUrl({ destLat, destLng, originLat, originLng }) {
  if (!isValidCoord(destLat, destLng)) return null;
  const dlat = Number(destLat);
  const dlng = Number(destLng);
  const params = new URLSearchParams({ api: '1', destination: `${dlat},${dlng}` });
  if (isValidCoord(originLat, originLng)) {
    params.set('origin', `${Number(originLat)},${Number(originLng)}`);
  }
  return `https://www.google.com/maps/dir/?${params.toString()}`;
}

/** Waze deep link to navigate to coordinates */
export function wazeNavigateUrl({ destLat, destLng }) {
  if (!isValidCoord(destLat, destLng)) return null;
  const lat = Number(destLat);
  const lng = Number(destLng);
  return `https://waze.com/ul?ll=${lat},${lng}&navigate=yes`;
}

/** Apple Maps (works well on iOS / macOS) */
export function appleMapsDirectionsUrl({ destLat, destLng }) {
  if (!isValidCoord(destLat, destLng)) return null;
  const lat = Number(destLat);
  const lng = Number(destLng);
  return `https://maps.apple.com/?daddr=${lat},${lng}`;
}

export { isValidCoord };
