import { useState, useRef } from 'react';
import { supabase } from '../lib/supabaseClient';
import { extractPriceFromImage, isGroqConfigured } from '../lib/groq';
import { FUEL_TYPES, PRICE_MIN, PRICE_MAX } from '../constants';

const BUCKET = 'report-photos';
const MAX_FILE_MB = 5;

function toFriendlyErrorMessage(rawMessage) {
  if (!rawMessage || typeof rawMessage !== 'string') return 'Something went wrong. Please try again.';
  const msg = rawMessage.toLowerCase();
  if (msg.includes('price_reports_fuel_type_check') || msg.includes('fuel_type')) {
    return 'We couldn\'t save your price. Please make sure fuel types are correct and try again.';
  }
  if (msg.includes('price_reports_price_check')) {
    return 'Please make sure you input correct price for the community information.';
  }
  if (msg.includes('bucket') || msg.includes('storage')) {
    return 'Photo upload is not available right now. You can still submit without a photo.';
  }
  if (msg.includes('violates') || msg.includes('constraint')) {
    return 'We couldn\'t save your report. Please check your entries and try again.';
  }
  return 'We couldn\'t save your report. Please try again.';
}

function createUploadId() {
  if (globalThis.crypto && typeof globalThis.crypto.randomUUID === 'function') {
    return globalThis.crypto.randomUUID();
  }
  const rand = Math.random().toString(36).slice(2, 10);
  return `u${Date.now().toString(36)}${rand}`;
}

const initialPrices = () => ({
  diesel: '',
  regular_green: '',
  premium_red: '',
});

