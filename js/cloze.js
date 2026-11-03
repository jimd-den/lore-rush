// Pure cloze logic: no DOM. Turns a learning paragraph into fill-in-the-blank tokens.
// Picks content words (long, non-stopword, first occurrence only), evenly spaced,
// so a short paragraph gets a few blanks and a long one gets up to 8.
const STOP = new Set(("a an the and or but of to in on at by for with from as is are was were be been it its this that these those he she they we you i his her their our your my me him us them do does did have has had will would can could should may might not no yes if then than so such very just only also over under into out up down").split(" "));

export function clozeTokens(text) {
  const parts = text.split(/(\s+)/);
  const candidates = [];
  const seen = new Set();
  const wordParts = parts.map((part, idx) => {
    if (/^\s+$/.test(part) || !part) return { part, core: null };
    const m = part.match(/^([^A-Za-z]*)([A-Za-z][A-Za-z'-]*)([^A-Za-z]*)$/);
    if (!m) return { part, core: null };
    const lower = m[2].toLowerCase();
    if (m[2].length >= 4 && !STOP.has(lower) && !seen.has(lower)) {
      seen.add(lower);
      candidates.push(idx);
    }
    return { part, core: m[2], pre: m[1], post: m[3] };
  });
  const wordCount = wordParts.filter((w) => w.core).length;
  const want = Math.max(1, Math.min(8, Math.floor(wordCount / 8) || 1));
  const blankIdx = new Set();
  if (candidates.length) {
    const n = Math.min(want, candidates.length);
    for (let i = 0; i < n; i++) blankIdx.add(candidates[Math.floor((i * candidates.length) / n)]);
  }
  return parts.map((part, idx) => {
    const w = wordParts[idx];
    if (!w.core || !blankIdx.has(idx)) return { text: part, blank: false };
    return { text: part, blank: true, answer: w.core, pre: w.pre, post: w.post };
  });
}

export function checkAnswer(given, answer) {
  return given.trim().toLowerCase() === answer.toLowerCase();
}
