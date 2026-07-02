import { db } from "../firebase/config.js";
import {
  collection,
  addDoc,
  updateDoc,
  doc,
  getDoc,
  getDocs,
  query,
  where,
  serverTimestamp,
  arrayUnion,
} from "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js";

/* =========================================================
   PURCHASE SERVICE

   This is the ONLY module allowed to write to the
   "purchases" collection or update a user's
   purchasedQuizzes array. UI code (marketplace, my-quizzes,
   etc.) must always go through purchaseQuiz() /
   getUserOwnedQuizIds() — never touch Firestore directly
   for purchase-related data.

   WHY THIS MATTERS FOR PAYSTACK LATER:
   Right now, purchaseQuiz() is called immediately when the
   user clicks "Purchase" in the mock dialog — simulating a
   payment that already succeeded. When Paystack is wired
   in, the ONLY change needed is *when* purchaseQuiz() is
   called:

     Purchase button -> Paystack Checkout -> on successful
     payment callback -> purchaseQuiz(userId, quizId)

   The function signature, its validation, and everything it
   writes to Firestore stays exactly the same. No caller of
   purchaseQuiz() needs to change.
========================================================= */

/**
 * Checks whether a user already owns (has a paid purchase for) a quiz.
 * Source of truth is the "purchases" collection, not the user's
 * purchasedQuizzes array (which stores purchase doc IDs, not quiz IDs).
 */
export async function hasUserPurchasedQuiz(userId, quizId) {
  if (!userId || !quizId) return false;

  const q = query(
    collection(db, "purchases"),
    where("userId", "==", userId),
    where("quizId", "==", quizId),
    where("status", "==", "paid"),
  );

  const snapshot = await getDocs(q);
  return !snapshot.empty;
}

/**
 * Returns a Set of quizIds the user has already purchased.
 * Used by the Marketplace / My Quizzes pages to decide, for every
 * quiz card, whether to show "Buy" or "Purchased ✅ / Open Quiz"
 * without firing one query per card.
 */
export async function getUserOwnedQuizIds(userId) {
  if (!userId) return new Set();

  const q = query(
    collection(db, "purchases"),
    where("userId", "==", userId),
    where("status", "==", "paid"),
  );

  const snapshot = await getDocs(q);
  const quizIds = new Set();

  snapshot.forEach((docSnap) => {
    quizIds.add(docSnap.data().quizId);
  });

  return quizIds;
}

/**
 * Purchases a quiz for a user.
 *
 * - Prevents duplicate purchases.
 * - Creates a "purchases" document.
 * - Appends the new purchase's doc ID to the user's purchasedQuizzes array.
 *
 * Returns a result object instead of throwing, so calling UI code can
 * branch on `.success` without try/catch everywhere.
 *
 * @returns {Promise<{success: boolean, alreadyOwned?: boolean, purchaseId?: string, message: string}>}
 */
export async function purchaseQuiz(userId, quizId) {
  if (!userId || !quizId) {
    return { success: false, message: "Missing user or quiz information." };
  }

  try {
    const alreadyOwned = await hasUserPurchasedQuiz(userId, quizId);
    if (alreadyOwned) {
      return {
        success: false,
        alreadyOwned: true,
        message: "You already own this quiz.",
      };
    }

    const userRef = doc(db, "users", userId);
    const userSnap = await getDoc(userRef);
    if (!userSnap.exists()) {
      return { success: false, message: "User account not found." };
    }

    const purchaseRef = await addDoc(collection(db, "purchases"), {
      quizId,
      userId,
      purchasedAt: serverTimestamp(),
      status: "paid",
    });

    await updateDoc(userRef, {
      purchasedQuizzes: arrayUnion(purchaseRef.id),
    });

    return {
      success: true,
      purchaseId: purchaseRef.id,
      message: "Purchase successful.",
    };
  } catch (err) {
    console.error("purchaseQuiz failed:", err);
    return {
      success: false,
      message: "Something went wrong. Please try again.",
    };
  }
}
