/* =========================================================
   PACK RANKS

   The student's rank is decided by how many quizzes they own
   in total, using the same steps as the Marketplace study-pack
   meter (1 / 3 / 5 / 8). Buy a 3-quiz pack and you're a Scholar.

   Single source of truth: the Marketplace cart meter and the
   dashboard title both import this. (functions/index.js keeps a
   matching copy for the "you ranked up" notification -- change
   both together.)
========================================================= */
export const RANKS = [
  { at: 1, name: "Warm-up Pack", title: "Quiz Arena Rookie", emoji: "🌱" },
  { at: 3, name: "Scholar Pack", title: "Quiz Arena Scholar", emoji: "📘" },
  { at: 5, name: "Topper Pack", title: "Quiz Arena Topper", emoji: "🔥" },
  { at: 8, name: "Legend Pack", title: "Quiz Arena Legend", emoji: "👑" },
];

/** Index of the highest rank reached for this many owned quizzes (-1 = none yet). */
export function rankIndex(count) {
  let idx = -1;
  RANKS.forEach((r, i) => count >= r.at && (idx = i));
  return idx;
}

/** The rank object for this many owned quizzes, or null if they own none. */
export function getRank(count) {
  const idx = rankIndex(count);
  return idx >= 0 ? RANKS[idx] : null;
}
