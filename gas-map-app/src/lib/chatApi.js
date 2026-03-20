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
