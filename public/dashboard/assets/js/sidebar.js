/* ==========================================================
   TeamoTrack Sidebar
   sidebar.js
========================================================== */

function initializeSidebar() {
  const sidebar = document.getElementById('sidebar');
  const toggle = document.getElementById('sidebarToggle');

  if (!sidebar) return;

  /* ======================================================
       Company Branding
    ====================================================== */

  function loadCompanyBranding() {
    try {
      const stored = localStorage.getItem('company');

      if (!stored) {
        console.log('No company data found in localStorage');
        return;
      }

      const data = JSON.parse(stored);

      // Supports both:
      // { company: { businessName, logo } }
      // and:
      // { businessName, logo }

      const company = data?.company ?? data;
      const orgLogo = document.getElementById('orgLogo');
      const orgName = document.getElementById('orgName');

      /* ==================================================
           Business Name
        ================================================== */

      if (orgName && company?.businessName?.trim()) {
        const nameElement = orgName.querySelector('h4');

        if (nameElement) {
          const businessName = company.businessName.trim();

          nameElement.textContent = businessName;
          nameElement.title = businessName;
        }
      }

      /* ==================================================
           Company Logo
        ================================================== */

      if (orgLogo && company?.logo?.trim()) {
        const logoElement = orgLogo.querySelector('img');

        if (logoElement) {
          logoElement.src = company.logo.trim();

          logoElement.alt = `${company.businessName || 'Company'} Logo`;
        }
      }
    } catch (error) {
      console.warn('Failed to load company branding:', error);
    }
  }

  // Load company name and logo
  loadCompanyBranding();

  /* ======================================================
       Toggle
    ====================================================== */

  toggle?.addEventListener('click', () => {
    if (window.innerWidth <= 992) {
      document.body.classList.toggle('sidebar-open');
    } else {
      document.body.classList.toggle('sidebar-collapsed');
    }
  });

  /* ======================================================
       Overlay
    ====================================================== */

  let overlay = document.querySelector('.sidebar-overlay');

  if (!overlay) {
    overlay = document.createElement('div');

    overlay.className = 'sidebar-overlay';

    document.body.appendChild(overlay);
  }

  overlay.onclick = () => {
    document.body.classList.remove('sidebar-open');
  };

  /* ======================================================
       Submenus
    ====================================================== */

  document.querySelectorAll('.has-submenu > .menu-link').forEach((link) => {
    link.onclick = () => {
      const parent = link.parentElement;

      if (!parent) return;

      document.querySelectorAll('.has-submenu.open').forEach((item) => {
        if (item !== parent) {
          item.classList.remove('open');
        }
      });

      parent.classList.toggle('open');
    };
  });

  /* ======================================================
       Resize
    ====================================================== */

  window.addEventListener('resize', () => {
    if (window.innerWidth > 992) {
      document.body.classList.remove('sidebar-open');
    }
  });

  /* ======================================================
       Active Menu
    ====================================================== */

  setActiveMenu();
}
