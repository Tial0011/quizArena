import { db } from "../firebase/config.js";
import { sendNotification } from "../notificationsService.js";
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
    // Checked BEFORE writing today's attempt, specifically so we can
    // tell whether this is the FIRST attempt of the day (the one that
    // actually extends the streak) versus a second/third quiz taken
    // later the same day, which shouldn't fire another "streak"
    // notification on top of the first.
    const { streak: streakBeforeToday, doneToday } = await getStreakInfo(
      userId,
    );

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

    if (!doneToday) {
      // See getStreakInfo()/computeConsecutiveDayStreak(): whether the
      // prior streak was alive (via yesterday) or broken (0), today's
      // first attempt always extends it by exactly 1 — so there's no
      // need for a second read after the write above.
      const newStreak = streakBeforeToday + 1;

      // Fire-and-forget: a notification failing to send must never
      // affect the quiz result the student is about to see.
      sendNotification({
        message: `🔥 ${newStreak}-day streak! ${streakEncouragement(newStreak)}`,
        createdBy: "System",
        targetUserId: userId,
      }).catch((err) =>
        console.error("Failed to send streak notification:", err),
      );
    }
  } catch (err) {
    console.error("Failed to record quiz attempt:", err);
  }
}

function streakEncouragement(streak) {
  if (streak === 1) return "Come back tomorrow to keep it alive.";
  if (streak % 30 === 0) return "A whole month strong — incredible! 🏆";
  if (streak % 7 === 0) return "A full week — amazing consistency! 💪";
  return "Keep it going!";
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

   IMPORTANT: this is already calendar-day-based, not a rolling
   24-hour timer — toDayKey() below zeroes out the time-of-day
   before comparing, so a student who plays at 11pm one day and
   9am the next (10 hours apart) still counts as two different
   days and keeps the streak, while playing at 9am and then 11pm
   the SAME day (14 hours apart) only counts as one day. Two
   attempts get compared by which calendar day they fall on, never
   by exact elapsed milliseconds.

   Pulls the last 60 attempts (not the student's entire history —
   this is a dashboard widget, not an audit) and collapses them to
   unique calendar-day buckets client-side. Same composite-index
   note as getRecentAttempts() above applies here too.
========================================================= */

const STREAK_LOOKBACK = 60;
const ONE_DAY_MS = 86400000;

export async function getStreakCount(userId) {
  return (await getStreakInfo(userId)).streak;
}

/**
 * Same underlying data as getStreakCount(), but also reports
 * whether today already has a recorded attempt — used both by the
 * dashboard streak card (to show "keep it going" vs "you're set for
 * today") and by recordQuizAttempt() above (to only fire the streak
 * notification on the day's first attempt).
 */
export async function getStreakInfo(userId) {
  if (!userId) return { streak: 0, doneToday: false };

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

    const streak = computeConsecutiveDayStreak(dayKeysDesc);
    const doneToday =
      dayKeysDesc.length > 0 && dayKeysDesc[0] === toDayKey(new Date());

    return { streak, doneToday };
  } catch (err) {
    console.error("Failed to compute streak:", err);
    return { streak: 0, doneToday: false };
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
