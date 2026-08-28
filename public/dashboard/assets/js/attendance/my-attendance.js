/* ==========================================================
   TeamoTrack • My Attendance
========================================================== */

(function () {
  'use strict';

  /* ========================================================
     STATE
  ======================================================== */

  let records = [];

  let summary = {};

  let isLoading = false;

  let todayAttendance = null;

  /* ========================================================
     INITIALIZE
  ======================================================== */

  window.initializeMyAttendancePage = async function () {
    setCurrentMonth();

    bindEvents();

    renderTodayDate();

    await loadAttendance();
  };

  /* ========================================================
     EVENTS
  ======================================================== */

  function bindEvents() {
    document.getElementById('attendanceCheckInBtn')?.addEventListener('click', handleCheckIn);

    document.getElementById('attendanceCheckOutBtn')?.addEventListener('click', handleCheckOut);

    document.getElementById('myAttendanceRefreshBtn')?.addEventListener('click', loadAttendance);

    document.getElementById('myAttendanceMonth')?.addEventListener('change', loadAttendance);
  }

  /* ========================================================
     LOAD ATTENDANCE
  ======================================================== */

  async function loadAttendance() {
    if (isLoading) {
      return;
    }

    const monthValue = document.getElementById('myAttendanceMonth')?.value;

    if (!monthValue) {
      return;
    }

    const parts = monthValue.split('-').map(Number);

    const year = parts[0];

    const month = parts[1];

    try {
      isLoading = true;

      setLoadingState(true);

      const data = await Api.get(`/attendance/my-data?month=${month}&year=${year}`);

      if (!data) {
        return;
      }

      records = Array.isArray(data.records) ? data.records : [];

      summary = data.summary || {};

      renderSummary(summary);

      renderRecords();

      /*
       * The monthly endpoint gives us the selected month.
       *
       * For the Today card we only use a record if the
       * selected month is the current month.
       */
      if (isCurrentMonth(year, month)) {
        const todayKey = getTodayKey();

        todayAttendance = records.find((record) => getRecordDateKey(record.date) === todayKey) || null;

        renderTodayAttendance();
      }
    } catch (error) {
      console.error('My attendance load failed:', error);

      AppAlert.error(error.message || 'Unable to load attendance');
    } finally {
      isLoading = false;

      setLoadingState(false);
    }
  }

  /* ========================================================
     CHECK IN
  ======================================================== */

  async function handleCheckIn() {
    if (isLoading) {
      return;
    }

    try {
      /*
       * Browser location is optional.
       *
       * If the user denies location, attendance can still
       * be attempted because the backend is the authority.
       */
      const location = await getCurrentLocation();

      isLoading = true;

      setActionLoading('attendanceCheckInBtn', true, 'Checking in...');

      const payload = {};

      if (location) {
        payload.lat = location.lat;

        payload.lng = location.lng;
      }

      const data = await Api.post('/attendance/check-in', payload);

      if (data) {
        AppAlert.success(data.message || 'Check-in recorded successfully.');
      }

      await loadAttendance();
    } catch (error) {
      console.error('Check-in failed:', error);

      AppAlert.error(getApiErrorMessage(error, 'Unable to check in'));
    } finally {
      isLoading = false;

      setActionLoading('attendanceCheckInBtn', false, 'Check In');
    }
  }

  /* ========================================================
     CHECK OUT
  ======================================================== */

  async function handleCheckOut() {
    if (isLoading) {
      return;
    }

    /*
     * We intentionally allow checkout before shift end.
     *
     * The backend determines the final attendance classification.
     */
    try {
      const location = await getCurrentLocation();

      isLoading = true;

      setActionLoading('attendanceCheckOutBtn', true, 'Checking out...');

      const payload = {};

      if (location) {
        payload.lat = location.lat;

        payload.lng = location.lng;
      }

      const data = await Api.post('/attendance/check-out', payload);

      if (data) {
        AppAlert.success(data.message || 'Check-out recorded successfully.');
      }

      await loadAttendance();
    } catch (error) {
      console.error('Check-out failed:', error);

      AppAlert.error(getApiErrorMessage(error, 'Unable to check out'));
    } finally {
      isLoading = false;

      setActionLoading('attendanceCheckOutBtn', false, 'Check Out');
    }
  }

  /* ========================================================
     GEOLOCATION
  ======================================================== */

  async function getCurrentLocation() {
    if (!navigator.geolocation) {
      return null;
    }

    return new Promise((resolve) => {
      navigator.geolocation.getCurrentPosition(
        (position) => {
          resolve({
            lat: Number(position.coords.latitude),

            lng: Number(position.coords.longitude),
          });
        },

        (error) => {
          console.warn('Location unavailable:', error.message);

          resolve(null);
        },

        {
          enableHighAccuracy: true,

          timeout: 10000,

          maximumAge: 0,
        }
      );
    });
  }

  /* ========================================================
     TODAY
  ======================================================== */

  function renderTodayDate() {
    setText(
      'attendanceTodayDate',
      new Date().toLocaleDateString('en-IN', {
        weekday: 'long',
        day: '2-digit',
        month: 'long',
        year: 'numeric',
      })
    );
  }

  function renderTodayAttendance() {
    const record = todayAttendance;

    const checkInBtn = document.getElementById('attendanceCheckInBtn');

    const checkOutBtn = document.getElementById('attendanceCheckOutBtn');

    /*
     * No record.
     */

    if (!record) {
      setText('myAttendanceStatusText', 'NOT MARKED');

      setStatusClass('status-not-marked');

      setText('myCheckIn', '--');

      setText('myCheckOut', '--');

      setText('myWorkingTime', '--');

      setText('myPunctuality', '--');

      setText('attendanceShiftTime', '--');

      if (checkInBtn) {
        checkInBtn.disabled = false;
      }

      if (checkOutBtn) {
        checkOutBtn.disabled = true;
      }

      setText('attendanceActionMessage', 'Your attendance for today has not been marked.');

      return;
    }

    /*
     * Shift snapshot.
     */

    renderShift(record.shiftSnapshot);

    const hasCheckIn = !!record.checkInTime;

    const hasCheckOut = !!record.checkOutTime;

    /*
     * Status.
     *
     * "working" is a UI state derived from an open
     * check-in. Final attendance status comes from backend.
     */

    if (hasCheckIn && !hasCheckOut) {
      setText('myAttendanceStatusText', 'WORKING');

      setStatusClass('status-working');
    } else {
      setText('myAttendanceStatusText', formatStatus(record.status));

      setStatusClass(getStatusClass(record.status));
    }

    setText('myCheckIn', formatTime(record.checkInTime));

    setText('myCheckOut', formatTime(record.checkOutTime));

    setText('myWorkingTime', formatMinutes(record.workingMinutes));

    setText('myPunctuality', formatPunctuality(record.punctuality));

    /*
     * Buttons.
     */

    if (checkInBtn) {
      checkInBtn.disabled = hasCheckIn || isTerminalNonAttendanceStatus(record.status);
    }

    if (checkOutBtn) {
      checkOutBtn.disabled = !hasCheckIn || hasCheckOut;
    }

    /*
     * Message.
     */

    if (hasCheckIn && !hasCheckOut) {
      setText('attendanceActionMessage', 'You are currently checked in. Check out when your workday is complete.');
    } else if (hasCheckIn && hasCheckOut) {
      setText('attendanceActionMessage', "Today's attendance has been completed.");
    } else if (record.status === 'leave') {
      setText('attendanceActionMessage', 'You are marked on approved leave today.');
    } else if (record.status === 'weekly_off') {
      setText('attendanceActionMessage', 'Today is your scheduled weekly off.');
    } else if (record.status === 'holiday') {
      setText('attendanceActionMessage', 'Today is an organization holiday.');
    } else {
      setText('attendanceActionMessage', 'Your attendance for today has not been marked.');
    }
  }

  /* ========================================================
     SHIFT
  ======================================================== */

  function renderShift(shift) {
    if (!shift) {
      setText('attendanceShiftTime', '--');

      return;
    }

    const start = formatHourMinute(shift.startHour, shift.startMinute);

    const end = formatHourMinute(shift.endHour, shift.endMinute);

    setText('attendanceShiftTime', `${start} - ${end}`);
  }

  /* ========================================================
     SUMMARY
  ======================================================== */

  function renderSummary(data) {
    setText('myPresentCount', data.totalPresent || 0);

    setText('myLateCount', data.totalLate || 0);

    setText('myHalfDayCount', data.totalHalfDay || 0);

    setText('myLeaveCount', data.totalLeave || 0);

    setText('myAbsentCount', data.totalAbsent || 0);

    setText('myTotalWorking', formatMinutes(data.totalWorkingMinutes || 0));
  }

  /* ========================================================
     TABLE
  ======================================================== */

  function renderRecords() {
    const tbody = document.getElementById('myAttendanceTable');

    if (!tbody) {
      return;
    }

    setText('myAttendanceRecordCount', `${records.length} Records`);

    if (!records.length) {
      tbody.innerHTML = `
        <tr>
          <td
            colspan="6"
            class="attendance-empty-state"
          >
            <i class="bi bi-calendar2-week"></i>

            <span>
              No attendance records found for this month.
            </span>
          </td>
        </tr>
      `;

      return;
    }

    /*
     * Newest first.
     */

    const sorted = [...records].sort((a, b) => getRecordDate(b.date) - getRecordDate(a.date));

    tbody.innerHTML = sorted.map((record) => renderRecordRow(record)).join('');
  }

  function renderRecordRow(record) {
    return `
      <tr>

        <td>
          <strong>
            ${escapeHtml(formatDate(record.date))}
          </strong>
        </td>

        <td>
          ${formatTime(record.checkInTime)}
        </td>

        <td>
          ${formatTime(record.checkOutTime)}
        </td>

        <td>
          <strong>
            ${formatMinutes(record.workingMinutes)}
          </strong>
        </td>

        <td>
          ${attendanceBadge(record)}
        </td>

        <td>
          ${punctualityBadge(record.punctuality)}
        </td>

      </tr>
    `;
  }

  /* ========================================================
     ATTENDANCE BADGE
  ======================================================== */

  function attendanceBadge(record) {
    let label = formatStatus(record.status);

    let className = 'present';

    if (record.attendanceType === 'half_day') {
      label = 'Half Day';

      className = 'half-day';
    } else if (record.status === 'leave') {
      className = 'leave';
    } else if (record.status === 'absent') {
      className = 'absent';
    } else if (record.status === 'weekly_off') {
      className = 'weekly-off';
    } else if (record.status === 'holiday') {
      className = 'holiday';
    }

    return `
      <span class="my-attendance-badge ${className}">
        ${escapeHtml(label)}
      </span>
    `;
  }

  /* ========================================================
     PUNCTUALITY BADGE
  ======================================================== */

  function punctualityBadge(punctuality) {
    if (!punctuality) {
      return `
        <span class="my-punctuality-badge neutral">
          --
        </span>
      `;
    }

    const late = punctuality === 'late';

    return `
      <span class="my-punctuality-badge ${late ? 'late' : 'on-time'}">
        <i class="bi ${late ? 'bi-clock' : 'bi-check-circle'}"></i>

        ${late ? 'Late' : 'On Time'}
      </span>
    `;
  }

  /* ========================================================
     STATUS HELPERS
  ======================================================== */

  function formatStatus(status) {
    const labels = {
      present: 'PRESENT',

      absent: 'ABSENT',

      leave: 'LEAVE',

      weekly_off: 'WEEKLY OFF',

      holiday: 'HOLIDAY',
    };

    return (
      labels[status] ||
      String(status || 'NOT MARKED')
        .replaceAll('_', ' ')
        .toUpperCase()
    );
  }

  function getStatusClass(status) {
    const classes = {
      present: 'status-completed',

      absent: 'status-absent',

      leave: 'status-leave',

      weekly_off: 'status-weekly-off',

      holiday: 'status-holiday',
    };

    return classes[status] || 'status-not-marked';
  }

  function setStatusClass(className) {
    const element = document.getElementById('myAttendanceStatus');

    if (!element) {
      return;
    }

    element.className = `attendance-status-pill ${className}`;
  }

  function isTerminalNonAttendanceStatus(status) {
    return ['leave', 'weekly_off', 'holiday'].includes(status);
  }

  function formatPunctuality(value) {
    if (!value) {
      return '--';
    }

    return value === 'late' ? 'Late' : 'On Time';
  }

  /* ========================================================
     DATE / TIME
  ======================================================== */

  function formatDate(value) {
    const date = getRecordDate(value);

    if (!date || Number.isNaN(date.getTime())) {
      return '--';
    }

    return date.toLocaleDateString('en-IN', {
      weekday: 'short',

      day: '2-digit',

      month: 'short',

      year: 'numeric',
    });
  }

  function formatTime(value) {
    const date = getRecordDate(value);

    if (!date || Number.isNaN(date.getTime())) {
      return '--';
    }

    return date.toLocaleTimeString('en-IN', {
      hour: '2-digit',

      minute: '2-digit',

      hour12: true,
    });
  }

  function formatMinutes(minutes) {
    const value = Number(minutes);

    if (!Number.isFinite(value)) {
      return '--';
    }

    const safeMinutes = Math.max(0, Math.round(value));

    const hours = Math.floor(safeMinutes / 60);

    const mins = safeMinutes % 60;

    return `${hours}h ${mins}m`;
  }

  function formatHourMinute(hour, minute) {
    if (hour == null || minute == null) {
      return '--';
    }

    const now = new Date();

    const date = new Date(now.getFullYear(), now.getMonth(), now.getDate(), Number(hour), Number(minute));

    return date.toLocaleTimeString('en-IN', {
      hour: '2-digit',

      minute: '2-digit',

      hour12: true,
    });
  }

  function getRecordDate(value) {
    if (!value) {
      return null;
    }

    /*
     * Firestore Timestamp-like object.
     */

    if (typeof value === 'object' && value !== null) {
      if (typeof value.toDate === 'function') {
        return value.toDate();
      }

      if (value._seconds != null) {
        return new Date(Number(value._seconds) * 1000);
      }

      if (value.seconds != null) {
        return new Date(Number(value.seconds) * 1000);
      }
    }

    const date = new Date(value);

    return Number.isNaN(date.getTime()) ? null : date;
  }

  function getRecordDateKey(value) {
    const date = getRecordDate(value);

    if (!date) {
      return '';
    }

    return [
      date.getFullYear(),

      String(date.getMonth() + 1).padStart(2, '0'),

      String(date.getDate()).padStart(2, '0'),
    ].join('-');
  }

  function getTodayKey() {
    return getRecordDateKey(new Date());
  }

  function isCurrentMonth(year, month) {
    const now = new Date();

    return now.getFullYear() === Number(year) && now.getMonth() + 1 === Number(month);
  }

  function setCurrentMonth() {
    const now = new Date();

    const month = String(now.getMonth() + 1).padStart(2, '0');

    const input = document.getElementById('myAttendanceMonth');

    if (input) {
      input.value = `${now.getFullYear()}-${month}`;
    }
  }

  /* ========================================================
     UI HELPERS
  ======================================================== */

  function setText(id, value) {
    const element = document.getElementById(id);

    if (element) {
      element.textContent = value;
    }
  }

  function setActionLoading(id, loading, label) {
    const button = document.getElementById(id);

    if (!button) {
      return;
    }

    button.disabled = loading;

    button.innerHTML = loading
      ? `
          <span
            class="spinner-border spinner-border-sm"
            role="status"
          ></span>

          <span>
            ${escapeHtml(label)}
          </span>
        `
      : `
          <i class="bi ${id === 'attendanceCheckInBtn' ? 'bi-box-arrow-in-right' : 'bi-box-arrow-right'}"></i>

          <span>
            ${escapeHtml(label)}
          </span>
        `;
  }

  function setLoadingState(loading) {
    const page = document.querySelector('.my-attendance-page');

    if (!page) {
      return;
    }

    page.classList.toggle('my-attendance-loading', loading);

    /*
     * Do not disable the month input while refreshing.
     */

    const month = document.getElementById('myAttendanceMonth');

    if (month) {
      month.disabled = false;
    }
  }

  function getApiErrorMessage(error, fallback) {
    if (error?.response?.message) {
      return error.response.message;
    }

    if (error?.message) {
      return error.message;
    }

    return fallback;
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
