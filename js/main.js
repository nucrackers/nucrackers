
document.addEventListener("DOMContentLoaded", () => {
  // Current year in all footers
  document.querySelectorAll(".current-year").forEach(el => {
    el.textContent = new Date().getFullYear();
  });

  // Active navigation item
  const currentPage = location.pathname.split("/").pop() || "index.html";
  document.querySelectorAll(".navbar .nav-link").forEach(link => {
    const href = link.getAttribute("href");
    if (href === currentPage) link.classList.add("active");
  });

  // Contact form validation
  const contactForm = document.getElementById("contactForm");
  if (contactForm) {
    contactForm.addEventListener("submit", function(e){
      e.preventDefault();
      e.stopPropagation();

      if (!this.checkValidity()) {
        this.classList.add("was-validated");
        return;
      }

      const alertBox = document.getElementById("formAlert");
      alertBox.className = "alert alert-success mt-3";
      alertBox.textContent = "Thank you! Your message has been submitted successfully.";
      alertBox.classList.remove("d-none");
      this.reset();
      this.classList.remove("was-validated");
    });
  }

  // Login demo validation
  const loginForm = document.getElementById("loginForm");
  if(loginForm){
    loginForm.addEventListener("submit", function(e){
      e.preventDefault();
      if(!this.checkValidity()){
        this.classList.add("was-validated");
        return;
      }
      const msg = document.getElementById("loginMessage");
      msg.className = "alert alert-info mt-3";
      msg.textContent = "Demo login successful. Connect your backend/API here for real authentication.";
      msg.classList.remove("d-none");
    });
  }
});
