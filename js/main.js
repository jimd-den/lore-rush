// Orchestration only: setup -> break/expand -> play -> cloze card.
// DOM lives in ui.js, scoring in game.js, network/prompts in api.js,
// cloze in cloze.js, paragraph splitting in breakdown.js, variety in
// variety.js. This file wires them together and owns run state only.
import { answerQuestion, loadTotals, saveTotals } from "./game.js";
import { fetchModels, generateQuestions, expandParagraph, explainFurther, DEFAULT_SYSTEM, DEFAULT_USER_TEMPLATE, buildMessages } from "./api.js";
import { SAMPLES, DEMO_QUESTIONS, DEMO_PARAGRAPH } from "./demo.js";
import { clozeTokens, checkAnswer } from "./cloze.js";
import { splitParagraph } from "./breakdown.js";
import { shuffledCaseTypes, pick, PRAISE, OOPS } from "./variety.js";
import { els, show, renderHeader, renderBreakdown, renderExpansion, renderFeedback, setError, showRaw, resetPlay } from "./ui.js";
import { randomSlots, evaluateSlots, earnForAnswer, earnForReading, earnForExplanationRequest, useHint, idleRate } from "./clicker.js";

let totals = loadTotals();
let queue = [], asked = [], current = null, startMs = 0, answeredNow = false;
let runStart = null, isDemo = false, touchX = null;
let runId = 0, runActive = false, fetching = false, waiting = false;
let clozeInputs = [], awardedCloze = new Set();
// Expansion + variety state for the current run (session only, not saved).
let expansionText = "", expansionSources = [], caseOrder = [], caseIndex = 0;
let expansionReadAwarded = false, explainRequested = false;
// Idle: pays only once unlocked (10 answered), per clicker.js idleRate.
setInterval(() => {
  const rate = idleRate(totals.answered);
  if (rate <= 0) return; // idle pays silently now: no idle label on the play screen
  totals.coins = (totals.coins || 0) + rate;
  saveTotals(totals);
  renderHeader(totals);
}, 10000);

function nextCaseType() {
  if (!caseOrder.length) caseOrder = shuffledCaseTypes();
  const t = caseOrder[caseIndex % caseOrder.length];
  caseIndex += 1;
  return t;
}
// True and False beep differently, and correct/wrong beep differently again:
// True+correct 880, False+correct 660, True+wrong 220, False+wrong 180.
function beepFor(given, correct) {
  try {
    const freq = correct ? (given ? 880 : 660) : (given ? 220 : 180);
    const ctx = new (window.AudioContext || window.webkitAudioContext)();
    const o = ctx.createOscillator(), g = ctx.createGain();
    o.connect(g); g.connect(ctx.destination);
    o.frequency.value = freq; g.gain.value = 0.08;
    o.start(); o.stop(ctx.currentTime + 0.15);
  } catch { /* sound is garnish, never a blocker */ }
}

// --- Lore library (localStorage only) ---
function loadLibrary() {
  try { return JSON.parse(localStorage.getItem("lorerush:library") || "[]"); } catch { return []; }
}
function renderLibrary() {
  const lib = loadLibrary();
  els.library.innerHTML = `<option value="">— paste new lore —</option>` +
    lib.map((t, i) => `<option value="${i}">${t.slice(0, 48).replace(/</g, "&lt;")}${t.length > 48 ? "…" : ""}</option>`).join("");
}
els.library.addEventListener("change", () => {
  const lib = loadLibrary();
  if (els.library.value !== "") els.lore.value = lib[Number(els.library.value)];
});
document.getElementById("saveLore").addEventListener("click", () => {
  const t = els.lore.value.trim();
  if (!t) return;
  const lib = loadLibrary();
  if (!lib.includes(t)) lib.unshift(t);
  localStorage.setItem("lorerush:library", JSON.stringify(lib.slice(0, 20)));
  renderLibrary();
  setError("Saved to your library on this device.");
});
document.querySelectorAll("[data-sample]").forEach((b) =>
  b.addEventListener("click", () => { els.lore.value = SAMPLES[b.dataset.sample]; }));

