import { useEffect } from 'react';
import DirectionsMiniMap from './DirectionsMiniMap';

/**
 * Full-screen style overlay for in-app directions (dashboard cards).
 */
export default function DirectionsModal({
  open,
  onClose,
  stationName,
  destLat,
  destLng,
  originLat,
  originLng,
}) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div
      className="directions-modal-overlay"
      role="dialog"
      aria-modal="true"
      aria-labelledby="directions-modal-title"
      onClick={onClose}
    >
      <div
        className="directions-modal"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="directions-modal__head">
          <h2 id="directions-modal-title" className="directions-modal__title">
            Directions{stationName ? ` — ${stationName}` : ''}
          </h2>
          <button
            type="button"
            className="directions-modal__close"
            onClick={onClose}
            aria-label="Close directions"
          >
            ×
          </button>
        </div>
        <DirectionsMiniMap
          destLat={destLat}
          destLng={destLng}
          originLat={originLat}
          originLng={originLng}
          destLabel={stationName || 'Station'}
          className="directions-modal__map"
        />
      </div>
    </div>
  );
}
