import { useState, useRef, useEffect, useCallback } from 'react';
import { supabase } from '../lib/supabaseClient';
import { extractPriceFromImage, isGroqConfigured } from '../lib/groq';
import { moderatePhotoUpload } from '../lib/chatApi';
import { FUEL_TYPES, PRICE_MIN, PRICE_MAX } from '../constants';

const BUCKET = 'report-photos';
const MAX_FILE_MB = 5;
const ALLOWED_PHOTO_MIME = new Set([
  'image/jpeg',
  'image/jpg',
  'image/png',
  'image/heic',
  'image/heif',
]);
const ALLOWED_PHOTO_EXT = new Set(['jpg', 'jpeg', 'png', 'heic', 'heif']);

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

function CameraIcon() {
  return (
    <svg
      className="btn-take-photo__icon"
      width="20"
      height="20"
      viewBox="0 0 24 24"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden
    >
      <path
        d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h3.17L8.4 3.6A2 2 0 0 1 10.07 3h3.86a2 2 0 0 1 1.67.9L17.83 6H21a2 2 0 0 1 2 2v11z"
        stroke="currentColor"
        strokeWidth="1.75"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <circle
        cx="12"
        cy="13"
        r="4"
        stroke="currentColor"
        strokeWidth="1.75"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function prefersNativeCameraPicker() {
  if (typeof window === 'undefined') return true;
  const coarse = window.matchMedia?.('(pointer: coarse)')?.matches;
  const touch = (navigator.maxTouchPoints ?? 0) > 0;
  return Boolean(coarse || touch);
}

function isAllowedPhotoFile(file) {
  if (!file) return false;
  const ext = String(file.name || '')
    .split('.')
    .pop()
    ?.toLowerCase();
  const mime = String(file.type || '').toLowerCase();
  const hasAllowedExt = Boolean(ext && ALLOWED_PHOTO_EXT.has(ext));
  const hasAllowedMime = Boolean(mime && ALLOWED_PHOTO_MIME.has(mime));
  // Accept when either MIME or extension matches allowed image types.
  return hasAllowedExt || hasAllowedMime;
}

export default function SubmitPriceForm({ stationId, stationName, onSubmitted }) {
  const [prices, setPrices] = useState(initialPrices());
  const [photoFile, setPhotoFile] = useState(null);
  const [submitting, setSubmitting] = useState(false);
  const [message, setMessage] = useState(null);
  const [messageType, setMessageType] = useState('');
  const [extracting, setExtracting] = useState(false);
  const fileInputRef = useRef(null);
  const cameraInputRef = useRef(null);
  const [webcamOpen, setWebcamOpen] = useState(false);
  const [webcamError, setWebcamError] = useState(null);
  const videoRef = useRef(null);
  const streamRef = useRef(null);

  const stopWebcam = useCallback(() => {
    streamRef.current?.getTracks?.().forEach((t) => t.stop());
    streamRef.current = null;
    if (videoRef.current) videoRef.current.srcObject = null;
    setWebcamOpen(false);
    setWebcamError(null);
  }, []);

  useEffect(() => {
    return () => {
      streamRef.current?.getTracks?.().forEach((t) => t.stop());
    };
  }, []);

  useEffect(() => {
    if (!webcamOpen) return;
    let cancelled = false;
    setWebcamError(null);
    (async () => {
      try {
        if (!navigator.mediaDevices?.getUserMedia) {
          throw new Error('Camera is not supported in this browser.');
        }
        const tryConstraints = [
          { video: { facingMode: { ideal: 'environment' } }, audio: false },
          { video: { facingMode: 'user' }, audio: false },
          { video: true, audio: false },
        ];
        let stream = null;
        for (const c of tryConstraints) {
          try {
            stream = await navigator.mediaDevices.getUserMedia(c);
            break;
          } catch {
            /* try next */
          }
        }
        if (!stream) throw new Error('Could not access a camera.');
        if (cancelled) {
          stream.getTracks().forEach((t) => t.stop());
          return;
        }
        streamRef.current = stream;
        const el = videoRef.current;
        if (el) {
          el.srcObject = stream;
          await el.play().catch(() => {});
        }
      } catch (e) {
        if (!cancelled) {
          setWebcamError(
            e?.message?.includes('Permission') || e?.name === 'NotAllowedError'
              ? 'Camera permission was denied.'
              : e?.message || 'Could not open camera.'
          );
        }
      }
    })();
    return () => {
      cancelled = true;
      streamRef.current?.getTracks?.().forEach((t) => t.stop());
      streamRef.current = null;
      if (videoRef.current) videoRef.current.srcObject = null;
    };
  }, [webcamOpen]);

  const captureWebcamPhoto = () => {
    const video = videoRef.current;
    if (!video || video.videoWidth < 2) return;
    const canvas = document.createElement('canvas');
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.drawImage(video, 0, 0);
    canvas.toBlob(
      (blob) => {
        if (!blob) return;
        const file = new File([blob], `price-photo-${Date.now()}.jpg`, {
          type: 'image/jpeg',
        });
        setPhotoFile(file);
        stopWebcam();
        if (fileInputRef.current) fileInputRef.current.value = '';
        if (cameraInputRef.current) cameraInputRef.current.value = '';
      },
      'image/jpeg',
      0.92
    );
  };

  const openTakePhoto = () => {
    setMessage(null);
    setMessageType('');
    if (prefersNativeCameraPicker()) {
      cameraInputRef.current?.click();
      return;
    }
    setWebcamOpen(true);
  };

  const onFileChosen = (e) => {
    const selected = e.target.files?.[0] || null;
    if (selected && !isAllowedPhotoFile(selected)) {
      setPhotoFile(null);
      setMessage('Only PNG, JPEG/JPG, HEIC, and HEIF photos are allowed.');
      setMessageType('error');
      e.target.value = '';
      return;
    }
    setMessage(null);
    setMessageType('');
    setPhotoFile(selected);
    e.target.value = '';
  };

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
    if (photoFile && !isAllowedPhotoFile(photoFile)) {
      setMessage('Only PNG, JPEG/JPG, HEIC, and HEIF photos are allowed.');
      setMessageType('error');
      return;
    }

    setSubmitting(true);
    setMessage(null);
    setMessageType('');

    let photoUrl = null;
    if (photoFile) {
      try {
        const verdict = await moderatePhotoUpload(photoFile);
        if (!verdict.allow) {
          setSubmitting(false);
          setMessage(
            verdict.reason ||
              'Photo rejected. Only gas station price-related images are allowed (no sexual, political, or unrelated content).'
          );
          setMessageType('error');
          return;
        }
      } catch (e) {
        setSubmitting(false);
        setMessage(
          'Photo verification is unavailable right now. Please try again or submit without photo.'
        );
        setMessageType('error');
        return;
      }

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
    if (cameraInputRef.current) cameraInputRef.current.value = '';
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
            accept="image/jpeg,image/jpg,image/png,image/heic,image/heif,.jpg,.jpeg,.png,.heic,.heif"
            onChange={onFileChosen}
          />
          <input
            ref={cameraInputRef}
            id="report-photo-camera"
            type="file"
            className="form-input form-input--hidden"
            accept="image/jpeg,image/jpg,image/png,image/heic,image/heif,.jpg,.jpeg,.png,.heic,.heif"
            capture="environment"
            onChange={onFileChosen}
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
              className="btn-secondary btn-take-photo"
              onClick={openTakePhoto}
            >
              <CameraIcon />
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

      {webcamOpen && (
        <div
          className="webcam-capture-layer"
          role="dialog"
          aria-modal="true"
          aria-labelledby="webcam-capture-title"
          onClick={stopWebcam}
        >
          <div
            className="webcam-capture-modal"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="webcam-capture-modal__head">
              <h4 id="webcam-capture-title">Take photo</h4>
              <button
                type="button"
                className="webcam-capture-modal__close"
                onClick={stopWebcam}
                aria-label="Close camera"
              >
                ×
              </button>
            </div>
            {webcamError ? (
              <p className="webcam-capture-modal__err" role="alert">
                {webcamError}
              </p>
            ) : (
              <video
                ref={videoRef}
                className="webcam-capture-modal__video"
                playsInline
                muted
              />
            )}
            <div className="webcam-capture-modal__actions">
              {!webcamError && (
                <button
                  type="button"
                  className="btn-primary"
                  onClick={captureWebcamPhoto}
                >
                  Use photo
                </button>
              )}
              <button type="button" className="btn-secondary" onClick={stopWebcam}>
                Cancel
              </button>
              {webcamError && (
                <button
                  type="button"
                  className="btn-primary"
                  onClick={() => {
                    stopWebcam();
                    fileInputRef.current?.click();
                  }}
                >
                  Choose file instead
                </button>
              )}
            </div>
          </div>
        </div>
      )}
    </section>
  );
}
