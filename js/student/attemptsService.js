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
  doc,
  getDoc,
  updateDoc,
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

/* =========================================================
   DAILY QUIZ TARGET

   The streak gets harder the longer it runs. To keep a streak
   going, a student has to finish this many quizzes on that
   streak day (a "day" is an Africa/Lagos calendar day):

     streak day 1        -> 1 quiz
     streak days 2-4     -> 2 quizzes
     streak days 5-9     -> 3 quizzes
     streak days 10-14   -> 4 quizzes
     streak day 15+      -> 5 quizzes (the cap)

   Change the ladder HERE (and in the matching function in
   functions/index.js, which the reminder emails/pushes use).
========================================================= */
export function dailyQuizTarget(streakDay) {
  if (streakDay >= 15) return 5;
  if (streakDay >= 10) return 4;
  if (streakDay >= 5) return 3;
  if (streakDay >= 2) return 2;
  return 1;
}

/**
 * Records a completed quiz attempt. Called from finishQuiz() in
 * both quiz.js (Practice) and purchasedQuiz.js (Purchased Quiz).
 *
 * Deliberately does not throw — analytics is supplementary and a
 * failed write here should never block or interrupt a student
 * from seeing their quiz result.
 *
 * Returns:
 *   { streakExtended: true,  newStreak, nextTarget }   -> today's goal just met
 *   { streakExtended: false, progress, target, remaining } -> quiz counted, goal not met yet
 *   { streakExtended: false }                          -> already done today / error
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
  if (!userId || !totalQuestions) return { streakExtended: false };

  const percentage = Math.round((score / totalQuestions) * 100);

  try {
    // Read BEFORE writing so we know where today's progress stands.
    const { state, info } = await loadStreak(userId);
    const today = lagosDayKey();

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

    const progress = info.todayCount + 1;

    // Today's goal was already met earlier: just keep the tally.
    if (info.doneToday) {
      await saveStreakState(userId, { ...state, progressDay: today, progressCount: progress });
      return { streakExtended: false };
    }

    if (progress >= info.target) {
      const newStreak = info.streak + 1;
      await saveStreakState(userId, {
        count: newStreak,
        lastQualifiedDay: today,
        progressDay: today,
        progressCount: progress,
      });

      // In-app (bell) entry only — skipPush. The student is looking at
      // the celebration screen right now, so a phone push on top of it
      // is just noise.
      sendNotification({
        message: `🔥 ${newStreak}-day streak! ${streakEncouragement(newStreak)}`,
        createdBy: "System",
        targetUserId: userId,
        skipPush: true,
      }).catch((err) =>
        console.error("Failed to send streak notification:", err),
      );

      return {
        streakExtended: true,
        newStreak,
        nextTarget: dailyQuizTarget(newStreak + 1),
      };
    }

    // Quiz counted, but not enough for today yet.
    await saveStreakState(userId, {
      ...state,
      progressDay: today,
      progressCount: progress,
    });
    return {
      streakExtended: false,
      progress,
      target: info.target,
      remaining: info.target - progress,
    };
  } catch (err) {
    console.error("Failed to record quiz attempt:", err);
  }

  return { streakExtended: false };
}

function streakEncouragement(streak) {
  const next = dailyQuizTarget(streak + 1);
  const tomorrow = `Tomorrow: ${next} quiz${next === 1 ? "" : "zes"} to keep it alive.`;
  if (streak % 30 === 0) return `A whole month strong — incredible! 🏆 ${tomorrow}`;
  if (streak % 7 === 0) return `A full week — amazing consistency! 💪 ${tomorrow}`;
  return tomorrow;
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

   The streak lives on the user doc as `streak`:
     {
       count,             // streak days completed so far
       lastQualifiedDay,  // "YYYY-MM-DD" (Lagos) of the last day the goal was met
       progressDay,       // "YYYY-MM-DD" the progressCount belongs to
       progressCount,     // quizzes finished on progressDay
     }

   A day only extends the streak once the student has finished
   dailyQuizTarget(thatStreakDay) quizzes (see the ladder above).

   It stays alive if lastQualifiedDay is today or yesterday; once a
   whole day passes without meeting the goal it drops to 0.

   Days are Africa/Lagos calendar days on BOTH the client and the
   Cloud Functions, so the app and the reminders always agree on
   when "today" starts, whatever the phone's own timezone says.

   Students who had a streak before this change are migrated
   automatically the first time their streak is read (seeded from
   their recent attempts), so nobody loses a streak because of the
   new rule.
========================================================= */

