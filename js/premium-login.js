// Premium Login JS for NU Crackers

document.addEventListener('DOMContentLoaded', () => {
  const loginForm = document.getElementById('loginForm');
  const alertBox = document.getElementById('alertBox');
  const loginRoll = document.getElementById('loginRoll');
  const loginName = document.getElementById('loginName');

  const redirectReason = sessionStorage.getItem('nu_login_redirect_reason');
  if (redirectReason) {
    showAlert(`<i class="fa-solid fa-circle-exclamation me-1"></i> ${redirectReason}`, 'warning');
    sessionStorage.removeItem('nu_login_redirect_reason');
  }

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

  function showAlert(message, type = 'danger') {
    alertBox.className = `alert alert-${type} py-2 px-3 small rounded-3 mb-3`;
    alertBox.innerHTML = message;
    alertBox.classList.remove('d-none');
  }

  function hideAlert() {
    alertBox.classList.add('d-none');
    alertBox.innerHTML = '';
  }

  if (loginForm) {
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

        localStorage.setItem('nu_student', JSON.stringify(data.student));

        showAlert(
          `🎉 <strong>স্বাগতম, ${data.student.name}!</strong> গ্রুপ পোর্টালে নিয়ে যাওয়া হচ্ছে...`,
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
  }
});
