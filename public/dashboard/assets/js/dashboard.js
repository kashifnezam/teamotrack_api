/* ==========================================================
   TeamoTrack Dashboard
   dashboard.js

   ATTENDANCE RULES
   ----------------------------------------------------------
   1. No attendance document = NOT MARKED.
   2. Dashboard NEVER converts missing attendance into absent.
   3. Explicit backend status "absent" = Absent.
   4. Date changes call API immediately.
   5. Team / Manager / Search remain local filters.
========================================================== */

(function () {
  'use strict';

  /* ======================================================
     STATE
  ====================================================== */

  let dashboardMap = null;

  let dashboardMarkers = [];

  /*
   * Complete authorized staff dataset
   * for the currently loaded date.
   */
  let allStaff = [];

  let dashboardMeta = null;

  let currentUser = null;

  /*
   * Prevent duplicate API calls when
   * date changes rapidly.
   */
  let dateRequestSequence = 0;

  /* ======================================================
     INIT
  ====================================================== */

  window.initializeDashboard = async function () {
    try {
      highlightCurrentMenu();

      initializeTooltips();

      animateCards();

      initializeEvents();

      setCurrentDate();

      loadUserName();

      initializeMap();

      await loadDashboard();
    } catch (error) {
      console.error('Dashboard initialization failed:', error);

      AppAlert.close();

      AppAlert.error(error.message || 'Failed to load dashboard');
    }
  };

  /* ======================================================
     EVENTS
  ====================================================== */

  function initializeEvents() {
    /*
     * DATE IS DIFFERENT:
     *
     * Date changes MUST call the API.
     */

    document.getElementById('dashboardDateFilter')?.addEventListener('change', handleDateChange);

    /*
     * These filters remain local.
     */

    document.getElementById('dashboardTeamFilter')?.addEventListener('change', applyLocalFilters);

    document.getElementById('dashboardManagerFilter')?.addEventListener('change', applyLocalFilters);

    /*
     * Search is local.
     */

    document.getElementById('dashboardSearch')?.addEventListener('input', applyLocalFilters);

    /*
     * Refresh reloads current date.
     */

    document.getElementById('dashboardRefreshBtn')?.addEventListener('click', () => {
      const date = document.getElementById('dashboardDateFilter')?.value || getTodayIndia();

      loadDashboard(date);
    });

    document.getElementById('dashboardResetBtn')?.addEventListener('click', resetFilters);
  }

  /* ======================================================
     DATE CHANGE
  ====================================================== */

  async function handleDateChange() {
    const dateInput = document.getElementById('dashboardDateFilter');

    const selectedDate = dateInput?.value || '';

    if (!selectedDate) {
      return;
    }

    /*
     * Previous / old dates MUST hit API.
     */

    await loadDashboard(selectedDate);
  }

  /* ======================================================
     LOAD DASHBOARD
  ====================================================== */

  async function loadDashboard(requestedDate = null) {
    const refresh = document.getElementById('dashboardRefreshBtn');

    /*
     * Use explicitly requested date,
     * otherwise current date filter,
     * otherwise today.
     */

    const date = requestedDate || document.getElementById('dashboardDateFilter')?.value || getTodayIndia();

    /*
     * Sequence prevents an older request
     * from overwriting a newer date.
     */

    const requestId = ++dateRequestSequence;

    try {
      refresh?.classList.add('loading');

      AppAlert.loading('Loading dashboard...');

      /*
       * IMPORTANT
       *
       * API receives the selected date.
       */

      const query = `?date=${encodeURIComponent(date)}`;

      const data = await Api.get(`/dashboard/me${query}`);

      /*
       * Ignore stale request.
       */

      if (requestId !== dateRequestSequence) {
        return;
      }

      if (!data) {
        AppAlert.close();

        return;
      }

      /*
       * Store complete response.
       */

      dashboardMeta = data;

      currentUser = data.user || {};

      allStaff = Array.isArray(data.staff) ? data.staff : [];

      /*
       * Make sure date input reflects
       * the API-loaded date.
       */

      const dateFilter = document.getElementById('dashboardDateFilter');

      if (dateFilter) {
        dateFilter.value = normalizeDateForInput(data.date);
      }

      /*
       * Populate static information.
       */

      populateHeader(data);

      populateFilters(data);

      /*
       * Apply local Team / Manager /
       * Search filters.
       */

      applyLocalFilters();

      AppAlert.close();
    } catch (error) {
      console.error('Dashboard loading failed:', error);

      AppAlert.close();

      AppAlert.error(error.message || 'Failed to load dashboard');
    } finally {
      /*
       * Only remove loading if this is
       * the latest request.
       */

      if (requestId === dateRequestSequence) {
        refresh?.classList.remove('loading');
      }
    }
  }

  /* ======================================================
     LOCAL FILTERING
  ====================================================== */

  function applyLocalFilters() {
    /*
     * ALWAYS start with complete API data.
     */

    let filtered = [...allStaff];

    /* --------------------------------------------------
       SEARCH
    -------------------------------------------------- */

    const search = (document.getElementById('dashboardSearch')?.value || '').trim().toLowerCase();

    if (search) {
      filtered = filtered.filter((staff) => {
        const values = [
          staff.fullName,

          staff.name,

          staff.userName,

          staff.role,

          staff.teamName,

          staff.managerName,

          staff.email,
        ];

        return values.some((value) =>
          String(value || '')
            .toLowerCase()
            .includes(search)
        );
      });
    }

    /* --------------------------------------------------
       TEAM
    -------------------------------------------------- */

    const teamId = document.getElementById('dashboardTeamFilter')?.value || '';

    if (teamId) {
      filtered = filtered.filter((staff) => String(staff.teamId || '') === String(teamId));
    }

    /* --------------------------------------------------
       MANAGER
    -------------------------------------------------- */

    const managerId = document.getElementById('dashboardManagerFilter')?.value || '';

    if (managerId) {
      filtered = filtered.filter((staff) => String(staff.managerId || staff.parentId || '') === String(managerId));
    }

    /*
     * Build dashboard values from
     * filtered staff.
     */

    const filteredData = buildFilteredDashboardData(filtered);

    populateAttendance(filteredData);

    populateTracking(filteredData);

    populateStaffTable(filteredData);

    updateScopeText(filteredData);
  }

  /* ======================================================
     BUILD FILTERED DATA
  ====================================================== */

  function buildFilteredDashboardData(staff) {
    let present = 0;

    let working = 0;

    let late = 0;

    let leave = 0;

    let absent = 0;

    let weeklyOff = 0;

    let holiday = 0;

    let notMarked = 0;

    let online = 0;

    staff.forEach((item) => {
      const status = String(item.status || '')
        .trim()
        .toLowerCase();

      /*
       * =================================================
       * ATTENDANCE
       * =================================================
       *
       * NEVER use default:
       *
       * unknown -> absent
       *
       * That was the original bug.
       */

      switch (status) {
        case 'present':
          present++;

          break;

        case 'working':
          working++;

          present++;

          break;

        case 'late':
          late++;

          present++;

          break;

        case 'leave':
          leave++;

          break;

        case 'absent':
          /*
           * Only explicit backend
           * absent counts.
           */

          absent++;

          break;

        case 'weekly_off':
          weeklyOff++;

          break;

        case 'holiday':
          holiday++;

          break;

        case 'not_marked':

        case '':

        default:
          /*
           * No attendance information.
           *
           * DO NOT count as absent.
           */

          notMarked++;

          break;
      }

      /*
       * Location
       */

      if (hasValidLocation(item.currLoc)) {
        online++;
      }
    });

    const total = staff.length;

    /*
     * Attendance percentage.
     *
     * Do not count not_marked as
     * attendance.
     *
     * Also don't treat not_marked
     * as absent.
     */

    const marked = present + leave + absent + weeklyOff + holiday;

    const percentage = marked > 0 ? Math.round((present / marked) * 100) : 0;

    return {
      date: dashboardMeta?.date || '',

      user: dashboardMeta?.user || currentUser,

      scope: dashboardMeta?.scope || {},

      staff,

      attendance: {
        total,

        marked,

        notMarked,

        present,

        working,

        late,

        leave,

        absent,

        weeklyOff,

        holiday,

        percentage,
      },

      tracking: {
        online,

        offline: Math.max(total - online, 0),
      },
    };
  }

  /* ======================================================
     HEADER
  ====================================================== */

  function populateHeader(data) {
    const user = data.user || {};

    const scope = data.scope || {};

    setText('userName', user.fullName || user.name || 'User');

    setText('dashboardDate', formatDisplayDate(data.date));

    setText('dashboardSubtitle', buildDashboardSubtitle(scope, data.date));

    setText('scopeLabel', scope.label || 'Staff visible to you');

    setText('totalStaffMeta', scope.label || 'Visible to you');
  }

  /* ======================================================
     SCOPE
  ====================================================== */

  function updateScopeText(data) {
    const total = data.staff?.length || 0;

    const scope = dashboardMeta?.scope || {};

    const teamId = document.getElementById('dashboardTeamFilter')?.value || '';

    const managerId = document.getElementById('dashboardManagerFilter')?.value || '';

    const search = document.getElementById('dashboardSearch')?.value.trim() || '';

    let label = scope.label || 'Staff visible to you';

    if (search) {
      label = `Search results • ${total} staff`;
    } else if (teamId) {
      const team = findTeam(teamId);

      if (team) {
        label = `${team.name} • ${total} staff`;
      }
    } else if (managerId) {
      const manager = findManager(managerId);

      if (manager) {
        label = `${manager.fullName} • ${total} staff`;
      }
    } else {
      label = `${scope.label || 'Staff visible to you'} • ${total} staff`;
    }

    setText('scopeLabel', label);

    setText('staffListSubtitle', label);
  }

  function buildDashboardSubtitle(scope, date) {
    const dateText = formatDisplayDate(date);

    if (scope.type === 'organization') {
      return `${dateText} • Monitor your organization in real time.`;
    }

    if (scope.type === 'hierarchy') {
      return `${dateText} • Monitor staff within your authorized hierarchy.`;
    }

    return `${dateText} • View staff within your authorized visibility.`;
  }

  /* ======================================================
     FILTER OPTIONS
  ====================================================== */

  function populateFilters(data) {
    const filters = data.filters || {};

    populateTeamFilter(filters.teams || []);

    populateManagerFilter(filters.managers || []);

    configureFilterVisibility(data);
  }

  function populateTeamFilter(teams) {
    const select = document.getElementById('dashboardTeamFilter');

    if (!select) {
      return;
    }

    const current = select.value;

    select.innerHTML = `
      <option value="">
        All Teams
      </option>
    `;

    const seen = new Set();

    teams.forEach((team) => {
      if (!team?.id || seen.has(String(team.id))) {
        return;
      }

      seen.add(String(team.id));

      const option = document.createElement('option');

      option.value = team.id;

      option.textContent = getTeamDisplayName(team);

      select.appendChild(option);
    });

    if (teams.some((team) => String(team?.id) === String(current))) {
      select.value = current;
    }
  }

  function populateManagerFilter(managers) {
    const select = document.getElementById('dashboardManagerFilter');

    if (!select) {
      return;
    }

    const current = select.value;

    select.innerHTML = `
      <option value="">
        All Managers
      </option>
    `;

    const seen = new Set();

    managers.forEach((manager) => {
      if (!manager?.id || seen.has(String(manager.id))) {
        return;
      }

      seen.add(String(manager.id));

      const option = document.createElement('option');

      option.value = manager.id;

      option.textContent = manager.fullName || manager.name || 'Unnamed Manager';

      select.appendChild(option);
    });

    if (managers.some((manager) => String(manager?.id) === String(current))) {
      select.value = current;
    }
  }

  /* ======================================================
     TEAM
  ====================================================== */

  function getTeamDisplayName(team) {
    const name = team?.name || team?.teamName || team?.title || '';

    return String(name).trim() || 'Unnamed Team';
  }

  function findTeam(teamId) {
    const teams = dashboardMeta?.filters?.teams || [];

    return teams.find((team) => String(team?.id) === String(teamId));
  }

  function findManager(managerId) {
    const managers = dashboardMeta?.filters?.managers || [];

    return managers.find((manager) => String(manager?.id) === String(managerId));
  }

  /* ======================================================
     FILTER VISIBILITY
  ====================================================== */

  function configureFilterVisibility(data) {
    const role = data.user?.role;

    const teamWrapper = document.getElementById('teamFilterWrapper');

    const managerWrapper = document.getElementById('managerFilterWrapper');

    if (role === 'field_executive') {
      if (teamWrapper) {
        teamWrapper.style.display = 'none';
      }

      if (managerWrapper) {
        managerWrapper.style.display = 'none';
      }

      return;
    }

    if (teamWrapper) {
      teamWrapper.style.display = data.filters?.teams?.length ? '' : 'none';
    }

    if (managerWrapper) {
      managerWrapper.style.display = data.filters?.managers?.length ? '' : 'none';
    }
  }

  /* ======================================================
     ATTENDANCE
  ====================================================== */

  function populateAttendance(data) {
    const attendance = data.attendance || {};

    const total = Number(attendance.total || 0);

    const present = Number(attendance.present || 0);

    const working = Number(attendance.working || 0);

    const late = Number(attendance.late || 0);

    const leave = Number(attendance.leave || 0);

    const absent = Number(attendance.absent || 0);

    const percentage = Number(attendance.percentage || 0);

    const notMarked = Number(attendance.notMarked || 0);

    setText('totalStaff', total);

    setText('presentCount', present);

    setText('leaveCount', leave);

    setText('lateCount', late);

    setText('attendancePercent', `${percentage}%`);

    setText('attendanceCircle', percentage);

    setText('attendancePresent', present);

    setText('attendanceWorking', working);

    setText('attendanceLate', late);

    setText('attendanceLeave', leave);

    /*
     * IMPORTANT:
     *
     * This value comes ONLY from
     * explicit backend absent status.
     */

    setText('attendanceAbsent', absent);

    updateAttendanceRing(percentage);

    setText('attendanceSubtitle', `Attendance for ${formatDisplayDate(data.date)}`);

    setText('presentMeta', `${percentage}% attendance`);

    setText('leaveMeta', `${leave} staff on leave`);

    setText('lateMeta', `${late} late arrivals`);
  }

  /* ======================================================
     ATTENDANCE RING
  ====================================================== */

  function updateAttendanceRing(percentage) {
    const ring = document.getElementById('attendanceCircleRing');

    if (!ring) {
      return;
    }

    const safe = Math.max(0, Math.min(100, Number(percentage) || 0));

    const degrees = safe * 3.6;

    ring.style.background = `conic-gradient(
        var(--primary) 0deg,
        var(--primary) ${degrees}deg,
        var(--border-color) ${degrees}deg,
        var(--border-color) 360deg
      )`;
  }

  /* ======================================================
     TRACKING
  ====================================================== */

  function populateTracking(data) {
    const tracking = data.tracking || {};

    const online = Number(tracking.online || 0);

    const offline = Number(tracking.offline || 0);

    setText('onlineCount', `${online} Online`);

    setText('onlineStaffLabel', `${online} online`);

    setText('offlineStaffLabel', `${offline} offline`);

    updateEmployeeMap(data.staff || []);
  }

  /* ======================================================
     STAFF TABLE
  ====================================================== */

  function populateStaffTable(data) {
    const tbody = document.getElementById('dashboardStaffTable');

    if (!tbody) {
      return;
    }

    const staff = data.staff || [];

    setText('staffListCount', staff.length);

    if (!staff.length) {
      tbody.innerHTML = `

        <tr>

          <td
            colspan="7"
            class="dashboard-empty-state"
          >

            <i class="bi bi-search d-block mb-2 fs-5"></i>

            No staff found for the
            selected filters.

          </td>

        </tr>

      `;

      return;
    }

    tbody.innerHTML = staff.map(renderStaffRow).join('');
  }

  function renderStaffRow(item) {
    const name = item.fullName || item.name || 'Unknown';

    const role = formatRole(item.role);

    /*
     * IMPORTANT:
     *
     * Do NOT default status
     * to absent.
     */

    const status = String(item.status || 'not_marked').toLowerCase();

    const statusLabel = formatStatus(status);

    const checkIn = formatTime(item.checkIn);

    const checkOut = formatTime(item.checkOut);

    const working = formatWorkingTime(item.workingMinutes);

    const initials = getInitials(name);

    const team = item.teamName || item.team?.name || '--';

    return `

      <tr>

        <td>

          <div class="dashboard-staff-user">

            <div class="dashboard-staff-avatar">
              ${escapeHtml(initials)}
            </div>

            <div>

              <div class="dashboard-staff-name">
                ${escapeHtml(name)}
              </div>

            </div>

          </div>

        </td>


        <td>

          <span class="dashboard-role-badge">
            ${escapeHtml(role)}
          </span>

        </td>


        <td>

          <span class="dashboard-team">
            ${escapeHtml(team)}
          </span>

        </td>


        <td>

          <span
            class="dashboard-status ${escapeHtml(status)}"
          >

            <i
              class="bi ${getStatusIcon(status)}"
            ></i>

            ${escapeHtml(statusLabel)}

          </span>

        </td>


        <td>

          <span class="dashboard-time">
            ${escapeHtml(checkIn)}
          </span>

        </td>


        <td>

          <span class="dashboard-time">
            ${escapeHtml(checkOut)}
          </span>

        </td>


        <td>

          <span class="dashboard-working">
            ${escapeHtml(working)}
          </span>

        </td>

      </tr>

    `;
  }

  /* ======================================================
     MAP
  ====================================================== */

  function initializeMap() {
    const container = document.getElementById('employeeMap');

    if (!container) {
      return;
    }

    if (typeof L === 'undefined') {
      console.error('Leaflet is not loaded');

      return;
    }

    if (dashboardMap) {
      dashboardMap.remove();
    }

    dashboardMap = L.map('employeeMap').setView([20.5937, 78.9629], 5);

    const street = L.tileLayer('https://mt1.google.com/vt/lyrs=m&x={x}&y={y}&z={z}', {
      maxZoom: 19,
      attribution: '© Google',
    });

    const satellite = L.tileLayer(
      'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}',
      {
        maxZoom: 19,
        attribution: 'Esri',
      }
    );

    const topo = L.tileLayer('https://{s}.tile.opentopomap.org/{z}/{x}/{y}.png', {
      maxZoom: 17,
      attribution: 'OpenTopoMap',
    });

    const dark = L.tileLayer('https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png', {
      maxZoom: 19,
      attribution: 'CartoDB',
    });

    street.addTo(dashboardMap);

    L.control
      .layers({
        Street: street,
        Satellite: satellite,
        Dark: dark,
        Topographic: topo,
      })
      .addTo(dashboardMap);

    setTimeout(() => {
      dashboardMap?.invalidateSize();
    }, 150);
  }

  /* ======================================================
     UPDATE MAP
  ====================================================== */

  function updateEmployeeMap(staff) {
    if (!dashboardMap) {
      return;
    }

    dashboardMarkers.forEach((marker) => {
      dashboardMap.removeLayer(marker);
    });

    dashboardMarkers = [];

    const bounds = [];

    let locations = 0;

    staff.forEach((item) => {
      const loc = item.currLoc;

      if (!hasValidLocation(loc)) {
        return;
      }

      const lat = Number(loc.lat);

      const lng = Number(loc.lng);

      locations++;

      const marker = L.marker([lat, lng]).addTo(dashboardMap);

      marker.bindPopup(`
          <div class="dashboard-popup-name">
            ${escapeHtml(item.fullName || 'Unknown')}
          </div>

          <div class="dashboard-popup-status">
            <i class="bi bi-circle-fill"></i>
            Location available
          </div>
        `);

      dashboardMarkers.push(marker);

      bounds.push([lat, lng]);
    });

    const empty = document.getElementById('mapEmptyState');

    empty?.classList.toggle('hidden', locations > 0);

    if (bounds.length === 1) {
      dashboardMap.setView(bounds[0], 15);
    }

    if (bounds.length > 1) {
      dashboardMap.fitBounds(bounds, {
        padding: [40, 40],
      });
    }

    if (bounds.length === 0) {
      dashboardMap.setView([20.5937, 78.9629], 5);
    }
  }

  function hasValidLocation(loc) {
    if (!loc) {
      return false;
    }

    const lat = Number(loc.lat);

    const lng = Number(loc.lng);

    return Number.isFinite(lat) && Number.isFinite(lng);
  }

  /* ======================================================
     RESET
  ====================================================== */

  function resetFilters() {
    const date = document.getElementById('dashboardDateFilter');

    const team = document.getElementById('dashboardTeamFilter');

    const manager = document.getElementById('dashboardManagerFilter');

    const search = document.getElementById('dashboardSearch');

    /*
     * Clear local filters.
     */

    if (team) {
      team.value = '';
    }

    if (manager) {
      manager.value = '';
    }

    if (search) {
      search.value = '';
    }

    /*
     * Keep currently selected date.
     *
     * Reset means clear filters,
     * not silently change date.
     */

    if (date) {
      date.value = normalizeDateForInput(dashboardMeta?.date) || getTodayIndia();
    }

    applyLocalFilters();
  }

  /* ======================================================
     DATE
  ====================================================== */

  function setCurrentDate() {
    const date = document.getElementById('dashboardDateFilter');

    if (date && !date.value) {
      date.value = getTodayIndia();
    }
  }

  function getTodayIndia() {
    const parts = new Intl.DateTimeFormat('en-CA', {
      timeZone: 'Asia/Kolkata',

      year: 'numeric',

      month: '2-digit',

      day: '2-digit',
    }).formatToParts(new Date());

    const result = {};

    parts.forEach((part) => {
      if (part.type !== 'literal') {
        result[part.type] = part.value;
      }
    });

    return `${result.year}-${result.month}-${result.day}`;
  }

  function normalizeDateForInput(value) {
    if (!value) {
      return '';
    }

    const string = String(value);

    /*
     * API may return:
     *
     * YYYYMMDD
     *
     * or
     *
     * YYYY-MM-DD
     */

    if (/^\d{8}$/.test(string)) {
      return `${string.substring(0, 4)}-${string.substring(4, 6)}-${string.substring(6, 8)}`;
    }

    if (/^\d{4}-\d{2}-\d{2}$/.test(string)) {
      return string;
    }

    return '';
  }

  function formatDisplayDate(value) {
    const normalized = normalizeDateForInput(value);

    if (!normalized) {
      return '--';
    }

    const date = new Date(`${normalized}T00:00:00`);

    if (Number.isNaN(date.getTime())) {
      return value;
    }

    return new Intl.DateTimeFormat('en-IN', {
      day: '2-digit',

      month: 'short',

      year: 'numeric',
    }).format(date);
  }

  /* ======================================================
     TIME
  ====================================================== */

  function formatTime(value) {
    if (!value) {
      return '--';
    }

    let date;

    if (value && typeof value.toDate === 'function') {
      date = value.toDate();
    } else {
      date = new Date(value);
    }

    if (Number.isNaN(date.getTime())) {
      return '--';
    }

    return new Intl.DateTimeFormat('en-IN', {
      hour: '2-digit',

      minute: '2-digit',

      hour12: true,

      timeZone: 'Asia/Kolkata',
    }).format(date);
  }

  function formatWorkingTime(minutes) {
    if (minutes === undefined || minutes === null || !Number.isFinite(Number(minutes))) {
      return '--';
    }

    const total = Math.max(0, Math.round(Number(minutes)));

    const hours = Math.floor(total / 60);

    const mins = total % 60;

    if (hours === 0) {
      return `${mins}m`;
    }

    return `${hours}h ${mins}m`;
  }

  /* ======================================================
     ROLE / STATUS
  ====================================================== */

  function formatRole(role) {
    if (!role) {
      return '--';
    }

    return String(role)
      .replaceAll('_', ' ')
      .replace(/\b\w/g, (char) => char.toUpperCase());
  }

  function formatStatus(status) {
    const labels = {
      not_marked: 'Not Marked',

      present: 'Present',

      working: 'Working',

      late: 'Late',

      leave: 'Leave',

      absent: 'Absent',

      weekly_off: 'Weekly Off',

      holiday: 'Holiday',
    };

    return labels[status] || 'Not Marked';
  }

  function getStatusIcon(status) {
    const icons = {
      not_marked: 'bi-dash-circle',

      present: 'bi-check-circle-fill',

      working: 'bi-person-workspace',

      late: 'bi-clock-fill',

      leave: 'bi-calendar-x-fill',

      absent: 'bi-dash-circle-fill',

      weekly_off: 'bi-calendar-week',

      holiday: 'bi-calendar-event',
    };

    return icons[status] || 'bi-dash-circle';
  }

  /* ======================================================
     USER
  ====================================================== */

  function loadUserName() {
    try {
      const user = JSON.parse(localStorage.getItem('userData') || '{}');

      currentUser = user;

      setText('userName', user.fullName || user.name || 'User');
    } catch (error) {
      console.warn('Unable to load local user:', error);
    }
  }

  /* ======================================================
     ACTIVE MENU
  ====================================================== */

  function highlightCurrentMenu() {
    const currentPath = window.location.pathname.replace(/\/$/, '') || '/dashboard';

    document.querySelectorAll('.menu-item').forEach((item) => {
      item.classList.remove('active', 'open');
    });

    document.querySelectorAll('.menu a').forEach((link) => {
      const href = link.getAttribute('href');

      if (!href || href === '#') {
        return;
      }

      const path = href.replace(/\/$/, '');

      if (path !== currentPath) {
        return;
      }

      link.classList.add('active');

      link.closest('.menu-item')?.classList.add('active');

      link.closest('.has-submenu')?.classList.add('active', 'open');
    });
  }

  /* ======================================================
     ANIMATION
  ====================================================== */

  function animateCards() {
    if (typeof IntersectionObserver === 'undefined') {
      return;
    }

    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (!entry.isIntersecting) {
            return;
          }

          entry.target.classList.add('fade-up');

          observer.unobserve(entry.target);
        });
      },
      {
        threshold: 0.1,
      }
    );

    document
      .querySelectorAll('.dashboard-kpi-card, .dashboard-card, .dashboard-welcome-card, .dashboard-filter-card')
      .forEach((card) => observer.observe(card));
  }

  /* ======================================================
     TOOLTIPS
  ====================================================== */

  function initializeTooltips() {
    if (typeof bootstrap === 'undefined') {
      return;
    }

    document.querySelectorAll('[data-bs-toggle="tooltip"]').forEach((element) => {
      bootstrap.Tooltip.getOrCreateInstance(element);
    });
  }

  /* ======================================================
     HELPERS
  ====================================================== */

  function setText(id, value) {
    const element = document.getElementById(id);

    if (element) {
      element.textContent = value ?? '';
    }
  }

  function getInitials(name) {
    return String(name || '')
      .trim()
      .split(/\s+/)
      .filter(Boolean)
      .slice(0, 2)
      .map((word) => word.charAt(0))
      .join('')
      .toUpperCase();
  }

  function escapeHtml(value) {
    return String(value ?? '')
      .replaceAll('&', '&amp;')
      .replaceAll('<', '&lt;')
      .replaceAll('>', '&gt;')
      .replaceAll('"', '&quot;')
      .replaceAll("'", '&#039;');
  }
})();
