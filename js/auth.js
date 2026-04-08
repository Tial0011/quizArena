import { auth, db } from "./firebase/config.js";
import { signInWithEmailAndPassword } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-auth.js";
import {
  doc,
  getDoc,
  setDoc,
} from "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js";

export async function loginUser(email, password) {
  if (!email || !password) {
    return { success: false, message: "All fields are required" };
  }

  try {
    const userCredential = await signInWithEmailAndPassword(
      auth,
      email,
      password,
    );

    const user = userCredential.user;

    const userRef = doc(db, "users", user.uid);
    const snap = await getDoc(userRef);

    let role = "student";

    if (!snap.exists()) {
      await setDoc(userRef, {
        email: user.email,
        role: "student",
        createdAt: new Date(),
      });
    } else {
      role = snap.data().role;
    }

    return {
      success: true,
      user,
      role,
    };
  } catch (error) {
    console.log(error);

    return {
      success: false,
      message: error.message,
    };
  }
}
