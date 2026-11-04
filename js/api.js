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
export const EXPLAIN_STYLES = {
  eli5: "ELI5: very simple words, short sentences, a toy example a 5-year-old would get.",
  plain: "Plain: simple and direct, no jargon, no story, just the idea in clear words.",
  story: "Story: a tiny 2-3 sentence story that shows the idea happening, then the point.",
  analogy: "Analogy: one everyday comparison (kitchen, sports, school) that makes the idea click.",
  straight: "Straight: the idea as it is, briefly, with no extra flavour.",
};

export const DEFAULT_SYSTEM = `You write throwaway True/False CASE STUDIES, silly and lore-dressed. Unhinged but still fair: absurd comparisons, dramatic stakes, funny explanations. Never change the facts to be funny — the joke is in the framing, not a lie. {caseType} Each case study must stand on its own: a named person in a concrete situation, with all the facts needed to judge it inside the case itself. NEVER write "according to the text", "according to the paragraph", "the paragraph says", "in the text", or any reference to a text the player may or may not have read. Assume the player has NOT read the paragraph — do not test recall of its wording. Test whether they can apply the underlying idea in a new situation. The question itself is the lesson: after they answer, the explanation teaches it. The first case study should be the easiest, a confidence win. Every answer must be decidable from the paragraph material and its layman's expansion below. Never test lore facts; lore is scene-dressing only. About half true, half false. False case studies must be plausible misapplications, not random nonsense. Simplify terms: write in short, plain, everyday words, and explain any technical term in simple words when it appears. Introduce terms through the questions, never before them: no glossary, no definitions up front. Each question introduces at most one new term, in a scenario that shows what it means in context — the first time a term appears, pair it with a plain-language clue in the scenario itself. Start with everyday ideas and build: later questions may reuse terms introduced in earlier ones, but never require a term that has not yet been introduced through a question. Explanations (the "why" field) are written in this style: {explainStyle} Never explain by just saying "because the paragraph says so" — explain the idea itself. Each question also carries a "hint": one clue that points at the rule without stating whether the case is true or false. Hints are earned, never free, so they must be useful but must not give the answer away. Your entire reply must be ONLY the JSON array, starting with [ and ending with ]. No markdown, no preamble, no explanation outside the array. The array looks like [{"q":"...","a":true,"why":"one explanation in the style above","hint":"one clue, not the answer"}].`;

export const DEFAULT_USER_TEMPLATE = `PARAGRAPH MATERIAL (this is what is being learned, and what decides every answer):
{paragraph}

LAYMAN'S EXPANSION (a researched, plain-words expansion of the same material — use it to make case studies accessible, never to contradict the paragraph):
{expansion}

LORE WORLD (inspiration / dressing only, never a source of answers):
{lore}

Write {count} NEW case study question(s). Avoid repeating these: {previous}
Seed: {seed}`;

