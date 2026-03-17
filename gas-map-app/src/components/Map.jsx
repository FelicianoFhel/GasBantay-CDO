import { useEffect } from 'react';
import { MapContainer, TileLayer, useMap } from 'react-leaflet';
import { CDO_CENTER, CDO_ZOOM, CDO_BOUNDS } from '../constants';
import StationMarker from './StationMarker';
import 'leaflet/dist/leaflet.css';

function MapBounds() {
  const map = useMap();
  useEffect(() => {
    if (!map) return;
    map.setMaxBounds(CDO_BOUNDS);
  }, [map]);
  return null;
}

export default function Map({ stations = [], loading, error, selectedStationId, onSelectStation }) {
  return (
    <div className="map-wrap">
      {error && (
        <div className="map-banner">
          Could not load stations: {error}. Check Supabase URL and key in .env
        </div>
      )}
      {loading && (
        <div className="map-banner">Loading map…</div>
      )}
      <MapContainer
        center={CDO_CENTER}
        zoom={CDO_ZOOM}
        style={{ height: '100%', width: '100%' }}
        scrollWheelZoom
      >
        <MapBounds />
        <TileLayer
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
        />
        {stations.map((station) => (
          <StationMarker
            key={station.id}
            station={station}
            isSelected={selectedStationId === station.id}
            onClick={() => onSelectStation(station)}
          />
        ))}
      </MapContainer>
    </div>
  );
}
