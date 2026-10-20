// NU Crackers - Dedicated Crack Batch Login JavaScript

document.addEventListener('DOMContentLoaded', () => {
  const form = document.getElementById('crackLoginForm');
  const alertBox = document.getElementById('alertBox');
  const rollInput = document.getElementById('loginRoll');
  const nameInput = document.getElementById('loginName');
  const submitBtn = document.getElementById('loginSubmitBtn');

  // Check if already logged in as a crack student
  const savedStudent = localStorage.getItem('nu_student');
  if (savedStudent) {
    try {
      const student = JSON.parse(savedStudent);
      const isCrack = student.batch === 'crack' || (String(student.roll).startsWith('7') || String(student.roll).startsWith('8') || String(student.roll).startsWith('9'));
      if (isCrack && student.status !== 'pending') {
        const group = student.group || 'science';
        window.location.replace(`crack-exams.html?group=${group}`);
        return;
      }
    } catch (e) {
      localStorage.removeItem('nu_student');
    }
  }

  // Display redirect reason from session if present
  const redirectReason = sessionStorage.getItem('nu_login_redirect_reason');
  if (redirectReason) {
    showAlert(`<i class="fa-solid fa-circle-info me-2 text-warning"></i>${redirectReason}`, 'warning');
    sessionStorage.removeItem('nu_login_redirect_reason');
  }

  function showAlert(message, type = 'info') {
    if (!alertBox) return;
    alertBox.className = `alert alert-${type} py-2 px-3 small rounded-3 mb-3`;
    alertBox.innerHTML = message;
    alertBox.classList.remove('d-none');
    alertBox.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  }

  function hideAlert() {
    if (!alertBox) return;
    alertBox.className = 'alert d-none';
    alertBox.innerHTML = '';
  }

  if (form) {
    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      hideAlert();

      const roll = rollInput.value.trim();
      const name = nameInput.value.trim();

      if (!roll) {
        showAlert('<i class="fa-solid fa-triangle-exclamation me-1"></i> অনুগ্রহ করে আপনার ৮-ডিজিট ক্র্যাক রোল নম্বর লিখুন।', 'danger');
        rollInput.focus();
        return;
      }

      const normalState = submitBtn.querySelector('.normal-state');
      const loadingState = submitBtn.querySelector('.loading-state');
      if (normalState) normalState.classList.add('d-none');
      if (loadingState) loadingState.classList.remove('d-none');
      submitBtn.disabled = true;

      try {
        const res = await fetch('/api/auth/login', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ roll, name })
        });

        let data;
        try {
          data = await res.json();
        } catch (jsonErr) {
          throw new Error('সার্ভারের সাথে সংযোগ স্থাপন করা যায়নি। অনুগ্রহ করে কিছুক্ষণ পর আবার চেষ্টা করুন।');
        }

        if (!res.ok || !data.success) {
          throw new Error(data.message || 'ক্র্যাক ব্যাচ লগইন ব্যর্থ হয়েছে।');
        }

        // Store student session in localStorage
        localStorage.setItem('nu_student', JSON.stringify(data.student));

        const groupNames = {
          science: 'বিজ্ঞান বিভাগ (Science)',
          arts: 'মানবিক বিভাগ (Arts)',
          commerce: 'ব্যবসা শিক্ষা বিভাগ (Commerce)'
        };

        const isCrackStudent = data.student.batch === 'crack' || (String(data.student.roll).startsWith('7') || String(data.student.roll).startsWith('8') || String(data.student.roll).startsWith('9'));

        if (!isCrackStudent) {
          // A premium student logged in through the crack portal
          showAlert(
            `💎 <strong>স্বাগতম, ${data.student.name}!</strong> আপনি প্রিমিয়াম ব্যাচের শিক্ষার্থী। আপনাকে প্রিমিয়াম ব্যাচ পোর্টালে নিয়ে যাওয়া হচ্ছে...`,
            'info'
          );
          setTimeout(() => {
            const premiumPages = {
              science: 'science-exams.html',
              arts: 'arts-exams.html',
              commerce: 'commerce-exams.html'
            };
            window.location.href = premiumPages[data.student.group] || 'science-exams.html';
          }, 800);
          return;
        }

        // Crack student login success
        showAlert(
          `⚡ <strong>স্বাগতম, ${data.student.name}!</strong> আপনার ক্র্যাক ব্যাচ অনুমোদিত (${groupNames[data.student.group] || data.student.group})। সরাসরি ক্র্যাক ব্যাচ লাইভ এক্সাম পোর্টালে নিয়ে যাওয়া হচ্ছে...`,
          'success'
        );

        setTimeout(() => {
          const target = data.targetPage || `crack-exams.html?group=${data.student.group || 'science'}`;
          window.location.href = target;
        }, 700);

      } catch (err) {
        showAlert(`<i class="fa-solid fa-triangle-exclamation me-1"></i> ${err.message}`, 'danger');
      } finally {
        if (normalState) normalState.classList.remove('d-none');
        if (loadingState) loadingState.classList.add('d-none');
        submitBtn.disabled = false;
      }
    });
  }
});