export function buildMessages({ system, userTemplate, paragraph, lore, expansion, count, previous = [], explainStyle = "eli5", caseType = null }) {
  const subs = {
    "{paragraph}": (paragraph || "").slice(0, 4000),
    "{lore}": (lore || "No lore world given — use plain silly scenarios.").slice(0, 2000),
    "{expansion}": (expansion || "No expansion yet — use the paragraph alone.").slice(0, 4000),
    "{count}": String(count),
    "{previous}": previous.slice(-20).join(" | "),
    "{seed}": Math.random().toString(36).slice(2),
    "{explainStyle}": EXPLAIN_STYLES[explainStyle] || EXPLAIN_STYLES.eli5,
    "{caseType}": caseType ? caseType.instruction : "Case type: any varied, standalone case study.",
  };
  // Placeholders are substituted in BOTH prompts, so the visible editor
  // (which shows the placeholders) and the sent prompt stay in sync.
  let sys = (system || DEFAULT_SYSTEM).trim();
  let user = (userTemplate || DEFAULT_USER_TEMPLATE);
  for (const [k, v] of Object.entries(subs)) {
    sys = sys.split(k).join(v);
    user = user.split(k).join(v);
  }
  // If the user deleted a placeholder, the material still has to reach the model.
  if (!(userTemplate || "").includes("{paragraph}")) {
    user += `\n\nPARAGRAPH MATERIAL:\n${subs["{paragraph}"]}`;
  }
  if (!(userTemplate || "").includes("{lore}")) {
    user += `\n\nLORE WORLD:\n${subs["{lore}"]}`;
  }
  if (expansion && !(userTemplate || "").includes("{expansion}")) {
    user += `\n\nLAYMAN'S EXPANSION:\n${subs["{expansion}"]}`;
  }
  if (!(system || "").includes("{explainStyle}")) {
    sys += `\nExplanations are written in this style: ${subs["{explainStyle}"]}`;
  }
  if (!(system || "").includes("{caseType}") && caseType) {
    sys = `${caseType.instruction}\n${sys}`;
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
  const hint = obj.hint || obj.clue || "";
  if (typeof q !== "string" || q.trim().length <= 5 || typeof a !== "boolean") return null;
  return { q: q.trim(), a, why: typeof why === "string" ? why : "", hint: typeof hint === "string" ? hint : "" };
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

async function requestOnce({ apiKey, model, messages, temperature, maxTokens, plugins }) {
  const body = { model: model || "openai/gpt-oss-20b:free", messages, temperature, max_tokens: maxTokens };
  if (plugins) body.plugins = plugins;
  const r = await fetch(`${BASE}/chat/completions`, {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${apiKey}`,
      "Content-Type": "application/json",
      "HTTP-Referer": location.origin,
      "X-Title": "Lore Rush",
    },
    body: JSON.stringify(body),
  });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(j.error?.message || `OpenRouter HTTP ${r.status}. Check key / model.`);
  const raw = messageText(j.choices?.[0]?.message);
  const annotations = j.choices?.[0]?.message?.annotations || [];
  return { raw, questions: parseQuestions(raw), annotations };
}

export async function generateQuestions({ apiKey, model, paragraph, lore, expansion, count, previous = [], system, userTemplate, explainStyle, caseType, onRetry }) {
  if (!apiKey) throw new Error("Add an OpenRouter API key, or tap Play demo.");
  if (!paragraph || !paragraph.trim()) throw new Error("Paste the paragraph material first — scenarios are made from it, not from lore alone.");
  const messages = buildMessages({ system, userTemplate, paragraph, lore, expansion, count, previous, explainStyle, caseType });
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

// ---- Explain further: a real AI call, not revealing the canned why ----
// The ? button calls this. It explains the idea behind the current case
// in the chosen style, with a new everyday example. Before answering it
// must NOT state whether the case is true or false; after answering it
// explains why that answer is right, in depth.
export async function explainFurther({ apiKey, model, paragraph, expansion, question, answer, why, explainStyle = "eli5", answered = false }) {
  if (!apiKey) throw new Error("Add an OpenRouter API key for AI explanations.");
  if (!question) throw new Error("No current question to explain.");
  // Answer may come as a separate param (main.js) or on the question itself.
  if (answer === undefined) answer = question.a;
  const style = EXPLAIN_STYLES[explainStyle] || EXPLAIN_STYLES.eli5;
  const messages = [
    { role: "system", content: `Explain a case study further. Style: ${style} Explain the idea itself, in plain words, with a new everyday example and what to watch for next time. Do not just repeat the paragraph, and do not just repeat the short explanation. ${answered ? "The player has already answered, so explain in depth why the answer below is right." : "The player has NOT answered yet, so you must NOT state whether the case is true or false, and must not give the answer away — explain only the concepts involved."}` },
    { role: "user", content: `PARAGRAPH:\n${(paragraph || "").slice(0, 3000)}\n\nLAYMAN'S EXPANSION:\n${(expansion || "None.").slice(0, 3000)}\n\nCASE STUDY:\n${question.q}\n\nSHORT EXPLANATION SO FAR:\n${why || "(none)"}\n\n${answered ? `THE ANSWER WAS: ${answer ? "TRUE" : "FALSE"}. Explain further.` : "Explain the ideas in this case further, without giving the answer."}` },
  ];
  const res = await requestOnce({ apiKey, model, messages, temperature: 0.7, maxTokens: 800, plugins: null });
  const text = res.raw.trim();
  if (!text) throw new Error("AI explanation came back empty.");
  return text;
}

// ---- Layman's expansion: research, not a summary ----
// Uses OpenRouter's web plugin when asked (plugins: [{id: "web"}]).
// Note the cost honestly in the UI: web search charges even on free
// models (a few cents per request at the default 5 results). If the
// model/plugin refuses web search, we fall back to a paragraph-only
// expansion rather than failing the whole step.
export function normalizeSources(annotations) {
  return (annotations || []).map((a) => {
    const c = a.url_citation || a;
    return { title: c.title || c.url || "Source", url: c.url || "" };
  }).filter((s) => s.url);
}

export async function expandParagraph({ apiKey, model, paragraph, explainStyle = "eli5", useWeb = true }) {
  if (!apiKey) throw new Error("Add an OpenRouter API key, or tap Expand after entering one.");
  if (!paragraph || !paragraph.trim()) throw new Error("Paste a paragraph first, then expand it.");
  const style = EXPLAIN_STYLES[explainStyle] || EXPLAIN_STYLES.eli5;
  const messages = [
    { role: "system", content: `You research a topic and write a LAYMAN'S EXPANSION. This is NOT a summary: do not shorten the paragraph to its gist. Keep every idea in it, then expand it — explain each idea in plain everyday words, add an everyday example, say why it matters, say what people usually get wrong, and explain tricky terms in context as you go. Style: ${style} Use short paragraphs with clear headings: What it means, Why it matters, An everyday example, Tricky words, What people get wrong. If web search results are provided, use them to add real background and context beyond the paragraph, and do not invent facts beyond them. Write in plain words throughout.` },
    { role: "user", content: `PARAGRAPH TO EXPAND (not summarise — expand):\n${paragraph.slice(0, 4000)}` },
  ];
  const plugins = useWeb ? [{ id: "web", max_results: 5 }] : null;
  try {
    const res = await requestOnce({ apiKey, model, messages, temperature: 0.7, maxTokens: 3000, plugins });
    const text = res.raw.trim();
    if (!text) throw new Error("Expansion came back empty.");
    return { text, sources: normalizeSources(res.annotations), webUsed: Boolean(useWeb) };
  } catch (e) {
    // Web plugin refused (model/plugin support varies): retry without it.
    if (useWeb && /plugin|web|online/i.test(String(e.message || ""))) {
      const res = await requestOnce({ apiKey, model, messages, temperature: 0.7, maxTokens: 3000, plugins: null });
      if (!res.raw.trim()) throw e;
      return { text: res.raw.trim(), sources: normalizeSources(res.annotations), webUsed: false, webNote: "Web search was not available for this model, so this expansion used the paragraph only." };
    }
    throw e;
  }
}
