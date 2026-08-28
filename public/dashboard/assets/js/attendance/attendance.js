/* ==========================================================
   TeamoTrack Attendance
   attendance.js
========================================================== */

(function () {
  'use strict';

  // ==========================================================
  // STATE
  // ==========================================================

  let staff = [];

  let records = [];

  let selectedStaffId = '';

  // ==========================================================
  // INITIALIZE
  // ==========================================================

  window.initializeAttendancePage = async function () {
    setCurrentMonth();

    bindEvents();

    resetAttendanceView();

    await loadStaff();
  };

  // ==========================================================
  // EVENTS
  // ==========================================================

  function bindEvents() {
    document.getElementById('attendanceLoadBtn')?.addEventListener('click', loadAttendance);

    document.getElementById('attendanceStaff')?.addEventListener('change', handleStaffChange);
  }

  // ==========================================================
  // LOAD AUTHORIZED STAFF
  // ==========================================================

  async function loadStaff() {
    try {
      AppAlert.loading('Loading staff...');

      /*
       * Dashboard already knows the user's
       * authorized visibility scope.
       *
       * Therefore we reuse it instead of
       * calling /executives/data.
       */

      const data = await Api.get('/dashboard/me');

      AppAlert.close();

      if (!data) {
        return;
      }

      staff = Array.isArray(data.staff) ? data.staff : [];

      populateStaffSelect();

      populateScope(data);
    } catch (error) {
      console.error('Attendance staff loading failed:', error);

      AppAlert.close();

      AppAlert.error(error.message || 'Unable to load staff');
    }
  }

  // ==========================================================
  // STAFF SELECT
  // ==========================================================

  function populateStaffSelect() {
    const select = document.getElementById('attendanceStaff');

    if (!select) {
      return;
    }

    select.innerHTML = `
            <option value="">
                Select Staff
            </option>
        `;

    /*
     * Remove duplicates.
     *
     * Dashboard staff should already be unique,
     * but this keeps the UI safe.
     */

    const unique = new Map();

    staff.forEach((item) => {
      const id = item.id;

      if (!id) {
        return;
      }

      if (!unique.has(id)) {
        unique.set(id, item);
      }
    });

    const sorted = Array.from(unique.values()).sort((a, b) =>
      String(a.fullName || '').localeCompare(String(b.fullName || ''))
    );

    sorted.forEach((item) => {
      const option = document.createElement('option');

      option.value = item.id;

      option.textContent = buildStaffOptionLabel(item);

      select.appendChild(option);
    });

    /*
     * If only one staff member is visible,
     * select it automatically.
     *
     * This is especially useful for field executives.
     */

    if (sorted.length === 1) {
      select.value = sorted[0].id;

      handleStaffChange();
    }
  }

  // ==========================================================
  // STAFF OPTION LABEL
  // ==========================================================

  function buildStaffOptionLabel(item) {
    const name = item.fullName || 'Unknown';

    const role = formatRole(item.role);

    const team = item.teamName ? ` • ${item.teamName}` : '';

    return `${name} • ${role}${team}`;
  }

  // ==========================================================
  // STAFF CHANGE
  // ==========================================================

  function handleStaffChange() {
    const select = document.getElementById('attendanceStaff');

    selectedStaffId = select?.value || '';

    const selected = staff.find((item) => item.id === selectedStaffId);

    if (!selected) {
      hideSelectedStaff();

      resetAttendanceView();

      return;
    }

    showSelectedStaff(selected);

    /*
     * Do NOT call the API here.
     *
     * The user must click Load Attendance.
     */

    resetAttendanceData();
  }

  // ==========================================================
  // SELECTED STAFF CARD
  // ==========================================================

  function showSelectedStaff(item) {
    const card = document.getElementById('selectedStaffCard');

    if (!card) {
      return;
    }

    setText('selectedStaffName', item.fullName || 'Unknown');

    setText('selectedStaffRole', formatRole(item.role));

    setText('selectedStaffTeam', item.teamName || 'No Team');

    card.classList.remove('d-none');
  }

  function hideSelectedStaff() {
    document.getElementById('selectedStaffCard')?.classList.add('d-none');
  }

  // ==========================================================
  // SCOPE
  // ==========================================================

  function populateScope(data) {
    const scope = data.scope;

    if (!scope) {
      return;
    }

    setText('attendanceScope', scope.label || 'Authorized Staff');
  }

  // ==========================================================
  // LOAD ATTENDANCE
  // ==========================================================

  async function loadAttendance() {
    const staffId = document.getElementById('attendanceStaff')?.value;

    const monthValue = document.getElementById('attendanceMonth')?.value;

    if (!staffId) {
      AppAlert.warning('Please select staff');

      return;
    }

    if (!monthValue) {
      AppAlert.warning('Please select a month');

      return;
    }

    const [year, month] = monthValue.split('-').map(Number);

    if (!year || !month) {
      AppAlert.warning('Invalid month selected');

      return;
    }

    try {
      AppAlert.loading('Loading attendance...');

      /*
       * IMPORTANT:
       *
       * New AttendanceDto:
       *
       * {
       *     staffId,
       *     month,
       *     year
       * }
       *
       * NOT executiveId.
       */

      const data = await Api.post('/attendance/data', {
        staffId,
        month,
        year,
      });

      AppAlert.close();

      if (!data) {
        return;
      }

      records = Array.isArray(data.records) ? data.records : [];

      records.sort(sortRecordsByDate);

      renderSummary(data.summary || {});

      renderRecords();

      updateTableSubtitle(year, month);
    } catch (error) {
      console.error('Attendance loading failed:', error);

      AppAlert.close();

      AppAlert.error(error.message || 'Unable to load attendance');
    }
  }

  // ==========================================================
  // SUMMARY
  // ==========================================================

  function renderSummary(summary) {
    setText('presentCount', summary.totalPresent || 0);

    setText('lateCount', summary.totalLate || 0);

    setText('halfDayCount', summary.totalHalfDay || 0);

    setText('weeklyOffCount', summary.totalWeeklyOff || 0);

    setText('absentCount', summary.totalAbsent || 0);

    setText('workingTime', formatMinutes(summary.totalWorkingMinutes || 0));
  }

  // ==========================================================
  // RECORDS
  // ==========================================================

  function renderRecords() {
    const tbody = document.getElementById('attendanceTable');

    if (!tbody) {
      return;
    }

    setText('attendanceCount', `${records.length} Records`);

    if (!records.length) {
      tbody.innerHTML = `
                <tr>
                    <td
                        colspan="5"
                        class="empty-state"
                    >

                        <div class="empty-state-icon">
                            <i class="bi bi-calendar-x"></i>
                        </div>

                        <div>
                            No attendance records found
                        </div>

                    </td>
                </tr>
            `;

      return;
    }

    tbody.innerHTML = records.map((record) => renderRecordRow(record)).join('');
  }

  // ==========================================================
  // RECORD ROW
  // ==========================================================

  function renderRecordRow(record) {
    const date = formatDate(record.date);

    const checkIn = formatTime(record.checkInTime);

    const checkOut = formatTime(record.checkOutTime);

    const working = formatMinutes(Number(record.workingMinutes) || 0);

    return `
            <tr>

                <td>
                    <strong>
                        ${escapeHtml(date)}
                    </strong>
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
                    ${statusBadge(record.status)}
                </td>

            </tr>
        `;
  }

  // ==========================================================
  // STATUS BADGE
  // ==========================================================

  function statusBadge(status) {
    const normalized = String(status || '')
      .trim()
      .toLowerCase();

    const labels = {
      present: 'Present',

      late: 'Late',

      half_day: 'Half Day',

      weekly_off: 'Weekly Off',

      holiday: 'Holiday',

      leave: 'Leave',

      absent: 'Absent',
    };

    const label = labels[normalized] || formatStatus(normalized);

    const cssClass = normalized || 'absent';

    return `
            <span
                class="attendance-status status-${escapeHtml(cssClass)}"
            >
                ${escapeHtml(label)}
            </span>
        `;
  }

  // ==========================================================
  // TABLE SUBTITLE
  // ==========================================================

  function updateTableSubtitle(year, month) {
    const selected = staff.find((item) => item.id === selectedStaffId);

    const staffName = selected?.fullName || 'Staff';

    const monthName = new Date(year, month - 1, 1).toLocaleDateString('en-IN', {
      month: 'long',
      year: 'numeric',
    });

    setText('attendanceTableSubtitle', `${staffName} • ${monthName}`);
  }

  // ==========================================================
  // RESET
  // ==========================================================

  function resetAttendanceView() {
    resetAttendanceData();

    setText('attendanceScope', 'Loading scope...');
  }

  function resetAttendanceData() {
    records = [];

    setText('presentCount', 0);

    setText('lateCount', 0);

    setText('halfDayCount', 0);

    setText('weeklyOffCount', 0);

    setText('absentCount', 0);

    setText('workingTime', '0h 0m');

    setText('attendanceCount', '0 Records');

    setText('attendanceTableSubtitle', 'Select staff to load attendance.');

    const tbody = document.getElementById('attendanceTable');

    if (tbody) {
      tbody.innerHTML = `
                <tr>
                    <td
                        colspan="5"
                        class="empty-state"
                    >

                        <div class="empty-state-icon">
                            <i class="bi bi-calendar-check"></i>
                        </div>

                        <div>
                            Select staff and click Load Attendance
                        </div>

                    </td>
                </tr>
            `;
    }
  }

  // ==========================================================
  // DATE
  // ==========================================================

  function formatDate(value) {
    const date = toDate(value);

    if (!date) {
      return '--';
    }

    return date.toLocaleDateString('en-IN', {
      day: '2-digit',
      month: 'short',
      year: 'numeric',
    });
  }

  function formatTime(value) {
    const date = toDate(value);

    if (!date) {
      return '--';
    }

    return date.toLocaleTimeString('en-IN', {
      hour: '2-digit',
      minute: '2-digit',
      hour12: true,
    });
  }

  // ==========================================================
  // FIRESTORE / JS DATE
  // ==========================================================

  function toDate(value) {
    if (!value) {
      return null;
    }

    /*
     * Firestore Timestamp serialized
     * by Firebase/Nest.
     */

    if (typeof value === 'object' && typeof value.toDate === 'function') {
      const date = value.toDate();

      return isNaN(date.getTime()) ? null : date;
    }

    /*
     * Firestore REST / JSON form:
     *
     * {
     *     seconds: 123456,
     *     nanoseconds: ...
     * }
     */

    if (typeof value === 'object' && value.seconds != null) {
      const seconds = Number(value.seconds);

      if (!Number.isFinite(seconds)) {
        return null;
      }

      return new Date(seconds * 1000);
    }

    /*
     * Older Firebase serialized form:
     *
     * {
     *     _seconds: ...
     * }
     */

    if (typeof value === 'object' && value._seconds != null) {
      const seconds = Number(value._seconds);

      if (!Number.isFinite(seconds)) {
        return null;
      }

      return new Date(seconds * 1000);
    }

    /*
     * Date string / ISO.
     */

    const date = new Date(value);

    return isNaN(date.getTime()) ? null : date;
  }

  // ==========================================================
  // SORT
  // ==========================================================

  function sortRecordsByDate(a, b) {
    const dateA = toDate(a.date);

    const dateB = toDate(b.date);

    if (!dateA && !dateB) {
      return 0;
    }

    if (!dateA) {
      return 1;
    }

    if (!dateB) {
      return -1;
    }

    return dateB.getTime() - dateA.getTime();
  }

  // ==========================================================
  // MINUTES
  // ==========================================================

  function formatMinutes(minutes) {
    minutes = Number(minutes) || 0;

    minutes = Math.max(0, Math.floor(minutes));

    const hrs = Math.floor(minutes / 60);

    const mins = minutes % 60;

    return `${hrs}h ${mins}m`;
  }

  // ==========================================================
  // MONTH
  // ==========================================================

  function setCurrentMonth() {
    const input = document.getElementById('attendanceMonth');

    if (!input) {
      return;
    }

    const now = new Date();

    input.value = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
  }

  // ==========================================================
  // ROLE
  // ==========================================================

  function formatRole(role) {
    const labels = {
      field_executive: 'Field Executive',

      manager: 'Manager',

      hr: 'HR',

      root: 'Root',

      admin: 'Admin',

      root_manager: 'Root Manager',

      root_hr: 'Root HR',
    };

    return (
      labels[role] ||
      String(role || '')
        .replaceAll('_', ' ')
        .replace(/\b\w/g, (char) => char.toUpperCase())
    );
  }

  // ==========================================================
  // STATUS TEXT
  // ==========================================================

  function formatStatus(status) {
    if (!status) {
      return 'Unknown';
    }

    return String(status)
      .replaceAll('_', ' ')
      .replace(/\b\w/g, (char) => char.toUpperCase());
  }

  // ==========================================================
  // HELPERS
  // ==========================================================

  function setText(id, value) {
    const element = document.getElementById(id);

    if (element) {
      element.textContent = value;
    }
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
