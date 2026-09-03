/* ==========================================================
   TeamoTrack HR Dashboard
   dashboard.js

   API
   ----------------------------------------------------------
   GET /hr-dashboard/me?date=YYYY-MM-DD

   Dashboard strategy:
   ----------------------------------------------------------
   - Show workforce summary
   - Show action center
   - Show only a small attendance preview
   - Search/filter attendance locally
   - Show limited exceptions
   - Show limited pending leave
   - Show limited holidays
   - Full datasets remain on dedicated pages
=========================================================== */

(function () {
  'use strict';

  /* ======================================================
     STATE
  ====================================================== */

  let dashboardData = null;

  let dateRequestSequence = 0;

  let attendanceRows = [];

  let attendanceSearch = '';

  let attendanceStatus = 'all';

  /*
   * Dashboard should remain fast and readable
   * even when HR has 100+ employees.
   */
  const ATTENDANCE_PREVIEW_LIMIT = 10;

  const EXCEPTION_PREVIEW_LIMIT = 5;

  const LEAVE_PREVIEW_LIMIT = 5;

  const HOLIDAY_PREVIEW_LIMIT = 5;

  /* ======================================================
     INIT
  ====================================================== */

  if (window.initializeHrDashboard) {
    console.warn('TeamoTrack HR dashboard already initialized.');
    return;
  }

  window.initializeHrDashboard = async function () {
    console.log('Initializing HR dashboard...');

    try {
      initializeHrDashboardUser();

      initializeHrDashboardDate();

      initializeAttendanceControls();

      await loadHrDashboard();

      console.log('HR dashboard initialized.');
    } catch (error) {
      console.error('HR dashboard initialization failed:', error);

      if (typeof AppAlert !== 'undefined' && typeof AppAlert.close === 'function') {
        AppAlert.close();
      }

      if (typeof AppAlert !== 'undefined' && typeof AppAlert.error === 'function') {
        AppAlert.error(error.message || 'Failed to load HR dashboard');
      }

      showHrDashboardError();
    }
  };

  /* ======================================================
     LOAD DASHBOARD
  ====================================================== */

  async function loadHrDashboard(requestedDate = null) {
    /*
     * Priority:
     *
     * 1. Explicit date
     * 2. Date filter if available
     * 3. India today
     */

    const date = requestedDate || document.getElementById('hrDashboardDateFilter')?.value || getTodayIndia();

    const requestId = ++dateRequestSequence;

    try {
      setDashboardLoading();

      AppAlert.loading("Loading Dashboard");
      const query = `?date=${encodeURIComponent(date)}`;

      const data = await Api.get(`/hr-dashboard/me${query}`);

      /*
       * Ignore stale requests.
       */
      if (requestId !== dateRequestSequence) {
        AppAlert.close();
        return;
      }

      if (!data) {
        AppAlert.close();
        throw new Error('Empty dashboard response.');
      }

      dashboardData = data;

      /*
       * Keep backend date as source of truth.
       */
      updateDashboardDate(data.date);

      /*
       * Header.
       */
      populateHeader(data);

      /*
       * Workforce statistics.
       */
      populateAttendance(data);

      /*
       * HR statistics.
       */
      populateHrData(data);

      /*
       * Attendance dataset.
       */
      attendanceRows = Array.isArray(data.staff) ? data.staff : [];

      /*
       * Render dashboard preview.
       */
      renderAttendance(attendanceRows);

      renderExceptions(data.hr?.exceptions || []);

      renderPendingLeave(data.hr?.pendingLeave || []);

      renderHolidays(data.hr?.holidays || []);

      /*
       * Action center.
       */
      updateActionCenter(data);

      /*
       * Close loading alert if one exists.
       */
      if (typeof AppAlert !== 'undefined' && typeof AppAlert.close === 'function') {
        AppAlert.close();
      }
    } catch (error) {
      console.error('HR dashboard loading failed:', error);

      if (requestId !== dateRequestSequence) {
        AppAlert.close();
        return;
      }

      if (typeof AppAlert !== 'undefined' && typeof AppAlert.close === 'function') {
        AppAlert.close();
      }

      showHrDashboardError();

      if (typeof AppAlert !== 'undefined' && typeof AppAlert.error === 'function') {
        AppAlert.error(error.message || 'Failed to load HR dashboard');
      }
    }
  }

  /* ======================================================
     HEADER
  ====================================================== */

  function populateHeader(data) {
    const user = data.user || {};

    const scope = data.scope || {};

    const name = user.fullName || user.name || 'User';

    setText('hrUserName', name);

    setText('hrCurrentDate', formatDashboardDate(data.date));

    setText('hrScopeLabel', scope.label || 'Authorized Staff');
  }

  /* ======================================================
     USER
  ====================================================== */

  function initializeHrDashboardUser() {
    try {
      const raw = localStorage.getItem('userData') || '{}';

      const userData = JSON.parse(raw);

      const name = userData.fullName || userData.name || 'User';

      setText('hrUserName', name);
    } catch (error) {
      console.warn('Unable to load local HR user:', error);

      setText('hrUserName', 'User');
    }
  }

  /* ======================================================
     DATE
  ====================================================== */

  function initializeHrDashboardDate() {
    const element = document.getElementById('hrCurrentDate');

    if (!element) {
      return;
    }

    element.textContent = formatTodayForDisplay();
  }

  function updateDashboardDate(value) {
    if (!value) {
      return;
    }

    setText('hrCurrentDate', formatDashboardDate(value));
  }

  /* ======================================================
     ATTENDANCE
  ====================================================== */

  function populateAttendance(data) {
    const attendance = data.attendance || {};

    const total = Number(attendance.total ?? 0);

    const present = Number(attendance.present ?? 0);

    const absent = Number(attendance.absent ?? 0);

    const late = Number(attendance.late ?? 0);

    const leave = Number(attendance.leave ?? 0);

    setDashboardValue('totalExecutives', total);

    setDashboardValue('presentCount', present);

    setDashboardValue('absentCount', absent);

    setDashboardValue('lateCount', late);

    setDashboardValue('onLeaveCount', leave);
  }

  /* ======================================================
     HR DATA
  ====================================================== */

  function populateHrData(data) {
    const hr = data.hr || {};

    const pendingLeave = Array.isArray(hr.pendingLeave) ? hr.pendingLeave : [];

    const exceptions = Array.isArray(hr.exceptions) ? hr.exceptions : [];

    const holidays = Array.isArray(hr.holidays) ? hr.holidays : [];

    setDashboardValue('pendingLeaveCount', pendingLeave.length);

    setDashboardValue('exceptionCount', exceptions.length);

    return {
      pendingLeave,
      exceptions,
      holidays,
    };
  }

  /* ======================================================
     ACTION CENTER
  ====================================================== */

  function updateActionCenter(data) {
    const hr = data.hr || {};

    const pendingLeave = Array.isArray(hr.pendingLeave) ? hr.pendingLeave : [];

    const exceptions = Array.isArray(hr.exceptions) ? hr.exceptions : [];

    const attendance = data.attendance || {};

    setText('hrPendingLeaveAction', pendingLeave.length);

    setText('hrExceptionAction', exceptions.length);

    /*
     * Show present/total in the attendance
     * action card if the element exists.
     */
    const attendanceAction = document.getElementById('hrAttendanceAction');

    if (attendanceAction) {
      const present = Number(attendance.present ?? 0);

      const total = Number(attendance.total ?? 0);

      attendanceAction.textContent = `${present} / ${total}`;
    }
  }

  /* ======================================================
     ATTENDANCE CONTROLS
  ====================================================== */

  function initializeAttendanceControls() {
    const search = document.getElementById('hrAttendanceSearch');

    const status = document.getElementById('hrAttendanceStatus');

    if (search) {
      search.addEventListener('input', () => {
        attendanceSearch = search.value.trim().toLowerCase();

        renderAttendance(attendanceRows);
      });
    }

    if (status) {
      status.addEventListener('change', () => {
        attendanceStatus = String(status.value || 'all')
          .trim()
          .toLowerCase();

        renderAttendance(attendanceRows);
      });
    }
  }

  /* ======================================================
     ATTENDANCE TABLE
  ====================================================== */

  function renderAttendance(staff) {
    const tbody = document.getElementById('hrAttendanceTable');

    if (!tbody) {
      return;
    }

    if (!Array.isArray(staff) || !staff.length) {
      renderAttendanceEmpty(tbody, 'No executives found.');

      updateAttendanceSummary(0, 0);

      return;
    }

    /*
     * Search.
     */
    let filtered = staff.filter((employee) => {
      if (!attendanceSearch) {
        return true;
      }

      const name = String(employee.fullName || employee.name || '').toLowerCase();

      return name.includes(attendanceSearch);
    });

    /*
     * Status.
     */
    if (attendanceStatus !== 'all') {
      filtered = filtered.filter((employee) => {
        const status = String(employee.status || 'not_marked')
          .trim()
          .toLowerCase();

        return status === attendanceStatus;
      });
    }

    const totalFiltered = filtered.length;

    /*
     * Only render a small preview.
     */
    const visible = filtered.slice(0, ATTENDANCE_PREVIEW_LIMIT);

    if (!visible.length) {
      renderAttendanceEmpty(tbody, 'No attendance matches your filters.');

      updateAttendanceSummary(0, totalFiltered);

      return;
    }

    tbody.innerHTML = visible
      .map((employee) => {
        return renderAttendanceRow(employee);
      })
      .join('');

    updateAttendanceSummary(visible.length, totalFiltered);
  }

  /* ======================================================
     ATTENDANCE ROW
  ====================================================== */

  function renderAttendanceRow(employee) {
    const name = escapeHtml(employee.fullName || employee.name || 'Unknown');

    const checkIn = employee.checkIn ? formatTime(employee.checkIn) : '—';

    const checkOut = employee.checkOut ? formatTime(employee.checkOut) : '—';

    const working = formatWorkingMinutes(employee.workingMinutes);

    const status = String(employee.status || 'not_marked')
      .trim()
      .toLowerCase();

    const statusLabel = formatAttendanceStatus(status);

    const statusClass = getStatusClass(status);

    /*
     * Optional initials.
     */
    const initials = getInitials(employee.fullName || employee.name || 'User');

    return `
      <tr>

        <td>
          <div class="hr-staff-cell">

            <div class="hr-staff-avatar">
              ${escapeHtml(initials)}
            </div>

            <div class="hr-staff-name">
              ${name}
            </div>

          </div>
        </td>

        <td>
          ${escapeHtml(checkIn)}
        </td>

        <td>
          ${escapeHtml(checkOut)}
        </td>

        <td>
          ${escapeHtml(working)}
        </td>

        <td>
          <span
            class="hr-status-badge ${statusClass}"
          >
            ${escapeHtml(statusLabel)}
          </span>
        </td>

      </tr>
    `;
  }

  /* ======================================================
     ATTENDANCE EMPTY
  ====================================================== */

  function renderAttendanceEmpty(tbody, message) {
    tbody.innerHTML = `
      <tr>
        <td
          colspan="5"
          class="hr-table-empty"
        >
          <div class="hr-empty-state">

            <i class="bi bi-inbox"></i>

            <span>
              ${escapeHtml(message)}
            </span>

          </div>
        </td>
      </tr>
    `;
  }

  /* ======================================================
     ATTENDANCE SUMMARY
  ====================================================== */

  function updateAttendanceSummary(visibleCount, filteredCount) {
    const element = document.getElementById('hrAttendanceSummary');

    if (!element) {
      return;
    }

    if (!filteredCount) {
      element.textContent = 'No matching employees';

      return;
    }

    if (filteredCount > ATTENDANCE_PREVIEW_LIMIT) {
      element.textContent = `Showing ${visibleCount} of ${filteredCount}`;
    } else {
      element.textContent = `Showing ${filteredCount} employee${filteredCount === 1 ? '' : 's'}`;
    }
  }

  /* ======================================================
     EXCEPTIONS
  ====================================================== */

  function renderExceptions(exceptions) {
    const container = document.getElementById('hrExceptionList');

    if (!container) {
      return;
    }

    if (!Array.isArray(exceptions) || !exceptions.length) {
      container.innerHTML = `
        <div class="hr-list-empty">

          <i class="bi bi-check-circle"></i>

          <span>
            No attendance exceptions.
          </span>

        </div>
      `;

      return;
    }

    const visible = exceptions.slice(0, EXCEPTION_PREVIEW_LIMIT);

    container.innerHTML = visible
      .map((item) => {
        const name = escapeHtml(item.fullName || item.userName || 'Unknown');

        const label = escapeHtml(item.label || item.message || 'Attendance exception');

        const initials = getInitials(item.fullName || item.userName || 'User');

        return `
            <div class="hr-list-item">

              <div class="hr-list-item-icon">
                ${escapeHtml(initials)}
              </div>

              <div class="hr-list-item-content">

                <span class="hr-list-item-title">
                  ${name}
                </span>

                <span class="hr-list-item-meta">
                  ${label}
                </span>

              </div>

              <i
                class="bi bi-chevron-right hr-list-item-action"
              ></i>

            </div>
          `;
      })
      .join('');

    if (exceptions.length > EXCEPTION_PREVIEW_LIMIT) {
      container.insertAdjacentHTML(
        'beforeend',
        `
          <div class="hr-list-more">
            +${exceptions.length - EXCEPTION_PREVIEW_LIMIT}
            more exceptions
          </div>
        `
      );
    }
  }

  /* ======================================================
     PENDING LEAVE
  ====================================================== */

  function renderPendingLeave(leaves) {
    const container = document.getElementById('hrLeaveList');

    if (!container) {
      return;
    }

    if (!Array.isArray(leaves) || !leaves.length) {
      container.innerHTML = `
        <div class="hr-list-empty">

          <i class="bi bi-check-circle"></i>

          <span>
            No pending leave requests.
          </span>

        </div>
      `;

      return;
    }

    const visible = leaves.slice(0, LEAVE_PREVIEW_LIMIT);

    container.innerHTML = visible
      .map((leave) => {
        const name = escapeHtml(leave.userName || leave.fullName || 'Unknown');

        const start = formatIsoDate(leave.startDate);

        const end = formatIsoDate(leave.endDate);

        const days = leave.days != null ? Number(leave.days) : null;

        let duration = '—';

        if (days != null && Number.isFinite(days)) {
          duration = `${days} day${days === 1 ? '' : 's'}`;
        }

        const initials = getInitials(leave.userName || leave.fullName || 'User');

        return `
            <div class="hr-list-item">

              <div class="hr-list-item-icon">
                ${escapeHtml(initials)}
              </div>

              <div class="hr-list-item-content">

                <span class="hr-list-item-title">
                  ${name}
                </span>

                <span class="hr-list-item-meta">
                  ${escapeHtml(start)}
                  ${start !== end ? ` – ${escapeHtml(end)}` : ''}
                  · ${escapeHtml(duration)}
                </span>

              </div>

              <span class="hr-status hr-status-pending">
                Pending
              </span>

            </div>
          `;
      })
      .join('');

    if (leaves.length > LEAVE_PREVIEW_LIMIT) {
      container.insertAdjacentHTML(
        'beforeend',
        `
          <div class="hr-list-more">
            +${leaves.length - LEAVE_PREVIEW_LIMIT}
            more pending requests
          </div>
        `
      );
    }
  }

  /* ======================================================
     HOLIDAYS
  ====================================================== */

  function renderHolidays(holidays) {
    const container = document.getElementById('hrHolidayList');

    if (!container) {
      return;
    }

    if (!Array.isArray(holidays) || !holidays.length) {
      container.innerHTML = `
        <div class="hr-list-empty">

          <i class="bi bi-calendar-x"></i>

          <span>
            No upcoming holidays.
          </span>

        </div>
      `;

      return;
    }

    const visible = holidays.slice(0, HOLIDAY_PREVIEW_LIMIT);

    container.innerHTML = visible
      .map((holiday) => {
        const name = escapeHtml(holiday.name || 'Holiday');

        const date = formatIsoDate(holiday.date);

        const optional = holiday.isOptional === true ? 'Optional' : '';

        return `
            <div class="hr-list-item">

              <div class="hr-holiday-date">
                <span>
                  ${escapeHtml(formatHolidayDay(holiday.date))}
                </span>

                <small>
                  ${escapeHtml(formatHolidayMonth(holiday.date))}
                </small>
              </div>

              <div class="hr-list-item-content">

                <span class="hr-list-item-title">
                  ${name}
                </span>

                <span class="hr-list-item-meta">
                  ${escapeHtml(date)}
                  ${optional ? ` · ${escapeHtml(optional)}` : ''}
                </span>

              </div>

            </div>
          `;
      })
      .join('');

    if (holidays.length > HOLIDAY_PREVIEW_LIMIT) {
      container.insertAdjacentHTML(
        'beforeend',
        `
          <div class="hr-list-more">
            +${holidays.length - HOLIDAY_PREVIEW_LIMIT}
            more holidays
          </div>
        `
      );
    }
  }

  /* ======================================================
     LOADING
  ====================================================== */

  function setDashboardLoading() {
    const values = [
      'totalExecutives',
      'presentCount',
      'absentCount',
      'lateCount',
      'onLeaveCount',
      'pendingLeaveCount',
      'exceptionCount',
    ];

    values.forEach((id) => {
      setDashboardValue(id, '—');
    });

    setText('hrPendingLeaveAction', '—');

    setText('hrExceptionAction', '—');

    setText('hrAttendanceAction', '—');

    const attendance = document.getElementById('hrAttendanceTable');

    if (attendance) {
      attendance.innerHTML = `
        <tr>

          <td
            colspan="5"
            class="hr-table-empty"
          >
            <div class="hr-loading-state">

              <span class="spinner-border spinner-border-sm"></span>

              <span>
                Loading attendance...
              </span>

            </div>
          </td>

        </tr>
      `;
    }

    const summary = document.getElementById('hrAttendanceSummary');

    if (summary) {
      summary.textContent = 'Loading...';
    }

    const exceptions = document.getElementById('hrExceptionList');

    if (exceptions) {
      exceptions.innerHTML = `
        <div class="hr-list-loading">
          Loading exceptions...
        </div>
      `;
    }

    const leave = document.getElementById('hrLeaveList');

    if (leave) {
      leave.innerHTML = `
        <div class="hr-list-loading">
          Loading leave requests...
        </div>
      `;
    }

    const holidays = document.getElementById('hrHolidayList');

    if (holidays) {
      holidays.innerHTML = `
        <div class="hr-list-loading">
          Loading holidays...
        </div>
      `;
    }
  }

  /* ======================================================
     ERROR
  ====================================================== */

  function showHrDashboardError() {
    const values = [
      'totalExecutives',
      'presentCount',
      'absentCount',
      'lateCount',
      'onLeaveCount',
      'pendingLeaveCount',
      'exceptionCount',
    ];

    values.forEach((id) => {
      setDashboardValue(id, '—');
    });

    setText('hrPendingLeaveAction', '—');

    setText('hrExceptionAction', '—');

    setText('hrAttendanceAction', '—');

    const attendance = document.getElementById('hrAttendanceTable');

    if (attendance) {
      attendance.innerHTML = `
        <tr>

          <td
            colspan="5"
            class="hr-table-empty"
          >
            <div class="hr-empty-state">

              <i class="bi bi-exclamation-circle"></i>

              <span>
                Unable to load attendance.
              </span>

            </div>
          </td>

        </tr>
      `;
    }

    const summary = document.getElementById('hrAttendanceSummary');

    if (summary) {
      summary.textContent = 'Unable to load data';
    }

    const exceptions = document.getElementById('hrExceptionList');

    if (exceptions) {
      exceptions.innerHTML = `
        <div class="hr-list-empty">
          Unable to load exceptions.
        </div>
      `;
    }

    const leave = document.getElementById('hrLeaveList');

    if (leave) {
      leave.innerHTML = `
        <div class="hr-list-empty">
          Unable to load leave requests.
        </div>
      `;
    }

    const holidays = document.getElementById('hrHolidayList');

    if (holidays) {
      holidays.innerHTML = `
        <div class="hr-list-empty">
          Unable to load holidays.
        </div>
      `;
    }
  }

  /* ======================================================
     STAT VALUE
  ====================================================== */

  function setDashboardValue(elementId, value) {
    const element = document.getElementById(elementId);

    if (element) {
      element.textContent = value ?? '—';
    }
  }

  /* ======================================================
     TEXT
  ====================================================== */

  function setText(id, value) {
    const element = document.getElementById(id);

    if (element) {
      element.textContent = value ?? '';
    }
  }

  /* ======================================================
     ATTENDANCE STATUS
  ====================================================== */

  function formatAttendanceStatus(status) {
    switch (status) {
      case 'working':
        return 'Working';

      case 'present':
        return 'Present';

      case 'late':
        return 'Late';

      case 'leave':
        return 'On Leave';

      case 'absent':
        return 'Absent';

      case 'weekly_off':
        return 'Weekly Off';

      case 'holiday':
        return 'Holiday';

      case 'not_marked':
      default:
        return 'Not Marked';
    }
  }

  /* ======================================================
     STATUS CLASS
  ====================================================== */

  function getStatusClass(status) {
    switch (status) {
      case 'working':
        return 'status-working';

      case 'present':
        return 'status-present';

      case 'late':
        return 'status-late';

      case 'leave':
        return 'status-leave';

      case 'absent':
        return 'status-absent';

      case 'weekly_off':
        return 'status-weekly-off';

      case 'holiday':
        return 'status-holiday';

      case 'not_marked':
      default:
        return 'status-not-marked';
    }
  }

  /* ======================================================
     INITIALS
  ====================================================== */

  function getInitials(name) {
    const value = String(name || 'User').trim();

    if (!value) {
      return 'U';
    }

    const parts = value.split(/\s+/);

    if (parts.length === 1) {
      return parts[0].substring(0, 2).toUpperCase();
    }

    return (parts[0].charAt(0) + parts[parts.length - 1].charAt(0)).toUpperCase();
  }

  /* ======================================================
     WORKING MINUTES
  ====================================================== */

  function formatWorkingMinutes(minutes) {
    if (minutes == null || !Number.isFinite(Number(minutes))) {
      return '—';
    }

    const total = Math.max(0, Math.round(Number(minutes)));

    const hours = Math.floor(total / 60);

    const mins = total % 60;

    if (hours > 0) {
      return `${hours}h ${mins}m`;
    }

    return `${mins}m`;
  }

  /* ======================================================
     TIME
  ====================================================== */

  function formatTime(value) {
    const date = parseDateValue(value);

    if (!date) {
      return '—';
    }

    return new Intl.DateTimeFormat('en-IN', {
      hour: '2-digit',
      minute: '2-digit',
      hour12: true,
      timeZone: 'Asia/Kolkata',
    }).format(date);
  }

  /* ======================================================
     DASHBOARD DATE
  ====================================================== */

  function formatDashboardDate(value) {
    const normalized = normalizeDashboardDate(value);

    if (!normalized) {
      return 'Today';
    }

    const date = new Date(`${normalized}T00:00:00`);

    if (Number.isNaN(date.getTime())) {
      return 'Today';
    }

    return new Intl.DateTimeFormat('en-IN', {
      weekday: 'long',
      day: 'numeric',
      month: 'long',
      year: 'numeric',
      timeZone: 'Asia/Kolkata',
    }).format(date);
  }

  function formatTodayForDisplay() {
    return new Intl.DateTimeFormat('en-IN', {
      weekday: 'long',
      day: 'numeric',
      month: 'long',
      year: 'numeric',
      timeZone: 'Asia/Kolkata',
    }).format(new Date());
  }

  function normalizeDashboardDate(value) {
    if (!value) {
      return '';
    }

    const string = String(value).trim();

    /*
     * YYYYMMDD
     */
    if (/^\d{8}$/.test(string)) {
      return `${string.substring(0, 4)}-` + `${string.substring(4, 6)}-` + `${string.substring(6, 8)}`;
    }

    /*
     * YYYY-MM-DD
     */
    if (/^\d{4}-\d{2}-\d{2}$/.test(string)) {
      return string;
    }

    return '';
  }

  /* ======================================================
     ISO DATE
  ====================================================== */

  function formatIsoDate(value) {
    if (!value) {
      return '—';
    }

    const string = String(value).trim();

    const date = new Date(`${string}T00:00:00`);

    if (Number.isNaN(date.getTime())) {
      return string;
    }

    return new Intl.DateTimeFormat('en-IN', {
      day: 'numeric',
      month: 'short',
      year: 'numeric',
    }).format(date);
  }

  /* ======================================================
     HOLIDAY DAY
  ====================================================== */

  function formatHolidayDay(value) {
    if (!value) {
      return '—';
    }

    const date = new Date(`${value}T00:00:00`);

    if (Number.isNaN(date.getTime())) {
      return '—';
    }

    return new Intl.DateTimeFormat('en-IN', {
      day: 'numeric',
    }).format(date);
  }

  /* ======================================================
     HOLIDAY MONTH
  ====================================================== */

  function formatHolidayMonth(value) {
    if (!value) {
      return '';
    }

    const date = new Date(`${value}T00:00:00`);

    if (Number.isNaN(date.getTime())) {
      return '';
    }

    return new Intl.DateTimeFormat('en-IN', {
      month: 'short',
    })
      .format(date)
      .toUpperCase();
  }

  /* ======================================================
     TODAY INDIA
  ====================================================== */

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

    return `${result.year}-` + `${result.month}-` + `${result.day}`;
  }

  /* ======================================================
     PARSE DATE
  ====================================================== */

  function parseDateValue(value) {
    if (!value) {
      return null;
    }

    let date;

    if (value instanceof Date) {
      date = value;
    } else if (value && typeof value.toDate === 'function') {
      date = value.toDate();
    } else {
      date = new Date(value);
    }

    if (Number.isNaN(date.getTime())) {
      return null;
    }

    return date;
  }

  /* ======================================================
     ESCAPE HTML
  ====================================================== */

  function escapeHtml(value) {
    return String(value ?? '')
      .replaceAll('&', '&amp;')
      .replaceAll('<', '&lt;')
      .replaceAll('>', '&gt;')
      .replaceAll('"', '&quot;')
      .replaceAll("'", '&#039;');
  }
})();