// --- Settings persistence (key is local-only; never sent anywhere but OpenRouter) ---
els.apiKey.value = localStorage.getItem("lorerush:key") || "";
els.model.value = localStorage.getItem("lorerush:model") || "";
els.explainStyle.value = localStorage.getItem("lorerush:explainStyle") || "eli5";
els.showWhy.checked = localStorage.getItem("lorerush:showWhy") !== "0";
els.webSearch.checked = localStorage.getItem("lorerush:webSearch") !== "0";
els.explainStyle.addEventListener("change", () => localStorage.setItem("lorerush:explainStyle", els.explainStyle.value));
els.showWhy.addEventListener("change", () => localStorage.setItem("lorerush:showWhy", els.showWhy.checked ? "1" : "0"));
els.webSearch.addEventListener("change", () => localStorage.setItem("lorerush:webSearch", els.webSearch.checked ? "1" : "0"));
document.getElementById("fetchModels").addEventListener("click", async () => {
  setError("Loading models…");
  try {
    const ids = await fetchModels();
    els.models.innerHTML = ids.slice(0, 200).map((id) => `<option value="${id}">`).join("");
    setError(`${ids.length} models loaded. Free ones first.`);
  } catch (e) { setError(String(e.message || e)); }
});

// --- Prompt editor: visible, editable, saved on this device, CLOSED by default ---
const TONES = {
  unhinged: "Unhinged but still fair: absurd comparisons, dramatic stakes, funny explanations. Never change the facts to be funny — the joke is in the framing, not a lie.",
  mild: "Lightly silly: playful wording, one funny line per explanation.",
};
els.systemPrompt.value = localStorage.getItem("lorerush:system") || DEFAULT_SYSTEM;
els.userPrompt.value = localStorage.getItem("lorerush:userTemplate") || DEFAULT_USER_TEMPLATE;
function savePrompt() {
  localStorage.setItem("lorerush:system", els.systemPrompt.value);
  localStorage.setItem("lorerush:userTemplate", els.userPrompt.value);
}
els.systemPrompt.addEventListener("change", savePrompt);
els.userPrompt.addEventListener("change", savePrompt);
els.silly.addEventListener("change", () => {
  const tone = TONES[els.silly.value];
  let sys = els.systemPrompt.value;
  let replaced = false;
  for (const old of Object.values(TONES)) {
    if (sys.includes(old)) { sys = sys.replace(old, tone); replaced = true; break; }
  }
  if (!replaced) sys = `${sys.trim()}\n${tone}`;
  els.systemPrompt.value = sys;
  savePrompt();
});
document.getElementById("previewPrompt").addEventListener("click", () => {
  const msgs = buildMessages({
    system: els.systemPrompt.value, userTemplate: els.userPrompt.value,
    paragraph: els.paragraph.value, lore: els.lore.value, expansion: expansionText,
    count: 1, previous: asked.map((q) => q.q), explainStyle: els.explainStyle.value,
    caseType: nextCaseType(),
  });
  showRaw(msgs.map((m) => `${m.role.toUpperCase()}:\n${m.content}`).join("\n\n---\n\n"));
});
document.getElementById("resetPrompt").addEventListener("click", () => {
  localStorage.removeItem("lorerush:system");
  localStorage.removeItem("lorerush:userTemplate");
  els.systemPrompt.value = DEFAULT_SYSTEM;
  els.userPrompt.value = DEFAULT_USER_TEMPLATE;
  setError("Prompt reset to defaults.");
});

// --- Break it down + layman's expansion (no summary, web-researched) ---
document.getElementById("breakBtn").addEventListener("click", () => {
  const chunks = splitParagraph(els.paragraph.value);
  if (!chunks.length) { setError("Paste a paragraph first, then break it down."); return; }
  renderBreakdown(chunks);
  setError(`${chunks.length} ideas, broken out — tap Expand for the plain-words version.`);
});
document.getElementById("expandBtn").addEventListener("click", async () => {
  const paragraph = els.paragraph.value.trim();
  if (!paragraph) { setError("Paste a paragraph first, then expand it."); return; }
  setError("Researching a layman's expansion… (web search costs a few cents even on free models)");
  try {
    const res = await expandParagraph({
      apiKey: els.apiKey.value.trim(), model: els.model.value.trim(), paragraph,
      explainStyle: els.explainStyle.value, useWeb: els.webSearch.checked,
    });
    expansionText = res.text;
    expansionSources = res.sources;
    expansionReadAwarded = false;
    renderExpansion({ text: res.text, sources: res.sources, webUsed: res.webUsed, webNote: res.webNote });
    setError("Expansion ready — case studies will use it alongside the paragraph. Tap Generate & Play.");
  } catch (e) {
    setError(String(e.message || e));
  }
});
els.expansionDetails.addEventListener("toggle", () => {
  // Reading pays: first time this expansion is opened, +10 coins.
  if (!els.expansionDetails.open || !expansionText || expansionReadAwarded) return;
  expansionReadAwarded = true;
  const earn = earnForReading(totals);
  saveTotals(totals);
  renderHeader(totals);
  els.expansionNote.textContent += ` +${earn.coins} 🪙 for reading.`;
});
document.getElementById("clearExpansion").addEventListener("click", () => {
  expansionText = ""; expansionSources = []; expansionReadAwarded = false;
  els.expansionDetails.classList.add("hidden");
  els.expansionDetails.open = false;
  setError("Expansion cleared — case studies will use the paragraph alone.");
});

