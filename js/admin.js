// NU Crackers - Admin Panel JavaScript
// Manages: Unique Student Rolls, Questions, Exams, and Results

document.addEventListener('DOMContentLoaded', () => {
  const adminAuthSection = document.getElementById('adminAuthSection');
  const adminDashboardSection = document.getElementById('adminDashboardSection');
  const adminLoginForm = document.getElementById('adminLoginForm');
  const adminPassInput = document.getElementById('adminPassword');
  const adminLoginAlert = document.getElementById('adminLoginAlert');
  const logoutBtn = document.getElementById('adminLogoutBtn');

  // Tab & Content Elements
  const statsTotalStudents = document.getElementById('statsTotalStudents');
  const statsScienceStudents = document.getElementById('statsScienceStudents');
  const statsArtsStudents = document.getElementById('statsArtsStudents');
  const statsCommerceStudents = document.getElementById('statsCommerceStudents');
  const statsTotalExams = document.getElementById('statsTotalExams');
  const statsTotalQuestions = document.getElementById('statsTotalQuestions');

  // Student Form & List
  const addStudentForm = document.getElementById('addStudentForm');
  const studentAlert = document.getElementById('studentAlert');
  const studentTableBody = document.getElementById('studentTableBody');
  const studentSearchInput = document.getElementById('studentSearchInput');
  const studentFilterGroup = document.getElementById('studentFilterGroup');
  const studentCountBadge = document.getElementById('studentCountBadge');

  // Question & Exam Elements
  const examSelect = document.getElementById('examSelect');
  const selectedExamBadge = document.getElementById('selectedExamBadge');
  const addQuestionForm = document.getElementById('addQuestionForm');
  const questionAlert = document.getElementById('questionAlert');
  const examQuestionsContainer = document.getElementById('examQuestionsContainer');
  const examQuestionCount = document.getElementById('examQuestionCount');
  const createExamForm = document.getElementById('createExamForm');
  const createExamAlert = document.getElementById('createExamAlert');

  // Submissions Audit Elements
  const submissionsTableBody = document.getElementById('submissionsTableBody');
  const submissionsCountBadge = document.getElementById('submissionsCountBadge');

  // Global State
  let cachedStudents = [];
  let cachedExams = [];
  let currentSelectedExamId = null;

  // 1. Authentication Check
  function checkAuth() {
    const token = sessionStorage.getItem('nu_admin_token');
    if (token) {
      adminAuthSection.classList.add('d-none');
      adminDashboardSection.classList.remove('d-none');
      loadAllAdminData();
    } else {
      adminAuthSection.classList.remove('d-none');
      adminDashboardSection.classList.add('d-none');
    }
  }

  // Handle Admin Login
  adminLoginForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    adminLoginAlert.classList.add('d-none');

    const password = adminPassInput.value.trim();
    if (!password) {
      showLoginAlert('অনুগ্রহ করে এডমিন পাসওয়ার্ড প্রদান করুন।', 'danger');
      return;
    }

    const submitBtn = document.getElementById('adminLoginSubmitBtn');
    submitBtn.disabled = true;
    submitBtn.innerHTML = '<span class="spinner-border spinner-border-sm me-1"></span> যাচাই হচ্ছে...';

    try {
      const res = await fetch('/api/admin/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ password })
      });

      const data = await res.json();
      if (!res.ok || !data.success) {
        throw new Error(data.message || 'ভুল পাসওয়ার্ড!');
      }

      sessionStorage.setItem('nu_admin_token', data.token);
      checkAuth();
    } catch (err) {
      showLoginAlert(err.message, 'danger');
    } finally {
      submitBtn.disabled = false;
      submitBtn.innerHTML = '<i class="fa-solid fa-lock-open me-1"></i> এডমিন ড্যাশবোর্ডে প্রবেশ করুন';
    }
  });

  function showLoginAlert(msg, type = 'danger') {
    adminLoginAlert.className = `alert alert-${type} py-2 px-3 small rounded-3 mt-3`;
    adminLoginAlert.innerHTML = `<i class="fa-solid fa-circle-exclamation me-1"></i> ${msg}`;
    adminLoginAlert.classList.remove('d-none');
  }

  // Handle Logout
  logoutBtn?.addEventListener('click', () => {
    if (confirm('এডমিন প্যানেল থেকে লগআউট করতে চান?')) {
      sessionStorage.removeItem('nu_admin_token');
      checkAuth();
    }
  });

  // 2. Load All Dashboard Data
  async function loadAllAdminData() {
    await Promise.all([
      loadStats(),
      loadStudents(),
      loadExams(),
      loadSubmissions()
    ]);
  }

  // Load Overview Stats
  async function loadStats() {
    try {
      const res = await fetch('/api/admin/stats');
      const data = await res.json();
      if (data.success && data.stats) {
        const s = data.stats;
        if (statsTotalStudents) statsTotalStudents.textContent = s.totalStudents;
        const statsPendingStudents = document.getElementById('statsPendingStudents');
        if (statsPendingStudents) statsPendingStudents.textContent = s.pendingCount || 0;
        if (statsScienceStudents) statsScienceStudents.textContent = s.scienceCount;
        if (statsArtsStudents) statsArtsStudents.textContent = s.artsCount;
        if (statsCommerceStudents) statsCommerceStudents.textContent = s.commerceCount;
        if (statsTotalExams) statsTotalExams.textContent = s.totalExams;
        if (statsTotalQuestions) statsTotalQuestions.textContent = s.totalQuestions;
      }
    } catch (e) {
      console.warn('Could not load stats', e);
    }
  }

  // 3. STUDENT MANAGEMENT (STRICT UNIQUE ROLL)
  async function loadStudents() {
    try {
      studentTableBody.innerHTML = `<tr><td colspan="7" class="text-center py-4 text-muted"><div class="spinner-border spinner-border-sm text-primary me-2"></div>শিক্ষার্থীদের তালিকা লোড হচ্ছে...</td></tr>`;

      const res = await fetch('/api/admin/students');
      const data = await res.json();
      if (data.success) {
        cachedStudents = data.students || [];
        renderStudentsTable();
      }
    } catch (err) {
      studentTableBody.innerHTML = `<tr><td colspan="7" class="text-center py-4 text-danger"><i class="fa-solid fa-triangle-exclamation me-1"></i>লোড ব্যর্থ হয়েছে: ${err.message}</td></tr>`;
    }
  }

  function renderStudentsTable() {
    const query = (studentSearchInput.value || '').trim().toLowerCase();
    const groupFilter = studentFilterGroup.value;

    let filtered = cachedStudents.filter(s => {
      const matchQuery = String(s.roll).toLowerCase().includes(query) || (s.name && s.name.toLowerCase().includes(query));
      let matchFilter = true;
      if (groupFilter === 'pending') {
        matchFilter = s.status === 'pending';
      } else if (groupFilter === 'approved') {
        matchFilter = s.status !== 'pending';
      } else if (groupFilter !== 'all') {
        matchFilter = s.group === groupFilter;
      }
      return matchQuery && matchFilter;
    });

    studentCountBadge.textContent = `${filtered.length} জন`;

    if (filtered.length === 0) {
      studentTableBody.innerHTML = `<tr><td colspan="7" class="text-center py-4 text-muted"><i class="fa-regular fa-folder-open me-1 fs-5"></i> কোনো শিক্ষার্থী পাওয়া যায়নি।</td></tr>`;
      return;
    }

    studentTableBody.innerHTML = filtered.map((s, idx) => {
      let groupBadge = '<span class="badge bg-primary rounded-pill px-2 py-1">Science</span>';
      if (s.group === 'arts') groupBadge = '<span class="badge bg-warning text-dark rounded-pill px-2 py-1">Arts</span>';
      if (s.group === 'commerce') groupBadge = '<span class="badge bg-success rounded-pill px-2 py-1">Commerce</span>';

      const isPending = s.status === 'pending';
      const statusBadge = isPending
        ? '<span class="badge bg-warning text-dark rounded-pill px-2 py-1"><i class="fa-solid fa-clock me-1"></i>পেন্ডিং</span>'
        : '<span class="badge bg-success bg-opacity-10 text-success border border-success border-opacity-25 rounded-pill px-2 py-1"><i class="fa-solid fa-check me-1"></i>অনুমোদিত</span>';

      const regDate = s.registeredAt ? new Date(s.registeredAt).toLocaleDateString('bn-BD', {
        year: 'numeric', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit'
      }) : 'পূর্বনির্ধারিত';

      return `
        <tr class="${isPending ? 'table-warning bg-opacity-25' : ''}">
          <td class="text-muted small">${idx + 1}</td>
          <td>
            <div class="fw-semibold text-dark">${escapeHtml(s.name)}</div>
          </td>
          <td>
            <div class="d-flex align-items-center gap-2">
              <span class="badge bg-light text-dark border px-2 py-1 fw-bold fs-6"><code>${escapeHtml(s.roll)}</code></span>
              <button class="btn btn-outline-secondary btn-sm rounded-circle p-1 copy-roll-btn" data-roll="${escapeHtml(s.roll)}" title="রোল কপি করুন" style="width:26px; height:26px; line-height:1;">
                <i class="fa-regular fa-copy" style="font-size:0.75rem;"></i>
              </button>
            </div>
          </td>
          <td>${groupBadge}</td>
          <td>${statusBadge}</td>
          <td class="text-muted small">${regDate}</td>
          <td class="text-end">
            ${isPending ? `
              <button class="btn btn-success btn-sm rounded-pill px-2 py-1 me-1 approve-student-btn" data-roll="${escapeHtml(s.roll)}" data-name="${escapeHtml(s.name)}" title="রেজিস্ট্রেশন অনুমোদন করুন">
                <i class="fa-solid fa-check me-1"></i>অনুমোদন
              </button>
            ` : ''}
            <button class="btn btn-outline-danger btn-sm rounded-pill px-2 py-1 delete-student-btn" data-roll="${escapeHtml(s.roll)}" data-name="${escapeHtml(s.name)}" title="মুছে ফেলুন">
              <i class="fa-solid fa-trash-can me-1"></i>মুছুন
            </button>
          </td>
        </tr>
      `;
    }).join('');

    // Attach Copy Roll listeners
    document.querySelectorAll('.copy-roll-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        const roll = btn.getAttribute('data-roll');
        navigator.clipboard.writeText(roll);
        btn.innerHTML = '<i class="fa-solid fa-check text-success" style="font-size:0.75rem;"></i>';
        setTimeout(() => {
          btn.innerHTML = '<i class="fa-regular fa-copy" style="font-size:0.75rem;"></i>';
        }, 1500);
      });
    });

    // Attach Approve Student listeners
    document.querySelectorAll('.approve-student-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        const roll = btn.getAttribute('data-roll');
        const name = btn.getAttribute('data-name');
        approveStudent(roll, name);
      });
    });

    // Attach Delete Student listeners
    document.querySelectorAll('.delete-student-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        const roll = btn.getAttribute('data-roll');
        const name = btn.getAttribute('data-name');
        deleteStudent(roll, name);
      });
    });
  }

  // Live filter / search listeners
  studentSearchInput.addEventListener('input', renderStudentsTable);
  studentFilterGroup.addEventListener('change', renderStudentsTable);

  // Approve Pending Student
  async function approveStudent(roll, name) {
    if (!confirm(`আপনি কি "${name}" (রোল: ${roll})-এর আবেদন অনুমোদন করতে চান? অনুমোদন করলে শিক্ষার্থী সরাসরি পরীক্ষা পোর্টালে লগইন করতে পারবেন।`)) {
      return;
    }

    try {
      const res = await fetch(`/api/admin/students/${encodeURIComponent(roll)}/approve`, {
        method: 'PUT'
      });
      const data = await res.json();
      if (!res.ok || !data.success) {
        throw new Error(data.message || 'অনুমোদন করা সম্ভব হয়নি।');
      }

      showAlert(studentAlert, `🎉 ${data.message}`, 'success');
      await loadStudents();
      loadStats();
    } catch (err) {
      alert(`ত্রুটি: ${err.message}`);
    }
  }

  // Add New Student Form Handler (Enforces strict unique roll)
  addStudentForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    hideAlert(studentAlert);

    const name = document.getElementById('newStudentName').value.trim();
    const roll = document.getElementById('newStudentRoll').value.trim();
    const group = document.getElementById('newStudentGroup').value;

    if (!name || !roll || !group) {
      showAlert(studentAlert, 'নাম, ইউনিক রোল এবং গ্রুপ সবগুলো তথ্য পূরণ করুন।', 'warning');
      return;
    }

    const btn = document.getElementById('addStudentSubmitBtn');
    btn.disabled = true;
    btn.innerHTML = '<span class="spinner-border spinner-border-sm me-1"></span> যুক্ত হচ্ছে...';

    try {
      const res = await fetch('/api/admin/students', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ roll, name, group })
      });

      const data = await res.json();

      if (!res.ok || !data.success) {
        throw new Error(data.message || 'শিক্ষার্থী যুক্ত করা যায়নি।');
      }

      showAlert(studentAlert, `🎉 ${data.message}`, 'success');
      addStudentForm.reset();

      // Refresh list & stats
      await loadStudents();
      loadStats();

    } catch (err) {
      showAlert(studentAlert, `<i class="fa-solid fa-triangle-exclamation me-1"></i> ${err.message}`, 'danger');
    } finally {
      btn.disabled = false;
      btn.innerHTML = '<i class="fa-solid fa-user-plus me-1"></i> নতুন শিক্ষার্থী যুক্ত করুন';
    }
  });

  // Delete Student
  async function deleteStudent(roll, name) {
    if (!confirm(`আপনি কি নিশ্চিত যে রোল "${roll}" (${name})-কে শিক্ষার্থী তালিকা থেকে মুছে ফেলতে চান?`)) {
      return;
    }

    try {
      const res = await fetch(`/api/admin/students/${encodeURIComponent(roll)}`, {
        method: 'DELETE'
      });

      const data = await res.json();
      if (!res.ok || !data.success) {
        throw new Error(data.message || 'মুছে ফেলা সম্ভব হয়নি।');
      }

      showAlert(studentAlert, `শিক্ষার্থী রোল "${roll}" সফলভাবে মুছে ফেলা হয়েছে।`, 'info');
      await loadStudents();
      loadStats();
    } catch (err) {
      alert(`ত্রুটি: ${err.message}`);
    }
  }

  // 4. QUESTION & EXAM MANAGEMENT
  async function loadExams() {
    try {
      const res = await fetch('/api/admin/exams');
      const data = await res.json();

      if (data.success) {
        cachedExams = data.exams || [];
        populateExamSelect();
      }
    } catch (err) {
      console.error('Failed to load exams', err);
    }
  }

  function populateExamSelect() {
    if (cachedExams.length === 0) {
      examSelect.innerHTML = '<option value="">কোনো পরীক্ষা সক্রিয় নেই</option>';
      examQuestionsContainer.innerHTML = '<div class="alert alert-info">কোনো পরীক্ষা পাওয়া যায়নি। নতুন পরীক্ষা তৈরি করুন।</div>';
      return;
    }

    const previousVal = examSelect.value;

    examSelect.innerHTML = cachedExams.map(ex => {
      const groupEmoji = ex.group === 'science' ? '🔬' : ex.group === 'arts' ? '🎨' : '📊';
      const qCount = (ex.questions || []).length;
      return `<option value="${ex.id}">${groupEmoji} [${ex.group.toUpperCase()}] ${escapeHtml(ex.title)} (${qCount}টি প্রশ্ন)</option>`;
    }).join('');

    if (previousVal && cachedExams.some(e => e.id === previousVal)) {
      examSelect.value = previousVal;
    } else {
      examSelect.value = cachedExams[0].id;
    }

    currentSelectedExamId = examSelect.value;
    const importTargetExamSelect = document.getElementById('importTargetExamSelect');
    if (importTargetExamSelect) {
      importTargetExamSelect.innerHTML = examSelect.innerHTML;
      importTargetExamSelect.value = currentSelectedExamId;
    }
    renderSelectedExamQuestions();
  }

  examSelect.addEventListener('change', () => {
    currentSelectedExamId = examSelect.value;
    const importTargetExamSelect = document.getElementById('importTargetExamSelect');
    if (importTargetExamSelect) {
      importTargetExamSelect.innerHTML = examSelect.innerHTML;
      importTargetExamSelect.value = currentSelectedExamId;
    }
    renderSelectedExamQuestions();
  });

  examSelect.addEventListener('change', () => {
    currentSelectedExamId = examSelect.value;
    const importTargetExamSelect = document.getElementById('importTargetExamSelect');
    if (importTargetExamSelect) {
      importTargetExamSelect.value = currentSelectedExamId;
    }
    renderSelectedExamQuestions();
  });
    }

    const previousVal = examSelect.value;

    examSelect.innerHTML = cachedExams.map(ex => {
      const groupEmoji = ex.group === 'science' ? '🔬' : ex.group === 'arts' ? '🎨' : '📊';
      const qCount = (ex.questions || []).length;
      return `<option value="${ex.id}">${groupEmoji} [${ex.group.toUpperCase()}] ${escapeHtml(ex.title)} (${qCount}টি প্রশ্ন)</option>`;
    }).join('');

    if (previousVal && cachedExams.some(e => e.id === previousVal)) {
      examSelect.value = previousVal;
    } else {
      examSelect.value = cachedExams[0].id;
    }

    currentSelectedExamId = examSelect.value;
    renderSelectedExamQuestions();
  }

  examSelect.addEventListener('change', () => {
    currentSelectedExamId = examSelect.value;
    renderSelectedExamQuestions();
  });

  // Render questions of chosen exam
  function renderSelectedExamQuestions() {
    const exam = cachedExams.find(e => e.id === currentSelectedExamId);
    if (!exam) {
      examQuestionsContainer.innerHTML = '<div class="alert alert-warning">পরীক্ষা নির্বাচন করুন।</div>';
      return;
    }

    // Update Badge
    const groupName = exam.group === 'science' ? 'বিজ্ঞান' : exam.group === 'arts' ? 'মানবিক' : 'ব্যবসায় শিক্ষা';
    selectedExamBadge.innerHTML = `
      <span class="badge bg-primary rounded-pill px-3 py-1 me-1">${groupName} বিভাগ</span>
      <span class="badge bg-light text-dark border rounded-pill px-3 py-1 me-1"><i class="fa-regular fa-clock me-1"></i>${exam.durationMinutes} মিনিট</span>
      <span class="badge bg-light text-dark border rounded-pill px-3 py-1"><i class="fa-solid fa-trophy text-warning me-1"></i>পূর্ণমান: ${exam.totalMarks}</span>
    `;

    const questions = exam.questions || [];
    examQuestionCount.textContent = `${questions.length}টি প্রশ্ন রয়েছে`;

    if (questions.length === 0) {
      examQuestionsContainer.innerHTML = `
        <div class="text-center py-5 border rounded-4 bg-light">
          <div class="text-muted fs-2 mb-2"><i class="fa-regular fa-file-lines"></i></div>
          <h6 class="fw-bold">এই পরীক্ষায় এখনো কোনো প্রশ্ন যুক্ত করা হয়নি।</h6>
          <p class="text-muted small">নিচের ফর্ম ব্যবহার করে আপনার প্রথম প্রশ্ন ও ৪টি অপশন যোগ করুন।</p>
        </div>
      `;
      return;
    }

    examQuestionsContainer.innerHTML = questions.map((q, idx) => {
      const optLetters = ['ক', 'খ', 'গ', 'ঘ'];
      return `
        <div class="card border rounded-4 p-3 p-md-4 shadow-sm bg-white mb-3">
          <div class="d-flex justify-content-between align-items-start mb-2">
            <span class="badge bg-dark rounded-pill px-3 py-1">প্রশ্ন ${idx + 1}</span>
            <button class="btn btn-outline-danger btn-sm rounded-pill px-3 delete-question-btn" data-exam-id="${exam.id}" data-q-id="${q.id}">
              <i class="fa-solid fa-trash-can me-1"></i> প্রশ্ন মুছুন
            </button>
          </div>

          <h6 class="fw-bold text-dark mb-3 lh-base">${escapeHtml(q.question)}</h6>

          <!-- Options Grid -->
          <div class="row g-2 mb-3">
            ${(q.options || []).map((opt, optIdx) => {
              const isCorrect = Number(q.correctIndex) === optIdx;
              return `
                <div class="col-md-6">
                  <div class="p-2 px-3 rounded-3 border d-flex align-items-center gap-2 ${isCorrect ? 'bg-success bg-opacity-10 border-success text-success fw-bold' : 'bg-light text-dark'}">
                    <span class="badge bg-white text-dark border rounded-circle" style="width:24px; height:24px; line-height:16px;">${optLetters[optIdx] || optIdx + 1}</span>
                    <span class="flex-grow-1 small">${escapeHtml(opt)}</span>
                    ${isCorrect ? '<i class="fa-solid fa-circle-check text-success" title="সঠিক উত্তর"></i>' : ''}
                  </div>
                </div>
              `;
            }).join('')}
          </div>

          <!-- Explanation -->
          <div class="bg-light p-2 px-3 rounded-3 border small text-muted">
            <strong class="text-primary"><i class="fa-solid fa-lightbulb me-1"></i>ব্যাখ্যা:</strong> ${escapeHtml(q.explanation || 'ব্যাখ্যা দেওয়া নেই')}
          </div>
        </div>
      `;
    }).join('');

    // Attach Delete Question buttons
    document.querySelectorAll('.delete-question-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        const examId = btn.getAttribute('data-exam-id');
        const qId = btn.getAttribute('data-q-id');
        deleteQuestion(examId, qId);
      });
    });
  }

  // Add Question Form Handler
  addQuestionForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    hideAlert(questionAlert);

    if (!currentSelectedExamId) {
      showAlert(questionAlert, 'প্রথমে একটি পরীক্ষা নির্বাচন করুন।', 'warning');
      return;
    }

    const question = document.getElementById('qText').value.trim();
    const opt0 = document.getElementById('qOpt0').value.trim();
    const opt1 = document.getElementById('qOpt1').value.trim();
    const opt2 = document.getElementById('qOpt2').value.trim();
    const opt3 = document.getElementById('qOpt3').value.trim();
    const correctIndex = parseInt(document.getElementById('qCorrectIndex').value);
    const explanation = document.getElementById('qExplanation').value.trim();

    if (!question || !opt0 || !opt1 || !opt2 || !opt3) {
      showAlert(questionAlert, 'প্রশ্ন এবং ৪টি অপশন অবশ্যই পূরণ করতে হবে।', 'warning');
      return;
    }

    const btn = document.getElementById('addQuestionSubmitBtn');
    btn.disabled = true;
    btn.innerHTML = '<span class="spinner-border spinner-border-sm me-1"></span> প্রশ্ন যোগ হচ্ছে...';

    try {
      const res = await fetch(`/api/admin/exams/${currentSelectedExamId}/questions`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          question,
          options: [opt0, opt1, opt2, opt3],
          correctIndex,
          correctAnswer: correctIndex,
          explanation
        })
      });

      const data = await res.json();
      if (!res.ok || !data.success) {
        throw new Error(data.message || 'প্রশ্ন যোগ করা যায়নি।');
      }

      showAlert(questionAlert, '🎉 প্রশ্ন সফলভাবে সংযুক্ত করা হয়েছে!', 'success');

      // Clear question inputs
      document.getElementById('qText').value = '';
      document.getElementById('qOpt0').value = '';
      document.getElementById('qOpt1').value = '';
      document.getElementById('qOpt2').value = '';
      document.getElementById('qOpt3').value = '';
      document.getElementById('qExplanation').value = '';

      // Refresh Exams and view
      await loadExams();
      loadStats();

    } catch (err) {
      showAlert(questionAlert, `<i class="fa-solid fa-triangle-exclamation me-1"></i> ${err.message}`, 'danger');
    } finally {
      btn.disabled = false;
      btn.innerHTML = '<i class="fa-solid fa-plus-circle me-1"></i> প্রশ্ন যুক্ত করুন';
    }
  });

  // Delete Question
  async function deleteQuestion(examId, qId) {
    if (!confirm('আপনি কি এই প্রশ্নটি মুছে ফেলতে চান?')) return;

    try {
      const res = await fetch(`/api/admin/exams/${examId}/questions/${qId}`, {
        method: 'DELETE'
      });

      const data = await res.json();
      if (!res.ok || !data.success) {
        throw new Error(data.message || 'প্রশ্ন মুছা যায়নি।');
      }

      showAlert(questionAlert, 'প্রশ্নটি মুছে ফেলা হয়েছে।', 'info');
      await loadExams();
      loadStats();
    } catch (err) {
      alert(`ত্রুটি: ${err.message}`);
    }
  }

  // Create New Exam Form Handler
  createExamForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    hideAlert(createExamAlert);

    const group = document.getElementById('newExamGroup').value;
    const title = document.getElementById('newExamTitle').value.trim();
    const subject = document.getElementById('newExamSubject').value.trim();
    const durationMinutes = parseInt(document.getElementById('newExamDuration').value) || 15;
    const passMarks = parseInt(document.getElementById('newExamPassMarks').value) || 5;
    const negativeMark = parseFloat(document.getElementById('newExamNegativeMark').value) || 0.25;
    const description = document.getElementById('newExamDesc').value.trim();

    if (!title || !subject || !group) {
      showAlert(createExamAlert, 'পরীক্ষার শিরোনাম, বিভাগ ও বিষয় পূরণ করুন।', 'warning');
      return;
    }

    const btn = document.getElementById('createExamSubmitBtn');
    btn.disabled = true;
    btn.innerHTML = '<span class="spinner-border spinner-border-sm me-1"></span> তৈরি হচ্ছে...';

    try {
      const res = await fetch('/api/admin/exams', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          group,
          title,
          subject,
          durationMinutes,
          passMarks,
          negativeMark,
          description
        })
      });

      const data = await res.json();
      if (!res.ok || !data.success) {
        throw new Error(data.message || 'নতুন পরীক্ষা তৈরি ব্যর্থ হয়েছে।');
      }

      showAlert(createExamAlert, '🎉 নতুন মডেল টেস্ট পরীক্ষা সফলভাবে তৈরি করা হয়েছে! এখন এতে প্রশ্ন যুক্ত করতে পারেন।', 'success');
      createExamForm.reset();

      // Close modal
      const modalEl = document.getElementById('createExamModal');
      const bsModal = bootstrap.Modal.getInstance(modalEl);
      if (bsModal) {
        setTimeout(() => bsModal.hide(), 1200);
      }

      await loadExams();
      // Select the new exam
      if (data.exam && data.exam.id) {
        examSelect.value = data.exam.id;
        currentSelectedExamId = data.exam.id;
        renderSelectedExamQuestions();
      }
      loadStats();

    } catch (err) {
      showAlert(createExamAlert, `<i class="fa-solid fa-triangle-exclamation me-1"></i> ${err.message}`, 'danger');
    } finally {
      btn.disabled = false;
      btn.innerHTML = '<i class="fa-solid fa-folder-plus me-1"></i> পরীক্ষা সংরক্ষণ করুন';
    }
  });

  // 5. SUBMISSIONS AUDIT
  async function loadSubmissions() {
    try {
      submissionsTableBody.innerHTML = `<tr><td colspan="7" class="text-center py-4 text-muted"><div class="spinner-border spinner-border-sm text-primary me-2"></div>ফলাফল ডাটা লোড হচ্ছে...</td></tr>`;

      const res = await fetch('/api/admin/submissions');
      const data = await res.json();

      if (data.success) {
        const subs = data.submissions || [];
        submissionsCountBadge.textContent = `${subs.length}টি সাবমিশন`;

        if (subs.length === 0) {
          submissionsTableBody.innerHTML = `<tr><td colspan="7" class="text-center py-4 text-muted">এখনো কোনো শিক্ষার্থী পরীক্ষা জমা দেয়নি।</td></tr>`;
          return;
        }

        submissionsTableBody.innerHTML = subs.map((s, idx) => {
          const subDate = s.submittedAt ? new Date(s.submittedAt).toLocaleString('bn-BD') : 'N/A';
          const min = Math.floor((s.timeTakenSeconds || 0) / 60);
          const sec = (s.timeTakenSeconds || 0) % 60;

          return `
            <tr>
              <td class="text-muted small">${idx + 1}</td>
              <td>
                <span class="badge bg-light text-dark border fw-bold"><code>${escapeHtml(s.roll)}</code></span>
              </td>
              <td>
                <div class="fw-semibold text-dark">${escapeHtml(s.name)}</div>
              </td>
              <td class="small text-muted">${escapeHtml(s.examTitle)}</td>
              <td>
                <span class="badge bg-primary px-2 py-1 fs-6">${s.score} / ${s.totalMarks}</span>
                ${s.isPassed ? '<span class="badge bg-success bg-opacity-10 text-success ms-1">পাস</span>' : '<span class="badge bg-danger bg-opacity-10 text-danger ms-1">ফেল</span>'}
              </td>
              <td class="small text-muted">${min}m ${sec}s</td>
              <td class="small text-muted">${subDate}</td>
            </tr>
          `;
        }).join('');
      }
    } catch (err) {
      submissionsTableBody.innerHTML = `<tr><td colspan="7" class="text-center py-3 text-danger"><i class="fa-solid fa-triangle-exclamation me-1"></i>${err.message}</td></tr>`;
    }
  }
