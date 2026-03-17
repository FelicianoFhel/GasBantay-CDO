/**
 * Haversine distance between two points in km
 */
export function haversine(lat1, lng1, lat2, lng2) {
  const R = 6371; // Earth radius km
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLng = ((lng2 - lng1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLng / 2) *
      Math.sin(dLng / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

/**
 * Get user position from browser geolocation
 * @returns Promise<{ lat: number, lng: number }>
 */
export function getUserPosition() {
  return new Promise((resolve, reject) => {
    const resolveFromIp = async () => {
      try {
        const fromIpApi = await fetchIpLocation('https://ipapi.co/json/');
        if (fromIpApi) {
          resolve(fromIpApi);
          return;
        }
        const fromIpWho = await fetchIpLocation('https://ipwho.is/');
        if (fromIpWho) {
          resolve(fromIpWho);
          return;
        }
      } catch (_) {
        // Ignore and reject with final message below.
      }
      reject(new Error('Location unavailable. Use HTTPS or localhost for precise GPS.'));
    };

    if (!navigator.geolocation) {
      resolveFromIp();
      return;
    }

    navigator.geolocation.getCurrentPosition(
      (pos) => resolve({ lat: pos.coords.latitude, lng: pos.coords.longitude }),
      () => resolveFromIp(),
      { enableHighAccuracy: true, timeout: 10000, maximumAge: 60000 }
    );
  });
}

async function fetchIpLocation(url) {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 5000);
  try {
    const response = await fetch(url, { signal: controller.signal });
    if (!response.ok) return null;
    const data = await response.json();
    const lat = Number(data.latitude ?? data.lat);
    const lng = Number(data.longitude ?? data.lon ?? data.lng);
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
    return { lat, lng };
  } finally {
    clearTimeout(timeoutId);
  }
}
