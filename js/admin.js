// NU Crackers - Complete Admin JavaScript with Full Student Details & WhatsApp Integration
document.addEventListener('DOMContentLoaded', () => {
  const adminAuthSection = document.getElementById('adminAuthSection');
  const adminDashboardSection = document.getElementById('adminDashboardSection');
  const adminLoginForm = document.getElementById('adminLoginForm');
  const adminPassInput = document.getElementById('adminPassword');
  const adminLoginAlert = document.getElementById('adminLoginAlert');
  const logoutBtn = document.getElementById('adminLogoutBtn');

  // Stats Elements
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
  const submissionsCountBadge = document.getElementById('submissionsCountBadge');

  let cachedStudents = [];
  let cachedExams = [];
  let currentSelectedExamId = null;

  // Helper: Open WhatsApp
  function sendStudentWhatsApp(student) {
    if (!student.whatsapp) {
      alert('এই শিক্ষার্থীর কোনো WhatsApp নম্বর ডাটাবেজে পাওয়া যায়নি!');
      return;
    }
    const cleanPhone = String(student.whatsapp).replace(/[^0-9]/g, '');
    const targetPhone = cleanPhone.startsWith('88') ? cleanPhone : `88${cleanPhone}`;
    const studentName = student.name || 'শিক্ষার্থী';
    const roll = student.roll || 'প্রক্রিয়াধীন';
    const groupName = (student.group || 'science').toUpperCase();

    const text = `অভিনন্দন ${studentName}! 🎉\n` +
      `NU Crackers এডমিশন ব্যাচে আপনার ভর্তি নিশ্চিত ও অনুমোদিত হয়েছে।\n\n` +
      `📌 আপনার অফিসিয়াল ইউনিক রোল নম্বর: ${roll}\n` +
      `📌 বিভাগ: ${groupName}\n` +
      `📌 কলেজ: ${student.college || 'প্রযোজ্য নয়'}\n` +
      `🌐 পরীক্ষা পোর্টাল লগইন লিংক:\n` +
      `https://nucrackers.onrender.com/premium-login.html\n\n` +
      `(পোর্টালে আপনার নাম এবং এই রোলটি দিয়ে যেকোনো সময় পরীক্ষায় অংশ নিতে পারবেন)`;

    const url = `https://wa.me/${targetPhone}?text=${encodeURIComponent(text)}`;
    window.open(url, '_blank');
  }

  // 1. Authentication Check
  function checkAuth() {
    const token = sessionStorage.getItem('nu_admin_token');
    if (token) {
      if (adminAuthSection) adminAuthSection.classList.add('d-none');
      if (adminDashboardSection) adminDashboardSection.classList.remove('d-none');
      loadAllData();
    } else {
      if (adminAuthSection) adminAuthSection.classList.remove('d-none');
      if (adminDashboardSection) adminDashboardSection.classList.add('d-none');
    }
  }

  // Admin Login
  if (adminLoginForm) {
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
  }

  // Logout
  if (logoutBtn) {
    logoutBtn.addEventListener('click', () => {
      if (confirm('আপনি কি এডমিন প্যানেল থেকে লগআউট করতে চান?')) {
        sessionStorage.removeItem('nu_admin_token');
        checkAuth();
      }
    });
  }

  async function loadAllData() {
    await Promise.all([
      loadStats(),
      loadStudents(),
      loadExams(),
      loadSubmissions()
    ]);
  }

  // Refresh Button
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
        if (statsTotalStudents) statsTotalStudents.textContent = s.totalStudents || 0;
        if (statsScienceStudents) statsScienceStudents.textContent = s.scienceCount || 0;
        if (statsArtsStudents) statsArtsStudents.textContent = s.artsCount || 0;
        if (statsCommerceStudents) statsCommerceStudents.textContent = s.commerceCount || 0;
        if (statsTotalExams) statsTotalExams.textContent = s.totalExams || 0;
        if (statsTotalQuestions) statsTotalQuestions.textContent = s.totalQuestions || 0;
      }
    } catch (err) {
      console.error('Failed to load stats:', err);
    }
  }

  // 3. STUDENT MANAGEMENT
  async function loadStudents() {
    try {
      if (studentTableBody) {
        studentTableBody.innerHTML = `<tr><td colspan="7" class="text-center py-4 text-muted"><div class="spinner-border spinner-border-sm text-primary me-2"></div>শিক্ষার্থীর তালিকা লোড হচ্ছে...</td></tr>`;
      }
      const res = await fetch('/api/admin/students');
      const data = await res.json();
      if (data.success) {
        cachedStudents = data.students || [];
        renderStudentsTable();
      }
    } catch (err) {
      if (studentTableBody) {
        studentTableBody.innerHTML = `<tr><td colspan="7" class="text-center py-4 text-danger">শিক্ষার্থীর তথ্য লোড করতে ব্যর্থ হয়েছে।</td></tr>`;
      }
    }
  }

  function renderStudentsTable() {
    if (!studentTableBody) return;
    const query = (studentSearchInput ? studentSearchInput.value : '').toLowerCase().trim();
    const groupFilter = studentFilterGroup ? studentFilterGroup.value : 'all';

    const filtered = cachedStudents.filter(s => {
      const matchQuery = (s.name && s.name.toLowerCase().includes(query)) ||
                         (s.roll && s.roll.toLowerCase().includes(query)) ||
                         (s.college && s.college.toLowerCase().includes(query)) ||
                         (s.district && s.district.toLowerCase().includes(query)) ||
                         (s.transactionId && s.transactionId.toLowerCase().includes(query)) ||
                         (s.whatsapp && s.whatsapp.toLowerCase().includes(query));
      let matchFilter = true;
      if (groupFilter !== 'all') {
        matchFilter = s.group === groupFilter;
      }
      return matchQuery && matchFilter;
    });

    if (studentCountBadge) studentCountBadge.textContent = `${filtered.length} জন`;

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

      const studentIdentifier = s.id || s.roll || s.transactionId;

      return `
        <tr class="${isPending ? 'table-warning bg-opacity-25' : ''}">
          <td class="text-muted small">${idx + 1}</td>
          <td>
            <div class="fw-bold text-dark">${escapeHtml(s.name)}</div>
            <div class="small text-muted mb-1">${escapeHtml(s.college || 'কলেজের নাম নেই')} • ${escapeHtml(s.district || '')}</div>
            <button class="btn btn-outline-primary btn-sm rounded-pill px-2 py-0 view-details-btn" data-id="${escapeHtml(studentIdentifier)}" style="font-size: 0.75rem;">
              <i class="fa-solid fa-address-card me-1"></i>সব তথ্য দেখুন
            </button>
          </td>
          <td>
            ${s.roll ? `
              <div class="d-flex align-items-center gap-1">
                <span class="badge bg-light text-dark border px-2 py-1 fw-bold fs-6"><code>${escapeHtml(s.roll)}</code></span>
                <button class="btn btn-outline-secondary btn-sm rounded-circle p-1 copy-roll-btn" data-roll="${escapeHtml(s.roll)}" title="রোল কপি করুন" style="width:24px; height:24px; line-height:1;">
                  <i class="fa-regular fa-copy" style="font-size:0.7rem;"></i>
                </button>
              </div>
            ` : `<span class="badge bg-secondary rounded-pill px-2 py-1">বরাদ্দহীন</span>`}
          </td>
          <td>${groupBadge}</td>
          <td>${statusBadge}</td>
          <td class="text-muted small">${regDate}</td>
          <td class="text-end">
            ${isPending ? `
              <button class="btn btn-success btn-sm rounded-pill px-3 py-1 me-1 approve-student-btn" 
                      data-id="${escapeHtml(studentIdentifier)}" 
                      data-name="${escapeHtml(s.name)}" 
                      title="অনুমোদন ও রোল বরাদ্দ">
                <i class="fa-solid fa-check me-1"></i>অনুমোদন
              </button>
            ` : `
              <button class="btn btn-success btn-sm rounded-pill px-2 py-1 me-1 direct-wa-btn" 
                      data-id="${escapeHtml(studentIdentifier)}" 
                      title="WhatsApp-এ রোল পাঠান">
                <i class="fa-brands fa-whatsapp me-1"></i>WhatsApp
              </button>
            `}
            <button class="btn btn-outline-danger btn-sm rounded-pill px-2 py-1 delete-student-btn" data-id="${escapeHtml(studentIdentifier)}" data-name="${escapeHtml(s.name)}" title="মুছে ফেলুন">
              <i class="fa-solid fa-trash-can"></i>
            </button>
          </td>
        </tr>
      `;
    }).join('');

    // Attach View Details Click
    document.querySelectorAll('.view-details-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        const id = btn.getAttribute('data-id');
        const student = cachedStudents.find(s => (s.id && s.id === id) || (s.roll && s.roll === id) || (s.transactionId && s.transactionId === id));
        if (student) showStudentModal(student);
      });
    });

    // Attach Direct WhatsApp Click
    document.querySelectorAll('.direct-wa-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        const id = btn.getAttribute('data-id');
        const student = cachedStudents.find(s => (s.id && s.id === id) || (s.roll && s.roll === id) || (s.transactionId && s.transactionId === id));
        if (student) sendStudentWhatsApp(student);
      });
    });

    // Attach Copy Roll Click
    document.querySelectorAll('.copy-roll-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        const roll = btn.getAttribute('data-roll');
        navigator.clipboard.writeText(roll);
        btn.innerHTML = '<i class="fa-solid fa-check text-success"></i>';
        setTimeout(() => { btn.innerHTML = '<i class="fa-regular fa-copy"></i>'; }, 1500);
      });
    });

    // Attach Approve Student Click
    document.querySelectorAll('.approve-student-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        const id = btn.getAttribute('data-id');
        const name = btn.getAttribute('data-name');
        approveStudent(id, name);
      });
    });

    // Attach Delete Student Click
    document.querySelectorAll('.delete-student-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        const id = btn.getAttribute('data-id');
        const name = btn.getAttribute('data-name');
        deleteStudent(id, name);
      });
    });
  }

  // Show Full Details Modal (Displays College, District, bKash, TrxID, WhatsApp)
  function showStudentModal(s) {
    const modalBody = document.getElementById('studentModalBody');
    const modalWhatsAppBtn = document.getElementById('modalWhatsAppBtn');
    if (!modalBody) return;

    const isApproved = s.status !== 'pending';

    modalBody.innerHTML = `
      <div class="table-responsive">
        <table class="table table-bordered mb-0">
          <tbody>
            <tr><th class="bg-light" style="width: 40%;">শিক্ষার্থীর নাম:</th><td class="fw-bold fs-6">${escapeHtml(s.name)}</td></tr>
            <tr><th class="bg-light">ইউনিক রোল নম্বর:</th><td>${s.roll ? `<span class="badge bg-primary fs-6 px-3 py-1 font-monospace">${escapeHtml(s.roll)}</span>` : '<span class="badge bg-warning text-dark">বরাদ্দ হয়নি (পেন্ডিং)</span>'}</td></tr>
            <tr><th class="bg-light">বিভাগ / ইউনিট:</th><td class="text-uppercase fw-semibold">${escapeHtml(s.group || 'Science')}</td></tr>
            <tr><th class="bg-light">কলেজের নাম:</th><td>${escapeHtml(s.college || 'দেওয়া হয়নি')}</td></tr>
            <tr><th class="bg-light">জেলা:</th><td>${escapeHtml(s.district || 'দেওয়া হয়নি')}</td></tr>
            <tr><th class="bg-light">WhatsApp নম্বর:</th><td class="fw-bold text-success"><i class="fa-brands fa-whatsapp me-1"></i>${escapeHtml(s.whatsapp || 'দেওয়া হয়নি')}</td></tr>
            <tr><th class="bg-light">পেমেন্ট মাধ্যম:</th><td><span class="badge bg-info text-dark">${escapeHtml(s.paymentMethod || 'bKash')}</span></td></tr>
            <tr><th class="bg-light">যে নম্বর থেকে পেমেন্ট:</th><td class="font-monospace">${escapeHtml(s.paymentNumber || 'দেওয়া হয়নি')}</td></tr>
            <tr><th class="bg-light">Transaction ID (TrxID):</th><td><code class="fw-bold text-danger fs-6 bg-light px-2 py-1 rounded">${escapeHtml(s.transactionId || 'দেওয়া হয়নি')}</code></td></tr>
            <tr><th class="bg-light">রেজিস্ট্রেশনের তারিখ:</th><td>${s.registeredAt ? new Date(s.registeredAt).toLocaleString('bn-BD') : 'পূর্বনির্ধারিত'}</td></tr>
            <tr><th class="bg-light">অনুমোদনের তারিখ:</th><td>${s.approvedAt ? new Date(s.approvedAt).toLocaleString('bn-BD') : 'অনুমোদন হয়নি'}</td></tr>
            <tr><th class="bg-light">ভর্তি স্ট্যাটাস:</th><td>${isApproved ? '<span class="badge bg-success">অনুমোদিত</span>' : '<span class="badge bg-warning text-dark">পেন্ডিং</span>'}</td></tr>
          </tbody>
        </table>
      </div>
    `;

    if (modalWhatsAppBtn) {
      modalWhatsAppBtn.onclick = () => sendStudentWhatsApp(s);
    }

    const modalEl = document.getElementById('studentDetailModal');
    if (modalEl && window.bootstrap && window.bootstrap.Modal) {
      const modal = new bootstrap.Modal(modalEl);
      modal.show();
    }
  }

  // Approve Pending Student (Auto 8-Digit Roll & Instant WhatsApp)
  async function approveStudent(identifier, name) {
    if (!confirm(`আপনি কি "${name}"-এর আবেদন অনুমোদন করতে চান?\nঅনুমোদন করলে শিক্ষার্থীকে স্বয়ংক্রিয়ভাবে একটি ৮-ডিজিট ইউনিক রোল নম্বর বরাদ্দ করা হবে।`)) {
      return;
    }
    try {
      const res = await fetch(`/api/admin/students/${encodeURIComponent(identifier)}/approve`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ identifier, year: '27' })
      });

      const data = await res.json();
      if (!res.ok || !data.success) {
        throw new Error(data.message || 'অনুমোদন করা সম্ভব হয়নি।');
      }

      const assignedRoll = data.student ? data.student.roll : '';
      const approvedStudent = data.student || cachedStudents.find(s => (s.id === identifier) || (s.roll === identifier));

      showAlert(studentAlert, `🎉 ${data.message}`, 'success');

      // WhatsApp Prompt
      if (approvedStudent && approvedStudent.whatsapp) {
        if (confirm(`শিক্ষার্থীকে সরাসরি WhatsApp-এ রোল (${assignedRoll}) ও লগইন লিংক পাঠাতে চান?`)) {
          sendStudentWhatsApp(approvedStudent);
        }
      }

      await loadStudents();
      loadStats();
    } catch (err) {
      alert(`ত্রুটি: ${err.message}`);
    }
  }

  // Delete Student
  async function deleteStudent(identifier, name) {
    if (!confirm(`আপনি কি নিশ্চিতভাবে "${name}"-কে মুছে ফেলতে চান?`)) {
      return;
    }
    try {
      const res = await fetch(`/api/admin/students/${encodeURIComponent(identifier)}`, {
        method: 'DELETE'
      });
      const data = await res.json();
      if (!res.ok || !data.success) throw new Error(data.message);
      showAlert(studentAlert, data.message, 'info');
      await loadStudents();
      loadStats();
    } catch (err) {
      alert(`ত্রুটি: ${err.message}`);
    }
  }

  // Search Filter
  if (studentSearchInput) studentSearchInput.addEventListener('input', renderStudentsTable);
  if (studentFilterGroup) studentFilterGroup.addEventListener('change', renderStudentsTable);

  // Manual Student Entry Form
  if (addStudentForm) {
    addStudentForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      hideAlert(studentAlert);
      const name = document.getElementById('newStudentName').value.trim();
      const roll = document.getElementById('newStudentRoll').value.trim();
      const group = document.getElementById('newStudentGroup').value;

      if (!name || !roll || !group) {
        showAlert(studentAlert, 'অনুগ্রহ করে নাম, রোল ও বিভাগ লিখুন।', 'danger');
        return;
      }

      try {
        const res = await fetch('/api/admin/students', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ name, roll, group })
        });
        const data = await res.json();
        if (!res.ok || !data.success) throw new Error(data.message);

        showAlert(studentAlert, `🎉 ${data.message}`, 'success');
        addStudentForm.reset();
        await loadStudents();
        loadStats();
      } catch (err) {
        showAlert(studentAlert, err.message, 'danger');
      }
    });
  }

  examSelect.innerHTML = cachedExams.map(ex => {
      const isFree = ex.isFree === true || ex.batch === 'free';
      const batchTag = isFree ? '🎁 [FREE]' : '💎 [PREMIUM]';
      const groupEmoji = ex.group === 'science' ? '🔬' : ex.group === 'arts' ? '🎨' : ex.group === 'commerce' ? '📊' : '🌐';
      const qCount = (ex.questions || []).length;
      const duration = ex.durationMinutes || ex.duration || 15;
      return `<option value="${ex.id}">${batchTag} ${groupEmoji} [${ex.group.toUpperCase()}] ${escapeHtml(ex.title)} (${qCount}টি প্রশ্ন, ${duration} মি.)</option>`;
    }).join('');
  const isFree = exam.isFree === true || exam.batch === 'free';
    const batchBadge = isFree
      ? '<span class="badge bg-success rounded-pill px-3 py-2"><i class="fa-solid fa-gift me-1"></i>ফ্রি ব্যাচ (Free Live Exam)</span>'
      : '<span class="badge bg-primary rounded-pill px-3 py-2"><i class="fa-solid fa-gem me-1"></i>প্রিমিয়াম ব্যাচ</span>';
    const groupName = exam.group === 'science' ? 'বিজ্ঞান' : exam.group === 'arts' ? 'মানবিক' : exam.group === 'commerce' ? 'ব্যবসায় শিক্ষা' : 'সকল ইউনিট';
    const duration = exam.durationMinutes || exam.duration || 15;
    const marks = (exam.totalMarks !== undefined && exam.totalMarks !== null && !isNaN(exam.totalMarks))
      ? exam.totalMarks
      : ((exam.questions || []).length || 0);

    selectedExamBadge.innerHTML = `
      <div class="d-flex flex-wrap align-items-center gap-2 mt-1">
        ${batchBadge}
        <span class="badge bg-secondary rounded-pill px-3 py-2">${groupName} বিভাগ</span>
        <button type="button" class="btn btn-sm btn-outline-danger rounded-pill px-3 py-1 fw-bold shadow-sm" id="btnQuickEditDuration" title="পরীক্ষার সময় পরিবর্তন করুন">
          <i class="fa-solid fa-clock text-danger me-1"></i> টাইমার: ${duration} মিনিট <i class="fa-solid fa-pen-to-square ms-1 small"></i>
        </button>
        <span class="badge bg-light text-dark border rounded-pill px-3 py-2"><i class="fa-solid fa-trophy text-warning me-1"></i>পূর্ণমান: ${marks}</span>
      </div>
    `;
  const batch = document.getElementById('newExamBatch') ? document.getElementById('newExamBatch').value : 'premium';
    const isFree = batch === 'free';
  // Exams Management
  async function loadExams() {
    try {
      const res = await fetch('/api/exams');
      const data = await res.json();
      if (data.success) {
        cachedExams = data.exams || [];
        populateExamSelect();
      }
    } catch (err) {
      console.error(err);
    }
  }

  function populateExamSelect() {
    if (!examSelect) return;
    if (cachedExams.length === 0) {
      examSelect.innerHTML = `<option value="">কোনো পরীক্ষা নেই</option>`;
      return;
    }
    examSelect.innerHTML = cachedExams.map(e => `
      <option value="${e.id}" ${e.id === currentSelectedExamId ? 'selected' : ''}>
        ${escapeHtml(e.title)} (${e.group.toUpperCase()})
      </option>
    `).join('');

    if (!currentSelectedExamId && cachedExams.length > 0) {
      currentSelectedExamId = cachedExams[0].id;
    }
  }

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

  checkAuth();
});
