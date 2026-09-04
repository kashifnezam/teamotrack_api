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

  let undoCountdownTimer = null;

  let actionInProgress = false;

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

    document.getElementById('attendanceUndoCheckoutBtn')?.addEventListener('click', handleUndoCheckout);

    document.getElementById('myAttendanceRefreshBtn')?.addEventListener('click', () => loadAttendance({ force: true }));

    document.getElementById('myAttendanceMonth')?.addEventListener('change', () => loadAttendance({ force: true }));
  }

  /* ========================================================
     LOAD ATTENDANCE
  ======================================================== */

  /* ========================================================
   LOAD ATTENDANCE
======================================================== */

  async function loadAttendance(options = {}) {
    if (isLoading && !options.force) {
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
      AppAlert.loading('Loading attendance...');
      isLoading = true;

      setLoadingState(true);

      const data = await Api.get(`/attendance/my-data?month=${month}&year=${year}`);

      if (!data) {
        AppAlert.close();
        return;
      }

      records = Array.isArray(data.records) ? data.records : [];

      summary = data.summary || {};

      renderSummary(summary);

      renderRecords();
      AppAlert.close();

      /*
       * Only update TODAY when the selected
       * month is the current month.
       */
      if (isCurrentMonth(year, month)) {
        const todayKey = getTodayKey();

        todayAttendance = records.find((record) => getRecordDateKey(record.date) === todayKey) || null;

        renderTodayAttendance();
      } else {
        /*
         * We are looking at another month.
         * Do not leave stale today data visible.
         */
        todayAttendance = null;

        renderTodayUnavailable();
      }

      return data;
    } catch (error) {
      console.error('My attendance load failed:', error);

      AppAlert.error(getApiErrorMessage(error, 'Unable to load attendance'));
      AppAlert.close();
      return null;
    } finally {
      isLoading = false;

      setLoadingState(false);
    }
  }

  /* ========================================================
   TODAY UNAVAILABLE
======================================================== */

  function renderTodayUnavailable() {
    stopUndoCountdown();

    setText('myAttendanceStatusText', 'CURRENT MONTH ONLY');

    setStatusClass('status-not-marked');

    setText('myCheckIn', '--');

    setText('myCheckOut', '--');

    setText('myWorkingTime', '--');

    setText('myPunctuality', '--');

    setText('attendanceShiftTime', '--');

    const checkInBtn = document.getElementById('attendanceCheckInBtn');

    const checkOutBtn = document.getElementById('attendanceCheckOutBtn');

    const undoBtn = document.getElementById('attendanceUndoCheckoutBtn');

    if (checkInBtn) {
      checkInBtn.disabled = true;
      checkInBtn.hidden = true;
    }

    if (checkOutBtn) {
      checkOutBtn.disabled = true;
      checkOutBtn.hidden = true;
    }

    if (undoBtn) {
      undoBtn.hidden = true;
    }

    hideCorrectionNote();

    setText('attendanceActionMessage', 'Select the current month to manage today’s attendance.');
  }

  /* ========================================================
    CHECK IN
  ======================================================== */

  async function handleCheckIn() {
    if (actionInProgress) {
      return;
    }

    try {
      actionInProgress = true;

      const location = await getCurrentLocation();

      setActionLoading('attendanceCheckInBtn', true, 'Checking in...');

      const payload = {};

      if (location) {
        payload.lat = location.lat;
        payload.lng = location.lng;
      }

      const data = await Api.post('/attendance/check-in', payload);

      /*
       * Immediately update UI.
       */
      if (data) {
        updateTodayFromApiResponse(data);

        AppAlert.success(data.message || 'Check-in recorded successfully.');
      }

      /*
       * Then synchronize the monthly
       * record and summary.
       */
      await loadAttendance({
        force: true,
        silent: true,
      });
    } catch (error) {
      console.error('Check-in failed:', error);

      AppAlert.error(getApiErrorMessage(error, 'Unable to check in'));
    } finally {
      actionInProgress = false;

      setActionLoading('attendanceCheckInBtn', false, 'Check In');

      /*
       * renderTodayAttendance() determines
       * the final button state.
       */
      if (todayAttendance) {
        renderTodayAttendance();
      }
    }
  }

  /* ========================================================
     CHECK OUT
  ======================================================== */

  async function handleCheckOut() {
    if (actionInProgress) {
      return;
    }

    try {
      actionInProgress = true;

      const location = await getCurrentLocation();

      setActionLoading('attendanceCheckOutBtn', true, 'Checking out...');

      const payload = {};

      if (location) {
        payload.lat = location.lat;
        payload.lng = location.lng;
      }

      const data = await Api.post('/attendance/check-out', payload);

      /*
       * Immediately update the UI.
       */
      if (data) {
        updateTodayFromApiResponse(data);

        AppAlert.success(data.message || 'Check-out recorded successfully.');
      }

      /*
       * Synchronize monthly history.
       */
      await loadAttendance({
        force: true,
        silent: true,
      });
    } catch (error) {
      console.error('Check-out failed:', error);

      AppAlert.error(getApiErrorMessage(error, 'Unable to check out'));
    } finally {
      actionInProgress = false;

      setActionLoading('attendanceCheckOutBtn', false, 'Check Out');

      if (todayAttendance) {
        renderTodayAttendance();
      }
    }
  }

  /* ========================================================
    UNDO CHECK OUT
  ======================================================== */

  async function handleUndoCheckout() {
    if (actionInProgress) {
      return;
    }

    const confirmed = await AppAlert.confirm(
      'Undo Checkout',
      'Are you sure you want to undo your checkout? You will be marked as working again.'
    );

    if (!confirmed) {
      return;
    }

    try {
      actionInProgress = true;

      setActionLoading('attendanceUndoCheckoutBtn', true, 'Undoing...');

      const data = await Api.post('/attendance/undo-check-out', {});

      /*
       * Immediately update UI.
       */
      if (data) {
        updateTodayFromApiResponse(data);

        AppAlert.success(data.message || 'Checkout cancelled successfully.');
      }

      /*
       * Synchronize monthly history.
       */
      await loadAttendance({
        force: true,
        silent: true,
      });
    } catch (error) {
      console.error('Undo checkout failed:', error);

      AppAlert.error(getApiErrorMessage(error, 'Unable to undo checkout'));

      /*
       * Server is authoritative.
       * Reload after a failed undo.
       */
      await loadAttendance({
        force: true,
        silent: true,
      });
    } finally {
      actionInProgress = false;

      setActionLoading('attendanceUndoCheckoutBtn', false, 'Undo Checkout');

      if (todayAttendance) {
        renderTodayAttendance();
      }
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
   UPDATE TODAY FROM API RESPONSE
======================================================== */

  function updateTodayFromApiResponse(data) {
    if (!data) {
      return;
    }

    /*
     * Different backend methods may return:
     *
     * data.record
     * data.attendance
     * or the attendance object itself.
     */

    const record =
      data.record ||
      data.attendance ||
      (data.checkInTime !== undefined || data.checkOutTime !== undefined || data.status !== undefined ? data : null);

    if (!record) {
      return;
    }

    todayAttendance = {
      ...todayAttendance,
      ...record,
    };

    /*
     * Immediately repaint the Today card.
     */
    renderTodayAttendance();

    /*
     * Also update the matching monthly
     * record already in memory.
     */
    const todayKey = getTodayKey();

    const index = records.findIndex((item) => getRecordDateKey(item.date) === todayKey);

    if (index >= 0) {
      records[index] = {
        ...records[index],
        ...record,
      };
    } else {
      records.push(record);
    }

    /*
     * Update the table immediately too.
     */
    renderRecords();
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
    stopUndoCountdown();

    const record = todayAttendance;

    const checkInBtn = document.getElementById('attendanceCheckInBtn');

    const checkOutBtn = document.getElementById('attendanceCheckOutBtn');

    const undoBtn = document.getElementById('attendanceUndoCheckoutBtn');

    /*
     * --------------------------------------------------------
     * NO RECORD
     * --------------------------------------------------------
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
        checkInBtn.hidden = false;
      }

      if (checkOutBtn) {
        checkOutBtn.disabled = true;
        checkOutBtn.hidden = false;
      }

      if (undoBtn) {
        undoBtn.hidden = true;
      }

      hideCorrectionNote();

      setText('attendanceActionMessage', 'Your attendance for today has not been marked.');

      return;
    }

    /*
     * --------------------------------------------------------
     * SHIFT
     * --------------------------------------------------------
     */

    renderShift(record.shiftSnapshot);

    const hasCheckIn = !!record.checkInTime;

    const hasCheckOut = !!record.checkOutTime;

    /*
     * --------------------------------------------------------
     * WORKING
     * --------------------------------------------------------
     */

    if (hasCheckIn && !hasCheckOut) {
      setText('myAttendanceStatusText', 'WORKING');

      setStatusClass('status-working');
    } else {
      setText('myAttendanceStatusText', formatStatus(record.status));

      setStatusClass(getStatusClass(record.status));
    }

    /*
     * --------------------------------------------------------
     * METRICS
     * --------------------------------------------------------
     */

    setText('myCheckIn', formatTime(record.checkInTime));

    setText('myCheckOut', formatTime(record.checkOutTime));

    setText('myWorkingTime', formatMinutes(record.workingMinutes));

    setText('myPunctuality', formatPunctuality(record.punctuality));

    /*
     * --------------------------------------------------------
     * BUTTON STATE
     * --------------------------------------------------------
     */

    if (checkInBtn) {
      checkInBtn.disabled = hasCheckIn || isTerminalNonAttendanceStatus(record.status);

      checkInBtn.hidden = hasCheckIn;
    }

    /*
     * Currently working.
     */
    if (hasCheckIn && !hasCheckOut) {
      if (checkOutBtn) {
        checkOutBtn.disabled = false;
        checkOutBtn.hidden = false;
      }

      if (undoBtn) {
        undoBtn.hidden = true;
      }

      hideCorrectionNote();

      setText('attendanceActionMessage', 'You are currently checked in. Check out when your workday is complete.');

      return;
    }

    /*
     * --------------------------------------------------------
     * COMPLETED CHECKOUT
     * --------------------------------------------------------
     */

    if (hasCheckIn && hasCheckOut) {
      if (checkOutBtn) {
        checkOutBtn.disabled = true;
        checkOutBtn.hidden = true;
      }

      const undoUntil = getRecordDate(record.checkoutUndoUntil);

      if (undoUntil && Date.now() < undoUntil.getTime()) {
        /*
         * Undo is still available.
         */
        if (undoBtn) {
          undoBtn.hidden = false;
          undoBtn.disabled = false;
        }

        showUndoCountdown(undoUntil);

        setText(
          'attendanceActionMessage',
          'Checkout recorded. Made a mistake? You can undo your checkout before the correction window expires.'
        );

        return;
      }

      /*
       * Undo expired.
       */
      if (undoBtn) {
        undoBtn.hidden = true;
      }

      showCorrectionNote(
        'Checkout correction is now locked. Please contact your manager or HR if the checkout time is incorrect.'
      );

      setText('attendanceActionMessage', "Today's attendance has been completed.");

      return;
    }

    /*
     * --------------------------------------------------------
     * OTHER STATUSES
     * --------------------------------------------------------
     */

    if (checkOutBtn) {
      checkOutBtn.disabled = true;
    }

    if (undoBtn) {
      undoBtn.hidden = true;
    }

    if (record.status === 'leave') {
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
   UNDO COUNTDOWN
======================================================== */

  function showUndoCountdown(undoUntil) {
    stopUndoCountdown();

    const update = () => {
      const remaining = undoUntil.getTime() - Date.now();

      if (remaining <= 0) {
        stopUndoCountdown();

        const undoBtn = document.getElementById('attendanceUndoCheckoutBtn');

        if (undoBtn) {
          undoBtn.hidden = true;
        }

        showCorrectionNote(
          'Checkout correction is now locked. Please contact your manager or HR if the checkout time is incorrect.'
        );

        setText('attendanceActionMessage', "Today's attendance has been completed.");

        return;
      }

      const totalSeconds = Math.ceil(remaining / 1000);

      const minutes = Math.floor(totalSeconds / 60);

      const seconds = totalSeconds % 60;

      const countdown = `${minutes}:${String(seconds).padStart(2, '0')}`;

      setText('attendanceUndoCountdown', countdown);
    };

    update();

    undoCountdownTimer = window.setInterval(update, 1000);
  }

  function stopUndoCountdown() {
    if (undoCountdownTimer) {
      window.clearInterval(undoCountdownTimer);

      undoCountdownTimer = null;
    }

    setText('attendanceUndoCountdown', '');
  }

  /* ========================================================
   CORRECTION NOTE
======================================================== */

  function showCorrectionNote(message) {
    const note = document.getElementById('attendanceCorrectionNote');

    if (!note) {
      return;
    }

    note.hidden = false;

    setText('attendanceCorrectionNoteText', message);
  }

  function hideCorrectionNote() {
    const note = document.getElementById('attendanceCorrectionNote');

    if (note) {
      note.hidden = true;
    }

    setText('attendanceCorrectionNoteText', '');
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

    const text = button.querySelector('span:not(.spinner-border)');

    if (loading) {
      button.innerHTML = `
      <span
        class="spinner-border spinner-border-sm"
        role="status"
        aria-hidden="true"
      ></span>

      <span>${escapeHtml(label)}</span>
    `;

      return;
    }

    const iconMap = {
      attendanceCheckInBtn: 'bi-box-arrow-in-right',

      attendanceCheckOutBtn: 'bi-box-arrow-right',

      attendanceUndoCheckoutBtn: 'bi-arrow-counterclockwise',
    };

    if (id === 'attendanceUndoCheckoutBtn') {
      button.innerHTML = `
      <i class="bi ${iconMap[id]}"></i>

      <span>
        Undo Checkout
      </span>

      <small id="attendanceUndoCountdown"></small>
    `;

      /*
       * renderTodayAttendance() will immediately
       * decide whether this button should be visible.
       */
      return;
    }

    button.innerHTML = `
    <i class="bi ${iconMap[id]}"></i>

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
