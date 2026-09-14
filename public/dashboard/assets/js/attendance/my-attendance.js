(function () {
  'use strict';

  /* ==========================================================
     TeamoTrack • My Attendance
  ========================================================== */

  let records = [];

  let summary = {};

  let isLoading = false;

  let todayAttendance = null;

  let todayShift = null;

  let actionInProgress = false;

  let regularizationRequests = [];

  let selectedRegularizationRecord = null;

  let regularizationModal = null;

  let checkoutHistoryModal = null;

  /* ==========================================================
     CONSTANTS
  ========================================================== */

  const INDIA_TIME_ZONE = 'Asia/Kolkata';

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

    /*
     * Close three-dot menu when clicking
     * outside the attendance action area.
     */
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
       * Today's shift is independent
       * of today's attendance record.
       */
      if (isCurrentMonth(year, month)) {
        todayShift = data.today?.shift || null;

        const todayKey = getTodayKey();

        todayAttendance =
          records.find(function (record) {
            return getRecordDateKey(record.date) === todayKey;
          }) || null;

        renderTodayAttendance();
      } else {
        todayAttendance = null;

        todayShift = null;

        renderTodayUnavailable();
      }

      await loadRegularizationRequests(month, year);

      renderSummary(summary);

      renderRecords();

      /*
       * Render again because regularization
       * data has now been loaded.
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

    /*
     * New status model:
     *
     * pending
     * regularized
     * rejected
     * cancelled
     */
    const active = matching.find(function (request) {
      return ['pending', 'regularized'].includes(String(request.status || '').toLowerCase());
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
          <span class="attendance-regularization-status pending">
            <i class="bi bi-hourglass-split"></i>
            Pending
          </span>
        `;
      }

      if (status === 'regularized') {
        const attendanceStatus = request.attendanceStatus || request.finalAttendanceStatus || null;

        let label = 'Regularized';

        if (attendanceStatus === 'full_day') {
          label = 'Full Day';
        } else if (attendanceStatus === 'half_day') {
          label = 'Half Day';
        } else if (attendanceStatus === 'absent') {
          label = 'Absent';
        }

        return `
          <span class="attendance-regularization-status regularized">
            <i class="bi bi-check-circle-fill"></i>
            ${escapeHtml(label)}
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
     OPEN REGULARIZATION
  ========================================================== */

  function openRegularization(record) {
    if (!record) {
      return;
    }

    const existingRequest = getRegularizationForDate(record.date);

    const existingStatus = String(existingRequest?.status || '').toLowerCase();

    if (existingRequest && ['pending', 'regularized'].includes(existingStatus)) {
      AppAlert.error(
        existingStatus === 'regularized'
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

    setText('regularizationCurrentStatus', formatStatus(record.status));

    resetRegularizationForm();

    if (!regularizationModal) {
      initializeRegularizationModal();
    }

    regularizationModal?.show();
  }

  /* ==========================================================
     RESET REGULARIZATION FORM
  ========================================================== */

  function resetRegularizationForm() {
    const reason = document.getElementById('regularizationReason');

    const attachment = document.getElementById('regularizationAttachmentUrl');

    if (reason) {
      reason.value = '';
    }

    if (attachment) {
      attachment.value = '';
    }

    updateRegularizationCharacterCount();
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

    const reason = document.getElementById('regularizationReason')?.value?.trim();

    const attachmentUrl = document.getElementById('regularizationAttachmentUrl')?.value?.trim();

    if (!date) {
      AppAlert.error('Attendance date could not be determined.');

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

    if (attachmentUrl && attachmentUrl.length > 2000) {
      AppAlert.error('Attachment URL cannot exceed 2000 characters.');

      return;
    }

    /*
     * Duplicate protection.
     */
    const existingRequest = getRegularizationForDate(selectedRegularizationRecord.date);

    if (existingRequest && ['pending', 'regularized'].includes(String(existingRequest.status || '').toLowerCase())) {
      AppAlert.error('A regularization request already exists for this date.');

      return;
    }

    /*
     * New backend payload:
     *
     * {
     *   date,
     *   reason,
     *   attachmentUrl?
     * }
     *
     * No type.
     * No check-in time.
     * No check-out time.
     * No break times.
     */
    const payload = {
      date: indiaDateToIso(date),

      reason,

      ...(attachmentUrl
        ? {
            attachmentUrl,
          }
        : {}),
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
     * Always render shift separately.
     */
    renderShift(shift);

    /* ========================================================
       NO ATTENDANCE RECORD
    ======================================================== */

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

      const hasShift = !!todayShift;

      const isWeeklyOff = todayShift?.isWeeklyOff === true;

      /*
       * Direct check-in.
       *
       * No selfie requirement.
       */
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

      if (!hasShift) {
        setText('attendanceActionMessage', 'No applicable shift is assigned for today.');
      } else if (isWeeklyOff) {
        setText('attendanceActionMessage', 'Today is your scheduled weekly off.');
      } else {
        setText(
          'attendanceActionMessage',
          'Your attendance for today has not been marked. Click Check In to start your attendance.'
        );
      }

      closeMoreMenu();

      return;
    }

    /* ========================================================
       ATTENDANCE RECORD EXISTS
    ======================================================== */

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

    /* ========================================================
       STATUS
    ======================================================== */

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

    /* ========================================================
       CHECK-IN
    ======================================================== */

    if (checkInBtn) {
      checkInBtn.disabled = hasCheckIn || isTerminalNonAttendanceStatus(record.status);

      checkInBtn.hidden = hasCheckIn;
    }

    /* ========================================================
       START BREAK
    ======================================================== */

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

    /* ========================================================
       END BREAK
    ======================================================== */

    if (endBreakBtn) {
      endBreakBtn.hidden = !hasCheckIn || !hasActiveBreak;

      endBreakBtn.disabled = !hasCheckIn || !hasActiveBreak;
    }

    /* ========================================================
       CHECKOUT
    ======================================================== */

    if (checkOutBtn) {
      checkOutBtn.hidden = !hasCheckIn || hasCheckOut || isTerminalNonAttendanceStatus(record.status);

      checkOutBtn.disabled =
        !hasCheckIn || hasActiveBreak || hasCheckOut || isTerminalNonAttendanceStatus(record.status);
    }

    /* ========================================================
       MORE MENU
    ======================================================== */

    if (moreWrapper) {
      moreWrapper.hidden = !hasCheckIn || !hasCheckOut || isTerminalNonAttendanceStatus(record.status);
    }

    /* ========================================================
       BREAK INFORMATION
    ======================================================== */

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

    /* ========================================================
       CHECKOUT INFORMATION
    ======================================================== */

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

    /* ========================================================
       ACTION MESSAGE
    ======================================================== */

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
    todayShift = null;

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
        <span class="my-punctuality-badge neutral">
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
     * No selfie.
     *
     * Check-in is direct.
     */
    await performCheckIn();
  }

  /* ==========================================================
     NORMAL CHECK-IN
  ========================================================== */

  async function performCheckIn() {
    if (actionInProgress) {
      return;
    }

    try {
      actionInProgress = true;

      setActionLoading('attendanceCheckInBtn', true, 'Checking in...');

      /*
       * Location remains optional.
       */
      const location = await getCurrentLocation();

      const payload = {};

      if (location) {
        payload.lat = location.lat;

        payload.lng = location.lng;
      }

      /*
       * Direct JSON request.
       *
       * No FormData.
       * No selfie.
       * No camera.
       */
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

      renderTodayAttendance();
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

      setCheckoutLoading(true);

      const location = await getCurrentLocation();

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

      if (typeof AppAlert.confirm === 'function') {
        const confirmed = await AppAlert.confirm('Check out again?', 'This will record another checkout for today.');

        if (!confirmed) {
          actionInProgress = false;

          return;
        }
      }

      const location = await getCurrentLocation();

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

      setActionLoading('attendanceStartBreakBtn', true, 'Starting break...');

      const location = await getCurrentLocation();

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

      setActionLoading('attendanceEndBreakBtn', true, 'Ending break...');

      const location = await getCurrentLocation();

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
                  ${escapeHtml(formatMinutes(item.workingMinutes))}
                  working time
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

    /*
     * IMPORTANT:
     *
     * Do not replace todayShift here.
     */
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

    const button = document.getElementById('attendanceMoreBtn');

    if (button) {
      button.setAttribute('aria-expanded', String(!menu.hidden));
    }
  }

  function closeMoreMenu() {
    const menu = document.getElementById('attendanceMoreMenu');

    if (menu) {
      menu.hidden = true;
    }

    const button = document.getElementById('attendanceMoreBtn');

    if (button) {
      button.setAttribute('aria-expanded', 'false');
    }
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

  function indiaDateToIso(date) {
    const parsed = new Date(`${date}T00:00:00+05:30`);

    return Number.isNaN(parsed.getTime()) ? null : parsed.toISOString();
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
     CURRENT LOCATION
  ========================================================== */

  async function getCurrentLocation() {
    if (!navigator.geolocation) {
      console.warn('Geolocation is not supported by this browser.');

      return null;
    }

    return new Promise(function (resolve) {
      navigator.geolocation.getCurrentPosition(
        function (position) {
          resolve({
            lat: position.coords.latitude,

            lng: position.coords.longitude,
          });
        },

        function (error) {
          console.warn('Unable to get current location:', error);

          /*
           * Location remains optional.
           */
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
})();
