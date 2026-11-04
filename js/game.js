// Domain: pure scoring / state. No DOM, no network — easy to test, easy to reuse.
import { milestoneBonus } from "./variety.js";
export const TITLES = ["Newbie", "Curious", "Lore Goblin", "Trivia Gremlin", "Silly Sage", "Lore Legend"];

export function titleFor(level) {
  return TITLES[Math.min(level - 1, TITLES.length - 1)];
}

export function createState() {
  return { xp: 0, level: 1, streak: 0, bestStreak: 0, answered: 0, correct: 0, runXp: 0, coins: 0, hints: 0 };
}

// Returns {correct, xp} and mutates state. Fast + streaky = more XP.
export function answerQuestion(state, question, given, elapsedMs) {
  const correct = given === question.a;
  state.answered += 1;
  let xp = 0;
  if (correct) {
    state.correct += 1;
    state.streak += 1;
    state.bestStreak = Math.max(state.bestStreak, state.streak);
    xp = 10 + Math.min(state.streak * 2, 20) + (elapsedMs < 4000 ? 5 : 0) + milestoneBonus(state.streak);
  } else {
    state.streak = 0;
  }
  state.xp += xp;
  state.runXp += xp;
  state.level = Math.floor(state.xp / 100) + 1;
  return { correct, xp };
}

export function accuracy(state) {
  return state.answered ? Math.round((state.correct / state.answered) * 100) + "%" : "—";
}

export function levelProgress(state) {
  return (state.xp % 100) / 100;
}

// Persist only totals, never the API key's value in game state (key lives in main.js/localStorage).
export function loadTotals() {
  try {
    const stored = JSON.parse(localStorage.getItem("lorerush:totals") || "null");
    // Merge over defaults so older saves (no coins/hints) still work.
    return stored ? { ...createState(), ...stored } : createState();
  } catch { return createState(); }
}
export function saveTotals(s) {
  localStorage.setItem("lorerush:totals", JSON.stringify(s));
}