export default function SubmitPriceForm({ stationId, stationName, onSubmitted }) {
  const [prices, setPrices] = useState(initialPrices());
  const [photoFile, setPhotoFile] = useState(null);
  const [submitting, setSubmitting] = useState(false);
  const [message, setMessage] = useState(null);
  const [messageType, setMessageType] = useState('');
  const [extracting, setExtracting] = useState(false);
  const fileInputRef = useRef(null);
  const cameraInputRef = useRef(null);

  const setPrice = (fuelType, value) => {
    setPrices((prev) => ({ ...prev, [fuelType]: value }));
  };

  const handleExtractWithAi = async () => {
    if (!photoFile) return;
    setExtracting(true);
    setMessage(null);
    setMessageType('');
    try {
      const { fuel_type, price } = await extractPriceFromImage(photoFile);
      if (fuel_type && FUEL_TYPES.some((f) => f.value === fuel_type)) {
        setPrice(fuel_type, price != null && Number.isFinite(price) ? String(price) : '');
      }
      if (price != null && Number.isFinite(price) && fuel_type) {
        setMessage('AI extracted value applied. Review and add more if needed.');
        setMessageType('success');
      } else if (fuel_type || (price != null && Number.isFinite(price))) {
        setMessage('AI extracted value applied.');
        setMessageType('success');
      } else {
        setMessage('Could not read fuel type or price from photo. Enter manually.');
        setMessageType('error');
      }
    } catch (err) {
      setMessage(toFriendlyErrorMessage(err.message) || 'Could not read from photo. Enter prices manually.');
      setMessageType('error');
    } finally {
      setExtracting(false);
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    const parsed = FUEL_TYPES.map(({ value }) => ({
      fuel_type: value,
      raw: prices[value],
      num: parseFloat(String(prices[value]).replace(/,/g, '')),
    })).filter(({ num }) => !isNaN(num) && num > 0);

    const outOfRange = parsed.filter(({ num }) => num < PRICE_MIN || num > PRICE_MAX);
    if (outOfRange.length > 0) {
      setMessage('Please make sure you input correct price for the community information.');
      setMessageType('error');
      return;
    }

    const entries = parsed.filter(({ num }) => num >= PRICE_MIN && num <= PRICE_MAX);
    if (!stationId || entries.length === 0) {
      setMessage('Enter at least one price.');
      setMessageType('error');
      return;
    }
    if (photoFile && photoFile.size > MAX_FILE_MB * 1024 * 1024) {
      setMessage(`Photo must be under ${MAX_FILE_MB} MB.`);
      setMessageType('error');
      return;
    }

    setSubmitting(true);
    setMessage(null);
    setMessageType('');

    let photoUrl = null;
    if (photoFile) {
      const ext = photoFile.name.split('.').pop()?.toLowerCase() || 'jpg';
      const path = `${stationId}/${createUploadId()}.${ext}`;
      const { error: uploadError } = await supabase.storage
        .from(BUCKET)
        .upload(path, photoFile, { upsert: false });
      if (uploadError) {
        setSubmitting(false);
        setMessage(toFriendlyErrorMessage(uploadError.message));
        setMessageType('error');
        return;
      }
      const { data } = supabase.storage.from(BUCKET).getPublicUrl(path);
      photoUrl = data?.publicUrl || null;
    }

    for (const { fuel_type, num } of entries) {
      const { error } = await supabase.from('price_reports').insert({
        station_id: stationId,
        fuel_type,
        price: num,
        ...(photoUrl && { photo_url: photoUrl }),
      });
      if (error) {
        setSubmitting(false);
        setMessage(toFriendlyErrorMessage(error.message));
        setMessageType('error');
        return;
      }
    }

    setSubmitting(false);
    setPrices(initialPrices());
    setPhotoFile(null);
    if (fileInputRef.current) fileInputRef.current.value = '';
    setMessage(entries.length > 1 ? `Thanks! ${entries.length} prices reported.` : 'Thanks! Price reported.');
    setMessageType('success');
    onSubmitted?.();
  };

  const hasAnyPrice = FUEL_TYPES.some(({ value }) => {
    const p = parseFloat(String(prices[value]).replace(/,/g, ''));
    return !isNaN(p) && p >= PRICE_MIN && p <= PRICE_MAX;
  });

  return (
    <section className="submit-section">
      <h3 className="station-panel__section-title">Submit price</h3>
      <form onSubmit={handleSubmit} className="form-grid">
        <input type="hidden" value={stationId} readOnly />
        {FUEL_TYPES.map(({ value, label }) => (
          <div key={value} className="form-field">
            <label htmlFor={`price-${value}`}>{label} (₱)</label>
            <input
              id={`price-${value}`}
              type="number"
              className="form-input"
              step="0.01"
              value={prices[value]}
              onChange={(e) => setPrice(value, e.target.value)}
              placeholder=""
            />
          </div>
        ))}
        <div className="form-field">
          <label>Photo (optional)</label>
          <input
            ref={fileInputRef}
            id="report-photo"
            type="file"
            className="form-input form-input--hidden"
            accept="image/*"
            onChange={(e) => setPhotoFile(e.target.files?.[0] || null)}
          />
          <input
            ref={cameraInputRef}
            id="report-photo-camera"
            type="file"
            className="form-input form-input--hidden"
            accept="image/*"
            capture="environment"
            onChange={(e) => setPhotoFile(e.target.files?.[0] || null)}
          />
          <div className="form-photo-actions">
            <button
              type="button"
              className="btn-secondary"
              onClick={() => fileInputRef.current?.click()}
            >
              Choose file
            </button>
            <button
              type="button"
              className="btn-secondary"
              onClick={() => cameraInputRef.current?.click()}
            >
              Take photo
            </button>
          </div>
          {photoFile ? (
            <p className="form-msg form-photo-name">
              {photoFile.name || 'Photo'} ({(photoFile.size / 1024).toFixed(1)} KB)
            </p>
          ) : (
            <p className="form-msg form-photo-hint">No file chosen</p>
          )}
          {photoFile && (
            <>
              {isGroqConfigured() && (
                <button
                  type="button"
                  className="btn-ai-extract"
                  onClick={handleExtractWithAi}
                  disabled={extracting}
                >
                  {extracting ? 'Extracting…' : 'Extract fuel & price with AI'}
                </button>
              )}
            </>
          )}
        </div>
        {message && (
          <div
            className={`form-notif form-notif--${messageType || 'info'}`}
            role={messageType === 'error' ? 'alert' : 'status'}
            aria-live={messageType === 'error' ? 'assertive' : 'polite'}
          >
            <span className="form-notif__icon" aria-hidden="true">
              {messageType === 'success' ? '✓' : messageType === 'error' ? '!' : 'ℹ'}
            </span>
            <span className="form-notif__text">{message}</span>
          </div>
        )}
        <button type="submit" disabled={submitting || !hasAnyPrice} className="btn-primary">
          {submitting ? 'Submitting…' : 'Submit price'}
        </button>
      </form>
    </section>
  );
}
