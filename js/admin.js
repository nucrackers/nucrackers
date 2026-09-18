// NU Crackers - Admin Panel JavaScript
// Manages: Unique Student Rolls, Questions, Exams, and Results

document.addEventListener('DOMContentLoaded', () => {
  const adminAuthSection = document.getElementById('adminAuthSection');
  const adminDashboardSection = document.getElementById('adminDashboardSection');
  const adminLoginForm = document.getElementById('adminLoginForm');
  const adminPassInput = document.getElementById('adminPassword');
  const adminLoginAlert = document.getElementById('adminLoginAlert');
  const logoutBtn = document.getElementById('adminLogoutBtn');

  // Helper to safely parse JSON and prevent raw HTML "!DOCTYPE" error alerts
  async function safeJson(res) {
    const text = await res.text();
    try {
      return JSON.parse(text);
    } catch (e) {
      if (text.includes('<!DOCTYPE') || text.includes('<html')) {
        throw new Error(`সার্ভার থেকে এইচটিএমএল রেসপন্স এসেছে [স্ট্যাটাস: ${res.status}]। আপনার Render সার্ভারটি চালু আছে কিনা অথবা কোড রিস্টার্ট হয়েছে কিনা দেখুন।`);
      }
      throw new Error(text || `সার্ভার এরর [স্ট্যাটাস: ${res.status}]`);
    }
  }

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
    const token = localStorage.getItem('nu_admin_token') || sessionStorage.getItem('nu_admin_token');
    if (token) {
      adminAuthSection.classList.add('d-none');
      adminDashboardSection.classList.remove('d-none');
      loadAllAdminData();
    } else {
      adminAuthSection.classList.remove('d-none');
      adminDashboardSection.classList.add('d-none');
    }
  }

  // Password Visibility Toggle & Auto Fill
  const toggleAdminPassBtn = document.getElementById('toggleAdminPassBtn');
  const toggleAdminPassIcon = document.getElementById('toggleAdminPassIcon');
  const fillAdminPassBtn = document.getElementById('fillAdminPassBtn');

  if (toggleAdminPassBtn && adminPassInput) {
    toggleAdminPassBtn.addEventListener('click', () => {
      const isPassword = adminPassInput.type === 'password';
      adminPassInput.type = isPassword ? 'text' : 'password';
      if (toggleAdminPassIcon) {
        toggleAdminPassIcon.className = isPassword ? 'fa-regular fa-eye-slash' : 'fa-regular fa-eye';
      }
    });
  }

  if (fillAdminPassBtn && adminPassInput) {
    fillAdminPassBtn.addEventListener('click', () => {
      adminPassInput.value = 'Nucrackers#.com';
      adminPassInput.focus();
    });
  }

  // Handle Admin Login
  adminLoginForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    adminLoginAlert.classList.add('d-none');

    // Clean extra quotation marks or spaces if user pasted with quotes
    const password = adminPassInput.value.trim().replace(/^["']|["']$/g, '');
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

      let data;
      try {
        data = await res.json();
      } catch (jsonErr) {
        throw new Error('Node.js সার্ভার চালু নেই! আপনি এটি Live Server (Port 5500)-এ চালাচ্ছেন। অনুগ্রহ করে টার্মিনালে "node server.js" বা "npm start" চালান এবং http://localhost:3000 ঠিকানায় প্রবেশ করুন।');
      }

      if (!res.ok || !data.success) {
        throw new Error(data.message || 'ভুল পাসওয়ার্ড!');
      }

      localStorage.setItem('nu_admin_token', data.token);
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
      localStorage.removeItem('nu_admin_token');
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

  // 3. STUDENT MANAGEMENT (STRICT UNIQUE ROLL + PERMANENT AUTO-PERSISTENCE)
  const LOCAL_STORAGE_STUDENTS_KEY = 'nu_crackers_persistent_students';

  function getLocalBackupStudents() {
    try {
      const raw = localStorage.getItem(LOCAL_STORAGE_STUDENTS_KEY);
      return raw ? JSON.parse(raw) : null;
    } catch (e) {
      return null;
    }
  }

  function saveLocalBackupStudents(students) {
    try {
      if (Array.isArray(students) && students.length > 0) {
        localStorage.setItem(LOCAL_STORAGE_STUDENTS_KEY, JSON.stringify(students));
      }
    } catch (e) {
      console.warn('LocalStorage save failed', e);
    }
  }

  // Pending & Approved Student cache
  let pendingStudentsCache = [];
  let approvedStudentsCache = [];
  let currentApprovingStudent = null;
  let currentRejectingStudent = null;

  async function loadStudents() {
    try {
      const pendingTbody = document.getElementById('pendingStudentsTableBody');
      if (pendingTbody) {
        pendingTbody.innerHTML = `<tr><td colspan="7" class="text-center py-4 text-muted"><div class="spinner-border spinner-border-sm text-warning me-2"></div>পেন্ডিং ভর্তি আবেদনসমূহ লোড হচ্ছে...</td></tr>`;
      }
      studentTableBody.innerHTML = `<tr><td colspan="8" class="text-center py-4 text-muted"><div class="spinner-border spinner-border-sm text-primary me-2"></div>অনুমোদিত শিক্ষার্থীদের তালিকা লোড হচ্ছে...</td></tr>`;

      const res = await fetch('/api/admin/students');
      const data = await safeJson(res);
      if (data.success) {
        let serverStudents = data.students || [];

        // Check if server lost students after a restart
        const localBackup = getLocalBackupStudents();
        if (localBackup && Array.isArray(localBackup) && localBackup.length > 0) {
          const serverRolls = new Set(serverStudents.map(s => String(s.roll || s.id).trim().toLowerCase()));
          const missingStudents = localBackup.filter(s => !serverRolls.has(String(s.roll || s.id).trim().toLowerCase()));

          if (missingStudents.length > 0) {
            try {
              const syncRes = await fetch('/api/admin/students/sync', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ students: localBackup })
              });
              const syncData = await safeJson(syncRes);
              if (syncData.success && syncData.students) {
                serverStudents = syncData.students;
              }
            } catch (syncErr) {
              console.warn('Background sync failed:', syncErr);
            }
          }
        }

        cachedStudents = serverStudents;
        saveLocalBackupStudents(cachedStudents);

        separateAndRenderStudents();
      }
    } catch (err) {
      const localBackup = getLocalBackupStudents();
      if (localBackup && localBackup.length > 0) {
        cachedStudents = localBackup;
        separateAndRenderStudents();
      } else {
        studentTableBody.innerHTML = `<tr><td colspan="8" class="text-center py-4 text-danger"><i class="fa-solid fa-triangle-exclamation me-1"></i>লোড ব্যর্থ হয়েছে: ${err.message}</td></tr>`;
      }
    }
  }

  function separateAndRenderStudents() {
    pendingStudentsCache = cachedStudents.filter(s => s.status === 'pending');
    approvedStudentsCache = cachedStudents.filter(s => s.status !== 'pending' && s.status !== 'rejected');

    // Update Badges
    const pendingCount = pendingStudentsCache.length;
    const approvedCount = approvedStudentsCache.length;

    const pendingCountBadge = document.getElementById('pendingCountBadge');
    const pendingBannerBadge = document.getElementById('pendingBannerBadge');
    const approvedCountBadge = document.getElementById('approvedCountBadge');

    if (pendingCountBadge) pendingCountBadge.textContent = `${pendingCount} জন`;
    if (pendingBannerBadge) pendingBannerBadge.textContent = `${pendingCount}টি নতুন আবেদন`;
    if (approvedCountBadge) approvedCountBadge.textContent = `${approvedCount} জন`;
    if (studentCountBadge) studentCountBadge.textContent = `${approvedCount} জন`;

    renderPendingStudentsTable();
    renderApprovedStudentsTable();
  }

  // ==========================================
  // HELPER: WhatsApp Message & Phone Formatter
  // ==========================================
  function formatWhatsAppPhone(phone) {
    if (!phone) return '';
    let clean = String(phone).replace(/[^0-9]/g, '');
    if (clean.startsWith('880')) return clean;
    if (clean.startsWith('0')) return '88' + clean;
    if (clean.length === 10 && clean.startsWith('1')) return '880' + clean;
    return clean;
  }

  function buildOfficialWhatsAppMessage(student, roll) {
    const groupName = student.group === 'arts' ? 'মানবিক (Arts)' : (student.group === 'commerce' ? 'ব্যবসায় শিক্ষা (Commerce)' : 'বিজ্ঞান (Science)');
    const loginUrl = `${window.location.origin}/premium-login.html`;

    return `অভিনন্দন ${student.name}! 🎉\nNU Crackers প্রিমিয়াম ব্যাচে আপনার ভর্তি নিশ্চিত ও অনুমোদিত হয়েছে।\n\n📋 আপনার ভর্তি বিবরণ:\n• নাম: ${student.name}\n• বিভাগ: ${groupName}\n• অফিসিয়াল ইউনিক রোল নম্বর: ${roll}\n\n🌐 লগইন পোর্টাল লিংক:\n${loginUrl}\n\nউপরে দেওয়া আপনার ৮-ডিজিট রোল নম্বরটি দিয়ে ওয়েবসাইটে লগইন করে এখনই সকল মডেল টেস্ট ও লাইভ পরীক্ষায় অংশ নিতে পারবেন।\n\nযেকোনো সহায়তায় আমাদের সাথে যোগাযোগ করবেন। আপনার সাফল্য কামনা করি!\n— NU Crackers টিম`;
  }

  function getWhatsAppDirectUrl(phone, message) {
    const formatted = formatWhatsAppPhone(phone);
    if (!formatted) return null;
    return `https://api.whatsapp.com/send?phone=${encodeURIComponent(formatted)}&text=${encodeURIComponent(message)}`;
  }

  // Helper to refresh live preview of WhatsApp message in approval modal
  function updateModalWhatsAppPreview(student, roll) {
    const previewBox = document.getElementById('modalWhatsAppMessagePreview');
    if (!previewBox || !student) return;
    const msg = buildOfficialWhatsAppMessage(student, roll);
    previewBox.innerText = msg;
  }

  // ==========================================
  // FULL STUDENT DETAILS MODAL VIEWER
  // ==========================================
  function openStudentDetailsModal(identifier) {
    const clean = String(identifier || '').trim().toLowerCase();
    const student = cachedStudents.find(s =>
      (s.id && String(s.id).toLowerCase() === clean) ||
      (s.roll && String(s.roll).toLowerCase() === clean) ||
      (s.transactionId && String(s.transactionId).toLowerCase() === clean) ||
      (s.whatsapp && String(s.whatsapp).toLowerCase() === clean)
    );

    if (!student) {
      alert('শিক্ষার্থীর পূর্ণাঙ্গ তথ্য খুঁজে পাওয়া যায়নি!');
      return;
    }

    const isPending = student.status === 'pending';
    const isApproved = student.status === 'approved' || (!isPending && student.status !== 'rejected');

    // Header info
    const nameEl = document.getElementById('modalDetailName');
    if (nameEl) nameEl.textContent = student.name || '-';
    
    const fullNameEl = document.getElementById('modalDetailFullName');
    if (fullNameEl) fullNameEl.textContent = student.name || '-';

    const statusBadge = document.getElementById('modalDetailStatusBadge');
    if (statusBadge) {
      if (isPending) {
        statusBadge.className = 'badge bg-warning text-dark px-3 py-1 rounded-pill';
        statusBadge.innerHTML = '<i class="fa-solid fa-clock me-1"></i>ভর্তি আবেদন পেন্ডিং';
      } else if (student.status === 'rejected') {
        statusBadge.className = 'badge bg-danger px-3 py-1 rounded-pill';
        statusBadge.innerHTML = '<i class="fa-solid fa-ban me-1"></i>আবেদন বাতিল';
      } else {
        statusBadge.className = 'badge bg-success px-3 py-1 rounded-pill';
        statusBadge.innerHTML = '<i class="fa-solid fa-circle-check me-1"></i>অনুমোদিত প্রিমিয়াম শিক্ষার্থী';
      }
    }

    // Group info
    let groupText = 'বিজ্ঞান (Science)';
    let groupBadgeClass = 'bg-primary';
    if (student.group === 'arts') {
      groupText = 'মানবিক (Arts)';
      groupBadgeClass = 'bg-warning text-dark';
    } else if (student.group === 'commerce') {
      groupText = 'ব্যবসায় শিক্ষা (Commerce)';
      groupBadgeClass = 'bg-success';
    }

    const groupBadgeEl = document.getElementById('modalDetailGroupBadge');
    if (groupBadgeEl) {
      groupBadgeEl.className = `badge ${groupBadgeClass} px-2 py-1 rounded-pill`;
      groupBadgeEl.textContent = groupText;
    }

    const groupFullNameEl = document.getElementById('modalDetailGroupFullName');
    if (groupFullNameEl) groupFullNameEl.textContent = groupText;

    // College & District
    const college = student.college || 'কলেজ উল্লেখ নেই';
    const district = student.district || 'জেলা উল্লেখ নেই';
    const collegeTextEl = document.getElementById('modalDetailCollegeText');
    if (collegeTextEl) collegeTextEl.textContent = college;
    const collegeFullEl = document.getElementById('modalDetailCollegeFull');
    if (collegeFullEl) collegeFullEl.textContent = college;

    const districtTextEl = document.getElementById('modalDetailDistrictText');
    if (districtTextEl) districtTextEl.textContent = district;
    const districtFullEl = document.getElementById('modalDetailDistrictFull');
    if (districtFullEl) districtFullEl.textContent = district;

    // Roll number
    const rollEl = document.getElementById('modalDetailRoll');
    const copyRollBtn = document.getElementById('modalDetailCopyRollBtn');
    if (rollEl) {
      if (student.roll) {
        rollEl.textContent = student.roll;
        rollEl.className = 'fs-4 fw-bold text-primary font-monospace';
        if (copyRollBtn) copyRollBtn.style.display = 'inline-block';
      } else {
        rollEl.textContent = 'অনুমোদনের অপেক্ষায়';
        rollEl.className = 'small text-warning fw-bold';
        if (copyRollBtn) copyRollBtn.style.display = 'none';
      }
    }

    // WhatsApp
    const waEl = document.getElementById('modalDetailWhatsapp');
    if (waEl) waEl.textContent = student.whatsapp || '-';

    const waLinkEl = document.getElementById('modalDetailWaLink');
    if (waLinkEl) {
      const cleanWa = (student.whatsapp || '').replace(/[^0-9]/g, '');
      if (cleanWa) {
        waLinkEl.href = `https://wa.me/88${cleanWa.startsWith('88') ? cleanWa.slice(2) : cleanWa}`;
        waLinkEl.classList.remove('d-none');
      } else {
        waLinkEl.classList.add('d-none');
      }
    }

    // Payment details
    const methodEl = document.getElementById('modalDetailPaymentMethod');
    if (methodEl) {
      const method = student.paymentMethod || 'bKash';
      methodEl.textContent = method;
      methodEl.className = `badge ${method.toLowerCase() === 'nagad' ? 'bg-warning text-dark' : 'bg-danger'} rounded-pill px-2 py-1`;
    }

    const payNumEl = document.getElementById('modalDetailPaymentNumber');
    if (payNumEl) payNumEl.textContent = student.paymentNumber || student.whatsapp || '-';

    const trxEl = document.getElementById('modalDetailTrxId');
    if (trxEl) trxEl.textContent = student.transactionId || '-';

    // Dates
    const regDateEl = document.getElementById('modalDetailRegisteredAt');
    if (regDateEl) {
      regDateEl.textContent = student.registeredAt ? new Date(student.registeredAt).toLocaleString('bn-BD', {
        year: 'numeric', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit'
      }) : 'রেকর্ড নেই';
    }

    // WhatsApp sent status
    const waSentBadge = document.getElementById('modalDetailWaSentBadge');
    if (waSentBadge) {
      if (student.whatsappSent) {
        waSentBadge.className = 'badge bg-success rounded-pill px-2 py-1';
        waSentBadge.innerHTML = '<i class="fa-solid fa-check-double me-1"></i>পাঠানো হয়েছে';
      } else {
        waSentBadge.className = 'badge bg-secondary rounded-pill px-2 py-1';
        waSentBadge.textContent = 'পাঠানো হয়নি';
      }
    }

    // Modal action buttons
    const actionsContainer = document.getElementById('modalDetailActionButtons');
    if (actionsContainer) {
      const studentIdentifier = student.id || student.roll || student.transactionId;
      if (isPending) {
        actionsContainer.innerHTML = `
          <button type="button" class="btn btn-outline-danger rounded-pill px-3 modal-detail-reject-btn" data-id="${escapeHtml(studentIdentifier)}" data-name="${escapeHtml(student.name)}">
            <i class="fa-solid fa-xmark me-1"></i>বাতিল করুন
          </button>
          <button type="button" class="btn btn-success rounded-pill px-4 fw-bold shadow-sm modal-detail-approve-btn" data-id="${escapeHtml(studentIdentifier)}">
            <i class="fa-solid fa-user-check me-1"></i>Approve & রোল বরাদ্দ করুন
          </button>
        `;
      } else {
        const waMsg = buildOfficialWhatsAppMessage(student, student.roll || 'N/A');
        const waUrl = getWhatsAppDirectUrl(student.whatsapp, waMsg);
        actionsContainer.innerHTML = `
          ${waUrl ? `
            <a href="${waUrl}" target="_blank" class="btn btn-success rounded-pill px-3 fw-bold mark-wa-sent-btn" data-id="${escapeHtml(studentIdentifier)}">
              <i class="fa-brands fa-whatsapp me-1"></i>WhatsApp-এ রোল পাঠান
            </a>
          ` : ''}
          <button type="button" class="btn btn-primary rounded-pill px-3 modal-detail-edit-btn" data-id="${escapeHtml(studentIdentifier)}">
            <i class="fa-solid fa-pen-to-square me-1"></i>তথ্য সম্পাদন করুন
          </button>
        `;
      }

      // Attach handlers to modal buttons
      actionsContainer.querySelector('.modal-detail-approve-btn')?.addEventListener('click', () => {
        const detailModal = bootstrap.Modal.getInstance(document.getElementById('viewStudentDetailsModal'));
        if (detailModal) detailModal.hide();
        openApproveModal(studentIdentifier);
      });

      actionsContainer.querySelector('.modal-detail-reject-btn')?.addEventListener('click', () => {
        const detailModal = bootstrap.Modal.getInstance(document.getElementById('viewStudentDetailsModal'));
        if (detailModal) detailModal.hide();
        openRejectModal(studentIdentifier, student.name);
      });

      actionsContainer.querySelector('.modal-detail-edit-btn')?.addEventListener('click', () => {
        const detailModal = bootstrap.Modal.getInstance(document.getElementById('viewStudentDetailsModal'));
        if (detailModal) detailModal.hide();
        openEditModal(studentIdentifier);
      });
    }

    // Attach copy button listeners in modal
    const copyRollBtnEl = document.getElementById('modalDetailCopyRollBtn');
    if (copyRollBtnEl) {
      copyRollBtnEl.onclick = () => {
        if (student.roll) {
          navigator.clipboard.writeText(student.roll);
          copyRollBtnEl.innerHTML = '<i class="fa-solid fa-check text-success"></i>';
          setTimeout(() => {
            copyRollBtnEl.innerHTML = '<i class="fa-regular fa-copy"></i>';
          }, 1500);
        }
      };
    }

    const copySenderBtnEl = document.getElementById('modalDetailCopySenderBtn');
    if (copySenderBtnEl) {
      copySenderBtnEl.onclick = () => {
        const num = student.paymentNumber || student.whatsapp;
        if (num) {
          navigator.clipboard.writeText(num);
          copySenderBtnEl.innerHTML = '<i class="fa-solid fa-check text-success small"></i>';
          setTimeout(() => {
            copySenderBtnEl.innerHTML = '<i class="fa-regular fa-copy small"></i>';
          }, 1500);
        }
      };
    }

    const copyTrxBtnEl = document.getElementById('modalDetailCopyTrxBtn');
    if (copyTrxBtnEl) {
      copyTrxBtnEl.onclick = () => {
        if (student.transactionId) {
          navigator.clipboard.writeText(student.transactionId);
          copyTrxBtnEl.innerHTML = '<i class="fa-solid fa-check text-success small"></i>';
          setTimeout(() => {
            copyTrxBtnEl.innerHTML = '<i class="fa-regular fa-copy small"></i>';
          }, 1500);
        }
      };
    }

    const modal = new bootstrap.Modal(document.getElementById('viewStudentDetailsModal'));
    modal.show();
  }

  // ==========================================
  // RENDER 1: PENDING STUDENTS TABLE
  // ==========================================
  function renderPendingStudentsTable() {
    const tbody = document.getElementById('pendingStudentsTableBody');
    if (!tbody) return;

    const queryInput = document.getElementById('pendingSearchInput');
    const filterSelect = document.getElementById('pendingFilterGroup');
    const query = (queryInput?.value || '').trim().toLowerCase();
    const groupFilter = filterSelect?.value || 'all';

    let filtered = pendingStudentsCache.filter(s => {
      const textPool = `${s.name || ''} ${s.college || ''} ${s.district || ''} ${s.whatsapp || ''} ${s.transactionId || ''} ${s.paymentNumber || ''}`.toLowerCase();
      const matchQuery = textPool.includes(query);
      const matchFilter = groupFilter === 'all' || s.group === groupFilter;
      return matchQuery && matchFilter;
    });

    if (filtered.length === 0) {
      tbody.innerHTML = `
        <tr>
          <td colspan="7" class="text-center py-5 text-muted">
            <i class="fa-regular fa-circle-check text-success fs-3 d-block mb-2"></i>
            বর্তমানে কোনো পেন্ডিং আবেদন নেই।
          </td>
        </tr>
      `;
      return;
    }

    tbody.innerHTML = filtered.map((s, idx) => {
      let groupBadge = '<span class="badge bg-primary px-2 py-1 rounded-pill"><i class="fa-solid fa-atom me-1"></i>Science</span>';
      if (s.group === 'arts') groupBadge = '<span class="badge bg-warning text-dark px-2 py-1 rounded-pill"><i class="fa-solid fa-palette me-1"></i>Arts</span>';
      if (s.group === 'commerce') groupBadge = '<span class="badge bg-success px-2 py-1 rounded-pill"><i class="fa-solid fa-chart-line me-1"></i>Commerce</span>';

      const regDate = s.registeredAt ? new Date(s.registeredAt).toLocaleDateString('bn-BD', {
        month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit'
      }) : 'আজকে';

      const cleanWa = (s.whatsapp || '').replace(/[^0-9]/g, '');
      const waLink = cleanWa ? `https://wa.me/88${cleanWa.startsWith('88') ? cleanWa.slice(2) : cleanWa}` : '#';

      const method = s.paymentMethod || 'bKash';
      const methodBadgeClass = method.toLowerCase() === 'nagad' ? 'bg-warning text-dark' : 'bg-danger';

      const identifier = s.id || s.roll || s.transactionId;

      return `
        <tr class="align-middle">
          <td class="text-muted small fw-bold">${idx + 1}</td>
          <td>
            <div class="fw-bold text-dark fs-6">${escapeHtml(s.name)}</div>
            <div class="small text-muted mt-1">
              <span class="d-inline-block me-2"><i class="fa-solid fa-building-columns text-secondary me-1"></i>${escapeHtml(s.college || 'কলেজ উল্লেখ নেই')}</span>
              <span class="d-inline-block"><i class="fa-solid fa-location-dot text-secondary me-1"></i>${escapeHtml(s.district || 'জেলা উল্লেখ নেই')}</span>
            </div>
          </td>
          <td>${groupBadge}</td>
          <td>
            <div class="d-flex align-items-center gap-1">
              <a href="${waLink}" target="_blank" class="btn btn-sm btn-outline-success rounded-pill px-2 py-1 d-inline-flex align-items-center gap-1 text-decoration-none" title="হোয়াটসঅ্যাপে চ্যাট করুন">
                <i class="fa-brands fa-whatsapp text-success"></i>
                <span class="small fw-semibold font-monospace">${escapeHtml(s.whatsapp || '-')}</span>
              </a>
            </div>
          </td>
          <td>
            <div class="d-flex align-items-center gap-1">
              <span class="badge ${methodBadgeClass} rounded-pill px-2 py-1 small">${escapeHtml(method)}</span>
              <span class="small font-monospace text-muted ms-1" title="প্রেরক নম্বর"><i class="fa-solid fa-phone me-1"></i>${escapeHtml(s.paymentNumber || s.whatsapp || '-')}</span>
            </div>
            <div class="mt-1 d-flex align-items-center gap-1">
              <code class="fw-bold text-primary font-monospace fs-6">${escapeHtml(s.transactionId || '-')}</code>
              ${s.transactionId ? `
                <button class="btn btn-link p-0 text-muted copy-trx-btn" data-trx="${escapeHtml(s.transactionId)}" title="TrxID কপি করুন">
                  <i class="fa-regular fa-copy small"></i>
                </button>
              ` : ''}
            </div>
          </td>
          <td class="small text-muted">${regDate}</td>
          <td class="text-end">
            <div class="d-flex justify-content-end align-items-center gap-1">
              <button class="btn btn-outline-secondary btn-sm rounded-pill px-2 py-1 btn-view-details" data-id="${escapeHtml(identifier)}" title="শিক্ষার্থীর সকল তথ্য বিস্তারিত দেখুন">
                <i class="fa-solid fa-eye me-1"></i>সব তথ্য
              </button>
              <button class="btn btn-success btn-sm rounded-pill px-3 py-1 btn-open-approve" data-id="${escapeHtml(identifier)}" title="অনুমোদন করুন ও ৮-ডিজিট রোল প্রদান করুন">
                <i class="fa-solid fa-user-check me-1"></i>Approve
              </button>
              <button class="btn btn-outline-danger btn-sm rounded-pill px-2 py-1 btn-open-reject" data-id="${escapeHtml(identifier)}" data-name="${escapeHtml(s.name)}" title="বাতিল করুন">
                <i class="fa-solid fa-xmark"></i>
              </button>
            </div>
          </td>
        </tr>
      `;
    }).join('');

    // Attach View Details buttons
    tbody.querySelectorAll('.btn-view-details').forEach(btn => {
      btn.addEventListener('click', () => {
        const id = btn.getAttribute('data-id');
        openStudentDetailsModal(id);
      });
    });

    // Attach Approve modal buttons
    tbody.querySelectorAll('.btn-open-approve').forEach(btn => {
      btn.addEventListener('click', () => {
        const id = btn.getAttribute('data-id');
        openApproveModal(id);
      });
    });

    // Attach Reject modal buttons
    tbody.querySelectorAll('.btn-open-reject').forEach(btn => {
      btn.addEventListener('click', () => {
        const id = btn.getAttribute('data-id');
        const name = btn.getAttribute('data-name');
        openRejectModal(id, name);
      });
    });

    // Attach Copy Trx buttons
    tbody.querySelectorAll('.copy-trx-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        const trx = btn.getAttribute('data-trx');
        navigator.clipboard.writeText(trx);
        btn.innerHTML = '<i class="fa-solid fa-check text-success small"></i>';
        setTimeout(() => {
          btn.innerHTML = '<i class="fa-regular fa-copy small"></i>';
        }, 1500);
      });
    });
  }

  // ==========================================
  // RENDER 2: APPROVED STUDENTS TABLE
  // ==========================================
  function renderApprovedStudentsTable() {
    const query = (studentSearchInput.value || '').trim().toLowerCase();
    const groupFilter = studentFilterGroup.value;

    let filtered = approvedStudentsCache.filter(s => {
      const textPool = `${s.roll || ''} ${s.name || ''} ${s.college || ''} ${s.district || ''} ${s.whatsapp || ''} ${s.transactionId || ''} ${s.paymentNumber || ''}`.toLowerCase();
      const matchQuery = textPool.includes(query);
      const matchFilter = groupFilter === 'all' || s.group === groupFilter;
      return matchQuery && matchFilter;
    });

    if (studentCountBadge) studentCountBadge.textContent = `${filtered.length} জন`;

    if (filtered.length === 0) {
      studentTableBody.innerHTML = `
        <tr>
          <td colspan="8" class="text-center py-5 text-muted">
            <i class="fa-regular fa-folder-open me-1 fs-4 d-block mb-2"></i>
            কোনো অনুমোদিত শিক্ষার্থী পাওয়া যায়নি।
          </td>
        </tr>
      `;
      return;
    }

    studentTableBody.innerHTML = filtered.map((s, idx) => {
      let groupBadge = '<span class="badge bg-primary rounded-pill px-2 py-1"><i class="fa-solid fa-atom me-1"></i>Science</span>';
      if (s.group === 'arts') groupBadge = '<span class="badge bg-warning text-dark rounded-pill px-2 py-1"><i class="fa-solid fa-palette me-1"></i>Arts</span>';
      if (s.group === 'commerce') groupBadge = '<span class="badge bg-success rounded-pill px-2 py-1"><i class="fa-solid fa-chart-line me-1"></i>Commerce</span>';

      const approvedDate = (s.approvedAt || s.registeredAt) ? new Date(s.approvedAt || s.registeredAt).toLocaleDateString('bn-BD', {
        year: 'numeric', month: 'short', day: 'numeric'
      }) : 'অনুমোদিত';

      const rollStr = String(s.roll || 'N/A');
      const identifier = s.id || s.roll || s.transactionId;

      const waMessage = buildOfficialWhatsAppMessage(s, rollStr);
      const waSendRollUrl = getWhatsAppDirectUrl(s.whatsapp, waMessage);
      const isWaSent = !!s.whatsappSent;

      return `
        <tr class="align-middle">
          <td class="text-muted small fw-bold">${idx + 1}</td>
          <td>
            <div class="d-flex align-items-center gap-2">
              <span class="badge bg-light text-primary border border-primary border-opacity-25 px-2 py-1 fw-bold fs-6 font-monospace">
                <code>${escapeHtml(rollStr)}</code>
              </span>
              <button class="btn btn-outline-secondary btn-sm rounded-circle p-1 copy-roll-btn" data-roll="${escapeHtml(rollStr)}" title="রোল নম্বর কপি করুন" style="width:26px; height:26px; line-height:1;">
                <i class="fa-regular fa-copy" style="font-size:0.75rem;"></i>
              </button>
            </div>
          </td>
          <td>
            <div class="fw-bold text-dark fs-6">${escapeHtml(s.name)}</div>
            <div class="small text-muted mt-1">
              <span class="me-2"><i class="fa-solid fa-building-columns text-secondary me-1"></i>${escapeHtml(s.college || 'কলেজ উল্লেখ নেই')}</span>
              <span><i class="fa-solid fa-location-dot text-secondary me-1"></i>${escapeHtml(s.district || 'জেলা উল্লেখ নেই')}</span>
            </div>
          </td>
          <td>${groupBadge}</td>
          <td>
            ${s.whatsapp ? `
              <div class="d-flex flex-column gap-1">
                <span class="small fw-semibold text-dark"><i class="fa-brands fa-whatsapp text-success me-1"></i>${escapeHtml(s.whatsapp)}</span>
                <div class="d-flex align-items-center gap-1">
                  ${waSendRollUrl ? `
                    <a href="${waSendRollUrl}" target="_blank" class="btn btn-xs btn-success rounded-pill px-2 py-1 text-decoration-none d-inline-flex align-items-center gap-1 shadow-sm mark-wa-sent-btn" data-id="${escapeHtml(identifier)}" style="font-size: 0.75rem; width: fit-content;">
                      <i class="fa-brands fa-whatsapp"></i>রোল পাঠান
                    </a>
                  ` : ''}
                  ${isWaSent ? `
                    <span class="badge bg-success bg-opacity-10 text-success border border-success border-opacity-25 rounded-pill px-2 py-1" style="font-size: 0.7rem;" title="শিক্ষার্থীকে ইতিমধ্যে রোল পাঠানো হয়েছে">
                      <i class="fa-solid fa-check-double me-1"></i>পাঠানো হয়েছে
                    </span>
                  ` : ''}
                </div>
              </div>
            ` : '<span class="text-muted small">-</span>'}
          </td>
          <td>
            <div class="small">
              <span class="badge bg-light text-dark border px-2 py-1">${escapeHtml(s.paymentMethod || 'bKash')}</span>
              ${s.paymentNumber ? `<span class="small text-muted font-monospace ms-1">${escapeHtml(s.paymentNumber)}</span>` : ''}
            </div>
            ${s.transactionId ? `<div class="font-monospace text-primary fw-semibold mt-1 small"><i class="fa-solid fa-receipt me-1 text-muted"></i>${escapeHtml(s.transactionId)}</div>` : '<span class="text-muted small">-</span>'}
          </td>
          <td class="small text-muted">${approvedDate}</td>
          <td class="text-end">
            <div class="d-flex justify-content-end gap-1">
              <button class="btn btn-outline-secondary btn-sm rounded-pill px-2 py-1 btn-view-details" data-id="${escapeHtml(identifier)}" title="শিক্ষার্থীর সকল তথ্য বিস্তারিত দেখুন">
                <i class="fa-solid fa-eye me-1"></i>সব তথ্য
              </button>
              <button class="btn btn-outline-primary btn-sm rounded-pill px-2 py-1 edit-student-btn" data-id="${escapeHtml(identifier)}" title="তথ্য সম্পাদনা করুন">
                <i class="fa-solid fa-pen-to-square"></i>
              </button>
              <button class="btn btn-outline-danger btn-sm rounded-pill px-2 py-1 delete-student-btn" data-id="${escapeHtml(identifier)}" data-name="${escapeHtml(s.name)}" data-roll="${escapeHtml(rollStr)}" title="মুছে ফেলুন">
                <i class="fa-solid fa-trash-can"></i>
              </button>
            </div>
          </td>
        </tr>
      `;
    }).join('');

    // Attach View Details buttons
    studentTableBody.querySelectorAll('.btn-view-details').forEach(btn => {
      btn.addEventListener('click', () => {
        const id = btn.getAttribute('data-id');
        openStudentDetailsModal(id);
      });
    });

    // Attach Copy Roll listeners
    studentTableBody.querySelectorAll('.copy-roll-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        const roll = btn.getAttribute('data-roll');
        navigator.clipboard.writeText(roll);
        btn.innerHTML = '<i class="fa-solid fa-check text-success" style="font-size:0.75rem;"></i>';
        setTimeout(() => {
          btn.innerHTML = '<i class="fa-regular fa-copy" style="font-size:0.75rem;"></i>';
        }, 1500);
      });
    });

    // Attach Mark WhatsApp Sent on click
    studentTableBody.querySelectorAll('.mark-wa-sent-btn').forEach(btn => {
      btn.addEventListener('click', async () => {
        const id = btn.getAttribute('data-id');
        try {
          await fetch(`/api/admin/students/${encodeURIComponent(id)}/record-whatsapp-sent`, { method: 'POST' });
          const student = cachedStudents.find(s => (s.id || s.roll || s.transactionId) === id);
          if (student) student.whatsappSent = true;
          saveLocalBackupStudents(cachedStudents);
        } catch (e) {
          // ignore
        }
      });
    });

    // Attach Edit listeners
    studentTableBody.querySelectorAll('.edit-student-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        const id = btn.getAttribute('data-id');
        openEditModal(id);
      });
    });

    // Attach Delete listeners
    studentTableBody.querySelectorAll('.delete-student-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        const id = btn.getAttribute('data-id');
        const name = btn.getAttribute('data-name');
        const roll = btn.getAttribute('data-roll');
        deleteStudent(id, name, roll);
      });
    });
  }

  // ==========================================
  // 4. OPEN APPROVAL MODAL & CALCULATE 8-DIGIT UNIQUE ROLL PREVIEW
  // ==========================================
  async function openApproveModal(identifier) {
    const clean = String(identifier || '').trim().toLowerCase();
    const student = cachedStudents.find(
      s => (s.id && String(s.id).toLowerCase() === clean) ||
           (s.roll && String(s.roll).toLowerCase() === clean) ||
           (s.transactionId && String(s.transactionId).toLowerCase() === clean) ||
           (s.whatsapp && String(s.whatsapp).toLowerCase() === clean)
    );
    if (!student) {
      alert('শিক্ষার্থী খুঁজে পাওয়া যায়নি!');
      return;
    }

    currentApprovingStudent = student;

    // Populate Student Details
    document.getElementById('modalApproveName').textContent = student.name || '-';
    document.getElementById('modalApproveCollegeDistrict').textContent = `${student.college || 'কলেজ উল্লেখ নেই'}, ${student.district || 'জেলা উল্লেখ নেই'}`;
    
    const groupBadge = document.getElementById('modalApproveGroupBadge');
    if (student.group === 'arts') {
      groupBadge.className = 'badge bg-warning text-dark px-2 py-1';
      groupBadge.textContent = 'মানবিক (Arts)';
    } else if (student.group === 'commerce') {
      groupBadge.className = 'badge bg-success px-2 py-1';
      groupBadge.textContent = 'ব্যবসায় শিক্ষা (Commerce)';
    } else {
      groupBadge.className = 'badge bg-primary px-2 py-1';
      groupBadge.textContent = 'বিজ্ঞান (Science)';
    }

    const waText = student.whatsapp || '-';
    document.getElementById('modalApproveWhatsapp').textContent = waText;
    const approveWaTextEl = document.getElementById('modalApproveWaNumberText');
    if (approveWaTextEl) approveWaTextEl.textContent = waText;

    document.getElementById('modalApprovePayment').textContent = `${student.paymentMethod || 'bKash'} (${student.paymentNumber || student.whatsapp || '-'})`;
    document.getElementById('modalApproveTrxId').textContent = student.transactionId || '-';

    // Fetch next auto 8-digit unique roll preview from server
    let previewRoll = '12701001';
    try {
      const res = await fetch(`/api/admin/students/preview-roll?group=${encodeURIComponent(student.group || 'science')}&year=27`);
      const rollData = await res.json();
      if (rollData.success && rollData.roll) {
        previewRoll = rollData.roll;
      }
    } catch (e) {
      console.warn('Roll preview failed, falling back', e);
    }

    document.getElementById('modalCalculatedRollDisplay').textContent = previewRoll;
    const customRollInput = document.getElementById('modalCustomRollInput');
    customRollInput.value = previewRoll;

    const groupDigit = student.group === 'arts' ? '২' : (student.group === 'commerce' ? '৩' : '১');
    const groupName = student.group === 'arts' ? 'মানবিক' : (student.group === 'commerce' ? 'ব্যবসায় শিক্ষা' : 'বিজ্ঞান');
    document.getElementById('modalRollFormulaBreakdown').innerHTML = `
      [গ্রুপ: <strong>${groupDigit}</strong> (${groupName})] + [বছর: <strong>২৭</strong>] + [ব্যাচ: <strong>${previewRoll.slice(3, 5)}</strong>] + [সিরিয়াল: <strong>${previewRoll.slice(5)}</strong>]
    `;

    // Live update preview message
    updateModalWhatsAppPreview(student, previewRoll);

    // Watch for roll input edits to update preview
    customRollInput.oninput = () => {
      updateModalWhatsAppPreview(student, customRollInput.value.trim() || '--------');
    };

    const alertBox = document.getElementById('approveModalAlert');
    if (alertBox) alertBox.classList.add('d-none');

    const modal = new bootstrap.Modal(document.getElementById('approveStudentModal'));
    modal.show();
  }

  // Confirm Approve Button Handler (with Direct WhatsApp Roll Dispatch)
  document.getElementById('btnConfirmApproveStudent')?.addEventListener('click', async () => {
    if (!currentApprovingStudent) return;

    const customRoll = document.getElementById('modalCustomRollInput').value.trim();
    if (!customRoll) {
      alert('রোল নম্বর ফাঁকা রাখা যাবে না!');
      return;
    }

    const autoOpenWhatsApp = document.getElementById('modalAutoOpenWhatsApp')?.checked ?? true;
    const btn = document.getElementById('btnConfirmApproveStudent');
    btn.disabled = true;
    btn.innerHTML = '<span class="spinner-border spinner-border-sm me-1"></span> অনুমোদন ও রোল পাঠানো হচ্ছে...';

    const alertBox = document.getElementById('approveModalAlert');
    if (alertBox) alertBox.classList.add('d-none');

    try {
      const identifier = currentApprovingStudent.id || currentApprovingStudent.roll || currentApprovingStudent.transactionId || currentApprovingStudent.whatsapp;
      const res = await fetch(`/api/admin/students/${encodeURIComponent(identifier)}/approve`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ customRoll, year: '27' })
      });

      const data = await safeJson(res);
      if (!res.ok || !data.success) {
        throw new Error(data.message || 'অনুমোদন ব্যর্থ হয়েছে।');
      }

      const allocatedRoll = data.student.roll;
      const studentName = currentApprovingStudent.name;
      const studentPhone = currentApprovingStudent.whatsapp;

      // Build official WhatsApp message
      const officialMessage = buildOfficialWhatsAppMessage(currentApprovingStudent, allocatedRoll);
      const waUrl = getWhatsAppDirectUrl(studentPhone, officialMessage);

      // Record WhatsApp sent on server
      if (waUrl) {
        fetch(`/api/admin/students/${encodeURIComponent(identifier)}/record-whatsapp-sent`, { method: 'POST' }).catch(() => {});
      }

      // Hide approve modal
      const approveModalEl = document.getElementById('approveStudentModal');
      const approveModal = bootstrap.Modal.getInstance(approveModalEl);
      if (approveModal) approveModal.hide();

      // If auto-open is enabled and student has phone, immediately open WhatsApp
      if (autoOpenWhatsApp && waUrl) {
        window.open(waUrl, '_blank');
      }

      // Populate WhatsApp Dispatched Modal
      const waDispatchedModalEl = document.getElementById('whatsappDispatchedModal');
      if (waDispatchedModalEl) {
        document.getElementById('waModalStudentName').textContent = studentName;
        document.getElementById('waModalAllocatedRoll').textContent = allocatedRoll;
        document.getElementById('waModalTargetPhone').textContent = studentPhone || 'নম্বর নেই';

        const openDirectLink = document.getElementById('waModalOpenDirectLink');
        if (openDirectLink) {
          openDirectLink.href = waUrl || '#';
          if (!waUrl) {
            openDirectLink.classList.add('disabled');
            openDirectLink.textContent = 'হোয়াটসঅ্যাপ নম্বর প্রদান করা হয়নি';
          } else {
            openDirectLink.classList.remove('disabled');
            openDirectLink.innerHTML = '<i class="fa-brands fa-whatsapp me-2 fs-5 align-middle"></i>হোয়াটসঅ্যাপে রোল পাঠান (Open WhatsApp)';
          }
        }

        const copyBtn = document.getElementById('waModalCopyMsgBtn');
        if (copyBtn) {
          copyBtn.onclick = () => {
            navigator.clipboard.writeText(officialMessage);
            copyBtn.innerHTML = '<i class="fa-solid fa-check text-success me-1"></i>মেসেজ কপি হয়েছে!';
            setTimeout(() => {
              copyBtn.innerHTML = '<i class="fa-regular fa-copy me-1"></i>মেসেজ টেক্সট কপি করুন';
            }, 2000);
          };
        }

        const waModal = new bootstrap.Modal(waDispatchedModalEl);
        waModal.show();
      }

      // Also display top alert
      showAlert(studentAlert, `
        <div class="d-flex flex-wrap align-items-center justify-content-between gap-2">
          <div>
            <strong>🎉 ${studentName}-এর ভর্তি অনুমোদিত হয়েছে!</strong> ইউনিক রোল: <code class="fw-bold fs-6 text-dark">${allocatedRoll}</code>
          </div>
          ${waUrl ? `
            <a href="${waUrl}" target="_blank" class="btn btn-success btn-sm rounded-pill px-3 py-1 shadow-sm">
              <i class="fa-brands fa-whatsapp me-1"></i>সরাসরি WhatsApp-এ রোল পাঠান
            </a>
          ` : ''}
        </div>
      `, 'success');

      // Refresh lists & stats
      await loadStudents();
      loadStats();

    } catch (err) {
      if (alertBox) {
        alertBox.className = 'alert alert-danger py-2 px-3 small';
        alertBox.innerHTML = `<i class="fa-solid fa-triangle-exclamation me-1"></i> ${err.message}`;
        alertBox.classList.remove('d-none');
      } else {
        alert(err.message);
      }
    } finally {
      btn.disabled = false;
      btn.innerHTML = '<i class="fa-brands fa-whatsapp me-2 fs-5 align-middle"></i>অনুমোদন করুন ও সরাসরি WhatsApp-এ পাঠান';
    }
  });

  // 5. REJECT STUDENT APPLICATION MODAL
  function openRejectModal(identifier, name) {
    const clean = String(identifier || '').trim().toLowerCase();
    const student = cachedStudents.find(
      s => (s.id && String(s.id).toLowerCase() === clean) ||
           (s.roll && String(s.roll).toLowerCase() === clean) ||
           (s.transactionId && String(s.transactionId).toLowerCase() === clean) ||
           (s.whatsapp && String(s.whatsapp).toLowerCase() === clean)
    );
    if (!student) return;

    currentRejectingStudent = student;
    document.getElementById('modalRejectStudentName').textContent = name || student.name;
    document.getElementById('modalRejectReason').value = '';

    const modal = new bootstrap.Modal(document.getElementById('rejectStudentModal'));
    modal.show();
  }

  document.getElementById('btnConfirmRejectStudent')?.addEventListener('click', async () => {
    if (!currentRejectingStudent) return;

    const reason = document.getElementById('modalRejectReason').value.trim();
    const identifier = currentRejectingStudent.id || currentRejectingStudent.roll || currentRejectingStudent.transactionId || currentRejectingStudent.whatsapp;

    try {
      const res = await fetch(`/api/admin/students/${encodeURIComponent(identifier)}/reject`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ reason })
      });

      const data = await safeJson(res);
      if (!res.ok || !data.success) {
        throw new Error(data.message || 'বাতিল করা সম্ভব হয়নি।');
      }

      const modalEl = document.getElementById('rejectStudentModal');
      const modal = bootstrap.Modal.getInstance(modalEl);
      if (modal) modal.hide();

      showAlert(studentAlert, `শিক্ষার্থী "${currentRejectingStudent.name}"-এর আবেদন বাতিল করা হয়েছে।`, 'info');
      await loadStudents();
      loadStats();
    } catch (err) {
      alert(`ত্রুটি: ${err.message}`);
    }
  });

  // 6. EDIT STUDENT MODAL
  function openEditModal(identifier) {
    const student = cachedStudents.find(
      s => (s.id && String(s.id).toLowerCase() === String(identifier).toLowerCase()) ||
           (s.roll && String(s.roll).toLowerCase() === String(identifier).toLowerCase())
    );
    if (!student) return;

    document.getElementById('editStudentIdOrRoll').value = student.id || student.roll;
    document.getElementById('editStudentName').value = student.name || '';
    document.getElementById('editStudentRoll').value = student.roll || '';
    document.getElementById('editStudentGroup').value = student.group || 'science';
    document.getElementById('editStudentCollege').value = student.college || '';
    document.getElementById('editStudentDistrict').value = student.district || '';
    document.getElementById('editStudentWhatsapp').value = student.whatsapp || '';

    const modal = new bootstrap.Modal(document.getElementById('editStudentModal'));
    modal.show();
  }

  document.getElementById('editStudentForm')?.addEventListener('submit', async (e) => {
    e.preventDefault();
    const identifier = document.getElementById('editStudentIdOrRoll').value.trim();
    const name = document.getElementById('editStudentName').value.trim();
    const roll = document.getElementById('editStudentRoll').value.trim();
    const group = document.getElementById('editStudentGroup').value;
    const college = document.getElementById('editStudentCollege').value.trim();
    const district = document.getElementById('editStudentDistrict').value.trim();
    const whatsapp = document.getElementById('editStudentWhatsapp').value.trim();

    try {
      const res = await fetch(`/api/admin/students/${encodeURIComponent(identifier)}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, roll, group, college, district, whatsapp })
      });

      const data = await safeJson(res);
      if (!res.ok || !data.success) {
        throw new Error(data.message || 'সংরক্ষণ ব্যর্থ হয়েছে।');
      }

      const modalEl = document.getElementById('editStudentModal');
      const modal = bootstrap.Modal.getInstance(modalEl);
      if (modal) modal.hide();

      showAlert(studentAlert, 'শিক্ষার্থীর তথ্য সফলভাবে সংরক্ষিত হয়েছে।', 'success');
      await loadStudents();
      loadStats();
    } catch (err) {
      alert(`ত্রুটি: ${err.message}`);
    }
  });

  // 7. AUTO-GENERATE ROLL IN MANUAL ADD FORM
  document.getElementById('btnAutoGenerateRoll')?.addEventListener('click', async () => {
    const group = document.getElementById('newStudentGroup').value;
    const btn = document.getElementById('btnAutoGenerateRoll');
    btn.disabled = true;
    try {
      const res = await fetch(`/api/admin/students/preview-roll?group=${encodeURIComponent(group)}&year=27`);
      const data = await res.json();
      if (data.success && data.roll) {
        document.getElementById('newStudentRoll').value = data.roll;
      }
    } catch (e) {
      console.warn('Auto roll generate failed', e);
    } finally {
      btn.disabled = false;
    }
  });

  // When group in manual form changes, if roll is empty or matches pattern, offer to re-generate
  document.getElementById('newStudentGroup')?.addEventListener('change', async () => {
    const rollInput = document.getElementById('newStudentRoll');
    if (rollInput && rollInput.value.trim().length === 8) {
      const group = document.getElementById('newStudentGroup').value;
      try {
        const res = await fetch(`/api/admin/students/preview-roll?group=${encodeURIComponent(group)}&year=27`);
        const data = await res.json();
        if (data.success && data.roll) {
          rollInput.value = data.roll;
        }
      } catch (e) {
        // ignore
      }
    }
  });

  // Search & Filter Event Listeners
  document.getElementById('pendingSearchInput')?.addEventListener('input', renderPendingStudentsTable);
  document.getElementById('pendingFilterGroup')?.addEventListener('change', renderPendingStudentsTable);
  document.getElementById('refreshPendingBtn')?.addEventListener('click', () => loadStudents());

  studentSearchInput?.addEventListener('input', renderApprovedStudentsTable);
  studentFilterGroup?.addEventListener('change', renderApprovedStudentsTable);

  // Manual Add Student Form Handler (Enforces strict unique roll)
  addStudentForm?.addEventListener('submit', async (e) => {
    e.preventDefault();
    hideAlert(studentAlert);

    const name = document.getElementById('newStudentName').value.trim();
    const group = document.getElementById('newStudentGroup').value;
    const college = document.getElementById('newStudentCollege')?.value.trim() || '';
    const district = document.getElementById('newStudentDistrict')?.value.trim() || '';
    const whatsapp = document.getElementById('newStudentWhatsapp')?.value.trim() || '';
    const roll = document.getElementById('newStudentRoll').value.trim();

    if (!name || !group) {
      showAlert(studentAlert, 'অনুগ্রহ করে শিক্ষার্থীর নাম এবং গ্রুপ পূরণ করুন।', 'warning');
      return;
    }

    const btn = document.getElementById('addStudentSubmitBtn');
    btn.disabled = true;
    btn.innerHTML = '<span class="spinner-border spinner-border-sm me-1"></span> যুক্ত হচ্ছে...';

    try {
      const res = await fetch('/api/admin/students', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ roll, name, group, college, district, whatsapp })
      });

      const data = await res.json();

      if (!res.ok || !data.success) {
        throw new Error(data.message || 'শিক্ষার্থী যুক্ত করা যায়নি।');
      }

      showAlert(studentAlert, `🎉 ${data.message}`, 'success');
      addStudentForm.reset();

      // Switch to Approved tab so admin sees the new student right away
      const approvedTabBtn = document.getElementById('approvedSubTabBtn');
      if (approvedTabBtn) {
        const tab = new bootstrap.Tab(approvedTabBtn);
        tab.show();
      }

      // Refresh list & stats
      await loadStudents();
      loadStats();

    } catch (err) {
      showAlert(studentAlert, `<i class="fa-solid fa-triangle-exclamation me-1"></i> ${err.message}`, 'danger');
    } finally {
      btn.disabled = false;
      btn.innerHTML = '<i class="fa-solid fa-user-plus me-1"></i> শিক্ষার্থী যুক্ত করুন (সরাসরি Approved)';
    }
  });

  // Delete Student
  async function deleteStudent(identifier, name, roll) {
    if (!confirm(`আপনি কি নিশ্চিত যে "${name}" (রোল: ${roll || identifier})-কে শিক্ষার্থী তালিকা থেকে মুছে ফেলতে চান?`)) {
      return;
    }

    try {
      const res = await fetch(`/api/admin/students/${encodeURIComponent(identifier)}`, {
        method: 'DELETE'
      });

      const data = await res.json();
      if (!res.ok || !data.success) {
        throw new Error(data.message || 'মুছে ফেলা সম্ভব হয়নি।');
      }

      showAlert(studentAlert, `শিক্ষার্থী "${name}" সফলভাবে মুছে ফেলা হয়েছে।`, 'info');
      
      // Update local storage backup to ensure deleted student NEVER returns
      const cleanId = String(identifier).trim().toLowerCase();
      cachedStudents = cachedStudents.filter(s =>
        !( (s.id && String(s.id).trim().toLowerCase() === cleanId) ||
           (s.roll && String(s.roll).trim().toLowerCase() === cleanId) )
      );
      saveLocalBackupStudents(cachedStudents);

      await loadStudents();
      loadStats();
    } catch (err) {
      alert(`ত্রুটি: ${err.message}`);
    }
  }

  // Backup & Restore Handlers (Export / Import JSON)
  const exportBackupBtn = document.getElementById('exportBackupBtn');
  const importBackupBtn = document.getElementById('importBackupBtn');
  const importBackupFileInput = document.getElementById('importBackupFileInput');

  if (exportBackupBtn) {
    exportBackupBtn.addEventListener('click', () => {
      const dataStr = "data:text/json;charset=utf-8," + encodeURIComponent(JSON.stringify(cachedStudents, null, 2));
      const downloadAnchor = document.createElement('a');
      downloadAnchor.setAttribute("href", dataStr);
      downloadAnchor.setAttribute("download", `nu_crackers_students_backup_${new Date().toISOString().slice(0,10)}.json`);
      document.body.appendChild(downloadAnchor);
      downloadAnchor.click();
      downloadAnchor.remove();
      showAlert(studentAlert, '<i class="fa-solid fa-download me-1"></i> শিক্ষার্থীদের ব্যাকআপ ফাইল সফলভাবে ডাউনলোড হয়েছে!', 'success');
    });
  }

  // Google Sheet Sync & Export Handlers
  const googleSheetSyncModalEl = document.getElementById('googleSheetSyncModal');
  const googleSheetWebhookInput = document.getElementById('googleSheetWebhookInput');
  const saveGoogleSheetWebhookBtn = document.getElementById('saveGoogleSheetWebhookBtn');
  const triggerGoogleSheetSyncBtn = document.getElementById('triggerGoogleSheetSyncBtn');
  const exportGoogleSheetCsvBtn = document.getElementById('exportGoogleSheetCsvBtn');
  const sheetSyncApprovedCount = document.getElementById('sheetSyncApprovedCount');
  const sheetWebhookStatus = document.getElementById('sheetWebhookStatus');
  const copyAppsScriptBtn = document.getElementById('copyAppsScriptBtn');

  // Load saved Google Sheet Webhook URL
  const loadSheetSettings = async () => {
    try {
      const res = await fetch('/api/admin/google-sheet-settings');
      const data = await res.json();
      if (data && data.webhookUrl && googleSheetWebhookInput) {
        googleSheetWebhookInput.value = data.webhookUrl;
      }
    } catch (e) {
      console.warn('Could not load sheet settings:', e);
    }
  };

  if (googleSheetSyncModalEl) {
    googleSheetSyncModalEl.addEventListener('show.bs.modal', () => {
      const approved = (cachedStudents || []).filter(s => s.status === 'approved' || !!s.roll);
      if (sheetSyncApprovedCount) {
        sheetSyncApprovedCount.textContent = approved.length;
      }
      loadSheetSettings();
    });
  }

  // Save Webhook URL
  if (saveGoogleSheetWebhookBtn && googleSheetWebhookInput) {
    saveGoogleSheetWebhookBtn.addEventListener('click', async () => {
      const url = (googleSheetWebhookInput.value || '').trim();
      try {
        saveGoogleSheetWebhookBtn.disabled = true;
        saveGoogleSheetWebhookBtn.innerHTML = '<span class="spinner-border spinner-border-sm me-1"></span> সেভ হচ্ছে...';

        const res = await fetch('/api/admin/google-sheet-settings', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ webhookUrl: url })
        });
        const data = await res.json();
        if (data.success) {
          if (sheetWebhookStatus) {
            sheetWebhookStatus.innerHTML = '<span class="text-success"><i class="fa-solid fa-circle-check me-1"></i> Webhook URL সফলভাবে সেভ হয়েছে!</span>';
          }
        } else {
          throw new Error(data.message || 'সেভ করা যায়নি');
        }
      } catch (err) {
        if (sheetWebhookStatus) {
          sheetWebhookStatus.innerHTML = `<span class="text-danger"><i class="fa-solid fa-circle-exclamation me-1"></i> ${err.message}</span>`;
        }
      } finally {
        saveGoogleSheetWebhookBtn.disabled = false;
        saveGoogleSheetWebhookBtn.innerHTML = '<i class="fa-solid fa-floppy-disk me-1"></i> সেভ করুন';
      }
    });
  }

  // Trigger Google Sheet Sync
  if (triggerGoogleSheetSyncBtn) {
    triggerGoogleSheetSyncBtn.addEventListener('click', async () => {
      const webhookUrl = (googleSheetWebhookInput ? googleSheetWebhookInput.value : '').trim();
      if (!webhookUrl) {
        alert('অনুগ্রহ করে প্রথমে আপনার গুগল শিট Webhook URL টি ইনপুট বক্সে দিন।');
        if (googleSheetWebhookInput) googleSheetWebhookInput.focus();
        return;
      }

      const approved = (cachedStudents || []).filter(s => s.status === 'approved' || !!s.roll);
      if (approved.length === 0) {
        alert('সিঙ্ক করার মতো কোনো অনুমোদিত শিক্ষার্থী নেই।');
        return;
      }

      try {
        triggerGoogleSheetSyncBtn.disabled = true;
        triggerGoogleSheetSyncBtn.innerHTML = '<span class="spinner-border spinner-border-sm me-2"></span> গুগল শিটে পাঠানো হচ্ছে...';

        const res = await fetch('/api/admin/sync-google-sheet', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ webhookUrl })
        });

        const data = await res.json();
        if (!res.ok || !data.success) {
          throw new Error(data.message || 'সিঙ্ক ব্যর্থ হয়েছে');
        }

        alert(`🎉 ${data.message}`);
        if (sheetWebhookStatus) {
          sheetWebhookStatus.innerHTML = `<span class="text-success fw-bold"><i class="fa-solid fa-circle-check me-1"></i> ${data.message} (${new Date().toLocaleTimeString('bn-BD')})</span>`;
        }
      } catch (err) {
        alert(`ত্রুটি: ${err.message}`);
        if (sheetWebhookStatus) {
          sheetWebhookStatus.innerHTML = `<span class="text-danger"><i class="fa-solid fa-circle-exclamation me-1"></i> ${err.message}</span>`;
        }
      } finally {
        triggerGoogleSheetSyncBtn.disabled = false;
        triggerGoogleSheetSyncBtn.innerHTML = '<i class="fa-solid fa-arrows-rotate me-2"></i> এখনই গুগল শিটে ডাটা পাঠান (Sync to Google Sheet)';
      }
    });
  }

  // Instant 1-Click CSV Export for Google Sheets & Excel
  if (exportGoogleSheetCsvBtn) {
    exportGoogleSheetCsvBtn.addEventListener('click', () => {
      const approved = (cachedStudents || []).filter(s => s.status === 'approved' || !!s.roll);
      if (approved.length === 0) {
        alert('ডাউনলোড করার মতো কোনো অনুমোদিত শিক্ষার্থী নেই।');
        return;
      }

      const headers = ['রোল নম্বর', 'শিক্ষার্থীর নাম', 'কলেজ', 'জেলা', 'বিভাগ', 'হোয়াটসঅ্যাপ', 'পেমেন্ট মেথড', 'প্রেরক নম্বর', 'TrxID', 'অনুমোদনের তারিখ'];
      const rows = approved.map(s => [
        `"${(s.roll || '').replace(/"/g, '""')}"`,
        `"${(s.name || '').replace(/"/g, '""')}"`,
        `"${(s.college || '').replace(/"/g, '""')}"`,
        `"${(s.district || '').replace(/"/g, '""')}"`,
        `"${(s.group || '').replace(/"/g, '""')}"`,
        `"${(s.whatsapp || '').replace(/"/g, '""')}"`,
        `"${(s.paymentMethod || '').replace(/"/g, '""')}"`,
        `"${(s.paymentNumber || '').replace(/"/g, '""')}"`,
        `"${(s.transactionId || '').replace(/"/g, '""')}"`,
        `"${(s.approvedAt ? new Date(s.approvedAt).toLocaleString('bn-BD') : (s.registeredAt || '')).replace(/"/g, '""')}"`
      ]);

      const csvContent = '\uFEFF' + [headers.join(','), ...rows.map(r => r.join(','))].join('\r\n');
      const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `nu_crackers_approved_students_${new Date().toISOString().slice(0, 10)}.csv`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    });
  }

  // Copy Apps Script Code button
  if (copyAppsScriptBtn) {
    copyAppsScriptBtn.addEventListener('click', () => {
      const codeBlock = document.getElementById('appsScriptCodeBlock');
      if (codeBlock) {
        navigator.clipboard.writeText(codeBlock.innerText).then(() => {
          const original = copyAppsScriptBtn.innerHTML;
          copyAppsScriptBtn.innerHTML = '<i class="fa-solid fa-check me-1"></i> কপি হয়েছে!';
          copyAppsScriptBtn.classList.replace('btn-outline-light', 'btn-success');
          setTimeout(() => {
            copyAppsScriptBtn.innerHTML = original;
            copyAppsScriptBtn.classList.replace('btn-success', 'btn-outline-light');
          }, 2000);
        });
      }
    });
  }

  if (importBackupBtn && importBackupFileInput) {
    importBackupBtn.addEventListener('click', () => {
      importBackupFileInput.click();
    });

    importBackupFileInput.addEventListener('change', (e) => {
      const file = e.target.files[0];
      if (!file) return;

      const reader = new FileReader();
      reader.onload = async (event) => {
        try {
          const imported = JSON.parse(event.target.result);
          if (!Array.isArray(imported)) {
            throw new Error('ব্যাকআপ ফাইলের ফরম্যাট সঠিক নয় (এটি শিক্ষার্থীদের লিস্ট হতে হবে)।');
          }

          if (!confirm(`আপনি কি এই ব্যাকআপ থেকে মোট ${imported.length} জন শিক্ষার্থীকে রিস্টোর করতে চান?`)) {
            return;
          }

          // Force replace to server
          const res = await fetch('/api/admin/students/bulk-replace', {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ students: imported })
          });

          const resData = await res.json();
          if (!res.ok || !resData.success) {
            throw new Error(resData.message || 'রিস্টোর করা যায়নি।');
          }

          saveLocalBackupStudents(imported);
          showAlert(studentAlert, `🎉 রিস্টোর সফল! মোট ${imported.length} জন শিক্ষার্থী ডাটাবেজে স্থায়ীভাবে পুনরুদ্ধার হয়েছে।`, 'success');
          await loadStudents();
          loadStats();

        } catch (err) {
          showAlert(studentAlert, `<i class="fa-solid fa-triangle-exclamation me-1"></i> রিস্টোর ব্যর্থ হয়েছে: ${err.message}`, 'danger');
        } finally {
          importBackupFileInput.value = '';
        }
      };
      reader.readAsText(file);
    });
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
      const isFree = ex.isFree === true || ex.batch === 'free';
      const batchTag = isFree ? '🎁 [FREE]' : '💎 [PREMIUM]';
      const groupEmoji = ex.group === 'science' ? '🔬' : ex.group === 'arts' ? '🎨' : ex.group === 'commerce' ? '📊' : '🌐';
      const qCount = (ex.questions || []).length;
      const duration = ex.durationMinutes || ex.duration || 15;
      return `<option value="${ex.id}">${batchTag} ${groupEmoji} [${ex.group.toUpperCase()}] ${escapeHtml(ex.title)} (${qCount}টি প্রশ্ন, ${duration} মি.)</option>`;
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
      importTargetExamSelect.value = currentSelectedExamId;
    }
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
    const isFree = exam.isFree === true || exam.batch === 'free';
    const batchBadge = isFree
      ? '<span class="badge bg-success rounded-pill px-3 py-2"><i class="fa-solid fa-gift me-1"></i>ফ্রি ব্যাচ (Free Live Exam)</span>'
      : '<span class="badge bg-primary rounded-pill px-3 py-2"><i class="fa-solid fa-gem me-1"></i>প্রিমিয়াম ব্যাচ</span>';
    const groupName = exam.group === 'science' ? 'বিজ্ঞান' : exam.group === 'arts' ? 'মানবিক' : exam.group === 'commerce' ? 'ব্যবসায় শিক্ষা' : 'সকল ইউনিট';
    const duration = exam.durationMinutes || exam.duration || 15;
    const marks = (exam.totalMarks !== undefined && exam.totalMarks !== null && !isNaN(exam.totalMarks))
      ? exam.totalMarks
      : ((exam.questions && exam.questions.length) ? exam.questions.length : 0);

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

    document.getElementById('btnQuickEditDuration')?.addEventListener('click', async () => {
      const currentMin = exam.durationMinutes || exam.duration || 15;
      const input = prompt(`"${exam.title}" পরীক্ষার জন্য কত মিনিট সময় নির্ধারণ করতে চান?`, currentMin);
      if (input === null) return;
      const newMins = parseInt(input.trim(), 10);
      if (isNaN(newMins) || newMins < 1) {
        alert('অনুগ্রহ করে সঠিক সংখ্যা (১ বা তার বেশি মিনিট) লিখুন।');
        return;
      }
      try {
        const res = await fetch(`/api/admin/exams/${exam.id}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ durationMinutes: newMins, duration: newMins })
        });
        const d = await res.json();
        if (!res.ok || !d.success) throw new Error(d.message || 'সময় আপডেট করা যায়নি।');
        exam.durationMinutes = newMins;
        exam.duration = newMins;
        renderSelectedExamQuestions();
        alert(`✅ "${exam.title}" পরীক্ষার সময় সফলভাবে ${newMins} মিনিট সেট করা হয়েছে!`);
      } catch (err) {
        alert('ত্রুটি: ' + err.message);
      }
    });

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
              const targetCorrect = q.correctIndex !== undefined ? Number(q.correctIndex) : Number(q.correctAnswer);
              const isCorrect = targetCorrect === optIdx;
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
          correctAnswer: correctIndex, // Compatibility with Render backend check
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

    const batch = document.getElementById('newExamBatch') ? document.getElementById('newExamBatch').value : 'premium';
    const isFree = batch === 'free';
    const group = document.getElementById('newExamGroup').value;
    const title = document.getElementById('newExamTitle').value.trim();
    const subject = document.getElementById('newExamSubject').value.trim();
    const durationMinutes = parseInt(document.getElementById('newExamDuration').value) || 15;
    const passMarks = parseInt(document.getElementById('newExamPassMarks').value) || 5;
    const negativeMark = 0;
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
          batch,
          isFree,
          group,
          title,
          subject,
          duration: durationMinutes,
          durationMinutes,
          totalMarks: 0,
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

          const passMarks = s.passMarks !== undefined ? Number(s.passMarks) : 5;
          const isPassed = s.isPassed !== undefined ? Boolean(s.isPassed) : (Number(s.score || 0) >= passMarks);

          return `
            <tr>
              <td class="text-muted small">${idx + 1}</td>
              <td>
                <span class="badge bg-light text-dark border fw-bold"><code>${escapeHtml(s.roll || 'N/A')}</code></span>
              </td>
              <td>
                <div class="fw-semibold text-dark">${escapeHtml(s.name || 'শিক্ষার্থী')}</div>
                ${s.college ? `<div class="text-muted" style="font-size: 0.75rem;">${escapeHtml(s.college)}</div>` : ''}
              </td>
              <td class="small text-muted">${escapeHtml(s.examTitle || 'মডেল টেস্ট')}</td>
              <td>
                <span class="badge bg-primary px-2 py-1 fs-6">${s.score} / ${s.totalMarks}</span>
                ${isPassed ? '<span class="badge bg-success bg-opacity-10 text-success ms-1">পাস</span>' : '<span class="badge bg-danger bg-opacity-10 text-danger ms-1">ফেল</span>'}
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
      const formattedQuestions = stagedImportQuestions.map(q => ({
        ...q,
        correctAnswer: q.correctIndex !== undefined ? q.correctIndex : q.correctAnswer
      }));

      const res = await fetch(`/api/admin/exams/${targetExamId}/bulk-questions`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ questions: formattedQuestions })
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
