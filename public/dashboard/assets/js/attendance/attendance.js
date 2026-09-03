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
  let selectedTeam = '';

  // ==========================================================
  // INITIALIZE
  // ==========================================================

  window.initializeAttendancePage = async function () {
    setCurrentMonth();

    bindEvents();

    bindExecutiveDropdown();

    resetAttendanceView();

    await loadStaff();
  };

  // ==========================================================
  // EVENTS
  // ==========================================================

  function bindEvents() {
    document.getElementById('attendanceLoadBtn')?.addEventListener('click', loadAttendance);

    document.getElementById('attendanceTeam')?.addEventListener('change', handleTeamChange);

    document.getElementById('attendanceClearBtn')?.addEventListener('click', resetFilters);
  }

  // ==========================================================
  // EXECUTIVE DROPDOWN EVENTS
  // ==========================================================

  function bindExecutiveDropdown() {
    const trigger = document.getElementById('attendanceStaffTrigger');

    const search = document.getElementById('attendanceStaffSearch');

    trigger?.addEventListener('click', toggleExecutiveDropdown);

    search?.addEventListener('input', function () {
      renderExecutiveOptions(this.value);
    });

    document.addEventListener('click', handleExecutiveOutsideClick);
  }

  function toggleExecutiveDropdown(event) {
    event.stopPropagation();

    const dropdown = document.getElementById('attendanceStaffDropdown');

    const menu = document.getElementById('attendanceStaffMenu');

    if (!dropdown || !menu) {
      return;
    }

    const isOpen = dropdown.classList.contains('open');

    if (isOpen) {
      closeExecutiveDropdown();
    } else {
      openExecutiveDropdown();
    }
  }

  function openExecutiveDropdown() {
    const dropdown = document.getElementById('attendanceStaffDropdown');

    const menu = document.getElementById('attendanceStaffMenu');

    const search = document.getElementById('attendanceStaffSearch');

    if (!dropdown || !menu) {
      return;
    }

    dropdown.classList.add('open');

    menu.classList.remove('d-none');

    const trigger = document.getElementById('attendanceStaffTrigger');

    if (trigger) {
      trigger.setAttribute('aria-expanded', 'true');
    }

    renderExecutiveOptions('');

    if (search) {
      search.value = '';

      setTimeout(function () {
        search.focus();
      }, 0);
    }
  }

  function closeExecutiveDropdown() {
    const dropdown = document.getElementById('attendanceStaffDropdown');

    const menu = document.getElementById('attendanceStaffMenu');

    if (!dropdown || !menu) {
      return;
    }

    dropdown.classList.remove('open');

    menu.classList.add('d-none');

    const trigger = document.getElementById('attendanceStaffTrigger');

    if (trigger) {
      trigger.setAttribute('aria-expanded', 'false');
    }
  }

  function handleExecutiveOutsideClick(event) {
    const dropdown = document.getElementById('attendanceStaffDropdown');

    if (dropdown && !dropdown.contains(event.target)) {
      closeExecutiveDropdown();
    }
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
       */

      const data = await Api.get('/dashboard/me');

      AppAlert.close();

      if (!data) {
        return;
      }

      staff = Array.isArray(data.staff) ? data.staff : [];

      populateTeamSelect();

      populateStaffSelect(staff);

      populateScope(data);
    } catch (error) {
      console.error('Attendance staff loading failed:', error);

      AppAlert.close();

      AppAlert.error(error.message || 'Unable to load staff');
    }
  }

  // ==========================================================
  // TEAM FILTER
  // ==========================================================

  function populateTeamSelect() {
    const select = document.getElementById('attendanceTeam');

    if (!select) {
      return;
    }

    const teams = new Map();

    staff.forEach(function (item) {
      const teamName = String(item.teamName || '').trim();

      if (!teamName) {
        return;
      }

      const key = teamName.toLowerCase();

      if (!teams.has(key)) {
        teams.set(key, teamName);
      }
    });

    select.innerHTML = `
      <option value="">
        All Teams
      </option>
    `;

    Array.from(teams.values())
      .sort(function (a, b) {
        return a.localeCompare(b);
      })
      .forEach(function (teamName) {
        const option = document.createElement('option');

        option.value = teamName;

        option.textContent = teamName;

        select.appendChild(option);
      });
  }

  function handleTeamChange() {
    const select = document.getElementById('attendanceTeam');

    selectedTeam = select?.value || '';

    /*
     * Team changed, therefore the
     * previous executive selection
     * is no longer guaranteed to be valid.
     */

    clearSelectedStaff();

    const filteredStaff = getFilteredStaff();

    populateStaffSelect(filteredStaff);

    resetAttendanceData();
  }

  function getFilteredStaff() {
    if (!selectedTeam) {
      return staff;
    }

    const selectedTeamNormalized = selectedTeam.trim().toLowerCase();

    return staff.filter(function (item) {
      return (
        String(item.teamName || '')
          .trim()
          .toLowerCase() === selectedTeamNormalized
      );
    });
  }

  // ==========================================================
  // STAFF SELECT
  // ==========================================================

  function populateStaffSelect(list) {
    const options = document.getElementById('attendanceStaffOptions');

    if (!options) {
      return;
    }

    /*
     * Remove duplicate staff.
     */

    const unique = new Map();

    list.forEach(function (item) {
      if (!item.id) {
        return;
      }

      if (!unique.has(item.id)) {
        unique.set(item.id, item);
      }
    });

    const sorted = Array.from(unique.values()).sort(function (a, b) {
      return String(a.fullName || '').localeCompare(String(b.fullName || ''));
    });

    /*
     * Render options directly.
     */

    if (!sorted.length) {
      options.innerHTML = `
        <div class="attendance-select-empty">
          <i class="bi bi-person-x d-block mb-1"></i>
          No executives available
        </div>
      `;

      return;
    }

    options.innerHTML = sorted.map(renderExecutiveOption).join('');

    bindExecutiveOptions();
  }

  // ==========================================================
  // EXECUTIVE SEARCH / OPTIONS
  // ==========================================================

  function renderExecutiveOptions(query = '') {
    const options = document.getElementById('attendanceStaffOptions');

    if (!options) {
      return;
    }

    const normalizedQuery = String(query || '')
      .trim()
      .toLowerCase();

    const filtered = getFilteredStaff()
      .filter(function (item) {
        if (!normalizedQuery) {
          return true;
        }

        const name = String(item.fullName || '').toLowerCase();

        const role = String(item.role || '').toLowerCase();

        const team = String(item.teamName || '').toLowerCase();

        return name.includes(normalizedQuery) || role.includes(normalizedQuery) || team.includes(normalizedQuery);
      })
      .sort(function (a, b) {
        return String(a.fullName || '').localeCompare(String(b.fullName || ''));
      });

    if (!filtered.length) {
      options.innerHTML = `
        <div class="attendance-select-empty">
          <i class="bi bi-person-x d-block mb-1"></i>
          No executives found
        </div>
      `;

      return;
    }

    options.innerHTML = filtered.map(renderExecutiveOption).join('');

    bindExecutiveOptions();
  }

  function renderExecutiveOption(item) {
    const isActive = item.id === selectedStaffId;

    const name = item.fullName || 'Unknown';

    const role = formatRole(item.role);

    const team = item.teamName || 'No Team';

    return `
      <button
        type="button"
        class="attendance-select-option ${isActive ? 'active' : ''}"
        data-staff-id="${escapeHtml(item.id)}"
      >

        <div class="attendance-select-option-avatar">
          <i class="bi bi-person"></i>
        </div>

        <div class="attendance-select-option-content">

          <span class="attendance-select-option-name">
            ${escapeHtml(name)}
          </span>

          <span class="attendance-select-option-meta">
            ${escapeHtml(role)}
            •
            ${escapeHtml(team)}
          </span>

        </div>

        <i
          class="bi bi-check2 attendance-select-option-check"
        ></i>

      </button>
    `;
  }

  function bindExecutiveOptions() {
    const options = document.querySelectorAll('#attendanceStaffOptions [data-staff-id]');

    options.forEach(function (option) {
      option.addEventListener('click', function (event) {
        event.stopPropagation();

        selectExecutive(this.dataset.staffId);
      });
    });
  }

  // ==========================================================
  // SELECT EXECUTIVE
  // ==========================================================

  function selectExecutive(staffId) {
    const selected = staff.find(function (item) {
      return item.id === staffId;
    });

    if (!selected) {
      return;
    }

    selectedStaffId = selected.id;

    /*
     * Keep hidden input synchronized
     * with the selected executive.
     */

    const hiddenInput = document.getElementById('attendanceStaff');

    if (hiddenInput) {
      hiddenInput.value = selected.id;
    }

    /*
     * Update dropdown trigger.
     */

    const triggerText = document.getElementById('attendanceStaffTriggerText');

    if (triggerText) {
      triggerText.textContent = selected.fullName || 'Unknown';
    }

    /*
     * Show selected executive card.
     */

    showSelectedStaff(selected);

    /*
     * Clear previous attendance
     * because executive changed.
     */

    resetAttendanceData();

    /*
     * Close dropdown.
     */

    closeExecutiveDropdown();
  }

  // ==========================================================
  // CLEAR SELECTED EXECUTIVE
  // ==========================================================

  function clearSelectedStaff() {
    selectedStaffId = '';

    const hiddenInput = document.getElementById('attendanceStaff');

    if (hiddenInput) {
      hiddenInput.value = '';
    }

    const triggerText = document.getElementById('attendanceStaffTriggerText');

    if (triggerText) {
      triggerText.textContent = 'Select Executive';
    }

    document.getElementById('selectedStaffCard')?.classList.add('d-none');

    const search = document.getElementById('attendanceStaffSearch');

    if (search) {
      search.value = '';
    }
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

  // ==========================================================
  // LOAD ATTENDANCE
  // ==========================================================

  async function loadAttendance() {
    const staffId = document.getElementById('attendanceStaff')?.value;

    const monthValue = document.getElementById('attendanceMonth')?.value;

    if (!staffId) {
      AppAlert.warning('Please select an executive');

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
       * Existing backend contract.
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
            colspan="7"
            class="empty-state"
          >

            <div class="empty-state-icon">
              <i class="bi bi-calendar-x"></i>
            </div>

            <strong>
              No attendance records found
            </strong>

            <span>
              There are no records for the selected month.
            </span>

          </td>
        </tr>
      `;

      return;
    }

    tbody.innerHTML = records.map(renderRecordRow).join('');
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
          <span class="attendance-date">
            ${escapeHtml(date)}
          </span>
        </td>

        <td>
          <span class="attendance-time">
            ${escapeHtml(checkIn)}
          </span>
        </td>

        <td>
          <span class="attendance-time">
            ${escapeHtml(checkOut)}
          </span>
        </td>

        <td>
          <span class="attendance-working">
            ${escapeHtml(working)}
          </span>
        </td>

        <td>
          ${punctualityBadge(record)}
        </td>

        <td>
          ${attendanceTypeBadge(record)}
        </td>

        <td>
          ${statusBadge(record.status)}
        </td>

      </tr>
    `;
  }

  // ==========================================================
  // PUNCTUALITY
  // ==========================================================

  function punctualityBadge(record) {
    const status = String(record.status || '')
      .trim()
      .toLowerCase();

    /*
     * Prefer explicit backend value.
     *
     * Expected:
     * on_time
     * late
     * not_applicable
     */

    const explicit = String(record.punctuality || '')
      .trim()
      .toLowerCase();

    let value = explicit;

    /*
     * Backward-compatible fallback.
     */

    if (!value) {
      if (status === 'late') {
        value = 'late';
      } else if (status === 'present' && record.checkInTime) {
        value = 'on_time';
      } else {
        value = 'not_applicable';
      }
    }

    const labels = {
      on_time: 'On Time',
      late: 'Late',
      not_applicable: '—',
    };

    const label = labels[value] || formatStatus(value);

    return `
      <span
        class="
          attendance-punctuality
          punctuality-${escapeHtml(value)}
        "
      >
        <span class="punctuality-dot"></span>

        ${escapeHtml(label)}
      </span>
    `;
  }

  // ==========================================================
  // ATTENDANCE TYPE
  // ==========================================================

  function attendanceTypeBadge(record) {
    /*
     * Preferred backend property:
     *
     * record.attendanceType
     *
     * Optional fallback:
     *
     * record.type
     */

    const raw = record.attendanceType || record.type || deriveAttendanceType(record.status);

    const value = String(raw || '')
      .trim()
      .toLowerCase();

    const labels = {
      office: 'Office',
      field: 'Field',
      remote: 'Remote',

      present: 'Present',
      late: 'Present',

      half_day: 'Half Day',

      weekly_off: 'Weekly Off',

      holiday: 'Holiday',

      leave: 'Leave',

      absent: 'Absent',
    };

    const label = labels[value] || formatStatus(value);

    return `
      <span class="attendance-type">
        ${escapeHtml(label || '—')}
      </span>
    `;
  }

  function deriveAttendanceType(status) {
    const normalized = String(status || '')
      .trim()
      .toLowerCase();

    return normalized || '—';
  }

  // ==========================================================
  // STATUS
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
        class="
          attendance-status
          status-${escapeHtml(cssClass)}
        "
      >
        ${escapeHtml(label)}
      </span>
    `;
  }

  // ==========================================================
  // TABLE SUBTITLE
  // ==========================================================

  function updateTableSubtitle(year, month) {
    const selected = staff.find(function (item) {
      return item.id === selectedStaffId;
    });

    const staffName = selected?.fullName || 'Staff';

    const monthName = new Date(year, month - 1, 1).toLocaleDateString('en-IN', {
      month: 'long',
      year: 'numeric',
    });

    setText('attendanceTableSubtitle', `${staffName} • ${monthName}`);
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
  // RESET FILTERS
  // ==========================================================

  function resetFilters() {
    selectedTeam = '';
    selectedStaffId = '';

    const team = document.getElementById('attendanceTeam');

    if (team) {
      team.value = '';
    }

    clearSelectedStaff();

    populateStaffSelect(staff);

    resetAttendanceData();

    closeExecutiveDropdown();
  }

  // ==========================================================
  // RESET VIEW
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

    setText('attendanceTableSubtitle', 'Select an executive and month to view attendance.');

    const tbody = document.getElementById('attendanceTable');

    if (!tbody) {
      return;
    }

    tbody.innerHTML = `
      <tr>
        <td
          colspan="7"
          class="empty-state"
        >

          <div class="empty-state-icon">
            <i class="bi bi-calendar-check"></i>
          </div>

          <strong>
            Select an executive and month
          </strong>

          <span>
            Your attendance records will appear here.
          </span>

        </td>
      </tr>
    `;
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
     * Firestore Timestamp.
     */

    if (typeof value === 'object' && typeof value.toDate === 'function') {
      const date = value.toDate();

      return isNaN(date.getTime()) ? null : date;
    }

    /*
     * Firestore JSON:
     *
     * {
     *   seconds,
     *   nanoseconds
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
     * Older Firebase format:
     *
     * {
     *   _seconds
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
     * ISO / Date string.
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
        .replace(/\b\w/g, function (char) {
          return char.toUpperCase();
        })
    );
  }

  // ==========================================================
  // STATUS TEXT
  // ==========================================================

  function formatStatus(status) {
    if (!status || status === '—') {
      return 'Unknown';
    }

    return String(status)
      .replaceAll('_', ' ')
      .replace(/\b\w/g, function (char) {
        return char.toUpperCase();
      });
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
