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
      loadAllData();
    } else {
      adminAuthSection.classList.remove('d-none');
      adminDashboardSection.classList.add('d-none');
    }
  }

  // Handle Admin Login Submit
  adminLoginForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    hideAlert(adminLoginAlert);
    const password = adminPassInput.value.trim();

    if (!password) {
      showAlert(adminLoginAlert, 'অনুগ্রহ করে এডমিন পাসওয়ার্ড প্রদান করুন।', 'danger');
      return;
    }

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
      adminPassInput.value = '';
      checkAuth();
    } catch (err) {
      showAlert(adminLoginAlert, err.message, 'danger');
    }
  });

  // Handle Admin Logout
  logoutBtn.addEventListener('click', () => {
    if (confirm('আপনি কি এডমিন প্যানেল থেকে লগআউট করতে চান?')) {
      sessionStorage.removeItem('nu_admin_token');
      checkAuth();
    }
  });

  // Load All Admin Data
  async function loadAllData() {
    await Promise.all([
      loadStats(),
      loadStudents(),
      loadExams(),
      loadSubmissions()
    ]);
  }

  // Global Refresh Button
  const refreshAllBtn = document.getElementById('refreshAllBtn');
  if (refreshAllBtn) {
    refreshAllBtn.addEventListener('click', () => {
      refreshAllBtn.innerHTML = '<span class="spinner-border spinner-border-sm me-1"></span> রিফ্রেশ হচ্ছে...';
      refreshAllBtn.disabled = true;
      loadAllData().finally(() => {
        refreshAllBtn.innerHTML = '<i class="fa-solid fa-arrows-rotate me-1"></i> রিফ্রেশ ডাটা';
        refreshAllBtn.disabled = false;
      });
    });
  }

  // 2. Load Stats
  async function loadStats() {
    try {
      const res = await fetch('/api/admin/stats');
      const data = await res.json();
      if (data.success && data.stats) {
        const s = data.stats;
        statsTotalStudents.textContent = s.totalStudents || 0;
        statsScienceStudents.textContent = s.scienceCount || 0;
        statsArtsStudents.textContent = s.artsCount || 0;
        statsCommerceStudents.textContent = s.commerceCount || 0;
        statsTotalExams.textContent = s.totalExams || 0;
        statsTotalQuestions.textContent = s.totalQuestions || 0;
      }
    } catch (err) {
      console.error('Failed to load stats:', err);
    }
  }

  // 3. STUDENT MANAGEMENT
  async function loadStudents() {
    try {
      studentTableBody.innerHTML = `<tr><td colspan="7" class="text-center py-4 text-muted"><div class="spinner-border spinner-border-sm text-primary me-2"></div>শিক্ষার্থীর তালিকা লোড হচ্ছে...</td></tr>`;
      const res = await fetch('/api/admin/students');
      const data = await res.json();
      if (data.success) {
        cachedStudents = data.students || [];
        renderStudentsTable();
      }
    } catch (err) {
      studentTableBody.innerHTML = `<tr><td colspan="7" class="text-center py-4 text-danger">শিক্ষার্থীর তথ্য লোড করতে ব্যর্থ হয়েছে।</td></tr>`;
    }
  }

  function renderStudentsTable() {
    const query = studentSearchInput.value.toLowerCase().trim();
    const groupFilter = studentFilterGroup.value;

    const filtered = cachedStudents.filter(s => {
      const matchQuery = (s.name && s.name.toLowerCase().includes(query)) ||
                         (s.roll && s.roll.toLowerCase().includes(query));
      let matchFilter = true;
      if (groupFilter !== 'all') {
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
      if (s.group === 'arts' || s.group === 'humanities') groupBadge = '<span class="badge bg-warning text-dark rounded-pill px-2 py-1">Arts</span>';
      if (s.group === 'commerce' || s.group === 'business') groupBadge = '<span class="badge bg-success rounded-pill px-2 py-1">Commerce</span>';

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
            <div class="small text-muted">${escapeHtml(s.college || '')} ${s.district ? `(${escapeHtml(s.district)})` : ''}</div>
          </td>
          <td>
            ${s.roll ? `
              <div class="d-flex align-items-center gap-2">
                <span class="badge bg-light text-dark border px-2 py-1 fw-bold fs-6"><code>${escapeHtml(s.roll)}</code></span>
                <button class="btn btn-outline-secondary btn-sm rounded-circle p-1 copy-roll-btn" data-roll="${escapeHtml(s.roll)}" title="রোল কপি করুন" style="width:26px; height:26px; line-height:1;">
                  <i class="fa-regular fa-copy" style="font-size:0.75rem;"></i>
                </button>
              </div>
            ` : `<span class="badge bg-secondary rounded-pill px-2 py-1">বরাদ্দহীন</span>`}
          </td>
          <td>${groupBadge}</td>
          <td>${statusBadge}</td>
          <td class="text-muted small">${regDate}</td>
          <td class="text-end">
            ${isPending ? `
              <button class="btn btn-success btn-sm rounded-pill px-2 py-1 me-1 approve-student-btn" data-id="${escapeHtml(s.id || s.roll || s.transactionId)}" data-roll="${escapeHtml(s.roll || "")}" data-name="${escapeHtml(s.name)}" data-phone="${escapeHtml(s.whatsapp || "")}" title="রেজিস্ট্রেশন অনুমোদন করুন">
                <i class="fa-solid fa-check me-1"></i>অনুমোদন
              </button>
            ` : ''}
            <button class="btn btn-outline-danger btn-sm rounded-pill px-2 py-1 delete-student-btn" data-roll="${escapeHtml(s.roll || s.id)}" data-name="${escapeHtml(s.name)}" title="মুছে ফেলুন">
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
        const id = btn.getAttribute('data-id') || btn.getAttribute('data-roll');
        const name = btn.getAttribute('data-name');
        const phone = btn.getAttribute('data-phone');
        approveStudent(id, name, phone);
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

  // Approve Pending Student (Generates 8-Digit Unique Roll automatically)
  async function approveStudent(identifier, name, phone) {
    if (!confirm(`আপনি কি "${name}"-এর আবেদন অনুমোদন করতে চান? অনুমোদন করলে শিক্ষার্থীকে স্বয়ংক্রিয়ভাবে একটি ৮-ডিজিট ইউনিক রোল নম্বর বরাদ্দ করা হবে।`)) {
      return;
    }
    try {
      const targetId = identifier || 'approve';
      const res = await fetch(`/api/admin/students/${encodeURIComponent(targetId)}/approve`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ identifier: targetId, year: '27' })
      });
      const rawText = await res.text();
      let data;
      try {
        data = JSON.parse(rawText);
      } catch (e) {
        throw new Error('সার্ভার এরর: ' + rawText.slice(0, 80));
      }
      if (!res.ok || !data.success) {
        throw new Error(data.message || 'অনুমোদন করা সম্ভব হয়নি।');
      }
      const assignedRoll = data.student ? data.student.roll : '';
      showAlert(studentAlert, `🎉 ${data.message}`, 'success');

      if (phone) {
        const cleanPhone = phone.replace(/[^0-9]/g, "");
        const targetPhone = cleanPhone.startsWith("88") ? cleanPhone : "88" + cleanPhone;
        const msg = encodeURIComponent(`অভিনন্দন ${name}! 🎉\nNU Crackers ব্যাচে আপনার ভর্তি নিশ্চিত ও অনুমোদিত হয়েছে।\n\nঅফিসিয়াল ইউনিক রোল নম্বর: ${assignedRoll}\nলগইন লিংক: https://nucrackers.onrender.com/premium-login.html`);
        if (confirm(`শিক্ষার্থীকে সরাসরি WhatsApp-এ রোল পাঠাতে চান?`)) {
          window.open(`https://wa.me/${targetPhone}?text=${msg}`, '_blank');
        }
      }

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
      showAlert(studentAlert, 'অনুগ্রহ করে শিক্ষার্থীর নাম, রোল এবং বিভাগ সঠিকভাবে লিখুন।', 'danger');
      return;
    }

    try {
      const res = await fetch('/api/admin/students', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, roll, group })
      });

      const data = await res.json();
      if (!res.ok || !data.success) {
        throw new Error(data.message || 'শিক্ষার্থী যোগ করতে সমস্যা হয়েছে।');
      }

      showAlert(studentAlert, `🎉 ${data.message}`, 'success');
      addStudentForm.reset();
      await loadStudents();
      loadStats();
    } catch (err) {
      showAlert(studentAlert, err.message, 'danger');
    }
  });

  // Delete Student
  async function deleteStudent(roll, name) {
    if (!confirm(`আপনি কি নিশ্চিতভাবে "${name}" (রোল: ${roll})-কে মুছে ফেলতে চান? এটি আর ফিরিয়ে আনা যাবে না।`)) {
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

      showAlert(studentAlert, data.message, 'info');
      await loadStudents();
      loadStats();
    } catch (err) {
      alert(`ত্রুটি: ${err.message}`);
    }
  }

  // 4. EXAMS & QUESTIONS MANAGEMENT
  async function loadExams() {
    try {
      const res = await fetch('/api/exams');
      const data = await res.json();
      if (data.success) {
        cachedExams = data.exams || [];
        populateExamSelect();
      }
    } catch (err) {
      console.error('Failed to load exams:', err);
    }
  }

  function populateExamSelect() {
    if (!examSelect) return;
    if (cachedExams.length === 0) {
      examSelect.innerHTML = `<option value="">কোনো পরীক্ষা উপলব্ধ নেই</option>`;
      selectedExamBadge.textContent = 'কোনো পরীক্ষা নির্বাচিত নেই';
      examQuestionsContainer.innerHTML = `<div class="text-center py-5 text-muted">প্রথমে একটি পরীক্ষা তৈরি করুন।</div>`;
      return;
    }

    examSelect.innerHTML = cachedExams.map(e => `
      <option value="${e.id}" ${e.id === currentSelectedExamId ? 'selected' : ''}>
        ${escapeHtml(e.title)} (${e.group.toUpperCase()} - ${e.type === 'model' ? 'মডেল টেস্ট' : 'বিষয়ভিত্তিক'})
      </option>
    `).join('');

    if (!currentSelectedExamId && cachedExams.length > 0) {
      currentSelectedExamId = cachedExams[0].id;
    }

    renderSelectedExamQuestions();
  }

  if (examSelect) {
    examSelect.addEventListener('change', (e) => {
      currentSelectedExamId = e.target.value;
      renderSelectedExamQuestions();
    });
  }

  function renderSelectedExamQuestions() {
    if (!currentSelectedExamId) return;
    const exam = cachedExams.find(e => e.id === currentSelectedExamId);
    if (!exam) return;

    selectedExamBadge.innerHTML = `<i class="fa-solid fa-file-lines me-1"></i> ${escapeHtml(exam.title)} (${(exam.questions || []).length}টি প্রশ্ন)`;
    const questions = exam.questions || [];
    examQuestionCount.textContent = `${questions.length}টি`;

    if (questions.length === 0) {
      examQuestionsContainer.innerHTML = `
        <div class="text-center py-5 text-muted">
          <i class="fa-regular fa-clipboard fs-1 mb-2 d-block text-secondary"></i>
          এই পরীক্ষায় এখনো কোনো প্রশ্ন যোগ করা হয়নি। বামপাশের ফর্মটি দিয়ে প্রথম প্রশ্ন যোগ করুন।
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
          <div class="row g-2 mb-3">
            ${(q.options || []).map((opt, optIdx) => {
              const isCorrect = Number(q.correctIndex) === optIdx;
              return `
                <div class="col-md-6">
                  <div class="p-2 px-3 rounded-3 border ${isCorrect ? 'bg-success bg-opacity-10 border-success text-success fw-bold' : 'bg-light text-secondary'} small d-flex align-items-center justify-content-between">
                    <span><strong>${optLetters[optIdx]}.</strong> ${escapeHtml(opt)}</span>
                    ${isCorrect ? '<i class="fa-solid fa-circle-check text-success"></i>' : ''}
                  </div>
                </div>
              `;
            }).join('')}
          </div>
          ${q.explanation ? `
            <div class="p-2 px-3 bg-info bg-opacity-10 border border-info border-opacity-25 rounded-3 text-dark small">
              <i class="fa-solid fa-lightbulb text-info me-1"></i><strong>ব্যাখ্যা:</strong> ${escapeHtml(q.explanation)}
            </div>
          ` : ''}
        </div>
      `;
    }).join('');

    document.querySelectorAll('.delete-question-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        const examId = btn.getAttribute('data-exam-id');
        const qId = btn.getAttribute('data-q-id');
        deleteQuestion(examId, qId);
      });
    });
  }

  // 5. SUBMISSIONS AUDIT
  async function loadSubmissions() {
    try {
      const res = await fetch('/api/admin/stats');
      const data = await res.json();
      if (submissionsCountBadge) {
        submissionsCountBadge.textContent = `${data.stats ? data.stats.totalSubmissions || 0 : 0}টি`;
      }
    } catch (e) {
      console.error(e);
    }
  }

  // Helper Alerts
  function showAlert(elem, msg, type) {
    if (!elem) return;
    elem.className = `alert alert-${type} py-2 small mb-3`;
    elem.innerHTML = msg;
    elem.classList.remove('d-none');
  }

  function hideAlert(elem) {
    if (!elem) return;
    elem.classList.add('d-none');
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

  // Initial Auth Gate
  checkAuth();
});
