// js/firebase.js
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.3/firebase-app.js";
import { getAuth } from "https://www.gstatic.com/firebasejs/10.12.3/firebase-auth.js";
import { getFirestore } from "https://www.gstatic.com/firebasejs/10.12.3/firebase-firestore.js";

const firebaseConfig = {
  apiKey: "AIzaSyBzKtJ5P_2bL0LWDOJt4KqMlA1Z8sMOSwo",
  authDomain: "quizarena-2c75e.firebaseapp.com",
  projectId: "quizarena-2c75e",
  storageBucket: "quizarena-2c75e.firebasestorage.app",
  messagingSenderId: "610430960552",
  appId: "1:610430960552:web:23f5ca5be24bf2e2b4139d",
};

export const app = initializeApp(firebaseConfig);
export const auth = getAuth(app);
export const db = getFirestore(app);
