// Pure paragraph breaker: no DOM, no network.
// Splits a paragraph into bite-size idea chunks (1-2 sentences each),
// so the player can see the material broken down before it is expanded.
// Nothing is summarised away here — every sentence lands in exactly one chunk.
export function splitParagraph(text) {
  const clean = (text || "").replace(/\s+/g, " ").trim();
  if (!clean) return [];
  const sentences = clean.match(/[^.!?]+[.!?]+["')\]]*\s*/g) || [clean];
  const chunks = [];
  for (let i = 0; i < sentences.length; i += 2) {
    const chunk = (sentences[i] || "") + (sentences[i + 1] || "");
    const trimmed = chunk.trim();
    if (trimmed) chunks.push(trimmed);
  }
  return chunks;
}
