/* ==========================================================
   TeamoTrack SPA
   app.js
=========================================================== */

if (window.TeamoTrackApp) {
  console.warn('TeamoTrack app.js already loaded.');
} else {
  window.TeamoTrackApp = true;

  const App = {
    currentPath: null,

    loadedScripts: window.__TT_LOADED_SCRIPTS || new Set(),

    loadedCss: window.__TT_LOADED_CSS || new Set(),

    initialized: false,

    /* ==================================================
       INIT
    ================================================== */

    async init() {
      if (this.initialized) {
        return;
      }
      const userDataRaw = localStorage.getItem('userData');

      if (!userDataRaw) {
        console.log('User is NOT logged in.');
        console.log('Redirecting to /login...');

        if (window.location.pathname !== '/login') {
          window.location.replace('/login');
        }

        return;
      }

      let userData;

      try {
        userData = JSON.parse(userDataRaw);
      } catch (error) {
        console.error('Invalid userData in localStorage:', error);

        localStorage.removeItem('userData');

        console.log('Redirecting to /login...');

        if (window.location.pathname !== '/login') {
          window.location.replace('/login');
        }

        return;
      }

      const role = String(userData.role || userData.roleName || '')
        .trim()
        .toLowerCase();

      if (!role) {
        console.error('User is logged in, but role is missing.');
        console.log('userData:', userData);

        return;
      }

      this.initialized = true;

      console.log('Authentication successful.');

      try {
        await this.loadShell();

        this.bindNavigation();

        await this.navigate(window.location.pathname, false);

        console.log('TeamoTrack initialized successfully.');
      } catch (error) {
        console.error('Application initialization failed:', error);
      }
    },

    /* ==================================================
       STATIC SHELL
    ================================================== */

    async loadShell() {
      await Promise.all([
        this.loadRoleBasedSidebar(),

        loadComponent('header-container', '/dashboard/components/header.html'),
      ]);

      initializeUserProfile();

      initializeSidebarHeaderVisibility();

      initializeHeaderProfile();

      initializeNotifications();

      initializeSidebar();

      initializeTheme();

      initializeRipple();

      document.body.classList.remove('app-loading');

      document.body.classList.add('app-ready');
    },

    /* ==================================================
       ROLE
    ================================================== */

    getCurrentUserRole() {
      const userDataRaw = localStorage.getItem('userData');

      if (!userDataRaw) {
        console.log('No userData found.');
        return '';
      }

      try {
        const userData = JSON.parse(userDataRaw);

        const role = String(userData.role || userData.roleName || '')
          .trim()
          .toLowerCase();

        return role;
      } catch (error) {
        console.error('Failed to parse userData:', error);
        return '';
      }
    },

    /* ==================================================
       ROLE BASED SIDEBAR
    ================================================== */

    async loadRoleBasedSidebar() {
      const role = this.getCurrentUserRole();

      let sidebarFile;

      switch (role) {
        /*
         * HR workspace
         */
        case 'hr':
          sidebarFile = '/dashboard/components/sidebar-hr.html';
          break;

        /*
         * Executive workspace
         */
        case 'field_executive':
          sidebarFile = '/dashboard/components/sidebar-executive.html';
          break;

        /*
         * Management workspace
         */
        case 'root_manager':
        case 'manager':
          sidebarFile = '/dashboard/components/sidebar.html';
          break;

        /*
         * Root HR currently uses the
         * management/root workspace.
         *
         * This can be given a dedicated
         * root-HR workspace later if required.
         */
        // case 'root_hr':
        //   sidebarFile = '/dashboard/components/sidebar.html';
        //   break;

        /*
         * Other root/admin roles.
         */
        case 'root':
        case 'admin':
          sidebarFile = '/dashboard/components/sidebar.html';
          break;

        /*
         * Never silently give an unknown
         * role the manager workspace.
         */
        default:
          throw new Error(`Unsupported TeamoTrack role: ${role || 'unknown'}`);
      }

      await loadComponent('sidebar-container', sidebarFile);
    },

    /* ==================================================
       NAVIGATION
    ================================================== */

    bindNavigation() {
      if (this.navigationBound) {
        return;
      }

      this.navigationBound = true;

      document.addEventListener('click', (event) => {
        const link = event.target.closest('a[href]');

        if (!link) {
          return;
        }

        /*
         * External/download links.
         */
        if (link.target === '_blank' || link.hasAttribute('download')) {
          return;
        }

        const href = link.getAttribute('href');

        if (
          !href ||
          href === '#' ||
          href.startsWith('#') ||
          href.startsWith('http://') ||
          href.startsWith('https://') ||
          href.startsWith('mailto:') ||
          href.startsWith('tel:')
        ) {
          return;
        }

        const url = new URL(href, window.location.origin);

        if (url.origin !== window.location.origin) {
          return;
        }

        event.preventDefault();

        /*
         * Close mobile sidebar.
         */
        if (window.innerWidth <= 992) {
          document.body.classList.remove('sidebar-open');
        }

        this.navigate(url.pathname);
      });

      window.addEventListener('popstate', () => {
        this.navigate(window.location.pathname, false);
      });
    },

    /* ==================================================
       NAVIGATE
    ================================================== */

    async navigate(path, push = true) {
      path = path.replace(/\/$/, '') || '/dashboard';

      if (this.currentPath === path) {
        return;
      }

      const page = this.getPage(path);

      if (!page) {
        load404();
        return;
      }

      if (push) {
        history.pushState({}, '', path);
      }

      this.currentPath = path;

      /*
       * Update header and sidebar immediately.
       */
      updatePageHeader(page.title, page.description);
      setActiveMenu(path);

      const content = document.getElementById('page-content');

      if (!content) {
        return;
      }

      cleanupBootstrapModals();

      /*
       * Show a stable loader while the new page is prepared.
       */
      content.innerHTML = `<div class="page-loader"></div>`;

      try {
        /*
         * Load HTML and CSS in parallel.
         *
         * IMPORTANT:
         * The HTML is NOT inserted into the DOM until
         * its CSS has finished loading.
         */
        const htmlPromise = fetch(page.html).then(async (response) => {
          if (!response.ok) {
            throw new Error(`Unable to load ${page.html}`);
          }

          return response.text();
        });

        const cssPromise = this.loadPageCss(page.css);

        const [html] = await Promise.all([htmlPromise, cssPromise]);

        /*
         * CSS is ready now.
         * Only now put the HTML into the DOM.
         */
        content.innerHTML = html;

        /*
         * Load page JavaScript.
         */
        await this.loadPageScript(page.js);

        /*
         * Initialize page.
         */
        const initializer = window[page.init];

        if (typeof initializer !== 'function') {
          throw new Error(`Initializer not found: ${page.init}`);
        }

        await initializer();

        /*
         * Reinitialize UI effects.
         */
        initializeRipple();
      } catch (error) {
        console.error('Page loading failed:', error);

        content.innerHTML = `
      <div class="empty-state">
        <h5>
          Unable to load page
        </h5>

        <p>
          ${escapeHtml(error.message)}
        </p>
      </div>
    `;
      }
    },

    /* ==================================================
       PAGE SCRIPT
    ================================================== */

    loadPageScript(script) {
      if (!script) {
        return Promise.resolve();
      }

      return new Promise((resolve, reject) => {
        const element = document.createElement('script');

        element.src = `${script}?t=${Date.now()}`;

        element.onload = resolve;

        element.onerror = () => reject(new Error(`Unable to load ${script}`));

        document.body.appendChild(element);
      });
    },

    /* ==================================================
       PAGE CSS
    ================================================== */

    loadPageCss(css) {
      if (!css) {
        return Promise.resolve();
      }

      if (this.loadedCss.has(css)) {
        return Promise.resolve();
      }

      const existing = document.querySelector(`link[data-page-css="${css}"]`);

      if (existing) {
        this.loadedCss.add(css);

        return Promise.resolve();
      }

      return new Promise((resolve, reject) => {
        const link = document.createElement('link');

        link.rel = 'stylesheet';

        link.href = css;

        link.dataset.pageCss = css;

        link.onload = () => {
          this.loadedCss.add(css);

          resolve();
        };

        link.onerror = () => reject(new Error(`Unable to load ${css}`));

        document.head.appendChild(link);
      });
    },

    /* ==================================================
       PAGES
    ================================================== */

    getPage(path) {
      const pages = {
        /* ==================================================
           DASHBOARD
        ================================================== */

        '/dashboard': {
          ...getDashboardPage(),

          title: 'Dashboard',
        },

        /* ==================================================
           TASKS
        ================================================== */

        '/tasks': {
          html: '/dashboard/pages/task/tasks.html',

          js: '/dashboard/assets/js/task/tasks.js',

          css: '/dashboard/assets/css/task/tasks.css',

          init: 'initializeTasksPage',

          title: 'Tasks',

          description: "Manage and track your team's tasks.",
        },

        /* ==================================================
           EXECUTIVES
        ================================================== */

        '/executives': {
          html: '/dashboard/pages/team/executives.html',

          js: '/dashboard/assets/js/team/executives.js',

          css: '/dashboard/assets/css/team/executives.css',

          init: 'initializeExecutivesPage',

          title: 'Executives',

          description: 'Manage your field executives.',
        },

        /* ==================================================
           TEAMS
        ================================================== */

        '/teams': {
          html: '/dashboard/pages/team/teams.html',

          js: '/dashboard/assets/js/team/teams.js',

          css: '/dashboard/assets/css/team/teams.css',

          init: 'initializeTeamsPage',

          title: 'Teams',

          description: 'Manage your teams and members.',
        },

        /* ==================================================
           SHIFTS
        ================================================== */

        '/shifts': {
          html: '/dashboard/pages/team/shifts.html',

          js: '/dashboard/assets/js/team/shifts.js',

          css: '/dashboard/assets/css/team/shifts.css',

          init: 'initializeShiftsPage',

          title: 'Shifts',

          description: 'Manage executive shifts and schedules.',
        },

        /* ==================================================
           ATTENDANCE
        ================================================== */

        '/attendance/my': {
          html: '/dashboard/pages/attendance/my-attendance.html',

          js: '/dashboard/assets/js/attendance/my-attendance.js',

          css: '/dashboard/assets/css/attendance/my-attendance.css',

          init: 'initializeMyAttendancePage',

          title: 'My Attendance',

          description: 'View your attendance and manage today’s check-in and check-out.',
        },

        '/attendance': {
          html: '/dashboard/pages/attendance/attendance.html',

          js: '/dashboard/assets/js/attendance/attendance.js',

          css: '/dashboard/assets/css/attendance/attendance.css',

          init: 'initializeAttendancePage',

          title: 'Attendance',

          description: "View and manage your team's attendance.",
        },
        
        '/attendance-regularization': {
          html: '/dashboard/pages/attendance/attendance-regularization-review.html',

          js: '/dashboard/assets/js/attendance/attendance-regularization-review.js',

          css: '/dashboard/assets/css/attendance/attendance-regularization-review.css',

          init: 'initializeAttendanceRegularizationReviewPage',

          title: 'Attendance Regularization',

          description: "View and manage attendance regularization requests.",
        },

        '/attendance/live': {
          html: '/dashboard/pages/attendance/live.html',

          js: '/dashboard/assets/js/attendance/live.js',

          css: '/dashboard/assets/css/attendance/live.css',

          init: 'initializeLiveTrackingPage',

          title: 'Live Tracking',

          description: 'Track field executives and review their routes.',
        },

        '/attendance/exceptions': {
          html: '/dashboard/pages/attendance/exceptions.html',

          js: '/dashboard/assets/js/attendance/exceptions.js',

          css: '/dashboard/assets/css/attendance/exceptions.css',

          init: 'initializeAttendanceExceptionsPage',

          title: 'Attendance Exceptions',

          description: 'Review attendance exceptions that require attention.',
        },

        /* ==================================================
           LEAVE
        ================================================== */

        '/leave': {
          html: '/dashboard/pages/leave/leave.html',

          js: '/dashboard/assets/js/leave/leave.js',

          css: '/dashboard/assets/css/leave/leave.css',

          init: 'initializeLeavePage',

          title: 'Leave',

          description: 'Manage leave requests, approvals and leave policies.',
        },

        '/leave/requests': {
          html: '/dashboard/pages/leave/leave.html',

          js: '/dashboard/assets/js/leave/leave.js',

          css: '/dashboard/assets/css/leave/leave.css',

          init: 'initializeLeavePage',

          title: 'Leave',

          description: 'Manage leave requests, approvals and leave policies.',
        },

        '/leave/my': {
          html: '/dashboard/pages/leave/my-leave.html',

          js: '/dashboard/assets/js/leave/my-leave.js',

          css: '/dashboard/assets/css/leave/my-leave.css',

          init: 'initializeMyLeavePage',

          title: 'My Leave',

          description: 'View and manage your leave.',
        },

        '/leave/history': {
          html: '/dashboard/pages/leave/history.html',

          js: '/dashboard/assets/js/leave/history.js',

          css: '/dashboard/assets/css/leave/history.css',

          init: 'initializeLeaveHistoryPage',

          title: 'Leave History',

          description: 'View leave history.',
        },

        /* ==================================================
           HOLIDAYS
        ================================================== */

        '/holidays': {
          html: '/dashboard/pages/holidays/holiday.html',

          js: '/dashboard/assets/js/holidays/holiday.js',

          css: '/dashboard/assets/css/holidays/holiday.css',

          init: 'initializeHolidaysPage',

          title: 'Company Holidays',

          description: 'Manage company holidays.',
        },

        /* ==================================================
           PAYROLL
        ================================================== */

        '/salary-structures': {
          html: '/dashboard/pages/salary-structures/salary-structure.html',

          js: '/dashboard/assets/js/salary-structures/salary-structure.js',

          css: '/dashboard/assets/css/salary-structures/salary-structure.css',

          init: 'initializeSalaryStructuresPage',

          title: 'Salary Structures',

          description: 'Manage salary structures.',
        },

        '/salary-assignments': {
          html: '/dashboard/pages/salary-assignments/salary-assignment.html',

          js: '/dashboard/assets/js/salary-assignments/salary-assignment.js',

          css: '/dashboard/assets/css/salary-assignments/salary-assignment.css',

          init: 'initializeSalaryAssignmentsPage',

          title: 'Salary Assignments',

          description: 'Manage employee salary assignments.',
        },

        '/payroll-periods': {
          html: '/dashboard/pages/payroll-periods/payroll-period.html',

          js: '/dashboard/assets/js/payroll-periods/payroll-period.js',

          css: '/dashboard/assets/css/payroll-periods/payroll-period.css',

          init: 'initializePayrollPeriodsPage',

          title: 'Payroll Periods',

          description: 'Manage payroll periods.',
        },

        '/payroll-calculations': {
          html: '/dashboard/pages/payroll-calculations/payroll-calculation.html',

          js: '/dashboard/assets/js/payroll-calculations/payroll-calculation.js',

          css: '/dashboard/assets/css/payroll-calculations/payroll-calculation.css',

          init: 'initializePayrollCalculationsPage',

          title: 'Payroll Calculation',

          description: 'Calculate and review payroll.',
        },

        '/payments': {
          html: '/dashboard/pages/payments/payment.html',

          js: '/dashboard/assets/js/payments/payment.js',

          css: '/dashboard/assets/css/payments/payment.css',

          init: 'initializePaymentsPage',

          title: 'Payments',

          description: 'Manage employee salary payments.',
        },

        '/payslips': {
          html: '/dashboard/pages/payslips/payslip.html',

          js: '/dashboard/assets/js/payslips/payslip.js',

          css: '/dashboard/assets/css/payslips/payslip.css',

          init: 'initializePayslipsPage',

          title: 'Payslips',

          description: 'View employee salary payslips.',
        },

        /* ==================================================
           PROFILE
        ================================================== */

        '/profile': {
          html: '/dashboard/pages/settings/profile.html',

          js: '/dashboard/assets/js/settings/profile.js',

          css: '/dashboard/assets/css/settings/settings.css',

          init: 'initializeProfilePage',

          title: 'My Profile',

          description: 'Manage your personal information.',
        },

        /* ==================================================
           SETTINGS
        ================================================== */

        '/settings/company': {
          html: '/dashboard/pages/settings/company.html',

          js: '/dashboard/assets/js/settings/organization.js',

          css: '/dashboard/assets/css/settings/settings.css',

          init: 'initializeCompanyPage',

          title: 'Company',

          description: 'Manage your company information.',
        },

        '/settings/roles': {
          html: '/dashboard/pages/settings/roles.html',

          js: '/dashboard/assets/js/settings/roles.js',

          css: '/dashboard/assets/css/settings/roles.css',

          init: 'initializeRolesPage',

          title: 'Roles & Permissions',

          description: 'Control what your team can do.',
        },

        /* ==================================================
           MANAGERS
        ================================================== */

        '/managers': {
          html: '/dashboard/pages/staff/managers.html',

          js: '/dashboard/assets/js/staff/managers.js',

          css: '/dashboard/assets/css/staff/managers.css',

          init: 'initializeManagersPage',

          title: 'Managers',

          description: 'Manage managers and your management hierarchy.',
        },

        /* ==================================================
           HR
        ================================================== */

        '/hr': {
          html: '/dashboard/pages/staff/hr.html',

          js: '/dashboard/assets/js/staff/hr.js',

          css: '/dashboard/assets/css/staff/hr.css',

          init: 'initializeHrPage',

          title: 'HR',

          description: 'Manage your HR hierarchy.',
        },
      };

      return pages[path] || null;
    },
  };

  window.App = App;

  /* ======================================================
       DASHBOARD PAGE RESOLVER
  ====================================================== */

  function getDashboardPage() {
    const role = App.getCurrentUserRole();

    switch (role) {
      /* ==================================================
         HR
      ================================================== */

      case 'hr':
        return {
          html: '/dashboard/pages/HR/dashboard-hr.html',

          js: '/dashboard/assets/js/HR/dashboard-hr.js',

          css: '/dashboard/assets/css/HR/dashboard-hr.css',

          init: 'initializeHrDashboard',

          description: "Here's what's happening with your workforce today.",
        };

      /* ==================================================
         FIELD EXECUTIVE
      ================================================== */

      case 'field_executive':
        return {
          html: '/dashboard/pages/executive/dashboard-executive.html',

          js: '/dashboard/assets/js/executive/dashboard-executive.js',

          css: '/dashboard/assets/css/executive/dashboard-executive.css',

          init: 'initializeExecutiveDashboard',

          description: "Here's your attendance and work summary.",
        };

      /* ==================================================
         MANAGER
      ================================================== */

      case 'manager':
      case 'root_manager':
        return {
          html: '/dashboard/pages/dashboard.html',

          js: '/dashboard/assets/js/dashboard.js',

          css: '/dashboard/assets/css/dashboard.css',

          init: 'initializeDashboard',

          description: "Welcome back! Here's what's happening today.",
        };

      /* ==================================================
         ROOT HR
      ================================================== */

      // case 'root_hr':
      //   return {
      //     html: '/dashboard/pages/dashboard.html',

      //     js: '/dashboard/assets/js/dashboard.js',

      //     css: '/dashboard/assets/css/dashboard.css',

      //     init: 'initializeDashboard',

      //     description: "Welcome back! Here's what's happening today.",
      //   };

      /* ==================================================
         ROOT / ADMIN
      ================================================== */

      case 'root':
      case 'admin':
        return {
          html: '/dashboard/pages/dashboard.html',

          js: '/dashboard/assets/js/dashboard.js',

          css: '/dashboard/assets/css/dashboard.css',

          init: 'initializeDashboard',

          description: "Welcome back! Here's what's happening today.",
        };

      /* ==================================================
         UNKNOWN
      ================================================== */

      default:
        throw new Error(`Unsupported TeamoTrack role: ${role || 'unknown'}`);
    }
  }

  /* ======================================================
       COMPONENT
  ====================================================== */

  async function loadComponent(elementId, file) {
    const element = document.getElementById(elementId);

    if (!element) {
      throw new Error(`#${elementId} not found`);
    }

    const response = await fetch(file);

    if (!response.ok) {
      throw new Error(`Unable to load ${file}`);
    }

    element.innerHTML = await response.text();
  }

  /* ======================================================
       HEADER
  ====================================================== */

  function updatePageHeader(title, description) {
    const titleElement = document.getElementById('pageTitle');

    const descriptionElement = document.getElementById('pageDescription');

    if (titleElement) {
      titleElement.textContent = title;
    }

    if (descriptionElement) {
      descriptionElement.textContent = description;
    }
  }

  /* ======================================================
       ACTIVE MENU
  ====================================================== */

  function setActiveMenu(path = window.location.pathname) {
    const currentPath = path.replace(/\/$/, '') || '/dashboard';

    document.querySelectorAll('.menu-item').forEach((item) => {
      item.classList.remove('active', 'open');
    });

    document.querySelectorAll('.submenu a').forEach((link) => {
      link.classList.remove('active');
    });

    document.querySelectorAll('.menu-link[href]').forEach((link) => {
      if (link.getAttribute('href') === currentPath) {
        link.closest('.menu-item')?.classList.add('active');
      }
    });

    document.querySelectorAll('.submenu a').forEach((link) => {
      if (link.getAttribute('href') !== currentPath) {
        return;
      }

      link.classList.add('active');

      link.closest('.has-submenu')?.classList.add('active', 'open');
    });
  }

  /* ======================================================
       RIPPLE
  ====================================================== */

  function initializeRipple() {
    document.querySelectorAll('.ripple').forEach((button) => {
      button.onclick = function (event) {
        const circle = document.createElement('span');

        const diameter = Math.max(this.clientWidth, this.clientHeight);

        circle.style.width = `${diameter}px`;

        circle.style.height = `${diameter}px`;

        circle.style.left = `${event.offsetX - diameter / 2}px`;

        circle.style.top = `${event.offsetY - diameter / 2}px`;

        circle.className = 'ripple-circle';

        this.appendChild(circle);

        setTimeout(() => circle.remove(), 500);
      };
    });
  }

  /* ======================================================
       404
  ====================================================== */

  function load404() {
    updatePageHeader('Page Not Found', 'The requested page does not exist.');

    const content = document.getElementById('page-content');

    if (!content) {
      return;
    }

    content.innerHTML = `
      <div class="empty-state">

        <h4>
          Page not found
        </h4>

        <p>
          The requested page does not exist.
        </p>

        <a
          href="/dashboard"
          class="btn btn-primary"
        >
          Go to Dashboard
        </a>

      </div>
    `;
  }

  /* ==========================================================
       HEADER PROFILE
  ========================================================== */

  function initializeHeaderProfile() {
    const wrapper = document.getElementById('headerProfileWrapper');

    const profile = document.getElementById('headerProfile');

    const logout = document.getElementById('logoutButton');

    if (!wrapper || !profile) {
      return;
    }

    profile.onclick = (event) => {
      event.stopPropagation();

      const isOpen = wrapper.classList.toggle('open');

      profile.setAttribute('aria-expanded', String(isOpen));
    };

    document.addEventListener('click', (event) => {
      if (!wrapper.contains(event.target)) {
        wrapper.classList.remove('open');

        profile.setAttribute('aria-expanded', 'false');
      }
    });

    logout?.addEventListener('click', async (event) => {
      event.preventDefault();
      event.stopPropagation();

      try {
        const result = await AppAlert.confirm('Are you sure you want to logout?');

        if (result?.isConfirmed === false) {
          return;
        }

        if (result === false) {
          return;
        }

        await window.logoutUser();

        localStorage.removeItem('userData');

        window.location.replace('/login');
      } catch (error) {
        console.error('Logout failed:', error);

        AppAlert.error(error.message || 'Unable to logout');
      }
    });
  }

  /* ======================================================
       USER PROFILE
  ====================================================== */

  function initializeUserProfile() {
    const userData = JSON.parse(localStorage.getItem('userData') || '{}');

    const fullName = userData.fullName || userData.name || 'User';

    const role = userData.roleName || userData.role || 'Administrator';

    /*
     * Generate initials.
     */
    const initials = fullName
      .trim()
      .split(/\s+/)
      .map((name) => name.charAt(0))
      .join('')
      .substring(0, 2)
      .toUpperCase();

    /*
     * Names.
     */
    document.getElementById('sidebarUserName')?.replaceChildren(document.createTextNode(fullName));

    document.getElementById('headerUserName')?.replaceChildren(document.createTextNode(fullName));

    document.getElementById('profileMenuUserName')?.replaceChildren(document.createTextNode(fullName));

    /*
     * Roles.
     */
    document.getElementById('sidebarUserRole')?.replaceChildren(document.createTextNode(role));

    document.getElementById('headerUserRole')?.replaceChildren(document.createTextNode(role));

    document.getElementById('profileMenuUserRole')?.replaceChildren(document.createTextNode(role));

    /*
     * Avatars.
     */
    document.getElementById('sidebarUserAvatar')?.replaceChildren(document.createTextNode(initials));

    document.getElementById('headerUserAvatar')?.replaceChildren(document.createTextNode(initials));

    document.getElementById('profileMenuUserAvatar')?.replaceChildren(document.createTextNode(initials));
  }

  /* ======================================================
       PAYROLL VISIBILITY
  ====================================================== */

  function initializeSidebarHeaderVisibility() {
    const userData = JSON.parse(localStorage.getItem('userData') || '{}');

    const myAttendance = document.querySelector('[data-menu="attendance-my"]');
    const companySetting = document.getElementById('company-setting');
    const payrollMenu = document.querySelector('[data-menu="payroll"]');

    const role = String(userData.role || userData.roleName || '')
      .trim()
      .toLowerCase();

    /*
     * Payroll is available only
     * to root_manager.
     */
    if (payrollMenu && role !== 'root_manager') {
      payrollMenu.remove();
    }
    if (myAttendance && role == 'root_manager') {
      myAttendance.remove();
    }
    
    if (companySetting && role !== 'root_manager') {
      companySetting.remove();
    }
  }

  function cleanupBootstrapModals() {
    // Hide and dispose any Bootstrap modals currently in the DOM
    document.querySelectorAll('.modal').forEach((modalElement) => {
      const instance = bootstrap.Modal.getInstance(modalElement);

      if (instance) {
        instance.hide();
        instance.dispose();
      }
    });

    // Safety cleanup for any backdrop left behind
    document.querySelectorAll('.modal-backdrop').forEach((backdrop) => {
      backdrop.remove();
    });

    // Bootstrap adds this while a modal is open
    document.body.classList.remove('modal-open');

    // Remove Bootstrap's inline scroll-lock styles
    document.body.style.removeProperty('padding-right');
    document.body.style.removeProperty('overflow');

    // Also clean any modal-related attributes left on body
    document.querySelectorAll('[aria-modal="true"]').forEach((element) => {
      element.removeAttribute('aria-modal');
    });
  }

  /* ======================================================
       ESCAPE
  ====================================================== */

  function escapeHtml(value) {
    return String(value ?? '')
      .replaceAll('&', '&amp;')
      .replaceAll('<', '&lt;')
      .replaceAll('>', '&gt;')
      .replaceAll('"', '&quot;')
      .replaceAll("'", '&#039;');
  }

  /* ======================================================
       START
  ====================================================== */

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => App.init(), {
      once: true,
    });
  } else {
    App.init();
  }
}
