// authCheck.js
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js";
import { getAuth, onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";

// 🔧 Your Firebase config
const firebaseConfig = {
  apiKey: "AIzaSyCh4rG-JBamK1YVjZIKy49BL7sO_cUzuog",
  authDomain: "idr-488b2.firebaseapp.com",
  projectId: "idr-488b2",
  storageBucket: "idr-488b2.appspot.com",
  messagingSenderId: "220979507758",
  appId: "1:220979507758:web:d2860ac10cfb58ad5725bf"
};

// 🔌 Connect to Firebase
const app = initializeApp(firebaseConfig);
const auth = getAuth(app);

// ✅ Main function to check login
export function protectPage(redirectIfNotLoggedIn = "/index.html") {
  onAuthStateChanged(auth, (user) => {
    if (!user) {
      window.location.href = redirectIfNotLoggedIn;
    }
  });
}

// ✅ Optional: Auto redirect to home if user is already logged in
export function redirectIfLoggedIn(toPage = "/home.html") {
  onAuthStateChanged(auth, (user) => {
    if (user) {
      window.location.href = toPage;
    }
  });
}

// 🔓 Logout shortcut
export async function logout() {
  await auth.signOut();
  window.location.href = "/index.html";
}
