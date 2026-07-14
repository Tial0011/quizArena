import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-app.js";
import { getAuth } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-auth.js";
import { getFirestore } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js";
import {
  getAnalytics,
  isSupported,
} from "https://www.gstatic.com/firebasejs/10.12.0/firebase-analytics.js";
// Your config
const firebaseConfig = {
  apiKey: "AIzaSyBzKtJ5P_2bL0LWDOJt4KqMlA1Z8sMOSwo",
  authDomain: "quizarena-2c75e.firebaseapp.com",
  databaseURL: "https://quizarena-2c75e-default-rtdb.firebaseio.com",
  projectId: "quizarena-2c75e",
  storageBucket: "quizarena-2c75e.appspot.com",
  messagingSenderId: "610430960552",
  appId: "1:610430960552:web:23f5ca5be24bf2e2b4139d",
  measurementId: "G-SY9QG48JJT",
};

// Initialize
const app = initializeApp(firebaseConfig);

// 🔥 EXPORT THESEexport const auth = getAuth(app);
export const db = getFirestore(app);

let analytics = null;

isSupported().then((supported) => {
  if (supported) {
    analytics = getAnalytics(app);
  }
});

export { analytics };