// --- Generation: one case study at a time, asynchronously, varied ---
async function startRun(demo) {
  isDemo = demo;
  const paragraph = els.paragraph.value.trim();
  const lore = els.lore.value.trim();
  if (!paragraph) { setError("Paste the paragraph material first — case studies are made from it. Lore is optional flavor."); return; }
  localStorage.setItem("lorerush:key", els.apiKey.value.trim());
  localStorage.setItem("lorerush:model", els.model.value.trim());
  savePrompt();
  runId += 1;
  runActive = true;
  fetching = false;
  waiting = false;
  caseOrder = shuffledCaseTypes(); // fresh variety order every run
  caseIndex = 0;
  runStart = { ...totals, answered: totals.answered, correct: totals.correct };
  asked = []; queue = [];
  if (demo) {
    queue = DEMO_QUESTIONS.map((q, i) => ({ ...q, _type: caseOrder[i % caseOrder.length] })).sort(() => Math.random() - 0.5);
    show("play");
    nextQuestion();
    return;
  }
  els.loadingMsg.textContent = "Generating your first case study…";
  show("loading");
  const myRun = runId;
  try {
    const type = nextCaseType();
    const first = await generateQuestions({
      apiKey: els.apiKey.value.trim(), model: els.model.value.trim(),
      paragraph, lore, expansion: expansionText, count: 1, previous: [],
      system: els.systemPrompt.value, userTemplate: els.userPrompt.value,
      explainStyle: els.explainStyle.value, caseType: type,
      onRetry: () => { els.loadingMsg.textContent = "First reply wasn't usable JSON — retrying once, more strictly…"; },
    });
    if (!runActive || myRun !== runId) return;
    queue.push(...first.map((q) => ({ ...q, _type: type })));
  } catch (e) {
    if (!runActive || myRun !== runId) return;
    show("setup");
    setError(String(e.message || e));
    if (e.raw) showRaw(e.raw);
    return;
  }
  show("play");
  nextQuestion();
  prefetch();
}
document.getElementById("generate").addEventListener("click", () => startRun(false));
document.getElementById("demo").addEventListener("click", () => {
  if (!els.lore.value.trim()) els.lore.value = SAMPLES.cat;
  if (!els.paragraph.value.trim()) els.paragraph.value = DEMO_PARAGRAPH;
  startRun(true);
});
document.getElementById("moreBtn").addEventListener("click", () => startRun(isDemo));
document.getElementById("newLoreBtn").addEventListener("click", () => show("setup"));

async function prefetch() {
  if (isDemo || !runActive) return;
  while (runActive && queue.length < 3 && !fetching) {
    fetching = true;
    const myRun = runId;
    try {
      const type = nextCaseType();
      const one = await generateQuestions({
        apiKey: els.apiKey.value.trim(), model: els.model.value.trim(),
        paragraph: els.paragraph.value, lore: els.lore.value, expansion: expansionText, count: 1,
        previous: [...asked.map((q) => q.q), ...queue.map((q) => q.q)],
        system: els.systemPrompt.value, userTemplate: els.userPrompt.value,
        explainStyle: els.explainStyle.value, caseType: type,
      });
      if (!runActive || myRun !== runId) return;
      if (one.length) {
        queue.push(...one.map((q) => ({ ...q, _type: type })));
        if (waiting) { waiting = false; nextQuestion(); }
      }
    } catch {
      if (waiting) {
        els.question.textContent = "Couldn't generate the next one. Tap the card to retry.";
        els.btnTrue.disabled = els.btnFalse.disabled = true;
      }
      break;
    } finally {
      fetching = false;
    }
  }
}

