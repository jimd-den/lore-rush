# Lore Rush ⚡

Ultrasmall, mobile-first, large-format, no-build web app. Paste a paragraph,
break it into ideas, expand it in plain words with web research, then play
throwaway True/False case studies with OpenRouter — no "according to the
text" questions, because you probably haven't read it yet — answer fast,
then unlock the paragraph as a cloze card.

## Deploy to GitHub Pages

Push this folder to `main` in a public repo, then in GitHub go to
Settings > Pages > Build and deployment > Deploy from a branch, choose
`main` / `/ (root)`, and save. The site will be at
`https://<username>.github.io/lore-rush/`. The empty `.nojekyll` file
tells Pages to serve the files as-is, with no Jekyll processing. All
asset paths are relative, so the `/lore-rush/` subpath works.

## Deploy to Netlify (pick one)

1. **Drag & drop (fastest):** drag the `lore-rush` folder — or the zip — onto
   https://app.netlify.com/drop
2. **CLI:** `netlify deploy --dir=. --prod` from inside this folder
3. **Git:** push this folder as a repo root; Netlify needs no build command
   (`netlify.toml` already sets `publish = "."` and no build).

## How it plays

1. Paste the paragraph material you want to learn, then pick a lore book
   (or tap a sample, or pick from your saved lore library). Tap "Break it
   down" to split the paragraph into bite-size ideas, and "Expand in plain
   words" for a web-researched layman's expansion — NOT a summary: it keeps
   every idea, explains it in plain words, adds an everyday example, why it
   matters, tricky words, and what people get wrong, with web sources listed
   when available. Web search uses OpenRouter's web plugin and costs a few
   cents per request even on free models; if a model can't do web search,
   the expansion falls back to paragraph-only and says so.
2. Pick an explanation style (ELI5, Plain, Story, Analogy, Straight) and
   whether explanations show after each answer at all — explanations explain
   the idea itself, never just "because the paragraph says so". Open
   "Prompt — visible & editable" (closed by default, like all dropdowns)
   to see and edit exactly what gets sent (system prompt + user template
   with {paragraph} {expansion} {lore} {count} {previous} {seed}
   {explainStyle} {caseType}); it saves on this device, and "Preview final
   prompt" shows it with your inputs filled in. "Reset prompt" restores
   defaults.
3. Paste an OpenRouter key (https://openrouter.ai/keys) and pick a model.
   "Load models" fetches the live list, free models first.
   Default suggestion: `openai/gpt-oss-20b:free`.
4. No batches: the first case study is generated, then case studies keep
   being generated one at a time in the background, up to 3 ready ahead,
   while you answer. Each case study is standalone — a named person in a
   concrete situation, with the facts needed inside the case — never
   "according to the text". Case types rotate per run (spot the mistake,
   predict, pick a plan, what goes wrong, everyday parallel), feedback
   phrases vary, and streak milestones pay differently (5-streak +15 XP,
   10-streak +30 XP), so no two runs feel the same.
5. Play screen, stripped to the point: a question, huge stacked TRUE and
   FALSE buttons (True beeps high, False beeps low, correct/wrong change
   the pitch again), a ? button, and a 💡 hint marker with a count.
   Nothing else to tap. Tap ? to ask the AI to explain further — a real
   OpenRouter call in your chosen explanation style, with a new example,
   not just the canned why (before answering it must not give the answer
   away; after answering it explains why in depth). Tap the card, or
   True/False again, after answering to get the next question — no Next,
   Skip, tap-to-beat, buy-hint, timer, queue, or slot box on this screen.
   Answer True/False by tap, swipe (right = true, left = false), or keys
   T / F / arrows; after answering, any of those advances. Fast answers
   and streaks earn bonus XP. The tiny End link is the only way out, to
   the cloze card.
6. Tap "End & open cloze card" and the same paragraph appears with key
   words blanked out. Fill them from memory, check for +20 XP per blank,
   or reveal them (no XP). Then go again, same paragraph and lore.

No key? Tap **Play demo (no key)** — scenario questions about
photosynthesis, dressed in Library Cat lore.

## If a model won't return JSON

The parser now accepts markdown fences, an object wrapping the array,
trailing commas, alternate field names (question/answer/explanation), and
answers hidden in a reasoning field. If the first reply still fails, the app
retries once at low temperature with the JSON-only rule restated. If that
also fails, the error shows the model's raw reply in the "Last raw model
reply" box, so you can see what it actually sent and fix the prompt or
switch models. Small/free models are the usual culprits — a stronger
instruction-following model, or a shorter paragraph, usually fixes it.

## Privacy

There is no backend and no database. Your API key lives only in your
browser's localStorage and is sent only to `openrouter.ai`. Lore you save
stays in localStorage on that device. Totals (XP / level / streak) also
persist locally.

## Clean architecture (separated concerns, 0 dependencies)

- `index.html` — structure only, one screen at a time, large format, big buttons/text
- `style.css` — mobile-first large format; desktop is a single `@media(min-width:640px)` enhancement
- `js/game.js` — pure domain: scoring, streaks, levels, titles (no DOM, no network)
- `js/cloze.js` — pure cloze logic: picks long, non-stopword, evenly spaced words to blank
- `js/breakdown.js` — pure paragraph splitter: sentences into 1-2 sentence idea chunks
- `js/variety.js` — pure variety: rotating case types, feedback phrases, streak milestones
- `js/api.js` — adapter: OpenRouter chat + models + JSON parsing + web-researched expansion
- `js/demo.js` — sample lore + offline demo questions
- `js/ui.js` — DOM only: element lookup and rendering (no flow, no network)
- `js/clicker.js` — pure gamification: coins, earned hints, idle rate, slot outcomes (tap-to-beat removed 2026-11-04)
- `js/main.js` — orchestration only: setup → break/expand → play → cloze card

## Gamification (pure, not just points)

- **Coins 🪙:** +5 per correct answer, +1 per attempt, +10 for reading an
  expansion, +3 for requesting an AI explanation.
- **Hints 💡 are earned, never free:** 1 hint per 5 correct answers, or
  buy one for 10 🪙. A hint shows the question's clue — useful, but never
  the answer.
- **Idle (silent):** unlocks at 10 answered questions, then pays 1 🪙 per
  10s per 10 answered (20 answered = 2/tick, and so on). No label on the
  play screen — coins just grow in the header.
- **Slot bonus (silent):** every correct answer rolls a 3-symbol slot.
  Three of a kind = +20 XP +10 🪙 jackpot, a pair = +10 XP +5 🪙,
  otherwise +1 🪙. It shows as one line in the feedback, never a reel box.
- **Stats:** header shows XP, coins, hints, level, streak, accuracy, and
  total questions answered.

No framework, no build, no bundler to break.
