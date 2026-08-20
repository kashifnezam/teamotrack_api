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
        const year = currentYear();

        select.innerHTML = '';

        for (let i = year - 2; i <= year + 3; i++) {
            const option = document.createElement('option');
            option.value = i;
            option.textContent = i;

            if (i === year) {
                option.selected = true;
            }

            select.appendChild(option);
        }
    }

    function getSelectedHolidays() {
        const year = Number($('holidayYear').value);
        const status = $('holidayStatus').value;

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
        const year = Number($('holidayYear').value);

        const yearHolidays = holidays.filter(
            (holiday) => getYear(holiday.date) === year,
        );

        const active = yearHolidays.filter((holiday) => holiday.active);
        const inactive = yearHolidays.filter((holiday) => !holiday.active);
        const optional = active.filter((holiday) => holiday.isOptional);

        $('totalHolidayCount').textContent = yearHolidays.length;
        $('activeHolidayCount').textContent = active.length;
        $('optionalHolidayCount').textContent = optional.length;
        $('inactiveHolidayCount').textContent = inactive.length;
    }

    function render() {
        const list = getSelectedHolidays();

        updateStats();

        $('holidayLoading').classList.add('d-none');

        if (!list.length) {
            $('holidayEmpty').classList.remove('d-none');
            $('holidayTableWrap').classList.add('d-none');
            $('holidayMobileList').classList.add('d-none');
            return;
        }

        $('holidayEmpty').classList.add('d-none');
        $('holidayTableWrap').classList.remove('d-none');
        $('holidayMobileList').classList.remove('d-none');

        $('holidayTableBody').innerHTML = list.map((holiday) => `
            <tr>
                <td>
                    <div class="fw-semibold">
                        ${escapeHtml(holiday.name)}
                    </div>
                    ${holiday.description
                ? `<div class="small text-muted">
                            ${escapeHtml(holiday.description)}
                           </div>`
                : ''}
                </td>

                <td>${formatDate(holiday.date)}</td>

                <td>
                    <span class="badge text-bg-light border">
                        ${escapeHtml(holiday.type || 'public')}
                    </span>
                </td>

                <td>
                    ${holiday.isOptional
                ? '<span class="badge text-bg-warning">Yes</span>'
                : '<span class="text-muted">No</span>'}
                </td>

                <td>
                    ${holiday.active
                ? '<span class="badge text-bg-success">Active</span>'
                : '<span class="badge text-bg-secondary">Inactive</span>'}
                </td>

                <td class="text-end">
                    ${manageAccess ? renderActions(holiday) : '-'}
                </td>
            </tr>
        `).join('');

        $('holidayMobileList').innerHTML = list.map((holiday) => `
            <div class="holiday-card">
                <div class="d-flex gap-3">
                    <div class="holiday-date text-center">
                        <div class="holiday-date-day">
                            ${escapeHtml(String(holiday.date).slice(8, 10))}
                        </div>
                        <div class="holiday-date-month">
                            ${new Date(`${holiday.date}T00:00:00`)
                .toLocaleDateString('en-IN', {
                    month: 'short',
                })}
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
                            ${holiday.active
                ? '<span class="badge text-bg-success">Active</span>'
                : '<span class="badge text-bg-secondary">Inactive</span>'}
                        </div>

                        ${holiday.description
                ? `<div class="small text-muted mt-2">
                                ${escapeHtml(holiday.description)}
                               </div>`
                : ''}
                    </div>
                </div>
            </div>
        `).join('');
    }

    function renderActions(holiday) {
        if (holiday.active) {
            return `
                <div class="d-flex justify-content-end gap-1">
                    <button
                        class="btn btn-sm btn-outline-primary"
                        onclick="window.editHoliday('${holiday.id}')">
                        <i class="bi bi-pencil"></i>
                        <span class="d-none d-md-inline ms-1">Edit</span>
                    </button>

                    <button
                        class="btn btn-sm btn-outline-danger"
                        onclick="window.deactivateHoliday('${holiday.id}')">
                        <i class="bi bi-pause-circle"></i>
                        <span class="d-none d-md-inline ms-1">Deactivate</span>
                    </button>
                </div>
            `;
        }

        return `
            <button
                class="btn btn-sm btn-outline-success"
                onclick="window.reactivateHoliday('${holiday.id}')">
                <i class="bi bi-arrow-counterclockwise"></i>
                <span class="ms-1">Reactivate</span>
            </button>
        `;
    }

    async function loadAccess() {
        try {
            await Api.get('/holidays/manage');
            manageAccess = true;
            $('addHolidayBtn').classList.remove('d-none');
        } catch (error) {
            manageAccess = false;
            $('addHolidayBtn').classList.add('d-none');
        }
    }

    async function loadHolidays() {
        $('holidayLoading').classList.remove('d-none');
        $('holidayEmpty').classList.add('d-none');
        $('holidayTableWrap').classList.add('d-none');
        $('holidayMobileList').classList.add('d-none');

        try {
            holidays = await Api.get('/holidays/data');

            if (!Array.isArray(holidays)) {
                holidays = holidays?.holidays || [];
            }

            render();
        } catch (error) {
            $('holidayLoading').classList.add('d-none');

            AppAlert.error(
                error?.message || 'Failed to load holidays',
            );
        }
    }

    function resetForm() {
        $('holidayForm').reset();
        $('holidayId').value = '';
        $('holidayType').value = 'public';
        $('holidayOptional').checked = false;
        $('holidayModalTitle').textContent = 'Add Holiday';
        $('saveHolidayBtn').textContent = 'Save Holiday';
    }

    function openCreateModal() {
        resetForm();

        const modal = bootstrap.Modal.getOrCreateInstance(
            $('holidayModal'),
        );

        modal.show();
    }

    window.editHoliday = function (id) {
        const holiday = holidays.find((item) => item.id === id);

        if (!holiday) return;

        $('holidayId').value = holiday.id;
        $('holidayName').value = holiday.name || '';
        $('holidayDate').value = holiday.date || '';
        $('holidayType').value = holiday.type || 'public';
        $('holidayOptional').checked = !!holiday.isOptional;
        $('holidayDescription').value = holiday.description || '';

        $('holidayModalTitle').textContent = 'Edit Holiday';
        $('saveHolidayBtn').textContent = 'Update Holiday';

        holidayModal.show();
    };

    window.deactivateHoliday = async function (id) {
        const confirmed = await AppAlert.confirm(
            'Deactivate this holiday?',
            'The holiday will remain in history but will no longer be active.',
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
            AppAlert.error(
                error?.message || 'Failed to deactivate holiday',
            );
        }
    };

    window.reactivateHoliday = async function (id) {
        const confirmed = await AppAlert.confirm(
            'Reactivate this holiday?',
        );

        if (!confirmed) return;

        try {
            AppAlert.loading('Reactivating holiday...');

            await Api.patch(`/holidays/${id}/reactivate`, {});

            AppAlert.close();
            AppAlert.success('Holiday reactivated successfully');

            await loadHolidays();
        } catch (error) {
            AppAlert.close();
            AppAlert.error(
                error?.message || 'Failed to reactivate holiday',
            );
        }
    };

    async function saveHoliday(event) {
        event.preventDefault();

        const id = $('holidayId').value;

        const dto = {
            name: $('holidayName').value.trim(),
            date: $('holidayDate').value,
            type: $('holidayType').value,
            isOptional: $('holidayOptional').checked,
            description: $('holidayDescription').value.trim(),
        };

        if (!dto.name) {
            AppAlert.error('Holiday name is required');
            return;
        }

        if (!dto.date) {
            AppAlert.error('Holiday date is required');
            return;
        }

        try {
            $('saveHolidayBtn').disabled = true;
            AppAlert.loading(
                id ? 'Updating holiday...' : 'Creating holiday...',
            );

            if (id) {
                await Api.patch(`/holidays/${id}`, dto);
            } else {
                await Api.post('/holidays', dto);
            }

            AppAlert.close();

            bootstrap.Modal.getInstance(
                $('holidayModal'),
            )?.hide();

            AppAlert.success(
                id
                    ? 'Holiday updated successfully'
                    : 'Holiday created successfully',
            );

            await loadHolidays();
        } catch (error) {
            AppAlert.close();

            AppAlert.error(
                error?.message ||
                (id
                    ? 'Failed to update holiday'
                    : 'Failed to create holiday'),
            );
        } finally {
            $('saveHolidayBtn').disabled = false;
        }
    }

    window.initializeHolidaysPage = async function () {
        holidayModal = bootstrap.Modal.getOrCreateInstance(
            $('holidayModal'),
        );

        populateYears();

        $('holidayYear').addEventListener('change', render);
        $('holidayStatus').addEventListener('change', render);

        $('refreshHolidaysBtn').addEventListener(
            'click',
            loadHolidays,
        );

        $('addHolidayBtn').addEventListener(
            'click',
            openCreateModal,
        );

        $('holidayForm').addEventListener(
            'submit',
            saveHoliday,
        );

        await loadAccess();
        await loadHolidays();
    };
})();