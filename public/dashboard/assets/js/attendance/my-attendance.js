(function () {
  'use strict';

  /* ==========================================================
     TeamoTrack • My Attendance
  ========================================================== */

  /* ========================================================
     STATE
  ======================================================== */

  let records = [];

  let summary = {};

  let isLoading = false;

  let todayAttendance = null;

  let undoCountdownTimer = null;

  let actionInProgress = false;

  let regularizationRequests = [];

  /*
   * This is the attendance row currently being
   * regularized.
   *
   * IMPORTANT:
   * The date is always derived from this record.
   * The employee never chooses the date manually.
   */
  let selectedRegularizationRecord = null;

  let regularizationModal = null;

  /* ========================================================
     CONSTANTS
  ======================================================== */

  const INDIA_TIME_ZONE = 'Asia/Kolkata';

  const REGULARIZATION_TYPES = {
    MISSED_CHECK_IN: 'MISSED_CHECK_IN',
    MISSED_CHECK_OUT: 'MISSED_CHECK_OUT',
    MISSED_BOTH: 'MISSED_BOTH',

    WRONG_CHECK_IN: 'WRONG_CHECK_IN',
    WRONG_CHECK_OUT: 'WRONG_CHECK_OUT',
    WRONG_BOTH: 'WRONG_BOTH',

    SYSTEM_ERROR: 'SYSTEM_ERROR',
    LOCATION_ERROR: 'LOCATION_ERROR',
    OTHER: 'OTHER',
  };

  /* ========================================================
     INITIALIZE
  ======================================================== */

  window.initializeMyAttendancePage = async function () {
    setCurrentMonth();

    bindEvents();

    renderTodayDate();

    initializeRegularizationModal();

    await loadAttendance();
  };

  /* ========================================================
     EVENTS
  ======================================================== */

  function bindEvents() {
    document.getElementById('attendanceCheckInBtn')?.addEventListener('click', handleCheckIn);

    document.getElementById('attendanceCheckOutBtn')?.addEventListener('click', handleCheckOut);

    document.getElementById('attendanceUndoCheckoutBtn')?.addEventListener('click', handleUndoCheckout);

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
  }

  /* ========================================================
     REGULARIZATION MODAL
  ======================================================== */

  function initializeRegularizationModal() {
    const element = document.getElementById('attendanceRegularizationModal');

    if (!element) {
      return;
    }

    if (typeof bootstrap === 'undefined') {
      console.warn('Bootstrap is not available. Regularization modal cannot initialize.');

      return;
    }

    regularizationModal = bootstrap.Modal.getOrCreateInstance(element);

    /*
     * When the Bootstrap modal closes,
     * clear the selected attendance record.
     */
    element.addEventListener('hidden.bs.modal', function () {
      selectedRegularizationRecord = null;

      resetRegularizationForm();
    });
  }

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
       * Load regularization requests
       * for exactly the same month.
       */
      await loadRegularizationRequests(month, year);

      renderSummary(summary);

      renderRecords();

      if (!options.silent) {
        AppAlert.close();
      }

      if (isCurrentMonth(year, month)) {
        const todayKey = getTodayKey();

        todayAttendance = records.find((record) => getRecordDateKey(record.date) === todayKey) || null;

        renderTodayAttendance();
      } else {
        todayAttendance = null;

        renderTodayUnavailable();
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

  /* ========================================================
     LOAD REGULARIZATION REQUESTS
  ======================================================== */

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

      /*
       * Attendance page must remain usable
       * even if regularization loading fails.
       */
      regularizationRequests = [];
    }
  }

  /* ========================================================
     FIND REGULARIZATION FOR DATE
  ======================================================== */

  function getRegularizationForDate(attendanceDate) {
    const dateKey = normalizeDateOnly(attendanceDate);

    if (!dateKey) {
      return null;
    }

    const matching = regularizationRequests.filter((request) => normalizeDateOnly(request.date) === dateKey);

    if (!matching.length) {
      return null;
    }

    /*
     * Pending / approved takes priority.
     */
    const active = matching.find((request) =>
      ['pending', 'approved'].includes(String(request.status || '').toLowerCase())
    );

    return active || matching[matching.length - 1];
  }

  /* ========================================================
     OPEN REGULARIZATION
  ======================================================== */

  function openRegularization(record) {
    if (!record) {
      return;
    }

    /*
     * The clicked attendance record is
     * the source of truth.
     */
    const existingRequest = getRegularizationForDate(record.date);

    const existingStatus = String(existingRequest?.status || '').toLowerCase();

    /*
     * Pending and approved requests cannot
     * be submitted again.
     */
    if (existingRequest && ['pending', 'approved'].includes(existingStatus)) {
      AppAlert.error(
        existingStatus === 'approved'
          ? 'This attendance has already been regularized.'
          : 'A regularization request is already pending for this date.'
      );

      return;
    }

    /*
     * Store the complete clicked attendance
     * record.
     */
    selectedRegularizationRecord = record;

    /*
     * Date is DISPLAY ONLY.
     *
     * There is intentionally no date input.
     */
    setText('regularizationDateLabel', formatDate(record.date));

    /*
     * Show current attendance values.
     */
    setText('regularizationCurrentCheckIn', formatTime(record.checkInTime));

    setText('regularizationCurrentCheckOut', formatTime(record.checkOutTime));

    setText('regularizationCurrentWorking', formatMinutes(record.workingMinutes));

    setText('regularizationCurrentStatus', formatStatus(record.status));

    resetRegularizationForm();

    /*
     * resetRegularizationForm clears the form,
     * so restore the date label afterward.
     */
    setText('regularizationDateLabel', formatDate(record.date));

    /*
     * Apply type-specific field rules.
     */
    handleRegularizationTypeChange();

    if (!regularizationModal) {
      initializeRegularizationModal();
    }

    regularizationModal?.show();
  }

  /* ========================================================
     RESET REGULARIZATION FORM
  ======================================================== */

  function resetRegularizationForm() {
    const type = document.getElementById('regularizationType');

    const checkIn = document.getElementById('regularizationCheckIn');

    const checkOut = document.getElementById('regularizationCheckOut');

    const reason = document.getElementById('regularizationReason');

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

  /* ========================================================
     REGULARIZATION TYPE
  ======================================================== */

  function handleRegularizationTypeChange() {
    const type = document.getElementById('regularizationType')?.value;

    const checkIn = document.getElementById('regularizationCheckIn');

    const checkOut = document.getElementById('regularizationCheckOut');

    /*
     * Reset first.
     */
    if (checkIn) {
      checkIn.disabled = false;
      checkIn.required = false;
    }

    if (checkOut) {
      checkOut.disabled = false;
      checkOut.required = false;
    }

    if (!type) {
      return;
    }

    /*
     * MISSED_CHECK_IN
     * WRONG_CHECK_IN
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
     * MISSED_CHECK_OUT
     * WRONG_CHECK_OUT
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
     * MISSED_BOTH
     * WRONG_BOTH
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
     * SYSTEM_ERROR
     * LOCATION_ERROR
     * OTHER
     *
     * Backend allows one or both values
     * for these types.
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

  /* ========================================================
     SUBMIT REGULARIZATION
  ======================================================== */

  async function handleSubmitRegularization() {
    /*
     * There MUST be a selected attendance record.
     */
    if (!selectedRegularizationRecord) {
      AppAlert.error('Attendance record not found.');

      return;
    }

    /*
     * IMPORTANT:
     *
     * Date comes ONLY from the attendance
     * record whose Regularize button was clicked.
     *
     * The user cannot change it.
     */
    const date = normalizeDateOnly(selectedRegularizationRecord.date);

    const type = document.getElementById('regularizationType')?.value;

    const checkIn = document.getElementById('regularizationCheckIn')?.value;

    const checkOut = document.getElementById('regularizationCheckOut')?.value;

    const reason = document.getElementById('regularizationReason')?.value?.trim();

    /* ======================================================
       BASIC VALIDATION
    ====================================================== */

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

    if (reason.length > 500) {
      AppAlert.error('Reason cannot exceed 500 characters.');

      return;
    }

    /* ======================================================
       TYPE-SPECIFIC VALIDATION
    ====================================================== */

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
     * For SYSTEM_ERROR / LOCATION_ERROR /
     * OTHER, both times are optional.
     *
     * However, at least one correction
     * must be supplied.
     */
    if (!requiresCheckIn && !requiresCheckOut && !checkIn && !checkOut) {
      AppAlert.error('Please provide at least one attendance time to correct.');

      return;
    }

    /* ======================================================
       DATE VALIDATION
    ====================================================== */

    /*
     * Any entered time MUST belong to the
     * attendance date that was clicked.
     */
    const checkInDateTime = combineAttendanceDateAndTime(date, checkIn);
    const checkOutDateTime = combineAttendanceDateAndTime(date, checkOut);

    /* ======================================================
       CHECK-IN / CHECK-OUT ORDER
    ====================================================== */

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

    /* ======================================================
       DUPLICATE ACTIVE REQUEST
    ====================================================== */

    const existingRequest = getRegularizationForDate(selectedRegularizationRecord.date);

    if (existingRequest && ['pending', 'approved'].includes(String(existingRequest.status || '').toLowerCase())) {
      AppAlert.error('A regularization request already exists for this date.');

      return;
    }

    /* ======================================================
       PAYLOAD
    ====================================================== */

    /*
     * Backend DTO expects:
     *
     * date
     * type
     * checkInTime
     * checkOutTime
     * reason
     *
     * The date is derived from the clicked
     * attendance record.
     */
    const payload = {
      date: indiaDateToIso(date),

      type,

      checkInTime: checkInDateTime ? indiaLocalDateTimeToIso(checkInDateTime) : null,

      checkOutTime: checkOutDateTime ? indiaLocalDateTimeToIso(checkOutDateTime) : null,

      reason,
    };

    /* ======================================================
       SUBMIT
    ====================================================== */

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

      /*
       * Reload regularization requests
       * and attendance records.
       */
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

      if (data) {
        updateTodayFromApiResponse(data);

        AppAlert.success(data.message || 'Checkout cancelled successfully.');
      }

      await loadAttendance({
        force: true,
        silent: true,
      });
    } catch (error) {
      console.error('Undo checkout failed:', error);

      AppAlert.error(getApiErrorMessage(error, 'Unable to undo checkout'));

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
     UPDATE TODAY
  ======================================================== */

  function updateTodayFromApiResponse(data) {
    if (!data) {
      return;
    }

    const record =
      data.record ||
      data.attendance ||
      data.checkInTime !== undefined ||
      data.checkOutTime !== undefined ||
      data.status !== undefined
        ? data
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

  /* ========================================================
     TODAY
  ======================================================== */

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
    stopUndoCountdown();

    const record = todayAttendance;

    const checkInBtn = document.getElementById('attendanceCheckInBtn');

    const checkOutBtn = document.getElementById('attendanceCheckOutBtn');

    const undoBtn = document.getElementById('attendanceUndoCheckoutBtn');

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

    renderShift(record.shiftSnapshot);

    const hasCheckIn = !!record.checkInTime;

    const hasCheckOut = !!record.checkOutTime;

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

    if (checkInBtn) {
      checkInBtn.disabled = hasCheckIn || isTerminalNonAttendanceStatus(record.status);

      checkInBtn.hidden = hasCheckIn;
    }

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

    if (hasCheckIn && hasCheckOut) {
      if (checkOutBtn) {
        checkOutBtn.disabled = true;
        checkOutBtn.hidden = true;
      }

      const undoUntil = getRecordDate(record.checkoutUndoUntil);

      if (undoUntil && Date.now() < undoUntil.getTime()) {
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

      if (undoBtn) {
        undoBtn.hidden = true;
      }

      showCorrectionNote(
        'Checkout correction is now locked. Please contact your manager or HR if the checkout time is incorrect.'
      );

      setText('attendanceActionMessage', "Today's attendance has been completed.");

      return;
    }

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
          ${escapeHtml(formatTime(record.checkOutTime))}
        </td>

        <td>
          <strong>
            ${escapeHtml(formatMinutes(record.workingMinutes))}
          </strong>
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

  /* ========================================================
     REGULARIZATION ACTION
  ======================================================== */

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

  /* ========================================================
     GLOBAL REGULARIZATION HANDLER
  ======================================================== */

  window.openAttendanceRegularization = function (recordId) {
    const record = records.find((item) => String(item.id) === String(recordId));

    if (!record) {
      AppAlert.error('Attendance record not found.');

      return;
    }

    openRegularization(record);
  };

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
      <span
        class="my-attendance-badge ${className}"
      >
        ${escapeHtml(label)}
      </span>
    `;
  }

  /* ========================================================
     PUNCTUALITY
  ======================================================== */

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

      setText('attendanceUndoCountdown', `${minutes}:${String(seconds).padStart(2, '0')}`);
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
     CHARACTER COUNT
  ======================================================== */

  function updateRegularizationCharacterCount() {
    const textarea = document.getElementById('regularizationReason');

    if (!textarea) {
      return;
    }

    setText('regularizationReasonCount', textarea.value.length);
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
     DATE / TIME DISPLAY
  ======================================================== */

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

  /* ========================================================
     FIRESTORE / API DATE PARSING
  ======================================================== */

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

  /* ========================================================
     INDIA DATE/TIME CONVERSION
  ======================================================== */

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

  function getIndiaDateKeyFromDatetimeLocal(value) {
    if (!value) {
      return '';
    }

    const match = /^(\d{4}-\d{2}-\d{2})T/.exec(value);

    return match ? match[1] : '';
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

      attendanceCheckOutBtn: 'bi-box-arrow-right',

      attendanceUndoCheckoutBtn: 'bi-arrow-counterclockwise',
    };

    if (id === 'attendanceUndoCheckoutBtn') {
      button.innerHTML = `
        <i
          class="bi ${iconMap[id]}"
        ></i>

        <span>
          Undo Checkout
        </span>

        <small
          id="attendanceUndoCountdown"
        ></small>
      `;

      return;
    }

    button.innerHTML = `
      <i
        class="bi ${iconMap[id]}"
      ></i>

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

  /* ========================================================
     API ERROR
  ======================================================== */

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

  /* ========================================================
     ESCAPE
  ======================================================== */

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
