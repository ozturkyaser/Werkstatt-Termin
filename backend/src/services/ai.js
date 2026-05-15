import { getSetting } from './settings.js';

const SYSTEM_PROMPT = `Du bist ein spezialisierter Assistent für deutsche Fahrzeugscheine (Zulassungsbescheinigung Teil I, auch Fahrzeugbrief Teil I).
Extrahiere aus dem übergebenen Bild ALLE erkennbaren Daten und gib sie EXAKT als valides JSON zurück – ohne Fließtext, ohne Markdown, ohne Code-Zaun.

Wenn ein Feld nicht lesbar ist, gib null zurück. Normalisiere:
- Kennzeichen als Großbuchstaben mit Bindestrichen und Leerzeichen wie im Original (z.B. "B-AB 1234").
- Datum im ISO-Format YYYY-MM-DD.
- Kraftstoff nur als "Benzin" | "Diesel" | "Hybrid" | "Elektro" | "LPG/CNG" | null.
- year als Zahl (4-stellig, Jahr der Erstzulassung).
- mileage als Zahl (wenn nicht auf dem Schein: null).

Struktur:
{
  "customer": {
    "first_name": string|null,
    "last_name": string|null,
    "address": string|null,
    "birth_date": string|null
  },
  "vehicle": {
    "license_plate": string|null,
    "brand": string|null,          // Feld D.1 Hersteller
    "model": string|null,          // Feld D.2/D.3 Typ/Handelsbezeichnung
    "year": number|null,           // aus Feld B Erstzulassung
    "first_registration": string|null, // Feld B im ISO-Format
    "vin": string|null,            // Feld E Fahrzeug-Ident-Nr.
    "fuel_type": string|null,      // Feld P.3
    "displacement_ccm": number|null, // Feld P.1
    "power_kw": number|null,       // Feld P.2
    "hsn": string|null,            // Feld 2.1 Herstellerschlüsselnummer
    "tsn": string|null,            // Feld 2.2 Typschlüsselnummer
    "color": string|null,          // Feld R
    "seats": number|null           // Feld S.1
  },
  "confidence": "hoch"|"mittel"|"niedrig",
  "notes": string|null
}`;

async function callOpenAI({ apiKey, model, imageDataUrl }) {
  const resp = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model,
      temperature: 0,
      response_format: { type: 'json_object' },
      messages: [
        { role: 'system', content: SYSTEM_PROMPT },
        {
          role: 'user',
          content: [
            { type: 'text', text: 'Bitte analysiere diesen Fahrzeugschein und gib das JSON zurück.' },
            { type: 'image_url', image_url: { url: imageDataUrl, detail: 'high' } },
          ],
        },
      ],
    }),
  });
  if (!resp.ok) {
    const text = await resp.text();
    throw new Error(`OpenAI-Fehler (${resp.status}): ${text.slice(0, 300)}`);
  }
  const data = await resp.json();
  const content = data.choices?.[0]?.message?.content;
  if (!content) throw new Error('OpenAI: Keine Antwort erhalten');
  return JSON.parse(content);
}

async function callAnthropic({ apiKey, model, imageDataUrl }) {
  // Data URL in Base64 + Mediatype zerlegen
  const m = imageDataUrl.match(/^data:(image\/[a-zA-Z+]+);base64,(.+)$/);
  if (!m) throw new Error('Ungültiges Bildformat (Data-URL erforderlich)');
  const media_type = m[1];
  const base64Data = m[2];

  const resp = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({
      model,
      max_tokens: 1500,
      system: SYSTEM_PROMPT,
      messages: [
        {
          role: 'user',
          content: [
            { type: 'image', source: { type: 'base64', media_type, data: base64Data } },
            { type: 'text', text: 'Bitte analysiere diesen Fahrzeugschein und gib ausschließlich das JSON zurück.' },
          ],
        },
      ],
    }),
  });
  if (!resp.ok) {
    const text = await resp.text();
    throw new Error(`Anthropic-Fehler (${resp.status}): ${text.slice(0, 300)}`);
  }
  const data = await resp.json();
  const text = data.content?.[0]?.text || '';
  const jsonStart = text.indexOf('{');
  const jsonEnd = text.lastIndexOf('}');
  if (jsonStart === -1) throw new Error('Anthropic: Keine JSON-Antwort');
  return JSON.parse(text.slice(jsonStart, jsonEnd + 1));
}

export async function extractVehicleRegistration(imageDataUrl) {
  const provider = getSetting('ai_provider') || 'openai';
  const model = getSetting('ai_model');
  const apiKey = getSetting('ai_api_key');

  if (!apiKey) {
    throw new Error('Kein KI-API-Key konfiguriert. Bitte unter „Einstellungen" eintragen.');
  }
  if (!imageDataUrl?.startsWith('data:image/')) {
    throw new Error('Ungültiges Bild (erwartet wird eine Data-URL)');
  }

  if (provider === 'anthropic') {
    return callAnthropic({ apiKey, model: model || 'claude-3-5-sonnet-20241022', imageDataUrl });
  }
  return callOpenAI({ apiKey, model: model || 'gpt-4o-mini', imageDataUrl });
}

