import { auth, db } from "./firebase/config.js";
import { stopSessionManager } from "./sessionManager.js";
import { recordLogin } from "./activityTracker.js";
import { sendWelcomeNotification } from "./notificationsService.js";

import {
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
  signInWithPopup,
  GoogleAuthProvider,
  sendPasswordResetEmail,
  sendEmailVerification,
  signOut,
  updateProfile,
} from "https://www.gstatic.com/firebasejs/10.12.0/firebase-auth.js";

import {
  doc,
  setDoc,
  getDoc,
  updateDoc,
  deleteDoc,
  writeBatch,
  serverTimestamp,
} from "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js";

const googleProvider = new GoogleAuthProvider();

// =========================
// USERNAME VALIDATION & SUGGESTIONS
// =========================
export function validateUsername(name) {
  if (!name || typeof name !== "string") {
    return { valid: false, message: "Username is required." };
  }
  const clean = name.trim().replace(/^@/, "");
  if (clean.length < 3) {
    return { valid: false, message: "Username must be at least 3 characters." };
  }
  if (clean.length > 20) {
    return { valid: false, message: "Username cannot exceed 20 characters." };
  }
  if (/\s/.test(clean)) {
    return {
      valid: false,
      message: "Username cannot contain spaces. Use underscores (_) instead.",
    };
  }
  if (!/^[a-zA-Z0-9_]+$/.test(clean)) {
    return {
      valid: false,
      message: "Only letters, numbers, and underscores (_) are allowed.",
    };
  }
  return { valid: true, clean, normalized: clean.toLowerCase() };
}

export async function checkUsernameAvailable(name) {
  const check = validateUsername(name);
  if (!check.valid) {
    return { valid: false, available: false, message: check.message };
  }

  try {
    const snap = await getDoc(doc(db, "usernames", check.normalized));
    if (snap.exists()) {
      return {
        valid: true,
        available: false,
        normalized: check.normalized,
        clean: check.clean,
        message: "Username is already taken.",
      };
    }
    return {
      valid: true,
      available: true,
      normalized: check.normalized,
      clean: check.clean,
      message: "Username is available!",
    };
  } catch (err) {
    console.error("[auth] checkUsernameAvailable error:", err);
    return {
      valid: true,
      available: false,
      error: true,
      message: "Unable to verify username right now.",
    };
  }
}

export async function suggestUsernames(baseName, count = 3) {
  let base = (baseName || "")
    .trim()
    .replace(/^@/, "")
    .toLowerCase()
    .replace(/[^a-z0-9_]/g, "_")
    .replace(/_+/g, "_")
    .replace(/^_+|_+$/g, "");

  if (!base || base.length < 2) {
    base = "student";
  }

  if (base.length > 13) {
    base = base.slice(0, 13);
  }

  const randInt = (min, max) =>
    Math.floor(Math.random() * (max - min + 1)) + min;
  const currentYearShort = new Date().getFullYear().toString().slice(-2);

  const candidatePool = [
    `${base}${randInt(10, 99)}`,
    `${base}_${randInt(1, 99)}`,
    `${base}_qa`,
    `${base}_med`,
    `${base}_cbt`,
    `${base}${currentYearShort}`,
    `the_${base}`,
    `${base}_pro`,
    `${base}_arena`,
    `${base}${randInt(100, 999)}`,
  ];

  const uniquePool = Array.from(new Set(candidatePool)).filter(
    (c) => c.length >= 3 && c.length <= 20 && /^[a-z0-9_]+$/.test(c),
  );

  const shuffled = uniquePool.sort(() => 0.5 - Math.random());
  const available = [];

  for (const candidate of shuffled) {
    if (available.length >= count) break;
    try {
      const snap = await getDoc(doc(db, "usernames", candidate));
      if (!snap.exists()) {
        available.push(candidate);
      }
    } catch {
      // Ignore read errors for candidates and continue
    }
  }

  return available;
}

export async function generateAvailableUsername(preferredBase) {
  let base = (preferredBase || "")
    .trim()
    .replace(/^@/, "")
    .toLowerCase()
    .replace(/[^a-z0-9_]/g, "_")
    .replace(/_+/g, "_")
    .replace(/^_+|_+$/g, "");

  if (!base || base.length < 3) base = "student";
  if (base.length > 15) base = base.slice(0, 15);

  try {
    const snap = await getDoc(doc(db, "usernames", base));
    if (!snap.exists()) return base;
  } catch {}

  const suggestions = await suggestUsernames(base, 1);
  if (suggestions.length > 0) return suggestions[0];

  return `${base}_${Date.now().toString().slice(-4)}`;
}

// =========================
// REGISTER
// =========================
const REFERRAL_SOURCES = new Set(["linkedin", "whatsapp", "tiktok", "google"]);

