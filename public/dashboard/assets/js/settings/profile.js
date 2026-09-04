/* ==========================================================
   TeamoTrack Settings
========================================================== */

(function () {
  'use strict';

  let data = null;

  // ==================================================
  // PROFILE PAGE
  // ==================================================

  window.initializeProfilePage = async function () {
    AppAlert.loading('Loading profile...');

    await loadProfileData();
    renderProfile();

    AppAlert.close();
  };

  // ==================================================
  // LOAD PROFILE DATA
  // ==================================================

  async function loadProfileData() {
    try {
      data = await Api.get('/settings/profile');
    } catch (error) {
      AppAlert.close();

      AppAlert.error(error?.message || 'Unable to load profile data');
    }
  }

  // ==================================================
  // PROFILE
  // ==================================================

  function renderProfile() {
    const profile = data?.profile;

    if (!profile) {
      return;
    }

    const fullName = document.getElementById('fullName');
    const email = document.getElementById('email');
    const mobile = document.getElementById('mobile');
    const role = document.getElementById('role');

    if (fullName) {
      fullName.value = profile.fullName || '';
    }

    if (email) {
      email.value = profile.email || '';
    }

    if (mobile) {
      mobile.value = profile.mobile || '';
    }

    if (role) {
      role.value = profile.role || '';
    }
  }

  // ==================================================
  // SAVE PROFILE
  // ==================================================

  window.saveProfile = async function () {
    const button = document.getElementById('saveProfileBtn');

    const fullName = document.getElementById('fullName')?.value.trim();
    const mobile = document.getElementById('mobile')?.value.trim();
    const password = document.getElementById('password')?.value || '';

    if (!fullName) {
      AppAlert.warning('Name is required');
      return;
    }

    if (!mobile) {
      AppAlert.warning('Mobile number is required');
      return;
    }

    if (password && password.length < 6) {
      AppAlert.warning('Password must be at least 6 characters long');
      return;
    }

    try {
      button.disabled = true;

      AppAlert.loading('Saving profile...');

      const payload = {
        fullName,
        mobile,
      };

      // Only send password if user entered a new password
      if (password) {
        payload.password = password;
      }

      await Api.patch('/settings/profile', payload);

      AppAlert.close();

      AppAlert.success('Profile updated successfully');

      if (data?.profile) {
        data.profile.fullName = fullName;
        data.profile.mobile = mobile;
        data.profile.mobile = mobile;
      }

      // Clear password after successful update
      const passwordInput = document.getElementById('password');

      if (passwordInput) {
        passwordInput.value = '';
      }
    } catch (error) {
      AppAlert.close();

      AppAlert.error(error?.message || 'Unable to update profile');
    } finally {
      button.disabled = false;
    }
  };

  // ==================================================
  // OPEN CHANGE EMAIL MODAL
  // ==================================================

  window.openChangeEmailModal = function () {
    const currentEmail = document.getElementById('email')?.value || '';

    const currentEmailInput = document.getElementById('currentEmail');

    const newEmailInput = document.getElementById('newEmail');

    const passwordInput = document.getElementById('emailCurrentPassword');

    if (currentEmailInput) {
      currentEmailInput.value = currentEmail;
    }

    if (newEmailInput) {
      newEmailInput.value = '';
    }

    if (passwordInput) {
      passwordInput.value = '';
    }

    const modalElement = document.getElementById('changeEmailModal');

    if (!modalElement) {
      return;
    }

    const modal = bootstrap.Modal.getOrCreateInstance(modalElement);

    modal.show();
  };

  // ==================================================
  // CHANGE EMAIL
  // ==================================================

  window.changeEmail = async function () {
    const button = document.getElementById('changeEmailBtn');

    const currentEmail = document.getElementById('currentEmail')?.value.trim();

    const newEmail = document.getElementById('newEmail')?.value.trim();

    const currentPassword = document.getElementById('emailCurrentPassword')?.value || '';

    if (!currentEmail) {
      AppAlert.warning('Current email is missing');
      return;
    }

    if (!newEmail) {
      AppAlert.warning('New email is required');
      return;
    }

    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(newEmail)) {
      AppAlert.warning('Please enter a valid email address');
      return;
    }

    if (newEmail.toLowerCase() === currentEmail.toLowerCase()) {
      AppAlert.warning('New email must be different from your current email');
      return;
    }

    if (!currentPassword) {
      AppAlert.warning('Current password is required');
      return;
    }

    try {
      button.disabled = true;

      AppAlert.loading('Verifying password...');

      await Api.patch('/settings/profile/email', {
        email: newEmail,
        currentPassword,
      });

      AppAlert.close();

      const modalElement = document.getElementById('changeEmailModal');

      const modal = bootstrap.Modal.getInstance(modalElement);

      modal?.hide();

      // Update UI
      const emailInput = document.getElementById('email');

      if (emailInput) {
        emailInput.value = newEmail;
      }

      const currentEmailInput = document.getElementById('currentEmail');

      if (currentEmailInput) {
        currentEmailInput.value = newEmail;
      }

      if (data?.profile) {
        data.profile.email = newEmail;
      }

      AppAlert.success('Email updated successfully');
    } catch (error) {
      AppAlert.close();

      AppAlert.error(error?.message || 'Unable to change email');
    } finally {
      button.disabled = false;
    }
  };

  // ==================================================
  // TOGGLE PASSWORD VISIBILITY
  // ==================================================

  window.togglePassword = function (inputId, button) {
    const input = document.getElementById(inputId);

    if (!input || !button) {
      return;
    }

    const icon = button.querySelector('i');

    if (input.type === 'password') {
      input.type = 'text';

      button.setAttribute('aria-label', 'Hide password');

      if (icon) {
        icon.classList.remove('bi-eye');
        icon.classList.add('bi-eye-slash');
      }
    } else {
      input.type = 'password';

      button.setAttribute('aria-label', 'Show password');

      if (icon) {
        icon.classList.remove('bi-eye-slash');
        icon.classList.add('bi-eye');
      }
    }
  };
})();
