// UI wiring only: setup -> generate -> play -> lore card. Domain lives in game.js, network in api.js.
import { createState, answerQuestion, accuracy, levelProgress, titleFor, loadTotals, saveTotals } from "./game.js";
import { fetchModels, generateQuestions, DEFAULT_SYSTEM, DEFAULT_USER_TEMPLATE, buildMessages } from "./api.js";
import { SAMPLES, DEMO_QUESTIONS, DEMO_PARAGRAPH } from "./demo.js";
import { clozeTokens, checkAnswer } from "./cloze.js";

const $ = (id) => document.getElementById(id);
const els = {
  setup: $("setup"), loading: $("loading"), play: $("play"), loreCard: $("loreCard"),
  lore: $("lore"), paragraph: $("paragraph"), library: $("library"), apiKey: $("apiKey"), model: $("model"), models: $("models"),
  batch: $("batch"), silly: $("silly"), endless: $("endless"), setupError: $("setupError"),
  systemPrompt: $("systemPrompt"), userPrompt: $("userPrompt"), loadingMsg: $("loadingMsg"),
  debugBox: $("debugBox"), rawReply: $("rawReply"),
  xp: $("xp"), level: $("level"), title: $("title"), streak: $("streak"), accuracy: $("accuracy"), lvlFill: $("lvlFill"),
  qCount: $("qCount"), queue: $("queue"), qTimer: $("qTimer"), progFill: $("progFill"),
  question: $("question"), qCard: $("qCard"), btnTrue: $("btnTrue"), btnFalse: $("btnFalse"),
  feedback: $("feedback"), nextBtn: $("nextBtn"), xpPop: $("xpPop"),
  clozeText: $("clozeText"), clozeScore: $("clozeScore"), statXp: $("statXp"), statAcc: $("statAcc"), statStreak: $("statStreak"), statAnswered: $("statAnswered"),
};

let totals = loadTotals();
let queue = [], asked = [], current = null, startMs = 0, timer = null, answeredNow = false;
let generating = false, runStart = null, isDemo = false, touchX = null;
let clozeInputs = [], awardedCloze = new Set();

