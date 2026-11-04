// Pure variety engine: no DOM, no network. This is where the addicting
// loop gets its variety, so no two runs feel like the same template.
// Case types rotate per run (shuffled once, then cycled), feedback phrases
// are picked at random, and streak milestones pay out differently.
export const CASE_TYPES = [
  { id: "spot-mistake", label: "Spot the mistake", emoji: "🕵️", instruction: "Case type: SPOT THE MISTAKE. Someone does something confidently wrong. Judge whether their action is right." },
  { id: "predict", label: "Predict what happens", emoji: "🔮", instruction: "Case type: PREDICT WHAT HAPPENS. A situation is set up, then a prediction is made. Judge whether that outcome really follows." },
  { id: "better-plan", label: "Pick the better plan", emoji: "🧭", instruction: "Case type: PICK THE BETTER PLAN. Someone proposes a plan. Judge whether it is a sound way to use the idea." },
  { id: "what-goes-wrong", label: "What goes wrong", emoji: "⚠️", instruction: "Case type: WHAT GOES WRONG. Something is skipped or swapped. Judge whether the result claimed still holds." },
  { id: "everyday-parallel", label: "Everyday parallel", emoji: "🏠", instruction: "Case type: EVERYDAY PARALLEL. The same idea shows up in ordinary life (kitchen, school, sports). Judge whether the parallel is applied correctly." },
];

export function shuffledCaseTypes() {
  const arr = [...CASE_TYPES];
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

export const PRAISE = [
  "Nice one!", "Sharp!", "You saw it!", "Clean read!", "On a roll!",
  "That's the idea!", "Textbook instinct!", "Boom — got it!",
];
export const OOPS = [
  "Not quite — that's the trap.", "Close, but the twist got you.",
  "Good guess, wrong turn.", "That one bites a lot of people.",
];
export function pick(arr) {
  return arr[Math.floor(Math.random() * arr.length)];
}

// Streak milestones pay differently from ordinary streak XP, so a long
// run feels different from a short one. Pure and testable.
export function milestoneBonus(streak) {
  if (streak > 0 && streak % 10 === 0) return 30;
  if (streak > 0 && streak % 5 === 0) return 15;
  return 0;
}
