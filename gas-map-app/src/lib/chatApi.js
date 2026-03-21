/**
 * Chat API base URL.
 * - Production on Vercel: same origin → relative `/api`
 * - Local Vite: set `VITE_CHAT_API_URL` to your deployed origin, e.g. `https://your-app.vercel.app/api`
 *   or run `npx vercel dev` from the repo root and use `http://localhost:3000/api`
 */
export function getChatApiBase() {
  const raw = import.meta.env.VITE_CHAT_API_URL;
  if (raw && String(raw).trim()) {
    return String(raw).replace(/\/$/, '');
  }
  return '';
}

export function chatStatusUrl() {
  const base = getChatApiBase();
  return base ? `${base}/chat` : '/api/chat';
}

export function chatPostUrl() {
  return chatStatusUrl();
}

export function photoModerationUrl() {
  const base = getChatApiBase();
  return base ? `${base}/photo-moderate` : '/api/photo-moderate';
}

function fileToBase64(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const dataUrl = String(reader.result || '');
      const base64 = dataUrl.split(',')[1] || '';
      resolve(base64);
    };
    reader.onerror = () => reject(reader.error || new Error('Failed to read image'));
    reader.readAsDataURL(file);
  });
}

const MODERATE_TIMEOUT_MS = 55_000;

export async function moderatePhotoUpload(file) {
  const base64 = await fileToBase64(file);
  const mime = String(file?.type || 'image/jpeg').toLowerCase();
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), MODERATE_TIMEOUT_MS);
  let res;
  try {
    res = await fetch(photoModerationUrl(), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ image_base64: base64, mime }),
      signal: controller.signal,
    });
  } catch (e) {
    clearTimeout(timer);
    if (e?.name === 'AbortError') {
      const err = new Error('Photo check timed out. Try a smaller photo or submit without a photo.');
      err.status = 408;
      throw err;
    }
    const err = new Error(e?.message || 'Network error during photo check.');
    err.status = 0;
    err.cause = e;
    throw err;
  }
  clearTimeout(timer);

  const rawText = await res.text();
  let data = {};
  try {
    data = rawText ? JSON.parse(rawText) : {};
  } catch {
    data = { error: rawText?.slice(0, 120) || 'Invalid server response' };
  }
  if (!res.ok) {
    const err = new Error(data.error || 'Photo moderation request failed.');
    err.status = res.status;
    throw err;
  }
  return {
    allow: Boolean(data.allow),
    category: String(data.category || ''),
    reason: String(data.reason || ''),
  };
}
