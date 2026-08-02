import { db } from "../firebase/config.js";
import { app } from "../firebase/config.js";
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
import {
  getFunctions,
  httpsCallable,
} from "https://www.gstatic.com/firebasejs/10.12.0/firebase-functions.js";

/* =========================================================
   PURCHASE SERVICE

   This is the ONLY module allowed to write to the
   "purchases" collection or update a user's
   purchasedQuizzes array. UI code (marketplace, my-quizzes,
   etc.) must always go through purchaseQuiz() /
   getUserOwnedQuizIds() — never touch Firestore directly
   for purchase-related data.

   FLUTTERWAVE:
   purchaseQuiz() below is the OLD mock-purchase writer —
   kept here for reference / backward compatibility, but no
   longer called by the Marketplace UI.

   Real payments now go through confirmFlutterwavePurchase(),
   which calls the verifyFlutterwavePurchase Cloud Function.
   That function independently re-verifies the transaction
   with Flutterwave's servers and does the equivalent
   Firestore writes (same "purchases" collection, same
   purchasedQuizzes array) server-side, so no other file in
   the app needs to change.
========================================================= */

const functions = getFunctions(app);
const verifyFlutterwavePurchaseCallable = httpsCallable(
  functions,
  "verifyFlutterwavePurchase",
);

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
 * OLD mock-purchase writer. No longer called by the Marketplace UI —
 * kept here in case anything else in the app still references it.
 * Real purchases now go through confirmFlutterwavePurchase() below.
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

/**
 * Confirms a Flutterwave payment by calling the verifyFlutterwavePurchase
 * Cloud Function, which re-checks the transaction directly with
 * Flutterwave's servers before writing anything to Firestore.
 *
 * This is the ONLY way a Flutterwave purchase should be finalized —
 * never write "paid" to Firestore from the browser directly.
 *
 * @returns {Promise<{success: boolean, alreadyOwned?: boolean, purchaseId?: string, message: string}>}
 */
export async function confirmFlutterwavePurchase(
  userId,
  quizId,
  txRef,
  transactionId,
) {
  try {
    const result = await verifyFlutterwavePurchaseCallable({
      userId,
      quizId,
      txRef,
      transactionId,
    });
    return result.data;
  } catch (err) {
    console.error("confirmFlutterwavePurchase failed:", err);
    return {
      success: false,
      message: "Payment verification failed. Please contact support.",
    };
  }
}
