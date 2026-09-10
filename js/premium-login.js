// js/premium-login.js
import { db, ensureSignedIn } from "./firebase-config.js";
import { doc, getDoc } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";

ensureSignedIn(() => {}); // early anonymous sign-in

const form = document.getElementById("loginForm");
const nameInput = document.getElementById("studentName");
const rollInput = document.getElementById("studentRoll");
const msgBox = document.getElementById("loginMessage");

// প্রতিটা গ্রুপ কোন পেজে redirect হবে
const GROUP_PAGES = {
  "group-a": "group-a.html",
  "group-b": "group-b.html",
  "group-c": "group-c.html"
};

form.addEventListener("submit", async (e) => {
  e.preventDefault();
  msgBox.classList.add("d-none");

  const name = nameInput.value.trim();
  const roll = rollInput.value.trim();

  if (!name || !roll) {
    showMessage("নাম ও রোল নম্বর দুটোই দিন।", "danger");
    return;
  }

  const submitBtn = form.querySelector("button[type=submit]");
  submitBtn.disabled = true;
  submitBtn.textContent = "যাচাই করা হচ্ছে...";

  try {
    const studentRef = doc(db, "students", roll);
    const snap = await getDoc(studentRef);

    if (!snap.exists()) {
      showMessage("এই রোল নম্বরটি Premium Batch-এ নেই। ভুল থাকলে আবার চেক করুন।", "danger");
      return;
    }

    const data = snap.data();

    // নামের বানান নিয়ে ঝামেলা এড়াতে case-insensitive, trim করে মেলানো হচ্ছে
    if (data.name.trim().toLowerCase() !== name.toLowerCase()) {
      showMessage("নাম এই রোল নম্বরের সাথে মিলছে না।", "danger");
      return;
    }

    const group = data.group; // যেমন: "group-a"
    const pageUrl = GROUP_PAGES[group];

    if (!pageUrl) {
      showMessage("আপনার গ্রুপ সঠিকভাবে সেট করা নেই। এডমিনের সাথে যোগাযোগ করুন।", "danger");
      return;
    }

    // সেশনে লগইন তথ্য সেভ করা হচ্ছে (শুধু এই ব্রাউজার ট্যাবের জন্য)
    sessionStorage.setItem("nu_roll", roll);
    sessionStorage.setItem("nu_name", data.name);
    sessionStorage.setItem("nu_group", group);

    window.location.href = pageUrl;
  } catch (err) {
    console.error(err);
    showMessage("কিছু একটা সমস্যা হয়েছে, আবার চেষ্টা করুন।", "danger");
  } finally {
    submitBtn.disabled = false;
    submitBtn.textContent = "Login";
  }
});

function showMessage(text, type) {
  msgBox.className = `alert alert-${type} mt-3`;
  msgBox.textContent = text;
}