export async function registerUser(fullName, username, email, password, referralSource) {
  // Support both (fullName, username, email, password, referralSource)
  // and legacy (name, email, password, referralSource)
  let actualFullName = fullName;
  let actualUsername = username;
  let actualEmail = email;
  let actualPassword = password;
  let actualReferral = referralSource;

  if (arguments.length === 4) {
    actualFullName = arguments[0];
    actualUsername = arguments[0];
    actualEmail = arguments[1];
    actualPassword = arguments[2];
    actualReferral = arguments[3];
  }

  if (!actualFullName || !actualUsername || !actualEmail || !actualPassword) {
    return { success: false, message: "All fields are required" };
  }
  if (!REFERRAL_SOURCES.has(actualReferral)) {
    return { success: false, message: "Choose how you found Quiz Arena." };
  }

  const usernameCheck = validateUsername(actualUsername);
  if (!usernameCheck.valid) {
    return { success: false, message: usernameCheck.message };
  }

  const availability = await checkUsernameAvailable(actualUsername);
  if (!availability.available) {
    const suggestions = await suggestUsernames(usernameCheck.clean, 3);
    return {
      success: false,
      message: "Username is already taken.",
      suggestions,
    };
  }

  try {
    const credential = await createUserWithEmailAndPassword(
      auth,
      actualEmail,
      actualPassword,
    );
    const user = credential.user;

    const cleanUsername = usernameCheck.clean;
    const normalizedUsername = usernameCheck.normalized;
    const cleanFullName = actualFullName.trim().replace(/\s+/g, " ");

    // 1. Reserve unique username handle
    await setDoc(doc(db, "usernames", normalizedUsername), {
      uid: user.uid,
      username: cleanUsername,
      createdAt: serverTimestamp(),
    });

    // 2. Create user profile
    await setDoc(doc(db, "users", user.uid), {
      name: cleanFullName,
      username: cleanUsername,
      usernameLower: normalizedUsername,
      email: actualEmail,
      role: "student",
      referralSource: actualReferral,
      welcomeQuizEligible: true,
      welcomeQuizCompleted: false,
      purchasedQuizzes: [],
      createdAt: serverTimestamp(),
    });

    updateProfile(user, { displayName: cleanFullName }).catch(() => {});

    // Fire-and-forget: welcome ping
    sendWelcomeNotification(user.uid, cleanFullName || cleanUsername);
    recordLogin(user);

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
        welcomeQuizEligible: true,
        welcomeQuizCompleted: false,
        createdAt: serverTimestamp(),
      });

      sendWelcomeNotification(user.uid, user.email);
    } else {
      role = snap.data().role || "student";
    }

    recordLogin(user);

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
export async function signInWithGoogle(referralSource = null) {
  try {
    const credential = await signInWithPopup(auth, googleProvider);
    const user = credential.user;

    const userRef = doc(db, "users", user.uid);
    const snap = await getDoc(userRef);

    let role = "student";

    if (!snap.exists()) {
      if (!referralSource) return { success: false, needsReferralSource: true, user };
      return completeGoogleSignup(user, referralSource);
    } else {
      role = snap.data().role || "student";
    }

    recordLogin(user);

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

export async function completeGoogleSignup(user, referralSource) {
  if (!user || !REFERRAL_SOURCES.has(referralSource)) {
    return { success: false, message: "Choose how you found Quiz Arena." };
  }
  try {
    const userRef = doc(db, "users", user.uid);
    const existing = await getDoc(userRef);
    if (existing.exists()) {
      return { success: true, user, role: existing.data().role || "student" };
    }

    // Determine clean full name and unique username
    const fullName = (user.displayName || "").trim() || "Student";
    const emailPrefix = (user.email || "").split("@")[0] || "student";
    const baseCandidate = (user.displayName || emailPrefix)
      .toLowerCase()
      .replace(/[^a-z0-9_]/g, "_")
      .replace(/_+/g, "_")
      .replace(/^_+|_+$/g, "");

    const assignedUsername = await generateAvailableUsername(baseCandidate);
    const normalizedUsername = assignedUsername.toLowerCase();

    // 1. Reserve username
    await setDoc(doc(db, "usernames", normalizedUsername), {
      uid: user.uid,
      username: assignedUsername,
      createdAt: serverTimestamp(),
    });

    // 2. Create user profile
    await setDoc(userRef, {
      name: fullName,
      username: assignedUsername,
      usernameLower: normalizedUsername,
      email: user.email,
      role: "student",
      referralSource,
      welcomeQuizEligible: true,
      welcomeQuizCompleted: false,
      purchasedQuizzes: [],
      createdAt: serverTimestamp(),
    });

    sendWelcomeNotification(user.uid, fullName);
    recordLogin(user);
    return { success: true, user, role: "student" };
  } catch (error) {
    console.error(error);
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
// UPDATE USERNAME (SETTINGS)
// =========================
export async function updateUsername(uid, newUsername, oldUsername = "") {
  if (!uid) return { success: false, message: "User not authenticated." };

  const check = validateUsername(newUsername);
  if (!check.valid) return { success: false, message: check.message };

  const cleanOld = (oldUsername || "")
    .trim()
    .replace(/^@/, "")
    .toLowerCase();
  const newNormalized = check.normalized;

  if (cleanOld && cleanOld === newNormalized) {
    return { success: true, message: "No change to username.", username: check.clean };
  }

  // Check availability
  const availability = await checkUsernameAvailable(newNormalized);
  if (!availability.available) {
    const suggestions = await suggestUsernames(check.clean, 3);
    return {
      success: false,
      message: "Username is already taken.",
      suggestions,
    };
  }

  try {
    const batch = writeBatch(db);

    // 1. Create new username reservation
    const newUsernameRef = doc(db, "usernames", newNormalized);
    batch.set(newUsernameRef, {
      uid,
      username: check.clean,
      createdAt: serverTimestamp(),
    });

    // 2. Delete old username doc if it existed
    if (cleanOld) {
      const oldUsernameRef = doc(db, "usernames", cleanOld);
      batch.delete(oldUsernameRef);
    }

    // 3. Update user document
    const userRef = doc(db, "users", uid);
    batch.update(userRef, {
      username: check.clean,
      usernameLower: newNormalized,
    });

    await batch.commit();

    return {
      success: true,
      username: check.clean,
      message: "Username updated successfully!",
    };
  } catch (err) {
    console.error("[auth] updateUsername failed:", err);
    return { success: false, message: err.message || "Failed to update username." };
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
