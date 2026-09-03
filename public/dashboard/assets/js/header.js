/* ==========================================================
   TeamoTrack Header
========================================================== */

(function () {
  'use strict';

  window.initializeHeader = function () {
    const wrapper = document.getElementById('headerProfileWrapper');

    const profile = document.getElementById('headerProfile');

    const logout = document.getElementById('logoutButton');

    if (!wrapper || !profile) {
      return;
    }

    profile.onclick = (event) => {
      event.stopPropagation();

      const open = wrapper.classList.toggle('open');

      profile.setAttribute('aria-expanded', String(open));
    };

    document.addEventListener('click', (event) => {
      if (!wrapper.contains(event.target)) {
        wrapper.classList.remove('open');

        profile.setAttribute('aria-expanded', 'false');
      }
    });

    logout?.addEventListener('click', async () => {
        console.log(2222);
      const result = await AppAlert.confirm('Are you sure you want to logout?');

      if (!result.isConfirmed) {
        return;
      }

      console.log(2222);

      /*
       * Use your existing auth logout
       * implementation here.
       */

      window.location.href = '/login';
    });
  };
})();
