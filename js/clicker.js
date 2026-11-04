// Pure clicker / idle gamification. No DOM, no network.
// This is the "pure" layer: every reward rule lives here as a testable
// function over a plain state object, so the UI can never invent a payout.
// XP and streaks stay in game.js; coins, hints, idle and slots live here.
// (Tap-to-the-beat was removed 2026-11-04: it was noise on the play screen.)
export const SLOT_SYMBOLS = ["⭐", "🍀", "🔥", "💎", "🐱", "⚡"];

export function randomSlots() {
  return [0, 1, 2].map(() => SLOT_SYMBOLS[Math.floor(Math.random() * SLOT_SYMBOLS.length)]);
}

export function evaluateSlots(symbols) {
  if (!symbols || symbols.length !== 3) return { xp: 0, coins: 0, label: "" };
  if (symbols[0] === symbols[1] && symbols[1] === symbols[2]) {
    return { xp: 20, coins: 10, label: "🎰 JACKPOT!" };
  }
  if (symbols[0] === symbols[1] || symbols[1] === symbols[2] || symbols[0] === symbols[2]) {
    return { xp: 10, coins: 5, label: "🎰 Pair!" };
  }
  return { xp: 0, coins: 1, label: "🎰 No match — +1 🪙 for spinning" };
}

// Coins for answering. Correct pays, attempting pays a little, and every
// 5th correct answer in total earns a hint — hints are earned, never free.
export function earnForAnswer(state, correct) {
  let coins = 0, hintEarned = false;
  if (correct) {
    coins = 5;
    if (state.correct > 0 && state.correct % 5 === 0) {
      state.hints = (state.hints || 0) + 1;
      hintEarned = true;
    }
  } else {
    coins = 1;
  }
  state.coins = (state.coins || 0) + coins;
  return { coins, hintEarned };
}

export function earnForReading(state) {
  state.coins = (state.coins || 0) + 10;
  return { coins: 10 };
}

export function earnForExplanationRequest(state) {
  state.coins = (state.coins || 0) + 3;
  return { coins: 3 };
}

export function useHint(state) {
  if ((state.hints || 0) <= 0) return false;
  state.hints -= 1;
  return true;
}

export function buyHint(state) {
  if ((state.coins || 0) < 10) return false;
  state.coins -= 10;
  state.hints = (state.hints || 0) + 1;
  return true;
}

// Idle: unlocks at 10 answered questions, then pays per 10-second tick.
// 10 answered = 1 coin/tick, 20 = 2, and so on. Small, never the main loop.
export function idleRate(answered) {
  return Math.floor((answered || 0) / 10);
}
