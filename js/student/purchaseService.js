import { auth, db } from "../firebase/config.js";
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

   FLUTTERWAVE:
   purchaseQuiz() below is the OLD mock-purchase writer —
   kept here for reference / backward compatibility, but no
   longer called by the Marketplace UI.

   Real payments now go through confirmFlutterwavePurchase(),
   which calls the protected Netlify payment function.
   That function independently re-verifies the transaction
   with Flutterwave's servers and does the equivalent
   Firestore writes (same "purchases" collection, same
   purchasedQuizzes array) server-side, so no other file in
   the app needs to change.
========================================================= */

const WELCOME_QUIZ_ID = "odlJoarhn2atl14EpZq6";

async function callPaymentFunction(action, payload) {
  const token = await auth.currentUser?.getIdToken();
  if (!token) throw new Error("Please sign in again before checking out.");

  const response = await fetch("/.netlify/functions/payment", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({ action, ...payload }),
  });
  const data = await response.json().catch(() => null);
  if (!response.ok) {
    throw new Error(data?.message || "Checkout is temporarily unavailable. Please try again.");
  }
  return data;
}

export async function quoteFlutterwavePurchase(userId, quizIds) {
  try {
    return await callPaymentFunction("quote", { userId, quizIds });
  } catch (err) {
    console.error("quoteFlutterwavePurchase failed:", err);
    return {
      success: false,
      message: err?.message || "Could not calculate the checkout total. Please try again.",
    };
  }
}

/**
 * Checks whether a user already owns (has a paid purchase for) a quiz.
 * Source of truth is the "purchases" collection, not the user's
 * purchasedQuizzes array (which stores purchase doc IDs, not quiz IDs).
 */
export async function hasUserPurchasedQuiz(userId, quizId) {
  if (!userId || !quizId || quizId === WELCOME_QUIZ_ID) return false;

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
    if (docSnap.data().quizId !== WELCOME_QUIZ_ID) {
      quizIds.add(docSnap.data().quizId);
    }
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
  if (quizId === WELCOME_QUIZ_ID) {
    return { success: false, message: "The welcome quiz is free and already available in your dashboard." };
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
 * Confirms a Flutterwave payment through the Netlify payment function, which
 * re-checks the transaction directly with
 * Flutterwave's servers before writing anything to Firestore.
 *
 * This is the ONLY way a Flutterwave purchase should be finalized —
 * never write "paid" to Firestore from the browser directly.
 *
 * @returns {Promise<{success: boolean, alreadyOwned?: boolean, purchaseId?: string, message: string}>}
 */
export async function confirmFlutterwavePurchase(
  userId,
  quizIds,
  txRef,
  transactionId,
) {
  // Accepts one id or many: a single payment can now unlock a whole pack.
  const ids = Array.isArray(quizIds) ? quizIds : [quizIds];
  if (ids.includes(WELCOME_QUIZ_ID)) {
    return { success: false, message: "The welcome quiz is free and cannot be purchased." };
  }
  try {
    return await callPaymentFunction("verify", {
      userId,
      quizIds: ids,
      txRef,
      transactionId,
    });
  } catch (err) {
    console.error("confirmFlutterwavePurchase failed:", err);
    return {
      success: false,
      message: "Payment verification failed. Please contact support.",
    };
  }
}
