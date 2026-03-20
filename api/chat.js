/**
 * Vercel Serverless — Groq chat. Uses GROQ_API_KEY, or falls back to VITE_GROQ_API_KEY
 * (same key many projects already set for client-side photo AI).
 */
const GROQ_URL = 'https://api.groq.com/openai/v1/chat/completions';

const GUARD_MODEL = 'meta-llama/llama-prompt-guard-2-22m';
/** Production ID on Groq (no meta-llama/ prefix) — wrong id returns 400 and breaks chat. */
const CHAT_MODEL = 'llama-3.1-8b-instant';

const SYSTEM_BASE = `You are the professional assistant for **CDO Gas Price Map** (*Gas Bantay*) — community-reported fuel prices in Cagayan de Oro, Philippines.

## Language
- **Default:** Reply in **Bisaya (Cebuano)** unless the user writes clearly in another language (English, Tagalog/Filipino, etc.) — then mirror their language.
- You may offer short bilingual labels when helpful (e.g. key terms in English).

## Format (required)
- Use **GitHub-flavored Markdown**: short **bold** labels, bullet/numbered lists, and blank lines between sections.
- Keep a calm, formal tone; use clear headings like \`###\` for sections when the answer is long.
- Do not use raw HTML.

## Data rules
- When a **LIVE_APP_DATA** block is provided below, treat station names and **₱ prices** there as the **only** authoritative numbers. Do not invent or change figures.
- If the user asks for "near me" but location was not shared, say so politely and suggest **Use my location** on the dashboard or using the map.
- If no price appears in the table for a station/fuel, say **walay report karon** / no trusted report yet — do not guess.
- Never claim government or oil-company official pricing.
- **Sparse / empty data:** If LIVE_APP_DATA says there are **no stations with reported prices** (or there is **no** price table with ₱ values), respond with a **brief, formal** status (3–6 short bullets or two tight paragraphs). **Do not** paste a huge markdown table of stations where **every** fuel price is "—". **Do not** repeat the same message twice in different languages; mirror **one** language (user’s, or Bisaya if unclear).
- When LIVE_APP_DATA includes a **“Nearest stations … km only”** table, you may show **that** small table once to orient the user — clearly label that **prices are not available in the data yet** for those stations.
- Prefer **### Summary** then **### Unsa ang imong mahimo** (or English equivalents) over long duplicated intros.`;

const MAX_CONTEXT_CHARS = 12000;
const MAX_MESSAGES = 16;
const MAX_CONTENT = 3500;

function isPlaceholderKey(k) {
  const s = String(k || '').toLowerCase();
  return !s || s.includes('your-groq') || s.includes('your-groq-api-key');
}

function getGroqServerKey() {
  const direct = process.env.GROQ_API_KEY;
  const vite = process.env.VITE_GROQ_API_KEY;
  if (direct && !isPlaceholderKey(direct)) return String(direct).trim();
  if (vite && !isPlaceholderKey(vite)) return String(vite).trim();
  return '';
}

/** Same shape as Groq curl for Prompt Guard (max_completion_tokens: 1 per your snippet). */
function promptGuardPayload(userContent) {
  return {
    messages: [{ role: 'user', content: userContent }],
    model: GUARD_MODEL,
    temperature: 1,
    max_completion_tokens: 1,
    top_p: 1,
    stream: false,
    stop: null,
  };
}

function buildSystemWithContext(contextRaw) {
  const ctx = typeof contextRaw === 'string' ? contextRaw.trim().slice(0, MAX_CONTEXT_CHARS) : '';
  if (!ctx) return SYSTEM_BASE;
  return `${SYSTEM_BASE}

---
## LIVE_APP_DATA (authoritative; use only these numbers for prices and station list)

${ctx}`;
}

function chatPayload(messagesForModel, contextRaw) {
  return {
    model: CHAT_MODEL,
    messages: [{ role: 'system', content: buildSystemWithContext(contextRaw) }, ...messagesForModel],
    temperature: 0.45,
    max_completion_tokens: 1024,
    top_p: 1,
    stream: false,
    stop: null,
  };
}

function groqApiErrorMessage(text, data) {
  const msg = data?.error?.message || data?.message;
  if (msg && typeof msg === 'string') return msg.slice(0, 220);
  try {
    const j = JSON.parse(text || '{}');
    if (j?.error?.message) return String(j.error.message).slice(0, 220);
  } catch {
    /* ignore */
  }
  return '';
}

