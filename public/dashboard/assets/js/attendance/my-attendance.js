(function () {
  'use strict';

  /* ==========================================================
     TeamoTrack • My Attendance
  ========================================================== */

  let records = [];

  let summary = {};

  let isLoading = false;

  let todayAttendance = null;

  let actionInProgress = false;

  let regularizationRequests = [];

  let selectedRegularizationRecord = null;

  let regularizationModal = null;

  let checkoutHistoryModal = null;

  /* ==========================================================
     CONSTANTS
  ========================================================== */

  const INDIA_TIME_ZONE = 'Asia/Kolkata';

  const REGULARIZATION_TYPES = {
    MISSED_CHECK_IN: 'MISSED_CHECK_IN',
    MISSED_CHECK_OUT: 'MISSED_CHECK_OUT',
    MISSED_BOTH: 'MISSED_BOTH',

    BREAK_ERROR: 'BREAK_ERROR',

    WRONG_CHECK_IN: 'WRONG_CHECK_IN',
    WRONG_CHECK_OUT: 'WRONG_CHECK_OUT',
    WRONG_BOTH: 'WRONG_BOTH',

    SYSTEM_ERROR: 'SYSTEM_ERROR',
    LOCATION_ERROR: 'LOCATION_ERROR',
    OTHER: 'OTHER',
  };

  /* ==========================================================
     INITIALIZE
  ========================================================== */

  window.initializeMyAttendancePage = async function () {
    setCurrentMonth();

    bindEvents();

    renderTodayDate();

    initializeRegularizationModal();

    initializeCheckoutHistoryModal();

    await loadAttendance();
  };

  /* ==========================================================
     EVENTS
  ========================================================== */

  function bindEvents() {
    document.getElementById('attendanceCheckInBtn')?.addEventListener('click', handleCheckIn);

    document.getElementById('attendanceCheckOutBtn')?.addEventListener('click', handleCheckOut);

    document.getElementById('attendanceCheckoutAgainBtn')?.addEventListener('click', handleCheckOut);

    document.getElementById('attendanceStartBreakBtn')?.addEventListener('click', handleStartBreak);

    document.getElementById('attendanceEndBreakBtn')?.addEventListener('click', handleEndBreak);

    document.getElementById('attendanceMoreBtn')?.addEventListener('click', toggleMoreMenu);

    document.getElementById('attendanceViewCheckoutHistoryBtn')?.addEventListener('click', openCheckoutHistory);

    document.getElementById('myAttendanceRefreshBtn')?.addEventListener('click', () =>
      loadAttendance({
        force: true,
      })
    );

    document.getElementById('myAttendanceMonth')?.addEventListener('change', () =>
      loadAttendance({
        force: true,
      })
    );

    document.getElementById('submitAttendanceRegularizationBtn')?.addEventListener('click', handleSubmitRegularization);

    document.getElementById('regularizationReason')?.addEventListener('input', updateRegularizationCharacterCount);

    document.getElementById('regularizationType')?.addEventListener('change', handleRegularizationTypeChange);

    document.addEventListener('click', function (event) {
      const wrapper = document.getElementById('attendanceMoreWrapper');

      if (!wrapper) {
        return;
      }

      if (!wrapper.contains(event.target)) {
        closeMoreMenu();
      }
    });
  }

  /* ==========================================================
     CHECKOUT MENU
  ========================================================== */

  function toggleMoreMenu(event) {
    event?.stopPropagation();

    const menu = document.getElementById('attendanceMoreMenu');

    const button = document.getElementById('attendanceMoreBtn');

    if (!menu || !button) {
      return;
    }

    const isHidden = menu.hidden;

    menu.hidden = !isHidden;

    button.setAttribute('aria-expanded', String(isHidden));
  }

  function closeMoreMenu() {
    const menu = document.getElementById('attendanceMoreMenu');

    const button = document.getElementById('attendanceMoreBtn');

    if (menu) {
      menu.hidden = true;
    }

    if (button) {
      button.setAttribute('aria-expanded', 'false');
    }
  }

  /* ==========================================================
     REGULARIZATION MODAL
  ========================================================== */

  function initializeRegularizationModal() {
    const element = document.getElementById('attendanceRegularizationModal');

    if (!element) {
      return;
    }

    if (typeof bootstrap === 'undefined') {
      console.warn('Bootstrap is not available.');

      return;
    }

    regularizationModal = bootstrap.Modal.getOrCreateInstance(element);

    element.addEventListener('hidden.bs.modal', function () {
      selectedRegularizationRecord = null;

      resetRegularizationForm();
    });
  }

  /* ==========================================================
     CHECKOUT HISTORY MODAL
  ========================================================== */

  function initializeCheckoutHistoryModal() {
    const element = document.getElementById('attendanceCheckoutHistoryModal');

    if (!element) {
      return;
    }

    if (typeof bootstrap === 'undefined') {
      return;
    }

    checkoutHistoryModal = bootstrap.Modal.getOrCreateInstance(element);
  }

  function openCheckoutHistory() {
    closeMoreMenu();

    const record = todayAttendance;

    const body = document.getElementById('attendanceCheckoutHistoryBody');

    if (!body) {
      return;
    }

    const history = Array.isArray(record?.checkoutHistory) ? record.checkoutHistory : [];

    if (!history.length) {
      body.innerHTML = `
        <div class="attendance-history-empty">
          No checkout history.
        </div>
      `;

      checkoutHistoryModal?.show();

      return;
    }

    const sorted = [...history].reverse();

    body.innerHTML = sorted
      .map((item, index) => {
        const time = item.checkOutTime || item.recordedAt || null;

        return `
          <div class="attendance-checkout-history-item">

            <div class="attendance-checkout-history-index">
              ${history.length - index}
            </div>

            <div class="attendance-checkout-history-main">

              <strong>
                ${escapeHtml(formatTime(time))}
              </strong>

              <span>
                ${escapeHtml(formatMinutes(item.workingMinutes))} working time
              </span>

            </div>

            <div class="attendance-checkout-history-status">
              ${item.action === 'checkout_cancelled' ? 'Cancelled' : 'Checkout'}
            </div>

          </div>
        `;
      })
      .join('');

    checkoutHistoryModal?.show();
  }

  /* ==========================================================
     LOAD ATTENDANCE
  ========================================================== */

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

    if (!year || !month) {
      return;
    }

    try {
      if (!options.silent) {
        AppAlert.loading('Loading attendance...');
      }

      isLoading = true;

      setLoadingState(true);

      const data = await Api.get(`/attendance/my-data?month=${month}&year=${year}`);

      if (!data) {
        AppAlert.close();

        return;
      }

      records = Array.isArray(data.records) ? data.records : [];

      summary = data.summary || {};

      await loadRegularizationRequests(month, year);

      renderSummary(summary);

      renderRecords();

      if (isCurrentMonth(year, month)) {
        const todayKey = getTodayKey();

        todayAttendance = records.find((record) => getRecordDateKey(record.date) === todayKey) || null;

        renderTodayAttendance();
      } else {
        todayAttendance = null;

        renderTodayUnavailable();
      }

      if (!options.silent) {
        AppAlert.close();
      }

      return data;
    } catch (error) {
      console.error('My attendance load failed:', error);

      AppAlert.close();

      AppAlert.error(getApiErrorMessage(error, 'Unable to load attendance'));

      return null;
    } finally {
      isLoading = false;

      setLoadingState(false);
    }
  }

  /* ==========================================================
     REGULARIZATION REQUESTS
  ========================================================== */

  async function loadRegularizationRequests(month, year) {
    try {
      const data = await Api.get(`/attendance-regularization/my?month=${month}&year=${year}`);

      if (Array.isArray(data)) {
        regularizationRequests = data;

        return;
      }

      regularizationRequests = Array.isArray(data?.requests) ? data.requests : [];
    } catch (error) {
      console.error('Regularization request load failed:', error);

      regularizationRequests = [];
    }
  }

  function getRegularizationForDate(attendanceDate) {
    const dateKey = normalizeDateOnly(attendanceDate);

    if (!dateKey) {
      return null;
    }

    const matching = regularizationRequests.filter((request) => normalizeDateOnly(request.date) === dateKey);

    if (!matching.length) {
      return null;
    }

    const active = matching.find((request) =>
      ['pending', 'approved'].includes(String(request.status || '').toLowerCase())
    );

    return active || matching[matching.length - 1];
  }

  function getShiftBreakWindow(record) {
    const shift = record?.shiftSnapshot;

    if (!shift) {
      return null;
    }

    const startHour = Number(shift.breakStartHour);
    const startMinute = Number(shift.breakStartMinute);
    const endHour = Number(shift.breakEndHour);
    const endMinute = Number(shift.breakEndMinute);

    if (
      !Number.isFinite(startHour) ||
      !Number.isFinite(startMinute) ||
      !Number.isFinite(endHour) ||
      !Number.isFinite(endMinute)
    ) {
      return null;
    }

    const date = normalizeDateOnly(record.date);

    if (!date) {
      return null;
    }

    const start = parseIndiaDatetimeLocal(
      `${date}T${String(startHour).padStart(2, '0')}:${String(startMinute).padStart(2, '0')}`
    );

    let end = parseIndiaDatetimeLocal(
      `${date}T${String(endHour).padStart(2, '0')}:${String(endMinute).padStart(2, '0')}`
    );

    if (!start || !end) {
      return null;
    }

    if (end.getTime() <= start.getTime()) {
      end = new Date(end.getTime() + 24 * 60 * 60 * 1000);
    }

    return {
      start,
      end,
    };
  }

  function getBreakIssue(record) {
    if (!record) {
      return null;
    }

    const window = getShiftBreakWindow(record);

    /*
     * No configured scheduled break means there is
     * no break regularization issue to calculate.
     */
    if (!window) {
      return null;
    }

    const currentBreak = record.currentBreak;

    /*
     * ============================================================
     * INCOMPLETE BREAK
     * ============================================================
     */

    if (currentBreak?.active === true) {
      return {
        type: 'INCOMPLETE_BREAK',

        title: 'Incomplete Break',

        message: 'A break was started but has not been ended.',
      };
    }

    const history = Array.isArray(record.breakHistory) ? record.breakHistory : [];

    /*
     * No break is not automatically treated as an error.
     *
     * A configured break can legitimately be skipped.
     */
    if (!history.length) {
      return null;
    }

    /*
     * This attendance model supports one scheduled break.
     */
    const breakItem = history[history.length - 1];

    const start = getRecordDate(breakItem?.startTime);

    const end = getRecordDate(breakItem?.endTime);

    if (!start || !end) {
      return {
        type: 'INVALID_BREAK_TIME',

        title: 'Invalid Break Time',

        message: 'The recorded break time is incomplete or invalid.',
      };
    }

    /*
     * ============================================================
     * WRONG BREAK WINDOW
     * ============================================================
     */

    if (
      start.getTime() < window.start.getTime() ||
      start.getTime() > window.end.getTime() ||
      end.getTime() > window.end.getTime()
    ) {
      return {
        type: 'WRONG_BREAK_TIME',

        title: 'Break Outside Scheduled Window',

        message: 'The recorded break does not match the scheduled break window.',
      };
    }

    /*
     * ============================================================
     * EXCESS BREAK
     * ============================================================
     */

    const actualMinutes = Math.max(0, Math.round((end.getTime() - start.getTime()) / 60000));

    const scheduledMinutes = Math.max(0, Math.round((window.end.getTime() - window.start.getTime()) / 60000));

    if (actualMinutes > scheduledMinutes) {
      return {
        type: 'EXCESS_BREAK',

        title: 'Excess Break',

        message:
          `Recorded break is ${formatMinutes(actualMinutes)} ` +
          `while the scheduled break is ${formatMinutes(scheduledMinutes)}.`,
      };
    }

    return null;
  }

  function renderRegularizationBreakIssue(record) {
    const container = document.getElementById('regularizationBreakIssue');

    const title = document.getElementById('regularizationBreakIssueTitle');

    const message = document.getElementById('regularizationBreakIssueMessage');

    if (!container) {
      return;
    }

    const issue = getBreakIssue(record);

    if (!issue) {
      container.hidden = true;

      setText('regularizationBreakIssueTitle', 'Break Issue');

      setText('regularizationBreakIssueMessage', '');

      return;
    }

    container.hidden = false;

    setText(title?.id, issue.title);

    setText(message?.id, issue.message);
  }
  /* ==========================================================
     OPEN REGULARIZATION
  ========================================================== */

  function openRegularization(record) {
    if (!record) {
      return;
    }

    const existingRequest = getRegularizationForDate(record.date);

    const existingStatus = String(existingRequest?.status || '').toLowerCase();

    if (existingRequest && ['pending', 'approved'].includes(existingStatus)) {
      AppAlert.error(
        existingStatus === 'approved'
          ? 'This attendance has already been regularized.'
          : 'A regularization request is already pending for this date.'
      );

      return;
    }

    selectedRegularizationRecord = record;

    setText('regularizationDateLabel', formatDate(record.date));

    setText('regularizationCurrentCheckIn', formatTime(record.checkInTime));

    setText('regularizationCurrentCheckOut', formatTime(record.checkOutTime));

    setText('regularizationCurrentWorking', formatMinutes(Number(record.workingMinutes ?? 0)));

    setText(
      'regularizationCurrentBreak',
      formatMinutes(Number(record.totalBreakMinutes ?? getBreakHistoryMinutes(record.breakHistory)))
    );

    setText('regularizationCurrentStatus', formatStatus(record.status));

    resetRegularizationForm();

    const breakIssue = getBreakIssue(record);

    if (breakIssue) {
      const type = document.getElementById('regularizationType');

      if (type) {
        type.value = REGULARIZATION_TYPES.BREAK_ERROR;
      }
    }

    setText('regularizationDateLabel', formatDate(record.date));

    renderRegularizationBreakIssue(record);

    handleRegularizationTypeChange();
    if (breakIssue && breakIssue.type !== 'INCOMPLETE_BREAK') {
      prefillRegularizationBreak(record);
    }

    if (!regularizationModal) {
      initializeRegularizationModal();
    }

    regularizationModal?.show();
  }

  function resetRegularizationForm() {
    const type = document.getElementById('regularizationType');

    const checkIn = document.getElementById('regularizationCheckIn');

    const checkOut = document.getElementById('regularizationCheckOut');

    const breakStart = document.getElementById('regularizationBreakStart');

    const breakEnd = document.getElementById('regularizationBreakEnd');

    const reason = document.getElementById('regularizationReason');

    const breakSection = document.getElementById('regularizationBreakSection');

    const breakIssue = document.getElementById('regularizationBreakIssue');

    if (type) {
      type.value = '';
    }

    if (checkIn) {
      checkIn.value = '';
      checkIn.disabled = false;
      checkIn.required = false;
    }

    if (checkOut) {
      checkOut.value = '';
      checkOut.disabled = false;
      checkOut.required = false;
    }

    if (breakStart) {
      breakStart.value = '';
      breakStart.disabled = false;
      breakStart.required = false;
    }

    if (breakEnd) {
      breakEnd.value = '';
      breakEnd.disabled = false;
      breakEnd.required = false;
    }

    if (breakSection) {
      breakSection.hidden = true;
    }

    if (breakIssue) {
      breakIssue.hidden = true;
    }

    if (reason) {
      reason.value = '';
    }

    updateRegularizationCharacterCount();

    const submitButton = document.getElementById('submitAttendanceRegularizationBtn');

    if (submitButton) {
      submitButton.disabled = false;

      submitButton.innerHTML = `
      <i class="bi bi-send"></i>
      <span>
        Submit Request
      </span>
    `;
    }
  }

  function handleRegularizationTypeChange() {
    const type = document.getElementById('regularizationType')?.value;

    const checkIn = document.getElementById('regularizationCheckIn');

    const checkOut = document.getElementById('regularizationCheckOut');

    const breakStart = document.getElementById('regularizationBreakStart');

    const breakEnd = document.getElementById('regularizationBreakEnd');

    const breakSection = document.getElementById('regularizationBreakSection');

    if (checkIn) {
      checkIn.disabled = false;
      checkIn.required = false;
    }

    if (checkOut) {
      checkOut.disabled = false;
      checkOut.required = false;
    }

    if (breakStart) {
      breakStart.disabled = false;
      breakStart.required = false;
    }

    if (breakEnd) {
      breakEnd.disabled = false;
      breakEnd.required = false;
    }

    if (breakSection) {
      breakSection.hidden = true;
    }

    if (!type) {
      return;
    }

    /*
     * ============================================================
     * CHECK-IN
     * ============================================================
     */

    if (type === REGULARIZATION_TYPES.MISSED_CHECK_IN || type === REGULARIZATION_TYPES.WRONG_CHECK_IN) {
      if (checkIn) {
        checkIn.disabled = false;
        checkIn.required = true;
      }

      if (checkOut) {
        checkOut.disabled = true;
        checkOut.required = false;
        checkOut.value = '';
      }

      return;
    }

    /*
     * ============================================================
     * CHECK-OUT
     * ============================================================
     */

    if (type === REGULARIZATION_TYPES.MISSED_CHECK_OUT || type === REGULARIZATION_TYPES.WRONG_CHECK_OUT) {
      if (checkIn) {
        checkIn.disabled = true;
        checkIn.required = false;
        checkIn.value = '';
      }

      if (checkOut) {
        checkOut.disabled = false;
        checkOut.required = true;
      }

      return;
    }

    /*
     * ============================================================
     * BOTH
     * ============================================================
     */

    if (type === REGULARIZATION_TYPES.MISSED_BOTH || type === REGULARIZATION_TYPES.WRONG_BOTH) {
      if (checkIn) {
        checkIn.disabled = false;
        checkIn.required = true;
      }

      if (checkOut) {
        checkOut.disabled = false;
        checkOut.required = true;
      }

      return;
    }

    /*
     * ============================================================
     * BREAK ERROR
     * ============================================================
     */

    if (type === REGULARIZATION_TYPES.BREAK_ERROR) {
      if (checkIn) {
        checkIn.disabled = true;
        checkIn.required = false;
        checkIn.value = '';
      }

      if (checkOut) {
        checkOut.disabled = true;
        checkOut.required = false;
        checkOut.value = '';
      }

      if (breakSection) {
        breakSection.hidden = false;
      }

      renderRegularizationBreakSchedule();

      return;
    }
    function renderRegularizationBreakSchedule() {
      const element = document.getElementById('regularizationBreakSchedule');

      if (!element) {
        return;
      }

      const window = getShiftBreakWindow(selectedRegularizationRecord);

      if (!window) {
        element.textContent = 'No scheduled break configured';

        return;
      }

      element.textContent = `Scheduled: ${formatTime(window.start)} - ${formatTime(window.end)}`;
    }
    /*
     * ============================================================
     * SYSTEM / LOCATION / OTHER
     * ============================================================
     */

    if (
      type === REGULARIZATION_TYPES.SYSTEM_ERROR ||
      type === REGULARIZATION_TYPES.LOCATION_ERROR ||
      type === REGULARIZATION_TYPES.OTHER
    ) {
      if (checkIn) {
        checkIn.disabled = false;
        checkIn.required = false;
      }

      if (checkOut) {
        checkOut.disabled = false;
        checkOut.required = false;
      }
    }
  }

  /* ==========================================================
     SUBMIT REGULARIZATION
  ========================================================== */

  async function handleSubmitRegularization() {
    if (!selectedRegularizationRecord) {
      AppAlert.error('Attendance record not found.');

      return;
    }

    const date = normalizeDateOnly(selectedRegularizationRecord.date);

    const type = document.getElementById('regularizationType')?.value;

    const checkIn = document.getElementById('regularizationCheckIn')?.value;

    const checkOut = document.getElementById('regularizationCheckOut')?.value;

    const breakStart = document.getElementById('regularizationBreakStart')?.value;

    const breakEnd = document.getElementById('regularizationBreakEnd')?.value;

    const reason = document.getElementById('regularizationReason')?.value?.trim();

    /*
     * ============================================================
     * BASIC VALIDATION
     * ============================================================
     */

    if (!date) {
      AppAlert.error('Attendance date could not be determined.');

      return;
    }

    if (!type) {
      AppAlert.error('Please select what went wrong.');

      return;
    }

    if (!Object.values(REGULARIZATION_TYPES).includes(type)) {
      AppAlert.error('Invalid regularization type.');

      return;
    }

    if (!reason || reason.length < 3) {
      AppAlert.error('Please provide a valid reason.');

      return;
    }

    if (reason.length > 1000) {
      AppAlert.error('Reason cannot exceed 1000 characters.');

      return;
    }

    /*
     * ============================================================
     * CHECK-IN / CHECK-OUT VALIDATION
     * ============================================================
     */

    const requiresCheckIn = [
      REGULARIZATION_TYPES.MISSED_CHECK_IN,
      REGULARIZATION_TYPES.WRONG_CHECK_IN,
      REGULARIZATION_TYPES.MISSED_BOTH,
      REGULARIZATION_TYPES.WRONG_BOTH,
    ].includes(type);

    const requiresCheckOut = [
      REGULARIZATION_TYPES.MISSED_CHECK_OUT,
      REGULARIZATION_TYPES.WRONG_CHECK_OUT,
      REGULARIZATION_TYPES.MISSED_BOTH,
      REGULARIZATION_TYPES.WRONG_BOTH,
    ].includes(type);

    if (requiresCheckIn && !checkIn) {
      AppAlert.error('Please provide the requested check-in time.');

      return;
    }

    if (requiresCheckOut && !checkOut) {
      AppAlert.error('Please provide the requested check-out time.');

      return;
    }

    /*
     * ============================================================
     * BREAK VALIDATION
     * ============================================================
     */

    if (type === REGULARIZATION_TYPES.BREAK_ERROR) {
      if (!breakStart) {
        AppAlert.error('Please provide the requested break start time.');

        return;
      }

      if (!breakEnd) {
        AppAlert.error('Please provide the requested break end time.');

        return;
      }

      const breakStartDate = parseIndiaDatetimeLocal(combineAttendanceDateAndTime(date, breakStart));

      const breakEndDate = parseIndiaDatetimeLocal(combineAttendanceDateAndTime(date, breakEnd));

      if (!breakStartDate || !breakEndDate) {
        AppAlert.error('Invalid break start or end time.');

        return;
      }

      if (breakEndDate.getTime() <= breakStartDate.getTime()) {
        AppAlert.error('Break end time must be after break start time.');

        return;
      }

      const breakWindow = getShiftBreakWindow(selectedRegularizationRecord);

      if (!breakWindow) {
        AppAlert.error('No scheduled break is configured for this attendance record.');

        return;
      }

      if (breakStartDate.getTime() < breakWindow.start.getTime()) {
        AppAlert.error(`Break cannot start before ${formatTime(breakWindow.start)}.`);

        return;
      }

      if (breakStartDate.getTime() > breakWindow.end.getTime()) {
        AppAlert.error(`Break cannot start after ${formatTime(breakWindow.end)}.`);

        return;
      }

      if (breakEndDate.getTime() > breakWindow.end.getTime()) {
        AppAlert.error(`Break cannot end after ${formatTime(breakWindow.end)}.`);

        return;
      }
    }

    /*
     * ============================================================
     * NORMAL CHECK-IN / CHECK-OUT DATETIME
     * ============================================================
     */

    const checkInDateTime = combineAttendanceDateAndTime(date, checkIn);

    const checkOutDateTime = combineAttendanceDateAndTime(date, checkOut);

    if (checkIn && checkOut) {
      const checkInDate = parseIndiaDatetimeLocal(checkInDateTime);

      const checkOutDate = parseIndiaDatetimeLocal(checkOutDateTime);

      if (!checkInDate || !checkOutDate) {
        AppAlert.error('Invalid check-in or check-out time.');

        return;
      }

      if (checkOutDate.getTime() <= checkInDate.getTime()) {
        AppAlert.error('Check-out time must be after check-in time.');

        return;
      }
    }

    /*
     * ============================================================
     * DUPLICATE REQUEST
     * ============================================================
     */

    const existingRequest = getRegularizationForDate(selectedRegularizationRecord.date);

    if (existingRequest && ['pending', 'approved'].includes(String(existingRequest.status || '').toLowerCase())) {
      AppAlert.error('A regularization request already exists for this date.');

      return;
    }

    /*
     * ============================================================
     * BREAK DATETIME
     * ============================================================
     */

    const breakStartDateTime =
      type === REGULARIZATION_TYPES.BREAK_ERROR ? combineAttendanceDateAndTime(date, breakStart) : null;

    const breakEndDateTime =
      type === REGULARIZATION_TYPES.BREAK_ERROR ? combineAttendanceDateAndTime(date, breakEnd) : null;

    /*
     * ============================================================
     * PAYLOAD
     * ============================================================
     */

    const payload = {
      date: indiaDateToIso(date),

      type,

      checkInTime: checkInDateTime ? indiaLocalDateTimeToIso(checkInDateTime) : null,

      checkOutTime: checkOutDateTime ? indiaLocalDateTimeToIso(checkOutDateTime) : null,

      breakStartTime: breakStartDateTime ? indiaLocalDateTimeToIso(breakStartDateTime) : null,

      breakEndTime: breakEndDateTime ? indiaLocalDateTimeToIso(breakEndDateTime) : null,

      reason,
    };

    const button = document.getElementById('submitAttendanceRegularizationBtn');

    try {
      if (button) {
        button.disabled = true;

        button.innerHTML = `
        <span
          class="spinner-border spinner-border-sm"
          role="status"
          aria-hidden="true"
        ></span>

        <span>
          Submitting...
        </span>
      `;
      }

      const response = await Api.post('/attendance-regularization', payload);

      AppAlert.success(response?.message || 'Attendance regularization request submitted successfully.');

      regularizationModal?.hide();

      const monthValue = document.getElementById('myAttendanceMonth')?.value;

      if (monthValue) {
        const [year, month] = monthValue.split('-').map(Number);

        await loadRegularizationRequests(month, year);
      }

      renderRecords();
    } catch (error) {
      console.error('Attendance regularization submission failed:', error);

      AppAlert.error(getApiErrorMessage(error, 'Unable to submit attendance regularization request.'));
    } finally {
      if (button) {
        button.disabled = false;

        button.innerHTML = `
        <i class="bi bi-send"></i>

        <span>
          Submit Request
        </span>
      `;
      }
    }
  }

  /* ==========================================================
     CHECK IN
  ========================================================== */

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

      if (data) {
        updateTodayFromApiResponse(data);

        AppAlert.success(data.message || 'Check-in recorded successfully.');
      }

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

      if (todayAttendance) {
        renderTodayAttendance();
      }
    }
  }

  /* ==========================================================
     START BREAK
  ========================================================== */

  async function handleStartBreak() {
    if (actionInProgress) {
      return;
    }

    try {
      actionInProgress = true;

      const location = await getCurrentLocation();

      setActionLoading('attendanceStartBreakBtn', true, 'Starting break...');

      const payload = {};

      if (location) {
        payload.lat = location.lat;
        payload.lng = location.lng;
      }

      const data = await Api.post('/attendance/start-break', payload);

      if (data) {
        updateTodayFromApiResponse(data);

        AppAlert.success(data.message || 'Break started successfully.');
      }

      await loadAttendance({
        force: true,
        silent: true,
      });
    } catch (error) {
      console.error('Start break failed:', error);

      AppAlert.error(getApiErrorMessage(error, 'Unable to start break'));
    } finally {
      actionInProgress = false;

      setActionLoading('attendanceStartBreakBtn', false, 'Start Break');

      if (todayAttendance) {
        renderTodayAttendance();
      }
    }
  }

  /* ==========================================================
     END BREAK
  ========================================================== */

  async function handleEndBreak() {
    if (actionInProgress) {
      return;
    }

    try {
      actionInProgress = true;

      const location = await getCurrentLocation();

      setActionLoading('attendanceEndBreakBtn', true, 'Ending break...');

      const payload = {};

      if (location) {
        payload.lat = location.lat;
        payload.lng = location.lng;
      }

      const data = await Api.post('/attendance/end-break', payload);

      if (data) {
        updateTodayFromApiResponse(data);

        AppAlert.success(data.message || 'Break ended successfully.');
      }

      await loadAttendance({
        force: true,
        silent: true,
      });
    } catch (error) {
      console.error('End break failed:', error);

      AppAlert.error(getApiErrorMessage(error, 'Unable to end break'));
    } finally {
      actionInProgress = false;

      setActionLoading('attendanceEndBreakBtn', false, 'End Break');

      if (todayAttendance) {
        renderTodayAttendance();
      }
    }
  }

  /* ==========================================================
     CHECK OUT
  ========================================================== */

  async function handleCheckOut() {
    if (actionInProgress) {
      return;
    }

    closeMoreMenu();

    try {
      actionInProgress = true;

      const location = await getCurrentLocation();

      setCheckoutLoading(true);

      const payload = {};

      if (location) {
        payload.lat = location.lat;
        payload.lng = location.lng;
      }

      const data = await Api.post('/attendance/check-out', payload);

      if (data) {
        updateTodayFromApiResponse(data);

        AppAlert.success(data.message || 'Check-out recorded successfully.');
      }

      await loadAttendance({
        force: true,
        silent: true,
      });
    } catch (error) {
      console.error('Check-out failed:', error);

      AppAlert.error(getApiErrorMessage(error, 'Unable to check out'));
    } finally {
      actionInProgress = false;

      setCheckoutLoading(false);

      if (todayAttendance) {
        renderTodayAttendance();
      }
    }
  }

  function setCheckoutLoading(loading) {
    const button = document.getElementById('attendanceCheckOutBtn');

    const again = document.getElementById('attendanceCheckoutAgainBtn');

    if (loading) {
      if (button) {
        button.disabled = true;

        button.innerHTML = `
          <span
            class="spinner-border spinner-border-sm"
            role="status"
            aria-hidden="true"
          ></span>

          <span>
            Checking out...
          </span>
        `;
      }

      if (again) {
        again.disabled = true;
      }

      return;
    }

    if (again) {
      again.disabled = false;
    }
  }

  /* ==========================================================
     GEOLOCATION
  ========================================================== */

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

  /* ==========================================================
     UPDATE TODAY
  ========================================================== */

  function updateTodayFromApiResponse(data) {
    if (!data) {
      return;
    }

    const record =
      data.record ||
      data.attendance ||
      data.checkInTime !== undefined ||
      data.checkOutTime !== undefined ||
      data.status !== undefined ||
      data.checkoutCount !== undefined ||
      data.currentBreak !== undefined
        ? data.record || data.attendance || data
        : null;

    if (!record) {
      return;
    }

    todayAttendance = {
      ...todayAttendance,
      ...record,
    };

    renderTodayAttendance();

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

    renderRecords();
  }

  function prefillRegularizationBreak(record) {
    const breakStart = document.getElementById('regularizationBreakStart');

    const breakEnd = document.getElementById('regularizationBreakEnd');

    if (!breakStart || !breakEnd) {
      return;
    }

    const history = Array.isArray(record?.breakHistory) ? record.breakHistory : [];

    const lastBreak = history[history.length - 1];

    const start = getRecordDate(lastBreak?.startTime);

    const end = getRecordDate(lastBreak?.endTime);

    if (start) {
      breakStart.value = formatTimeInput(start);
    }

    if (end) {
      breakEnd.value = formatTimeInput(end);
    }
  }

  /* ==========================================================
     TODAY
  ========================================================== */

  function renderTodayDate() {
    setText(
      'attendanceTodayDate',
      formatIndiaDate(new Date(), {
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

    const startBreakBtn = document.getElementById('attendanceStartBreakBtn');

    const endBreakBtn = document.getElementById('attendanceEndBreakBtn');

    const moreWrapper = document.getElementById('attendanceMoreWrapper');

    const breakInfo = document.getElementById('attendanceBreakInfo');

    const checkoutInfo = document.getElementById('attendanceCheckoutInfo');

    const progressSection = document.getElementById('attendanceWorkBreakSection');

    if (!record) {
      setText('myAttendanceStatusText', 'NOT MARKED');

      setStatusClass('status-not-marked');

      setText('myCheckIn', '--');

      setText('myCheckOut', '--');

      setText('myCheckoutCount', '0');

      setText('myWorkingTime', '--');

      setText('myBreakTime', '0m');

      setText('myPunctuality', '--');

      setText('attendanceShiftTime', '--');

      setText('attendanceBreakScheduleTime', '--');

      const schedule = document.getElementById('attendanceBreakSchedule');

      if (schedule) {
        schedule.hidden = true;
      }

      if (progressSection) {
        progressSection.hidden = true;
      }

      if (checkInBtn) {
        checkInBtn.disabled = false;
        checkInBtn.hidden = false;
      }

      if (checkOutBtn) {
        checkOutBtn.disabled = true;
        checkOutBtn.hidden = false;
      }

      if (moreWrapper) {
        moreWrapper.hidden = true;
      }

      if (startBreakBtn) {
        startBreakBtn.hidden = true;
        startBreakBtn.disabled = false;
      }

      if (endBreakBtn) {
        endBreakBtn.hidden = true;
        endBreakBtn.disabled = false;
      }

      if (breakInfo) {
        breakInfo.hidden = true;
      }

      if (checkoutInfo) {
        checkoutInfo.hidden = true;
      }

      setText('attendanceBreakMessage', '');

      setText('attendanceCheckoutInfoText', '');

      setText('attendanceActionMessage', 'Your attendance for today has not been marked.');

      closeMoreMenu();

      return;
    }

    renderShift(record.shiftSnapshot);

    const hasCheckIn = !!record.checkInTime;

    const hasCheckOut = !!record.checkOutTime;

    const hasActiveBreak = record.currentBreak?.active === true;

    const breakHistory = Array.isArray(record.breakHistory) ? record.breakHistory : [];

    const hasCompletedBreak = breakHistory.length > 0;

    const checkoutCount = Number(record.checkoutCount ?? 0);

    const breakMinutes = Number(record.totalBreakMinutes ?? getBreakHistoryMinutes(breakHistory));

    const workingMinutes = Number(record.workingMinutes ?? 0);

    setText('myCheckIn', formatTime(record.checkInTime));

    setText('myCheckOut', formatTime(record.checkOutTime));

    setText('myCheckoutCount', checkoutCount);

    setText('myWorkingTime', formatMinutes(workingMinutes));

    setText('myBreakTime', formatMinutes(breakMinutes));

    setText('myPunctuality', formatPunctuality(record.punctuality));

    renderBreakSchedule(record.shiftSnapshot);

    renderWorkBreakProgress(workingMinutes, breakMinutes);

    /* ======================================================
       STATUS
    ====================================================== */

    if (hasCheckIn && hasActiveBreak) {
      setText('myAttendanceStatusText', 'ON BREAK');

      setStatusClass('status-working');
    } else if (hasCheckIn) {
      setText('myAttendanceStatusText', 'WORKING');

      setStatusClass('status-working');
    } else {
      setText('myAttendanceStatusText', formatStatus(record.status));

      setStatusClass(getStatusClass(record.status));
    }

    /* ======================================================
       CHECK IN
    ====================================================== */

    if (checkInBtn) {
      checkInBtn.disabled = hasCheckIn || isTerminalNonAttendanceStatus(record.status);

      checkInBtn.hidden = hasCheckIn;
    }

    /* ======================================================
       START BREAK
    ====================================================== */

    /*
     * A second break is not available
     * after the scheduled break has
     * already been completed.
     */
    const canStartBreak =
      hasCheckIn && !hasActiveBreak && !hasCompletedBreak && !isTerminalNonAttendanceStatus(record.status);

    if (startBreakBtn) {
      startBreakBtn.hidden = !canStartBreak;

      startBreakBtn.disabled = !canStartBreak;
    }

    /* ======================================================
       END BREAK
    ====================================================== */

    if (endBreakBtn) {
      endBreakBtn.hidden = !hasCheckIn || !hasActiveBreak;

      endBreakBtn.disabled = !hasCheckIn || !hasActiveBreak;
    }

    /* ======================================================
       CHECKOUT
    ====================================================== */

    /*
     * First checkout is a normal visible
     * button.
     *
     * Once one checkout exists, the main
     * checkout button disappears and
     * "Check Out Again" moves into the
     * three-dot menu.
     */
    if (checkOutBtn) {
      checkOutBtn.hidden = !hasCheckIn || hasCheckOut || isTerminalNonAttendanceStatus(record.status);

      checkOutBtn.disabled =
        !hasCheckIn || hasActiveBreak || hasCheckOut || isTerminalNonAttendanceStatus(record.status);
    }

    if (moreWrapper) {
      moreWrapper.hidden = !hasCheckIn || !hasCheckOut || isTerminalNonAttendanceStatus(record.status);
    }

    /* ======================================================
       BREAK INFORMATION
    ====================================================== */

    if (breakInfo) {
      breakInfo.hidden = !hasActiveBreak;
    }

    if (hasActiveBreak) {
      const breakStart = formatTime(record.currentBreak?.startTime);

      const scheduledEnd = formatTime(record.currentBreak?.scheduledEndTime);

      setText('attendanceBreakMessage', `Break started at ${breakStart}. End by ${scheduledEnd}.`);
    } else if (hasCompletedBreak) {
      const lastBreak = breakHistory[breakHistory.length - 1];

      setText('attendanceBreakMessage', `Break completed at ${formatTime(lastBreak?.endTime)}.`);
    } else {
      setText('attendanceBreakMessage', '');
    }

    /* ======================================================
       CHECKOUT INFORMATION
    ====================================================== */

    if (checkoutInfo) {
      checkoutInfo.hidden = !hasCheckOut;
    }

    if (hasCheckOut) {
      setText(
        'attendanceCheckoutInfoText',
        `Latest checkout: ${formatTime(record.checkOutTime)} • ${checkoutCount} checkout${
          checkoutCount === 1 ? '' : 's'
        } recorded`
      );
    } else {
      setText('attendanceCheckoutInfoText', '');
    }

    /* ======================================================
       ACTION MESSAGE
    ====================================================== */

    if (hasActiveBreak) {
      setText('attendanceActionMessage', 'You are currently on break. End your break before checking out.');

      return;
    }

    if (hasCheckIn && hasCompletedBreak && hasCheckOut) {
      setText(
        'attendanceActionMessage',
        'Your scheduled break is complete. Additional checkouts are available from the three-dot menu.'
      );

      return;
    }

    if (hasCheckIn && hasCompletedBreak) {
      setText('attendanceActionMessage', 'Your scheduled break is complete. You can continue working or check out.');

      return;
    }

    if (hasCheckIn && hasCheckOut) {
      setText(
        'attendanceActionMessage',
        'You are still working. Use the three-dot menu if you need to check out again.'
      );

      return;
    }

    if (hasCheckIn) {
      setText(
        'attendanceActionMessage',
        'You are currently checked in. Start your scheduled break or check out when needed.'
      );

      return;
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

  /* ==========================================================
     SHIFT
  ========================================================== */

  function renderShift(shift) {
    if (!shift) {
      setText('attendanceShiftTime', '--');

      const schedule = document.getElementById('attendanceBreakSchedule');

      if (schedule) {
        schedule.hidden = true;
      }

      return;
    }

    const start = formatHourMinute(shift.startHour, shift.startMinute);

    const end = formatHourMinute(shift.endHour, shift.endMinute);

    setText('attendanceShiftTime', `${start} - ${end}`);

    renderBreakSchedule(shift);
  }

  function renderBreakSchedule(shift) {
    const schedule = document.getElementById('attendanceBreakSchedule');

    if (!schedule) {
      return;
    }

    const hasBreak =
      shift &&
      shift.breakStartHour != null &&
      shift.breakStartMinute != null &&
      shift.breakEndHour != null &&
      shift.breakEndMinute != null;

    if (!hasBreak) {
      schedule.hidden = true;

      setText('attendanceBreakScheduleTime', '--');

      return;
    }

    const start = formatHourMinute(shift.breakStartHour, shift.breakStartMinute);

    const end = formatHourMinute(shift.breakEndHour, shift.breakEndMinute);

    setText('attendanceBreakScheduleTime', `${start} - ${end}`);

    schedule.hidden = false;
  }

  /* ==========================================================
     WORK / BREAK PROGRESS
  ========================================================== */

  function renderWorkBreakProgress(workingMinutes, breakMinutes) {
    const section = document.getElementById('attendanceWorkBreakSection');

    if (!section) {
      return;
    }

    const work = Math.max(0, Number(workingMinutes) || 0);

    const breakTime = Math.max(0, Number(breakMinutes) || 0);

    const total = work + breakTime;

    if (total <= 0) {
      section.hidden = true;

      return;
    }

    section.hidden = false;

    let workPercent = (work / total) * 100;

    let breakPercent = (breakTime / total) * 100;

    if (breakTime <= 0) {
      workPercent = 100;
      breakPercent = 0;
    }

    const workSegment = document.getElementById('attendanceWorkSegment');

    const breakSegment = document.getElementById('attendanceBreakSegment');

    if (workSegment) {
      workSegment.style.width = `${workPercent}%`;
    }

    if (breakSegment) {
      breakSegment.style.width = `${breakPercent}%`;
    }

    setText('attendanceWorkSegmentLabel', work >= 45 ? formatMinutes(work) : '');

    setText('attendanceBreakSegmentLabel', breakTime >= 15 ? formatMinutes(breakTime) : '');

    setText('attendanceWorkBreakTotal', `${formatMinutes(work)} working • ${formatMinutes(breakTime)} break`);

    setText('attendanceWorkLegend', formatMinutes(work));

    setText('attendanceBreakLegend', formatMinutes(breakTime));
  }

  /* ==========================================================
     SUMMARY
  ========================================================== */

  function renderSummary(data) {
    setText('myPresentCount', data.totalPresent || 0);

    setText('myLateCount', data.totalLate || 0);

    setText('myHalfDayCount', data.totalHalfDay || 0);

    setText('myLeaveCount', data.totalLeave || 0);

    setText('myAbsentCount', data.totalAbsent || 0);

    setText('myTotalWorking', formatMinutes(data.totalWorkingMinutes || 0));
  }

  /* ==========================================================
     TABLE
  ========================================================== */

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
            colspan="7"
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

    const sorted = [...records].sort((a, b) => getRecordDate(b.date) - getRecordDate(a.date));

    tbody.innerHTML = sorted.map((record) => renderRecordRow(record)).join('');
  }

  function renderRecordRow(record) {
    const regularization = getRegularizationForDate(record.date);

    return `
      <tr>

        <td>
          <strong>
            ${escapeHtml(formatDate(record.date))}
          </strong>
        </td>

        <td>
          ${escapeHtml(formatTime(record.checkInTime))}
        </td>

        <td>
          ${renderCheckoutCell(record)}
        </td>

        <td>
          ${renderWorkBreakCell(record)}
        </td>

        <td>
          ${attendanceBadge(record)}
        </td>

        <td>
          ${punctualityBadge(record.punctuality)}
        </td>

        <td>
          ${renderRegularizationAction(record, regularization)}
        </td>

      </tr>
    `;
  }

  /* ==========================================================
     CHECKOUT TABLE CELL
  ========================================================== */

  function renderCheckoutCell(record) {
    const latestCheckout = formatTime(record.checkOutTime);

    const count = Number(record.checkoutCount ?? 0);

    if (count <= 0 && latestCheckout === '--') {
      return '--';
    }

    return `
      <div class="attendance-checkout-cell">

        <strong>
          ${escapeHtml(latestCheckout)}
        </strong>

        ${
          count > 1
            ? `
              <small>
                ${count} checkouts
              </small>
            `
            : ''
        }

      </div>
    `;
  }

  /* ==========================================================
     WORK / BREAK TABLE CELL
  ========================================================== */

  function renderWorkBreakCell(record) {
    const work = Math.max(0, Number(record.workingMinutes ?? 0));

    const breakMinutes = Math.max(0, Number(record.totalBreakMinutes ?? getBreakHistoryMinutes(record.breakHistory)));

    const total = work + breakMinutes;

    if (total <= 0) {
      return `
        <div class="attendance-work-break-cell empty">
          <span>
            --
          </span>
        </div>
      `;
    }

    const workPercent = breakMinutes > 0 ? Math.min(100, (work / total) * 100) : 100;

    const breakPercent = breakMinutes > 0 ? Math.min(100, (breakMinutes / total) * 100) : 0;

    return `
      <div class="attendance-work-break-cell">

        <div class="attendance-row-time">
          <strong>
            ${escapeHtml(formatMinutes(work))}
          </strong>

          ${
            breakMinutes > 0
              ? `
                <span>
                  ${escapeHtml(formatMinutes(breakMinutes))} break
                </span>
              `
              : ''
          }
        </div>

        <div class="attendance-row-progress">

          <div
            class="attendance-row-work"
            style="width:${workPercent}%"
          ></div>

          <div
            class="attendance-row-break"
            style="width:${breakPercent}%"
          ></div>

        </div>

      </div>
    `;
  }

  /* ==========================================================
     REGULARIZATION ACTION
  ========================================================== */

  function renderRegularizationAction(record, request) {
    if (request) {
      const status = String(request.status || '').toLowerCase();

      if (status === 'pending') {
        return `
        <span
          class="attendance-regularization-status pending"
        >
          <i class="bi bi-hourglass-split"></i>
          Pending
        </span>
      `;
      }

      if (status === 'approved') {
        return `
        <span
          class="attendance-regularization-status approved"
        >
          <i class="bi bi-check-circle-fill"></i>
          Approved
        </span>
      `;
      }

      if (status === 'rejected') {
        return `
        <button
          type="button"
          class="attendance-regularize-btn"
          onclick="window.openAttendanceRegularization('${escapeJs(record.id)}')"
          title="Submit another correction request"
        >
          <i class="bi bi-arrow-repeat"></i>
          Re-submit
        </button>
      `;
      }

      if (status === 'cancelled') {
        return `
        <button
          type="button"
          class="attendance-regularize-btn"
          onclick="window.openAttendanceRegularization('${escapeJs(record.id)}')"
          title="Submit attendance correction"
        >
          <i class="bi bi-pencil-square"></i>
          Regularize
        </button>
      `;
      }
    }

    /*
     * ============================================================
     * BREAK ISSUE
     * ============================================================
     */

    const breakIssue = getBreakIssue(record);

    if (breakIssue) {
      return `
      <div class="attendance-regularization-break-action">

        <span
          class="attendance-break-issue-badge"
          title="${escapeHtml(breakIssue.message)}"
        >
          <i class="bi bi-exclamation-triangle-fill"></i>
          Break Issue
        </span>

        <button
          type="button"
          class="attendance-regularize-btn break"
          onclick="window.openAttendanceRegularization('${escapeJs(record.id)}')"
          title="Correct break attendance"
        >
          <i class="bi bi-pencil-square"></i>
          Correct
        </button>

      </div>
    `;
    }

    return `
    <button
      type="button"
      class="attendance-regularize-btn"
      onclick="window.openAttendanceRegularization('${escapeJs(record.id)}')"
      title="Submit attendance correction"
    >
      <i class="bi bi-pencil-square"></i>
      Regularize
    </button>
  `;
  }

  window.openAttendanceRegularization = function (recordId) {
    const record = records.find((item) => String(item.id) === String(recordId));

    if (!record) {
      AppAlert.error('Attendance record not found.');

      return;
    }

    openRegularization(record);
  };

  /* ==========================================================
     ATTENDANCE BADGE
  ========================================================== */

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
      <span
        class="my-attendance-badge ${className}"
      >
        ${escapeHtml(label)}
      </span>
    `;
  }

  /* ==========================================================
     PUNCTUALITY
  ========================================================== */

  function punctualityBadge(punctuality) {
    if (!punctuality) {
      return `
        <span
          class="my-punctuality-badge neutral"
        >
          --
        </span>
      `;
    }

    const late = punctuality === 'late';

    return `
      <span
        class="my-punctuality-badge ${late ? 'late' : 'on-time'}"
      >
        <i
          class="bi ${late ? 'bi-clock' : 'bi-check-circle'}"
        ></i>

        ${late ? 'Late' : 'On Time'}
      </span>
    `;
  }

  /* ==========================================================
     TODAY UNAVAILABLE
  ========================================================== */

  function renderTodayUnavailable() {
    setText('myAttendanceStatusText', 'CURRENT MONTH ONLY');

    setStatusClass('status-not-marked');

    setText('myCheckIn', '--');

    setText('myCheckOut', '--');

    setText('myCheckoutCount', '0');

    setText('myWorkingTime', '--');

    setText('myBreakTime', '0m');

    setText('myPunctuality', '--');

    setText('attendanceShiftTime', '--');

    setText('attendanceBreakScheduleTime', '--');

    const checkInBtn = document.getElementById('attendanceCheckInBtn');

    const checkOutBtn = document.getElementById('attendanceCheckOutBtn');

    const startBreakBtn = document.getElementById('attendanceStartBreakBtn');

    const endBreakBtn = document.getElementById('attendanceEndBreakBtn');

    const moreWrapper = document.getElementById('attendanceMoreWrapper');

    const breakInfo = document.getElementById('attendanceBreakInfo');

    const checkoutInfo = document.getElementById('attendanceCheckoutInfo');

    const progressSection = document.getElementById('attendanceWorkBreakSection');

    if (checkInBtn) {
      checkInBtn.disabled = true;
      checkInBtn.hidden = true;
    }

    if (checkOutBtn) {
      checkOutBtn.disabled = true;
      checkOutBtn.hidden = true;
    }

    if (startBreakBtn) {
      startBreakBtn.disabled = true;
      startBreakBtn.hidden = true;
    }

    if (endBreakBtn) {
      endBreakBtn.disabled = true;
      endBreakBtn.hidden = true;
    }

    if (moreWrapper) {
      moreWrapper.hidden = true;
    }

    if (breakInfo) {
      breakInfo.hidden = true;
    }

    if (checkoutInfo) {
      checkoutInfo.hidden = true;
    }

    if (progressSection) {
      progressSection.hidden = true;
    }

    setText('attendanceBreakMessage', '');

    setText('attendanceCheckoutInfoText', '');

    setText('attendanceActionMessage', 'Select the current month to manage today’s attendance.');

    closeMoreMenu();
  }

  /* ==========================================================
     CHARACTER COUNT
  ========================================================== */

  function updateRegularizationCharacterCount() {
    const textarea = document.getElementById('regularizationReason');

    if (!textarea) {
      return;
    }

    setText('regularizationReasonCount', textarea.value.length);
  }

  /* ==========================================================
     BREAK HELPERS
  ========================================================== */

  function getBreakHistoryMinutes(history) {
    if (!Array.isArray(history)) {
      return 0;
    }

    return history.reduce((total, item) => {
      const stored = Number(item?.durationMinutes);

      if (Number.isFinite(stored)) {
        return total + Math.max(0, stored);
      }

      const start = getRecordDate(item?.startTime);

      const end = getRecordDate(item?.endTime);

      if (!start || !end) {
        return total;
      }

      const minutes = Math.round((end.getTime() - start.getTime()) / 60000);

      return total + Math.max(0, minutes);
    }, 0);
  }

  /* ==========================================================
     STATUS
  ========================================================== */

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

  /* ==========================================================
     DATE / TIME
  ========================================================== */

  function formatDate(value) {
    const date = getRecordDate(value);

    if (!date || Number.isNaN(date.getTime())) {
      return '--';
    }

    return formatIndiaDate(date, {
      weekday: 'short',
      day: '2-digit',
      month: 'short',
      year: 'numeric',
    });
  }

  function formatTimeInput(date) {
    if (!date || Number.isNaN(date.getTime())) {
      return '';
    }

    const hours = String(date.getHours()).padStart(2, '0');

    const minutes = String(date.getMinutes()).padStart(2, '0');

    return `${hours}:${minutes}`;
  }

  function formatTime(value) {
    const date = getRecordDate(value);

    if (!date || Number.isNaN(date.getTime())) {
      return '--';
    }

    return new Intl.DateTimeFormat('en-IN', {
      timeZone: INDIA_TIME_ZONE,

      hour: '2-digit',

      minute: '2-digit',

      hour12: true,
    }).format(date);
  }

  function formatMinutes(minutes) {
    const value = Number(minutes);

    if (!Number.isFinite(value)) {
      return '--';
    }

    const safeMinutes = Math.max(0, Math.round(value));

    const hours = Math.floor(safeMinutes / 60);

    const mins = safeMinutes % 60;

    if (hours === 0) {
      return `${mins}m`;
    }

    return `${hours}h ${mins}m`;
  }

  function formatHourMinute(hour, minute) {
    if (hour == null || minute == null) {
      return '--';
    }

    const date = new Date();

    date.setHours(Number(hour), Number(minute), 0, 0);

    return new Intl.DateTimeFormat('en-IN', {
      timeZone: INDIA_TIME_ZONE,

      hour: '2-digit',

      minute: '2-digit',

      hour12: true,
    }).format(date);
  }

  function formatIndiaDate(date, options = {}) {
    return new Intl.DateTimeFormat('en-IN', {
      timeZone: INDIA_TIME_ZONE,

      ...options,
    }).format(date);
  }

  /* ==========================================================
     FIRESTORE DATE
  ========================================================== */

  function getRecordDate(value) {
    if (!value) {
      return null;
    }

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

    return new Intl.DateTimeFormat('en-CA', {
      timeZone: INDIA_TIME_ZONE,

      year: 'numeric',

      month: '2-digit',

      day: '2-digit',
    }).format(date);
  }

  function normalizeDateOnly(value) {
    if (!value) {
      return '';
    }

    if (typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value)) {
      return value;
    }

    return getRecordDateKey(value);
  }

  function getTodayKey() {
    return getRecordDateKey(new Date());
  }

  function isCurrentMonth(year, month) {
    const todayKey = getTodayKey();

    const [currentYear, currentMonth] = todayKey.split('-').map(Number);

    return currentYear === Number(year) && currentMonth === Number(month);
  }

  function setCurrentMonth() {
    const todayKey = getTodayKey();

    const [year, month] = todayKey.split('-');

    const input = document.getElementById('myAttendanceMonth');

    if (input) {
      input.value = `${year}-${month}`;
    }
  }

  /* ==========================================================
     INDIA DATE/TIME
  ========================================================== */

  function indiaDateToIso(dateKey) {
    if (!dateKey || !/^\d{4}-\d{2}-\d{2}$/.test(dateKey)) {
      return null;
    }

    return new Date(`${dateKey}T00:00:00+05:30`).toISOString();
  }

  function indiaLocalDateTimeToIso(value) {
    if (!value) {
      return null;
    }

    const match = /^(\d{4}-\d{2}-\d{2})T(\d{2}):(\d{2})$/.exec(value);

    if (!match) {
      return null;
    }

    const date = new Date(`${match[1]}T${match[2]}:${match[3]}:00+05:30`);

    if (Number.isNaN(date.getTime())) {
      return null;
    }

    return date.toISOString();
  }

  function parseIndiaDatetimeLocal(value) {
    if (!value) {
      return null;
    }

    const iso = indiaLocalDateTimeToIso(value);

    if (!iso) {
      return null;
    }

    return new Date(iso);
  }

  function combineAttendanceDateAndTime(dateKey, timeValue) {
    if (!dateKey || !timeValue) {
      return null;
    }

    if (!/^\d{4}-\d{2}-\d{2}$/.test(dateKey)) {
      return null;
    }

    if (!/^\d{2}:\d{2}$/.test(timeValue)) {
      return null;
    }

    return `${dateKey}T${timeValue}`;
  }

  /* ==========================================================
     UI
  ========================================================== */

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

    if (loading) {
      button.innerHTML = `
        <span
          class="spinner-border spinner-border-sm"
          role="status"
          aria-hidden="true"
        ></span>

        <span>
          ${escapeHtml(label)}
        </span>
      `;

      return;
    }

    const iconMap = {
      attendanceCheckInBtn: 'bi-box-arrow-in-right',

      attendanceStartBreakBtn: 'bi-pause-circle',

      attendanceEndBreakBtn: 'bi-play-circle',
    };

    const icon = iconMap[id] || 'bi-check-circle';

    button.innerHTML = `
      <i class="bi ${icon}"></i>

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

    const month = document.getElementById('myAttendanceMonth');

    if (month) {
      month.disabled = false;
    }
  }

  /* ==========================================================
     API ERROR
  ========================================================== */

  function getApiErrorMessage(error, fallback) {
    const message = error?.response?.message;

    if (Array.isArray(message)) {
      return message.join(', ');
    }

    if (typeof message === 'string') {
      return message;
    }

    if (Array.isArray(error?.message)) {
      return error.message.join(', ');
    }

    if (typeof error?.message === 'string') {
      return error.message;
    }

    return fallback;
  }

  /* ==========================================================
     ESCAPE
  ========================================================== */

  function escapeHtml(value) {
    return String(value ?? '')
      .replaceAll('&', '&amp;')
      .replaceAll('<', '&lt;')
      .replaceAll('>', '&gt;')
      .replaceAll('"', '&quot;')
      .replaceAll("'", '&#039;');
  }

  function escapeJs(value) {
    return String(value ?? '')
      .replaceAll('\\', '\\\\')
      .replaceAll("'", "\\'")
      .replaceAll('"', '\\"')
      .replaceAll('\n', '\\n')
      .replaceAll('\r', '\\r');
  }
})();
