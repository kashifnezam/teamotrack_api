(function () {
  'use strict';

  /* ==========================================================
     TeamoTrack • My Attendance
  ========================================================== */

  let records = [];

  let summary = {};

  let isLoading = false;

  /*
   * Today's attendance record only.
   *
   * IMPORTANT:
   * This must NOT contain today's shift anymore.
   * Today's shift comes separately from `todayShift`.
   */
  let todayAttendance = null;

  /*
   * Today's applicable shift.
   *
   * This comes from:
   *
   * data.today.shift
   */
  let todayShift = null;

  /*
   * Today's selfie requirement.
   *
   * This comes from:
   *
   * data.today.selfieCheckInRequired
   */
  let todaySelfieCheckInRequired = false;

  let actionInProgress = false;

  let regularizationRequests = [];

  let selectedRegularizationRecord = null;

  let regularizationModal = null;

  let checkoutHistoryModal = null;

  let selfieCameraModal = null;

  let selfieViewModal = null;

  let selfieStream = null;

  let selfieVideo = null;

  let selfieCanvas = null;

  let selfieDetectionTimer = null;

  let selfieFaceValid = false;

  let capturedSelfieBlob = null;

  let faceModelsLoaded = false;

  let faceModelLoading = null;

  /* ==========================================================
     CONSTANTS
  ========================================================== */

  const INDIA_TIME_ZONE = 'Asia/Kolkata';

  const FACE_MODEL_URL = 'https://cdn.jsdelivr.net/npm/@vladmandic/face-api/model';

  const FACE_CHECK_INTERVAL = 250;

  const MIN_FACE_RATIO = 0.2;

  const MAX_HEAD_ANGLE = 22;

  const MIN_IMAGE_WIDTH = 500;

  const MIN_IMAGE_HEIGHT = 500;

  const MIN_BRIGHTNESS = 35;

  const MAX_BRIGHTNESS = 225;

  const MIN_CONTRAST = 18;

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

    initializeSelfieModals();

    await loadAttendance();
  };

  /* ==========================================================
     EVENTS
  ========================================================== */

  function bindEvents() {
    document.getElementById('attendanceCheckInBtn')?.addEventListener('click', handleCheckIn);

    document.getElementById('attendanceCheckOutBtn')?.addEventListener('click', handleCheckOut);

    document.getElementById('attendanceCheckoutAgainBtn')?.addEventListener('click', handleCheckOutAgain);

    document.getElementById('attendanceStartBreakBtn')?.addEventListener('click', handleStartBreak);

    document.getElementById('attendanceEndBreakBtn')?.addEventListener('click', handleEndBreak);

    document.getElementById('attendanceMoreBtn')?.addEventListener('click', toggleMoreMenu);

    document.getElementById('attendanceViewCheckoutHistoryBtn')?.addEventListener('click', openCheckoutHistory);

    document.getElementById('myAttendanceRefreshBtn')?.addEventListener('click', function () {
      loadAttendance({
        force: true,
      });
    });

    document.getElementById('myAttendanceMonth')?.addEventListener('change', function () {
      loadAttendance({
        force: true,
      });
    });

    document.getElementById('submitAttendanceRegularizationBtn')?.addEventListener('click', handleSubmitRegularization);

    document.getElementById('regularizationReason')?.addEventListener('input', updateRegularizationCharacterCount);

    document.getElementById('regularizationType')?.addEventListener('change', handleRegularizationTypeChange);
  }

  /* ==========================================================
     MONTH
  ========================================================== */

  function setCurrentMonth() {
    const input = document.getElementById('myAttendanceMonth');

    if (!input) {
      return;
    }

    const now = new Date();

    input.value = `${now.getFullYear()}-` + `${String(now.getMonth() + 1).padStart(2, '0')}`;
  }

  function isCurrentMonth(year, month) {
    const now = new Date();

    return Number(year) === now.getFullYear() && Number(month) === now.getMonth() + 1;
  }

  function getTodayKey() {
    return new Intl.DateTimeFormat('en-CA', {
      timeZone: INDIA_TIME_ZONE,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    }).format(new Date());
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

      /*
       * IMPORTANT:
       *
       * Today's shift is returned separately by backend:
       *
       * data.today = {
       *   date,
       *   shift,
       *   selfieCheckInRequired,
       *   hasShift
       * }
       *
       * Do not put this into todayAttendance.
       */
      if (isCurrentMonth(year, month)) {
        todayShift = data.today?.shift || null;

        todaySelfieCheckInRequired = data.today?.selfieCheckInRequired === true;

        const todayKey = getTodayKey();

        todayAttendance =
          records.find(function (record) {
            return getRecordDateKey(record.date) === todayKey;
          }) || null;

        renderTodayAttendance();
      } else {
        todayAttendance = null;

        todayShift = null;

        todaySelfieCheckInRequired = false;

        renderTodayUnavailable();
      }

      await loadRegularizationRequests(month, year);

      renderSummary(summary);

      renderRecords();

      /*
       * Render again after records/regularization are loaded.
       */
      if (isCurrentMonth(year, month)) {
        renderTodayAttendance();
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

    const matching = regularizationRequests.filter(function (request) {
      return normalizeDateOnly(request.date) === dateKey;
    });

    if (!matching.length) {
      return null;
    }

    const active = matching.find(function (request) {
      return ['pending', 'approved'].includes(String(request.status || '').toLowerCase());
    });

    return active || matching[matching.length - 1];
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
          >
            <i class="bi bi-pencil-square"></i>
            Regularize
          </button>
        `;
      }
    }

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
      >
        <i class="bi bi-pencil-square"></i>
        Regularize
      </button>
    `;
  }

  window.openAttendanceRegularization = function (recordId) {
    const record = records.find(function (item) {
      return String(item.id) === String(recordId);
    });

    if (!record) {
      AppAlert.error('Attendance record not found.');

      return;
    }

    openRegularization(record);
  };

  /* ==========================================================
     BREAK ISSUE
  ========================================================== */

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
     * No scheduled break means
     * there is no break issue.
     */
    if (!window) {
      return null;
    }

    const currentBreak = record.currentBreak;

    /*
     * Incomplete break.
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
     * Skipping a break is allowed.
     */
    if (!history.length) {
      return null;
    }

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
     * Wrong break window.
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
     * Excess break.
     */
    const actualMinutes = Math.max(0, Math.round((end.getTime() - start.getTime()) / 60000));

    const scheduledMinutes = Math.max(0, Math.round((window.end.getTime() - window.start.getTime()) / 60000));

    if (actualMinutes > scheduledMinutes) {
      return {
        type: 'EXCESS_BREAK',

        title: 'Excess Break',

        message: `Recorded break is ${formatMinutes(actualMinutes)} while the scheduled break is ${formatMinutes(
          scheduledMinutes
        )}.`,
      };
    }

    return null;
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
    }

    if (breakEnd) {
      breakEnd.value = '';
    }

    if (reason) {
      reason.value = '';
    }

    if (breakSection) {
      breakSection.hidden = true;
    }

    updateRegularizationCharacterCount();

    renderRegularizationBreakIssue(null);
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
     REGULARIZATION TYPE
  ========================================================== */

  function handleRegularizationTypeChange() {
    const type = document.getElementById('regularizationType')?.value;

    const checkIn = document.getElementById('regularizationCheckIn');

    const checkOut = document.getElementById('regularizationCheckOut');

    const breakSection = document.getElementById('regularizationBreakSection');

    if (breakSection) {
      breakSection.hidden = type !== REGULARIZATION_TYPES.BREAK_ERROR;
    }

    if (!type) {
      if (checkIn) {
        checkIn.disabled = false;
        checkIn.required = false;
      }

      if (checkOut) {
        checkOut.disabled = false;
        checkOut.required = false;
      }

      return;
    }

    /*
     * MISSED / WRONG CHECK-IN
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
     * MISSED / WRONG CHECK-OUT
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
     * BOTH
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
     * BREAK ERROR
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

    /*
     * SYSTEM / LOCATION / OTHER
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

  /* ==========================================================
     PREFILL BREAK
  ========================================================== */

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
     * BREAK VALIDATION
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
     * NORMAL CHECK-IN / CHECK-OUT
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
     * DUPLICATE REQUEST
     */
    const existingRequest = getRegularizationForDate(selectedRegularizationRecord.date);

    if (existingRequest && ['pending', 'approved'].includes(String(existingRequest.status || '').toLowerCase())) {
      AppAlert.error('A regularization request already exists for this date.');

      return;
    }

    const breakStartDateTime =
      type === REGULARIZATION_TYPES.BREAK_ERROR ? combineAttendanceDateAndTime(date, breakStart) : null;

    const breakEndDateTime =
      type === REGULARIZATION_TYPES.BREAK_ERROR ? combineAttendanceDateAndTime(date, breakEnd) : null;

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
     CHARACTER COUNT
  ========================================================== */

  function updateRegularizationCharacterCount() {
    const reason = document.getElementById('regularizationReason');

    const count = document.getElementById('regularizationReasonCount');

    if (!reason || !count) {
      return;
    }

    count.textContent = reason.value.length;
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

    /*
     * IMPORTANT:
     *
     * The shift is now independent
     * of the attendance record.
     *
     * This means the shift can still
     * render when `record === null`.
     */
    const shift = todayShift;

    const checkInBtn = document.getElementById('attendanceCheckInBtn');

    const checkOutBtn = document.getElementById('attendanceCheckOutBtn');

    const startBreakBtn = document.getElementById('attendanceStartBreakBtn');

    const endBreakBtn = document.getElementById('attendanceEndBreakBtn');

    const moreWrapper = document.getElementById('attendanceMoreWrapper');

    const breakInfo = document.getElementById('attendanceBreakInfo');

    const checkoutInfo = document.getElementById('attendanceCheckoutInfo');

    const progressSection = document.getElementById('attendanceWorkBreakSection');

    /*
     * ALWAYS render today's shift
     * independently from attendance.
     */
    renderShift(shift);

    /*
     * NO ATTENDANCE RECORD
     */
    if (!record) {
      setText('myAttendanceStatusText', 'NOT MARKED');

      setStatusClass('status-not-marked');

      setText('myCheckIn', '--');

      setText('myCheckOut', '--');

      setText('myCheckoutCount', '0');

      setText('myWorkingTime', '--');

      setText('myBreakTime', '0m');

      setText('myPunctuality', '--');

      if (progressSection) {
        progressSection.hidden = true;
      }

      /*
       * Check-in is possible only when
       * an applicable shift exists.
       */
      const hasShift = !!todayShift;

      const isWeeklyOff = todayShift?.isWeeklyOff === true;

      if (checkInBtn) {
        checkInBtn.hidden = !hasShift;

        checkInBtn.disabled = !hasShift || isWeeklyOff;
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

      setText('attendanceCheckoutInfoText', '');

      setText('attendanceBreakMessage', '');

      /*
       * Tell employee whether selfie
       * is required.
       */
      if (todaySelfieCheckInRequired) {
        setText(
          'attendanceActionMessage',
          'Your attendance for today has not been marked. A selfie is required for check-in.'
        );
      } else if (!hasShift) {
        setText('attendanceActionMessage', 'No applicable shift is assigned for today.');
      } else if (isWeeklyOff) {
        setText('attendanceActionMessage', 'Today is your scheduled weekly off.');
      } else {
        setText('attendanceActionMessage', 'Your attendance for today has not been marked.');
      }

      closeMoreMenu();

      return;
    }

    /*
     * From here onward the attendance
     * record exists.
     *
     * Use the historical shift snapshot
     * for already-created attendance
     * calculations such as break schedule.
     */
    const historicalShift = record.shiftSnapshot || todayShift || null;

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

    renderBreakSchedule(historicalShift);

    renderWorkBreakProgress(workingMinutes, breakMinutes);

    /*
     * STATUS
     */
    if (hasCheckIn && hasActiveBreak) {
      setText('myAttendanceStatusText', 'ON BREAK');

      setStatusClass('status-working');
    } else if (hasCheckIn && !hasCheckOut) {
      setText('myAttendanceStatusText', 'WORKING');

      setStatusClass('status-working');
    } else if (hasCheckOut) {
      setText('myAttendanceStatusText', 'COMPLETED');

      setStatusClass('status-completed');
    } else {
      setText('myAttendanceStatusText', formatStatus(record.status));

      setStatusClass(getStatusClass(record.status));
    }

    /*
     * CHECK-IN
     */
    if (checkInBtn) {
      checkInBtn.disabled = hasCheckIn || isTerminalNonAttendanceStatus(record.status);

      checkInBtn.hidden = hasCheckIn;
    }

    /*
     * START BREAK
     */
    const canStartBreak =
      hasCheckIn &&
      !hasActiveBreak &&
      !hasCompletedBreak &&
      !hasCheckOut &&
      !isTerminalNonAttendanceStatus(record.status);

    if (startBreakBtn) {
      startBreakBtn.hidden = !canStartBreak;

      startBreakBtn.disabled = !canStartBreak;
    }

    /*
     * END BREAK
     */
    if (endBreakBtn) {
      endBreakBtn.hidden = !hasCheckIn || !hasActiveBreak;

      endBreakBtn.disabled = !hasCheckIn || !hasActiveBreak;
    }

    /*
     * CHECKOUT
     */
    if (checkOutBtn) {
      checkOutBtn.hidden = !hasCheckIn || hasCheckOut || isTerminalNonAttendanceStatus(record.status);

      checkOutBtn.disabled =
        !hasCheckIn || hasActiveBreak || hasCheckOut || isTerminalNonAttendanceStatus(record.status);
    }

    if (moreWrapper) {
      moreWrapper.hidden = !hasCheckIn || !hasCheckOut || isTerminalNonAttendanceStatus(record.status);
    }

    /*
     * BREAK INFORMATION
     */
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

    /*
     * CHECKOUT INFORMATION
     */
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

    /*
     * ACTION MESSAGE
     */
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

    setText('attendanceActionMessage', 'Your attendance for today has not been marked.');
  }

  /* ==========================================================
     TODAY UNAVAILABLE
  ========================================================== */

  function renderTodayUnavailable() {
    /*
     * Clear today's separate shift
     * when viewing another month.
     */
    todayShift = null;

    todaySelfieCheckInRequired = false;

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
     SHIFT
  ========================================================== */

  function renderShift(shift) {
    if (!shift) {
      setText('attendanceShiftTime', '--');

      renderBreakSchedule(null);

      return;
    }

    const start = formatHourMinute(Number(shift.startHour), Number(shift.startMinute));

    const end = formatHourMinute(Number(shift.endHour), Number(shift.endMinute));

    setText('attendanceShiftTime', `${start} - ${end}`);

    renderBreakSchedule(shift);
  }

  function renderBreakSchedule(shift) {
    const schedule = document.getElementById('attendanceBreakSchedule');

    if (!schedule) {
      return;
    }

    const valid =
      shift &&
      shift.breakStartHour != null &&
      shift.breakStartMinute != null &&
      shift.breakEndHour != null &&
      shift.breakEndMinute != null;

    if (!valid) {
      schedule.hidden = true;

      setText('attendanceBreakScheduleTime', '--');

      return;
    }

    const start = formatHourMinute(Number(shift.breakStartHour), Number(shift.breakStartMinute));

    const end = formatHourMinute(Number(shift.breakEndHour), Number(shift.breakEndMinute));

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
            colspan="8"
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

    const sorted = [...records].sort(function (a, b) {
      return getRecordDate(b) - getRecordDate(a);
    });

    tbody.innerHTML = sorted.map(renderRecordRow).join('');
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
          ${renderSelfieCell(record)}
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
     SELFIE TABLE CELL
  ========================================================== */

  function renderSelfieCell(record) {
    const url = record?.checkInSelfieUrl;

    if (!url) {
      return `
        <span class="attendance-selfie-none">
          --
        </span>
      `;
    }

    return `
      <button
        type="button"
        class="attendance-selfie-view-btn"
        onclick="window.viewAttendanceSelfie('${escapeJs(url)}')"
        title="View check-in selfie"
      >
        <i class="bi bi-camera"></i>
        View
      </button>
    `;
  }

  /* ==========================================================
     VIEW SELFIE
  ========================================================== */

  window.viewAttendanceSelfie = function (url) {
    if (!url) {
      return;
    }

    const image = document.getElementById('attendanceSelfieViewImage');

    if (!image) {
      return;
    }

    image.src = url;

    if (!selfieViewModal) {
      initializeSelfieModals();
    }

    selfieViewModal?.show();
  };

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
     CHECK-IN
  ========================================================== */

  async function handleCheckIn() {
    if (actionInProgress) {
      return;
    }

    /*
     * IMPORTANT:
     *
     * Do NOT read:
     *
     * todayAttendance.shiftSnapshot
     *
     * because todayAttendance can be null.
     *
     * Today's shift comes from:
     *
     * todayShift
     */
    if (todaySelfieCheckInRequired) {
      await handleSelfieCheckIn();

      return;
    }

    await performCheckIn();
  }

  /* ==========================================================
     SELFIE CHECK-IN
  ========================================================== */

  async function handleSelfieCheckIn() {
    if (actionInProgress) {
      return;
    }

    try {
      actionInProgress = true;

      await openSelfieCamera();
    } catch (error) {
      console.error('Selfie camera failed:', error);

      AppAlert.error(getApiErrorMessage(error, 'Unable to open camera.'));

      actionInProgress = false;
    }
  }

  /* ==========================================================
     OPEN CAMERA
  ========================================================== */

  async function openSelfieCamera() {
    resetSelfieCameraUI();

    selfieFaceValid = false;

    capturedSelfieBlob = null;

    /*
     * Camera requires HTTPS,
     * except localhost.
     */
    if (location.protocol !== 'https:' && location.hostname !== 'localhost' && location.hostname !== '127.0.0.1') {
      showCameraError(
        'Secure Connection Required',
        'Camera access requires HTTPS. Please open TeamoTrack using a secure HTTPS connection.'
      );

      return;
    }

    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
      showCameraError('Camera Not Supported', 'This browser does not support camera access.');

      return;
    }

    try {
      await loadFaceModels();
    } catch (error) {
      console.error('Face model loading failed:', error);

      showCameraError(
        'Face Detection Unavailable',
        'The face detection component could not be loaded. Please refresh the page and try again.'
      );

      return;
    }

    try {
      selfieStream = await navigator.mediaDevices.getUserMedia({
        video: {
          facingMode: {
            ideal: 'user',
          },

          width: {
            ideal: 1280,
          },

          height: {
            ideal: 1280,
          },

          frameRate: {
            ideal: 24,
            max: 30,
          },
        },

        audio: false,
      });

      selfieVideo = document.getElementById('attendanceSelfieVideo');

      if (!selfieVideo) {
        throw new Error('Camera video element is missing.');
      }

      selfieVideo.srcObject = selfieStream;

      await selfieVideo.play();

      selfieCameraModal?.show();

      waitForVideoAndStartDetection();
    } catch (error) {
      console.error('getUserMedia failed:', error);

      stopSelfieCamera();

      if (error?.name === 'NotAllowedError') {
        showCameraError('Camera Permission Required', 'Please allow camera access in your browser and try again.');

        return;
      }

      if (error?.name === 'NotFoundError') {
        showCameraError('No Camera Found', 'No usable camera was found on this device.');

        return;
      }

      showCameraError('Camera Unavailable', 'Unable to access the camera. Please check your browser permissions.');
    }
  }

  /* ==========================================================
     FACE MODELS
  ========================================================== */

  async function loadFaceModels() {
    if (faceModelsLoaded) {
      return;
    }

    if (faceModelLoading) {
      return faceModelLoading;
    }

    if (typeof faceapi === 'undefined') {
      throw new Error('Face detection library is not loaded.');
    }

    faceModelLoading = Promise.all([
      faceapi.nets.tinyFaceDetector.loadFromUri(FACE_MODEL_URL),

      faceapi.nets.faceLandmark68Net.loadFromUri(FACE_MODEL_URL),
    ])
      .then(function () {
        faceModelsLoaded = true;
      })
      .catch(function (error) {
        faceModelLoading = null;

        throw error;
      });

    return faceModelLoading;
  }

  /* ==========================================================
     VIDEO DETECTION
  ========================================================== */

  function waitForVideoAndStartDetection() {
    if (!selfieVideo) {
      return;
    }

    if (selfieVideo.readyState >= 2) {
      startFaceDetection();

      return;
    }

    selfieVideo.addEventListener(
      'loadeddata',
      function () {
        startFaceDetection();
      },
      {
        once: true,
      }
    );
  }

  function startFaceDetection() {
    stopFaceDetection();

    selfieDetectionTimer = window.setInterval(detectFace, FACE_CHECK_INTERVAL);

    detectFace();
  }

  function stopFaceDetection() {
    if (selfieDetectionTimer) {
      window.clearInterval(selfieDetectionTimer);

      selfieDetectionTimer = null;
    }
  }

  /* ==========================================================
     FACE DETECTION
  ========================================================== */

  async function detectFace() {
    if (!selfieVideo || selfieVideo.readyState < 2) {
      return;
    }

    try {
      const detections = await faceapi.detectAllFaces(
        selfieVideo,
        new faceapi.TinyFaceDetectorOptions({
          inputSize: 320,
          scoreThreshold: 0.2,
        })
      );

      console.log('[FaceAPI] Faces detected:', detections.length);

      if (detections.length === 0) {
        setFaceValidation(false, 'No face detected. Please look at the camera.');

        return;
      }

      if (detections.length > 1) {
        setFaceValidation(false, 'Only one face should be visible.');

        return;
      }

      /*
       * Exactly one face detected.
       *
       * Do NOT check:
       * - blur
       * - brightness
       * - contrast
       * - face size
       * - face position
       * - head angle
       * - image resolution
       *
       * Laptop cameras can be poor.
       */
      setFaceValidation(true, 'Face detected. You can capture the selfie.');
    } catch (error) {
      console.error('[FaceAPI] Detection error:', error);

      setFaceValidation(false, 'Unable to detect your face. Please try again.');
    }
  }

  /* ==========================================================
     FACE ANGLES
  ========================================================== */

  function getFaceAngles(detection) {
    try {
      const landmarks = detection.landmarks;

      if (!landmarks) {
        return {
          yaw: null,
          pitch: null,
        };
      }

      const positions = landmarks.positions;

      if (!positions || positions.length < 68) {
        return {
          yaw: null,
          pitch: null,
        };
      }

      const nose = positions[30];

      const leftEye = positions[36];

      const rightEye = positions[45];

      const leftFace = positions[0];

      const rightFace = positions[16];

      const eyeCenterX = (leftEye.x + rightEye.x) / 2;

      const faceWidth = Math.max(1, rightFace.x - leftFace.x);

      const yaw = ((nose.x - eyeCenterX) / faceWidth) * 180;

      const eyeCenterY = (leftEye.y + rightEye.y) / 2;

      const chin = positions[8];

      const forehead = positions[27];

      const faceHeight = Math.max(1, chin.y - forehead.y);

      const pitch = ((nose.y - eyeCenterY) / faceHeight) * 120;

      return {
        yaw,
        pitch,
      };
    } catch (_) {
      return {
        yaw: null,
        pitch: null,
      };
    }
  }

  /* ==========================================================
     FACE VALIDATION UI
  ========================================================== */

  function setFaceValidation(valid, message) {
    selfieFaceValid = valid;

    const status = document.getElementById('attendanceFaceStatus');

    const statusDot = document.getElementById('attendanceFaceStatusDot');

    const statusText = document.getElementById('attendanceFaceStatusText');

    const guide = document.getElementById('attendanceFaceGuide');

    const capture = document.getElementById('attendanceSelfieCaptureBtn');

    if (statusText) {
      statusText.textContent = message;
    }

    if (status) {
      status.classList.toggle('valid', valid);

      status.classList.toggle('invalid', !valid);
    }

    if (guide) {
      guide.classList.toggle('valid', valid);

      guide.classList.toggle('invalid', !valid);
    }

    if (statusDot) {
      statusDot.style.background = valid ? '#22c55e' : '';
    }

    if (capture) {
      capture.disabled = !valid || !!capturedSelfieBlob;
    }
  }

  /* ==========================================================
     CAPTURE SELFIE
  ========================================================== */

  async function captureSelfie() {
    if (!selfieFaceValid) {
      setFaceValidation(false, 'Please make sure your face is visible.');

      return;
    }

    if (!selfieVideo || selfieVideo.readyState < 2) {
      return;
    }

    const canvas = document.createElement('canvas');

    canvas.width = selfieVideo.videoWidth;
    canvas.height = selfieVideo.videoHeight;

    const context = canvas.getContext('2d');

    if (!context) {
      return;
    }

    context.drawImage(selfieVideo, 0, 0, canvas.width, canvas.height);

    capturedSelfieBlob = await canvasToBlob(canvas, 'image/jpeg', 0.8);

    if (!capturedSelfieBlob) {
      AppAlert.error('Unable to capture selfie. Please try again.');

      return;
    }

    const preview = document.getElementById('attendanceSelfiePreview');

    if (preview) {
      if (preview.src && preview.src.startsWith('blob:')) {
        URL.revokeObjectURL(preview.src);
      }

      preview.src = URL.createObjectURL(capturedSelfieBlob);
    }

    document.getElementById('attendanceCameraContainer')?.setAttribute('hidden', '');

    document.getElementById('attendanceSelfiePreviewContainer')?.removeAttribute('hidden');

    document.getElementById('attendanceSelfieCaptureBtn')?.setAttribute('hidden', '');

    document.getElementById('attendanceSelfieRetakeBtn')?.removeAttribute('hidden');

    document.getElementById('attendanceSelfieUseBtn')?.removeAttribute('hidden');

    stopFaceDetection();
  }
  /* ==========================================================
     IMAGE QUALITY
  ========================================================== */

  async function validateCapturedImage(blob) {
    return new Promise(function (resolve) {
      const image = new Image();

      const url = URL.createObjectURL(blob);

      image.onload = function () {
        URL.revokeObjectURL(url);

        if (image.width < MIN_IMAGE_WIDTH || image.height < MIN_IMAGE_HEIGHT) {
          resolve({
            valid: false,

            message: 'The captured image is too small. Please use a better camera or move closer.',
          });

          return;
        }

        const canvas = document.createElement('canvas');

        const maxSize = 320;

        const scale = Math.min(1, maxSize / Math.max(image.width, image.height));

        canvas.width = Math.max(1, Math.round(image.width * scale));

        canvas.height = Math.max(1, Math.round(image.height * scale));

        const context = canvas.getContext('2d', {
          willReadFrequently: true,
        });

        if (!context) {
          resolve({
            valid: true,
          });

          return;
        }

        context.drawImage(image, 0, 0, canvas.width, canvas.height);

        const data = context.getImageData(0, 0, canvas.width, canvas.height).data;

        let brightness = 0;

        let brightnessSquared = 0;

        let pixels = 0;

        for (let i = 0; i < data.length; i += 4) {
          const r = data[i];

          const g = data[i + 1];

          const b = data[i + 2];

          const value = 0.299 * r + 0.587 * g + 0.114 * b;

          brightness += value;

          brightnessSquared += value * value;

          pixels++;
        }

        if (!pixels) {
          resolve({
            valid: true,
          });

          return;
        }

        brightness /= pixels;

        const variance = brightnessSquared / pixels - brightness * brightness;

        const contrast = Math.sqrt(Math.max(0, variance));

        if (brightness < MIN_BRIGHTNESS) {
          resolve({
            valid: false,

            message: 'The selfie is too dark. Please move to a brighter area.',
          });

          return;
        }

        if (brightness > MAX_BRIGHTNESS) {
          resolve({
            valid: false,

            message: 'The selfie is too bright. Please avoid direct strong light.',
          });

          return;
        }

        if (contrast < MIN_CONTRAST) {
          resolve({
            valid: false,

            message: 'The selfie appears blurry or low quality. Please hold the camera steady.',
          });

          return;
        }

        resolve({
          valid: true,
        });
      };

      image.onerror = function () {
        URL.revokeObjectURL(url);

        resolve({
          valid: false,

          message: 'Unable to read the captured image.',
        });
      };

      image.src = url;
    });
  }

  /* ==========================================================
     RETAKE
  ========================================================== */

  function retakeSelfie() {
    capturedSelfieBlob = null;

    const preview = document.getElementById('attendanceSelfiePreview');

    if (preview) {
      if (preview.src && preview.src.startsWith('blob:')) {
        URL.revokeObjectURL(preview.src);
      }

      preview.removeAttribute('src');
    }

    document.getElementById('attendanceSelfiePreviewContainer')?.setAttribute('hidden', '');

    document.getElementById('attendanceCameraContainer')?.removeAttribute('hidden');

    document.getElementById('attendanceSelfieRetakeBtn')?.setAttribute('hidden', '');

    document.getElementById('attendanceSelfieUseBtn')?.setAttribute('hidden', '');

    const capture = document.getElementById('attendanceSelfieCaptureBtn');

    if (capture) {
      capture.removeAttribute('hidden');

      capture.disabled = !selfieFaceValid;
    }

    if (selfieVideo) {
      selfieVideo.style.display = 'block';
    }

    startFaceDetection();
  }

  /* ==========================================================
     USE CAPTURED SELFIE
  ========================================================== */

  async function useCapturedSelfie() {
    if (!capturedSelfieBlob) {
      return;
    }

    const blob = capturedSelfieBlob;

    closeSelfieCamera();

    try {
      await performCheckIn(blob);
    } finally {
      capturedSelfieBlob = null;

      actionInProgress = false;
    }
  }

  /* ==========================================================
     CLOSE CAMERA
  ========================================================== */

  function closeSelfieCamera() {
    stopFaceDetection();

    stopSelfieCamera();

    selfieCameraModal?.hide();
  }

  /* ==========================================================
     STOP CAMERA
  ========================================================== */

  function stopSelfieCamera() {
    stopFaceDetection();

    if (selfieStream) {
      selfieStream.getTracks().forEach(function (track) {
        track.stop();
      });

      selfieStream = null;
    }

    if (selfieVideo) {
      selfieVideo.pause();

      selfieVideo.srcObject = null;
    }

    selfieVideo = null;

    selfieFaceValid = false;
  }

  /* ==========================================================
     RESET SELFIE UI
  ========================================================== */

  function resetSelfieCameraUI() {
    capturedSelfieBlob = null;

    const cameraContainer = document.getElementById('attendanceCameraContainer');

    const previewContainer = document.getElementById('attendanceSelfiePreviewContainer');

    const error = document.getElementById('attendanceCameraError');

    const instructions = document.getElementById('attendanceSelfieInstructions');

    cameraContainer?.removeAttribute('hidden');

    previewContainer?.setAttribute('hidden', '');

    error?.setAttribute('hidden', '');

    instructions?.removeAttribute('hidden');

    document.getElementById('attendanceSelfieCaptureBtn')?.removeAttribute('hidden');

    document.getElementById('attendanceSelfieRetakeBtn')?.setAttribute('hidden', '');

    document.getElementById('attendanceSelfieUseBtn')?.setAttribute('hidden', '');

    const status = document.getElementById('attendanceFaceStatus');

    status?.classList.remove('valid', 'invalid');

    setText('attendanceFaceStatusText', 'Looking for your face...');

    const guide = document.getElementById('attendanceFaceGuide');

    guide?.classList.remove('valid', 'invalid');

    const capture = document.getElementById('attendanceSelfieCaptureBtn');

    if (capture) {
      capture.disabled = true;
    }
  }

  /* ==========================================================
     CAMERA ERROR
  ========================================================== */

  function showCameraError(title, message) {
    const camera = document.getElementById('attendanceCameraContainer');

    const instructions = document.getElementById('attendanceSelfieInstructions');

    const error = document.getElementById('attendanceCameraError');

    camera?.setAttribute('hidden', '');

    instructions?.setAttribute('hidden', '');

    error?.removeAttribute('hidden');

    setText('attendanceCameraErrorTitle', title);

    setText('attendanceCameraErrorMessage', message);

    const settingsButton = document.getElementById('attendanceCameraSettingsBtn');

    if (message.toLowerCase().includes('allow camera')) {
      settingsButton?.removeAttribute('hidden');
    } else {
      settingsButton?.setAttribute('hidden', '');
    }
  }

  /* ==========================================================
     NORMAL CHECK-IN
  ========================================================== */

  async function performCheckIn(selfieBlob = null) {
    if (actionInProgress && !selfieBlob) {
      return;
    }

    try {
      actionInProgress = true;

      const location = await getCurrentLocation();

      setActionLoading('attendanceCheckInBtn', true, selfieBlob ? 'Uploading selfie...' : 'Checking in...');

      const payload = {};

      if (location) {
        payload.lat = location.lat;

        payload.lng = location.lng;
      }

      /*
       * IMPORTANT:
       *
       * The selfie requirement comes
       * from the separately returned
       * today's shift.
       */
      const requiresSelfie = todaySelfieCheckInRequired;

      /*
       * Selfie is sent to backend as
       * multipart/form-data.
       *
       * Backend will:
       * 1. Validate the current shift.
       * 2. Validate selfie requirement.
       * 3. Compress the image.
       * 4. Upload it to Firebase Storage.
       * 5. Save checkInSelfieUrl.
       */
      if (requiresSelfie && !selfieBlob) {
        throw new Error('A selfie is required for check-in.');
      }

      let data;

      if (requiresSelfie && selfieBlob) {
        setActionLoading('attendanceCheckInBtn', true, 'Uploading selfie...');

        data = await postAttendanceCheckIn(payload, selfieBlob);
      } else {
        setActionLoading('attendanceCheckInBtn', true, 'Checking in...');

        data = await Api.post('/attendance/check-in', payload);
      }

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

      renderTodayAttendance();
    }
  }

  /* ==========================================================
     BACKEND SELFIE CHECK-IN
  ========================================================== */

  async function postAttendanceCheckIn(payload, selfieBlob) {
    /*
     * Preferred:
     *
     * Add `Api.postMultipart()` to your
     * existing API helper.
     *
     * This branch allows the existing
     * helper to remain the central
     * authentication mechanism.
     */
    if (typeof Api.postMultipart === 'function') {
      const formData = new FormData();

      if (payload.lat != null) {
        formData.append('lat', String(payload.lat));
      }

      if (payload.lng != null) {
        formData.append('lng', String(payload.lng));
      }

      formData.append('selfie', selfieBlob, 'attendance-selfie.jpg');

      return await Api.postMultipart('/attendance/check-in', formData);
    }

    /*
     * If your Api helper exposes
     * a generic FormData method under
     * another name, use that method
     * instead.
     *
     * This fallback uses the same
     * configured API base URL when
     * `Api.baseUrl` is available.
     */
    if (typeof Api.postFormData === 'function') {
      const formData = new FormData();

      if (payload.lat != null) {
        formData.append('lat', String(payload.lat));
      }

      if (payload.lng != null) {
        formData.append('lng', String(payload.lng));
      }

      formData.append('selfie', selfieBlob, 'attendance-selfie.jpg');

      return await Api.postFormData('/attendance/check-in', formData);
    }

    /*
     * IMPORTANT:
     *
     * Do not fall back to Firebase
     * Storage here.
     *
     * The requested architecture is:
     *
     * Browser
     *   ↓
     * NestJS multipart
     *   ↓
     * Sharp compression
     *   ↓
     * Firebase Storage
     *   ↓
     * Firestore
     *
     * Therefore the Api helper must
     * support multipart/form-data.
     */
    throw new Error('Api.postMultipart() or Api.postFormData() is required for selfie check-in.');
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

      renderTodayAttendance();
    }
  }

  /* ==========================================================
     CHECK OUT AGAIN
  ========================================================== */

  async function handleCheckOutAgain() {
    if (actionInProgress) {
      return;
    }

    closeMoreMenu();

    try {
      actionInProgress = true;

      const location = await getCurrentLocation();

      if (typeof AppAlert.confirm === 'function') {
        const confirmed = await AppAlert.confirm('Check out again?', 'This will record another checkout for today.');

        if (!confirmed) {
          actionInProgress = false;

          return;
        }
      }

      const payload = {};

      if (location) {
        payload.lat = location.lat;

        payload.lng = location.lng;
      }

      setActionLoading('attendanceCheckoutAgainBtn', true, 'Checking out...');

      const data = await Api.post('/attendance/check-out-again', payload);

      if (data) {
        updateTodayFromApiResponse(data);

        AppAlert.success(data.message || 'Checkout recorded successfully.');
      }

      await loadAttendance({
        force: true,

        silent: true,
      });
    } catch (error) {
      console.error('Check-out again failed:', error);

      AppAlert.error(getApiErrorMessage(error, 'Unable to check out again'));
    } finally {
      actionInProgress = false;

      setActionLoading('attendanceCheckoutAgainBtn', false, 'Check Out Again');

      renderTodayAttendance();
    }
  }

  /* ==========================================================
     CHECKOUT LOADING
  ========================================================== */

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

      renderTodayAttendance();
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

      renderTodayAttendance();
    }
  }

  /* ==========================================================
     CHECKOUT HISTORY
  ========================================================== */

  function initializeCheckoutHistoryModal() {
    const element = document.getElementById('attendanceCheckoutHistoryModal');

    if (!element || typeof bootstrap === 'undefined') {
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
      .map(function (item, index) {
        const time = item.checkOutTime || item.recordedAt || null;

        return `
              <div
                class="attendance-checkout-history-item"
              >

                <div
                  class="attendance-checkout-history-index"
                >
                  ${history.length - index}
                </div>

                <div
                  class="attendance-checkout-history-main"
                >

                  <strong>
                    ${escapeHtml(formatTime(time))}
                  </strong>

                  <span>
                    ${escapeHtml(formatMinutes(item.workingMinutes))} working time
                  </span>

                </div>

                <div
                  class="attendance-checkout-history-status"
                >
                  ${item.action === 'checkout_cancelled' ? 'Cancelled' : 'Checkout'}
                </div>

              </div>
            `;
      })
      .join('');

    checkoutHistoryModal?.show();
  }

  /* ==========================================================
     UPDATE TODAY FROM API
  ========================================================== */

  function updateTodayFromApiResponse(data) {
    if (!data) {
      return;
    }

    /*
     * IMPORTANT:
     *
     * API action responses contain
     * attendance record data.
     *
     * They must NOT replace todayShift.
     */
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

    const todayKey = getTodayKey();

    const index = records.findIndex(function (item) {
      return getRecordDateKey(item.date) === todayKey;
    });

    if (index >= 0) {
      records[index] = {
        ...records[index],
        ...record,
      };
    } else {
      records.push(record);
    }

    renderTodayAttendance();

    renderRecords();
  }

  /* ==========================================================
     MORE MENU
  ========================================================== */

  function toggleMoreMenu() {
    const menu = document.getElementById('attendanceMoreMenu');

    if (!menu) {
      return;
    }

    menu.hidden = !menu.hidden;
  }

  function closeMoreMenu() {
    const menu = document.getElementById('attendanceMoreMenu');

    if (menu) {
      menu.hidden = true;
    }
  }

  /* ==========================================================
     SELFIE MODALS
  ========================================================== */

  function initializeSelfieModals() {
    if (typeof bootstrap === 'undefined') {
      return;
    }

    const cameraElement = document.getElementById('attendanceSelfieCameraModal');

    if (cameraElement) {
      selfieCameraModal = bootstrap.Modal.getOrCreateInstance(cameraElement);
    }

    const viewElement = document.getElementById('attendanceSelfieViewModal');

    if (viewElement) {
      selfieViewModal = bootstrap.Modal.getOrCreateInstance(viewElement);
    }

    document.getElementById('attendanceSelfieCancelBtn')?.addEventListener('click', closeSelfieCamera);

    document.getElementById('attendanceSelfieCloseBtn')?.addEventListener('click', closeSelfieCamera);

    document.getElementById('attendanceSelfieCaptureBtn')?.addEventListener('click', captureSelfie);

    document.getElementById('attendanceSelfieRetakeBtn')?.addEventListener('click', retakeSelfie);

    document.getElementById('attendanceSelfieUseBtn')?.addEventListener('click', useCapturedSelfie);

    document.getElementById('attendanceSelfieViewModal')?.addEventListener('hidden.bs.modal', function () {
      const image = document.getElementById('attendanceSelfieViewImage');

      if (image) {
        image.removeAttribute('src');
      }
    });
  }

  /* ==========================================================
     ACTION LOADING
  ========================================================== */

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

      attendanceCheckoutAgainBtn: 'bi-box-arrow-right',
    };

    const icon = iconMap[id] || 'bi-check-circle';

    button.innerHTML = `
      <i class="bi ${icon}"></i>

      <span>
        ${escapeHtml(label)}
      </span>
    `;
  }

  /* ==========================================================
     LOADING STATE
  ========================================================== */

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
     UTILITY
  ========================================================== */

  function setText(id, value) {
    if (!id) {
      return;
    }

    const element = document.getElementById(id);

    if (!element) {
      return;
    }

    element.textContent = value ?? '';
  }

  function setStatusClass(className) {
    const element = document.getElementById('myAttendanceStatus');

    if (!element) {
      return;
    }

    element.classList.remove(
      'status-not-marked',
      'status-working',
      'status-completed',
      'status-present',
      'status-half-day',
      'status-leave',
      'status-absent',
      'status-weekly-off',
      'status-holiday'
    );

    if (className) {
      element.classList.add(className);
    }
  }

  function getStatusClass(status) {
    switch (String(status || '').toLowerCase()) {
      case 'leave':
        return 'status-leave';

      case 'absent':
        return 'status-absent';

      case 'weekly_off':
        return 'status-weekly-off';

      case 'holiday':
        return 'status-holiday';

      case 'present':
        return 'status-present';

      default:
        return 'status-not-marked';
    }
  }

  function isTerminalNonAttendanceStatus(status) {
    return ['leave', 'absent', 'weekly_off', 'holiday'].includes(String(status || '').toLowerCase());
  }

  function getApiErrorMessage(error, fallback) {
    if (error?.response?.data?.message) {
      return Array.isArray(error.response.data.message)
        ? error.response.data.message.join(', ')
        : error.response.data.message;
    }

    if (error?.data?.message) {
      return Array.isArray(error.data.message) ? error.data.message.join(', ') : error.data.message;
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

  function escapeJs(value) {
    return String(value ?? '')
      .replaceAll('\\', '\\\\')
      .replaceAll("'", "\\'")
      .replaceAll('\n', '\\n')
      .replaceAll('\r', '\\r');
  }

  /* ==========================================================
     DATE HELPERS
  ========================================================== */

  function normalizeDateOnly(value) {
    if (!value) {
      return null;
    }

    if (typeof value === 'string') {
      const match = value.match(/^(\d{4}-\d{2}-\d{2})/);

      if (match) {
        return match[1];
      }
    }

    const date = getRecordDate(value);

    if (!date) {
      return null;
    }

    return new Intl.DateTimeFormat('en-CA', {
      timeZone: INDIA_TIME_ZONE,

      year: 'numeric',

      month: '2-digit',

      day: '2-digit',
    }).format(date);
  }

  function getRecordDateKey(value) {
    return normalizeDateOnly(value);
  }

  function getRecordDate(value) {
    if (!value) {
      return null;
    }

    if (value instanceof Date) {
      return value;
    }

    if (typeof value?.toDate === 'function') {
      return value.toDate();
    }

    if (typeof value === 'object' && typeof value._seconds === 'number') {
      return new Date(value._seconds * 1000 + Math.floor(Number(value._nanoseconds || 0) / 1000000));
    }

    if (typeof value === 'number') {
      const date = new Date(value);

      return Number.isNaN(date.getTime()) ? null : date;
    }

    if (typeof value === 'string') {
      const date = new Date(value);

      return Number.isNaN(date.getTime()) ? null : date;
    }

    return null;
  }

  function formatDate(value) {
    const date = getRecordDate(value);

    if (!date) {
      return '--';
    }

    return new Intl.DateTimeFormat('en-IN', {
      timeZone: INDIA_TIME_ZONE,

      day: '2-digit',

      month: 'short',

      year: 'numeric',
    }).format(date);
  }

  function formatIndiaDate(value, options = {}) {
    return new Intl.DateTimeFormat('en-IN', {
      timeZone: INDIA_TIME_ZONE,

      ...options,
    }).format(value);
  }

  function formatTime(value) {
    if (value === null || value === undefined || value === '') {
      return '--';
    }

    /*
     * Support shift time values
     * when supplied as Date.
     */
    if (typeof value === 'number') {
      const date = new Date(value);

      if (!Number.isNaN(date.getTime())) {
        return new Intl.DateTimeFormat('en-IN', {
          timeZone: INDIA_TIME_ZONE,

          hour: '2-digit',

          minute: '2-digit',

          hour12: true,
        }).format(date);
      }
    }

    const date = getRecordDate(value);

    if (!date) {
      return '--';
    }

    return new Intl.DateTimeFormat('en-IN', {
      timeZone: INDIA_TIME_ZONE,

      hour: '2-digit',

      minute: '2-digit',

      hour12: true,
    }).format(date);
  }

  function formatTimeInput(value) {
    const date = getRecordDate(value);

    if (!date) {
      return '';
    }

    return new Intl.DateTimeFormat('en-GB', {
      timeZone: INDIA_TIME_ZONE,

      hour: '2-digit',

      minute: '2-digit',

      hour12: false,
    }).format(date);
  }

  function formatHourMinute(hour, minute) {
    const h = Number.isFinite(Number(hour)) ? Number(hour) : 0;

    const m = Number.isFinite(Number(minute)) ? Number(minute) : 0;

    const date = new Date();

    date.setHours(h, m, 0, 0);

    return new Intl.DateTimeFormat('en-IN', {
      hour: '2-digit',

      minute: '2-digit',

      hour12: true,
    }).format(date);
  }

  function parseIndiaDatetimeLocal(value) {
    if (!value) {
      return null;
    }

    const date = new Date(`${value}:00+05:30`);

    if (Number.isNaN(date.getTime())) {
      return null;
    }

    return date;
  }

  function combineAttendanceDateAndTime(date, time) {
    if (!date || !time) {
      return null;
    }

    return `${date}T${time}`;
  }

  function indiaDateToIso(date) {
    const parsed = parseIndiaDatetimeLocal(`${date}T00:00`);

    return parsed ? parsed.toISOString() : null;
  }

  function indiaLocalDateTimeToIso(value) {
    const parsed = parseIndiaDatetimeLocal(value);

    return parsed ? parsed.toISOString() : null;
  }

  /* ==========================================================
     STATUS
  ========================================================== */

  function formatStatus(status) {
    if (!status) {
      return '--';
    }

    return String(status)
      .replaceAll('_', ' ')
      .replace(/\b\w/g, function (char) {
        return char.toUpperCase();
      });
  }

  function formatPunctuality(punctuality) {
    if (punctuality === 'late') {
      return 'Late';
    }

    if (punctuality === 'on_time') {
      return 'On Time';
    }

    return '--';
  }

  /* ==========================================================
     MINUTES
  ========================================================== */

  function formatMinutes(totalMinutes) {
    const total = Math.max(0, Number(totalMinutes) || 0);

    const hours = Math.floor(total / 60);

    const minutes = total % 60;

    if (hours && minutes) {
      return `${hours}h ${minutes}m`;
    }

    if (hours) {
      return `${hours}h`;
    }

    return `${minutes}m`;
  }

  function getBreakHistoryMinutes(history) {
    if (!Array.isArray(history)) {
      return 0;
    }

    return history.reduce(function (total, item) {
      const duration = Number(item?.durationMinutes);

      if (Number.isFinite(duration)) {
        return total + Math.max(0, duration);
      }

      const start = getRecordDate(item?.startTime);

      const end = getRecordDate(item?.endTime);

      if (start && end) {
        return total + Math.max(0, Math.round((end.getTime() - start.getTime()) / 60000));
      }

      return total;
    }, 0);
  }

  /* ==========================================================
     SELFIE BLOB
  ========================================================== */

  function canvasToBlob(canvas, type, quality) {
    return new Promise(function (resolve) {
      canvas.toBlob(
        function (blob) {
          resolve(blob);
        },
        type,
        quality
      );
    });
  }

  /* ==========================================================
     MODAL INITIALIZATION
  ========================================================== */

  function initializeRegularizationModal() {
    const element = document.getElementById('attendanceRegularizationModal');

    if (!element || typeof bootstrap === 'undefined') {
      return;
    }

    regularizationModal = bootstrap.Modal.getOrCreateInstance(element);
  }

  /* ==========================================================
     GLOBAL INITIALIZATION HELPERS
  ========================================================== */

  window.openAttendanceSelfieCamera = handleSelfieCheckIn;

  window.closeAttendanceSelfieCamera = closeSelfieCamera;
})();
