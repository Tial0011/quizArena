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
