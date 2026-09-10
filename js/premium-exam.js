// js/premium-exam.js
// এই একটা ফাইলই group-a.html, group-b.html, group-c.html — তিনটাতেই ব্যবহার হয়।
// প্রতিটা HTML ফাইলের <body> ট্যাগে data-group="group-a" (বা group-b / group-c) বসানো আছে,
// সেখান থেকেই বোঝা যায় এটা কোন গ্রুপের পেজ।

import { db, ensureSignedIn } from "./firebase-config.js";
import {
  doc, getDoc, collection, setDoc, serverTimestamp,
  query, orderBy, limit, onSnapshot
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";

const GROUP = document.body.dataset.group;       // "group-a" | "group-b" | "group-c"
const EXAM_ID = `${GROUP}-current`;               // এডমিন এই ডকুমেন্ট রিপ্লেস করে নতুন exam বসাবে

// --- সেশন গার্ড: লগইন ছাড়া বা ভুল গ্রুপে ঢুকলে ফেরত পাঠানো হবে ---
const roll = sessionStorage.getItem("nu_roll");
const name = sessionStorage.getItem("nu_name");
const sessionGroup = sessionStorage.getItem("nu_group");

if (!roll || !name || sessionGroup !== GROUP) {
  window.location.href = "premium-login.html";
}

document.getElementById("welcomeText").textContent = `স্বাগতম, ${name} (Roll: ${roll})`;

let examData = null;
let timerInterval = null;
let timeLeft = 0;
let userAnswers = [];
let alreadySubmitted = false;

const startBtn = document.getElementById("start-exam-btn");
const questionContainer = document.getElementById("question-container");
const timerDisplay = document.getElementById("timer");
const submitBtn = document.getElementById("submit-btn");
const resultBox = document.getElementById("result-box");
const reviewBox = document.getElementById("review-box");
const leaderboardList = document.getElementById("leaderboard-list");
const logoutBtn = document.getElementById("logout-btn");

logoutBtn.addEventListener("click", () => {
  sessionStorage.clear();
  window.location.href = "premium-login.html";
});

ensureSignedIn(async () => {
  await checkIfAlreadySubmitted();
  watchLeaderboard();
});

async function checkIfAlreadySubmitted() {
  const subRef = doc(db, "exams", EXAM_ID, "submissions", roll);
  const snap = await getDoc(subRef);
  if (snap.exists()) {
    alreadySubmitted = true;
    startBtn.disabled = true;
    startBtn.textContent = "তুমি ইতিমধ্যে এই পরীক্ষা দিয়েছো";

    // রিভিউ দেখানোর জন্য প্রশ্নের ডেটা লাগবে, তাই এক্সাম ডকুমেন্টও লোড করা হচ্ছে
    if (!examData) {
      const examRef = doc(db, "exams", EXAM_ID);
      const examSnap = await getDoc(examRef);
      if (examSnap.exists()) examData = examSnap.data();
    }

    showResultAndReview({ ...snap.data(), _questions: examData?.questions });
  }
}

startBtn.addEventListener("click", async () => {
  if (alreadySubmitted) return;
  await loadExam();
  if (!examData) return;
  renderQuestions();
  startTimer(examData.durationSeconds);
  startBtn.disabled = true;
});

async function loadExam() {
  const examRef = doc(db, "exams", EXAM_ID);
  const snap = await getDoc(examRef);
  if (!snap.exists()) {
    alert("এখন কোনো লাইভ পরীক্ষা চালু নেই। একটু পরে চেষ্টা করো।");
    return;
  }
  examData = snap.data();
  userAnswers = new Array(examData.questions.length).fill(null);
}

function renderQuestions() {
  questionContainer.innerHTML = "";
  examData.questions.forEach((q, qIndex) => {
    const block = document.createElement("div");
    block.className = "question-block mb-4";

    const qText = document.createElement("p");
    qText.className = "fw-semibold";
    qText.textContent = `${qIndex + 1}. ${q.question}`;
    block.appendChild(qText);

    q.options.forEach((opt, oIndex) => {
      const label = document.createElement("label");
      label.className = "d-block";

      const radio = document.createElement("input");
      radio.type = "radio";
      radio.name = `q${qIndex}`;
      radio.value = oIndex;
      radio.className = "form-check-input me-2";
      radio.addEventListener("change", () => { userAnswers[qIndex] = oIndex; });

      label.appendChild(radio);
      label.append(opt);
      block.appendChild(label);
    });

    questionContainer.appendChild(block);
  });

  submitBtn.classList.remove("d-none");
}

function startTimer(durationSeconds) {
  timeLeft = durationSeconds;
  updateTimerText();
  timerInterval = setInterval(() => {
    timeLeft--;
    updateTimerText();
    if (timeLeft <= 0) {
      clearInterval(timerInterval);
      submitExam();
    }
  }, 1000);
}

function updateTimerText() {
  const m = Math.floor(timeLeft / 60);
  const s = timeLeft % 60;
  timerDisplay.textContent = `${m}:${s.toString().padStart(2, "0")}`;
}

submitBtn.addEventListener("click", () => submitExam());

async function submitExam() {
  clearInterval(timerInterval);
  submitBtn.disabled = true;

  let score = 0;
  examData.questions.forEach((q, i) => {
    if (userAnswers[i] === q.correctAnswerIndex) score += q.points || 1;
  });

  const submissionData = {
    name,
    score,
    totalQuestions: examData.questions.length,
    answers: userAnswers,
    submittedAt: serverTimestamp()
  };

  const subRef = doc(db, "exams", EXAM_ID, "submissions", roll);
  await setDoc(subRef, submissionData);

  alreadySubmitted = true;
  showResultAndReview({ ...submissionData, _questions: examData.questions });
}

function showResultAndReview(data) {
  resultBox.classList.remove("d-none");
  resultBox.textContent = `তোমার স্কোর: ${data.score} / ${data.totalQuestions}`;

  const questions = data._questions || examData?.questions;
  if (!questions) return; // পুরনো সেশনে question data লোড করা নেই, শুধু স্কোর দেখানো হবে

  reviewBox.innerHTML = "<h5 class='mt-4 fw-bold'>উত্তর রিভিউ</h5>";
  questions.forEach((q, i) => {
    const yourAns = data.answers[i];
    const correct = q.correctAnswerIndex;
    const isCorrect = yourAns === correct;

    const div = document.createElement("div");
    div.className = `p-3 mb-2 rounded ${isCorrect ? "bg-success-subtle" : "bg-danger-subtle"}`;
    div.innerHTML = `
      <p class="fw-semibold mb-1">${i + 1}. ${q.question}</p>
      <p class="mb-1">তোমার উত্তর: ${yourAns !== null ? q.options[yourAns] : "দাওনি"}</p>
      <p class="mb-0">সঠিক উত্তর: ${q.options[correct]}</p>
    `;
    reviewBox.appendChild(div);
  });
}

function watchLeaderboard() {
  const submissionsRef = collection(db, "exams", EXAM_ID, "submissions");
  const q = query(submissionsRef, orderBy("score", "desc"), limit(50));

  onSnapshot(q, (snapshot) => {
    leaderboardList.innerHTML = "";
    let rank = 1;
    snapshot.forEach((docSnap) => {
      const d = docSnap.data();
      const li = document.createElement("li");
      li.className = "list-group-item d-flex justify-content-between";
      li.innerHTML = `<span>${rank}. ${d.name}</span><strong>${d.score}/${d.totalQuestions}</strong>`;
      leaderboardList.appendChild(li);
      rank++;
    });
    if (snapshot.empty) {
      leaderboardList.innerHTML = "<li class='list-group-item'>এখনো কেউ সাবমিট করেনি</li>";
    }
  });
}
