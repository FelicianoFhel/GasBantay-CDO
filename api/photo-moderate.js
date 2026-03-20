const GROQ_URL = 'https://api.groq.com/openai/v1/chat/completions';
const VISION_MODEL = 'meta-llama/llama-4-scout-17b-16e-instruct';
const MAX_IMAGE_BASE64_CHARS = 6_000_000;
const ALLOWED_MIME = new Set([
  'image/jpeg',
  'image/jpg',
  'image/png',
  'image/heic',
  'image/heif',
]);

const PROMPT = `You are a strict photo moderation checker for a community gas price app.

Policy:
- ALLOW only images clearly related to gas price reporting:
  - fuel station price board/sign
  - fuel pump display with prices
  - fuel receipt showing fuel type/price
- REJECT images with any sexual/pornographic content.
- REJECT political content (campaign posters, party logos, political slogans, candidate banners, protest signs).
- REJECT images unrelated to gas station prices.
- If uncertain, reject.

Return ONLY valid JSON:
{"allow":true|false,"category":"ok|sexual|political|unrelated|uncertain","reason":"short reason"}
`;

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

function parseJsonFromText(raw) {
  const text = String(raw || '').trim();
  const start = text.indexOf('{');
  const end = text.lastIndexOf('}') + 1;
  if (start === -1 || end <= start) return null;
  try {
    return JSON.parse(text.slice(start, end));
  } catch {
    return null;
  }
}

function normalizeVerdict(v) {
  const allow = Boolean(v?.allow);
  const category = String(v?.category || '').toLowerCase();
  const reason = String(v?.reason || '').trim().slice(0, 180);
  const allowedCategory = allow && category === 'ok';
  if (!allowedCategory) {
    return {
      allow: false,
      category: category || 'uncertain',
      reason: reason || 'Photo does not match gas price reporting policy.',
    };
  }
  return { allow: true, category: 'ok', reason: reason || 'Gas price-related photo.' };
}

export default async function handler(req, res) {
  res.setHeader('Content-Type', 'application/json; charset=utf-8');

  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const apiKey = getGroqServerKey();
  if (!apiKey) {
    return res.status(503).json({ error: 'Moderation is not configured.' });
  }

  let body = req.body;
  if (typeof body === 'string') {
    try {
      body = JSON.parse(body || '{}');
    } catch {
      return res.status(400).json({ error: 'Invalid JSON body' });
    }
  }

  const imageBase64 = String(body?.image_base64 || '');
  const mime = String(body?.mime || '').toLowerCase();
  if (!imageBase64 || imageBase64.length > MAX_IMAGE_BASE64_CHARS) {
    return res.status(400).json({ error: 'Invalid image payload.' });
  }
  if (!ALLOWED_MIME.has(mime)) {
    return res.status(400).json({ error: 'Unsupported image type.' });
  }

  const dataUrl = `data:${mime};base64,${imageBase64}`;
  const payload = {
    model: VISION_MODEL,
    temperature: 0,
    max_completion_tokens: 220,
    messages: [
      {
        role: 'user',
        content: [
          { type: 'text', text: PROMPT },
          { type: 'image_url', image_url: { url: dataUrl } },
        ],
      },
    ],
  };

  try {
    const groqRes = await fetch(GROQ_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify(payload),
    });
    const text = await groqRes.text();
    if (!groqRes.ok) {
      return res.status(502).json({ error: 'Photo moderation failed.' });
    }
    let parsed = null;
    try {
      const data = text ? JSON.parse(text) : {};
      parsed = parseJsonFromText(data?.choices?.[0]?.message?.content);
    } catch {
      parsed = null;
    }
    const verdict = normalizeVerdict(parsed);
    return res.status(200).json(verdict);
  } catch {
    return res.status(502).json({ error: 'Photo moderation unavailable.' });
  }
}