async function groqPost(apiKey, payload) {
  const res = await fetch(GROQ_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify(payload),
  });
  const text = await res.text();
  let data = null;
  try {
    data = text ? JSON.parse(text) : null;
  } catch {
    /* ignore */
  }
  return { res, text, data };
}

/** Interpret Llama Prompt Guard 2 completion (often BENIGN / MALICIOUS; your curl uses max_completion_tokens: 1). */
function isPromptGuardUnsafe(content) {
  const raw = (content || '').trim();
  if (!raw) return false;
  const t = raw.toUpperCase();
  if (t === '1' || /\bMALICIOUS\b/.test(t) || /^MAL$/.test(t) || t === 'M') return true;
  if (/\bUNSAFE\b|\bINJECTION\b/.test(t)) return true;
  if (/\bBENIGN\b/.test(t) || /^BEN$/.test(t) || t === 'B' || t === '0' || /\bSAFE\b/.test(t)) return false;
  return false;
}

export default async function handler(req, res) {
  res.setHeader('Content-Type', 'application/json; charset=utf-8');

  if (req.method === 'GET') {
    const key = getGroqServerKey();
    const enabled = Boolean(key && key.length > 12);
    return res.status(200).json({ enabled });
  }

  if (req.method !== 'POST') {
    res.setHeader('Allow', 'GET, POST');
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const apiKey = getGroqServerKey();
  if (!apiKey) {
    return res.status(503).json({
      error:
        'Assistant is not configured. Set GROQ_API_KEY or VITE_GROQ_API_KEY in Vercel env and redeploy.',
    });
  }

  let body = req.body;
  if (typeof body === 'string') {
    try {
      body = JSON.parse(body || '{}');
    } catch {
      return res.status(400).json({ error: 'Invalid JSON body' });
    }
  }

  const rawMessages = body?.messages;
  if (!Array.isArray(rawMessages) || rawMessages.length === 0) {
    return res.status(400).json({ error: 'messages[] required' });
  }

  const slice = rawMessages.slice(-MAX_MESSAGES);
  const messages = [];
  for (const m of slice) {
    const role = m?.role === 'assistant' ? 'assistant' : 'user';
    const content = String(m?.content ?? '').slice(0, MAX_CONTENT).trim();
    if (!content) continue;
    messages.push({ role, content });
  }

  if (messages.length === 0) {
    return res.status(400).json({ error: 'No valid messages' });
  }

  const latestUser = [...messages].reverse().find((m) => m.role === 'user');
  if (!latestUser?.content) {
    return res.status(400).json({ error: 'No user message to check' });
  }

  const contextRaw =
    typeof body?.context === 'string' ? body.context.slice(0, MAX_CONTEXT_CHARS) : '';

  try {
    const guardBody = promptGuardPayload(latestUser.content);
    const guardOut = await groqPost(apiKey, guardBody);
    if (!guardOut.res.ok) {
      const hint = groqApiErrorMessage(guardOut.text, guardOut.data);
      console.error('[api/chat] prompt-guard', guardOut.res.status, guardOut.text.slice(0, 400));
      return res.status(502).json({
        error: 'Safety check temporarily unavailable.',
        ...(hint && { hint }),
      });
    }
    const guardText = guardOut.data?.choices?.[0]?.message?.content ?? '';
    if (isPromptGuardUnsafe(guardText)) {
      return res.status(400).json({
        error: 'That message could not be sent. Please ask about the gas map or fuel prices in a straightforward way.',
      });
    }

    const chatOut = await groqPost(apiKey, chatPayload(messages, contextRaw));
    if (!chatOut.res.ok) {
      const hint = groqApiErrorMessage(chatOut.text, chatOut.data);
      console.error('[api/chat] Groq chat', chatOut.res.status, chatOut.text.slice(0, 500));
      return res.status(502).json({
        error: 'Assistant temporarily unavailable.',
        ...(hint && { hint }),
      });
    }

    const reply = chatOut.data?.choices?.[0]?.message?.content?.trim() || '';
    if (!reply) {
      return res.status(502).json({ error: 'Empty reply from assistant.' });
    }

    return res.status(200).json({ reply });
  } catch (e) {
    console.error('[api/chat]', e);
    return res.status(502).json({ error: 'Assistant request failed.' });
  }
}
