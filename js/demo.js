// Demo only: canned questions for the Library Cat sample, so the loop can be felt with no key.
export const SAMPLES = {
  cat: `Mira the library cat sleeps on the atlas stand every afternoon, guarding the map room from pigeons. She once chased a runaway bookmark across three floors and was promoted to Head of Shushing. The librarians leave her a saucer of milk by the globe, but never near the rare books, because last spring she knocked over an ink pot onto a first edition.`,
  moon: `In 1969, a crew of three flew to the Moon in a capsule smaller than a minivan. They left footprints that are still there because the Moon has no wind or rain to wash them away. One astronaut dropped a hammer and a feather together, and both hit the ground at the same time, because there is almost no air to slow the feather down.`,
  soup: `Chef Bao's soup wizard simmers broth for exactly 100 minutes, never 99, never 101. He stirs counterclockwise on Tuesdays and claims the noodles listen better that way. His secret ingredient is not magic at all, just toasted garlic, patience, and a pot older than the restaurant itself.`,
};

export const DEMO_PARAGRAPH = `Photosynthesis is how plants make their own food. Leaves capture sunlight with chlorophyll, take in carbon dioxide from the air, and absorb water through their roots. The plant turns these into glucose for energy and releases oxygen as a byproduct. That oxygen is the same gas animals need to breathe.`;

// Demo: each question is a silly USE-CASE SCENARIO of the paragraph below
// (photosynthesis), dressed in the cat lore above. Lore is flavor, paragraph
// decides the answer. The paragraph itself reappears at the end, as a cloze card.
export const DEMO_QUESTIONS = [
  { q: "Mira wants a plant to make food, so she parks it in sunlight, gives it air and water, and waits for it to cook up glucose. Sound plan?", a: true, why: "Sunlight + CO2 + water = glucose. Mira is basically a botanist now." , hint: "Think about what a plant needs, all together, not just one ingredient." },
  { q: "Mira tells a seedling: skip the sunlight, just drink extra water and you'll photosynthesize fine.", a: false, why: "No sunlight, no photosynthesis. Water alone is just a bath." , hint: "What is the one input you cannot replace with more of another?" },
  { q: "A librarian claims plants breathe out glucose and breathe in oxygen to make food.", a: false, why: "Backwards! Plants take in CO2 and release oxygen; glucose is the food they keep." , hint: "Which gas goes in, which gas comes out, and what stays inside as food?" },
  { q: "Mira puts a plant by the globe, where chlorophyll in its leaves can catch sunlight.", a: true, why: "Chlorophyll is the sunlight-catcher. Globe placement is optional but stylish." , hint: "What part of the leaf catches the light?" },
  { q: "Mira waters a plant's leaves and expects its roots to stay dry, since roots don't matter here.", a: false, why: "Roots absorb the water. Leaves catch light. Everyone has a job." , hint: "Which part of the plant is built to drink?" },
  { q: "After photosynthesizing all afternoon, a plant has made glucose for energy and oxygen as a byproduct.", a: true, why: "Exactly the deal: food kept, oxygen shared with breathers like us." , hint: "What does the plant keep, and what does it let go?" },
  { q: "Mira reasons: since animals need oxygen, plants must be making it on purpose for cats.", a: false, why: "Oxygen is a byproduct, not a gift service. Cats just benefit." , hint: "Is oxygen the plant's goal, or a side effect of making food?" },
  { q: "A pigeon argues plants eat soil like animals eat dinner, so sunlight is irrelevant.", a: false, why: "Plants make their own food from sunlight, CO2 and water. Pigeons remain unreliable narrators." , hint: "Do plants eat like animals, or make food from light, air and water?" },
];
