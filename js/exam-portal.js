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
                  <span><i class="fa-regular fa-clock me-1 text-primary"></i>${exam.durationMinutes} মিনিট</span>
                  <span class="mx-1">•</span>
                  <span><i class="fa-regular fa-circle-question me-1 text-primary"></i>${exam.questionCount}টি প্রশ্ন</span>
                  <span class="mx-1">•</span>
                  <span><i class="fa-solid fa-trophy me-1 text-warning"></i>পূর্ণমান: ${exam.totalMarks}</span>
                  ${exam.negativeMark ? `<span class="mx-1">•</span><span class="text-danger"><i class="fa-solid fa-minus me-1"></i>নেগেটিভ: ${exam.negativeMark}</span>` : ''}
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
      const res = await fetch(`/api/exams/${examId}`);
      const data = await res.json();

      if (!res.ok || !data.success) {
        throw new Error(data.message || 'প্রশ্ন লোড করা সম্ভব হয়নি');
      }

      activeExamData = data.exam;
      userAnswers = {};
      currentQuestionIndex = 0;
      totalDurationSeconds = (activeExamData.durationMinutes || 15) * 60;
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
          <div class="text-end">
            <span class="badge bg-dark rounded-pill px-3 py-2 fs-6" id="timerBadge">
              <i class="fa-regular fa-clock me-1 text-warning"></i> <span id="timerDigits">--:--</span>
            </span>
          </div>
          <button class="btn btn-outline-danger btn-sm rounded-pill" id="quitExamBtn" title="বাতিল করুন">
            <i class="fa-solid fa-xmark"></i>
          </button>
        </div>
      </div>

      <!-- Question Number Navigator -->
      <div class="mb-4">
        <div class="d-flex justify-content-between align-items-center mb-2">
          <span class="small fw-semibold text-muted">প্রশ্ন তালিকা (${answeredCount}/${totalQ} উত্তর সম্পন্ন)</span>
          <span class="badge bg-primary bg-opacity-10 text-primary small">প্রশ্ন ${currentQuestionIndex + 1} / ${totalQ}</span>
        </div>
        <div class="d-flex flex-wrap gap-2" id="questionNavPills">
          ${questions.map((item, idx) => {
            const isAnswered = userAnswers[item.id] !== undefined && userAnswers[item.id] !== -1;
            const isCurrent = idx === currentQuestionIndex;
            let cls = 'btn-outline-secondary';
            if (isAnswered) cls = 'btn-success text-white';
            if (isCurrent) cls = 'btn-primary text-white shadow-sm';
            return `
              <button type="button" class="btn btn-sm ${cls} rounded-circle px-0 q-nav-pill" style="width:34px; height:34px; font-size:0.85rem;" data-idx="${idx}">
                ${idx + 1}
              </button>
            `;
          }).join('')}
        </div>
      </div>

      <!-- Current Question Card -->
      <div class="card border-0 shadow-sm rounded-4 p-4 mb-4 bg-white border">
        <div class="d-flex justify-content-between align-items-start mb-3">
          <span class="badge bg-primary text-white rounded-pill px-3 py-1">প্রশ্ন ${currentQuestionIndex + 1}</span>
          <button type="button" class="btn btn-link text-muted p-0 small text-decoration-none" id="clearChoiceBtn">
            <i class="fa-solid fa-rotate-left me-1"></i> নির্বাচন বাতিল
          </button>
        </div>

        <h5 class="fw-semibold text-dark mb-4 lh-base">${escapeHtml(q.question)}</h5>

        <div class="options-container d-flex flex-column gap-2 mb-2">
          ${q.options.map((opt, optIdx) => {
            const isSelected = userAnswers[q.id] === optIdx;
            const optLetter = ['ক', 'খ', 'গ', 'ঘ'][optIdx] || String.fromCharCode(65 + optIdx);
            return `
              <label class="option-label p-3 rounded-3 border d-flex align-items-center gap-3 cursor-pointer ${isSelected ? 'bg-primary bg-opacity-10 border-primary fw-semibold' : 'bg-light bg-opacity-50'}" style="cursor: pointer; transition: all 0.2s ease;">
                <input type="radio" name="opt_${q.id}" value="${optIdx}" class="form-check-input mt-0" ${isSelected ? 'checked' : ''} style="cursor: pointer;">
                <span class="badge bg-white text-dark border rounded-circle d-flex align-items-center justify-content-center" style="width:28px; height:28px;">${optLetter}</span>
                <span class="text-dark flex-grow-1">${escapeHtml(opt)}</span>
              </label>
            `;
          }).join('')}
        </div>
      </div>

      <!-- Bottom Actions -->
      <div class="d-flex justify-content-between align-items-center gap-2">
        <button type="button" class="btn btn-outline-secondary rounded-pill px-4" id="prevQBtn" ${currentQuestionIndex === 0 ? 'disabled' : ''}>
          <i class="fa-solid fa-chevron-left me-1"></i> পূর্ববর্তী
        </button>

        <div class="d-flex gap-2">
          ${currentQuestionIndex < totalQ - 1 ? `
            <button type="button" class="btn btn-primary rounded-pill px-4" id="nextQBtn">
              পরবর্তী <i class="fa-solid fa-chevron-right ms-1"></i>
            </button>
          ` : ''}

          <button type="button" class="btn btn-success rounded-pill px-4 fw-bold" id="submitExamBtn">
            <i class="fa-solid fa-paper-plane me-1"></i> পরীক্ষা জমা দাও
          </button>
        </div>
      </div>
    `;

    // Hook events
    document.querySelectorAll('.q-nav-pill').forEach(pill => {
      pill.addEventListener('click', () => {
        currentQuestionIndex = parseInt(pill.getAttribute('data-idx'));
        renderExamUI();
      });
    });

    document.querySelectorAll(`input[name="opt_${q.id}"]`).forEach(input => {
      input.addEventListener('change', () => {
        userAnswers[q.id] = parseInt(input.value);
        renderExamUI();
      });
    });

    document.getElementById('clearChoiceBtn')?.addEventListener('click', () => {
      delete userAnswers[q.id];
      renderExamUI();
    });

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

    document.getElementById('quitExamBtn')?.addEventListener('click', () => {
      if (confirm('আপনি কি সত্যিই পরীক্ষা ত্যাগ করতে চান? আপনার উত্তর সংরক্ষিত হবে না।')) {
        clearInterval(timerInterval);
        const modalEl = document.getElementById('examLiveModal');
        const modalInstance = bootstrap.Modal.getInstance(modalEl);
        modalInstance.hide();
      }
    });

    document.getElementById('submitExamBtn')?.addEventListener('click', () => {
      confirmAndSubmit();
    });
  }

  // Timer
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
        timerBadge.className = 'badge bg-danger rounded-pill px-3 py-2 fs-6 animate__animated animate__pulse animate__infinite';
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
          answers: userAnswers,
          timeTakenSeconds: timeSpent
        })
      });

      const data = await res.json();

      if (!res.ok || !data.success) {
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
        <p class="text-muted small mb-4">${escapeHtml(result.examTitle)}</p>

        <!-- Big Score Card -->
        <div class="card border-0 bg-light p-4 rounded-4 max-w-md mx-auto mb-4 border">
          <div class="row g-3 text-center">
            <div class="col-4 border-end">
              <span class="text-muted small">প্রাপ্ত নম্বর</span>
              <h2 class="fw-bold text-primary mb-0">${result.score}</h2>
              <span class="small text-muted">/ ${result.totalMarks}</span>
            </div>
            <div class="col-4 border-end">
              <span class="text-muted small">লিডারবোর্ড স্থান</span>
              <h2 class="fw-bold text-warning mb-0">#${result.rank}</h2>
              <span class="small text-muted">মোট ${result.totalParticipants} জন</span>
            </div>
            <div class="col-4">
              <span class="text-muted small">সময় লেগেছে</span>
              <h2 class="fw-bold text-dark mb-0">${min}m ${sec}s</h2>
              <span class="small text-muted">ব্যবহৃত সময়</span>
            </div>
          </div>
        </div>

        <!-- Metric Pills -->
        <div class="d-flex justify-content-center flex-wrap gap-2 mb-4">
          <span class="badge bg-success bg-opacity-10 text-success border border-success border-opacity-25 px-3 py-2 rounded-pill">
            <i class="fa-solid fa-check me-1"></i> সঠিক: ${result.correctCount}টি
          </span>
          <span class="badge bg-danger bg-opacity-10 text-danger border border-danger border-opacity-25 px-3 py-2 rounded-pill">
            <i class="fa-solid fa-xmark me-1"></i> ভুল: ${result.wrongCount}টি
          </span>
          <span class="badge bg-secondary bg-opacity-10 text-secondary border border-secondary border-opacity-25 px-3 py-2 rounded-pill">
            <i class="fa-solid fa-minus me-1"></i> অনুত্তরিত: ${result.skippedCount}টি
          </span>
        </div>

        <!-- Action Buttons -->
        <div class="d-flex flex-wrap justify-content-center gap-2">
          <button type="button" class="btn btn-success rounded-pill px-4" id="viewResultReviewBtn">
            <i class="fa-solid fa-square-check me-1"></i> সঠিক উত্তর ও ব্যাখ্যা দেখুন
          </button>
          <button type="button" class="btn btn-primary rounded-pill px-4" id="viewResultLeaderboardBtn">
            <i class="fa-solid fa-trophy me-1"></i> লিডারবোর্ড দেখুন
          </button>
          <button type="button" class="btn btn-outline-secondary rounded-pill px-4" data-bs-dismiss="modal">
            বন্ধ করুন
          </button>
        </div>
      </div>
    `;

    document.getElementById('viewResultReviewBtn')?.addEventListener('click', () => {
      const modalEl = document.getElementById('examLiveModal');
      bootstrap.Modal.getInstance(modalEl).hide();
      openAnswerReview(result.examId);
    });

    document.getElementById('viewResultLeaderboardBtn')?.addEventListener('click', () => {
      const modalEl = document.getElementById('examLiveModal');
      bootstrap.Modal.getInstance(modalEl).hide();
      openLeaderboard(result.examId);
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

      body.innerHTML = `
        <div class="mb-4 text-center">
          <h4 class="fw-bold text-dark mb-1"><i class="fa-solid fa-trophy text-warning me-2"></i>${escapeHtml(data.examTitle)}</h4>
          <p class="text-muted small mb-0">মোট অংশগ্রহণকারী: <strong>${data.totalParticipants}</strong> জন শিক্ষার্থী</p>
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

                  const min = Math.floor(s.timeTakenSeconds / 60);
                  const sec = s.timeTakenSeconds % 60;

                  return `
                    <tr class="${s.isCurrentStudent ? 'table-primary fw-bold' : ''}">
                      <td>${rankBadge}</td>
                      <td>
                        <div class="d-flex align-items-center gap-2">
                          <span>${escapeHtml(s.name)}</span>
                          ${s.isCurrentStudent ? '<span class="badge bg-primary text-white rounded-pill px-2 py-0 small">তুমি</span>' : ''}
                        </div>
                      </td>
                      <td><code>${escapeHtml(s.roll)}</code></td>
                      <td><span class="text-uppercase small text-muted">${escapeHtml(s.group)}</span></td>
                      <td class="text-center"><span class="fw-bold text-primary">${s.score}</span> <span class="small text-muted">/ ${s.totalMarks}</span></td>
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
        throw new Error(data.message || 'উত্তরপত্র লোড করা সম্ভব হয়নি');
      }

      const questions = data.questions || [];
      const summary = data.summary;

      body.innerHTML = `
        <!-- Summary Header -->
        <div class="bg-light border rounded-4 p-3 mb-4">
          <div class="d-flex flex-wrap justify-content-between align-items-center gap-2">
            <div>
              <h5 class="fw-bold mb-0 text-dark">${escapeHtml(data.examTitle)}</h5>
              <div class="small text-muted">শিক্ষার্থী: ${escapeHtml(data.student.name)} (রোল: ${escapeHtml(data.student.roll)})</div>
            </div>
            <div class="d-flex gap-2">
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

    } catch (err) {
      body.innerHTML = `
        <div class="alert alert-danger my-3">
          <i class="fa-solid fa-triangle-exclamation me-1"></i> ${err.message}
        </div>
      `;
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
