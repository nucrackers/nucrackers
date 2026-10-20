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
        showAlert('<i class="fa-solid fa-triangle-exclamation me-1"></i> à¦…à¦¨à§à¦—à§à¦°à¦¹ à¦•à¦°à§‡ à¦†à¦ªà¦¨à¦¾à¦° à§®-à¦¡à¦¿à¦œà¦¿à¦Ÿ à¦•à§à¦°à§à¦¯à¦¾à¦• à¦°à§‹à¦² à¦¨à¦®à§à¦¬à¦° à¦²à¦¿à¦–à§à¦¨à¥¤', 'danger');
        rollInput.focus();
        return;
      }

      const normalState = submitBtn.querySelector('.normal-state');
      const loadingState = submitBtn.querySelector('.loading-state');
      normalState.classList.add('d-none');
      loadingState.classList.remove('d-none');
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
          throw new Error('à¦¸à¦¾à¦°à§à¦­à¦¾à¦°à§‡à¦° à¦¸à¦¾à¦¥à§‡ à¦¸à¦‚à¦¯à§‹à¦— à¦¸à§à¦¥à¦¾à¦ªà¦¨ à¦•à¦°à¦¾ à¦¯à¦¾à§Ÿà¦¨à¦¿à¥¤ à¦…à¦¨à§à¦—à§à¦°à¦¹ à¦•à¦°à§‡ à¦•à¦¿à¦›à§à¦•à§à¦·à¦£ à¦ªà¦° à¦†à¦¬à¦¾à¦° à¦šà§‡à¦·à§à¦Ÿà¦¾ à¦•à¦°à§à¦¨à¥¤');
        }

        if (!res.ok || !data.success) {
          throw new Error(data.message || 'à¦•à§à¦°à§à¦¯à¦¾à¦• à¦¬à§à¦¯à¦¾à¦š à¦²à¦—à¦‡à¦¨ à¦¬à§à¦¯à¦°à§à¦¥ à¦¹à§Ÿà§‡à¦›à§‡à¥¤');
        }

        // Store student session in localStorage
        localStorage.setItem('nu_student', JSON.stringify(data.student));

        const groupNames = {
          science: 'à¦¬à¦¿à¦œà§à¦žà¦¾à¦¨ à¦¬à¦¿à¦­à¦¾à¦— (Science)',
          arts: 'à¦®à¦¾à¦¨à¦¬à¦¿à¦• à¦¬à¦¿à¦­à¦¾à¦— (Arts)',
          commerce: 'à¦¬à§à¦¯à¦¬à¦¸à¦¾à§Ÿ à¦¶à¦¿à¦•à§à¦·à¦¾ à¦¬à¦¿à¦­à¦¾à¦— (Commerce)'
        };

        const isCrackStudent = data.student.batch === 'crack' || (String(data.student.roll).startsWith('7') || String(data.student.roll).startsWith('8') || String(data.student.roll).startsWith('9'));

        if (!isCrackStudent) {
          // A premium student logged in through the crack portal
          showAlert(
            `ðŸ’Ž <strong>à¦¸à§à¦¬à¦¾à¦—à¦¤à¦®, ${data.student.name}!</strong> à¦†à¦ªà¦¨à¦¿ à¦ªà§à¦°à¦¿à¦®à¦¿à§Ÿà¦¾à¦® à¦¬à§à¦¯à¦¾à¦šà§‡à¦° à¦¶à¦¿à¦•à§à¦·à¦¾à¦°à§à¦¥à§€à¥¤ à¦†à¦ªà¦¨à¦¾à¦•à§‡ à¦ªà§à¦°à¦¿à¦®à¦¿à§Ÿà¦¾à¦® à¦¬à§à¦¯à¦¾à¦š à¦ªà§‹à¦°à§à¦Ÿà¦¾à¦²à§‡ à¦¨à¦¿à§Ÿà§‡ à¦¯à¦¾à¦“à§Ÿà¦¾ à¦¹à¦šà§à¦›à§‡...`,
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
          `âš¡ <strong>à¦¸à§à¦¬à¦¾à¦—à¦¤à¦®, ${data.student.name}!</strong> à¦†à¦ªà¦¨à¦¾à¦° à¦•à§à¦°à§à¦¯à¦¾à¦• à¦¬à§à¦¯à¦¾à¦š à¦…à¦¨à§à¦®à§‹à¦¦à¦¿à¦¤ (${groupNames[data.student.group] || data.student.group})à¥¤ à¦¸à¦°à¦¾à¦¸à¦°à¦¿ à¦•à§à¦°à§à¦¯à¦¾à¦• à¦¬à§à¦¯à¦¾à¦š à¦²à¦¾à¦‡à¦­ à¦à¦•à§à¦¸à¦¾à¦® à¦ªà§‹à¦°à§à¦Ÿà¦¾à¦²à§‡ à¦¨à¦¿à§Ÿà§‡ à¦¯à¦¾à¦“à§Ÿà¦¾ à¦¹à¦šà§à¦›à§‡...`,
          'success'
        );

        setTimeout(() => {
          const target = data.targetPage || `crack-exams.html?group=${data.student.group || 'science'}`;
          window.location.href = target;
        }, 700);

      } catch (err) {
        showAlert(`<i class="fa-solid fa-triangle-exclamation me-1"></i> ${err.message}`, 'danger');
      } finally {
        normalState.classList.remove('d-none');
        loadingState.classList.add('d-none');
        submitBtn.disabled = false;
      }
    });
  }
});
