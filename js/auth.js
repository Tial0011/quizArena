import { auth, db } from "./firebase/config.js";

import {
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
  signInWithPopup,
  GoogleAuthProvider,
  sendPasswordResetEmail,
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

    return { success: true, user, role: "student" };
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
    await signOut(auth);

    // Redirect after successful logout
    window.location.href = "/index.html"; // adjust path to your login/landing page

    return { success: true };
  } catch (error) {
    console.error(error);
    return { success: false, message: error.message };
  }
}
