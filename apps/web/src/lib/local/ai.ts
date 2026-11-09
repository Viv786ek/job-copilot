/**
 * Optional in-browser AI using the user's own Google Gemini API key (free tier at aistudio.google.com).
 * The key is stored only in this browser's localStorage and sent only to Google's API.
 * Every output is schema-validated; resume output also passes the honesty guardrails.
 */
import type { ZodTypeAny, z } from 'zod';

const KEY = 'job-copilot-gemini-key';
const MODEL_KEY = 'job-copilot-gemini-model';

export function getAiKey(): string | null {
  try {
    return window.localStorage.getItem(KEY);
  } catch {
    return null;
  }
}

export function getAiModel(): string {
  try {
    return window.localStorage.getItem(MODEL_KEY) || 'gemini-2.5-flash';
  } catch {
    return 'gemini-2.5-flash';
  }
}

export function setAiKey(key: string | null, model?: string) {
  try {
    if (key) window.localStorage.setItem(KEY, key.trim());
    else window.localStorage.removeItem(KEY);
    if (model) window.localStorage.setItem(MODEL_KEY, model);
  } catch {
    /* storage blocked */
  }
}

function extractJson(text: string): unknown {
  const t = text.trim().replace(/^```(?:json)?\s*/i, '').replace(/```\s*$/, '');
  try {
    return JSON.parse(t);
  } catch {
    const s = t.indexOf('{');
    const e = t.lastIndexOf('}');
    return s >= 0 && e > s ? JSON.parse(t.slice(s, e + 1)) : null;
  }
}

export async function geminiJson<S extends ZodTypeAny>(schema: S, prompt: { system: string; user: string }): Promise<z.infer<S>> {
  const key = getAiKey();
  if (!key) throw new Error('No AI key configured');
  const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(getAiModel())}:generateContent`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-goog-api-key': key },
    body: JSON.stringify({
      systemInstruction: { parts: [{ text: prompt.system }] },
      contents: [{ role: 'user', parts: [{ text: prompt.user }] }],
      generationConfig: { temperature: 0.3, maxOutputTokens: 8192, responseMimeType: 'application/json' },
    }),
  });
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Gemini error ${res.status}: ${body.slice(0, 200)}`);
  }
  const data = (await res.json()) as { candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }> };
  const text = data.candidates?.[0]?.content?.parts?.map((p) => p.text ?? '').join('') ?? '';
  const parsed = schema.safeParse(extractJson(text));
  if (!parsed.success) throw new Error('AI returned an unexpected format; used the built-in generator instead.');
  return parsed.data;
}

export async function testAiKey(key: string, model: string): Promise<void> {
  const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}`, {
    headers: { 'x-goog-api-key': key.trim() },
  });
  if (!res.ok) throw new Error(`Key rejected by Google (${res.status})`);
}
