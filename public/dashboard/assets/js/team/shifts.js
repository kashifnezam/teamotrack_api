/* ==========================================================
   TeamoTrack Shifts
========================================================== */

(function () {
  'use strict';

  let shifts = [];
  let editingId = null;

  const WEEK_DAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

  /* ==========================================================
     Initialize
  ========================================================== */

  window.initializeShiftsPage = async function () {
    AppAlert.loading('Loading shifts...');

    await loadShifts();

    AppAlert.close();

    document.getElementById('searchInput')?.addEventListener('input', renderShifts);

    initializeTooltips();
    initializeDurationListeners();
  };

  /* ==========================================================
     Tooltips
  ========================================================== */

  function initializeTooltips() {
    if (typeof bootstrap === 'undefined') {
      return;
    }

    document.querySelectorAll('[data-bs-toggle="tooltip"]').forEach((element) => {
      bootstrap.Tooltip.getOrCreateInstance(element);
    });
  }

  /* ==========================================================
     Duration / Form Listeners
  ========================================================== */

  function initializeDurationListeners() {
    const fields = ['graceHours', 'graceMinutes', 'halfDayHours', 'halfDayMinutes', 'fullDayHours', 'fullDayMinutes'];

    fields.forEach((id) => {
      document.getElementById(id)?.addEventListener('input', updateAttendancePreview);
    });

    document.getElementById('startTime')?.addEventListener('change', updateAttendancePreview);

    document.getElementById('endTime')?.addEventListener('change', updateAttendancePreview);

    document.getElementById('breakEnabled')?.addEventListener('change', toggleBreakTime);

    document.getElementById('breakStartTime')?.addEventListener('change', updateAttendancePreview);

    document.getElementById('breakEndTime')?.addEventListener('change', updateAttendancePreview);
  }

  /* ==========================================================
     Load Shifts
  ========================================================== */

  async function loadShifts() {
    try {
      const data = await Api.get('/shifts/data');

      if (!data) {
        return;
      }

      shifts = data.shifts || [];

      renderShifts();
    } catch (error) {
      console.error(error);

      AppAlert.error(error.message || 'Unable to load shifts');
    }
  }

  /* ==========================================================
     Render Shifts
  ========================================================== */

  function renderShifts() {
    const searchInput = document.getElementById('searchInput');

    const tbody = document.getElementById('shiftTable');

    if (!searchInput || !tbody) {
      return;
    }

    const search = searchInput.value.trim().toLowerCase();

    const list = shifts.filter((shift) => {
      return !search || shift.name?.toLowerCase().includes(search);
    });

    const count = document.getElementById('shiftCount');

    if (count) {
      count.textContent = list.length;
    }

    if (!list.length) {
      tbody.innerHTML = `
        <tr>
          <td
            colspan="9"
            class="empty-state"
          >
            <div class="empty-icon">
              <i class="bi bi-calendar3"></i>
            </div>

            <div class="empty-title">
              ${search ? 'No shifts match your search' : 'No shifts configured yet'}
            </div>
          </td>
        </tr>
      `;

      return;
    }

    tbody.innerHTML = list
      .map((shift) => {
        const weeklyOff = shift.weeklyOff || [];

        const off = weeklyOff
          .map((day) => {
            return typeof day === 'number' ? WEEK_DAYS[day] : day;
          })
          .filter(Boolean)
          .join(', ');

        const shiftDuration = getShiftDurationMinutes(
          Number(shift.startHour) || 0,
          Number(shift.startMinute) || 0,
          Number(shift.endHour) || 0,
          Number(shift.endMinute) || 0
        );

        return `
          <tr>

            <!-- SHIFT -->

            <td>
              <div class="shift-name">
                ${escapeHtml(shift.name || 'Unnamed')}
              </div>
            </td>


            <!-- WORKING HOURS -->

            <td>
              <div class="shift-time">

                <span>
                  ${formatTime(shift.startHour, shift.startMinute)}
                </span>

                <i class="bi bi-arrow-right-short"></i>

                <span>
                  ${formatTime(shift.endHour, shift.endMinute)}
                </span>

                <span class="text-muted">
                  (${formatDuration(shiftDuration)})
                </span>

              </div>

              ${
                hasShiftBreak(shift)
                  ? `
                    <div class="shift-break">
                      <i class="bi bi-cup-hot"></i>

                      Break
                      ${formatTime(shift.breakStartHour, shift.breakStartMinute)}
                      -
                      ${formatTime(shift.breakEndHour, shift.breakEndMinute)}
                    </div>
                  `
                  : ''
              }

            </td>


            <!-- GRACE -->

            <td>
              <span class="duration-badge grace">
                ${formatDuration(shift.graceMinutes)}
              </span>
            </td>


            <!-- HALF DAY -->

            <td>
              <span class="duration-badge">
                ${formatDuration(shift.halfDayMinutes)}
              </span>
            </td>


            <!-- FULL DAY -->

            <td>
              <span class="duration-badge">
                ${formatDuration(shift.fullDayMinutes)}
              </span>
            </td>


            <!-- SELFIE CHECK-IN -->

            <td>
              ${
                shift.selfieCheckIn === true
                  ? `
                    <span class="weekly-badge">
                      <i class="bi bi-camera me-1"></i>
                      Required
                    </span>
                  `
                  : `
                    <span class="no-off">
                      Not Required
                    </span>
                  `
              }
            </td>


            <!-- SELFIE CHECK-OUT -->

            <td>
              ${
                shift.selfieCheckOut === true
                  ? `
                    <span class="weekly-badge">
                      <i class="bi bi-camera me-1"></i>
                      Required
                    </span>
                  `
                  : `
                    <span class="no-off">
                      Not Required
                    </span>
                  `
              }
            </td>


            <!-- WEEKLY OFF -->

            <td>
              ${
                off
                  ? `
                    <span class="weekly-badge">
                      ${escapeHtml(off)}
                    </span>
                  `
                  : `
                    <span class="no-off">
                      None
                    </span>
                  `
              }
            </td>


            <!-- ACTION -->

            <td class="text-end">

              <button
                type="button"
                class="action-btn"
                title="Edit"
                onclick="editShift('${shift.id}')"
              >
                <i class="bi bi-pencil"></i>
              </button>

              <button
                type="button"
                class="action-btn"
                title="Delete"
                onclick="deleteShift('${shift.id}')"
              >
                <i class="bi bi-trash"></i>
              </button>

            </td>

          </tr>
        `;
      })
      .join('');
  }

  /* ==========================================================
     Open Modal
  ========================================================== */

  function openShiftModal(id = null) {
    editingId = id;

    const modal = document.getElementById('shiftModal');

    const modalTitle = document.getElementById('modalTitle');

    const saveButton = document.getElementById('saveShiftBtn');

    if (!modal || !modalTitle || !saveButton) {
      return;
    }

    modalTitle.textContent = id ? 'Edit Shift' : 'Add Shift';

    saveButton.innerHTML = id
      ? '<i class="bi bi-check2 me-1"></i> Update Shift'
      : '<i class="bi bi-check2 me-1"></i> Save Shift';

    /*
     * New shift
     */

    if (!id) {
      document.getElementById('shiftId').value = '';

      document.getElementById('shiftName').value = '';

      document.getElementById('startTime').value = '';

      document.getElementById('endTime').value = '';

      document.getElementById('breakEnabled').checked = false;

      document.getElementById('breakStartTime').value = '';

      document.getElementById('breakEndTime').value = '';

      document.getElementById('breakFields').style.display = 'none';

      /*
       * Selfie Attendance
       */

      document.getElementById('selfieCheckIn').checked = false;

      document.getElementById('selfieCheckOut').checked = false;

      /*
       * Attendance thresholds
       */

      setDurationMinutes('graceHours', 'graceMinutes', 0);

      setDurationMinutes('halfDayHours', 'halfDayMinutes', 240);

      setDurationMinutes('fullDayHours', 'fullDayMinutes', 480);

      /*
       * Weekly Off
       */

      document.querySelectorAll('#shiftModal .weekly-off input').forEach((input) => {
        input.checked = false;
      });
    }

    /*
     * Make sure break UI matches
     * current checkbox state.
     */

    const breakEnabled = document.getElementById('breakEnabled')?.checked;

    document.getElementById('breakFields').style.display = breakEnabled ? 'flex' : 'none';

    updateAttendancePreview();

    bootstrap.Modal.getOrCreateInstance(modal).show();

    initializeTooltips();
  }

  /* ==========================================================
     Edit Shift
  ========================================================== */

  function editShift(id) {
    const shift = shifts.find((item) => item.id === id);

    if (!shift) {
      return;
    }

    editingId = id;

    document.getElementById('shiftId').value = id;

    document.getElementById('shiftName').value = shift.name || '';

    document.getElementById('startTime').value = formatTime(shift.startHour, shift.startMinute);

    document.getElementById('endTime').value = formatTime(shift.endHour, shift.endMinute);

    /* --------------------------------------------------------
       Break
    -------------------------------------------------------- */

    const hasBreak = hasShiftBreak(shift);

    document.getElementById('breakEnabled').checked = hasBreak;

    document.getElementById('breakFields').style.display = hasBreak ? 'flex' : 'none';

    document.getElementById('breakStartTime').value = hasBreak
      ? formatTime(shift.breakStartHour, shift.breakStartMinute)
      : '';

    document.getElementById('breakEndTime').value = hasBreak
      ? formatTime(shift.breakEndHour, shift.breakEndMinute)
      : '';

    /* --------------------------------------------------------
       Attendance Rules
    -------------------------------------------------------- */

    setDurationMinutes('graceHours', 'graceMinutes', shift.graceMinutes);

    setDurationMinutes('halfDayHours', 'halfDayMinutes', shift.halfDayMinutes);

    setDurationMinutes('fullDayHours', 'fullDayMinutes', shift.fullDayMinutes);

    /*
     * Selfie Check-In
     */

    document.getElementById('selfieCheckIn').checked = shift.selfieCheckIn === true;

    /*
     * Selfie Check-Out
     *
     * Explicitly default to false for old
     * shifts that don't have this property.
     */

    document.getElementById('selfieCheckOut').checked = shift.selfieCheckOut === true;

    /* --------------------------------------------------------
       Weekly Off
    -------------------------------------------------------- */

    const weeklyOff = shift.weeklyOff || [];

    document.querySelectorAll('#shiftModal .weekly-off input').forEach((input) => {
      const value = Number(input.value);

      input.checked = weeklyOff.includes(WEEK_DAYS[value]) || weeklyOff.includes(value);
    });

    openShiftModal(id);
  }

  /* ==========================================================
     Break Time
  ========================================================== */

  function toggleBreakTime() {
    const enabled = document.getElementById('breakEnabled')?.checked;

    const fields = document.getElementById('breakFields');

    if (!fields) {
      return;
    }

    fields.style.display = enabled ? 'flex' : 'none';

    if (!enabled) {
      document.getElementById('breakStartTime').value = '';

      document.getElementById('breakEndTime').value = '';
    }

    updateAttendancePreview();
  }

  /* ==========================================================
     Save Shift
  ========================================================== */

  async function saveShift() {
    const name = document.getElementById('shiftName').value.trim();

    const start = document.getElementById('startTime').value;

    const end = document.getElementById('endTime').value;

    const button = document.getElementById('saveShiftBtn');

    /* --------------------------------------------------------
       Basic Validation
    -------------------------------------------------------- */

    if (!name) {
      AppAlert.warning('Please enter a shift name.');

      return;
    }

    if (!start || !end) {
      AppAlert.warning('Start time and end time are required.');

      return;
    }

    const [startHour, startMinute] = start.split(':').map(Number);

    const [endHour, endMinute] = end.split(':').map(Number);

    /* --------------------------------------------------------
       Shift Duration
    -------------------------------------------------------- */

    const shiftDurationMinutes = getShiftDurationMinutes(startHour, startMinute, endHour, endMinute);

    if (shiftDurationMinutes <= 0) {
      AppAlert.warning('Invalid shift duration.');

      return;
    }

    /* --------------------------------------------------------
       Break
    -------------------------------------------------------- */

    const breakEnabled = document.getElementById('breakEnabled')?.checked;

    let breakStartHour = null;
    let breakStartMinute = null;
    let breakEndHour = null;
    let breakEndMinute = null;

    if (breakEnabled) {
      const breakStart = document.getElementById('breakStartTime')?.value;

      const breakEnd = document.getElementById('breakEndTime')?.value;

      if (!breakStart || !breakEnd) {
        AppAlert.warning('Break start time and break end time are required.');

        return;
      }

      [breakStartHour, breakStartMinute] = breakStart.split(':').map(Number);

      [breakEndHour, breakEndMinute] = breakEnd.split(':').map(Number);

      const shiftStartMinutes = startHour * 60 + startMinute;

      const shiftEndMinutes = endHour * 60 + endMinute;

      const breakStartMinutes = breakStartHour * 60 + breakStartMinute;

      const breakEndMinutes = breakEndHour * 60 + breakEndMinute;

      /*
       * Break must have a duration.
       */

      if (breakStartMinutes === breakEndMinutes) {
        AppAlert.warning('Break start and end time cannot be the same.');

        return;
      }

      /*
       * Break duration.
       */

      const breakDurationMinutes = getShiftDurationMinutes(
        breakStartHour,
        breakStartMinute,
        breakEndHour,
        breakEndMinute
      );

      /*
       * Normal shift.
       */

      if (shiftEndMinutes > shiftStartMinutes) {
        if (breakStartMinutes < shiftStartMinutes || breakEndMinutes > shiftEndMinutes) {
          AppAlert.warning('Break time must be within the shift time.');

          return;
        }
      } else {
        /*
         * Overnight shift.
         *
         * Convert the break into
         * the same timeline as the shift.
         */

        const normalizedShiftEnd = shiftEndMinutes + 24 * 60;

        let normalizedBreakStart = breakStartMinutes;

        let normalizedBreakEnd = breakEndMinutes;

        if (normalizedBreakStart < shiftStartMinutes) {
          normalizedBreakStart += 24 * 60;
        }

        if (normalizedBreakEnd < shiftStartMinutes) {
          normalizedBreakEnd += 24 * 60;
        }

        if (normalizedBreakStart < shiftStartMinutes || normalizedBreakEnd > normalizedShiftEnd) {
          AppAlert.warning('Break time must be within the shift time.');

          return;
        }

        /*
         * Prevent an invalid overnight
         * break range.
         */

        if (normalizedBreakEnd <= normalizedBreakStart) {
          AppAlert.warning('Break end time must be after break start time.');

          return;
        }
      }

      if (breakDurationMinutes >= shiftDurationMinutes) {
        AppAlert.warning('Break duration must be less than the shift duration.');

        return;
      }
    }

    /* --------------------------------------------------------
       UI -> Minutes
    -------------------------------------------------------- */

    const graceMinutes = getDurationMinutes('graceHours', 'graceMinutes');

    const halfDayMinutes = getDurationMinutes('halfDayHours', 'halfDayMinutes');

    const fullDayMinutes = getDurationMinutes('fullDayHours', 'fullDayMinutes');

    /* --------------------------------------------------------
       Minute Validation
    -------------------------------------------------------- */

    if (
      !validateMinuteField('graceMinutes') ||
      !validateMinuteField('halfDayMinutes') ||
      !validateMinuteField('fullDayMinutes')
    ) {
      return;
    }

    /* --------------------------------------------------------
       Attendance Rules
    -------------------------------------------------------- */

    if (graceMinutes >= shiftDurationMinutes) {
      AppAlert.warning(`Grace must be less than the shift duration (${formatDuration(shiftDurationMinutes)}).`);

      return;
    }

    if (halfDayMinutes >= fullDayMinutes) {
      AppAlert.warning('Half Day duration must be less than Full Day duration.');

      return;
    }

    if (halfDayMinutes > shiftDurationMinutes) {
      AppAlert.warning(
        `Half Day duration cannot be more than the shift duration (${formatDuration(shiftDurationMinutes)}).`
      );

      return;
    }

    if (fullDayMinutes > shiftDurationMinutes) {
      AppAlert.warning(
        `Full Day duration cannot be more than the shift duration (${formatDuration(shiftDurationMinutes)}).`
      );

      return;
    }

    if (graceMinutes >= halfDayMinutes) {
      AppAlert.warning('Grace must be less than Half Day duration.');

      return;
    }

    if (graceMinutes >= fullDayMinutes) {
      AppAlert.warning('Grace must be less than Full Day duration.');

      return;
    }

    /* --------------------------------------------------------
       Selfie Attendance
    -------------------------------------------------------- */

    const selfieCheckIn = document.getElementById('selfieCheckIn')?.checked === true;

    const selfieCheckOut = document.getElementById('selfieCheckOut')?.checked === true;

    /* --------------------------------------------------------
       DTO
    -------------------------------------------------------- */

    const body = {
      name,

      startHour,
      startMinute,

      endHour,
      endMinute,

      breakStartHour,
      breakStartMinute,

      breakEndHour,
      breakEndMinute,

      graceMinutes,

      halfDayMinutes,

      fullDayMinutes,

      weeklyOff: [...document.querySelectorAll('#shiftModal .weekly-off input:checked')].map(
        (input) => WEEK_DAYS[Number(input.value)]
      ),

      /*
       * Selfie Attendance
       */

      selfieCheckIn,

      selfieCheckOut,
    };

    /* --------------------------------------------------------
       API
    -------------------------------------------------------- */

    try {
      button.disabled = true;

      AppAlert.loading(editingId ? 'Updating shift...' : 'Creating shift...');

      const data = editingId ? await Api.patch(`/shifts/${editingId}`, body) : await Api.post('/shifts', body);

      if (!data) {
        AppAlert.close();

        return;
      }

      AppAlert.close();

      AppAlert.success(editingId ? 'Shift updated successfully' : 'Shift created successfully');

      bootstrap.Modal.getInstance(document.getElementById('shiftModal'))?.hide();

      await loadShifts();
    } catch (error) {
      console.error(error);

      AppAlert.close();

      AppAlert.error(error.message || 'Failed to save shift');
    } finally {
      button.disabled = false;
    }
  }

  /* ==========================================================
     Delete Shift
  ========================================================== */

  async function deleteShift(id) {
    const shift = shifts.find((item) => item.id === id);

    if (!shift) {
      return;
    }

    const confirmed = await AppAlert.confirm(
      `Are you sure you want to delete the shift "${shift.name}"?`,
      'This action cannot be undone.'
    );

    if (!confirmed) {
      return;
    }

    try {
      AppAlert.loading('Deleting shift...');

      const data = await Api.delete(`/shifts/${id}`);

      if (!data) {
        AppAlert.close();

        return;
      }

      AppAlert.close();

      AppAlert.success('Shift deleted successfully');

      await loadShifts();
    } catch (error) {
      console.error(error);

      AppAlert.close();

      AppAlert.error(error.message || 'Unable to delete shift');
    }
  }

  /* ==========================================================
     Attendance Preview
  ========================================================== */

  function updateAttendancePreview() {
    const start = document.getElementById('startTime')?.value;

    const end = document.getElementById('endTime')?.value;

    let shiftDuration = 0;

    if (start && end) {
      const [startHour, startMinute] = start.split(':').map(Number);

      const [endHour, endMinute] = end.split(':').map(Number);

      shiftDuration = getShiftDurationMinutes(startHour, startMinute, endHour, endMinute);
    }

    /* --------------------------------------------------------
       Break
    -------------------------------------------------------- */

    const breakEnabled = document.getElementById('breakEnabled')?.checked;

    let breakDuration = 0;

    if (breakEnabled) {
      const breakStart = document.getElementById('breakStartTime')?.value;

      const breakEnd = document.getElementById('breakEndTime')?.value;

      if (breakStart && breakEnd) {
        const [breakStartHour, breakStartMinute] = breakStart.split(':').map(Number);

        const [breakEndHour, breakEndMinute] = breakEnd.split(':').map(Number);

        breakDuration = getShiftDurationMinutes(breakStartHour, breakStartMinute, breakEndHour, breakEndMinute);
      }
    }

    /* --------------------------------------------------------
       Working Duration
    -------------------------------------------------------- */

    const workingDuration = Math.max(0, shiftDuration - breakDuration);

    /* --------------------------------------------------------
       Shift Summary
    -------------------------------------------------------- */

    const shiftDurationText = document.getElementById('shiftDurationText');

    if (shiftDurationText) {
      if (!shiftDuration) {
        shiftDurationText.textContent = 'Set start and end time';
      } else if (breakDuration) {
        shiftDurationText.textContent = `${formatDuration(shiftDuration)} shift • ${formatDuration(
          breakDuration
        )} break • ${formatDuration(workingDuration)} working`;
      } else {
        shiftDurationText.textContent = `${formatDuration(shiftDuration)} shift`;
      }
    }

    /* --------------------------------------------------------
       Attendance Rules
    -------------------------------------------------------- */

    const grace = getDurationMinutes('graceHours', 'graceMinutes');

    const half = getDurationMinutes('halfDayHours', 'halfDayMinutes');

    const full = getDurationMinutes('fullDayHours', 'fullDayMinutes');

    /* --------------------------------------------------------
       Rule Hints
    -------------------------------------------------------- */

    const graceHint = document.getElementById('graceRuleHint');

    if (graceHint) {
      graceHint.textContent = grace === 0 ? 'No grace time' : `${formatDuration(grace)} allowed difference`;
    }

    const halfHint = document.getElementById('halfDayRuleHint');

    if (halfHint) {
      halfHint.textContent = formatDuration(half);
    }

    const fullHint = document.getElementById('fullDayRuleHint');

    if (fullHint) {
      fullHint.textContent = formatDuration(full);
    }

    /* --------------------------------------------------------
       Summary
    -------------------------------------------------------- */

    const summaryGrace = document.getElementById('summaryGrace');

    const summaryHalf = document.getElementById('summaryHalf');

    const summaryFull = document.getElementById('summaryFull');

    if (summaryGrace) {
      summaryGrace.textContent = `Grace: ${formatDuration(grace)}`;
    }

    if (summaryHalf) {
      summaryHalf.textContent = `Half Day: ${formatDuration(half)}`;
    }

    if (summaryFull) {
      summaryFull.textContent = `Full Day: ${formatDuration(full)}`;
    }
  }

  /* ==========================================================
     Duration Helpers
  ========================================================== */

  function getDurationMinutes(hoursId, minutesId) {
    const hoursInput = document.getElementById(hoursId);

    const minutesInput = document.getElementById(minutesId);

    const hours = Number(hoursInput?.value) || 0;

    const minutes = Number(minutesInput?.value) || 0;

    return Math.max(0, hours) * 60 + Math.max(0, minutes);
  }

  /* ==========================================================
     Set Duration
  ========================================================== */

  function setDurationMinutes(hoursId, minutesId, totalMinutes) {
    const total = Math.max(0, Number(totalMinutes) || 0);

    const hours = Math.floor(total / 60);

    const minutes = total % 60;

    const hoursInput = document.getElementById(hoursId);

    const minutesInput = document.getElementById(minutesId);

    if (hoursInput) {
      hoursInput.value = hours;
    }

    if (minutesInput) {
      minutesInput.value = minutes;
    }
  }

  /* ==========================================================
     Shift Duration
  ========================================================== */

  function getShiftDurationMinutes(startHour, startMinute, endHour, endMinute) {
    const startTotal = startHour * 60 + startMinute;

    const endTotal = endHour * 60 + endMinute;

    let duration = endTotal - startTotal;

    /*
     * Overnight shift.
     *
     * Example:
     * 22:00 -> 06:00
     * = 8 hours
     */

    if (duration <= 0) {
      duration += 24 * 60;
    }

    return duration;
  }

  /* ==========================================================
     Break Detection
  ========================================================== */

  function hasShiftBreak(shift) {
    return (
      shift.breakStartHour !== null &&
      shift.breakStartHour !== undefined &&
      shift.breakStartMinute !== null &&
      shift.breakStartMinute !== undefined &&
      shift.breakEndHour !== null &&
      shift.breakEndHour !== undefined &&
      shift.breakEndMinute !== null &&
      shift.breakEndMinute !== undefined
    );
  }

  /* ==========================================================
     Format Duration
  ========================================================== */

  function formatDuration(totalMinutes) {
    const total = Math.max(0, Number(totalMinutes) || 0);

    const hours = Math.floor(total / 60);

    const minutes = total % 60;

    if (hours && minutes) {
      return `${hours} hr ${minutes} min`;
    }

    if (hours) {
      return `${hours} hr`;
    }

    return `${minutes} min`;
  }

  /* ==========================================================
     Minute Validation
  ========================================================== */

  function validateMinuteField(id) {
    const input = document.getElementById(id);

    if (!input) {
      return true;
    }

    let value = Number(input.value) || 0;

    if (value < 0) {
      input.value = 0;

      value = 0;
    }

    if (value > 59) {
      input.value = 59;

      AppAlert.warning('Minutes must be between 0 and 59.');

      input.focus();

      return false;
    }

    return true;
  }

  /* ==========================================================
     Format Time
  ========================================================== */

  function formatTime(hour, minute) {
    return `${String(hour || 0).padStart(2, '0')}:${String(minute || 0).padStart(2, '0')}`;
  }

  /* ==========================================================
     Escape HTML
  ========================================================== */

  function escapeHtml(value) {
    return String(value ?? '')
      .replaceAll('&', '&amp;')
      .replaceAll('<', '&lt;')
      .replaceAll('>', '&gt;')
      .replaceAll('"', '&quot;')
      .replaceAll("'", '&#039;');
  }

  /* ==========================================================
     Global HTML Handlers
  ========================================================== */

  window.editShift = editShift;

  window.deleteShift = deleteShift;

  window.openShiftModal = openShiftModal;

  window.saveShift = saveShift;
})();
