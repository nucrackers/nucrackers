document.addEventListener("DOMContentLoaded", () => {

  // ========================================
  // CURRENT YEAR
  // ========================================

  document.querySelectorAll(".current-year").forEach(el => {
    el.textContent = new Date().getFullYear();
  });


  // ========================================
  // ACTIVE NAVIGATION
  // ========================================

  const currentPage =
    location.pathname.split("/").pop() || "index.html";

  document.querySelectorAll(".navbar .nav-link").forEach(link => {

    const href = link.getAttribute("href");

    if (href === currentPage) {
      link.classList.add("active");
    }

  });


  // ========================================
  // CONTACT FORM -> WHATSAPP
  // ========================================

  const contactForm = document.getElementById("contactForm");

  if (contactForm) {

    contactForm.addEventListener("submit", function (e) {

      e.preventDefault();
      e.stopPropagation();


      // Validation
      if (!this.checkValidity()) {

        this.classList.add("was-validated");

        return;
      }


      // Get values
      const name =
        document.getElementById("contactName").value.trim();

      const phone =
        document.getElementById("contactPhone").value.trim();

      const email =
        document.getElementById("contactEmail").value.trim();

      const interest =
        document.getElementById("contactInterest").value;

      const group =
        document.getElementById("groupInterest").value;

      const message =
        document.getElementById("contactMessage").value.trim();


      // ====================================
      // YOUR WHATSAPP NUMBER
      // ====================================

      const whatsappNumber = "8801410910547";


      // ====================================
      // WHATSAPP MESSAGE
      // ====================================

      const whatsappMessage =
` New Message from NU Crackers Website
 Name: ${name}
 group :${group}
 Phone: ${phone}
 Email: ${email}
 Interested In: ${interest}

 Message:
${message}

━━━━━━━━━━━━━━━━━━
NU Crackers Website Contact Form`;


      // ====================================
      // ENCODE MESSAGE
      // ====================================

      const encodedMessage =
        encodeURIComponent(whatsappMessage);


      // ====================================
      // WHATSAPP URL
      // ====================================

      const whatsappURL =
        `https://wa.me/${whatsappNumber}?text=${encodedMessage}`;


      // ====================================
      // OPEN WHATSAPP
      // ====================================

      window.open(whatsappURL, "_blank");


      // ====================================
      // RESET FORM
      // ====================================

      this.reset();

      this.classList.remove("was-validated");

    });

  }


  // ========================================
  // LOGIN DEMO
  // ========================================

  const loginForm =
    document.getElementById("loginForm");

  if (loginForm) {

    loginForm.addEventListener("submit", function (e) {

      e.preventDefault();

      if (!this.checkValidity()) {

        this.classList.add("was-validated");

        return;

      }

      const msg =
        document.getElementById("loginMessage");

      msg.className =
        "alert alert-info mt-3";

      msg.textContent =
        "Demo login successful. Connect your backend/API here for real authentication.";

      msg.classList.remove("d-none");

    });

  }

});