// --- Play loop ---
function nextQuestion() {
  answeredNow = false;
  explainRequested = false;
  els.feedback.classList.add("hidden");
  resetPlay();
  els.btnTrue.disabled = els.btnFalse.disabled = false;
  if (!queue.length) {
    if (isDemo || !runActive) { showLoreCard(); return; }
    waiting = true;
    current = null;
    els.question.textContent = "⏳ Generating your next case study…";
    els.qCount.textContent = `Q ${asked.length + 1}`;
    els.btnTrue.disabled = els.btnFalse.disabled = true;
    prefetch();
    return;
  }
  waiting = false;
  current = queue[0];
  asked.push(current);
  els.question.textContent = current.q;
  els.qCount.textContent = `Q ${asked.length}`;
  els.caseType.textContent = current._type ? `${current._type.emoji} ${current._type.label}` : "";
  els.qCard.classList.remove("shake");
  void els.qCard.offsetWidth;
  startMs = Date.now();
  prefetch();
}
function answer(given) {
  if (waiting || !current || answeredNow) return;
  answeredNow = true;
  const res = answerQuestion(totals, current, given, Date.now() - startMs);
  const earn = earnForAnswer(totals, res.correct);
  saveTotals(totals);
  renderHeader(totals);

  els.btnTrue.disabled = els.btnFalse.disabled = true;
  const styleKey = els.explainStyle.value;
  const styleLabel = { eli5: "ELI5", plain: "Plain", story: "Story", analogy: "Analogy", straight: "Straight" }[styleKey] || "ELI5";
  renderFeedback({
    correct: res.correct, xp: res.xp, streak: totals.streak, why: current.why,
    answerTrue: current.a, showWhy: els.showWhy.checked,
    praise: pick(PRAISE), oops: pick(OOPS), styleLabel,
  });
  if (!res.correct) els.qCard.classList.add("shake");
  // Slot bonus, instant now: no reel box on the play screen, just one line
  // in the feedback. It never blocks advancing.
  let slotLine = "";
  if (res.correct) {
    const bonus = evaluateSlots(randomSlots());
    if (bonus.xp) totals.xp += bonus.xp;
    totals.coins = (totals.coins || 0) + bonus.coins;
    totals.level = Math.floor(totals.xp / 100) + 1;
    saveTotals(totals);
    renderHeader(totals);
    slotLine = `<br><small>${bonus.label} +${bonus.xp} XP +${bonus.coins} 🪙</small>`;
  }
  els.feedback.innerHTML += `<br><small>+${res.xp} XP +${earn.coins} 🪙${earn.hintEarned ? " +1 💡 hint earned!" : ""}</small>${slotLine}`;
  beepFor(given, res.correct);
}
// Hint (earned, never free) and ? (real AI explanation, further).
els.hintBtn.addEventListener("click", () => {
  if (!current || answeredNow) return;
  if (!useHint(totals)) {
    els.hintText.textContent = "No hints left — earn 1 per 5 correct answers.";
    els.hintText.classList.remove("hidden");
    return;
  }
  saveTotals(totals);
  renderHeader(totals);
  els.hintText.textContent = current.hint || "Think about what the rule actually requires, not what sounds fancy.";
  els.hintText.classList.remove("hidden");
});
els.askBtn.addEventListener("click", async () => {
  if (!current || explainRequested) return;
  explainRequested = true;
  const earn = earnForExplanationRequest(totals);
  saveTotals(totals);
  renderHeader(totals);
  els.aiExplain.textContent = "💡 Asking the AI to explain further…";
  els.aiExplain.classList.remove("hidden");
  if (isDemo) {
    els.aiExplain.textContent = `💡 ${current.why || "No short explanation for this one."} (+${earn.coins} 🪙 for asking)`;
    return;
  }
  try {
    const text = await explainFurther({
      apiKey: els.apiKey.value.trim(), model: els.model.value.trim(),
      paragraph: els.paragraph.value, expansion: expansionText,
      question: current, answer: current.a, why: current.why,
      explainStyle: els.explainStyle.value, answered: answeredNow,
    });
    els.aiExplain.textContent = `💡 ${text} (+${earn.coins} 🪙 for asking)`;
  } catch (e) {
    els.aiExplain.textContent = `💡 ${current.why || "No short explanation for this one."} (AI explanation failed: ${String(e.message || e)})`;
  }
});
function advance() {
  if (waiting) { nextQuestion(); return; }
  queue.shift();
  nextQuestion();
}
// True/False tap: first tap answers, second tap (after answering) advances.
// That, plus tapping the card, is the whole advance mechanism — no Next button.
els.btnTrue.addEventListener("click", () => { if (answeredNow) advance(); else answer(true); });
els.btnFalse.addEventListener("click", () => { if (answeredNow) advance(); else answer(false); });
els.qCard.addEventListener("click", () => { if (answeredNow) advance(); });
els.endBtn.addEventListener("click", showLoreCard);
els.qCard.addEventListener("touchstart", (e) => { touchX = e.changedTouches[0].clientX; }, { passive: true });
els.qCard.addEventListener("touchend", (e) => {
  if (touchX == null) return;
  const dx = e.changedTouches[0].clientX - touchX;
  if (Math.abs(dx) > 60) answer(dx > 0);
  touchX = null;
});
document.addEventListener("keydown", (e) => {
  if (els.play.classList.contains("hidden")) return;
  if (answeredNow) { if (["t", "T", "f", "F", "ArrowRight", "ArrowLeft", " ", "Enter"].includes(e.key)) { e.preventDefault(); advance(); } return; }
  if (e.key === "t" || e.key === "T" || e.key === "ArrowRight") answer(true);
  else if (e.key === "f" || e.key === "F" || e.key === "ArrowLeft") answer(false);
});