// ==========================================
  // GOOGLE FORM & DRIVE QUESTION IMPORTER
  // ==========================================
  let stagedImportQuestions = [];

  const importAlert = document.getElementById('importAlert');
  const parsedPreviewContainer = document.getElementById('parsedQuestionsPreviewContainer');
  const parsedQuestionsList = document.getElementById('parsedQuestionsList');
  const parsedQuestionsBadge = document.getElementById('parsedQuestionsBadge');
  const btnCommitBulkQuestions = document.getElementById('btnCommitBulkQuestions');
  const importModalEl = document.getElementById('googleFormImportModal');

  // Method 1: Fetch Google Form by URL
  document.getElementById('btnFetchGForm')?.addEventListener('click', async () => {
    const urlInput = document.getElementById('gformUrlInput');
    const url = urlInput ? urlInput.value.trim() : '';
    const btn = document.getElementById('btnFetchGForm');

    hideAlert(importAlert);
    if (!url) {
      showAlert(importAlert, 'অনুগ্রহ করে একটি সঠিক Google Form লিংক প্রবেশ করান।', 'warning');
      return;
    }

    btn.disabled = true;
    btn.innerHTML = '<span class="spinner-border spinner-border-sm me-1"></span> প্রশ্ন সংগ্রহ করা হচ্ছে...';

    try {
      const res = await fetch('/api/admin/parse-google-form', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url })
      });

      const data = await res.json();
      if (!res.ok || !data.success) {
        throw new Error(data.message || 'Google Form থেকে প্রশ্ন সংগ্রহ করা যায়নি।');
      }

      showAlert(importAlert, `✅ Google Form থেকে সফলভাবে <strong>${data.questions.length}</strong>টি প্রশ্ন উদ্ধার করা হয়েছে! নিচের তালিকায় দেখে নিশ্চিত করুন।`, 'success');
      renderImportPreview(data.questions);
    } catch (err) {
      showAlert(importAlert, `<i class="fa-solid fa-triangle-exclamation me-1"></i> ${err.message}`, 'danger');
    } finally {
      btn.disabled = false;
      btn.innerHTML = '<i class="fa-solid fa-magnifying-glass me-1"></i> ফর্ম থেকে প্রশ্ন আনুন';
    }
  });

  // Method 2: Parse Raw Text / Copy-Pasted Quiz
  document.getElementById('btnParseRawText')?.addEventListener('click', async () => {
    const rawTextInput = document.getElementById('gformRawTextInput');
    const rawText = rawTextInput ? rawTextInput.value.trim() : '';
    const btn = document.getElementById('btnParseRawText');

    hideAlert(importAlert);
    if (!rawText) {
      showAlert(importAlert, 'প্রশ্ন এবং অপশনগুলো টেক্সট বক্সে পেস্ট করুন।', 'warning');
      return;
    }

    btn.disabled = true;
    btn.innerHTML = '<span class="spinner-border spinner-border-sm me-1"></span> পার্স করা হচ্ছে...';

    try {
      const res = await fetch('/api/admin/parse-google-form', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ rawText })
      });

      const data = await res.json();
      if (!res.ok || !data.success) {
        throw new Error(data.message || 'টেক্সট থেকে প্রশ্ন পার্স করা যায়নি।');
      }

      showAlert(importAlert, `✅ টেক্সট থেকে সফলভাবে <strong>${data.questions.length}</strong>টি প্রশ্ন উদ্ধার করা হয়েছে!`, 'success');
      renderImportPreview(data.questions);
    } catch (err) {
      showAlert(importAlert, `<i class="fa-solid fa-triangle-exclamation me-1"></i> ${err.message}`, 'danger');
    } finally {
      btn.disabled = false;
      btn.innerHTML = '<i class="fa-solid fa-wand-magic-sparkles me-1"></i> প্রশ্নগুলো পার্স করুন';
    }
  });

  // Method 3: File Upload (CSV, TXT, JSON, HTML)
  document.getElementById('btnProcessFile')?.addEventListener('click', () => {
    const fileInput = document.getElementById('gformFileInput');
    const file = fileInput?.files?.[0];
    const btn = document.getElementById('btnProcessFile');

    hideAlert(importAlert);
    if (!file) {
      showAlert(importAlert, 'অনুগ্রহ করে একটি ফাইল নির্বাচন করুন।', 'warning');
      return;
    }

    btn.disabled = true;
    btn.innerHTML = '<span class="spinner-border spinner-border-sm me-1"></span> ফাইল পড়া হচ্ছে...';

    const reader = new FileReader();
    reader.onload = async (e) => {
      const content = e.target.result;
      try {
        let payload = {};
        if (file.name.endsWith('.html') || file.name.endsWith('.htm')) {
          payload = { html: content };
        } else if (file.name.endsWith('.json')) {
          try {
            const parsedJson = JSON.parse(content);
            if (Array.isArray(parsedJson)) {
              payload = { questions: parsedJson };
            } else {
              payload = { rawText: content };
            }
          } catch {
            payload = { rawText: content };
          }
        } else {
          payload = { rawText: content };
        }

        const res = await fetch('/api/admin/parse-google-form', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload)
        });

        const data = await res.json();
        if (!res.ok || !data.success) {
          throw new Error(data.message || 'ফাইল থেকে প্রশ্ন বের করা যায়নি।');
        }

        showAlert(importAlert, `✅ ফাইল থেকে সফলভাবে <strong>${data.questions.length}</strong>টি প্রশ্ন উদ্ধার করা হয়েছে!`, 'success');
        renderImportPreview(data.questions);
      } catch (err) {
        showAlert(importAlert, `<i class="fa-solid fa-triangle-exclamation me-1"></i> ${err.message}`, 'danger');
      } finally {
        btn.disabled = false;
        btn.innerHTML = '<i class="fa-solid fa-upload me-1"></i> ফাইল থেকে প্রশ্ন আনুন';
      }
    };

    reader.onerror = () => {
      showAlert(importAlert, 'ফাইল পড়তে ত্রুটি হয়েছে।', 'danger');
      btn.disabled = false;
      btn.innerHTML = '<i class="fa-solid fa-upload me-1"></i> ফাইল থেকে প্রশ্ন আনুন';
    };

    reader.readAsText(file);
  });

  // Render questions preview inside modal
  function renderImportPreview(questions) {
    stagedImportQuestions = questions || [];
    if (stagedImportQuestions.length === 0) {
      parsedPreviewContainer?.classList.add('d-none');
      return;
    }

    parsedPreviewContainer?.classList.remove('d-none');
    if (parsedQuestionsBadge) {
      parsedQuestionsBadge.textContent = `${stagedImportQuestions.length}টি প্রশ্ন`;
    }

    const optLetters = ['ক', 'খ', 'গ', 'ঘ'];

    parsedQuestionsList.innerHTML = stagedImportQuestions.map((q, qIndex) => {
      const optionsHtml = (q.options || []).map((opt, optIndex) => {
        const isChecked = (q.correctIndex || 0) === optIndex;
        return `
          <div class="col-sm-6">
            <div class="form-check p-2 border rounded-3 bg-white">
              <input class="form-check-input ms-0 me-2 stage-correct-radio" type="radio" 
                     name="stage_q_correct_${qIndex}" 
                     id="stage_q_${qIndex}_opt_${optIndex}" 
                     data-q-idx="${qIndex}" 
                     value="${optIndex}" ${isChecked ? 'checked' : ''}>
              <label class="form-check-label small fw-semibold text-dark d-flex align-items-center" for="stage_q_${qIndex}_opt_${optIndex}">
                <span class="badge bg-light text-primary border me-1">${optLetters[optIndex] || optIndex + 1}</span>
                <span>${escapeHtml(opt)}</span>
              </label>
            </div>
          </div>
        `;
      }).join('');

      return `
        <div class="card p-3 mb-3 border bg-light rounded-3 stage-q-card" id="stage_card_${qIndex}">
          <div class="d-flex justify-content-between align-items-start mb-2">
            <span class="badge bg-primary rounded-pill px-3 py-1">প্রশ্ন ${qIndex + 1}</span>
            <button type="button" class="btn btn-outline-danger btn-sm rounded-pill px-2 py-0 remove-stage-q-btn" data-q-idx="${qIndex}" title="এই প্রশ্নটি বাদ দিন">
              <i class="fa-solid fa-xmark"></i> বাদ দিন
            </button>
          </div>
          <div class="fw-bold text-dark mb-2">${escapeHtml(q.question)}</div>
          <div class="row g-2 mb-2">
            ${optionsHtml}
          </div>
          ${q.explanation ? `<div class="small text-muted fst-italic"><i class="fa-solid fa-circle-info me-1 text-primary"></i>${escapeHtml(q.explanation)}</div>` : ''}
        </div>
      `;
    }).join('');

    // Attach listener to radio buttons to update correctIndex
    parsedQuestionsList.querySelectorAll('.stage-correct-radio').forEach(radio => {
      radio.addEventListener('change', (e) => {
        const qIdx = parseInt(e.target.getAttribute('data-q-idx'), 10);
        const optIdx = parseInt(e.target.value, 10);
        if (stagedImportQuestions[qIdx]) {
          stagedImportQuestions[qIdx].correctIndex = optIdx;
        }
      });
    });

    // Attach listener to remove individual question
    parsedQuestionsList.querySelectorAll('.remove-stage-q-btn').forEach(btn => {
      btn.addEventListener('click', (e) => {
        const qIdx = parseInt(e.currentTarget.getAttribute('data-q-idx'), 10);
        stagedImportQuestions.splice(qIdx, 1);
        renderImportPreview(stagedImportQuestions);
      });
    });

    // Scroll to preview container smoothly
    parsedPreviewContainer.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  }

  // Commit all staged questions to target exam
  btnCommitBulkQuestions?.addEventListener('click', async () => {
    const targetExamSelect = document.getElementById('importTargetExamSelect');
    const targetExamId = targetExamSelect ? targetExamSelect.value : currentSelectedExamId;

    hideAlert(importAlert);

    if (!targetExamId) {
      showAlert(importAlert, 'অনুগ্রহ করে একটি মডেল টেস্ট নির্বাচন করুন।', 'warning');
      return;
    }

    if (!stagedImportQuestions || stagedImportQuestions.length === 0) {
      showAlert(importAlert, 'যুক্ত করার মতো কোনো প্রশ্ন নেই।', 'warning');
      return;
    }

    btnCommitBulkQuestions.disabled = true;
    btnCommitBulkQuestions.innerHTML = '<span class="spinner-border spinner-border-sm me-1"></span> মডেল টেস্টে যুক্ত হচ্ছে...';

    try {
      const res = await fetch(`/api/admin/exams/${targetExamId}/bulk-questions`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ questions: stagedImportQuestions })
      });

      const data = await res.json();
      if (!res.ok || !data.success) {
        throw new Error(data.message || 'প্রশ্ন যুক্ত করতে সমস্যা হয়েছে।');
      }

      showAlert(importAlert, `🎉 <strong>অভিনন্দন!</strong> ${data.addedCount}টি প্রশ্ন সফলভাবে নির্বাচিত মডেল টেস্টে যুক্ত করা হয়েছে!`, 'success');

      // Clear staged questions and hide preview
      stagedImportQuestions = [];
      setTimeout(() => {
        parsedPreviewContainer?.classList.add('d-none');
      }, 1000);

      // Refresh Exams in admin UI
      await loadExams();
      if (examSelect) {
        examSelect.value = targetExamId;
        currentSelectedExamId = targetExamId;
        renderSelectedExamQuestions();
      }
      loadStats();

      // Close modal after 1.8s
      setTimeout(() => {
        if (importModalEl) {
          const bsModal = bootstrap.Modal.getInstance(importModalEl);
          if (bsModal) bsModal.hide();
        }
      }, 1800);

    } catch (err) {
      showAlert(importAlert, `<i class="fa-solid fa-triangle-exclamation me-1"></i> ${err.message}`, 'danger');
    } finally {
      btnCommitBulkQuestions.disabled = false;
      btnCommitBulkQuestions.innerHTML = '<i class="fa-solid fa-check-double me-1"></i> এই মডেল টেস্টে যুক্ত করুন';
    }
  });
  // Refresh All Button
  document.getElementById('refreshAllBtn')?.addEventListener('click', () => {
    loadAllAdminData();
  });

  // Helper Alert functions
  function showAlert(targetEl, message, type = 'info') {
    if (!targetEl) return;
    targetEl.className = `alert alert-${type} py-2 px-3 small rounded-3 mb-3`;
    targetEl.innerHTML = message;
    targetEl.classList.remove('d-none');
  }

  function hideAlert(targetEl) {
    if (!targetEl) return;
    targetEl.className = 'alert d-none';
    targetEl.innerHTML = '';
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

  // Initialize
  checkAuth();
});
