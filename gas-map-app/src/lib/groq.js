/**
 * Groq vision API: extract fuel type and price from a gas price photo.
 * Uses VITE_GROQ_API_KEY from env. Model: llama-4-scout (vision).
 * @param {File} imageFile
 * @returns {Promise<{ fuel_type: string | null, price: number | null }>}
 */
const GROQ_URL = 'https://api.groq.com/openai/v1/chat/completions';
const VISION_MODEL = 'meta-llama/llama-4-scout-17b-16e-instruct';
const MAX_BASE64_MB = 4;

const PROMPT = `Look at this image of a gas station price sign, pump, or receipt.
Extract the fuel type and the price in Philippine Pesos (PHP/₱).

Return ONLY a valid JSON object with exactly two keys:
- "fuel_type": one of "diesel", "regular_green", "premium_red" (map: Diesel -> diesel, Regular/Unleaded/Green -> regular_green, Premium/Red -> premium_red). Use null if unclear.
- "price": number in PHP (e.g. 65.50), or null if not visible.

Example: {"fuel_type":"diesel","price":78.50}
If you cannot read the image, return: {"fuel_type":null,"price":null}`;

function getApiKey() {
  return (typeof import.meta !== 'undefined' && import.meta.env && import.meta.env.VITE_GROQ_API_KEY) || '';
}

export function isGroqConfigured() {
  const key = getApiKey();
  return Boolean(key && key !== 'your-groq-api-key');
}

export async function extractPriceFromImage(imageFile) {
  const apiKey = getApiKey();
  if (!apiKey || apiKey === 'your-groq-api-key') {
    throw new Error('Groq API key not set. Add VITE_GROQ_API_KEY to .env');
  }

  const base64 = await fileToBase64(imageFile);
  const sizeMB = (base64.length * 3) / 4 / (1024 * 1024);
  if (sizeMB > MAX_BASE64_MB) {
    throw new Error(`Image too large for AI (max ${MAX_BASE64_MB} MB). Try a smaller photo.`);
  }

  const mime = imageFile.type || 'image/jpeg';
  const dataUrl = `data:${mime};base64,${base64}`;

  const body = {
    model: VISION_MODEL,
    messages: [
      {
        role: 'user',
        content: [
          { type: 'text', text: PROMPT },
          { type: 'image_url', image_url: { url: dataUrl } },
        ],
      },
    ],
    temperature: 0.2,
    max_tokens: 256,
  };

  const res = await fetch(GROQ_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const errText = await res.text();
    throw new Error(res.status === 401 ? 'Invalid Groq API key' : errText || `Groq API error ${res.status}`);
  }

  const data = await res.json();
  const raw = data.choices?.[0]?.message?.content?.trim() || '';

  try {
    const json = parseJsonFromResponse(raw);
    const fuel_type = normalizeFuelType(json.fuel_type);
    const price = json.price != null ? Number(json.price) : null;
    if (Number.isFinite(price) && price > 0) {
      return { fuel_type: fuel_type || null, price };
    }
    return { fuel_type: fuel_type || null, price: null };
  } catch (_) {
    return { fuel_type: null, price: null };
  }
}

function parseJsonFromResponse(raw) {
  const start = raw.indexOf('{');
  const end = raw.lastIndexOf('}') + 1;
  if (start === -1 || end <= start) throw new Error('No JSON');
  return JSON.parse(raw.slice(start, end));
}

function normalizeFuelType(v) {
  if (v == null || typeof v !== 'string') return null;
  const s = v.toLowerCase().replace(/\s+/g, '_');
  if (s === 'diesel') return 'diesel';
  if (/regular|green|unleaded/.test(s)) return 'regular_green';
  if (/premium|red/.test(s)) return 'premium_red';
  return null;
}

function fileToBase64(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const dataUrl = reader.result;
      const base64 = dataUrl.split(',')[1];
      resolve(base64 || '');
    };
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(file);
  });
}
