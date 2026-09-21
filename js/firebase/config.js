import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-app.js";
import { getAuth } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-auth.js";
import {
  getFirestore,
  initializeFirestore,
  persistentLocalCache,
  persistentMultipleTabManager,
} from "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js";
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
export const app = initializeApp(firebaseConfig);

// 🔥 EXPORT THESE
export const auth = getAuth(app);
/**
 * Firestore with an on-device cache (IndexedDB). Anything the student has
 * already loaded -- their profile, practice questions, past attempts -- can
 * be read with no network, and reads always go to the server first when
 * online, so nothing goes stale. Multi-tab so two open tabs don't fight
 * over the cache. If the browser can't provide IndexedDB (some private
 * modes) we fall back to the normal in-memory Firestore instead of failing.
 */
function createDb() {
  try {
    return initializeFirestore(app, {
      localCache: persistentLocalCache({
        tabManager: persistentMultipleTabManager(),
      }),
    });
  } catch (err) {
    console.warn("Offline data cache unavailable, using memory only:", err);
    return getFirestore(app);
  }
}

export const db = createDb();

let analytics = null;

isSupported().then((supported) => {
  if (supported) {
    analytics = getAnalytics(app);
  }
});

export { analytics };
