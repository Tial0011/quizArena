import { db } from "../firebase/config.js";
import {
  collection,
  getDocs,
  deleteDoc,
  doc,
  query,
  where,
} from "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js";

/* =========================================================
   Shared cascade-delete helpers for the admin dashboard.

   The data model is a strict hierarchy: Subject -> Quizzes ->
   Questions. Firestore doesn't cascade deletes on its own, so this
   is the single place that knows how to walk down that hierarchy —
   both subjects.js (deleting a subject) and quizzes.js (deleting a
   quiz) call into this instead of each re-implementing their own
   version of "find and delete the children first."

   Deletes are plain deleteDoc() calls (not batched writes) — fine
   at this app's scale. If a subject/quiz ever has hundreds of
   descendants, Firestore's 500-operation batch limit would become
   relevant and this would need to switch to writeBatch().
========================================================= */

export async function getQuizzesForSubject(subjectId) {
  const q = query(
    collection(db, "quizzes"),
    where("subjectId", "==", subjectId),
  );
  const snapshot = await getDocs(q);
  return snapshot.docs.map((docSnap) => ({
    id: docSnap.id,
    ...docSnap.data(),
  }));
}

export async function getQuestionsForQuiz(quizId) {
  const q = query(collection(db, "questions"), where("quizId", "==", quizId));
  const snapshot = await getDocs(q);
  return snapshot.docs.map((docSnap) => ({
    id: docSnap.id,
    ...docSnap.data(),
  }));
}

/**
 * Counts what deleting a subject would destroy, without deleting
 * anything. Used to put real numbers in the warning dialog before
 * the admin confirms.
 */
export async function countSubjectCascade(subjectId) {
  const quizzes = await getQuizzesForSubject(subjectId);

  const perQuizQuestions = await Promise.all(
    quizzes.map((quiz) => getQuestionsForQuiz(quiz.id)),
  );

  const questionCount = perQuizQuestions.reduce(
    (sum, questions) => sum + questions.length,
    0,
  );

  return { quizCount: quizzes.length, questionCount };
}

/**
 * Counts what deleting a quiz would destroy.
 */
export async function countQuizCascade(quizId) {
  const questions = await getQuestionsForQuiz(quizId);
  return { questionCount: questions.length };
}

/**
 * Deletes every question under a quiz, then the quiz itself.
 * Used directly (deleting one quiz) and as a building block when
 * deleting a whole subject.
 *
 * Note: this does not delete the questions' Cloudinary images
 * (question.image URLs). Cloudinary deletion needs a signed
 * admin-API call, which this client-side code has no credentials
 * for — only the unsigned upload preset used to create images.
 * Orphaned images will remain in Cloudinary storage after this
 * runs. Flagged, not solved here.
 */
export async function deleteQuizCascade(quizId) {
  const questions = await getQuestionsForQuiz(quizId);

  await Promise.all(
    questions.map((question) => deleteDoc(doc(db, "questions", question.id))),
  );

  await deleteDoc(doc(db, "quizzes", quizId));
}

/**
 * Deletes every quiz under a subject (and, transitively, every
 * question under those quizzes), then the subject itself.
 */
export async function deleteSubjectCascade(subjectId) {
  const quizzes = await getQuizzesForSubject(subjectId);

  // Sequential rather than Promise.all: deleteQuizCascade() already
  // parallelizes its own question deletes internally, so running
  // quizzes one at a time here keeps the total number of in-flight
  // writes bounded instead of multiplying two levels of parallelism.
  for (const quiz of quizzes) {
    await deleteQuizCascade(quiz.id);
  }

  await deleteDoc(doc(db, "subjects", subjectId));
}
