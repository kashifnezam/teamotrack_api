// ==========================================================
// TeamoTrack
// login.js
// Login Page
// ==========================================================

import { loginUser } from './auth.js';

console.log('TeamoTrack Login.js loaded');

// ==========================================================
// INITIALIZE LOGIN
// ==========================================================

function initializeLogin() {
  console.log('Login page initialized');

  // ======================================================
  // GET ELEMENTS
  // ======================================================

  const form = document.getElementById('loginForm');
  const email = document.getElementById('email');
  const password = document.getElementById('password');
  const loginBtn = document.getElementById('loginBtn');
  const togglePassword = document.getElementById('togglePassword');

  // ======================================================
  // VALIDATE ELEMENTS
  // ======================================================

  if (!form || !email || !password || !loginBtn) {
    console.error('Login form elements not found.', {
      form,
      email,
      password,
      loginBtn,
    });

    return;
  }

  console.log('Login form found');

  // ======================================================
  // LOGIN ALERT
  // ======================================================

  const loginAlert = sessionStorage.getItem('loginAlert');

  if (loginAlert) {
    AppAlert.warning(loginAlert, 'Login Required');

    sessionStorage.removeItem('loginAlert');
  }

  // ======================================================
  // LOGIN SUBMIT
  // ======================================================

  form.addEventListener('submit', async function (e) {
    e.preventDefault();

    console.log('Login form submitted');

    // --------------------------------------------------
    // Disable button
    // --------------------------------------------------

    loginBtn.disabled = true;

    loginBtn.innerHTML = `
            <span
                class="spinner-border spinner-border-sm me-2"
                aria-hidden="true">
            </span>
            Signing in...
        `;

    try {
      // ==================================================
      // FIREBASE AUTHENTICATION
      // ==================================================

      const result = await loginUser(email.value.trim(), password.value);

      console.log('Firebase login successful');

      // ==================================================
      // AUTHORIZE USER THROUGH NESTJS
      // ==================================================

      const response = await fetch('/auth/me', {
        method: 'GET',

        headers: {
          Authorization: `Bearer ${result.token}`,
        },
      });

      // ==================================================
      // PARSE RESPONSE
      // ==================================================

      const userData = await response.json();

      // ==================================================
      // CHECK AUTHORIZATION
      // ==================================================

      if (!response.ok) {
        throw new Error(userData?.message || 'You are not authorized to access this dashboard.');
      }

      // ==================================================
      // STORE APPLICATION USER DATA
      // ==================================================

      localStorage.setItem('userData', JSON.stringify(userData));

      console.log('Application authorization successful');

      // ==================================================
      // SUCCESS ALERT
      // ==================================================

      await AppAlert.success('Login successful. Welcome back!', 'Welcome!');

      // ==================================================
      // REDIRECT
      // ==================================================

      window.location.href = '/dashboard';
    } catch (error) {
      console.error('LOGIN ERROR:', error);

      await AppAlert.error(error?.message || 'Unable to login. Please try again.', 'Login Failed');
    } finally {
      // ==================================================
      // RESTORE BUTTON
      // ==================================================

      loginBtn.disabled = false;

      loginBtn.innerHTML = 'Login';
    }
  });

  // ======================================================
  // PASSWORD VISIBILITY
  // ======================================================

  if (togglePassword) {
    togglePassword.addEventListener('click', function () {
      const icon = togglePassword.querySelector('i');

      if (password.type === 'password') {
        password.type = 'text';

        icon.classList.remove('fa-eye-slash');

        icon.classList.add('fa-eye');

        togglePassword.setAttribute('aria-label', 'Hide password');
      } else {
        password.type = 'password';

        icon.classList.remove('fa-eye');

        icon.classList.add('fa-eye-slash');

        togglePassword.setAttribute('aria-label', 'Show password');
      }
    });
  }

  console.log('Login initialization completed');
}

// ==========================================================
// START
// ==========================================================

initializeLogin();
