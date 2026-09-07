/* ==========================================================
   TeamoTrack HR Dashboard
=========================================================== */

(function () {
  'use strict';

  const TIME_ZONE = 'Asia/Kolkata';

  const ATTENDANCE_PREVIEW_LIMIT = 10;

  const LIST_PREVIEW_LIMIT = 5;

  let dashboardData = null;

  let dateRequestSequence = 0;

  let attendanceRows = [];

  let attendanceSearch = '';

  let attendanceStatus = 'all';

  /* ======================================================
     INIT
  ====================================================== */

  if (window.initializeHrDashboard) {
    console.warn('TeamoTrack HR dashboard already initialized.');
    return;
  }

  window.initializeHrDashboard = async function () {
    try {
      initializeUser();

      initializeDate();

      initializeAttendanceControls();

      await loadDashboard();
    } catch (error) {
      console.error('HR dashboard initialization failed:', error);

      closeAlert();

      showDashboardError();

      showAlertError(error?.message || 'Failed to load HR dashboard');
    }
  };

  /* ======================================================
     LOAD
  ====================================================== */

  async function loadDashboard(requestedDate = null) {
    const date = requestedDate || document.getElementById('hrDashboardDateFilter')?.value || getTodayIndia();

    const requestId = ++dateRequestSequence;

    setDashboardLoading();

    showLoading('Loading Dashboard');

    try {
      const query = `?date=${encodeURIComponent(date)}`;

      const data = await Api.get(`/hr-dashboard/me${query}`);

      if (requestId !== dateRequestSequence) {
        closeAlert();
        return;
      }

      if (!data) {
        throw new Error('Empty dashboard response.');
      }

      dashboardData = data;

      updateDashboardDate(data.date);

      populateHeader(data);

      populateAttendance(data);

      populateHrData(data);

      attendanceRows = Array.isArray(data.staff) ? data.staff : [];

      renderAttendance(attendanceRows);

      renderRegularizations(data.hr?.regularizations || []);

      renderPendingLeave(data.hr?.pendingLeave || []);

      renderHolidays(data.hr?.holidays || []);

      closeAlert();
    } catch (error) {
      console.error('HR dashboard loading failed:', error);

      if (requestId !== dateRequestSequence) {
        closeAlert();
        return;
      }

      closeAlert();

      showDashboardError();

      showAlertError(error?.message || 'Failed to load HR dashboard');
    }
  }

  /* ======================================================
     HEADER
  ====================================================== */

  function populateHeader(data) {
    const user = data?.user || {};

    const scope = data?.scope || {};

    setText('hrUserName', user.fullName || user.name || 'User');

    setText('hrCurrentDate', formatDashboardDate(data?.date));

    setText('hrScopeLabel', scope.label || 'Authorized Staff');
  }

  /* ======================================================
     USER
  ====================================================== */

  function initializeUser() {
    try {
      const raw = localStorage.getItem('userData') || '{}';

      const user = JSON.parse(raw);

      setText('hrUserName', user.fullName || user.name || 'User');
    } catch (error) {
      console.warn('Unable to load local HR user:', error);

      setText('hrUserName', 'User');
    }
  }

  /* ======================================================
     DATE
  ====================================================== */

  function initializeDate() {
    setText('hrCurrentDate', formatTodayForDisplay());
  }

  function updateDashboardDate(value) {
    if (!value) {
      return;
    }

    setText('hrCurrentDate', formatDashboardDate(value));
  }

  /* ======================================================
     ATTENDANCE SUMMARY
  ====================================================== */

  function populateAttendance(data) {
    const attendance = data?.attendance || {};

    const values = {
      totalExecutives: Number(attendance.total ?? 0),

      presentCount: Number(attendance.present ?? 0),

      absentCount: Number(attendance.absent ?? 0),

      lateCount: Number(attendance.late ?? 0),

      onLeaveCount: Number(attendance.leave ?? 0),
    };

    Object.entries(values).forEach(([id, value]) => {
      setDashboardValue(id, value);
    });
  }

  /* ======================================================
     HR SUMMARY
  ====================================================== */

  function populateHrData(data) {
    const hr = data?.hr || {};

    const pendingLeave = getArray(hr.pendingLeave);

    const regularizations = getArray(hr.regularizations);

    setDashboardValue('pendingLeaveCount', pendingLeave.length);

    setDashboardValue('regularizationCount', regularizations.length);
  }

  /* ======================================================
     ATTENDANCE CONTROLS
  ====================================================== */

  function initializeAttendanceControls() {
    const search = document.getElementById('hrAttendanceSearch');

    const status = document.getElementById('hrAttendanceStatus');

    search?.addEventListener('input', () => {
      attendanceSearch = search.value.trim().toLowerCase();

      renderAttendance(attendanceRows);
    });

    status?.addEventListener('change', () => {
      attendanceStatus = String(status.value || 'all')
        .trim()
        .toLowerCase();

      renderAttendance(attendanceRows);
    });
  }

  /* ======================================================
     ATTENDANCE TABLE
  ====================================================== */

  function renderAttendance(staff) {
    const tbody = document.getElementById('hrAttendanceTable');

    if (!tbody) {
      return;
    }

    if (!staff.length) {
      renderAttendanceEmpty(tbody, 'No executives found.');

      updateAttendanceSummary(0, 0);

      return;
    }

    const filtered = staff.filter(matchesAttendanceFilters);

    const visible = filtered.slice(0, ATTENDANCE_PREVIEW_LIMIT);

    if (!visible.length) {
      renderAttendanceEmpty(tbody, 'No attendance matches your filters.');

      updateAttendanceSummary(0, filtered.length);

      return;
    }

    tbody.innerHTML = visible.map(renderAttendanceRow).join('');

    updateAttendanceSummary(visible.length, filtered.length);
  }

  function matchesAttendanceFilters(employee) {
    if (attendanceSearch) {
      const name = String(employee.fullName || employee.name || '').toLowerCase();

      if (!name.includes(attendanceSearch)) {
        return false;
      }
    }

    if (attendanceStatus !== 'all') {
      const status = String(employee.status || 'not_marked')
        .trim()
        .toLowerCase();

      if (status !== attendanceStatus) {
        return false;
      }
    }

    return true;
  }

  function renderAttendanceRow(employee) {
    const name = employee.fullName || employee.name || 'Unknown';

    const initials = getInitials(name);

    const checkIn = employee.checkIn ? formatTime(employee.checkIn) : '—';

    const checkOut = employee.checkOut ? formatTime(employee.checkOut) : '—';

    const working = formatWorkingMinutes(employee.workingMinutes);

    const status = String(employee.status || 'not_marked')
      .trim()
      .toLowerCase();

    return `
      <tr>

        <td>
          <div class="hr-staff-cell">

            <div class="hr-staff-avatar">
              ${escapeHtml(initials)}
            </div>

            <div class="hr-staff-name">
              ${escapeHtml(name)}
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
          <span class="hr-status-badge ${getStatusClass(status)}">
            ${escapeHtml(formatAttendanceStatus(status))}
          </span>
        </td>

      </tr>
    `;
  }

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

      return;
    }

    element.textContent = `Showing ${filteredCount} employee${filteredCount === 1 ? '' : 's'}`;
  }

  /* ======================================================
     REGULARIZATIONS
  ====================================================== */

  function renderRegularizations(regularizations) {
    renderCompactList({
      containerId: 'hrRegularizationList',

      items: regularizations,

      emptyIcon: 'bi bi-check-circle',

      emptyMessage: 'No pending regularizations.',

      moreLabel: 'more regularizations',

      renderItem: renderRegularizationItem,
    });
  }

  function renderRegularizationItem(item) {
    const name = item.userName || item.fullName || 'Unknown';

    const initials = getInitials(name);

    const type = formatRegularizationType(item.type);

    const date = formatIsoDate(item.date);

    return `
      <div class="hr-list-item">

        <div class="hr-list-item-icon">
          ${escapeHtml(initials)}
        </div>

        <div class="hr-list-item-content">

          <span class="hr-list-item-title">
            ${escapeHtml(name)}
          </span>

          <span class="hr-list-item-meta">
            ${escapeHtml(type)}
            · ${escapeHtml(date)}
          </span>

        </div>

        <span class="hr-status hr-status-pending">
          Pending
        </span>

      </div>
    `;
  }

  /* ======================================================
     LEAVE
  ====================================================== */

  function renderPendingLeave(leaves) {
    renderCompactList({
      containerId: 'hrLeaveList',

      items: leaves,

      emptyIcon: 'bi bi-check-circle',

      emptyMessage: 'No pending leave requests.',

      moreLabel: 'more pending requests',

      renderItem: renderLeaveItem,
    });
  }

  function renderLeaveItem(leave) {
    const name = leave.userName || leave.fullName || 'Unknown';

    const initials = getInitials(name);

    const start = formatIsoDate(leave.startDate);

    const end = formatIsoDate(leave.endDate);

    const days = Number(leave.days);

    const duration = Number.isFinite(days) ? `${days} day${days === 1 ? '' : 's'}` : '—';

    const dateRange = start !== end ? `${start} – ${end}` : start;

    return `
      <div class="hr-list-item">

        <div class="hr-list-item-icon">
          ${escapeHtml(initials)}
        </div>

        <div class="hr-list-item-content">

          <span class="hr-list-item-title">
            ${escapeHtml(name)}
          </span>

          <span class="hr-list-item-meta">
            ${escapeHtml(dateRange)}
            · ${escapeHtml(duration)}
          </span>

        </div>

        <span class="hr-status hr-status-pending">
          Pending
        </span>

      </div>
    `;
  }

  /* ======================================================
     HOLIDAYS
  ====================================================== */

  function renderHolidays(holidays) {
    renderCompactList({
      containerId: 'hrHolidayList',

      items: holidays,

      emptyIcon: 'bi bi-calendar-x',

      emptyMessage: 'No upcoming holidays.',

      moreLabel: 'more holidays',

      renderItem: renderHolidayItem,
    });
  }

  function renderHolidayItem(holiday) {
    const name = holiday.name || 'Holiday';

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
            ${escapeHtml(name)}
          </span>

          <span class="hr-list-item-meta">
            ${escapeHtml(date)}
            ${optional ? ` · ${escapeHtml(optional)}` : ''}
          </span>

        </div>

      </div>
    `;
  }

  /* ======================================================
     GENERIC COMPACT LIST
  ====================================================== */

  function renderCompactList({ containerId, items, emptyIcon, emptyMessage, moreLabel, renderItem }) {
    const container = document.getElementById(containerId);

    if (!container) {
      return;
    }

    const list = getArray(items);

    if (!list.length) {
      container.innerHTML = `
        <div class="hr-list-empty">

          <i class="${emptyIcon}"></i>

          <span>
            ${escapeHtml(emptyMessage)}
          </span>

        </div>
      `;

      return;
    }

    const visible = list.slice(0, LIST_PREVIEW_LIMIT);

    container.innerHTML = visible.map(renderItem).join('');

    if (list.length > LIST_PREVIEW_LIMIT) {
      container.insertAdjacentHTML(
        'beforeend',
        `
          <div class="hr-list-more">
            +${list.length - LIST_PREVIEW_LIMIT}
            ${escapeHtml(moreLabel)}
          </div>
        `
      );
    }
  }

  /* ======================================================
     LOADING
  ====================================================== */

  function setDashboardLoading() {
    const statIds = [
      'totalExecutives',
      'presentCount',
      'absentCount',
      'lateCount',
      'onLeaveCount',
      'regularizationCount',
    ];

    statIds.forEach((id) => setDashboardValue(id, '—'));

    renderLoadingList('hrRegularizationList', 'Loading regularizations...');

    renderLoadingList('hrLeaveList', 'Loading leave requests...');

    renderLoadingList('hrHolidayList', 'Loading holidays...');

    const table = document.getElementById('hrAttendanceTable');

    if (table) {
      table.innerHTML = `
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

    setText('hrAttendanceSummary', 'Loading...');
  }

  function renderLoadingList(id, message) {
    const container = document.getElementById(id);

    if (!container) {
      return;
    }

    container.innerHTML = `
      <div class="hr-list-loading">
        ${escapeHtml(message)}
      </div>
    `;
  }

  /* ======================================================
     ERROR
  ====================================================== */

  function showDashboardError() {
    const statIds = [
      'totalExecutives',
      'presentCount',
      'absentCount',
      'lateCount',
      'onLeaveCount',
      'regularizationCount',
    ];

    statIds.forEach((id) => setDashboardValue(id, '—'));

    renderErrorList('hrRegularizationList', 'Unable to load regularizations.');

    renderErrorList('hrLeaveList', 'Unable to load leave requests.');

    renderErrorList('hrHolidayList', 'Unable to load holidays.');

    const table = document.getElementById('hrAttendanceTable');

    if (table) {
      table.innerHTML = `
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

    setText('hrAttendanceSummary', 'Unable to load data');
  }

  function renderErrorList(id, message) {
    const container = document.getElementById(id);

    if (!container) {
      return;
    }

    container.innerHTML = `
      <div class="hr-list-empty">
        ${escapeHtml(message)}
      </div>
    `;
  }

  /* ======================================================
     ALERT HELPERS
  ====================================================== */

  function showLoading(message) {
    if (typeof AppAlert !== 'undefined' && typeof AppAlert.loading === 'function') {
      AppAlert.loading(message);
    }
  }

  function closeAlert() {
    if (typeof AppAlert !== 'undefined' && typeof AppAlert.close === 'function') {
      AppAlert.close();
    }
  }

  function showAlertError(message) {
    if (typeof AppAlert !== 'undefined' && typeof AppAlert.error === 'function') {
      AppAlert.error(message);
    }
  }

  /* ======================================================
     GENERIC HELPERS
  ====================================================== */

  function getArray(value) {
    return Array.isArray(value) ? value : [];
  }

  function setDashboardValue(elementId, value) {
    const element = document.getElementById(elementId);

    if (element) {
      element.textContent = value ?? '—';
    }
  }

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
    const labels = {
      working: 'Working',
      present: 'Present',
      late: 'Late',
      leave: 'On Leave',
      absent: 'Absent',
      weekly_off: 'Weekly Off',
      holiday: 'Holiday',
      not_marked: 'Not Marked',
    };

    return labels[status] || labels.not_marked;
  }

  function getStatusClass(status) {
    const classes = {
      working: 'status-working',
      present: 'status-present',
      late: 'status-late',
      leave: 'status-leave',
      absent: 'status-absent',
      weekly_off: 'status-weekly-off',
      holiday: 'status-holiday',
      not_marked: 'status-not-marked',
    };

    return classes[status] || classes.not_marked;
  }

  /* ======================================================
     REGULARIZATION TYPE
  ====================================================== */

  function formatRegularizationType(type) {
    const labels = {
      MISSED_CHECK_IN: 'Missed check-in',
      MISSED_CHECK_OUT: 'Missed check-out',
      MISSED_BOTH: 'Missed check-in & check-out',

      WRONG_CHECK_IN: 'Wrong check-in',
      WRONG_CHECK_OUT: 'Wrong check-out',
      WRONG_BOTH: 'Wrong check-in & check-out',

      SYSTEM_ERROR: 'System error',
      LOCATION_ERROR: 'Location error',
      OTHER: 'Other',
    };

    return labels[type] || 'Attendance correction';
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
      timeZone: TIME_ZONE,
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
      timeZone: TIME_ZONE,
    }).format(date);
  }

  function formatTodayForDisplay() {
    return new Intl.DateTimeFormat('en-IN', {
      weekday: 'long',
      day: 'numeric',
      month: 'long',
      year: 'numeric',
      timeZone: TIME_ZONE,
    }).format(new Date());
  }

  function normalizeDashboardDate(value) {
    if (!value) {
      return '';
    }

    const string = String(value).trim();

    if (/^\d{8}$/.test(string)) {
      return `${string.substring(0, 4)}-` + `${string.substring(4, 6)}-` + `${string.substring(6, 8)}`;
    }

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
     HOLIDAY DATE
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
      timeZone: TIME_ZONE,
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
     DATE PARSER
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
