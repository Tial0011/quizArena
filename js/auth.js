import { auth, db } from "./firebase/config.js";
import { stopSessionManager } from "./sessionManager.js";
import { sendWelcomeNotification } from "./notificationsService.js";

import {
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
  signInWithPopup,
  GoogleAuthProvider,
  sendPasswordResetEmail,
  sendEmailVerification,
  signOut,
} from "https://www.gstatic.com/firebasejs/10.12.0/firebase-auth.js";

import {
  doc,
  setDoc,
  getDoc,
  serverTimestamp,
} from "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js";

const googleProvider = new GoogleAuthProvider();

// =========================
// REGISTER
// =========================
export async function registerUser(name, email, password) {
  if (!name || !email || !password) {
    return { success: false, message: "All fields are required" };
  }

  try {
    const credential = await createUserWithEmailAndPassword(
      auth,
      email,
      password,
    );
    const user = credential.user;

    await setDoc(doc(db, "users", user.uid), {
      name,
      email,
      role: "student",
      purchasedQuizzes: [],
      createdAt: serverTimestamp(),
    });

    // Fire-and-forget: a welcome ping failing to send should never
    // hold up registration or surface as a signup error.
    sendWelcomeNotification(user.uid, name);

    // Send the email-verification link. This is a real Firebase email
    // send (not a Cloud Function) — it can genuinely fail (rate limits,
    // bad SMTP relay on Firebase's side, etc.), but a failure here
    // should never block account creation, which has already
    // succeeded. The UI that shows next tells the student to check
    // spam either way and offers a manual resend.
    let verificationEmailSent = true;
    try {
      await sendEmailVerification(user);
    } catch (verificationError) {
      console.error("[auth] sendEmailVerification failed", verificationError);
      verificationEmailSent = false;
    }

    return {
      success: true,
      user,
      role: "student",
      verificationEmailSent,
    };
  } catch (error) {
    console.error(error);
    return { success: false, message: error.message };
  }
}

// =========================
// LOGIN
// =========================
export async function loginUser(email, password) {
  if (!email || !password) {
    return { success: false, message: "Email and password are required" };
  }

  try {
    const credential = await signInWithEmailAndPassword(auth, email, password);
    const user = credential.user;

    const userRef = doc(db, "users", user.uid);
    const snap = await getDoc(userRef);

    let role = "student";

    if (!snap.exists()) {
      await setDoc(userRef, {
        email: user.email,
        role: "student",
        purchasedQuizzes: [],
        createdAt: serverTimestamp(),
      });

      sendWelcomeNotification(user.uid, user.email);
    } else {
      role = snap.data().role || "student";
    }

    return { success: true, user, role };
  } catch (error) {
    console.error(error);
    return { success: false, message: error.message };
  }
}

// =========================
// GOOGLE SIGN-IN
// Handles both new accounts and returning users in one action —
// creates the Firestore user doc on first sign-in, same as
// loginUser() does for email/password.
// =========================
export async function signInWithGoogle() {
  try {
    const credential = await signInWithPopup(auth, googleProvider);
    const user = credential.user;

    const userRef = doc(db, "users", user.uid);
    const snap = await getDoc(userRef);

    let role = "student";

    if (!snap.exists()) {
      await setDoc(userRef, {
        name: user.displayName || "",
        email: user.email,
        role: "student",
        purchasedQuizzes: [],
        createdAt: serverTimestamp(),
      });

      sendWelcomeNotification(user.uid, user.displayName);
    } else {
      role = snap.data().role || "student";
    }

    return { success: true, user, role };
  } catch (error) {
    console.error(error);

    // Popup being closed or blocked is common and not a real
    // "error" worth showing raw Firebase error text for.
    if (error.code === "auth/popup-closed-by-user") {
      return { success: false, message: "Sign-in was cancelled." };
    }

    if (error.code === "auth/popup-blocked") {
      return {
        success: false,
        message:
          "Your browser blocked the sign-in popup. Please allow popups and try again.",
      };
    }

    return { success: false, message: error.message };
  }
}

// =========================
// FORGOT PASSWORD
// =========================
export async function resetPassword(email) {
  if (!email) {
    return { success: false, message: "Enter your email first." };
  }

  try {
    await sendPasswordResetEmail(auth, email);
    return {
      success: true,
      message: "Password reset email sent. Check your inbox.",
    };
  } catch (error) {
    console.error(error);
    return { success: false, message: error.message };
  }
}

// =========================
// EMAIL VERIFICATION
// =========================

/**
 * Resends the verification link to the currently signed-in user.
 * Used by the "verify your email" gate (js/emailVerificationGate.js)
 * when a student didn't get the original email or it landed in spam
 * and they've deleted/missed it.
 */
export async function resendVerificationEmail(user) {
  if (!user) {
    return { success: false, message: "No signed-in user to verify." };
  }

  try {
    await sendEmailVerification(user);
    return {
      success: true,
      message:
        "Verification email sent. Please also check your Spam/Junk folder — it almost always lands there first.",
    };
  } catch (error) {
    console.error(error);

    if (error.code === "auth/too-many-requests") {
      return {
        success: false,
        message:
          "Too many attempts — please wait a few minutes before requesting another verification email.",
      };
    }

    return { success: false, message: error.message };
  }
}

// =========================
// GET USER DATA
// =========================
export async function getUserData(uid) {
  try {
    const snap = await getDoc(doc(db, "users", uid));
    if (!snap.exists()) return null;

    return { id: snap.id, ...snap.data() };
  } catch (error) {
    console.error(error);
    return null;
  }
}

// =========================
// LOGOUT
// =========================
export async function logoutUser() {
  try {
    stopSessionManager();

    await signOut(auth);

    window.location.href = "/index.html";
  } catch (error) {
    console.error(error);

    return {
      success: false,
      message: error.message,
    };
  }
}