// Cloze card: the same paragraph the case studies tested, blanked for recall.
function buildCloze() {
  const para = els.paragraph.value.trim();
  els.clozeText.innerHTML = "";
  els.clozeScore.textContent = "";
  clozeInputs = [];
  awardedCloze = new Set();
  if (!para) {
    els.clozeText.textContent = "No learning paragraph was given — paste one on the setup screen and play again, and it will appear here as fill-in-the-blank.";
    return;
  }
  for (const tok of clozeTokens(para)) {
    if (!tok.blank) { els.clozeText.appendChild(document.createTextNode(tok.text)); continue; }
    if (tok.pre) els.clozeText.appendChild(document.createTextNode(tok.pre));
    const input = document.createElement("input");
    input.className = "blank";
    input.size = Math.max(4, tok.answer.length);
    input.setAttribute("aria-label", "Fill in the missing word");
    input.dataset.answer = tok.answer;
    els.clozeText.appendChild(input);
    clozeInputs.push(input);
    if (tok.post) els.clozeText.appendChild(document.createTextNode(tok.post));
  }
  els.clozeScore.textContent = `${clozeInputs.length} blanks. Fill from memory — no peeking at the setup screen.`;
}
document.getElementById("checkCloze").addEventListener("click", () => {
  if (!clozeInputs.length) return;
  let correct = 0;
  clozeInputs.forEach((input, i) => {
    const ok = checkAnswer(input.value, input.dataset.answer);
    input.classList.toggle("correct", ok);
    input.classList.toggle("wrong", !ok);
    if (ok) {
      correct += 1;
      if (!awardedCloze.has(i)) { awardedCloze.add(i); totals.xp += 20; }
    }
  });
  saveTotals(totals);
  renderHeader(totals);
  els.clozeScore.textContent = correct === clozeInputs.length
    ? `Perfect recall: ${correct}/${clozeInputs.length} — that's the lore loop paying off.`
    : `${correct}/${clozeInputs.length} correct (+20 XP per first-time correct blank). Fix the red ones and check again.`;
});
document.getElementById("revealCloze").addEventListener("click", () => {
  clozeInputs.forEach((input) => {
    input.value = input.dataset.answer;
    input.classList.add("revealed");
    input.disabled = true;
  });
  els.clozeScore.textContent = "Revealed — no XP for these. Read them once, then try a fresh run.";
});

function showLoreCard() {
  runActive = false;
  waiting = false;
  buildCloze();
  const answered = totals.answered - (runStart?.answered || 0);
  const correct = totals.correct - (runStart?.correct || 0);
  els.statXp.textContent = `+${totals.xp - (runStart?.xp || 0)}`;
  els.statAcc.textContent = answered ? `${Math.round((correct / answered) * 100)}%` : "—";
  els.statStreak.textContent = totals.bestStreak;
  els.statAnswered.textContent = answered;
  show("loreCard");
}

renderLibrary();
renderHeader(totals);
show("setup");
