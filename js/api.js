// Adapter: OpenRouter only. The browser calls it directly — there is no backend to leak a key to.
const BASE = "https://openrouter.ai/api/v1";

export async function fetchModels() {
  const r = await fetch(`${BASE}/models`);
  if (!r.ok) throw new Error(`Models failed: HTTP ${r.status}`);
  const j = await r.json();
  // Free models first, then alphabetical — free is the addictive default.
  return (j.data || []).map((m) => m.id).sort((a, b) =>
    (b.includes(":free") - a.includes(":free")) || a.localeCompare(b));
}

// ---- Prompt: this is what the UI shows and lets you edit. ----
// The user template's {placeholders} are filled in by buildMessages().
// What you see in the editor is what gets sent on the first attempt,
// except those placeholders being substituted. A failed parse triggers
// ONE stricter retry (see generateQuestions), which the loading text says.
export const DEFAULT_SYSTEM = `You write throwaway True/False quiz questions as silly use-case scenarios. Unhinged but still fair: absurd comparisons, dramatic stakes, funny explanations. Never change the facts to be funny — the joke is in the framing, not a lie. Each question must be a short scenario: someone in the lore world tries to USE the paragraph material, and the player judges True/False — did they apply it correctly? Every answer must be decidable ONLY from the paragraph below. Never test lore facts; lore is scene-dressing only. About half true, half false. False scenarios must be plausible misapplications, not random nonsense. Your entire reply must be ONLY the JSON array, starting with [ and ending with ]. No markdown, no preamble, no explanation outside the array. The array looks like [{"q":"...","a":true,"why":"one funny sentence naming the paragraph rule"}].`;

export const DEFAULT_USER_TEMPLATE = `PARAGRAPH MATERIAL (this is what is being learned, and what decides every answer):
{paragraph}

LORE WORLD (inspiration / dressing only, never a source of answers):
{lore}

Write {count} NEW scenario questions. Avoid repeating these: {previous}
Seed: {seed}`;

export function buildMessages({ system, userTemplate, paragraph, lore, count, previous = [] }) {
  const sys = (system || DEFAULT_SYSTEM).trim();
  let user = (userTemplate || DEFAULT_USER_TEMPLATE);
  const subs = {
    "{paragraph}": (paragraph || "").slice(0, 4000),
    "{lore}": (lore || "No lore world given — use plain silly scenarios.").slice(0, 2000),
    "{count}": String(count),
    "{previous}": previous.slice(-20).join(" | "),
    "{seed}": Math.random().toString(36).slice(2),
  };
  for (const [k, v] of Object.entries(subs)) user = user.split(k).join(v);
  // If the user deleted a placeholder, the material still has to reach the model.
  if (!user.includes(subs["{paragraph}"]) && !(userTemplate || "").includes("{paragraph}")) {
    user += `\n\nPARAGRAPH MATERIAL:\n${subs["{paragraph}"]}`;
  }
  if (!(userTemplate || "").includes("{lore}")) {
    user += `\n\nLORE WORLD:\n${subs["{lore}"]}`;
  }
  return [
    { role: "system", content: sys },
    { role: "user", content: user },
  ];
}

// Backwards-compatible wrapper used by older tests / callers.
export function promptFor(paragraph, lore, count, _silly, previous) {
  return buildMessages({ paragraph, lore, count, previous });
}

// ---- Message text: some models put the answer in reasoning, or in parts. ----
export function messageText(message = {}) {
  if (typeof message.content === "string" && message.content.trim()) return message.content;
  if (Array.isArray(message.content)) {
    const t = message.content.map((p) => (typeof p === "string" ? p : p.text || "")).join("");
    if (t.trim()) return t;
  }
  if (typeof message.reasoning_content === "string" && message.reasoning_content.trim()) return message.reasoning_content;
  if (typeof message.reasoning === "string" && message.reasoning.trim()) return message.reasoning;
  return "";
}

// ---- JSON parsing: forgiving on purpose. Small/free models rarely return clean JSON. ----
function tryJson(text) {
  try { return JSON.parse(text); } catch { return null; }
}
function repairJson(text) {
  // Trailing commas are the most common small-model slip.
  return text.replace(/,\s*([\]}])/g, "$1");
}
function normalize(obj) {
  if (!obj || typeof obj !== "object") return null;
  const q = obj.q || obj.question || obj.text || obj.statement;
  let a = obj.a ?? obj.answer ?? obj.isTrue ?? obj.correct;
  if (typeof a === "string") a = a.trim().toLowerCase() === "true" || a.trim().toLowerCase() === "yes";
  if (typeof a === "number") a = a === 1;
  const why = obj.why || obj.explanation || obj.reason || "";
  if (typeof q !== "string" || q.trim().length <= 5 || typeof a !== "boolean") return null;
  return { q: q.trim(), a, why: typeof why === "string" ? why : "" };
}
function normalizeArray(arr) {
  return (Array.isArray(arr) ? arr : []).map(normalize).filter(Boolean);
}

