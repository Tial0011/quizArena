import { auth, db } from "./firebase/config.js";

import {
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
  signOut,
} from "https://www.gstatic.com/firebasejs/10.12.0/firebase-auth.js";

import {
  doc,
  setDoc,
  getDoc,
  serverTimestamp,
} from "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js";

// =========================
// REGISTER
// =========================

export async function registerUser(name, email, password) {
  if (!name || !email || !password) {
    return {
      success: false,
      message: "All fields are required",
    };
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

    return {
      success: true,
      user,
      role: "student",
    };
  } catch (error) {
    console.error(error);

    return {
      success: false,
      message: error.message,
    };
  }
}

// =========================
// LOGIN
// =========================

export async function loginUser(email, password) {
  if (!email || !password) {
    return {
      success: false,
      message: "Email and password are required",
    };
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

    return {
      success: true,
      user,
      role,
    };
  } catch (error) {
    console.error(error);

    return {
      success: false,
      message: error.message,
    };
  }
}

// =========================
// GET USER DATA
// =========================

export async function getUserData(uid) {
  try {
    const snap = await getDoc(doc(db, "users", uid));

    if (!snap.exists()) {
      return null;
    }

    return {
      id: snap.id,
      ...snap.data(),
    };
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

    return {
      success: true,
    };
  } catch (error) {
    console.error(error);

    return {
      success: false,
      message: error.message,
    };
  }
}