export function normalizePlate(plate) {
  if (!plate) return null;
  return String(plate).toUpperCase().replace(/\s+/g, ' ').trim();
}

// ==================== Kennzeichen-Erkennung ====================

const PLATE_PROMPT = `Du bist ein spezialisierter Assistent zum Lesen deutscher Kfz-Kennzeichen.
Lies aus dem Bild das Kfz-Kennzeichen und gib EXAKT ein JSON-Objekt zurück – ohne Fließtext, ohne Markdown.

Regeln:
- Kennzeichen im deutschen Format: "B-AB 1234" (Kürzel, Bindestrich, 1-2 Buchstaben Leerzeichen 1-4 Ziffern).
- Immer Großbuchstaben.
- Saisonkennzeichen: Zahlen neben der Ziffer im Feld "season_info", z.B. "04/10".
- Ist das Kennzeichen nicht lesbar oder gar nicht auf dem Bild → plate: null und confidence: "niedrig".

Struktur:
{
  "plate": string|null,
  "confidence": "hoch"|"mittel"|"niedrig",
  "country": string|null,
  "season_info": string|null,
  "notes": string|null
}`;

async function callOpenAIPlate({ apiKey, model, imageDataUrl }) {
  const resp = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
    body: JSON.stringify({
      model,
      temperature: 0,
      response_format: { type: 'json_object' },
      messages: [
        { role: 'system', content: PLATE_PROMPT },
        {
          role: 'user',
          content: [
            { type: 'text', text: 'Lies das Kennzeichen aus dem Bild.' },
            { type: 'image_url', image_url: { url: imageDataUrl, detail: 'high' } },
          ],
        },
      ],
    }),
  });
  if (!resp.ok) {
    const text = await resp.text();
    throw new Error(`OpenAI-Fehler (${resp.status}): ${text.slice(0, 300)}`);
  }
  const data = await resp.json();
  const content = data.choices?.[0]?.message?.content;
  if (!content) throw new Error('OpenAI: Keine Antwort erhalten');
  return JSON.parse(content);
}

async function callAnthropicPlate({ apiKey, model, imageDataUrl }) {
  const m = imageDataUrl.match(/^data:(image\/[a-zA-Z+]+);base64,(.+)$/);
  if (!m) throw new Error('Ungültiges Bildformat (Data-URL erforderlich)');
  const resp = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({
      model, max_tokens: 400,
      system: PLATE_PROMPT,
      messages: [{
        role: 'user',
        content: [
          { type: 'image', source: { type: 'base64', media_type: m[1], data: m[2] } },
          { type: 'text', text: 'Lies das Kennzeichen aus dem Bild und gib ausschließlich das JSON zurück.' },
        ],
      }],
    }),
  });
  if (!resp.ok) {
    const text = await resp.text();
    throw new Error(`Anthropic-Fehler (${resp.status}): ${text.slice(0, 300)}`);
  }
  const data = await resp.json();
  const text = data.content?.[0]?.text || '';
  const s = text.indexOf('{'), e = text.lastIndexOf('}');
  if (s === -1) throw new Error('Anthropic: Keine JSON-Antwort');
  return JSON.parse(text.slice(s, e + 1));
}

export async function recognizeLicensePlate(imageDataUrl) {
  const provider = getSetting('ai_provider') || 'openai';
  const model = getSetting('ai_model');
  const apiKey = getSetting('ai_api_key');
  if (!apiKey) throw new Error('Kein KI-API-Key konfiguriert. Bitte unter „Einstellungen → KI" eintragen.');
  if (!imageDataUrl?.startsWith('data:image/')) throw new Error('Ungültiges Bild (Data-URL erforderlich)');

  const result = provider === 'anthropic'
    ? await callAnthropicPlate({ apiKey, model: model || 'claude-3-5-sonnet-20241022', imageDataUrl })
    : await callOpenAIPlate({ apiKey, model: model || 'gpt-4o-mini', imageDataUrl });

  return {
    ...result,
    plate: normalizePlate(result?.plate),
  };
}

// Einfacher String-Vergleich mit Toleranz (Buchstabe/Ziffer dreht sich manchmal)
export function platesMatch(a, b) {
  if (!a || !b) return false;
  const na = normalizePlate(a)?.replace(/[-\s]/g, '') || '';
  const nb = normalizePlate(b)?.replace(/[-\s]/g, '') || '';
  if (na === nb) return true;
  // Levenshtein ≤ 1 tolerieren (Kamera-Unschärfe)
  return levenshtein(na, nb) <= 1 && Math.abs(na.length - nb.length) <= 1;
}

function levenshtein(a, b) {
  if (a === b) return 0;
  const m = a.length, n = b.length;
  if (!m) return n; if (!n) return m;
  const dp = Array.from({ length: m + 1 }, (_, i) => [i, ...Array(n).fill(0)]);
  for (let j = 1; j <= n; j++) dp[0][j] = j;
  for (let i = 1; i <= m; i++)
    for (let j = 1; j <= n; j++)
      dp[i][j] = a[i - 1] === b[j - 1]
        ? dp[i - 1][j - 1]
        : 1 + Math.min(dp[i - 1][j], dp[i][j - 1], dp[i - 1][j - 1]);
  return dp[m][n];
}
