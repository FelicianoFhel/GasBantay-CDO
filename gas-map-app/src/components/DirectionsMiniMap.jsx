import { useEffect, useState, useMemo } from 'react';
import { MapContainer, TileLayer, Polyline, Marker, useMap } from 'react-leaflet';
import L from 'leaflet';
import { fetchDrivingRoute } from '../lib/osrmRoute';
import { isValidCoord } from '../lib/navigationLinks';

const defaultIcon = L.icon({
  iconRetinaUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-icon-2x.png',
  iconUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-icon.png',
  shadowUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-shadow.png',
  iconSize: [25, 41],
  iconAnchor: [12, 41],
  popupAnchor: [1, -34],
  shadowSize: [41, 41],
});

function MapResizeAndFit({ positions, destLat, destLng, originLat, originLng, hasRoute }) {
  const map = useMap();

  useEffect(() => {
    const run = () => map.invalidateSize();
    run();
    const id = window.setTimeout(run, 150);
    const id2 = window.setTimeout(run, 400);
    return () => {
      window.clearTimeout(id);
      window.clearTimeout(id2);
    };
  }, [map]);

  useEffect(() => {
    if (!map) return;
    if (hasRoute && positions.length >= 2) {
      const bounds = L.latLngBounds(positions);
      map.fitBounds(bounds, { padding: [28, 28], maxZoom: 16 });
      return;
    }
    if (isValidCoord(destLat, destLng)) {
      map.setView([Number(destLat), Number(destLng)], 15);
    }
  }, [map, positions, hasRoute, destLat, destLng, originLat, originLng]);

  return null;
}

function formatSummary(distanceM, durationS) {
  const km = distanceM / 1000;
  const kmStr = km < 10 ? km.toFixed(1) : Math.round(km).toString();
  const min = Math.round(durationS / 60);
  return `${kmStr} km · about ${min} min`;
}

/**
 * In-app driving route preview (OSRM + OSM tiles). No new tab.
 */
export default function DirectionsMiniMap({
  destLat,
  destLng,
  originLat,
  originLng,
  destLabel = 'Station',
  className = '',
}) {
  const [route, setRoute] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(false);

  const hasOrigin = isValidCoord(originLat, originLng);
  const hasDest = isValidCoord(destLat, destLng);

  const positions = useMemo(() => route?.positions ?? [], [route]);

  useEffect(() => {
    if (!hasDest) {
      setRoute(null);
      setError(false);
      return;
    }
    if (!hasOrigin) {
      setRoute(null);
      setError(false);
      setLoading(false);
      return;
    }

    let cancelled = false;
    setLoading(true);
    setError(false);
    setRoute(null);

    (async () => {
      const r = await fetchDrivingRoute(
        { lat: Number(originLat), lng: Number(originLng) },
        { lat: Number(destLat), lng: Number(destLng) }
      );
      if (cancelled) return;
      setLoading(false);
      if (r?.positions?.length) {
        setRoute(r);
        setError(false);
      } else {
        setRoute(null);
        setError(true);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [destLat, destLng, originLat, originLng, hasDest, hasOrigin]);

  if (!hasDest) return null;

  const center = [Number(destLat), Number(destLng)];

  return (
    <div className={`directions-mini-map ${className}`.trim()}>
      <div className="directions-mini-map__frame" aria-busy={loading}>
        <MapContainer
          center={center}
          zoom={15}
          style={{ height: '100%', width: '100%' }}
          scrollWheelZoom
          zoomControl
        >
          <TileLayer
            attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
            url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
          />
          <MapResizeAndFit
            positions={positions}
            destLat={destLat}
            destLng={destLng}
            originLat={originLat}
            originLng={originLng}
            hasRoute={Boolean(route?.positions?.length)}
          />
          {positions.length >= 2 && (
            <Polyline
              positions={positions}
              pathOptions={{ color: '#1d4ed8', weight: 5, opacity: 0.88 }}
            />
          )}
          {hasOrigin && (
            <Marker
              position={[Number(originLat), Number(originLng)]}
              icon={defaultIcon}
              aria-label="Your location"
            />
          )}
          <Marker position={center} icon={defaultIcon} aria-label={destLabel} />
        </MapContainer>
      </div>
      <div className="directions-mini-map__meta">
        {loading && <p className="directions-mini-map__hint">Loading route…</p>}
        {!loading && !hasOrigin && (
          <p className="directions-mini-map__hint">
            Turn on <strong>your location</strong> on the map to see a driving route here.
          </p>
        )}
        {!loading && hasOrigin && route && (
          <p className="directions-mini-map__summary">
            {formatSummary(route.distanceM, route.durationS)}
          </p>
        )}
        {!loading && hasOrigin && error && (
          <p className="directions-mini-map__hint directions-mini-map__hint--warn">
            Could not load the road route. Straight-line distance still applies on the dashboard.
          </p>
        )}
      </div>
    </div>
  );
}
