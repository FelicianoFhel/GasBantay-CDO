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
- Start with a **direct answer first** in 1-2 sentences (no long intro, no repetition).
- Be **specific and concrete**: include exact station names, fuel, price, and km when available.
- If asked a simple question, answer it plainly first, then add only brief supporting detail.
- Avoid vague advice like "it depends" unless truly necessary; if uncertain, state exactly what is missing.

## Data rules
- A **map data** section may appear below with station names and **₱ prices**. Treat those as the **only** authoritative numbers. Do not invent or change figures.
- **Never** mention to the user: \`LIVE_APP_DATA\`, “context”, “API”, “database block”, or any internal system name. Speak naturally (e.g. “base sa datos sa mapa karon”, “gikan sa komunidad”).
- For **“near me” / presyo duol**: if location is on, answer using **only the three nearest stations** in the first table — list names, km, and prices (or say walay report). Do not add a second long list of farther stations unless the user explicitly asks for more.
- If the user asks for "near me" but location was not shared, say so politely and suggest turning on **location** in the chat or **Use my location** on the dashboard.
- If no price appears for a station/fuel, say **walay report karon** / no trusted report yet — do not guess.
- Never claim government or oil-company official pricing.
- **Sparse / empty data:** If there are **no** ₱ prices in the map data, respond with a **brief, formal** status (short bullets or two tight paragraphs). **Do not** paste a huge table where **every** fuel cell is "—". **Do not** repeat the same message twice in different languages.
- When the map data is **distance-only** (km, no prices), state clearly that **walay presyo sa datos karon** and give the small distance list once.
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
## Map data for this answer (authoritative numbers; do not quote this heading to the user)

${ctx}`;
}

function chatPayload(messagesForModel, contextRaw) {
  return {
    model: CHAT_MODEL,
    messages: [{ role: 'system', content: buildSystemWithContext(contextRaw) }, ...messagesForModel],
    temperature: 0.3,
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

function removeInternalDataEcho(text) {
  const lines = String(text || '').split('\n');
  const cleaned = [];
  let skipTable = false;
  let skippedAny = false;

  for (const line of lines) {
    const t = line.trim();
    const lower = t.toLowerCase();
    const isInternalHeader =
      lower.startsWith('map data') ||
      lower.startsWith('## map data') ||
      lower.startsWith('### snapshot') ||
      lower.includes('authoritative for this chat turn');

    if (isInternalHeader) {
      skipTable = true;
      skippedAny = true;
      continue;
    }

    if (skipTable) {
      const isMarkdownTableLine = t.startsWith('|') || /^[:\-\s|]+$/.test(t);
      if (isMarkdownTableLine || t === '') {
        skippedAny = true;
        continue;
      }
      skipTable = false;
    }

    cleaned.push(line);
  }

  const out = cleaned.join('\n').trim();
  if (out) return out;
  if (skippedAny) {
    return 'Base sa kasamtangang datos sa app, mao ni ang pinaka-importante nga tubag: walay i-display nga internal map-data block sa user view.';
  }
  return out;
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

    const replyRaw = chatOut.data?.choices?.[0]?.message?.content?.trim() || '';
    const reply = removeInternalDataEcho(replyRaw);
    if (!reply) {
      return res.status(502).json({ error: 'Empty reply from assistant.' });
    }

    return res.status(200).json({ reply });
  } catch (e) {
    console.error('[api/chat]', e);
    return res.status(502).json({ error: 'Assistant request failed.' });
  }
}
