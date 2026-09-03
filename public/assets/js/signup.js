// ==========================================================
// TeamoTrack
// signup.js
// Business Account Signup
// ==========================================================

import Api from './api.js';

document.addEventListener('DOMContentLoaded', () => {
  // ========================================================
  // ELEMENTS
  // ========================================================

  const form = document.getElementById('signupForm');

  const nameInput = document.getElementById('name');
  const mobileInput = document.getElementById('mobile');
  const emailInput = document.getElementById('email');

  const passwordInput = document.getElementById('password');
  const confirmPasswordInput = document.getElementById('confirmPassword');

  const togglePassword = document.getElementById('togglePassword');
  const toggleConfirmPassword = document.getElementById('toggleConfirmPassword');

  const termsInput = document.getElementById('terms');
  const signupBtn = document.getElementById('signupBtn');

  // ========================================================
  // ELEMENT CHECK
  // ========================================================

  if (!form) {
    console.error('Signup form not found.');
    return;
  }

  // ========================================================
  // PASSWORD VISIBILITY
  // ========================================================

  function setupPasswordToggle(toggleButton, input) {
    if (!toggleButton || !input) {
      console.error('Password toggle elements not found.', {
        toggleButton,
        input,
      });

      return;
    }

    toggleButton.addEventListener('click', (e) => {
      e.preventDefault();

      const icon = toggleButton.querySelector('i');

      if (!icon) {
        return;
      }

      const isPassword = input.type === 'password';

      input.type = isPassword ? 'text' : 'password';

      // Show password -> eye-slash
      // Hide password -> eye
      icon.classList.toggle('fa-eye-slash', isPassword);
      icon.classList.toggle('fa-eye', !isPassword);

      toggleButton.setAttribute(
        'aria-label',
        isPassword ? 'Hide password' : 'Show password',
      );
    });
  }

  setupPasswordToggle(togglePassword, passwordInput);

  setupPasswordToggle(toggleConfirmPassword, confirmPasswordInput);

  // ========================================================
  // HELPERS
  // ========================================================

  function getValue(input) {
    return input?.value?.trim() || '';
  }

  function isValidEmail(email) {
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
  }

  function isValidMobile(mobile) {
    // Allows +91 9876543210, 9876543210,
    // spaces, hyphens and parentheses.
    const cleaned = mobile.replace(/[\s\-()]/g, '');

    return /^\+?\d{10,15}$/.test(cleaned);
  }

  function setSubmitting(isSubmitting) {
    // Disable inputs and submit button only.
    // Password eye buttons must remain enabled.
    form.querySelectorAll('input').forEach((input) => {
      input.disabled = isSubmitting;
    });

    if (signupBtn) {
      signupBtn.disabled = isSubmitting;
    }
  }

  function focusInput(input) {
    if (!input) {
      return;
    }

    input.focus();
  }

  // ========================================================
  // VALIDATION
  // ========================================================

  function validateForm() {
    const fullName = getValue(nameInput);
    const mobile = getValue(mobileInput);
    const email = getValue(emailInput);
    const password = passwordInput?.value || '';
    const confirmPassword = confirmPasswordInput?.value || '';

    // ------------------------------------------------------
    // Full Name
    // ------------------------------------------------------

    if (!fullName) {
      focusInput(nameInput);

      AppAlert.warning(
        'Please enter your full name.',
        'Full Name Required',
      );

      return false;
    }

    if (fullName.length < 2) {
      focusInput(nameInput);

      AppAlert.warning(
        'Please enter a valid full name.',
        'Invalid Name',
      );

      return false;
    }

    // ------------------------------------------------------
    // Mobile
    // ------------------------------------------------------

    if (!mobile) {
      focusInput(mobileInput);

      AppAlert.warning(
        'Please enter your mobile number.',
        'Mobile Number Required',
      );

      return false;
    }

    if (!isValidMobile(mobile)) {
      focusInput(mobileInput);

      AppAlert.warning(
        'Please enter a valid mobile number.',
        'Invalid Mobile Number',
      );

      return false;
    }

    // ------------------------------------------------------
    // Email
    // ------------------------------------------------------

    if (!email) {
      focusInput(emailInput);

      AppAlert.warning(
        'Please enter your email address.',
        'Email Required',
      );

      return false;
    }

    if (!isValidEmail(email)) {
      focusInput(emailInput);

      AppAlert.warning(
        'Please enter a valid email address.',
        'Invalid Email',
      );

      return false;
    }

    // ------------------------------------------------------
    // Password
    // ------------------------------------------------------

    if (!password) {
      focusInput(passwordInput);

      AppAlert.warning(
        'Please create a password.',
        'Password Required',
      );

      return false;
    }

    if (password.length < 6) {
      focusInput(passwordInput);

      AppAlert.warning(
        'Password must be at least 6 characters long.',
        'Weak Password',
      );

      return false;
    }

    // ------------------------------------------------------
    // Confirm Password
    // ------------------------------------------------------

    if (!confirmPassword) {
      focusInput(confirmPasswordInput);

      AppAlert.warning(
        'Please confirm your password.',
        'Confirm Password',
      );

      return false;
    }

    if (password !== confirmPassword) {
      focusInput(confirmPasswordInput);

      AppAlert.warning(
        'Password and confirm password do not match.',
        'Passwords Do Not Match',
      );

      return false;
    }

    // ------------------------------------------------------
    // Terms
    // ------------------------------------------------------

    if (!termsInput?.checked) {
      AppAlert.warning(
        'Please agree to the Terms & Conditions to continue.',
        'Terms & Conditions',
      );

      return false;
    }

    return true;
  }

  // ========================================================
  // FORM SUBMIT
  // ========================================================

  form.addEventListener('submit', async (event) => {
    event.preventDefault();

    // ------------------------------------------------------
    // Validate
    // ------------------------------------------------------

    if (!validateForm()) {
      return;
    }

    const fullName = getValue(nameInput);
    const mobile = getValue(mobileInput);
    const email = getValue(emailInput);

    const password = passwordInput?.value || '';
    const confirmPassword = confirmPasswordInput?.value || '';

    // ------------------------------------------------------
    // Disable form
    // ------------------------------------------------------

    setSubmitting(true);

    // ------------------------------------------------------
    // Loading
    // ------------------------------------------------------

    AppAlert.loading('Creating your business account...');

    try {
      // ====================================================
      // CREATE ACCOUNT
      // ====================================================
      //
      // Do NOT send:
      // accountType
      // role
      // fieldValue
      //
      // These values are controlled by the backend.
      // ====================================================

      const result = await Api.postPublic('/auth/signup', {
        fullName,
        mobile,
        email,
        password,
        confirmPassword,
      });

      // ----------------------------------------------------
      // Close loading
      // ----------------------------------------------------

      AppAlert.close();

      // ----------------------------------------------------
      // Success
      // ----------------------------------------------------

      await AppAlert.success(
        result?.message ||
          'Your business account has been created successfully. Please verify your email before logging in.',
        'Account Created!',
      );

      // ----------------------------------------------------
      // Redirect to Login
      // ----------------------------------------------------

      window.location.href = '/login';
    } catch (error) {
      // ----------------------------------------------------
      // Close loading
      // ----------------------------------------------------

      AppAlert.close();

      console.error('Signup failed:', error);

      // ----------------------------------------------------
      // Error
      // ----------------------------------------------------

      await AppAlert.error(
        error?.message ||
          'Unable to create your account. Please try again.',
        'Signup Failed',
      );
    } finally {
      // ----------------------------------------------------
      // Restore form
      // ----------------------------------------------------

      setSubmitting(false);
    }
  });
});