export function parseQuestions(text) {
  if (!text || typeof text !== "string") return [];
  let t = text.trim();
  // Strip markdown fences, which many models add despite "JSON only".
  t = t.replace(/```(?:json)?\s*/gi, "").replace(/```/g, "").trim();
  // 1. Whole thing is JSON (array, or an object wrapping an array).
  let parsed = tryJson(t) || tryJson(repairJson(t));
  if (Array.isArray(parsed)) {
    const out = normalizeArray(parsed);
    if (out.length) return out;
  }
  if (parsed && typeof parsed === "object") {
    for (const v of Object.values(parsed)) {
      const out = normalizeArray(v);
      if (out.length) return out;
    }
  }
  // 2. Balanced-bracket scan: find each [...] candidate, longest first, and parse it.
  const candidates = [];
  for (let i = 0; i < t.length; i++) {
    if (t[i] !== "[") continue;
    let depth = 0, inStr = false, esc = false;
    for (let j = i; j < t.length; j++) {
      const c = t[j];
      if (inStr) { if (esc) esc = false; else if (c === "\\") esc = true; else if (c === '"') inStr = false; continue; }
      if (c === '"') inStr = true;
      else if (c === "[") depth++;
      else if (c === "]") { depth--; if (depth === 0) { candidates.push(t.slice(i, j + 1)); break; } }
    }
  }
  candidates.sort((a, b) => b.length - a.length);
  for (const cand of candidates) {
    const p = tryJson(cand) || tryJson(repairJson(cand));
    const out = normalizeArray(p);
    if (out.length) return out;
  }
  // 3. Last resort: individual flat {...} objects that look like questions.
  const objs = t.match(/\{[^{}]*\}/g) || [];
  const out = objs.map((o) => normalize(tryJson(o) || tryJson(repairJson(o)))).filter(Boolean);
  return out;
}

async function requestOnce({ apiKey, model, messages, temperature, maxTokens }) {
  const r = await fetch(`${BASE}/chat/completions`, {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${apiKey}`,
      "Content-Type": "application/json",
      "HTTP-Referer": location.origin,
      "X-Title": "Lore Rush",
    },
    body: JSON.stringify({ model: model || "openai/gpt-oss-20b:free", messages, temperature, max_tokens: maxTokens }),
  });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(j.error?.message || `OpenRouter HTTP ${r.status}. Check key / model.`);
  const raw = messageText(j.choices?.[0]?.message);
  return { raw, questions: parseQuestions(raw) };
}

export async function generateQuestions({ apiKey, model, paragraph, lore, count, previous = [], system, userTemplate, onRetry }) {
  if (!apiKey) throw new Error("Add an OpenRouter API key, or tap Play demo.");
  if (!paragraph || !paragraph.trim()) throw new Error("Paste the paragraph material first — scenarios are made from it, not from lore alone.");
  const messages = buildMessages({ system, userTemplate, paragraph, lore, count, previous });
  const maxTokens = Math.min(8000, Math.max(3000, count * 180));
  const first = await requestOnce({ apiKey, model, messages, temperature: 0.9, maxTokens });
  if (first.questions.length) return first.questions;
  // One stricter retry: low temperature, and the JSON-only rule restated.
  // This is a repair attempt, not a silent second generation — the caller
  // shows it in the loading text, and the raw reply is shown on failure.
  if (onRetry) onRetry();
  const strict = [
    messages[0],
    { role: "user", content: `${messages[1].content}\n\nREMINDER: Reply with NOTHING except the JSON array. It must start with [ and end with ].` },
  ];
  const second = await requestOnce({ apiKey, model, messages: strict, temperature: 0.2, maxTokens });
  if (second.questions.length) return second.questions;
  const err = new Error("Model did not return a usable JSON array, even after a stricter retry. See the raw reply below, edit the prompt, or try a model that follows JSON instructions better.");
  err.raw = (second.raw || first.raw || "").slice(0, 2000);
  throw err;
}
