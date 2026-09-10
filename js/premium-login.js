// Premium Login JS for NU Crackers

document.addEventListener('DOMContentLoaded', () => {
  const loginForm = document.getElementById('loginForm');
  const registerForm = document.getElementById('registerForm');
  const alertBox = document.getElementById('alertBox');
  const loginRoll = document.getElementById('loginRoll');
  const loginName = document.getElementById('loginName');
  const quickRollBtns = document.querySelectorAll('.quick-roll-btn');

  // Check if redirected with a notice
  const redirectReason = sessionStorage.getItem('nu_login_redirect_reason');
  if (redirectReason) {
    showAlert(`<i class="fa-solid fa-circle-exclamation me-1"></i> ${redirectReason}`, 'warning');
    sessionStorage.removeItem('nu_login_redirect_reason');
  }

  // Auto-fill from localStorage if student previously logged in
  const savedStudent = localStorage.getItem('nu_student');
  if (savedStudent) {
    try {
      const student = JSON.parse(savedStudent);
      if (student && student.roll) {
        loginRoll.value = student.roll;
      }
      if (student && student.name && loginName) {
        loginName.value = student.name;
      }
    } catch (e) {
      console.warn('Could not parse saved student');
    }
  }

  // Quick Demo Buttons
  quickRollBtns.forEach(btn => {
    btn.addEventListener('click', () => {
      const roll = btn.getAttribute('data-roll');
      const name = btn.getAttribute('data-name');
      if (roll) loginRoll.value = roll;
      if (name && loginName) loginName.value = name;
      loginRoll.focus();
    });
  });

  function showAlert(message, type = 'danger') {
    alertBox.className = `alert alert-${type} py-2 px-3 small rounded-3 mb-3`;
    alertBox.innerHTML = message;
    alertBox.classList.remove('d-none');
  }

  function hideAlert() {
    alertBox.classList.add('d-none');
    alertBox.innerHTML = '';
  }

  // Handle Login with Roll and Name
  loginForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    hideAlert();

    const roll = loginRoll.value.trim();
    const name = loginName ? loginName.value.trim() : '';

    if (!roll) {
      showAlert('অনুগ্রহ করে তোমার রোল নম্বরটি লেখো।', 'warning');
      return;
    }
    if (!name) {
      showAlert('অনুগ্রহ করে তোমার নাম লেখো।', 'warning');
      return;
    }

    const btn = document.getElementById('loginSubmitBtn');
    const normalState = btn.querySelector('.normal-state');
    const loadingState = btn.querySelector('.loading-state');

    normalState.classList.add('d-none');
    loadingState.classList.remove('d-none');
    btn.disabled = true;

    try {
      const res = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ roll, name })
      });

      const data = await res.json();

      if (!res.ok || !data.success) {
        throw new Error(data.message || 'লগইন ব্যর্থ হয়েছে।');
      }

      // Store student session in localStorage
      localStorage.setItem('nu_student', JSON.stringify(data.student));

      const groupNames = {
        science: 'বিজ্ঞান বিভাগ (Science)',
        arts: 'মানবিক বিভাগ (Arts)',
        commerce: 'ব্যবসায় শিক্ষা বিভাগ (Commerce)'
      };

      showAlert(
        `🎉 <strong>স্বাগতম, ${data.student.name}!</strong> তোমার গ্রুপ: <strong>${groupNames[data.student.group] || data.student.group}</strong>। সরাসরি তোমার গ্রুপ পোর্টালে নিয়ে যাওয়া হচ্ছে...`,
        'success'
      );

      setTimeout(() => {
        window.location.href = data.targetPage || 'index.html';
      }, 700);

    } catch (err) {
      showAlert(`<i class="fa-solid fa-triangle-exclamation me-1"></i> ${err.message}`, 'danger');
    } finally {
      normalState.classList.remove('d-none');
      loadingState.classList.add('d-none');
      btn.disabled = false;
    }
  });

  // Handle Registration (Awaiting Admin Approval)
  registerForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    hideAlert();

    const name = document.getElementById('regName').value.trim();
    const roll = document.getElementById('regRoll').value.trim();
    const group = document.getElementById('regGroup').value;

    if (!name || !roll || !group) {
      showAlert('নাম, রোল এবং গ্রুপ সবগুলো সঠিকভাবে পূরণ করুন।', 'warning');
      return;
    }

    const btn = document.getElementById('registerSubmitBtn');
    const normalState = btn.querySelector('.normal-state');
    const loadingState = btn.querySelector('.loading-state');

    normalState.classList.add('d-none');
    loadingState.classList.remove('d-none');
    btn.disabled = true;

    try {
      const res = await fetch('/api/auth/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ roll, name, group })
      });

      const data = await res.json();

      if (!res.ok || !data.success) {
        throw new Error(data.message || 'রেজিস্ট্রেশন জমা দিতে ব্যর্থ হয়েছে।');
      }

      // Pre-fill login inputs for future convenience
      loginRoll.value = roll;
      if (loginName) loginName.value = name;

      // Switch to login tab and display notice
      const loginTabBtn = document.getElementById('login-tab');
      if (loginTabBtn) {
        const tabTrigger = new bootstrap.Tab(loginTabBtn);
        tabTrigger.show();
      }

      showAlert(
        `✅ <strong>আবেদন সফলভাবে গৃহীত হয়েছে!</strong><br>${data.message}`,
        'success'
      );

    } catch (err) {
      showAlert(`<i class="fa-solid fa-triangle-exclamation me-1"></i> ${err.message}`, 'danger');
    } finally {
      normalState.classList.remove('d-none');
      loadingState.classList.add('d-none');
      btn.disabled = false;
    }
  });
});
