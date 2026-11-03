# Lore Rush ⚡

Ultrasmall, mobile-first, no-build web app. Paste a paragraph, pick a lore
book for flavor, and get throwaway True/False silly scenario questions with
OpenRouter, answer fast, then unlock the paragraph as a cloze card.

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
   (or tap a sample, or pick from your saved lore library). The questions
   are silly use-case scenarios OF the paragraph, dressed in the lore world:
   lore is inspiration/flavor only, the paragraph decides every answer.
   Open "Prompt — visible & editable" to see and edit exactly what gets
   sent (system prompt + user template with {paragraph} {lore} {count}
   {previous} {seed}); it saves on this device, and "Preview final prompt"
   shows it with your inputs filled in. "Reset prompt" restores defaults.
2. Paste an OpenRouter key (https://openrouter.ai/keys) and pick a model.
   "Load models" fetches the live list, free models first.
   Default suggestion: `openai/gpt-oss-20b:free`.
3. Generate 10 / 20 / 50 questions. With ∞ Endless on, it auto-refills when
   the queue gets low — thousands of throwaway questions, none saved.
4. Answer True/False by tap, swipe (right = true, left = false), or keys
   T / F / arrows. Fast answers and streaks earn bonus XP.
5. Tap "End & open cloze card" and the same paragraph appears with key
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

## Clean architecture (4 files, 0 dependencies)

- `index.html` — structure only, one screen at a time
- `style.css` — mobile-first; desktop is a single `@media(min-width:640px)` enhancement
- `js/game.js` — pure domain: scoring, streaks, levels, titles (no DOM, no network)
- `js/cloze.js` — pure cloze logic: picks long, non-stopword, evenly spaced words to blank
- `js/api.js` — adapter: OpenRouter chat + models + JSON parsing
- `js/demo.js` — sample lore + offline demo questions
- `js/main.js` — UI wiring only: setup → generate → play → lore card

Total: ~650 lines. No framework, no build, no bundler to break.
