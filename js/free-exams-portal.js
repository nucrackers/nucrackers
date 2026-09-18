/**
 * NU Crackers - Free Batch Live Exam Portal, Leaderboard & PDF Solve Sheet System
 */

(function () {
  'use strict';

  // State
  let cachedFreeExams = [];
  let currentGroupFilter = 'all';
  let activeExam = null;
  let activeExamQuestions = [];
  let userAnswers = {};
  let currentQuestionIndex = 0;
  let timerInterval = null;
  let totalTimeSeconds = 0;
  let remainingSeconds = 0;
  let examStartTime = null;

  // Student Profile Helpers
  function getStudentProfile() {
    return {
      name: localStorage.getItem('nu_free_student_name') || '',
      college: localStorage.getItem('nu_free_student_college') || ''
    };
  }

  function saveStudentProfile(name, college) {
    if (name) localStorage.setItem('nu_free_student_name', name.trim());
    if (college) localStorage.setItem('nu_free_student_college', college.trim());
    updateProfileUI();
  }

  function updateProfileUI() {
    const profile = getStudentProfile();
    const nameEl = document.getElementById('freeStudentNameDisplay');
    const collegeEl = document.getElementById('freeStudentCollegeDisplay');
    const badgeBar = document.getElementById('freeStudentProfileBar');

    if (nameEl && collegeEl && badgeBar) {
      if (profile.name) {
        nameEl.textContent = profile.name;
        collegeEl.textContent = profile.college || 'সাধারণ শিক্ষার্থী';
        badgeBar.classList.remove('d-none');
      } else {
        nameEl.textContent = 'নাম যুক্ত করুন';
        collegeEl.textContent = '';
        badgeBar.classList.remove('d-none');
      }
    }
  }

  // Format Helpers
  function formatSecondsToMinSec(sec) {
    const s = Math.max(0, parseInt(sec, 10) || 0);
    const mins = Math.floor(s / 60);
    const rem = s % 60;
    return `${mins} মি. ${rem < 10 ? '0' : ''}${rem} সে.`;
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

  // 1. Fetch & Render Live Exams
  async function loadFreeExams() {
    const container = document.getElementById('freeLiveExamsGrid');
    if (!container) return;

    container.innerHTML = `
      <div class="col-12 text-center py-5">
        <div class="spinner-border text-primary" role="status">
          <span class="visually-hidden">লোড হচ্ছে...</span>
        </div>
        <p class="text-muted mt-2 fw-semibold">লাইভ ফ্রি মডেল টেস্ট সমূহ লোড হচ্ছে...</p>
      </div>
    `;

    try {
      const res = await fetch('/api/exams?type=free');
      const data = await res.json();

      if (!res.ok || !data.success) {
        throw new Error(data.message || 'পরীক্ষা লোড করা যায়নি');
      }

      cachedFreeExams = data.exams || [];
      renderFreeExams();
    } catch (err) {
      console.error('Error loading free exams:', err);
      container.innerHTML = `
        <div class="col-12">
          <div class="alert alert-warning text-center py-4 rounded-4 shadow-sm">
            <i class="fa-solid fa-circle-exclamation fs-3 text-warning mb-2 d-block"></i>
            <strong>লাইভ পরীক্ষা লোড করতে সমস্যা হয়েছে।</strong>
            <p class="small text-muted mb-3">${escapeHtml(err.message)}</p>
            <button class="btn btn-sm btn-primary rounded-pill px-4" id="btnRetryLoadFreeExams">
              <i class="fa-solid fa-rotate-right me-1"></i> পুনরায় চেষ্টা করুন
            </button>
          </div>
        </div>
      `;
      document.getElementById('btnRetryLoadFreeExams')?.addEventListener('click', loadFreeExams);
    }
  }

  function renderFreeExams() {
    const container = document.getElementById('freeLiveExamsGrid');
    if (!container) return;

    let filtered = cachedFreeExams;
    if (currentGroupFilter !== 'all') {
      filtered = cachedFreeExams.filter(
        e => e.group === currentGroupFilter || e.group === 'all'
      );
    }

    if (filtered.length === 0) {
      container.innerHTML = `
        <div class="col-12 text-center py-5">
          <div class="p-4 bg-light rounded-4 border">
            <i class="fa-solid fa-clipboard-question fs-1 text-muted mb-2"></i>
            <h5 class="fw-bold text-dark">এই বিভাগে বর্তমানে কোনো লাইভ পরীক্ষা সক্রিয় নেই</h5>
            <p class="text-muted small">শীঘ্রই নতুন মডেল টেস্ট যুক্ত করা হবে। অন্যান্য বিভাগের পরীক্ষা দেখুন।</p>
          </div>
        </div>
      `;
      return;
    }

    const student = getStudentProfile();

    container.innerHTML = filtered.map(exam => {
      const groupEmoji = exam.group === 'science' ? '🔬' : exam.group === 'arts' ? '🎨' : exam.group === 'commerce' ? '📊' : '🌐';
      const groupName = exam.group === 'science' ? 'বিজ্ঞান ইউনিট' : exam.group === 'arts' ? 'মানবিক ইউনিট' : exam.group === 'commerce' ? 'ব্যবসায় শিক্ষা' : 'সকল ইউনিট';
      const groupBorderClass = exam.group === 'science' ? 'border-primary' : exam.group === 'arts' ? 'border-warning' : exam.group === 'commerce' ? 'border-success' : 'border-info';
      const groupBadgeBg = exam.group === 'science' ? 'bg-primary' : exam.group === 'arts' ? 'bg-warning text-dark' : exam.group === 'commerce' ? 'bg-success' : 'bg-info text-dark';
      const duration = exam.durationMinutes || exam.duration || 15;
      const qCount = exam.questionCount || 0;
      const totalMarks = exam.totalMarks || qCount;

      return `
        <div class="col-md-6 col-lg-4 mb-4">
          <div class="card h-100 shadow-sm border-0 rounded-4 overflow-hidden position-relative free-exam-card ${groupBorderClass}" style="border-top: 5px solid !important; background: #ffffff; transition: transform 0.25s, box-shadow 0.25s;">
            <div class="card-body p-4 d-flex flex-column justify-content-between">
              <div>
                <!-- Top Badges -->
                <div class="d-flex justify-content-between align-items-center mb-3">
                  <span class="badge ${groupBadgeBg} rounded-pill px-3 py-2 fw-semibold">
                    ${groupEmoji} ${groupName}
                  </span>
                  <span class="badge bg-danger rounded-pill px-3 py-2 fw-bold text-uppercase d-flex align-items-center gap-1 shadow-sm pulse-badge">
                    <span class="spinner-grow spinner-grow-sm" role="status" style="width: 8px; height: 8px;"></span> লাইভ পরীক্ষা
                  </span>
                </div>

                <!-- Title & Subject -->
                <h5 class="fw-bold text-dark mb-1" style="font-size: 1.15rem; line-height: 1.4;">
                  ${escapeHtml(exam.title)}
                </h5>
                <p class="text-primary small fw-semibold mb-2">
                  <i class="fa-solid fa-book-bookmark me-1"></i> ${escapeHtml(exam.subject)}
                </p>
                <p class="text-muted small mb-3" style="min-height: 40px; font-size: 0.85rem;">
                  ${escapeHtml(exam.description || 'জাতীয় বিশ্ববিদ্যালয় ভর্তি পরীক্ষার অনুরূপ মানবণ্টন ও নেগেটিভ মার্কিং সহ লাইভ পরীক্ষা।')}
                </p>

                <!-- Exam Specs Grid -->
                <div class="bg-light p-3 rounded-3 mb-4">
                  <div class="row g-2 text-center">
                    <div class="col-4 border-end">
                      <div class="text-muted small" style="font-size: 0.75rem;">সময়</div>
                      <div class="fw-bold text-dark"><i class="fa-regular fa-clock text-primary me-1"></i>${duration} মি.</div>
                    </div>
                    <div class="col-4 border-end">
                      <div class="text-muted small" style="font-size: 0.75rem;">প্রশ্ন</div>
                      <div class="fw-bold text-dark"><i class="fa-solid fa-list-check text-success me-1"></i>${qCount}টি</div>
                    </div>
                    <div class="col-4">
                      <div class="text-muted small" style="font-size: 0.75rem;">পূর্ণমান</div>
                      <div class="fw-bold text-dark"><i class="fa-solid fa-trophy text-warning me-1"></i>${totalMarks}</div>
                    </div>
                  </div>
                </div>
              </div>

              <!-- Action Buttons -->
              <div>
                <div class="d-grid gap-2">
                  <button class="btn btn-primary rounded-pill py-2 fw-bold shadow-sm d-flex align-items-center justify-content-center gap-2 btn-start-free-exam" data-exam-id="${exam.id}" data-exam-title="${escapeHtml(exam.title)}">
                    <i class="fa-solid fa-play"></i> পরীক্ষা শুরু করো
                  </button>

                  <div class="row g-2">
                    <div class="col-6">
                      <button class="btn btn-outline-secondary w-100 rounded-pill py-2 small fw-semibold btn-view-free-leaderboard" data-exam-id="${exam.id}" data-exam-title="${escapeHtml(exam.title)}">
                        <i class="fa-solid fa-ranking-star text-warning me-1"></i> লিডারবোর্ড
                      </button>
                    </div>
                    <div class="col-6">
                      <button class="btn btn-outline-success w-100 rounded-pill py-2 small fw-semibold btn-view-free-solvesheet" data-exam-id="${exam.id}" data-exam-title="${escapeHtml(exam.title)}">
                        <i class="fa-solid fa-file-pdf text-danger me-1"></i> সলভ শীট PDF
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      `;
    }).join('');

    // Attach Event Listeners
    attachCardEventListeners();
  }

  function attachCardEventListeners() {
    // Start Exam
    document.querySelectorAll('.btn-start-free-exam').forEach(btn => {
      btn.addEventListener('click', () => {
        const examId = btn.getAttribute('data-exam-id');
        promptAndStartExam(examId);
      });
    });

    // Leaderboard
    document.querySelectorAll('.btn-view-free-leaderboard').forEach(btn => {
      btn.addEventListener('click', () => {
        const examId = btn.getAttribute('data-exam-id');
        const examTitle = btn.getAttribute('data-exam-title');
        openLeaderboardModal(examId, examTitle);
      });
    });

    // Solve Sheet
    document.querySelectorAll('.btn-view-free-solvesheet').forEach(btn => {
      btn.addEventListener('click', () => {
        const examId = btn.getAttribute('data-exam-id');
        const examTitle = btn.getAttribute('data-exam-title');
        openSolveSheetModal(examId, examTitle);
      });
    });
  }

  // 2. Prompt Name & College Before Exam
  function promptAndStartExam(examId) {
    const student = getStudentProfile();
    if (!student.name) {
      // Open Student Identity Modal
      const modalEl = document.getElementById('freeStudentModal');
      const nameInput = document.getElementById('freeInputStudentName');
      const collegeInput = document.getElementById('freeInputStudentCollege');
      const hiddenExamId = document.getElementById('freeHiddenTargetExamId');

      if (hiddenExamId) hiddenExamId.value = examId;
      if (nameInput) nameInput.value = '';
      if (collegeInput) collegeInput.value = '';

      const modal = new bootstrap.Modal(modalEl);
      modal.show();
    } else {
      startLiveExam(examId);
    }
  }

  // 3. Start Live Exam Process
  async function startLiveExam(examId) {
    const student = getStudentProfile();
    if (!student.name) {
      promptAndStartExam(examId);
      return;
    }

    try {
      const res = await fetch(`/api/exams/${examId}`);
      const data = await res.json();

      if (!res.ok || !data.success) {
        throw new Error(data.message || 'পরীক্ষার প্রশ্ন লোড করা যায়নি');
      }

      activeExam = data.exam;
      activeExamQuestions = activeExam.questions || [];
      userAnswers = {};
      currentQuestionIndex = 0;
      examStartTime = Date.now();

      if (activeExamQuestions.length === 0) {
        alert('দুঃখিত, এই পরীক্ষায় এখনো কোনো প্রশ্ন যোগ করা হয়নি। অনুগ্রহ করে এডমিন প্রশ্ন যোগ করার অপেক্ষা করুন।');
        return;
      }

      // Initialize Timer
      totalTimeSeconds = (activeExam.durationMinutes || activeExam.duration || 15) * 60;
      remainingSeconds = totalTimeSeconds;

      // Populate Exam Modal UI
      document.getElementById('liveExamModalTitle').textContent = activeExam.title;
      document.getElementById('liveExamModalSubject').textContent = activeExam.subject;
      document.getElementById('liveExamStudentBadge').textContent = `${student.name} • ${student.college || 'ফ্রি ব্যাচ'}`;

      // Show Live Exam Modal
      const examModalEl = document.getElementById('freeLiveExamModal');
      const examModal = new bootstrap.Modal(examModalEl, { backdrop: 'static', keyboard: false });
      examModal.show();

      // Render Question Palette
      renderQuestionPalette();
      // Render Current Question
      renderActiveQuestion();
      // Start Countdown
      startTimer();

    } catch (err) {
      alert('ত্রুটি: ' + err.message);
    }
  }

  function startTimer() {
    clearInterval(timerInterval);
    updateTimerDisplay();

    timerInterval = setInterval(() => {
      remainingSeconds--;
      updateTimerDisplay();

      if (remainingSeconds <= 0) {
        clearInterval(timerInterval);
        autoSubmitExam();
      }
    }, 1000);
  }

  function updateTimerDisplay() {
    const timerDisplay = document.getElementById('liveExamTimerDisplay');
    const timerBadge = document.getElementById('liveExamTimerBadge');
    if (!timerDisplay) return;

    const mins = Math.floor(remainingSeconds / 60);
    const secs = remainingSeconds % 60;
    timerDisplay.textContent = `${mins < 10 ? '0' : ''}${mins}:${secs < 10 ? '0' : ''}${secs}`;

    // Under 2 mins visual warning
    if (timerBadge) {
      if (remainingSeconds <= 120) {
        timerBadge.classList.remove('bg-light', 'text-danger');
        timerBadge.classList.add('bg-danger', 'text-white', 'pulse-badge');
      } else {
        timerBadge.classList.add('bg-light', 'text-danger');
        timerBadge.classList.remove('bg-danger', 'text-white', 'pulse-badge');
      }
    }
  }

  function renderQuestionPalette() {
    const container = document.getElementById('liveExamPaletteContainer');
    if (!container) return;

    container.innerHTML = activeExamQuestions.map((q, idx) => {
      const isAnswered = userAnswers[q.id] !== undefined && userAnswers[q.id] !== null && userAnswers[q.id] !== -1;
      const isCurrent = idx === currentQuestionIndex;
      const btnClass = isCurrent
        ? 'btn-primary shadow-sm'
        : isAnswered
        ? 'btn-success text-white'
        : 'btn-outline-secondary';

      return `
        <button type="button" class="btn btn-sm ${btnClass} palette-btn rounded-circle fw-bold" style="width: 38px; height: 38px;" data-index="${idx}">
          ${idx + 1}
        </button>
      `;
    }).join('');

    container.querySelectorAll('.palette-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        const idx = parseInt(btn.getAttribute('data-index'), 10);
        currentQuestionIndex = idx;
        renderActiveQuestion();
        renderQuestionPalette();
      });
    });
  }

  function renderActiveQuestion() {
    const q = activeExamQuestions[currentQuestionIndex];
    if (!q) return;

    // Tracker text
    const tracker = document.getElementById('liveExamQuestionTracker');
    if (tracker) {
      tracker.textContent = `প্রশ্ন ${currentQuestionIndex + 1} / ${activeExamQuestions.length}`;
    }

    const questionTextEl = document.getElementById('liveExamQuestionText');
    if (questionTextEl) {
      questionTextEl.innerHTML = `<span class="badge bg-primary me-2">Q${currentQuestionIndex + 1}</span> ${escapeHtml(q.question)}`;
    }

    const optionsContainer = document.getElementById('liveExamOptionsContainer');
    if (!optionsContainer) return;

    const optLabels = ['ক', 'খ', 'গ', 'ঘ'];
    const chosenIndex = userAnswers[q.id];

    optionsContainer.innerHTML = (q.options || []).map((optText, optIdx) => {
      const isSelected = chosenIndex === optIdx;
      const cardBorder = isSelected ? 'border-primary bg-primary bg-opacity-10' : 'border-light-subtle bg-white';

      return `
        <div class="card p-3 mb-2 rounded-3 option-card ${cardBorder}" style="cursor: pointer; transition: all 0.2s;" data-opt-idx="${optIdx}">
          <div class="d-flex align-items-center">
            <div class="rounded-circle border d-flex align-items-center justify-content-center me-3 fw-bold ${isSelected ? 'bg-primary text-white border-primary' : 'bg-light text-muted'}" style="width: 32px; height: 32px; flex-shrink: 0;">
              ${optLabels[optIdx] || optIdx + 1}
            </div>
            <div class="text-dark fw-semibold" style="font-size: 1rem; line-height: 1.4;">
              ${escapeHtml(optText)}
            </div>
          </div>
        </div>
      `;
    }).join('');

    // Attach option click
    optionsContainer.querySelectorAll('.option-card').forEach(card => {
      card.addEventListener('click', () => {
        const optIdx = parseInt(card.getAttribute('data-opt-idx'), 10);
        userAnswers[q.id] = optIdx;
        renderActiveQuestion();
        renderQuestionPalette();
      });
    });

    // Update Nav buttons
    const btnPrev = document.getElementById('liveExamBtnPrev');
    const btnNext = document.getElementById('liveExamBtnNext');
    if (btnPrev) btnPrev.disabled = currentQuestionIndex === 0;
    if (btnNext) {
      if (currentQuestionIndex === activeExamQuestions.length - 1) {
        btnNext.innerHTML = 'শেষ প্রশ্ন <i class="fa-solid fa-flag-checkered ms-1"></i>';
      } else {
        btnNext.innerHTML = 'পরবর্তী প্রশ্ন <i class="fa-solid fa-arrow-right ms-1"></i>';
      }
    }
  }

  // Question navigation buttons
  document.getElementById('liveExamBtnPrev')?.addEventListener('click', () => {
    if (currentQuestionIndex > 0) {
      currentQuestionIndex--;
      renderActiveQuestion();
      renderQuestionPalette();
    }
  });

  document.getElementById('liveExamBtnNext')?.addEventListener('click', () => {
    if (currentQuestionIndex < activeExamQuestions.length - 1) {
      currentQuestionIndex++;
      renderActiveQuestion();
      renderQuestionPalette();
    }
  });

  document.getElementById('liveExamBtnClearAnswer')?.addEventListener('click', () => {
    const q = activeExamQuestions[currentQuestionIndex];
    if (q) {
      delete userAnswers[q.id];
      renderActiveQuestion();
      renderQuestionPalette();
    }
  });

  // 4. Submit Exam
  document.getElementById('liveExamBtnSubmit')?.addEventListener('click', () => {
    const answeredCount = Object.keys(userAnswers).length;
    const totalCount = activeExamQuestions.length;
    const unanswered = totalCount - answeredCount;

    const confirmMsg = unanswered > 0
      ? `আপনি ${answeredCount}টি প্রশ্নের উত্তর দিয়েছেন, এখনো ${unanswered}টি প্রশ্ন বাকি আছে। আপনি কি পরীক্ষাটি জমা দিতে চান?`
      : `আপনি সব (${answeredCount}টি) প্রশ্নের উত্তর দিয়েছেন। আপনি কি পরীক্ষাটি জমা দিতে চান?`;

    if (confirm(confirmMsg)) {
      finalizeSubmit();
    }
  });

  function autoSubmitExam() {
    alert('⏰ পরীক্ষার নির্ধারিত সময় শেষ হয়েছে! আপনার উত্তরপত্র স্বয়ংক্রিয়ভাবে জমা নেওয়া হচ্ছে...');
    finalizeSubmit();
  }

  async function finalizeSubmit() {
    clearInterval(timerInterval);

    const student = getStudentProfile();
    const timeTakenSeconds = Math.round((Date.now() - examStartTime) / 1000);

    const submitPayload = {
      studentName: student.name,
      collegeName: student.college,
      answers: userAnswers,
      timeTakenSeconds: timeTakenSeconds
    };

    // Show loading state
    const submitBtn = document.getElementById('liveExamBtnSubmit');
    if (submitBtn) {
      submitBtn.disabled = true;
      submitBtn.innerHTML = '<span class="spinner-border spinner-border-sm me-1"></span> ফলাফল তৈরি হচ্ছে...';
    }

    try {
      const res = await fetch(`/api/exams/${activeExam.id}/submit`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(submitPayload)
      });

      const data = await res.json();
      if (!res.ok || !data.success) {
        throw new Error(data.message || 'সাবমিট ব্যর্থ হয়েছে');
      }

      // Close live exam modal
      const examModalEl = document.getElementById('freeLiveExamModal');
      const examModal = bootstrap.Modal.getInstance(examModalEl);
      if (examModal) examModal.hide();

      // Open Result Modal with full details
      showResultModal(data.result);

      // Refresh list to show scores
      loadFreeExams();

    } catch (err) {
      alert('পরীক্ষা জমা দেওয়ার সময় ত্রুটি: ' + err.message);
      if (submitBtn) {
        submitBtn.disabled = false;
        submitBtn.innerHTML = '<i class="fa-solid fa-circle-check me-1"></i> সাবমিট করুন';
      }
    }
  }