const STREAK_LOOKBACK = 60;
const LAGOS_DAY_FMT = new Intl.DateTimeFormat("en-CA", {
  timeZone: "Africa/Lagos",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
});

function lagosDayKey(date = new Date()) {
  return LAGOS_DAY_FMT.format(date); // "YYYY-MM-DD"
}

function shiftDayKey(key, deltaDays) {
  const [y, m, d] = key.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d + deltaDays)).toISOString().slice(0, 10);
}

export async function getStreakCount(userId) {
  return (await getStreakInfo(userId)).streak;
}

const EMPTY_INFO = {
  streak: 0,
  doneToday: false,
  todayCount: 0,
  target: 1,
  remaining: 1,
  nextTarget: 1,
};

/**
 * What the dashboard / streak sheet need:
 *   streak      current streak (0 if broken)
 *   doneToday   today's quiz goal already met
 *   todayCount  quizzes finished today
 *   target      quizzes needed today (or the one that was needed, if done)
 *   remaining   quizzes still needed today (0 when done)
 *   nextTarget  quizzes needed tomorrow
 */
export async function getStreakInfo(userId) {
  if (!userId) return { ...EMPTY_INFO };
  try {
    return (await loadStreak(userId)).info;
  } catch (err) {
    console.error("Failed to compute streak:", err);
    return { ...EMPTY_INFO };
  }
}

async function loadStreak(userId) {
  const snap = await getDoc(doc(db, "users", userId));
  const saved = snap.exists() ? snap.data().streak : null;

  let state;
  if (saved && typeof saved.count === "number") {
    state = {
      count: saved.count,
      lastQualifiedDay: saved.lastQualifiedDay || null,
      progressDay: saved.progressDay || null,
      progressCount: saved.progressCount || 0,
    };
  } else {
    state = await seedStateFromAttempts(userId);
    // Best effort — if this fails we just seed again next time.
    saveStreakState(userId, state).catch(() => {});
  }

  return { state, info: describeStreak(state) };
}

function describeStreak(state) {
  const today = lagosDayKey();
  const yesterday = shiftDayKey(today, -1);

  const doneToday = state.lastQualifiedDay === today;
  const alive = doneToday || state.lastQualifiedDay === yesterday;

  const streak = alive ? state.count : 0;
  const todayCount = state.progressDay === today ? state.progressCount : 0;
  const todayDay = doneToday ? streak : streak + 1;
  const target = dailyQuizTarget(todayDay);

  return {
    streak,
    doneToday,
    todayCount,
    target,
    remaining: doneToday ? 0 : Math.max(0, target - todayCount),
    nextTarget: dailyQuizTarget(todayDay + 1),
  };
}

async function saveStreakState(userId, state) {
  await updateDoc(doc(db, "users", userId), {
    streak: {
      count: state.count,
      lastQualifiedDay: state.lastQualifiedDay,
      progressDay: state.progressDay,
      progressCount: state.progressCount,
    },
  });
}

/** One-off migration: build the new state from the old "any attempt counts" streak. */
async function seedStateFromAttempts(userId) {
  const q = query(
    collection(db, "attempts"),
    where("userId", "==", userId),
    orderBy("completedAt", "desc"),
    limit(STREAK_LOOKBACK),
  );
  const snapshot = await getDocs(q);

  const today = lagosDayKey();
  const keys = snapshot.docs
    .map((d) => d.data().completedAt?.toDate?.())
    .filter(Boolean)
    .map((dt) => lagosDayKey(dt));

  const daysDesc = [...new Set(keys)].sort().reverse();
  const todayCount = keys.filter((k) => k === today).length;

  const empty = {
    count: 0,
    lastQualifiedDay: null,
    progressDay: today,
    progressCount: todayCount,
  };
  if (daysDesc.length === 0) return empty;

  const mostRecent = daysDesc[0];
  if (mostRecent !== today && mostRecent !== shiftDayKey(today, -1)) return empty;

  let cursor = mostRecent;
  let count = 0;
  for (const day of daysDesc) {
    if (day === cursor) {
      count++;
      cursor = shiftDayKey(cursor, -1);
    } else if (day < cursor) {
      break;
    }
  }

  return {
    count,
    lastQualifiedDay: mostRecent,
    progressDay: today,
    progressCount: todayCount,
  };
}
