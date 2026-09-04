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
     Duration Listeners
  ========================================================== */

  function initializeDurationListeners() {
    const fields = ['graceHours', 'graceMinutes', 'halfDayHours', 'halfDayMinutes', 'fullDayHours', 'fullDayMinutes'];

    fields.forEach((id) => {
      document.getElementById(id)?.addEventListener('input', updateAttendancePreview);
    });

    document.getElementById('startTime')?.addEventListener('change', updateAttendancePreview);

    document.getElementById('endTime')?.addEventListener('change', updateAttendancePreview);
  }

  /* ==========================================================
     Load
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

    const list = shifts.filter((shift) => !search || shift.name?.toLowerCase().includes(search));

    const count = document.getElementById('shiftCount');

    if (count) {
      count.textContent = list.length;
    }

    if (!list.length) {
      tbody.innerHTML = `
        <tr>
          <td colspan="7" class="empty-state">

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
          .map((day) => (typeof day === 'number' ? WEEK_DAYS[day] : day))
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

    const modalTitle = document.getElementById('modalTitle');

    const saveButton = document.getElementById('saveShiftBtn');

    modalTitle.textContent = id ? 'Edit Shift' : 'Add Shift';

    saveButton.innerHTML = id
      ? '<i class="bi bi-check2 me-1"></i> Update Shift'
      : '<i class="bi bi-check2 me-1"></i> Save Shift';

    if (!id) {
      document.getElementById('shiftId').value = '';

      document.getElementById('shiftName').value = '';

      document.getElementById('startTime').value = '';

      document.getElementById('endTime').value = '';

      setDurationMinutes('graceHours', 'graceMinutes', 0);

      setDurationMinutes('halfDayHours', 'halfDayMinutes', 240);

      setDurationMinutes('fullDayHours', 'fullDayMinutes', 480);

      document.querySelectorAll('#shiftModal .weekly-off input').forEach((input) => {
        input.checked = false;
      });
    }

    updateAttendancePreview();

    bootstrap.Modal.getOrCreateInstance(document.getElementById('shiftModal')).show();

    initializeTooltips();
  }

  /* ==========================================================
     Edit Shift
  ========================================================== */

  function editShift(id) {
    const shift = shifts.find((s) => s.id === id);

    if (!shift) {
      return;
    }

    document.getElementById('shiftId').value = id;

    document.getElementById('shiftName').value = shift.name || '';

    document.getElementById('startTime').value = formatTime(shift.startHour, shift.startMinute);

    document.getElementById('endTime').value = formatTime(shift.endHour, shift.endMinute);

    /*
     * Backend -> UI
     *
     * Example:
     * 270 minutes
     * becomes
     * 4 hours + 30 minutes
     */

    setDurationMinutes('graceHours', 'graceMinutes', shift.graceMinutes);

    setDurationMinutes('halfDayHours', 'halfDayMinutes', shift.halfDayMinutes);

    setDurationMinutes('fullDayHours', 'fullDayMinutes', shift.fullDayMinutes);

    const weeklyOff = shift.weeklyOff || [];

    document.querySelectorAll('#shiftModal .weekly-off input').forEach((input) => {
      const value = Number(input.value);

      input.checked = weeklyOff.includes(WEEK_DAYS[value]) || weeklyOff.includes(value);
    });

    openShiftModal(id);
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
       Basic validation
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
       Shift duration
    -------------------------------------------------------- */

    const shiftDurationMinutes = getShiftDurationMinutes(startHour, startMinute, endHour, endMinute);

    /* --------------------------------------------------------
       UI -> minutes
    -------------------------------------------------------- */

    const graceMinutes = getDurationMinutes('graceHours', 'graceMinutes');

    const halfDayMinutes = getDurationMinutes('halfDayHours', 'halfDayMinutes');

    const fullDayMinutes = getDurationMinutes('fullDayHours', 'fullDayMinutes');

    /* --------------------------------------------------------
       Minute validation
    -------------------------------------------------------- */

    if (
      !validateMinuteField('graceMinutes') ||
      !validateMinuteField('halfDayMinutes') ||
      !validateMinuteField('fullDayMinutes')
    ) {
      return;
    }

    /* --------------------------------------------------------
       Attendance rules validation
    -------------------------------------------------------- */

    /*
     * Grace must be smaller than the shift.
     */

    if (graceMinutes >= shiftDurationMinutes) {
      AppAlert.warning(`Grace must be less than the shift duration (${formatDuration(shiftDurationMinutes)}).`);

      return;
    }

    /*
     * Half Day cannot be equal to or greater
     * than Full Day.
     */

    if (halfDayMinutes >= fullDayMinutes) {
      AppAlert.warning('Half Day duration must be less than Full Day duration.');

      return;
    }

    /*
     * Half Day cannot exceed shift duration.
     */

    if (halfDayMinutes > shiftDurationMinutes) {
      AppAlert.warning(
        `Half Day duration cannot be more than the shift duration (${formatDuration(shiftDurationMinutes)}).`
      );

      return;
    }

    /*
     * Full Day cannot exceed shift duration.
     */

    if (fullDayMinutes > shiftDurationMinutes) {
      AppAlert.warning(
        `Full Day duration cannot be more than the shift duration (${formatDuration(shiftDurationMinutes)}).`
      );

      return;
    }

    /*
     * Grace must be smaller than Half Day.
     */

    if (graceMinutes >= halfDayMinutes) {
      AppAlert.warning('Grace must be less than Half Day duration.');

      return;
    }

    /*
     * Grace must be smaller than Full Day.
     */

    if (graceMinutes >= fullDayMinutes) {
      AppAlert.warning('Grace must be less than Full Day duration.');

      return;
    }

    /* --------------------------------------------------------
       DTO
    -------------------------------------------------------- */

    const body = {
      name,

      startHour,
      startMinute,

      endHour,
      endMinute,

      /*
       * IMPORTANT:
       * DTO remains minute based.
       */

      graceMinutes,

      halfDayMinutes,

      fullDayMinutes,

      weeklyOff: [...document.querySelectorAll('#shiftModal .weekly-off input:checked')].map(
        (input) => WEEK_DAYS[Number(input.value)]
      ),
    };

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
    const shift = shifts.find((s) => s.id === id);

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

    const grace = getDurationMinutes('graceHours', 'graceMinutes');

    const half = getDurationMinutes('halfDayHours', 'halfDayMinutes');

    const full = getDurationMinutes('fullDayHours', 'fullDayMinutes');

    /* --------------------------------------------------------
       Shift duration
    -------------------------------------------------------- */

    const shiftDurationText = document.getElementById('shiftDurationText');

    if (shiftDurationText) {
      shiftDurationText.textContent = shiftDuration ? formatDuration(shiftDuration) : 'Set start and end time';
    }

    /* --------------------------------------------------------
       Rule hints
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
     * If end time is earlier than start time,
     * treat it as an overnight shift.
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
