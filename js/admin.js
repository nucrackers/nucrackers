// NU Crackers Admin Panel Management System
document.addEventListener('DOMContentLoaded', () => {
  // Elements
  const adminLoginCard = document.getElementById('adminLoginCard');
  const adminDashboard = document.getElementById('adminDashboard');
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
        throw new Error(`সার্ভার থেকে এইচটিএমএল রেসপন্স এসেছে [স্ট্যাটাস: ${res.status}]। সার্ভারটি ঠিকঠাক চালু আছে কিনা দেখুন।`);
      }
      throw new Error(text || `সার্ভার এরর [স্ট্যাটাস: ${res.status}]`);
    }
  }

  // Escape HTML helper
  function escapeHtml(str) {
    if (!str) return '';
    return String(str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
  }

  // Tab & Content Elements
  const statsTotalStudents = document.getElementById('statsTotalStudents');
  const statsScienceStudents = document.getElementById('statsScienceStudents');
  const statsArtsStudents = document.getElementById('statsArtsStudents');
  const statsCommerceStudents = document.getElementById('statsCommerceStudents');
  const statsTotalExams = document.getElementById('statsTotalExams');

  const studentCountBadge = document.getElementById('studentCountBadge');
  const studentTableBody = document.getElementById('studentTableBody');
  const studentSearchInput = document.getElementById('studentSearchInput');
  const studentFilterGroup = document.getElementById('studentFilterGroup');
  const addStudentForm = document.getElementById('addStudentForm');
  const studentAlert = document.getElementById('studentAlert');

  // Check Local Admin Session
  checkAdminAuth();

  function checkAdminAuth() {
    const token = sessionStorage.getItem('nu_admin_token');
    if (token === 'nu-admin-authorized-token') {
      adminLoginCard.classList.add('d-none');
      adminDashboard.classList.remove('d-none');
      loadStats();
      loadStudents();
    } else {
      adminLoginCard.classList.remove('d-none');
      adminDashboard.classList.add('d-none');
    }
  }

  // Handle Admin Login
  if (adminLoginForm) {
    adminLoginForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      if (adminLoginAlert) adminLoginAlert.classList.add('d-none');
      const password = adminPassInput.value.trim().replace(/^["']|["']$/g, '');
      if (!password) {
        showLoginAlert('অনুগ্রহ করে এডমিন পাসওয়ার্ড প্রদান করুন।', 'danger');
        return;
      }

      try {
        const res = await fetch('/api/admin/login', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ password })
        });

        const data = await safeJson(res);
        if (!res.ok || !data.success) {
          throw new Error(data.message || 'ভুল পাসওয়ার্ড!');
        }

        sessionStorage.setItem('nu_admin_token', data.token);
        adminLoginForm.reset();
        checkAdminAuth();
      } catch (err) {
        showLoginAlert(err.message, 'danger');
      }
    });
  }

  // Handle Logout
  if (logoutBtn) {
    logoutBtn.addEventListener('click', (e) => {
      e.preventDefault();
      if (confirm('আপনি কি এডমিন প্যানেল থেকে লগআউট করতে চান?')) {
        sessionStorage.removeItem('nu_admin_token');
        checkAdminAuth();
      }
    });
  }

  function showLoginAlert(msg, type) {
    if (!adminLoginAlert) return;
    adminLoginAlert.className = `alert alert-${type} py-2 small mb-3`;
    adminLoginAlert.innerHTML = `<i class="fa-solid fa-circle-exclamation me-1"></i>${msg}`;
    adminLoginAlert.classList.remove('d-none');
  }

  // 1. STATS
  async function loadStats() {
    try {
      const res = await fetch('/api/admin/stats');
      const data = await safeJson(res);
      if (data.success && data.stats) {
        const s = data.stats;
        if (statsTotalStudents) statsTotalStudents.textContent = s.totalStudents || 0;
        if (statsScienceStudents) statsScienceStudents.textContent = s.scienceCount || 0;
        if (statsArtsStudents) statsArtsStudents.textContent = s.artsCount || 0;
        if (statsCommerceStudents) statsCommerceStudents.textContent = s.commerceCount || 0;
        if (statsTotalExams) statsTotalExams.textContent = `${s.totalExams || 0} / ${s.totalQuestions || 0}`;
      }
    } catch (err) {
      console.warn('Failed to load stats:', err.message);
    }
  }

  // 2. STUDENTS LIST
  let allStudents = [];

  async function loadStudents() {
    try {
      if (studentTableBody) {
        studentTableBody.innerHTML = `<tr><td colspan="8" class="text-center py-4 text-muted"><div class="spinner-border spinner-border-sm text-primary me-2"></div>শিক্ষার্থীদের তালিকা লোড হচ্ছে...</td></tr>`;
      }

      const res = await fetch('/api/admin/students');
      const data = await safeJson(res);
      if (data.success) {
        allStudents = data.students || [];
        renderStudentsTable();
      }
    } catch (err) {
      if (studentTableBody) {
        studentTableBody.innerHTML = `<tr><td colspan="8" class="text-center py-4 text-danger">তালিকা লোড করা সম্ভব হয়নি: ${err.message}</td></tr>`;
      }
    }
  }

  function renderStudentsTable() {
    if (!studentTableBody) return;
    const query = (studentSearchInput ? studentSearchInput.value : '').toLowerCase().trim();
    const groupFilter = studentFilterGroup ? studentFilterGroup.value : 'all';

    const filtered = allStudents.filter(s => {
      const matchQuery = (s.name && s.name.toLowerCase().includes(query)) ||
                         (s.roll && s.roll.toLowerCase().includes(query)) ||
                         (s.college && s.college.toLowerCase().includes(query)) ||
                         (s.district && s.district.toLowerCase().includes(query)) ||
                         (s.transactionId && s.transactionId.toLowerCase().includes(query)) ||
                         (s.whatsapp && s.whatsapp.toLowerCase().includes(query));

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

    if (studentCountBadge) studentCountBadge.textContent = `${filtered.length} জন`;

    if (filtered.length === 0) {
      studentTableBody.innerHTML = `<tr><td colspan="8" class="text-center py-4 text-muted"><i class="fa-regular fa-folder-open me-1 fs-5"></i> কোনো শিক্ষার্থী পাওয়া যায়নি।</td></tr>`;
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
              <button class="btn btn-success btn-sm rounded-pill px-3 py-1 me-1 approve-student-btn" 
                      data-id="${escapeHtml(studentIdentifier)}" 
                      data-name="${escapeHtml(s.name)}" 
                      data-group="${escapeHtml(s.group || 'science')}"
                      data-phone="${escapeHtml(s.whatsapp || '')}"
                      title="রেজিস্ট্রেশন অনুমোদন ও ৮-ডিজিট রোল বরাদ্দ করুন">
                <i class="fa-solid fa-check me-1"></i>অনুমোদন
              </button>
            ` : ''}
            <button class="btn btn-outline-danger btn-sm rounded-pill px-2 py-1 delete-student-btn" data-id="${escapeHtml(studentIdentifier)}" data-name="${escapeHtml(s.name)}" title="মুছে ফেলুন">
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
        const id = btn.getAttribute('data-id');
        const name = btn.getAttribute('data-name');
        const phone = btn.getAttribute('data-phone');
        const group = btn.getAttribute('data-group');
        approveStudent(id, name, phone, group);
      });
    });

    // Attach Delete Student listeners
    document.querySelectorAll('.delete-student-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        const id = btn.getAttribute('data-id');
        const name = btn.getAttribute('data-name');
        deleteStudent(id, name);
      });
    });
  }

  // Live filter / search listeners
  if (studentSearchInput) studentSearchInput.addEventListener('input', renderStudentsTable);
  if (studentFilterGroup) studentFilterGroup.addEventListener('change', renderStudentsTable);

  // Approve Pending Student (Handles empty roll gracefully)
  async function approveStudent(identifier, name, phone, group) {
    if (!confirm(`আপনি কি "${name}"-এর আবেদন অনুমোদন করতে চান? এটি শিক্ষার্থীকে স্বয়ংক্রিয়ভাবে ৮-ডিজিটের ইউনিক রোল প্রদান করবে।`)) {
      return;
    }
    try {
      const res = await fetch(`/api/admin/students/${encodeURIComponent(identifier)}/approve`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ identifier, year: '27' })
      });

      const data = await safeJson(res);
      if (!res.ok || !data.success) {
        throw new Error(data.message || 'অনুমোদন করা সম্ভব হয়নি।');
      }

      const allocatedRoll = data.student ? data.student.roll : '';
      alert(`🎉 শিক্ষার্থী "${name}" সফলভাবে অনুমোদিত হয়েছে!\nবরাদ্দকৃত রোল: ${allocatedRoll}`);

      // Optional WhatsApp Prompt
      if (phone) {
        const cleanPhone = phone.replace(/[^0-9]/g, '');
        const targetPhone = cleanPhone.startsWith('88') ? cleanPhone : `88${cleanPhone}`;
        const msg = encodeURIComponent(`অভিনন্দন ${name}! 🎉\nNU Crackers ব্যাচে আপনার ভর্তি নিশ্চিত হয়েছে।\n\nঅফিসিয়াল রোল নম্বর: ${allocatedRoll}\nলগইন লিংক: https://nucrackers.onrender.com/premium-login.html`);
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

  // Delete Student
  async function deleteStudent(identifier, name) {
    if (!confirm(`আপনি কি নিশ্চিতভাবে "${name}"-এর সকল তথ্য মুছে ফেলতে চান?`)) {
      return;
    }
    try {
      const res = await fetch(`/api/admin/students/${encodeURIComponent(identifier)}`, {
        method: 'DELETE'
      });
      const data = await safeJson(res);
      if (!res.ok || !data.success) {
        throw new Error(data.message || 'মুছে ফেলা সম্ভব হয়নি।');
      }
      alert('শিক্ষার্থীর তথ্য সফলভাবে মুছে ফেলা হয়েছে!');
      await loadStudents();
      loadStats();
    } catch (err) {
      alert(`ত্রুটি: ${err.message}`);
    }
  }

  // Add New Student Form Handler (Manual Entry)
  if (addStudentForm) {
    addStudentForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      const name = document.getElementById('newStudentName').value.trim();
      const roll = document.getElementById('newStudentRoll').value.trim();
      const group = document.getElementById('newStudentGroup').value;

      if (!name || !roll || !group) {
        alert('অনুগ্রহ করে নাম, রোল ও বিভাগ সঠিকভাবে লিখুন।');
        return;
      }

      try {
        const res = await fetch('/api/admin/students', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ name, roll, group })
        });

        const data = await safeJson(res);
        if (!res.ok || !data.success) {
          throw new Error(data.message || 'শিক্ষার্থী যোগ করা যায়নি।');
        }

        alert(`🎉 শিক্ষার্থী "${name}" সফলভাবে যুক্ত হয়েছে!`);
        addStudentForm.reset();
        await loadStudents();
        loadStats();
      } catch (err) {
        alert(`ত্রুটি: ${err.message}`);
      }
    });
  }
});
