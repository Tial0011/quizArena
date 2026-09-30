/* =========================================================
   RANDOM HELPERS (shared by Practice Arena + purchased quizzes)

   - secureInt(max): unbiased random integer in [0, max) using
     crypto.getRandomValues with rejection sampling (no modulo
     bias). Falls back to Math.random if crypto is unavailable.
   - shuffle(array): Fisher-Yates — every ordering equally
     likely. Returns a NEW array.
   - shuffleQuestionOptions(question): returns a copy of the
     question with its options shuffled and `answer` re-pointed
     at the correct option's new position. Questions whose
     options refer to each other ("All of the above", "Both A
     and B"...) are left untouched so they still make sense.
========================================================= */

export function secureInt(max) {
  if (max <= 1) return 0;

  const c = globalThis.crypto;
  if (!c || typeof c.getRandomValues !== "function") {
    return Math.floor(Math.random() * max);
  }

  const buf = new Uint32Array(1);
  const limit = Math.floor(0x100000000 / max) * max; // reject the biased tail

  do {
    c.getRandomValues(buf);
  } while (buf[0] >= limit);

  return buf[0] % max;
}

export function shuffle(array) {
  const out = [...array];

  for (let i = out.length - 1; i > 0; i--) {
    const j = secureInt(i + 1);
    [out[i], out[j]] = [out[j], out[i]];
  }

  return out;
}

const POSITION_DEPENDENT =
  /\b(all|none|both|neither)\s+of\s+(the\s+)?(above|these|them)\b|\b(a|b|c|d)\s*(and|&|,)\s*(a|b|c|d)\b|\babove\b|\bbelow\b/i;

export function shuffleQuestionOptions(question) {
  const options = question?.options;

  if (!Array.isArray(options) || options.length < 2) return question;
  if (typeof question.answer !== "number") return question;
  if (options.some((o) => POSITION_DEPENDENT.test(String(o)))) return question;

  const order = shuffle(options.map((_, i) => i)); // order[newPos] = oldPos

  return {
    ...question,
    options: order.map((oldPos) => options[oldPos]),
    answer: order.indexOf(question.answer),
  };
}

/** Shuffle the bank, take `count`, and shuffle each question's options. */
export function pickRandomQuestions(bank, count) {
  return shuffle(bank).slice(0, count).map(shuffleQuestionOptions);
}
