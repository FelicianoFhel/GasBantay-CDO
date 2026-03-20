import { Marker } from 'react-leaflet';
import L from 'leaflet';
import { useMemo } from 'react';

// Fix default icon in React-Leaflet (webpack/vite)
delete L.Icon.Default.prototype._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-icon-2x.png',
  iconUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-icon.png',
  shadowUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-shadow.png',
});

export default function StationMarker({ station, isSelected, onClick }) {
  const position = [Number(station.lat), Number(station.lng)];
  const markerIcon = useMemo(() => {
    const price = Number(station?.badgePrice);
    if (!Number.isFinite(price)) return undefined;
    const selectedCls = isSelected ? ' cdo-marker-badge--selected' : '';
    return L.divIcon({
      className: 'cdo-marker-wrap',
      html: `<div class="cdo-marker-badge${selectedCls}">₱ ${price.toFixed(2)}</div>`,
      iconSize: [70, 28],
      iconAnchor: [35, 30],
    });
  }, [station?.badgePrice, isSelected]);

  return (
    <Marker
      position={position}
      icon={markerIcon}
      eventHandlers={{ click: () => onClick(station) }}
    />
  );
}
