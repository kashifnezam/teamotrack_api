(function () {
  'use strict';

  let holidays = [];
  let manageAccess = false;
  let holidayModal = null;

  const $ = (id) => document.getElementById(id);

  function escapeHtml(value = '') {
    return String(value)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
  }

  function formatDate(date) {
    if (!date) return '-';

    const d = new Date(`${date}T00:00:00`);

    return d.toLocaleDateString('en-IN', {
      day: '2-digit',
      month: 'short',
      year: 'numeric',
    });
  }

  function getYear(date) {
    return Number(String(date).slice(0, 4));
  }

  function currentYear() {
    return new Date().getFullYear();
  }

  function populateYears() {
    const select = $('holidayYear');

    if (!select) return;

    const year = currentYear();

    select.innerHTML = '';

    for (let i = year - 2; i <= year + 3; i++) {
      const option = document.createElement('option');

      option.value = i;
      option.textContent = i;
      option.selected = i === year;

      select.appendChild(option);
    }
  }

  function getSelectedHolidays() {
    const yearElement = $('holidayYear');
    const statusElement = $('holidayStatus');

    if (!yearElement || !statusElement) {
      return [];
    }

    const year = Number(yearElement.value);
    const status = statusElement.value;

    return holidays.filter((holiday) => {
      const matchesYear = getYear(holiday.date) === year;

      if (status === 'active') {
        return matchesYear && holiday.active;
      }

      if (status === 'inactive') {
        return matchesYear && !holiday.active;
      }

      return matchesYear;
    });
  }

  function updateStats() {
    const yearElement = $('holidayYear');

    if (!yearElement) return;

    const year = Number(yearElement.value);

    const yearHolidays = holidays.filter((holiday) => getYear(holiday.date) === year);

    const active = yearHolidays.filter((holiday) => holiday.active);
    const inactive = yearHolidays.filter((holiday) => !holiday.active);
    const optional = active.filter((holiday) => holiday.isOptional);

    const total = $('totalHolidayCount');
    const activeCount = $('activeHolidayCount');
    const optionalCount = $('optionalHolidayCount');
    const inactiveCount = $('inactiveHolidayCount');

    if (total) total.textContent = yearHolidays.length;
    if (activeCount) activeCount.textContent = active.length;
    if (optionalCount) optionalCount.textContent = optional.length;
    if (inactiveCount) inactiveCount.textContent = inactive.length;
  }

  function render() {
    const list = getSelectedHolidays();

    updateStats();

    const loading = $('holidayLoading');
    const empty = $('holidayEmpty');
    const tableWrap = $('holidayTableWrap');
    const mobileList = $('holidayMobileList');
    const tableBody = $('holidayTableBody');

    loading?.classList.add('d-none');

    if (!list.length) {
      empty?.classList.remove('d-none');
      tableWrap?.classList.add('d-none');
      mobileList?.classList.add('d-none');

      return;
    }

    empty?.classList.add('d-none');
    tableWrap?.classList.remove('d-none');
    mobileList?.classList.remove('d-none');

    if (tableBody) {
      tableBody.innerHTML = list
        .map(
          (holiday) => `
            <tr>
              <td>
                <div class="fw-semibold">
                  ${escapeHtml(holiday.name)}
                </div>

                ${
                  holiday.description
                    ? `<div class="small text-muted">
                        ${escapeHtml(holiday.description)}
                       </div>`
                    : ''
                }
              </td>

              <td>${formatDate(holiday.date)}</td>

              <td>
                <span class="badge text-bg-light border">
                  ${escapeHtml(holiday.type || 'public')}
                </span>
              </td>

              <td>
                ${
                  holiday.isOptional
                    ? '<span class="badge text-bg-warning">Yes</span>'
                    : '<span class="text-muted">No</span>'
                }
              </td>

              <td>
                ${
                  holiday.active
                    ? '<span class="badge text-bg-success">Active</span>'
                    : '<span class="badge text-bg-secondary">Inactive</span>'
                }
              </td>

              <td class="text-end">
                ${manageAccess ? renderActions(holiday) : '-'}
              </td>
            </tr>
          `
        )
        .join('');
    }

    if (mobileList) {
      mobileList.innerHTML = list
        .map(
          (holiday) => `
            <div class="holiday-card">
              <div class="d-flex gap-3">

                <div class="holiday-date text-center">
                  <div class="holiday-date-day">
                    ${escapeHtml(String(holiday.date).slice(8, 10))}
                  </div>

                  <div class="holiday-date-month">
                    ${new Date(`${holiday.date}T00:00:00`).toLocaleDateString('en-IN', { month: 'short' })}
                  </div>
                </div>

                <div class="flex-grow-1 min-width-0">

                  <div class="fw-semibold">
                    ${escapeHtml(holiday.name)}
                  </div>

                  <div class="small text-muted mt-1">
                    ${escapeHtml(holiday.type || 'public')}
                    ·
                    ${holiday.isOptional ? 'Optional' : 'Mandatory'}
                  </div>

                  <div class="mt-2">
                    ${
                      holiday.active
                        ? '<span class="badge text-bg-success">Active</span>'
                        : '<span class="badge text-bg-secondary">Inactive</span>'
                    }
                  </div>

                  ${
                    holiday.description
                      ? `<div class="small text-muted mt-2">
                          ${escapeHtml(holiday.description)}
                         </div>`
                      : ''
                  }

                </div>
              </div>
            </div>
          `
        )
        .join('');
    }
  }

  function renderActions(holiday) {
    if (holiday.active) {
      return `
        <div class="d-flex justify-content-end gap-1">

          <button
            class="btn btn-sm btn-outline-primary"
            onclick="window.editHoliday('${escapeHtml(holiday.id)}')">
            <i class="bi bi-pencil"></i>
            <span class="d-none d-md-inline ms-1">Edit</span>
          </button>

          <button
            class="btn btn-sm btn-outline-danger"
            onclick="window.deactivateHoliday('${escapeHtml(holiday.id)}')">
            <i class="bi bi-pause-circle"></i>
            <span class="d-none d-md-inline ms-1">Deactivate</span>
          </button>

        </div>
      `;
    }

    return `
      <button
        class="btn btn-sm btn-outline-success"
        onclick="window.reactivateHoliday('${escapeHtml(holiday.id)}')">

        <i class="bi bi-arrow-counterclockwise"></i>
        <span class="ms-1">Reactivate</span>

      </button>
    `;
  }

  async function loadAccess() {
    try {
      await Api.get('/holidays/manage');

      manageAccess = true;

      $('addHolidayBtn')?.classList.remove('d-none');
    } catch (error) {
      manageAccess = false;

      $('addHolidayBtn')?.classList.add('d-none');
    }
  }

  async function loadHolidays() {
    $('holidayLoading')?.classList.remove('d-none');
    $('holidayEmpty')?.classList.add('d-none');
    $('holidayTableWrap')?.classList.add('d-none');
    $('holidayMobileList')?.classList.add('d-none');

    try {
      holidays = await Api.get('/holidays/data');

      if (!Array.isArray(holidays)) {
        holidays = holidays?.holidays || [];
      }

      render();
    } catch (error) {
      $('holidayLoading')?.classList.add('d-none');

      AppAlert.error(error?.message || 'Failed to load holidays');
    }
  }

  function resetForm() {
    const form = $('holidayForm');

    if (!form) return;

    form.reset();

    const id = $('holidayId');
    const type = $('holidayType');
    const optional = $('holidayOptional');
    const title = $('holidayModalTitle');
    const saveBtn = $('saveHolidayBtn');

    if (id) id.value = '';
    if (type) type.value = 'public';
    if (optional) optional.checked = false;
    if (title) title.textContent = 'Add Holiday';
    if (saveBtn) saveBtn.textContent = 'Save Holiday';
  }

  function openCreateModal() {
    resetForm();

    const modalElement = $('holidayModal');

    if (!modalElement) return;

    const modal = bootstrap.Modal.getOrCreateInstance(modalElement);

    modal.show();
  }

  window.editHoliday = function (id) {
    if (!manageAccess) return;

    const holiday = holidays.find((item) => item.id === id);

    if (!holiday) return;

    const holidayId = $('holidayId');
    const name = $('holidayName');
    const date = $('holidayDate');
    const type = $('holidayType');
    const optional = $('holidayOptional');
    const description = $('holidayDescription');
    const title = $('holidayModalTitle');
    const saveBtn = $('saveHolidayBtn');

    if (holidayId) holidayId.value = holiday.id;
    if (name) name.value = holiday.name || '';
    if (date) date.value = holiday.date || '';
    if (type) type.value = holiday.type || 'public';
    if (optional) optional.checked = !!holiday.isOptional;
    if (description) description.value = holiday.description || '';

    if (title) title.textContent = 'Edit Holiday';
    if (saveBtn) saveBtn.textContent = 'Update Holiday';

    holidayModal?.show();
  };

  window.deactivateHoliday = async function (id) {
    if (!manageAccess) return;

    const confirmed = await AppAlert.confirm(
      'Deactivate this holiday?',
      'The holiday will remain in history but will no longer be active.'
    );

    if (!confirmed) return;

    try {
      AppAlert.loading('Deactivating holiday...');

      await Api.patch(`/holidays/${id}/deactivate`, {});

      AppAlert.close();
      AppAlert.success('Holiday deactivated successfully');

      await loadHolidays();
    } catch (error) {
      AppAlert.close();
      AppAlert.error(error?.message || 'Failed to deactivate holiday');
    }
  };

  window.reactivateHoliday = async function (id) {
    if (!manageAccess) return;

    const confirmed = await AppAlert.confirm('Reactivate this holiday?');

    if (!confirmed) return;

    try {
      AppAlert.loading('Reactivating holiday...');

      await Api.patch(`/holidays/${id}/reactivate`, {});

      AppAlert.close();
      AppAlert.success('Holiday reactivated successfully');

      await loadHolidays();
    } catch (error) {
      AppAlert.close();
      AppAlert.error(error?.message || 'Failed to reactivate holiday');
    }
  };

  async function saveHoliday(event) {
    event.preventDefault();

    if (!manageAccess) return;

    const idElement = $('holidayId');
    const nameElement = $('holidayName');
    const dateElement = $('holidayDate');
    const typeElement = $('holidayType');
    const optionalElement = $('holidayOptional');
    const descriptionElement = $('holidayDescription');

    if (!idElement || !nameElement || !dateElement || !typeElement || !optionalElement || !descriptionElement) {
      return;
    }

    const id = idElement.value;

    const dto = {
      name: nameElement.value.trim(),
      date: dateElement.value,
      type: typeElement.value,
      isOptional: optionalElement.checked,
      description: descriptionElement.value.trim(),
    };

    if (!dto.name) {
      AppAlert.error('Holiday name is required');
      return;
    }

    if (!dto.date) {
      AppAlert.error('Holiday date is required');
      return;
    }

    const saveBtn = $('saveHolidayBtn');

    try {
      if (saveBtn) {
        saveBtn.disabled = true;
      }

      AppAlert.loading(id ? 'Updating holiday...' : 'Creating holiday...');

      if (id) {
        await Api.patch(`/holidays/${id}`, dto);
      } else {
        await Api.post('/holidays', dto);
      }

      AppAlert.close();

      const modalElement = $('holidayModal');

      if (modalElement) {
        bootstrap.Modal.getInstance(modalElement)?.hide();
      }

      AppAlert.success(id ? 'Holiday updated successfully' : 'Holiday created successfully');

      await loadHolidays();
    } catch (error) {
      AppAlert.close();

      AppAlert.error(error?.message || (id ? 'Failed to update holiday' : 'Failed to create holiday'));
    } finally {
      if (saveBtn) {
        saveBtn.disabled = false;
      }
    }
  }

  window.initializeHolidaysPage = async function () {
    const modalElement = $('holidayModal');

    if (modalElement) {
      holidayModal = bootstrap.Modal.getOrCreateInstance(modalElement);
    }

    populateYears();

    $('holidayYear')?.addEventListener('change', render);
    $('holidayStatus')?.addEventListener('change', render);
    $('refreshHolidaysBtn')?.addEventListener('click', loadHolidays);
    $('addHolidayBtn')?.addEventListener('click', openCreateModal);
    $('holidayForm')?.addEventListener('submit', saveHoliday);

    AppAlert.loading('Loading holidays...');
    await loadAccess();
    await loadHolidays();
    AppAlert.close();
  };
})();