// 5. Result Modal & Performance
  function showResultModal(result) {
    const resModalEl = document.getElementById('freeResultModal');
    if (!resModalEl) return;

    const setTxt = (id, text) => {
      const el = document.getElementById(id);
      if (el) el.textContent = text !== undefined && text !== null ? text : '';
    };

    setTxt('resStudentName', result.name || 'সাধারণ শিক্ষার্থী');
    setTxt('resStudentCollege', result.college || 'কলেজ উল্লেখ নেই');
    setTxt('resExamTitle', result.examTitle || 'মডেল টেস্ট');

    setTxt('resScoreDisplay', `${result.score} / ${result.totalMarks}`);
    setTxt('resRankBadge', `মেধা স্থান: ${result.rank} তম (মোট ${result.totalParticipants} জনের মধ্যে)`);
    setTxt('resCorrectCount', result.correctCount || 0);
    setTxt('resWrongCount', result.wrongCount || 0);
    setTxt('resSkippedCount', result.skippedCount || 0);
    setTxt('resTimeTaken', formatSecondsToMinSec(result.timeTakenSeconds || 0));

    const passEl = document.getElementById('resPassFailStatus');
    if (passEl) {
      if (result.isPassed) {
        passEl.className = 'badge bg-success px-3 py-2 rounded-pill';
        passEl.innerHTML = '<i class="fa-solid fa-circle-check me-1"></i> উত্তীর্ণ (PASSED)';
      } else {
        passEl.className = 'badge bg-danger px-3 py-2 rounded-pill';
        passEl.innerHTML = '<i class="fa-solid fa-circle-xmark me-1"></i> অনুত্তীর্ণ (FAILED)';
      }
    }
const btnLeaderboard = document.getElementById('resBtnViewLeaderboard');
    if (btnLeaderboard) {
      btnLeaderboard.onclick = () => {
        const resModal = bootstrap.Modal.getInstance(resModalEl);
        if (resModal) resModal.hide();
        openLeaderboardModal(result.examId, result.examTitle);
      };
    }

    const btnSolveSheet = document.getElementById('resBtnViewSolveSheet');
    if (btnSolveSheet) {
      btnSolveSheet.onclick = () => {
        const resModal = bootstrap.Modal.getInstance(resModalEl);
        if (resModal) resModal.hide();
        openSolveSheetModal(result.examId, result.examTitle, result.submissionId);
      };
    }
    // Attach actions to Result Modal Buttons
    document.getElementById('resBtnViewLeaderboard').onclick = () => {
      const resModal = bootstrap.Modal.getInstance(resModalEl);
      if (resModal) resModal.hide();
      openLeaderboardModal(result.examId, result.examTitle);
    };

    document.getElementById('resBtnViewSolveSheet').onclick = () => {
      const resModal = bootstrap.Modal.getInstance(resModalEl);
      if (resModal) resModal.hide();
      openSolveSheetModal(result.examId, result.examTitle, result.submissionId);
    };

    const modal = new bootstrap.Modal(resModalEl);
    modal.show();
  }

  // 6. Realtime Leaderboard Modal
  async function openLeaderboardModal(examId, examTitle) {
    const modalEl = document.getElementById('freeLeaderboardModal');
    if (!modalEl) return;

    const titleEl = document.getElementById('leaderboardExamTitle');
    if (titleEl) titleEl.textContent = examTitle || 'মডেল টেস্ট';

    const tableBody = document.getElementById('leaderboardTableBody');
    tableBody.innerHTML = `
      <tr>
        <td colspan="6" class="text-center py-4">
          <div class="spinner-border text-primary spinner-border-sm me-2"></div> লিডারবোর্ড লোড হচ্ছে...
        </td>
      </tr>
    `;

    const modal = new bootstrap.Modal(modalEl);
    modal.show();

    const student = getStudentProfile();

    try {
      const res = await fetch(`/api/exams/${examId}/leaderboard?currentName=${encodeURIComponent(student.name)}`);
      const data = await res.json();

      if (!res.ok || !data.success) {
        throw new Error(data.message || 'লিডারবোর্ড তথ্য পাওয়া যায়নি');
      }

      const list = data.leaderboard || [];
      document.getElementById('leaderboardTotalCount').textContent = `মোট পরীক্ষার্থী: ${list.length} জন`;

      if (list.length === 0) {
        tableBody.innerHTML = `
          <tr>
            <td colspan="6" class="text-center py-4 text-muted">
              এখনো কেউ এই পরীক্ষায় অংশগ্রহণ করেনি। প্রথম পরীক্ষার্থী হিসেবে অংশগ্রহণ করুন!
            </td>
          </tr>
        `;
        return;
      }

      tableBody.innerHTML = list.map(item => {
        let rankBadge = item.rank;
        if (item.rank === 1) rankBadge = '<span class="badge bg-warning text-dark px-2 py-1 fs-6">🥇 ১ম</span>';
        else if (item.rank === 2) rankBadge = '<span class="badge bg-secondary text-white px-2 py-1 fs-6">🥈 ২য়</span>';
        else if (item.rank === 3) rankBadge = '<span class="badge bg-danger text-white px-2 py-1 fs-6">🥉 ৩য়</span>';
        else rankBadge = `<span class="fw-bold text-muted">${item.rank}</span>`;

        const rowHighlight = item.isCurrentStudent ? 'table-warning fw-bold border-start border-4 border-warning' : '';

        return `
          <tr class="${rowHighlight}">
            <td class="text-center align-middle">${rankBadge}</td>
            <td class="align-middle">
              <div class="fw-bold text-dark">${escapeHtml(item.name)} ${item.isCurrentStudent ? '<span class="badge bg-primary ms-1" style="font-size: 0.65rem;">তুমি</span>' : ''}</div>
              <div class="text-muted small">${escapeHtml(item.college || 'কলেজ উল্লেখ নেই')}</div>
            </td>
            <td class="text-center align-middle fw-bold text-primary">${item.score} / ${item.totalMarks}</td>
            <td class="text-center align-middle small text-success fw-semibold"><i class="fa-regular fa-circle-check me-1"></i>${item.correctCount}</td>
            <td class="text-center align-middle small text-danger fw-semibold"><i class="fa-regular fa-circle-xmark me-1"></i>${item.wrongCount}</td>
            <td class="text-center align-middle small text-muted">${formatSecondsToMinSec(item.timeTakenSeconds)}</td>
          </tr>
        `;
      }).join('');

    } catch (err) {
      tableBody.innerHTML = `
        <tr>
          <td colspan="6" class="text-center py-4 text-danger">
            লিডারবোর্ড লোড ব্যর্থ হয়েছে: ${escapeHtml(err.message)}
          </td>
        </tr>
      `;
    }
  }

  // 7. Solve Sheet & PDF Download System
  async function openSolveSheetModal(examId, examTitle, submissionId) {
    const modalEl = document.getElementById('freeSolveSheetModal');
    if (!modalEl) return;

    const titleEl = document.getElementById('solveSheetExamTitle');
    if (titleEl) titleEl.textContent = examTitle || 'মডেল টেস্ট';

    const container = document.getElementById('solveSheetQuestionsContainer');
    container.innerHTML = `
      <div class="text-center py-5">
        <div class="spinner-border text-primary me-2"></div>
        <p class="text-muted mt-2">ব্যাখ্যাসহ সমাধানপত্র লোড হচ্ছে...</p>
      </div>
    `;

    const modal = new bootstrap.Modal(modalEl);
    modal.show();

    const student = getStudentProfile();

    try {
      let url = `/api/exams/${examId}/review?name=${encodeURIComponent(student.name)}`;
      if (submissionId) url += `&submissionId=${encodeURIComponent(submissionId)}`;

      const res = await fetch(url);
      const data = await res.json();

      if (!res.ok || !data.success) {
        throw new Error(data.message || 'সলভ শীট লোড করা যায়নি');
      }

      // Populate Printable Header
      document.getElementById('solveSheetStudentName').textContent = data.student.name || student.name || 'সাধারণ শিক্ষার্থী';
      document.getElementById('solveSheetStudentCollege').textContent = data.student.college || student.college || 'বাংলাদেশ';
      document.getElementById('solveSheetScore').textContent = `${data.summary.score} / ${data.summary.totalMarks}`;
      document.getElementById('solveSheetDate').textContent = new Date(data.summary.submittedAt).toLocaleDateString('bn-BD', {
        year: 'numeric', month: 'long', day: 'numeric', hour: '2-digit', minute: '2-digit'
      });

      const questions = data.questions || [];
      const optLabels = ['ক', 'খ', 'গ', 'ঘ'];

      container.innerHTML = questions.map((q, idx) => {
        let statusBadge = '';
        if (q.isSkipped) {
          statusBadge = '<span class="badge bg-secondary">উত্তর দেওয়া হয়নি</span>';
        } else if (q.isCorrect) {
          statusBadge = '<span class="badge bg-success"><i class="fa-solid fa-check me-1"></i>সঠিক উত্তর (+১)</span>';
        } else {
          statusBadge = '<span class="badge bg-danger"><i class="fa-solid fa-xmark me-1"></i>ভুল উত্তর (-০.২৫)</span>';
        }

        const optionsHtml = (q.options || []).map((optText, optIdx) => {
          const isCorrectAnswer = optIdx === q.correctIndex;
          const isUserChoice = optIdx === q.chosenIndex;

          let optionStyle = 'bg-light text-dark border-light-subtle';
          let icon = '';

          if (isCorrectAnswer) {
            optionStyle = 'bg-success bg-opacity-10 text-success border border-success fw-bold';
            icon = '<i class="fa-solid fa-circle-check text-success ms-auto"></i>';
          }
          if (isUserChoice && !isCorrectAnswer) {
            optionStyle = 'bg-danger bg-opacity-10 text-danger border border-danger fw-semibold';
            icon = '<i class="fa-solid fa-circle-xmark text-danger ms-auto"></i>';
          }

          return `
            <div class="p-2 px-3 rounded-2 mb-2 d-flex align-items-center ${optionStyle}" style="font-size: 0.95rem;">
              <span class="fw-bold me-2" style="width: 24px;">${optLabels[optIdx]}।</span>
              <span>${escapeHtml(optText)}</span>
              ${icon}
            </div>
          `;
        }).join('');

        return `
          <div class="card p-4 mb-4 rounded-3 border shadow-sm solve-question-card">
            <div class="d-flex justify-content-between align-items-center mb-3">
              <span class="fw-bold text-primary">প্রশ্ন ${idx + 1}</span>
              ${statusBadge}
            </div>

            <h6 class="fw-bold text-dark mb-3" style="line-height: 1.5; font-size: 1.05rem;">
              ${escapeHtml(q.question)}
            </h6>

            <div class="mb-3">
              ${optionsHtml}
            </div>

            <div class="p-3 bg-primary bg-opacity-10 rounded-3 border border-primary border-opacity-25 mt-2">
              <div class="fw-bold text-primary small mb-1">
                <i class="fa-solid fa-lightbulb text-warning me-1"></i> বিস্তারিত সমাধান ও ব্যাখ্যা:
              </div>
              <div class="text-dark small" style="line-height: 1.6;">
                ${escapeHtml(q.explanation || 'কোনো অতিরিক্ত ব্যাখ্যা দেওয়া নেই।')}
              </div>
            </div>
          </div>
        `;
      }).join('');

    } catch (err) {
      container.innerHTML = `
        <div class="alert alert-danger text-center py-4">
          <i class="fa-solid fa-triangle-exclamation fs-3 d-block mb-2"></i>
          সলভ শীট প্রদর্শনে সমস্যা হয়েছে: ${escapeHtml(err.message)}
        </div>
      `;
    }
  }

  // Print PDF Trigger
  document.getElementById('btnPrintSolveSheet')?.addEventListener('click', () => {
    window.print();
  });

  // Student Identity Form Submission
  document.getElementById('freeStudentIdentityForm')?.addEventListener('submit', (e) => {
    e.preventDefault();
    const nameInput = document.getElementById('freeInputStudentName');
    const collegeInput = document.getElementById('freeInputStudentCollege');
    const hiddenExamId = document.getElementById('freeHiddenTargetExamId');

    const name = nameInput ? nameInput.value.trim() : '';
    const college = collegeInput ? collegeInput.value.trim() : '';

    if (!name) {
      alert('অনুগ্রহ করে তোমার নাম লিখো।');
      return;
    }

    saveStudentProfile(name, college);

    const modalEl = document.getElementById('freeStudentModal');
    const modal = bootstrap.Modal.getInstance(modalEl);
    if (modal) modal.hide();

    const targetExamId = hiddenExamId ? hiddenExamId.value : null;
    if (targetExamId) {
      startLiveExam(targetExamId);
    }
  });

  // Edit Profile Click
  document.getElementById('btnEditFreeProfile')?.addEventListener('click', () => {
    const student = getStudentProfile();
    const modalEl = document.getElementById('freeStudentModal');
    const nameInput = document.getElementById('freeInputStudentName');
    const collegeInput = document.getElementById('freeInputStudentCollege');
    const hiddenExamId = document.getElementById('freeHiddenTargetExamId');

    if (hiddenExamId) hiddenExamId.value = '';
    if (nameInput) nameInput.value = student.name || '';
    if (collegeInput) collegeInput.value = student.college || '';

    const modal = new bootstrap.Modal(modalEl);
    modal.show();
  });

  // Filter Pills Handling
  function initFilters() {
    const filterPills = document.querySelectorAll('.live-exam-filter-btn');
    filterPills.forEach(pill => {
      pill.addEventListener('click', () => {
        filterPills.forEach(p => p.classList.remove('active'));
        pill.classList.add('active');
        currentGroupFilter = pill.getAttribute('data-group') || 'all';
        renderFreeExams();
      });
    });

    // Also connect to group card triggers
    document.querySelectorAll('.filter-trigger-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        const group = btn.getAttribute('data-group');
        if (group) {
          currentGroupFilter = group;
          filterPills.forEach(p => {
            if (p.getAttribute('data-group') === group) p.classList.add('active');
            else p.classList.remove('active');
          });
          renderFreeExams();
        }
      });
    });
  }

  // Initialization
  document.addEventListener('DOMContentLoaded', () => {
    updateProfileUI();
    initFilters();
    loadFreeExams();
  });

})();
