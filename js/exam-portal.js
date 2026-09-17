// NU Crackers - Interactive Live Exam, Leaderboard & Answer Review Portal

document.addEventListener('DOMContentLoaded', () => {
  const currentGroup = document.body.getAttribute('data-group') || 'science';
  let currentStudent = null;
  let activeExamData = null;
  let userAnswers = {};
  let timerInterval = null;
  let remainingSeconds = 0;
  let totalDurationSeconds = 0;
  let currentQuestionIndex = 0;

  // 1. Session & Group Access Verification
  function getStudent() {
    const raw = localStorage.getItem('nu_student');
    if (raw) {
      try {
        return JSON.parse(raw);
      } catch (e) {
        return null;
      }
    }
    return null;
  }

  currentStudent = getStudent();

  // Strict Authentication & Group Isolation
  if (!currentStudent) {
    sessionStorage.setItem('nu_login_redirect_reason', 'প্রিমিয়াম মডেল টেস্টে অংশগ্রহণের জন্য অনুগ্রহ করে আপনার রোল ও নাম দিয়ে লগইন করুন।');
    window.location.replace('premium-login.html');
    return;
  }

  // If student registration is pending approval
  if (currentStudent.status === 'pending') {
    localStorage.removeItem('nu_student');
    sessionStorage.setItem('nu_login_redirect_reason', 'আপনার রেজিস্ট্রেশনটি এখনো এডমিন দ্বারা অনুমোদিত হয়নি। এডমিন অনুমোদনের পর আপনি প্রবেশ করতে পারবেন।');
    window.location.replace('premium-login.html');
    return;
  }

  // Cross-group access restriction: Science student cannot access Arts/Commerce exams!
  if (currentStudent.group !== currentGroup) {
    const groupTitles = {
      science: 'বিজ্ঞান ইউনিট (Science)',
      arts: 'মানবিক ইউনিট (Arts)',
      commerce: 'ব্যবসায় শিক্ষা ইউনিট (Commerce)'
    };
    const groupPages = {
      science: 'science-exams.html',
      arts: 'arts-exams.html',
      commerce: 'commerce-exams.html'
    };

    const myGroupName = groupTitles[currentStudent.group] || currentStudent.group.toUpperCase();
    const currentGroupName = groupTitles[currentGroup] || currentGroup.toUpperCase();

    alert(`⛔ প্রবেশাধিকার সংরক্ষিত!\n\nআপনি "${myGroupName}"-এর শিক্ষার্থী। আপনি "${currentGroupName}"-এর কোনো পরীক্ষায় প্রবেশ করতে পারবেন না।\n\nআপনাকে আপনার নিজস্ব "${myGroupName}" পোর্টালে নিয়ে যাওয়া হচ্ছে।`);
    window.location.replace(groupPages[currentStudent.group] || 'index.html');
    return;
  }

  renderStudentHeader();
  loadGroupExams();

  // Render Student Info in Header
  function renderStudentHeader() {
    const userBanner = document.getElementById('studentBanner');
    if (!userBanner) return;

    const groupNames = {
      science: 'বিজ্ঞান ইউনিট (Science)',
      arts: 'মানবিক ইউনিট (Arts)',
      commerce: 'ব্যবসায় শিক্ষা (Commerce)'
    };

    userBanner.innerHTML = `
      <div class="bg-white border rounded-4 p-3 shadow-sm d-flex flex-wrap align-items-center justify-content-between gap-3">
        <div class="d-flex align-items-center gap-3">
          <div class="rounded-circle bg-primary bg-opacity-10 text-primary d-flex align-items-center justify-content-center" style="width:48px; height:48px; font-size:1.3rem;">
            <i class="fa-solid fa-user-graduate"></i>
          </div>
          <div>
            <h6 class="fw-bold mb-0 text-dark">${escapeHtml(currentStudent.name)}</h6>
            <div class="small text-muted d-flex align-items-center gap-2 mt-1">
              <span class="badge bg-primary rounded-pill px-2 py-1">রোল: ${escapeHtml(currentStudent.roll)}</span>
              <span class="badge bg-light text-dark border rounded-pill px-2 py-1">${groupNames[currentStudent.group] || currentStudent.group.toUpperCase()}</span>
              <span class="badge bg-success bg-opacity-10 text-success border border-success border-opacity-25 rounded-pill px-2 py-1">
                <i class="fa-solid fa-shield-check me-1"></i>গ্রুপ অথরাইজড
              </span>
            </div>
          </div>
        </div>

        <div class="d-flex align-items-center gap-2">
          <button id="logoutBtn" class="btn btn-outline-danger btn-sm rounded-pill px-3">
            <i class="fa-solid fa-arrow-right-from-bracket me-1"></i> লগআউট
          </button>
        </div>
      </div>
    `;

    document.getElementById('logoutBtn')?.addEventListener('click', () => {
      if (confirm('আপনি কি নিশ্চিত যে লগআউট করতে চান?')) {
        localStorage.removeItem('nu_student');
        window.location.href = 'premium-login.html';
      }
    });
  }

  // 2. Load Exams for Current Group
  async function loadGroupExams() {
    const listContainer = document.getElementById('examsListContainer');
    if (!listContainer) return;

    listContainer.innerHTML = `
      <div class="col-12 text-center py-5">
        <div class="spinner-border text-primary" role="status"></div>
        <p class="text-muted mt-2">লাইভ পরীক্ষাগুলো লোড হচ্ছে...</p>
      </div>
    `;

    try {
      const rollParam = currentStudent ? `&roll=${encodeURIComponent(currentStudent.roll)}` : '';
      const res = await fetch(`/api/exams?group=${currentGroup}${rollParam}`);
      const data = await res.json();

      if (!res.ok || !data.success) {
        throw new Error(data.message || 'পরীক্ষা লোড করা সম্ভব হয়নি');
      }

      const exams = data.exams || [];
      if (exams.length === 0) {
        listContainer.innerHTML = `
          <div class="col-12 text-center py-5">
            <div class="text-muted fs-1 mb-2"><i class="fa-regular fa-folder-open"></i></div>
            <h5>এই মুহূর্তে কোনো পরীক্ষা সক্রিয় নেই।</h5>
            <p class="text-muted">শীঘ্রই নতুন মডেল টেস্ট সংযুক্ত করা হবে।</p>
          </div>
        `;
        return;
      }

      listContainer.innerHTML = exams.map((exam, idx) => {
        const hasScore = exam.hasSubmitted;
        return `
          <div class="col-md-6 col-lg-6">
            <div class="exam-card border-0 shadow-sm p-4 rounded-4 bg-white position-relative d-flex flex-column justify-content-between h-100">
              <div>
                <div class="d-flex justify-content-between align-items-start mb-3">
                  <div class="exam-icon text-primary bg-primary bg-opacity-10 rounded-3 p-3 d-inline-flex align-items-center justify-content-center" style="width:52px; height:52px; font-size:1.4rem;">
                    <i class="fa-solid fa-file-pen"></i>
                  </div>
                  <div class="d-flex align-items-center gap-1">
                    <span class="badge bg-danger rounded-pill px-3 py-1">
                      <span class="spinner-grow spinner-grow-sm me-1" style="width:0.5rem; height:0.5rem;"></span> LIVE
                    </span>
                  </div>
                </div>

                <h4 class="fw-bold text-dark mb-1">${escapeHtml(exam.title)}</h4>
                <p class="text-primary small fw-semibold mb-2"><i class="fa-solid fa-bookmark me-1"></i>${escapeHtml(exam.subject)}</p>
                <p class="text-muted small mb-3">${escapeHtml(exam.description || '')}</p>

                <div class="d-flex flex-wrap gap-2 py-2 border-top border-bottom mb-3 text-muted small">
               <span><i class="fa-regular fa-clock me-1 text-primary"></i>${exam.durationMinutes || exam.duration || 15} মিনিট</span>
                  <span class="mx-1">•</span>
                  <span><i class="fa-regular fa-circle-question me-1 text-primary"></i>${exam.questionCount}টি প্রশ্ন</span>
                  <span class="mx-1">•</span>
                  <span><i class="fa-solid fa-trophy me-1 text-warning"></i>পূর্ণমান: ${exam.totalMarks}</span>
                </div>

                ${hasScore ? `
                  <div class="alert alert-success py-2 px-3 small rounded-3 mb-3 d-flex justify-content-between align-items-center">
                    <span><i class="fa-solid fa-circle-check me-1"></i>আপনি ইতিমধ্যে অংশগ্রহণ করেছেন</span>
                    <span class="fw-bold fs-6">${exam.lastScore} / ${exam.totalMarks}</span>
                  </div>
                ` : ''}
              </div>

              <div class="d-flex flex-wrap gap-2 mt-3">
                <button class="btn btn-brand flex-grow-1 rounded-pill start-exam-btn" data-id="${exam.id}">
                  <i class="fa-solid fa-play me-1"></i> ${hasScore ? 'আবার পরীক্ষা দাও' : 'পরীক্ষা শুরু করো'}
                </button>
                <button class="btn btn-outline-primary rounded-pill view-leaderboard-btn px-3" data-id="${exam.id}" title="লিডারবোর্ড">
                  <i class="fa-solid fa-trophy me-1"></i> লিডারবোর্ড
                </button>
                ${hasScore ? `
                  <button class="btn btn-outline-success rounded-pill view-review-btn px-3" data-id="${exam.id}" title="সঠিক উত্তর ও ব্যাখ্যা">
                    <i class="fa-solid fa-square-check me-1"></i> সমাধান
                  </button>
                ` : ''}
              </div>
            </div>
          </div>
        `;
      }).join('');

      // Attach Event Listeners
      document.querySelectorAll('.start-exam-btn').forEach(b => {
        b.addEventListener('click', () => {
          const id = b.getAttribute('data-id');
          openLiveExam(id);
        });
      });

      document.querySelectorAll('.view-leaderboard-btn').forEach(b => {
        b.addEventListener('click', () => {
          const id = b.getAttribute('data-id');
          openLeaderboard(id);
        });
      });

      document.querySelectorAll('.view-review-btn').forEach(b => {
        b.addEventListener('click', () => {
          const id = b.getAttribute('data-id');
          openAnswerReview(id);
        });
      });

    } catch (err) {
      listContainer.innerHTML = `
        <div class="col-12 text-center py-4">
          <div class="alert alert-danger d-inline-block">
            <i class="fa-solid fa-triangle-exclamation me-1"></i> ${err.message}
          </div>
        </div>
      `;
    }
  }

 // 3. Start Live Exam Experience
  async function openLiveExam(examId) {
    if (!currentStudent) {
      alert('পরীক্ষায় অংশগ্রহণ করার জন্য অনুগ্রহ করে প্রথমে আপনার ইউনিক রোল দিয়ে লগইন করুন।');
      window.location.href = 'premium-login.html';
      return;
    }

    const modalEl = document.getElementById('examLiveModal');
    const bsModal = new bootstrap.Modal(modalEl, { backdrop: 'static', keyboard: false });

    const modalBody = document.getElementById('examLiveModalBody');
    modalBody.innerHTML = `
      <div class="text-center py-5">
        <div class="spinner-border text-primary" role="status"></div>
        <p class="text-muted mt-2">প্রশ্নপত্র প্রস্তুত করা হচ্ছে...</p>
      </div>
    `;
    bsModal.show();

    try {
      const rollParam = currentStudent ? `?roll=${encodeURIComponent(currentStudent.roll)}` : '';
      const res = await fetch(`/api/exams/${examId}${rollParam}`);
      const data = await res.json();

      if (!res.ok || !data.success) {
        throw new Error(data.message || 'প্রশ্ন লোড করা সম্ভব হয়নি');
      }

      // Check if student has ALREADY submitted this exam
      if (data.exam && data.exam.alreadySubmitted) {
        const prev = data.exam.previousSubmission || {};
        const scoreDisplay = prev.score !== undefined ? `${prev.score} / ${data.exam.totalMarks || 0}` : 'সম্পন্ন';
        modalBody.innerHTML = `
          <div class="text-center py-4">
            <div class="rounded-circle bg-success bg-opacity-10 text-success d-inline-flex align-items-center justify-content-center mb-3" style="width:72px; height:72px; font-size:2rem;">
              <i class="fa-solid fa-circle-check"></i>
            </div>
            <h4 class="fw-bold text-dark mb-2">আপনি ইতিমধ্যে এই পরীক্ষায় অংশগ্রহণ করেছেন!</h4>
            <p class="text-muted small max-w-md mx-auto mb-4">
              আপনার পূর্ববর্তী পরীক্ষার স্কোর: <span class="badge bg-primary fs-6 px-3 py-1">${scoreDisplay}</span><br><br>
              আপনি ইতিমধ্যে পরীক্ষাটি সম্পন্ন করেছেন। আপনার দেওয়া প্রতিটি প্রশ্নের <strong>সঠিক উত্তর ও বিস্তারিত ব্যাখ্যাসহ সমাধানপত্র</strong> দেখতে এবং <strong>PDF আকারে ডাউনলোড</strong> করতে নিচের বাটনে ক্লিক করুন।
            </p>
            <div class="d-flex flex-wrap justify-content-center gap-2">
              <button type="button" class="btn btn-success rounded-pill px-4 py-2 fw-bold" id="liveModalReviewBtn">
                <i class="fa-solid fa-file-pdf me-2"></i> সমাধানপত্র দেখুন ও PDF ডাউনলোড
              </button>
              <button type="button" class="btn btn-outline-primary rounded-pill px-4 py-2" id="liveModalLeaderboardBtn">
                <i class="fa-solid fa-trophy me-1"></i> লিডারবোর্ড
              </button>
              <button type="button" class="btn btn-light rounded-pill px-3 py-2" data-bs-dismiss="modal">বন্ধ করুন</button>
            </div>
          </div>
        `;
        document.getElementById('liveModalReviewBtn')?.addEventListener('click', () => {
          bsModal.hide();
          setTimeout(() => openAnswerReview(examId), 350);
        });
        document.getElementById('liveModalLeaderboardBtn')?.addEventListener('click', () => {
          bsModal.hide();
          setTimeout(() => openLeaderboard(examId), 350);
        });
        return;
      }

      activeExamData = data.exam;
      userAnswers = {};
      currentQuestionIndex = 0;
      totalDurationSeconds = (Number(activeExamData.durationMinutes || activeExamData.duration || 15)) * 60;
      remainingSeconds = totalDurationSeconds;

      renderExamUI();
      startCountdownTimer();

    } catch (err) {
      modalBody.innerHTML = `
        <div class="alert alert-danger my-4">
          <i class="fa-solid fa-triangle-exclamation me-1"></i> ${err.message}
        </div>
      `;
    }
  }

  // Render Question & Controls
  function renderExamUI() {
    const modalBody = document.getElementById('examLiveModalBody');
    const exam = activeExamData;
    const questions = exam.questions || [];

    if (questions.length === 0) {
      modalBody.innerHTML = '<div class="alert alert-warning">এই পরীক্ষায় কোনো প্রশ্ন নেই।</div>';
      return;
    }

    const q = questions[currentQuestionIndex];
    const totalQ = questions.length;
    const answeredCount = Object.keys(userAnswers).filter(k => userAnswers[k] !== undefined && userAnswers[k] !== -1).length;

    modalBody.innerHTML = `
      <!-- Top Exam Bar -->
      <div class="d-flex flex-wrap justify-content-between align-items-center bg-light p-3 rounded-3 mb-4 border">
        <div>
          <h5 class="fw-bold mb-0 text-dark">${escapeHtml(exam.title)}</h5>
          <div class="small text-muted">${escapeHtml(exam.subject)} • মোট প্রশ্ন: ${totalQ}টি • পূর্ণমান: ${exam.totalMarks}</div>
        </div>
        <div class="d-flex align-items-center gap-3 mt-2 mt-sm-0">
          <div id="timerBadge" class="badge bg-danger text-white rounded-pill px-3 py-2 fs-6 shadow-sm border border-white">
            <i class="fa-regular fa-clock me-1"></i>
            <span id="timerDigits">--:--</span>
          </div>
          <button type="button" class="btn btn-outline-danger btn-sm rounded-pill px-3" id="quitExamBtn">
            <i class="fa-solid fa-arrow-right-from-bracket me-1"></i> প্রস্থান
          </button>
        </div>
      </div>

      <!-- Progress Indicators -->
      <div class="d-flex justify-content-between align-items-center mb-2 small text-muted">
        <span>প্রশ্ন: <strong>${currentQuestionIndex + 1}</strong> / ${totalQ}</span>
        <span>উত্তর দেওয়া হয়েছে: <strong class="text-primary">${answeredCount}</strong>টি</span>
      </div>
      <div class="progress mb-4" style="height: 6px;">
        <div class="progress-bar bg-primary" role="progressbar" style="width: ${((currentQuestionIndex + 1) / totalQ) * 100}%;"></div>
      </div>

      <!-- Question Card -->
      <div class="card border rounded-4 p-4 shadow-sm mb-4">
        <h5 class="fw-bold text-dark lh-base mb-4">
          <span class="text-primary me-2">#${currentQuestionIndex + 1}.</span>
          ${escapeHtml(q.question)}
        </h5>

        <!-- Options list -->
        <div class="options-container d-flex flex-column gap-3">
          ${(q.options || []).map((opt, idx) => {
            const isChecked = userAnswers[q.id] === idx;
            const optLetter = ['ক', 'খ', 'গ', 'ঘ'][idx] || idx + 1;
            return `
              <label class="option-card p-3 border rounded-3 d-flex align-items-center gap-3 cursor-pointer ${isChecked ? 'border-primary bg-primary bg-opacity-10 shadow-sm fw-bold' : 'hover-bg-light'}">
                <input type="radio" name="exam_option_${q.id}" value="${idx}" class="form-check-input mt-0" ${isChecked ? 'checked' : ''} style="cursor:pointer;">
                <span class="badge ${isChecked ? 'bg-primary text-white' : 'bg-light text-dark border'} rounded-circle d-flex align-items-center justify-content-center" style="width:28px; height:28px;">
                  ${optLetter}
                </span>
                <span class="text-dark">${escapeHtml(opt)}</span>
              </label>
            `;
          }).join('')}
        </div>
      </div>

      <!-- Navigation & Action Buttons -->
      <div class="d-flex flex-wrap justify-content-between align-items-center gap-2">
        <div>
          <button type="button" class="btn btn-outline-secondary rounded-pill px-4" id="prevQBtn" ${currentQuestionIndex === 0 ? 'disabled' : ''}>
            <i class="fa-solid fa-arrow-left me-1"></i> পূর্ববর্তী
          </button>
        </div>

        <div class="d-flex gap-2">
          ${currentQuestionIndex < totalQ - 1 ? `
            <button type="button" class="btn btn-primary rounded-pill px-4" id="nextQBtn">
              পরবর্তী <i class="fa-solid fa-arrow-right ms-1"></i>
            </button>
          ` : ''}

          <button type="button" class="btn btn-success rounded-pill px-4 fw-bold shadow-sm" id="submitExamBtn">
            <i class="fa-solid fa-check-double me-1"></i> পরীক্ষা জমা দাও
          </button>
        </div>
      </div>

      <!-- Quick Question Jump Pallet -->
      <div class="mt-4 pt-3 border-top">
        <div class="small text-muted mb-2">প্রশ্ন প্যালেট:</div>
        <div class="d-flex flex-wrap gap-2">
          ${questions.map((ques, idx) => {
            const hasAns = userAnswers[ques.id] !== undefined && userAnswers[ques.id] !== -1;
            const isCurr = idx === currentQuestionIndex;
            let btnClass = 'btn-outline-secondary';
            if (hasAns) btnClass = 'btn-success text-white';
            if (isCurr) btnClass = 'btn-primary text-white border-2 border-dark';

            return `
              <button type="button" class="btn btn-sm ${btnClass} rounded-circle p-0 jump-q-btn" style="width:32px; height:32px; font-size:12px;" data-index="${idx}">
                ${idx + 1}
              </button>
            `;
          }).join('')}
        </div>
      </div>
    `;

    // Bind Radio Clicks
    const radioInputs = modalBody.querySelectorAll(`input[name="exam_option_${q.id}"]`);
    radioInputs.forEach(radio => {
      radio.addEventListener('change', (e) => {
        userAnswers[q.id] = parseInt(e.target.value, 10);
        renderExamUI();
      });
    });

    // Navigation Listeners
    document.getElementById('prevQBtn')?.addEventListener('click', () => {
      if (currentQuestionIndex > 0) {
        currentQuestionIndex--;
        renderExamUI();
      }
    });

    document.getElementById('nextQBtn')?.addEventListener('click', () => {
      if (currentQuestionIndex < totalQ - 1) {
        currentQuestionIndex++;
        renderExamUI();
      }
    });

    document.getElementById('submitExamBtn')?.addEventListener('click', () => {
      confirmAndSubmit();
    });

    document.getElementById('quitExamBtn')?.addEventListener('click', () => {
      if (confirm('আপনি কি নিশ্চিত যে পরীক্ষা থেকে প্রস্থান করতে চান? আপনার প্রদত্ত উত্তর হারিয়ে যেতে পারে।')) {
        clearInterval(timerInterval);
        const modalEl = document.getElementById('examLiveModal');
        const bsModal = bootstrap.Modal.getInstance(modalEl);
        if (bsModal) bsModal.hide();
      }
    });

    // Jump buttons
    document.querySelectorAll('.jump-q-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        const targetIdx = parseInt(btn.getAttribute('data-index'), 10);
        if (!isNaN(targetIdx)) {
          currentQuestionIndex = targetIdx;
          renderExamUI();
        }
      });
    });
  }

  // Countdown Timer
  function startCountdownTimer() {
    clearInterval(timerInterval);

    const updateDisplay = () => {
      const timerDigits = document.getElementById('timerDigits');
      const timerBadge = document.getElementById('timerBadge');
      if (!timerDigits) return;

      const m = Math.floor(remainingSeconds / 60);
      const s = remainingSeconds % 60;
      timerDigits.textContent = `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;

      if (remainingSeconds <= 120) {
        timerBadge.className = 'badge bg-danger text-white rounded-pill px-3 py-2 fs-6 shadow-sm border border-white animate__animated animate__pulse animate__infinite';
      } else {
        timerBadge.className = 'badge bg-danger text-white rounded-pill px-3 py-2 fs-6 shadow-sm border border-white';
      }

      if (remainingSeconds <= 0) {
        clearInterval(timerInterval);
        alert('⏰ পরীক্ষার সময় শেষ হয়েছে! আপনার উত্তরপত্র স্বয়ংক্রিয়ভাবে জমা নেওয়া হচ্ছে।');
        performSubmission();
      }
      remainingSeconds--;
    };

    updateDisplay();
    timerInterval = setInterval(updateDisplay, 1000);
  }

  // Confirm and Submit
  function confirmAndSubmit() {
    const totalQ = (activeExamData.questions || []).length;
    const answeredCount = Object.keys(userAnswers).filter(k => userAnswers[k] !== undefined && userAnswers[k] !== -1).length;
    const unansweredCount = totalQ - answeredCount;

    let confirmMsg = `আপনি ${totalQ}টি প্রশ্নের মধ্যে ${answeredCount}টি প্রশ্নের উত্তর দিয়েছেন।`;
    if (unansweredCount > 0) {
      confirmMsg += `\n⚠️ সতর্কতা: ${unansweredCount}টি প্রশ্নের উত্তর দেওয়া বাকি আছে।`;
    }
    confirmMsg += '\n\nআপনি কি নিশ্চিত যে উত্তরপত্র জমা দিতে চান?';

    if (confirm(confirmMsg)) {
      performSubmission();
    }
  }

  // Submit Call to Backend
  async function performSubmission() {
    clearInterval(timerInterval);

    const modalBody = document.getElementById('examLiveModalBody');
    modalBody.innerHTML = `
      <div class="text-center py-5">
        <div class="spinner-border text-success" role="status"></div>
        <h5 class="fw-bold mt-3">উত্তরপত্র জমা হচ্ছে...</h5>
        <p class="text-muted">আপনার ফলাফল এবং র‍্যাংক গণনা করা হচ্ছে।</p>
      </div>
    `;

    const timeSpent = totalDurationSeconds - Math.max(0, remainingSeconds);

    try {
      const res = await fetch(`/api/exams/${activeExamData.id}/submit`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          roll: currentStudent.roll,
          name: currentStudent.name,
          studentName: currentStudent.name,
          group: currentStudent.group,
          answers: userAnswers,
          timeTakenSeconds: timeSpent,
          timeSpent: timeSpent
        })
      });

      const data = await res.json();

      if (!res.ok || !data.success) {
        if (data.alreadySubmitted) {
          modalBody.innerHTML = `
            <div class="text-center py-4">
              <div class="rounded-circle bg-warning bg-opacity-10 text-warning d-inline-flex align-items-center justify-content-center mb-3" style="width:72px; height:72px; font-size:2rem;">
                <i class="fa-solid fa-circle-check"></i>
              </div>
              <h4 class="fw-bold text-dark mb-2">আপনি ইতিমধ্যে এই পরীক্ষায় অংশগ্রহণ করেছেন!</h4>
              <p class="text-muted small max-w-md mx-auto mb-4">
                আপনার পূর্ববর্তী পরীক্ষাটি সংরক্ষিত রয়েছে। আপনার উত্তরপত্র, সঠিক উত্তর ও বিস্তারিত সমাধান দেখতে এবং PDF ডাউনলোড করতে নিচের বাটনে ক্লিক করুন।
              </p>
              <div class="d-flex flex-wrap justify-content-center gap-2">
                <button type="button" class="btn btn-success rounded-pill px-4 py-2 fw-bold" id="submitAlreadyReviewBtn">
                  <i class="fa-solid fa-file-pdf me-2"></i> সমাধানপত্র দেখুন ও PDF ডাউনলোড
                </button>
                <button type="button" class="btn btn-light rounded-pill px-3 py-2" data-bs-dismiss="modal">বন্ধ করুন</button>
              </div>
            </div>
          `;
          document.getElementById('submitAlreadyReviewBtn')?.addEventListener('click', () => {
            const bsModal = bootstrap.Modal.getInstance(document.getElementById('examLiveModal'));
            if (bsModal) bsModal.hide();
            setTimeout(() => openAnswerReview(activeExamData.id), 350);
          });
          return;
        }
        throw new Error(data.message || 'সাবমিট ব্যর্থ হয়েছে');
      }

      renderSubmissionResult(data.result);
      loadGroupExams(); // Refresh exam cards

    } catch (err) {
      modalBody.innerHTML = `
        <div class="alert alert-danger my-4">
          <i class="fa-solid fa-triangle-exclamation me-1"></i> ${err.message}
        </div>
      `;
    }
  }

  // Render Exam Result
  function renderSubmissionResult(result) {
    const modalBody = document.getElementById('examLiveModalBody');
    const percentage = Math.round((result.score / result.totalMarks) * 100);

    const min = Math.floor(result.timeTakenSeconds / 60);
    const sec = result.timeTakenSeconds % 60;

    modalBody.innerHTML = `
      <div class="text-center py-4">
        <div class="mb-3">
          <div class="rounded-circle d-inline-flex align-items-center justify-content-center ${result.isPassed ? 'bg-success bg-opacity-10 text-success' : 'bg-warning bg-opacity-10 text-warning'}" style="width:76px; height:76px; font-size:2.2rem;">
            <i class="fa-solid ${result.isPassed ? 'fa-award' : 'fa-graduation-cap'}"></i>
          </div>
        </div>

        <h3 class="fw-bold text-dark mb-1">${result.isPassed ? 'অভিনন্দন! পরীক্ষা সম্পন্ন হয়েছে' : 'পরীক্ষা সম্পন্ন হয়েছে'}</h3>
        <p class="text-muted mb-4">${result.isPassed ? 'আপনি সাফল্যের সাথে পরীক্ষায় উত্তীর্ণ হয়েছেন।' : 'পরবর্তী পরীক্ষার জন্য আরো ভালো প্রস্তুতি নিন।'}</p>

        <!-- Score summary cards -->
        <div class="row g-3 max-w-lg mx-auto mb-4">
          <div class="col-4">
            <div class="p-3 bg-light rounded-4 border">
              <div class="text-muted small mb-1">প্রাপ্ত নম্বর</div>
              <div class="fs-4 fw-bold text-primary">${result.score} <span class="fs-6 text-muted">/ ${result.totalMarks}</span></div>
            </div>
          </div>
          <div class="col-4">
            <div class="p-3 bg-light rounded-4 border">
              <div class="text-muted small mb-1">সঠিক উত্তর</div>
              <div class="fs-4 fw-bold text-success">${result.correctCount}টি</div>
            </div>
          </div>
          <div class="col-4">
            <div class="p-3 bg-light rounded-4 border">
              <div class="text-muted small mb-1">ভুল উত্তর</div>
              <div class="fs-4 fw-bold text-danger">${result.wrongCount}টি</div>
            </div>
          </div>
        </div>

        <div class="d-flex flex-wrap justify-content-center gap-3 text-muted small mb-4">
          <span><i class="fa-regular fa-clock me-1"></i> ব্যয়িত সময়: <strong>${min} মিনিট ${sec} সেকেন্ড</strong></span>
          <span><i class="fa-solid fa-chart-pie me-1"></i> শতকরা হার: <strong>${percentage}%</strong></span>
          <span><i class="fa-solid fa-circle-minus me-1"></i> অনুত্তরিত: <strong>${result.skippedCount || 0}টি</strong></span>
        </div>

        <!-- Action buttons -->
        <div class="d-flex flex-wrap justify-content-center gap-3">
          <button type="button" class="btn btn-success rounded-pill px-4 py-2" id="resultViewReviewBtn">
            <i class="fa-solid fa-file-pdf me-2"></i> সমাধানপত্র দেখুন ও PDF ডাউনলোড
          </button>
          <button type="button" class="btn btn-primary rounded-pill px-4 py-2" id="resultViewLeaderboardBtn">
            <i class="fa-solid fa-trophy me-2"></i> লিডারবোর্ড দেখুন
          </button>
          <button type="button" class="btn btn-outline-secondary rounded-pill px-4 py-2" data-bs-dismiss="modal">
            বন্ধ করুন
          </button>
        </div>
      </div>
    `;

    document.getElementById('resultViewReviewBtn')?.addEventListener('click', () => {
      const modalEl = document.getElementById('examLiveModal');
      const bsModal = bootstrap.Modal.getInstance(modalEl);
      if (bsModal) bsModal.hide();
      setTimeout(() => openAnswerReview(activeExamData.id), 350);
    });

    document.getElementById('resultViewLeaderboardBtn')?.addEventListener('click', () => {
      const modalEl = document.getElementById('examLiveModal');
      const bsModal = bootstrap.Modal.getInstance(modalEl);
      if (bsModal) bsModal.hide();
      setTimeout(() => openLeaderboard(activeExamData.id), 350);
    });
  }

  // 4. Open Leaderboard Modal
  async function openLeaderboard(examId) {
    const modalEl = document.getElementById('leaderboardModal');
    const bsModal = new bootstrap.Modal(modalEl);
    const body = document.getElementById('leaderboardModalBody');

    body.innerHTML = `
      <div class="text-center py-5">
        <div class="spinner-border text-primary" role="status"></div>
        <p class="text-muted mt-2">লিডারবোর্ড তথ্য লোড হচ্ছে...</p>
      </div>
    `;
    bsModal.show();

    try {
      const rollParam = currentStudent ? `?currentRoll=${encodeURIComponent(currentStudent.roll)}` : '';
      const res = await fetch(`/api/exams/${examId}/leaderboard${rollParam}`);
      const data = await res.json();

      if (!res.ok || !data.success) {
        throw new Error(data.message || 'লিডারবোর্ড লোড করা যায়নি');
      }

      const list = data.leaderboard || [];
      const totalParticipants = data.totalParticipants ?? data.count ?? list.length;
      const examTitle = data.examTitle || 'মডেল টেস্ট লিডারবোর্ড';

      body.innerHTML = `
        <div class="mb-4 text-center">
          <h4 class="fw-bold text-dark mb-1"><i class="fa-solid fa-trophy text-warning me-2"></i>${escapeHtml(examTitle)}</h4>
          <p class="text-muted small mb-0">মোট অংশগ্রহণকারী: <strong>${totalParticipants}</strong> জন শিক্ষার্থী</p>
        </div>

        ${list.length === 0 ? `
          <div class="alert alert-info text-center">এখনো কেউ এই পরীক্ষায় অংশগ্রহণ করেনি। প্রথম স্থান অর্জন করতে এখনই পরীক্ষা দাও!</div>
        ` : `
          <div class="table-responsive">
            <table class="table table-hover align-middle">
              <thead class="table-light">
                <tr>
                  <th scope="col" style="width: 70px;">র‍্যাংক</th>
                  <th scope="col">শিক্ষার্থীর নাম</th>
                  <th scope="col">রোল</th>
                  <th scope="col">গ্রুপ</th>
                  <th scope="col" class="text-center">নম্বর</th>
                  <th scope="col" class="text-center">সময়</th>
                </tr>
              </thead>
              <tbody>
                ${list.map(s => {
                  let rankBadge = `<span class="badge bg-light text-dark border rounded-pill px-2 py-1">#${s.rank}</span>`;
                  if (s.rank === 1) rankBadge = `<span class="badge bg-warning text-dark rounded-pill px-2 py-1"><i class="fa-solid fa-crown me-1"></i>১ম</span>`;
                  if (s.rank === 2) rankBadge = `<span class="badge bg-secondary text-white rounded-pill px-2 py-1">২য়</span>`;
                  if (s.rank === 3) rankBadge = `<span class="badge bg-bronze text-white rounded-pill px-2 py-1" style="background:#cd7f32;">৩য়</span>`;

                  const timeSec = Number(s.timeTakenSeconds !== undefined ? s.timeTakenSeconds : (s.timeSpent !== undefined ? s.timeSpent : 0)) || 0;
                  const min = Math.floor(timeSec / 60);
                  const sec = timeSec % 60;

                  const isCurrent = currentStudent ? String(s.roll).trim() === String(currentStudent.roll).trim() : false;
                  const displayName = (isCurrent && currentStudent.name) ? currentStudent.name : (s.name && s.name !== s.roll ? s.name : `শিক্ষার্থী (${s.roll})`);
                  const displayGroup = s.group || (isCurrent ? currentStudent.group : currentGroup);

                  return `
                    <tr class="${isCurrent ? 'table-primary fw-bold' : ''}">
                      <td>${rankBadge}</td>
                      <td>
                        <div class="d-flex align-items-center gap-2">
                          <span>${escapeHtml(displayName)}</span>
                          ${isCurrent ? '<span class="badge bg-primary text-white rounded-pill px-2 py-0 small">তুমি</span>' : ''}
                        </div>
                      </td>
                      <td><code>${escapeHtml(s.roll)}</code></td>
                      <td><span class="text-uppercase small text-muted">${escapeHtml(displayGroup)}</span></td>
                      <td class="text-center"><span class="fw-bold text-primary">${s.score}</span> <span class="small text-muted">/ ${s.totalMarks || 0}</span></td>
                      <td class="text-center small text-muted">${min}m ${sec}s</td>
                    </tr>
                  `;
                }).join('')}
              </tbody>
            </table>
          </div>
        `}
      `;

    } catch (err) {
      body.innerHTML = `
        <div class="alert alert-danger my-3">
          <i class="fa-solid fa-triangle-exclamation me-1"></i> ${err.message}
        </div>
      `;
    }
  }

  // 5. Open Detailed Answer Review Modal
  async function openAnswerReview(examId) {
    if (!currentStudent) {
      alert('সঠিক উত্তর ও ব্যাখ্যা দেখতে অনুগ্রহ করে লগইন করুন।');
      window.location.href = 'premium-login.html';
      return;
    }

    const modalEl = document.getElementById('reviewModal');
    const bsModal = new bootstrap.Modal(modalEl);
    const body = document.getElementById('reviewModalBody');

    body.innerHTML = `
      <div class="text-center py-5">
        <div class="spinner-border text-success" role="status"></div>
        <p class="text-muted mt-2">সঠিক উত্তর ও ব্যাখ্যা লোড হচ্ছে...</p>
      </div>
    `;
    bsModal.show();

    try {
      const res = await fetch(`/api/exams/${examId}/review?roll=${encodeURIComponent(currentStudent.roll)}`);
      const data = await res.json();

      if (!res.ok || !data.success) {
        body.innerHTML = `
          <div class="text-center py-4">
            <div class="rounded-circle bg-warning bg-opacity-10 text-warning d-inline-flex align-items-center justify-content-center mb-3" style="width:64px; height:64px; font-size:1.8rem;">
              <i class="fa-solid fa-file-circle-exclamation"></i>
            </div>
            <h5 class="fw-bold text-dark">উত্তরপত্র এখনো পাওয়া যায়নি</h5>
            <p class="text-muted small max-w-md mx-auto mb-4">
              আপনি সম্ভবত এখনো এই পরীক্ষাটিতে অংশগ্রহণ করেননি। অনুগ্রহ করে প্রথমে <strong>"পরীক্ষা শুরু করো"</strong> বাটনে ক্লিক করে পরীক্ষাটি সম্পন্ন করুন। পরীক্ষা জমা দেওয়ার সাথে সাথে এখানে প্রতিটি প্রশ্নের সঠিক উত্তর ও বিস্তারিত সমাধান দেখতে পাবেন।
            </p>
            <button type="button" class="btn btn-primary rounded-pill px-4" data-bs-dismiss="modal">বুঝেছি</button>
          </div>
        `;
        return;
      }

      let examTitle = data.examTitle;
      let studentName = data.student?.name;
      let studentRoll = data.student?.roll;
      let summary = data.summary;
      let questions = data.questions;

      if (!summary && data.submission) {
        const sub = data.submission;
        examTitle = examTitle || sub.examTitle;
        studentRoll = studentRoll || sub.roll;
        studentName = studentName || (currentStudent && String(currentStudent.roll).trim() === String(sub.roll).trim() ? currentStudent.name : (sub.name && sub.name !== sub.roll ? sub.name : currentStudent?.name || sub.roll));
        summary = {
          score: sub.score,
          totalMarks: sub.totalMarks,
          correctCount: sub.correctCount,
          wrongCount: sub.wrongCount,
          skippedCount: sub.skippedCount,
          timeTakenSeconds: sub.timeSpent || sub.timeTakenSeconds || 0
        };
        questions = (sub.detailedResults || []).map(r => ({
          id: r.questionId,
          question: r.question,
          options: r.options,
          chosenIndex: r.studentAnswer,
          correctIndex: r.correctAnswer,
          isCorrect: r.isCorrect,
          isSkipped: r.isSkipped,
          explanation: r.explanation || 'কোনো ব্যাখ্যা দেওয়া নেই।'
        }));
      }

      summary = summary || { score: 0, totalMarks: 0, correctCount: 0, wrongCount: 0, skippedCount: 0 };
      questions = questions || [];
      studentName = studentName || currentStudent.name;
      studentRoll = studentRoll || currentStudent.roll;

      body.innerHTML = `
        <!-- Summary Header -->
        <div class="bg-light border rounded-4 p-3 mb-4">
          <div class="d-flex flex-wrap justify-content-between align-items-center gap-2">
            <div>
              <h5 class="fw-bold mb-0 text-dark">${escapeHtml(examTitle || 'পরীক্ষার ফলাফল')}</h5>
              <div class="small text-muted">শিক্ষার্থী: ${escapeHtml(studentName)} (রোল: ${escapeHtml(studentRoll)})</div>
            </div>
            <div class="d-flex align-items-center gap-2">
              <button type="button" class="btn btn-outline-danger btn-sm rounded-pill px-3 py-1 fw-bold shadow-sm d-flex align-items-center gap-1" id="downloadReviewPdfBtn" title="সমাধানপত্র PDF আকারে ডাউনলোড বা প্রিন্ট করুন">
                <i class="fa-solid fa-file-pdf text-danger"></i> PDF ডাউনলোড করুন
              </button>
              <span class="badge bg-primary fs-6 rounded-pill px-3 py-2">নম্বর: ${summary.score} / ${summary.totalMarks}</span>
            </div>
          </div>
          <div class="d-flex flex-wrap gap-3 mt-2 pt-2 border-top small text-muted">
            <span class="text-success"><i class="fa-solid fa-circle-check me-1"></i>সঠিক: ${summary.correctCount}</span>
            <span class="text-danger"><i class="fa-solid fa-circle-xmark me-1"></i>ভুল: ${summary.wrongCount}</span>
            <span class="text-secondary"><i class="fa-solid fa-circle-minus me-1"></i>অনুত্তরিত: ${summary.skippedCount}</span>
          </div>
        </div>

        <h5 class="fw-bold mb-3">প্রশ্নোত্তর ও বিস্তারিত ব্যাখ্যা:</h5>

        <!-- Question review cards -->
        <div class="d-flex flex-column gap-4">
          ${questions.map((q, idx) => {
            const optLetters = ['ক', 'খ', 'গ', 'ঘ'];
            let statusBadge = '<span class="badge bg-success rounded-pill px-3 py-1"><i class="fa-solid fa-check me-1"></i>সঠিক</span>';
            if (q.isSkipped) {
              statusBadge = '<span class="badge bg-secondary rounded-pill px-3 py-1"><i class="fa-solid fa-minus me-1"></i>অনুত্তরিত</span>';
            } else if (!q.isCorrect) {
              statusBadge = '<span class="badge bg-danger rounded-pill px-3 py-1"><i class="fa-solid fa-xmark me-1"></i>ভুল</span>';
            }

            return `
              <div class="card border rounded-4 shadow-sm p-4 ${q.isCorrect ? 'border-success border-opacity-50' : q.isSkipped ? 'border-secondary border-opacity-25' : 'border-danger border-opacity-50'}">
                <div class="d-flex justify-content-between align-items-center mb-2">
                  <span class="fw-bold text-muted small">প্রশ্ন ${idx + 1}</span>
                  ${statusBadge}
                </div>

                <h6 class="fw-bold text-dark mb-3 lh-base">${escapeHtml(q.question)}</h6>

                <div class="options-review d-flex flex-column gap-2 mb-3">
                  ${q.options.map((opt, optIdx) => {
                    const isChosen = q.chosenIndex === optIdx;
                    const isCorrectOpt = q.correctIndex === optIdx;

                    let optCls = 'bg-light border text-dark';
                    let icon = '';

                    if (isCorrectOpt) {
                      optCls = 'bg-success bg-opacity-10 border-success text-success fw-bold';
                      icon = '<i class="fa-solid fa-circle-check text-success ms-auto"></i>';
                    }
                    if (isChosen && !isCorrectOpt) {
                      optCls = 'bg-danger bg-opacity-10 border-danger text-danger fw-bold';
                      icon = '<i class="fa-solid fa-circle-xmark text-danger ms-auto"></i>';
                    }

                    return `
                      <div class="p-2 px-3 rounded-3 d-flex align-items-center gap-2 ${optCls}">
                        <span class="badge bg-white text-dark border rounded-circle d-flex align-items-center justify-content-center" style="width:24px; height:24px; font-size:0.75rem;">
                          ${optLetters[optIdx] || optIdx + 1}
                        </span>
                        <span>${escapeHtml(opt)}</span>
                        ${isChosen ? '<span class="badge bg-secondary rounded-pill ms-2 px-2 py-1 small" style="font-size:0.7rem;">তোমার উত্তর</span>' : ''}
                        ${icon}
                      </div>
                    `;
                  }).join('')}
                </div>

                <!-- Explanation Box -->
                <div class="bg-primary bg-opacity-10 p-3 rounded-3 border border-primary border-opacity-25">
                  <div class="d-flex align-items-center gap-1 text-primary fw-bold small mb-1">
                    <i class="fa-solid fa-lightbulb"></i> ব্যাখ্যা (Explanation):
                  </div>
                  <div class="text-dark small lh-base">${escapeHtml(q.explanation)}</div>
                </div>
              </div>
            `;
          }).join('')}
        </div>
      `;

      // Attach PDF Download Event Listener
      document.getElementById('downloadReviewPdfBtn')?.addEventListener('click', () => {
        downloadSolveSheetPdf(examTitle, studentName, studentRoll, summary, questions);
      });

    } catch (err) {
      body.innerHTML = `
        <div class="alert alert-danger my-3">
          <i class="fa-solid fa-triangle-exclamation me-1"></i> ${err.message}
        </div>
      `;
    }
  }

  // 6. Generate & Print / Download Solve Sheet PDF
  function downloadSolveSheetPdf(examTitle, studentName, studentRoll, summary, questions) {
    const optLetters = ['ক', 'খ', 'গ', 'ঘ'];
    const totalQ = questions.length;
    const percentage = summary.totalMarks ? Math.round((summary.score / summary.totalMarks) * 100) : 0;
    const printDate = new Date().toLocaleDateString('bn-BD', { year: 'numeric', month: 'long', day: 'numeric' });

    const printHtml = `
      <!DOCTYPE html>
      <html lang="bn">
      <head>
        <meta charset="UTF-8">
        <title>${escapeHtml(examTitle)} - সমাধানপত্র (${studentRoll})</title>
        <link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/bootstrap@5.3.3/dist/css/bootstrap.min.css">
        <style>
          @page {
            size: A4;
            margin: 12mm 12mm 15mm 12mm;
          }
          body {
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Noto Sans Bengali', Kalpurush, SolaimanLipi, sans-serif;
            color: #111;
            background: #fff;
            padding: 12px;
            font-size: 13.5px;
            line-height: 1.5;
          }
          .header-box {
            border-bottom: 2px solid #0d6efd;
            padding-bottom: 10px;
            margin-bottom: 14px;
          }
          .summary-card {
            background-color: #f8f9fa;
            border: 1px solid #dee2e6;
            border-radius: 8px;
            padding: 10px 14px;
            margin-bottom: 16px;
          }
          .q-card {
            border: 1px solid #dee2e6;
            border-radius: 8px;
            padding: 12px 14px;
            margin-bottom: 12px;
            page-break-inside: avoid;
            background: #fff;
          }
          .q-card.is-correct { border-left: 5px solid #198754; }
          .q-card.is-wrong { border-left: 5px solid #dc3545; }
          .q-card.is-skipped { border-left: 5px solid #6c757d; }
          .opt-row {
            padding: 5px 10px;
            margin-bottom: 4px;
            border-radius: 6px;
            border: 1px solid #e9ecef;
            display: flex;
            align-items: center;
            justify-content: space-between;
          }
          .opt-row.is-correct-opt {
            background-color: #d1e7dd !important;
            border-color: #badbcc !important;
            color: #0f5132 !important;
            font-weight: bold;
          }
          .opt-row.is-wrong-opt {
            background-color: #f8d7da !important;
            border-color: #f5c2c7 !important;
            color: #842029 !important;
            font-weight: bold;
          }
          .exp-box {
            background-color: #f0f7ff;
            border: 1px solid #b6d4fe;
            border-radius: 6px;
            padding: 8px 12px;
            margin-top: 8px;
            font-size: 12.5px;
          }
          @media print {
            .no-print { display: none !important; }
            body { padding: 0; }
          }
        </style>
      </head>
      <body>
        <div class="header-box d-flex justify-content-between align-items-center">
          <div>
            <h2 class="fw-bold text-primary mb-0" style="font-size: 1.6rem;">NU Crackers</h2>
            <h5 class="fw-bold text-dark mb-0">${escapeHtml(examTitle)} — সম্পূর্ণ সমাধানপত্র</h5>
            <div class="text-muted small">তারিখ: ${printDate}</div>
          </div>
          <div class="text-end">
            <div class="fw-bold text-dark" style="font-size: 1.1rem;">${escapeHtml(studentName)}</div>
            <div class="text-muted small">রোল: <strong>${escapeHtml(studentRoll)}</strong></div>
            <div class="mt-1">
              <span class="badge bg-primary fs-6 px-3 py-1">নম্বর: ${summary.score} / ${summary.totalMarks} (${percentage}%)</span>
            </div>
          </div>
        </div>

        <div class="summary-card d-flex flex-wrap justify-content-around text-center">
          <div><strong>মোট প্রশ্ন:</strong> ${totalQ}টি</div>
          <div class="text-success"><strong>সঠিক উত্তর:</strong> ${summary.correctCount}টি</div>
          <div class="text-danger"><strong>ভুল উত্তর:</strong> ${summary.wrongCount}টি</div>
          <div class="text-secondary"><strong>অনুত্তরিত:</strong> ${summary.skippedCount}টি</div>
          <div><strong>অর্জিত শতাংশ:</strong> ${percentage}%</div>
        </div>

        <div class="questions-list">
          ${questions.map((q, idx) => {
            let statusText = '<span class="badge bg-success">সঠিক</span>';
            let cardStatus = 'is-correct';
            if (q.isSkipped) {
              statusText = '<span class="badge bg-secondary">অনুত্তরিত</span>';
              cardStatus = 'is-skipped';
            } else if (!q.isCorrect) {
              statusText = '<span class="badge bg-danger">ভুল</span>';
              cardStatus = 'is-wrong';
            }

            return `
              <div class="q-card ${cardStatus}">
                <div class="d-flex justify-content-between align-items-center mb-1">
                  <span class="fw-bold text-muted" style="font-size: 12px;">প্রশ্ন ${idx + 1}</span>
                  ${statusText}
                </div>
                <h6 class="fw-bold text-dark mb-2">${escapeHtml(q.question)}</h6>
                <div class="options-container">
                  ${q.options.map((opt, optIdx) => {
                    const isChosen = q.chosenIndex === optIdx;
                    const isCorrectOpt = q.correctIndex === optIdx;
                    let cls = 'opt-row';
                    if (isCorrectOpt) cls += ' is-correct-opt';
                    if (isChosen && !isCorrectOpt) cls += ' is-wrong-opt';

                    return `
                      <div class="${cls}">
                        <div>
                          <strong>(${optLetters[optIdx] || optIdx + 1})</strong> ${escapeHtml(opt)}
                          ${isChosen ? '<span class="badge bg-dark ms-2" style="font-size:10px;">তোমার উত্তর</span>' : ''}
                        </div>
                        ${isCorrectOpt ? '<span class="text-success fw-bold" style="font-size:11px;">✓ সঠিক উত্তর</span>' : ''}
                      </div>
                    `;
                  }).join('')}
                </div>
                ${q.explanation ? `
                  <div class="exp-box">
                    <strong>💡 সমাধান ও ব্যাখ্যা:</strong> ${escapeHtml(q.explanation)}
                  </div>
                ` : ''}
              </div>
            `;
          }).join('')}
        </div>
      </body>
      </html>
    `;

    // Trigger printing via hidden iframe so browser Save as PDF works cleanly
    const iframe = document.createElement('iframe');
    iframe.style.position = 'fixed';
    iframe.style.right = '0';
    iframe.style.bottom = '0';
    iframe.style.width = '0';
    iframe.style.height = '0';
    iframe.style.border = '0';
    document.body.appendChild(iframe);

    try {
      const doc = iframe.contentWindow.document;
      doc.open();
      doc.write(printHtml);
      doc.close();

      iframe.contentWindow.focus();
      setTimeout(() => {
        try {
          iframe.contentWindow.print();
        } catch (printErr) {
          const printWindow = window.open('', '_blank');
          if (printWindow) {
            printWindow.document.write(printHtml);
            printWindow.document.close();
            printWindow.focus();
            printWindow.print();
          }
        }
        setTimeout(() => {
          if (document.body.contains(iframe)) {
            document.body.removeChild(iframe);
          }
        }, 3000);
      }, 500);
    } catch (e) {
      alert('PDF প্রিন্ট করতে সমস্যা হয়েছে। অনুগ্রহ করে ব্রাউজার সেটিংস চেক করুন।');
    }
  }

  function escapeHtml(str) {
    if (!str) return '';
    return String(str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
  }
});
