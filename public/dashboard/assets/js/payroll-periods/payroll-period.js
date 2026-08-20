(function () {

    'use strict';


    let periods = [];

    let modal;


    const $ = id =>
        document.getElementById(id);


    const months = [
        'January',
        'February',
        'March',
        'April',
        'May',
        'June',
        'July',
        'August',
        'September',
        'October',
        'November',
        'December',
    ];


    function escapeHtml(
        value = '',
    ) {

        return String(value)
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#039;');

    }


    function formatDate(
        value,
    ) {

        if (!value) {
            return '-';
        }


        const parts =
            String(value).split('-');


        if (parts.length !== 3) {
            return value;
        }


        return `${parts[2]}-${parts[1]}-${parts[0]}`;

    }


    function statusBadge(
        status,
    ) {

        const config = {

            open: {
                className: 'text-bg-primary',
                label: 'Open',
            },

            processing: {
                className: 'text-bg-warning',
                label: 'Processing',
            },

            processed: {
                className: 'text-bg-success',
                label: 'Processed',
            },

            closed: {
                className: 'text-bg-secondary',
                label: 'Closed',
            },

        };


        const item =
            config[status] || {
                className: 'text-bg-secondary',
                label: status || 'Unknown',
            };


        return `
            <span class="badge ${item.className}">
                ${escapeHtml(item.label)}
            </span>
        `;

    }


    function actionButtons(
        item,
    ) {

        if (item.status === 'open') {

            return `
            <button
                type="button"
                class="btn btn-sm btn-outline-primary"
                onclick="window.startPayrollProcessing('${item.id}')">

                <i class="bi bi-play-fill"></i>

                <span class="d-none d-md-inline ms-1">
                    Start
                </span>

            </button>
        `;

        }


        if (item.status === 'processing') {

            return `
            <button
                type="button"
                class="btn btn-sm btn-outline-success"
                onclick="window.markPayrollProcessed('${item.id}')">

                <i class="bi bi-check-lg"></i>

                <span class="d-none d-md-inline ms-1">
                    Processed
                </span>

            </button>
        `;

        }


        if (item.status === 'processed') {

            return `
            <button
                type="button"
                class="btn btn-sm btn-outline-secondary"
                onclick="window.closePayrollPeriod('${item.id}')">

                <i class="bi bi-lock"></i>

                <span class="d-none d-md-inline ms-1">
                    Close
                </span>

            </button>
        `;

        }


        if (item.status === 'closed') {

            return `
            <button
                type="button"
                class="btn btn-sm btn-outline-primary"
                onclick="window.reopenPayrollPeriod('${item.id}')">

                <i class="bi bi-unlock"></i>

                <span class="d-none d-md-inline ms-1">
                    Reopen
                </span>

            </button>
        `;

        }


        return `
        <span class="text-muted small">
            No action
        </span>
    `;

    }


    function render() {

        $('payrollPeriodLoading')
            .classList
            .add('d-none');


        if (!periods.length) {

            $('payrollPeriodEmpty')
                .classList
                .remove('d-none');

            $('payrollPeriodTableWrap')
                .classList
                .add('d-none');

            $('payrollPeriodMobileList')
                .classList
                .add('d-none');

            return;

        }


        $('payrollPeriodEmpty')
            .classList
            .add('d-none');


        $('payrollPeriodTableWrap')
            .classList
            .remove('d-none');


        $('payrollPeriodMobileList')
            .classList
            .remove('d-none');


        $('payrollPeriodTableBody')
            .innerHTML =
            periods.map(
                item => `

                    <tr>

                        <td>

                            <div class="payroll-period-name">

                                ${escapeHtml(
                    item.name ||
                    `${months[
                    Number(item.month) - 1
                    ]} ${item.year}`,
                )}

                            </div>

                        </td>


                        <td>
                            ${formatDate(
                    item.startDate,
                )}
                        </td>


                        <td>
                            ${formatDate(
                    item.endDate,
                )}
                        </td>


                        <td>
                            ${statusBadge(
                    item.status,
                )}
                        </td>


                        <td class="text-end">

                            ${actionButtons(item)}

                        </td>

                    </tr>

                `,
            )
                .join('');


        $('payrollPeriodMobileList')
            .innerHTML =
            periods.map(
                item => `

                    <div class="payroll-period-card">

                        <div class="d-flex justify-content-between gap-3">

                            <div>

                                <div class="payroll-period-name">

                                    ${escapeHtml(
                    item.name ||
                    `${months[
                    Number(item.month) - 1
                    ]} ${item.year}`,
                )}

                                </div>

                                <div class="payroll-period-meta text-muted mt-1">

                                    ${formatDate(
                    item.startDate,
                )}

                                    →

                                    ${formatDate(
                    item.endDate,
                )}

                                </div>

                            </div>


                            <div>

                                ${statusBadge(
                    item.status,
                )}

                            </div>

                        </div>


                        <div class="mt-3">

                            ${actionButtons(item)}

                        </div>

                    </div>

                `,
            )
                .join('');

    }


    async function loadPeriods() {

        $('payrollPeriodLoading')
            .classList
            .remove('d-none');


        $('payrollPeriodEmpty')
            .classList
            .add('d-none');


        $('payrollPeriodTableWrap')
            .classList
            .add('d-none');


        $('payrollPeriodMobileList')
            .classList
            .add('d-none');


        try {

            const response =
                await Api.get(
                    '/payroll-periods/data',
                );


            periods =
                Array.isArray(response)
                    ? response
                    : response?.periods || [];


            render();

        } catch (error) {

            $('payrollPeriodLoading')
                .classList
                .add('d-none');


            AppAlert.error(
                error?.message ||
                'Failed to load payroll periods',
            );

        }

    }


    function setDefaultDate() {

        const now =
            new Date();


        $('payrollYear')
            .value =
            now.getFullYear();


        $('payrollMonth')
            .value =
            now.getMonth() + 1;


        updatePreview();

    }


    function updatePreview() {

        const year =
            Number(
                $('payrollYear').value,
            );


        const month =
            Number(
                $('payrollMonth').value,
            );


        if (
            !year ||
            !month ||
            month < 1 ||
            month > 12
        ) {

            $('payrollPeriodPreview')
                .classList
                .add('d-none');

            return;

        }


        const lastDay =
            new Date(
                year,
                month,
                0,
            ).getDate();


        const startDate =
            `${year}-${String(month).padStart(2, '0')}-01`;


        const endDate =
            `${year}-${String(month).padStart(2, '0')}-${String(lastDay).padStart(2, '0')}`;


        $('payrollPeriodPreviewName')
            .textContent =
            `${months[month - 1]} ${year}`;


        $('payrollPeriodPreviewDates')
            .textContent =
            `${formatDate(startDate)} → ${formatDate(endDate)}`;


        $('payrollPeriodPreview')
            .classList
            .remove('d-none');

    }


    function resetForm() {

        $('payrollPeriodForm')
            .reset();


        setDefaultDate();

    }


    function openModal() {

        resetForm();


        modal =
            bootstrap.Modal
                .getOrCreateInstance(
                    $('payrollPeriodModal'),
                );


        modal.show();

    }


    async function createPeriod(
        event,
    ) {

        event.preventDefault();


        const year =
            Number(
                $('payrollYear').value,
            );


        const month =
            Number(
                $('payrollMonth').value,
            );


        if (
            !year ||
            year < 2000
        ) {

            AppAlert.error(
                'Valid year is required',
            );

            return;

        }


        if (
            !month ||
            month < 1 ||
            month > 12
        ) {

            AppAlert.error(
                'Valid month is required',
            );

            return;

        }


        try {

            $('savePayrollPeriodBtn')
                .disabled = true;


            AppAlert.loading(
                'Creating payroll period...',
            );


            await Api.post(
                '/payroll-periods',
                {
                    year,
                    month,
                },
            );


            AppAlert.close();


            bootstrap.Modal
                .getOrCreateInstance(
                    $('payrollPeriodModal'),
                )
                .hide();


            await loadPeriods();


            AppAlert.success(
                'Payroll period created successfully',
            );

        } catch (error) {

            AppAlert.close();


            AppAlert.error(
                error?.message ||
                'Failed to create payroll period',
            );

        } finally {

            $('savePayrollPeriodBtn')
                .disabled = false;

        }

    }


    window.startPayrollProcessing =
        async function (
            id,
        ) {

            const confirmed =
                await AppAlert.confirm(
                    'Start processing this payroll period?',
                );


            if (!confirmed) {
                return;
            }


            try {

                AppAlert.loading(
                    'Starting payroll processing...',
                );


                await Api.patch(
                    `/payroll-periods/${id}/processing`,
                    {},
                );


                AppAlert.close();


                await loadPeriods();


                AppAlert.success(
                    'Payroll period is now processing',
                );

            } catch (error) {

                AppAlert.close();


                AppAlert.error(
                    error?.message ||
                    'Failed to start payroll processing',
                );

            }

        };


    window.markPayrollProcessed =
        async function (
            id,
        ) {

            const confirmed =
                await AppAlert.confirm(
                    'Mark this payroll period as processed?',
                );


            if (!confirmed) {
                return;
            }


            try {

                AppAlert.loading(
                    'Finalizing payroll period...',
                );


                await Api.patch(
                    `/payroll-periods/${id}/processed`,
                    {},
                );


                AppAlert.close();


                await loadPeriods();


                AppAlert.success(
                    'Payroll period marked as processed',
                );

            } catch (error) {

                AppAlert.close();


                AppAlert.error(
                    error?.message ||
                    'Failed to process payroll period',
                );

            }

        };


    window.closePayrollPeriod =
        async function (
            id,
        ) {

            const confirmed =
                await AppAlert.confirm(
                   'Close this payroll period? You can reopen it later if payment corrections are required.',
                );


            if (!confirmed) {
                return;
            }


            try {

                AppAlert.loading(
                    'Closing payroll period...',
                );


                await Api.patch(
                    `/payroll-periods/${id}/closed`,
                    {},
                );


                AppAlert.close();


                await loadPeriods();


                AppAlert.success(
                    'Payroll period closed successfully',
                );

            } catch (error) {

                AppAlert.close();


                AppAlert.error(
                    error?.message ||
                    'Failed to close payroll period',
                );

            }

        };

    window.reopenPayrollPeriod =
        async function (
            id,
        ) {

            const confirmed =
                await AppAlert.confirm(
                    'Reopen this payroll period? It will become processed and can be paid again.',
                );


            if (!confirmed) {
                return;
            }


            try {

                AppAlert.loading(
                    'Reopening payroll period...',
                );


                await Api.patch(
                    `/payroll-periods/${id}/reopen`,
                    {},
                );


                AppAlert.close();


                await loadPeriods();


                AppAlert.success(
                    'Payroll period reopened successfully',
                );

            } catch (error) {

                AppAlert.close();


                AppAlert.error(
                    error?.message ||
                    'Failed to reopen payroll period',
                );

            }

        };

    window.initializePayrollPeriodsPage =
        async function () {

            modal =
                bootstrap.Modal
                    .getOrCreateInstance(
                        $('payrollPeriodModal'),
                    );


            $('addPayrollPeriodBtn')
                .addEventListener(
                    'click',
                    openModal,
                );


            $('payrollPeriodForm')
                .addEventListener(
                    'submit',
                    createPeriod,
                );


            $('payrollYear')
                .addEventListener(
                    'input',
                    updatePreview,
                );


            $('payrollMonth')
                .addEventListener(
                    'change',
                    updatePreview,
                );


            $('payrollPeriodModal')
                .addEventListener(
                    'hidden.bs.modal',
                    resetForm,
                );


            setDefaultDate();


            await loadPeriods();

        };

})();