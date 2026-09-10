// js/firebase-config.js
// এখানে আপনার নিজের Firebase প্রজেক্ট config বসান।
// Firebase Console -> Project Settings -> General -> Your apps -> SDK setup and configuration

import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js";
import { getFirestore } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";
import { getAuth, signInAnonymously, onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";

const firebaseConfig = {
  apiKey: "YOUR_API_KEY",
  authDomain: "YOUR_PROJECT.firebaseapp.com",
  projectId: "YOUR_PROJECT_ID",
  storageBucket: "YOUR_PROJECT.appspot.com",
  messagingSenderId: "YOUR_SENDER_ID",
  appId: "YOUR_APP_ID"
};

const app = initializeApp(firebaseConfig);
export const db = getFirestore(app);
export const auth = getAuth(app);

// Firestore write করার permission পেতে (rules-এ request.auth != null চেক করা হয়)
// প্রতিটা visitor কে চুপচাপ anonymous sign-in করিয়ে দেওয়া হচ্ছে
export function ensureSignedIn(callback) {
  onAuthStateChanged(auth, (user) => {
    if (user) callback(user);
    else signInAnonymously(auth).catch((err) => console.error("Auth error:", err));
  });
}
