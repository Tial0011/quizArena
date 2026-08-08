import { db } from "../firebase/config.js";
import {
  collection,
  addDoc,
  getDocs,
  query,
  where,
  orderBy,
  limit,
  serverTimestamp,
} from "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js";

/* =========================================================
   ATTEMPTS SERVICE

   Sole reader/writer for the "attempts" collection — same
   pattern as purchaseService.js for "purchases". Nothing else
   should write quiz-attempt records directly to Firestore.

   Each attempt document:
   {
     userId, mode: "practice" | "purchased",
     subjectName, quizId (purchased only), quizTitle (purchased only),
     score, totalQuestions, percentage, completedAt
   }
========================================================= */

/**
 * Records a completed quiz attempt. Called from finishQuiz() in
 * both quiz.js (Practice) and purchasedQuiz.js (Purchased Quiz).
 *
 * Deliberately does not throw — analytics is supplementary and a
 * failed write here should never block or interrupt a student
 * from seeing their quiz result.
 */
export async function recordQuizAttempt({
  userId,
  mode,
  subjectName = "",
  quizId = null,
  quizTitle = null,
  score,
  totalQuestions,
}) {
  if (!userId || !totalQuestions) return;

  const percentage = Math.round((score / totalQuestions) * 100);

  try {
    await addDoc(collection(db, "attempts"), {
      userId,
      mode,
      subjectName,
      quizId,
      quizTitle,
      score,
      totalQuestions,
      percentage,
      completedAt: serverTimestamp(),
    });
  } catch (err) {
    console.error("Failed to record quiz attempt:", err);
  }
}

/**
 * Fetches a user's most recent quiz attempts, newest first.
 *
 * NOTE: this query filters on `userId` and orders by
 * `completedAt` — Firestore requires a composite index for that
 * combination. The first time this runs, if the index doesn't
 * exist yet, Firestore will throw an error containing a console
 * link that creates it for you in one click.
 */
export async function getRecentAttempts(userId, count = 10) {
  if (!userId) return [];

  const q = query(
    collection(db, "attempts"),
    where("userId", "==", userId),
    orderBy("completedAt", "desc"),
    limit(count),
  );

  try {
    const snapshot = await getDocs(q);
    return snapshot.docs.map((docSnap) => ({
      id: docSnap.id,
      ...docSnap.data(),
    }));
  } catch (err) {
    console.error("Failed to load recent attempts:", err);
    return [];
  }
}

/* =========================================================
   STREAK

   "Streak" = consecutive calendar days, up to and including
   today, with at least one recorded attempt. Duolingo-style: a
   streak still counts as alive if the student's most recent
   attempt was yesterday (they haven't played today yet, but
   haven't broken it either) — it only resets to 0 once a full
   day is skipped with no attempt at all.

   Pulls the last 60 attempts (not the student's entire history —
   this is a dashboard widget, not an audit) and collapses them to
   unique calendar-day buckets client-side. Same composite-index
   note as getRecentAttempts() above applies here too.
========================================================= */

const STREAK_LOOKBACK = 60;
const ONE_DAY_MS = 86400000;

export async function getStreakCount(userId) {
  if (!userId) return 0;

  const q = query(
    collection(db, "attempts"),
    where("userId", "==", userId),
    orderBy("completedAt", "desc"),
    limit(STREAK_LOOKBACK),
  );

  try {
    const snapshot = await getDocs(q);

    const dayKeysDesc = [
      ...new Set(
        snapshot.docs
          .map((docSnap) => docSnap.data().completedAt?.toDate?.())
          .filter(Boolean)
          .map(toDayKey),
      ),
    ].sort((a, b) => b - a);

    return computeConsecutiveDayStreak(dayKeysDesc);
  } catch (err) {
    console.error("Failed to compute streak:", err);
    return 0;
  }
}

function computeConsecutiveDayStreak(dayKeysDesc) {
  if (dayKeysDesc.length === 0) return 0;

  const todayKey = toDayKey(new Date());
  const mostRecent = dayKeysDesc[0];

  // Most recent activity has to be today or yesterday for the
  // streak to still be alive — anything older and it's broken.
  if (mostRecent !== todayKey && mostRecent !== todayKey - ONE_DAY_MS) {
    return 0;
  }

  let cursor = mostRecent;
  let streak = 0;

  for (const key of dayKeysDesc) {
    if (key === cursor) {
      streak++;
      cursor -= ONE_DAY_MS;
    } else if (key < cursor) {
      // Gap found — streak stops here.
      break;
    }
  }

  return streak;
}

function toDayKey(date) {
  const d = new Date(date);
  d.setHours(0, 0, 0, 0);
  return d.getTime();
}
