// UI only: every DOM lookup and every render lives here.
// main.js owns flow and state; it never touches the DOM except through
// this module. game.js, api.js, cloze.js, breakdown.js, variety.js stay
// DOM-free, so they can be tested without a browser.
import { accuracy, levelProgress, titleFor } from "./game.js";

const $ = (id) => document.getElementById(id);

export const els = {
  setup: $("setup"), loading: $("loading"), play: $("play"), loreCard: $("loreCard"),
  lore: $("lore"), paragraph: $("paragraph"), library: $("library"), apiKey: $("apiKey"), model: $("model"), models: $("models"),
  silly: $("silly"), explainStyle: $("explainStyle"), showWhy: $("showWhy"), webSearch: $("webSearch"),
  setupError: $("setupError"),
  systemPrompt: $("systemPrompt"), userPrompt: $("userPrompt"), loadingMsg: $("loadingMsg"),
  debugBox: $("debugBox"), rawReply: $("rawReply"),
  xp: $("xp"), level: $("level"), title: $("title"), streak: $("streak"), accuracy: $("accuracy"), lvlFill: $("lvlFill"),
  coins: $("coins"), hints: $("hints"), answered: $("answered"),
  hintBtn: $("hintBtn"), hintCount: $("hintCount"), hintText: $("hintText"),
  askBtn: $("askBtn"), aiExplain: $("aiExplain"), endBtn: $("endBtn"),
  qCount: $("qCount"), caseType: $("caseType"),
  question: $("question"), qCard: $("qCard"), btnTrue: $("btnTrue"), btnFalse: $("btnFalse"),
  feedback: $("feedback"),
  clozeText: $("clozeText"), clozeScore: $("clozeScore"), statXp: $("statXp"), statAcc: $("statAcc"), statStreak: $("statStreak"), statAnswered: $("statAnswered"),
  breakdownDetails: $("breakdownDetails"), breakdownList: $("breakdownList"),
  expansionDetails: $("expansionDetails"), expansionText: $("expansionText"), expansionSources: $("expansionSources"), expansionNote: $("expansionNote"),
};

export function show(name) {
  for (const k of ["setup", "loading", "play", "loreCard"]) els[k].classList.toggle("hidden", k !== name);
}

export function renderHeader(totals) {
  els.xp.textContent = totals.xp;
  els.level.textContent = totals.level;
  els.title.textContent = titleFor(totals.level);
  els.streak.textContent = totals.streak;
  els.accuracy.textContent = accuracy(totals);
  if (els.coins) els.coins.textContent = totals.coins || 0;
  if (els.hints) els.hints.textContent = totals.hints || 0;
  if (els.answered) els.answered.textContent = totals.answered || 0;
  els.lvlFill.style.width = `${Math.round(levelProgress(totals) * 100)}%`;
  updateHintButton(totals);
}

export function updateHintButton(totals) {
  // Hint marker only: a count, no buy button, no extra controls.
  if (els.hintCount) els.hintCount.textContent = totals.hints || 0;
}

export function resetPlay() {
  if (els.hintText) { els.hintText.textContent = ""; els.hintText.classList.add("hidden"); }
  if (els.aiExplain) { els.aiExplain.textContent = ""; els.aiExplain.classList.add("hidden"); }
}

export function renderBreakdown(chunks) {
  els.breakdownList.innerHTML = chunks.map((c) =>
    `<li>${c.replace(/</g, "&lt;")}</li>`).join("");
  els.breakdownDetails.classList.remove("hidden");
  els.breakdownDetails.open = true; // opened by the user's tap, never by default
}

export function renderExpansion({ text, sources, webUsed, webNote }) {
  els.expansionText.textContent = text;
  els.expansionNote.textContent = webNote || (webUsed
    ? "Researched with web search — sources below. This is an expansion, not a summary."
    : "Web search was off for this expansion.");
  els.expansionSources.innerHTML = (sources || []).map((s) =>
    `<li><a href="${s.url.replace(/"/g, "")}" target="_blank" rel="noopener">${s.title.replace(/</g, "&lt;")}</a></li>`).join("");
  els.expansionDetails.classList.remove("hidden");
  els.expansionDetails.open = true; // opened by the user's tap, never by default
}

export function renderFeedback({ correct, xp, streak, why, answerTrue, showWhy, praise, oops, styleLabel }) {
  els.feedback.classList.remove("hidden", "ok", "bad");
  els.feedback.classList.add(correct ? "ok" : "bad");
  const whyHtml = showWhy && why
    ? `<br><small>💡 ${styleLabel}: ${why.replace(/</g, "&lt;")}</small>`
    : "";
  els.feedback.innerHTML = correct
    ? `✓ ${praise} +${xp} XP${streak >= 3 ? ` · 🔥 ${streak} streak!` : ""}${streak % 5 === 0 && streak > 0 ? ` · 🎁 Milestone bonus!` : ""}${whyHtml}<br><small>Tap the card for the next one →</small>`
    : `✗ ${oops} It was ${answerTrue ? "TRUE" : "FALSE"}.${whyHtml}<br><small>Tap the card for the next one →</small>`;
}

export function setError(msg) {
  els.setupError.textContent = msg;
}

export function showRaw(text) {
  els.rawReply.textContent = text;
  els.debugBox.classList.remove("hidden");
  els.debugBox.open = true;
}
