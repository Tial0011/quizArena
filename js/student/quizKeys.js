/* =========================================================
   QUIZ KEYBOARD SHORTCUTS (desktop)
   A-D / 1-4 pick an option, Left/Right (or P/N) move between
   questions. One listener at a time: every re-render of a
   question calls bindQuizKeys() again, which replaces the old
   one, and finishing the quiz calls unbindQuizKeys().
========================================================= */
let handler = null;

export function unbindQuizKeys() {
  if (handler) {
    document.removeEventListener("keydown", handler);
    handler = null;
  }
}

export function bindQuizKeys({ optionCount, onSelect, onNext, onPrev }) {
  unbindQuizKeys();

  handler = (e) => {
    // The quiz screen has been replaced (result page, back to dashboard).
    if (!document.querySelector(".quiz-layout")) {
      unbindQuizKeys();
      return;
    }

    if (e.metaKey || e.ctrlKey || e.altKey) return;

    const tag = e.target?.tagName;
    if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") return;

    const key = e.key.toLowerCase();
    const letterIndex = ["a", "b", "c", "d"].indexOf(key);
    const numberIndex = ["1", "2", "3", "4"].indexOf(key);
    const optionIndex = letterIndex !== -1 ? letterIndex : numberIndex;

    if (optionIndex !== -1) {
      if (optionIndex < optionCount) {
        e.preventDefault();
        onSelect(optionIndex);
      }
      return;
    }

    if (key === "arrowright" || key === "n") {
      e.preventDefault();
      onNext();
    } else if (key === "arrowleft" || key === "p") {
      e.preventDefault();
      onPrev();
    }
  };

  document.addEventListener("keydown", handler);
}