function show(name) {
  for (const k of ["setup", "loading", "play", "loreCard"]) els[k].classList.toggle("hidden", k !== name);
}
function renderHeader() {
  els.xp.textContent = totals.xp;
  els.level.textContent = totals.level;
  els.title.textContent = titleFor(totals.level);
  els.streak.textContent = totals.streak;
  els.accuracy.textContent = accuracy(totals);
  els.lvlFill.style.width = `${Math.round(levelProgress(totals) * 100)}%`;
}
function beep(ok) {
  try {
    const ctx = new (window.AudioContext || window.webkitAudioContext)();
    const o = ctx.createOscillator(), g = ctx.createGain();
    o.connect(g); g.connect(ctx.destination);
    o.frequency.value = ok ? 660 : 180; g.gain.value = 0.06;
    o.start(); o.stop(ctx.currentTime + 0.12);
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
$("saveLore").addEventListener("click", () => {
  const t = els.lore.value.trim();
  if (!t) return;
  const lib = loadLibrary();
  if (!lib.includes(t)) lib.unshift(t);
  localStorage.setItem("lorerush:library", JSON.stringify(lib.slice(0, 20)));
  renderLibrary();
  els.setupError.textContent = "Saved to your library on this device.";
});
document.querySelectorAll("[data-sample]").forEach((b) =>
  b.addEventListener("click", () => { els.lore.value = SAMPLES[b.dataset.sample]; }));

// --- Settings persistence (key is local-only; never sent anywhere but OpenRouter) ---
els.apiKey.value = localStorage.getItem("lorerush:key") || "";
els.model.value = localStorage.getItem("lorerush:model") || "";
$("fetchModels").addEventListener("click", async () => {
  els.setupError.textContent = "Loading models…";
  try {
    const ids = await fetchModels();
    els.models.innerHTML = ids.slice(0, 200).map((id) => `<option value="${id}">`).join("");
    els.setupError.textContent = `${ids.length} models loaded. Free ones first.`;
  } catch (e) { els.setupError.textContent = String(e.message || e); }
});

// --- Prompt editor: visible, editable, saved on this device ---
// What you see is what gets sent first time, except {placeholders} filled in.
// The Silliness dropdown only swaps the tone sentence inside the system
// prompt, so the editor always shows the tone that will actually be sent.
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
$("previewPrompt").addEventListener("click", () => {
  const msgs = buildMessages({
    system: els.systemPrompt.value, userTemplate: els.userPrompt.value,
    paragraph: els.paragraph.value, lore: els.lore.value,
    count: Number(els.batch.value), previous: asked.map((q) => q.q),
  });
  els.rawReply.textContent = msgs.map((m) => `${m.role.toUpperCase()}:\n${m.content}`).join("\n\n---\n\n");
  els.debugBox.classList.remove("hidden");
  els.debugBox.open = true;
});
$("resetPrompt").addEventListener("click", () => {
  localStorage.removeItem("lorerush:system");
  localStorage.removeItem("lorerush:userTemplate");
  els.systemPrompt.value = DEFAULT_SYSTEM;
  els.userPrompt.value = DEFAULT_USER_TEMPLATE;
  els.setupError.textContent = "Prompt reset to defaults.";
});

// --- Generation ---
async function startRun(demo) {
  isDemo = demo;
  const paragraph = els.paragraph.value.trim();
  const lore = els.lore.value.trim();
  if (!paragraph) { els.setupError.textContent = "Paste the paragraph material first — scenarios are made from it. Lore is optional flavor."; return; }
  localStorage.setItem("lorerush:key", els.apiKey.value.trim());
  localStorage.setItem("lorerush:model", els.model.value.trim());
  savePrompt();
  runStart = { ...totals, answered: totals.answered, correct: totals.correct };
  asked = []; queue = [];
  els.loadingMsg.textContent = "Asking your model to be funny and factual.";
  show("loading");
  try {
    queue = demo
      ? [...DEMO_QUESTIONS].sort(() => Math.random() - 0.5)
      : await generateQuestions({
          apiKey: els.apiKey.value.trim(),
          model: els.model.value.trim(),
          paragraph, lore, count: Number(els.batch.value),
          previous: [],
          system: els.systemPrompt.value, userTemplate: els.userPrompt.value,
          onRetry: () => { els.loadingMsg.textContent = "First reply wasn't usable JSON — retrying once, more strictly…"; },
        });
  } catch (e) {
    show("setup");
    els.setupError.textContent = String(e.message || e);
    if (e.raw) {
      els.rawReply.textContent = e.raw;
      els.debugBox.classList.remove("hidden");
      els.debugBox.open = true;
    }
    return;
  }
  show("play");
  nextQuestion();
}
$("generate").addEventListener("click", () => startRun(false));
$("demo").addEventListener("click", () => {
  if (!els.lore.value.trim()) els.lore.value = SAMPLES.cat;
  if (!els.paragraph.value.trim()) els.paragraph.value = DEMO_PARAGRAPH;
  startRun(true);
});
$("moreBtn").addEventListener("click", () => startRun(isDemo));
$("newLoreBtn").addEventListener("click", () => show("setup"));

async function refillIfNeeded() {
  if (!els.endless.checked || generating || isDemo || queue.length > 3) return;
  generating = true;
  try {
    const more = await generateQuestions({
      apiKey: els.apiKey.value.trim(), model: els.model.value.trim(),
      paragraph: els.paragraph.value, lore: els.lore.value, count: Number(els.batch.value),
      previous: asked.map((q) => q.q),
      system: els.systemPrompt.value, userTemplate: els.userPrompt.value,
    });
    queue.push(...more);
    els.queue.textContent = `📦 ${queue.length} left`;
  } catch { /* endless refill failing just ends the run cleanly */ }
  generating = false;
}

// --- Play loop ---
function nextQuestion() {
  clearInterval(timer);
  answeredNow = false;
  els.feedback.classList.add("hidden");
  els.nextBtn.classList.add("hidden");
  els.xpPop.textContent = "";
  els.btnTrue.disabled = els.btnFalse.disabled = false;
  if (!queue.length) { showLoreCard(); return; }
  current = queue[0];
  asked.push(current);
  els.question.textContent = current.q;
  els.qCount.textContent = `Q ${asked.length}`;
  els.queue.textContent = `📦 ${queue.length} left`;
  els.progFill.style.width = `${Math.min(100, (totals.answered - (runStart?.answered || 0)) / Math.max(1, asked.length) * 100)}%`;
  els.qCard.classList.remove("shake");
  void els.qCard.offsetWidth; // restart pop animation
  startMs = Date.now();
  let left = 10;
  els.qTimer.textContent = "⏱ 10s";
  timer = setInterval(() => {
    left -= 1;
    els.qTimer.textContent = left > 0 ? `⏱ ${left}s` : "⏱ bonus gone";
    if (left <= 0) clearInterval(timer);
  }, 1000);
  refillIfNeeded();
}
function answer(given) {
  if (!current || answeredNow) return;
  answeredNow = true;
  clearInterval(timer);
  const res = answerQuestion(totals, current, given, Date.now() - startMs);
  saveTotals(totals);
  renderHeader();
  els.btnTrue.disabled = els.btnFalse.disabled = true;
  els.feedback.classList.remove("hidden", "ok", "bad");
  els.feedback.classList.add(res.correct ? "ok" : "bad");
  els.feedback.innerHTML = res.correct
    ? `✓ Correct! +${res.xp} XP${totals.streak >= 3 ? ` · 🔥 ${totals.streak} streak!` : ""}<br><small>${current.why || ""}</small>`
    : `✗ Nope — it was ${current.a ? "TRUE" : "FALSE"}.<br><small>${current.why || ""}</small>`;
  if (!res.correct) els.qCard.classList.add("shake");
  els.xpPop.textContent = res.correct ? `+${res.xp} XP` : "";
  els.nextBtn.classList.remove("hidden");
  els.nextBtn.focus();
  beep(res.correct);
}
function advance() {
  queue.shift();
  nextQuestion();
}
els.btnTrue.addEventListener("click", () => answer(true));
els.btnFalse.addEventListener("click", () => answer(false));
els.nextBtn.addEventListener("click", advance);
$("skipBtn").addEventListener("click", advance);
$("revealBtn").addEventListener("click", showLoreCard);
// Swipe: right = true, left = false — the TikTok gesture, for learning.
els.qCard.addEventListener("touchstart", (e) => { touchX = e.changedTouches[0].clientX; }, { passive: true });
els.qCard.addEventListener("touchend", (e) => {
  if (touchX == null) return;
  const dx = e.changedTouches[0].clientX - touchX;
  if (Math.abs(dx) > 60) answer(dx > 0);
  touchX = null;
});
document.addEventListener("keydown", (e) => {
  if (els.play.classList.contains("hidden")) return;
  if (e.key === "t" || e.key === "T" || e.key === "ArrowRight") answer(true);
  else if (e.key === "f" || e.key === "F" || e.key === "ArrowLeft") answer(false);
  else if ((e.key === " " || e.key === "Enter") && answeredNow) { e.preventDefault(); advance(); }
});

// Cloze card: the same paragraph the scenarios tested, blanked out for recall.
// Lore never appears here — it was only the scenarios' dressing.
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
$("checkCloze").addEventListener("click", () => {
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
  renderHeader();
  els.clozeScore.textContent = correct === clozeInputs.length
    ? `Perfect recall: ${correct}/${clozeInputs.length} — that's the lore loop paying off.`
    : `${correct}/${clozeInputs.length} correct (+20 XP per first-time correct blank). Fix the red ones and check again.`;
});
$("revealCloze").addEventListener("click", () => {
  clozeInputs.forEach((input) => {
    input.value = input.dataset.answer;
    input.classList.add("revealed");
    input.disabled = true;
  });
  els.clozeScore.textContent = "Revealed — no XP for these. Read them once, then try a fresh run.";
});

function showLoreCard() {
  clearInterval(timer);
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
renderHeader();
show("setup");
