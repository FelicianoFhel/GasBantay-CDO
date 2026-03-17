import { Marker } from 'react-leaflet';
import L from 'leaflet';

// Fix default icon in React-Leaflet (webpack/vite)
delete L.Icon.Default.prototype._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-icon-2x.png',
  iconUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-icon.png',
  shadowUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-shadow.png',
});

export default function StationMarker({ station, isSelected, onClick }) {
  const position = [Number(station.lat), Number(station.lng)];

  return (
    <Marker
      position={position}
      eventHandlers={{ click: () => onClick(station) }}
    />
  );
}
