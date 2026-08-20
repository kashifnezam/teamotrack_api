(function () {

    'use strict';


    let payslips = [];

    let periods = [];

    let selectedPayslip = null;

    let currentTemplate =
        'professional';

    let selectedTemplate =
        'professional';


    const $ =
        id =>
            document.getElementById(id);


    const templates = {

        professional: {
            title: 'Professional',
            description:
                'Formal HR-friendly layout.',
        },

        modern: {
            title: 'Modern',
            description:
                'Clean digital-first design.',
        },

        classic: {
            title: 'Classic',
            description:
                'Traditional detailed payslip.',
        },

        compact: {
            title: 'Compact',
            description:
                'Minimal one-page layout.',
        },

    };


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


    function money(
        value,
    ) {

        return new Intl.NumberFormat(
            'en-IN',
            {
                style: 'currency',
                currency: 'INR',
                maximumFractionDigits: 2,
            },
        ).format(
            Number(value || 0),
        );

    }


    function formatDate(
        value,
    ) {

        if (!value) {
            return '-';
        }


        if (
            typeof value === 'string' &&
            /^\d{4}-\d{2}-\d{2}$/.test(value)
        ) {

            const [
                year,
                month,
                day,
            ] =
                value.split('-');


            return `${day}-${month}-${year}`;

        }


        const date =
            new Date(value);


        if (
            Number.isNaN(
                date.getTime(),
            )
        ) {

            return '-';

        }


        return new Intl.DateTimeFormat(
            'en-IN',
            {
                day: '2-digit',
                month: 'short',
                year: 'numeric',
            },
        ).format(date);

    }


    function methodLabel(
        value,
    ) {

        const labels = {

            cash:
                'Cash',

            bank_transfer:
                'Bank Transfer',

            upi:
                'UPI',

            cheque:
                'Cheque',

        };


        return (
            labels[value] ||
            value ||
            '-'
        );

    }


    // ==================================================
    // SUMMARY
    // ==================================================

    function renderSummary() {

        if (!payslips.length) {

            $('payslipSummary')
                .classList
                .add('d-none');

            return;

        }


        const total =
            payslips.reduce(
                (
                    sum,
                    item,
                ) =>
                    sum +
                    Number(
                        item.salary?.netSalary ||
                        item.amount ||
                        0,
                    ),
                0,
            );


        $('payslipCount')
            .textContent =
            payslips.length;


        $('payslipTotal')
            .textContent =
            money(total);


        $('payslipSummary')
            .classList
            .remove('d-none');

    }


    // ==================================================
    // LIST
    // ==================================================

    function render() {

        $('payslipLoading')
            .classList
            .add('d-none');


        renderSummary();


        if (!payslips.length) {

            $('payslipEmpty')
                .classList
                .remove('d-none');

            $('payslipTableWrap')
                .classList
                .add('d-none');

            $('payslipMobileList')
                .classList
                .add('d-none');

            return;

        }


        $('payslipEmpty')
            .classList
            .add('d-none');


        $('payslipTableWrap')
            .classList
            .remove('d-none');


        $('payslipMobileList')
            .classList
            .remove('d-none');


        $('payslipTableBody')
            .innerHTML =
            payslips.map(
                item => {

                    const salary =
                        item.salary ||
                        {};

                    const payment =
                        item.payment ||
                        {};

                    const attendance =
                        item.attendance ||
                        {};


                    return `

                        <tr>

                            <td>

                                <div class="fw-semibold">

                                    ${escapeHtml(
                        item.employee?.name ||
                        item.employeeName ||
                        '-',
                    )}

                                </div>

                                <div class="small text-muted">

                                    ${escapeHtml(
                        item.employee?.role ||
                        '',
                    )}

                                </div>

                            </td>


                            <td>

                                ${Number(
                        attendance.payableDays ||
                        item.payableDays ||
                        0,
                    )}

                            </td>


                            <td>

                                ${money(
                        salary.payableGross ??
                        salary.grossSalary ??
                        0,
                    )}

                            </td>


                            <td>

                                ${money(
                        salary.payableDeduction ??
                        salary.totalDeduction ??
                        0,
                    )}

                            </td>


                            <td class="fw-semibold">

                                ${money(
                        salary.netSalary ??
                        item.amount ??
                        0,
                    )}

                            </td>


                            <td>

                                ${formatDate(
                        payment.paymentDate ||
                        item.paymentDate,
                    )}

                            </td>


                            <td>

                                ${escapeHtml(
                        methodLabel(
                            payment.paymentMethod ||
                            item.paymentMethod,
                        ),
                    )}

                            </td>


                            <td class="text-end">

                                <button
                                    class="btn btn-sm btn-outline-primary"
                                    data-payslip-view="${escapeHtml(
                        item.paymentId ||
                        item.id,
                    )}">

                                    <i class="bi bi-eye me-1"></i>
                                    View

                                </button>

                            </td>

                        </tr>

                    `;

                },
            )
                .join('');


        $('payslipMobileList')
            .innerHTML =
            payslips.map(
                item => {

                    const salary =
                        item.salary ||
                        {};

                    const payment =
                        item.payment ||
                        {};

                    const attendance =
                        item.attendance ||
                        {};


                    return `

                        <div class="p-3 border-bottom">

                            <div class="d-flex justify-content-between">

                                <div>

                                    <div class="fw-semibold">

                                        ${escapeHtml(
                        item.employee?.name ||
                        item.employeeName ||
                        '-',
                    )}

                                    </div>

                                    <div class="small text-muted">

                                        ${escapeHtml(
                        item.employee?.role ||
                        '',
                    )}

                                    </div>

                                </div>

                                <span class="badge text-bg-success">
                                    Paid
                                </span>

                            </div>


                            <div class="row g-3 mt-2">

                                <div class="col-6">

                                    <div class="small text-muted">
                                        Payable Days
                                    </div>

                                    <div class="fw-semibold">

                                        ${Number(
                        attendance.payableDays ||
                        0,
                    )}

                                    </div>

                                </div>


                                <div class="col-6">

                                    <div class="small text-muted">
                                        Net Salary
                                    </div>

                                    <div class="fw-semibold">

                                        ${money(
                        salary.netSalary ||
                        item.amount ||
                        0,
                    )}

                                    </div>

                                </div>

                            </div>


                            <button
                                class="btn btn-sm btn-outline-primary w-100 mt-3"
                                data-payslip-view="${escapeHtml(
                        item.paymentId ||
                        item.id,
                    )}">

                                View Payslip

                            </button>

                        </div>

                    `;

                },
            )
                .join('');

    }


    // ==================================================
    // TEMPLATE PREVIEW
    // ==================================================

    function templatePreview(
        template,
    ) {

        const data = {

            company: {
                name: 'Your Company',
            },

            employee: {
                name: 'Employee Name',
            },

            period: {
                name: 'August 2026',
            },

            salary: {
                grossSalary: 50000,
                totalDeduction: 5000,
                netSalary: 45000,
            },

        };


        return renderTemplate(
            template,
            data,
            true,
        );

    }


    function renderTemplateCards() {

        $('payslipTemplates')
            .innerHTML =
            Object.keys(templates)
                .map(
                    key => {

                        const item =
                            templates[key];


                        const isSelected =
                            selectedTemplate === key;


                        return `

                        <div class="col-12 col-md-6 col-xl-3">

                            <div
                                class="payslip-template-card ${isSelected
                                ? 'active'
                                : ''
                            }"
                                data-template="${key}">


                                ${isSelected
                                ? `
                                            <div class="payslip-template-selected">

                                                <i class="bi bi-check2"></i>

                                            </div>
                                        `
                                : ''
                            }


                                <div class="d-flex align-items-start gap-2 pe-4">

                                    <div>

                                        <div class="payslip-template-title">

                                            ${item.title}

                                            ${key === 'professional'
                                ? `
                                                        <span class="payslip-template-recommended">

                                                            <i class="bi bi-star-fill"></i>

                                                            Recommended

                                                        </span>
                                                    `
                                : ''
                            }

                                        </div>


                                        <div class="payslip-template-description">

                                            ${item.description}

                                        </div>

                                    </div>

                                </div>


                                <div class="payslip-template-preview">

                                    ${templatePreview(key)}

                                </div>


                                <div class="d-flex justify-content-between align-items-center mt-3">

                                    <div class="small text-muted">

                                        ${isSelected
                                ? `
                                                    <i class="bi bi-check-circle-fill text-primary me-1"></i>
                                                    Selected
                                                `
                                : `
                                                    Click to select
                                                `
                            }

                                    </div>


                                    ${!isSelected
                                ? `
                                                <button
                                                    type="button"
                                                    class="btn btn-sm btn-outline-primary"
                                                    data-template-select="${key}">

                                                    Use Template

                                                </button>
                                            `
                                : `
                                                <span class="small fw-semibold text-primary">

                                                    Current Template

                                                </span>
                                            `
                            }

                                </div>

                            </div>

                        </div>

                    `;

                    },
                )
                .join('');

    }


    // ==================================================
    // TEMPLATE RENDERER
    // ==================================================

    function renderTemplate(
        template,
        data,
        preview = false,
    ) {

        const company =
            data.company ||
            {};

        const employee =
            data.employee ||
            {};

        const period =
            data.period ||
            {};

        const salary =
            data.salary ||
            {};


        const header = `

            <div class="d-flex justify-content-between gap-3 mb-3">

                <div>

                    <div class="payslip-company">

                        ${escapeHtml(
            company.name ||
            'Company Name',
        )}

                    </div>

                    ${preview
                ? ''
                : `
                                <div class="payslip-muted">
                                    ${escapeHtml(
                    company.address ||
                    '',
                )}
                                </div>
                            `
            }

                </div>


                <div class="text-end">

                    <div class="payslip-title">
                        Salary Payslip
                    </div>

                    <div class="payslip-muted">

                        ${escapeHtml(
                period.name ||
                '',
            )}

                    </div>

                </div>

            </div>

        `;


        const employeeInfo = `

            <div class="row g-3">

                <div class="col-6">

                    <div class="payslip-muted">
                        Employee
                    </div>

                    <div class="fw-semibold">

                        ${escapeHtml(
            employee.name ||
            'Employee',
        )}

                    </div>

                </div>


                <div class="col-6">

                    <div class="payslip-muted">
                        Period
                    </div>

                    <div class="fw-semibold">

                        ${escapeHtml(
            period.name ||
            '-',
        )}

                    </div>

                </div>

            </div>

        `;


        const salaryRows = `

            <div class="payslip-row">

                <span>
                    Gross Salary
                </span>

                <strong>
                    ${money(
            salary.grossSalary,
        )}
                </strong>

            </div>


            <div class="payslip-row">

                <span>
                    Deductions
                </span>

                <strong>
                    ${money(
            salary.totalDeduction,
        )}
                </strong>

            </div>


            <div class="payslip-row payslip-total">

                <span>
                    Net Salary
                </span>

                <strong class="payslip-net">

                    ${money(
            salary.netSalary,
        )}

                </strong>

            </div>

        `;


        if (
            template === 'modern'
        ) {

            return `

                <div class="payslip-sheet payslip-modern">

                    ${header}

                    ${employeeInfo}


                    <div class="payslip-section">

                        <div class="payslip-modern payslip-net-box">

                            <div class="small">
                                Net Salary
                            </div>

                            <div class="fs-3 fw-bold">

                                ${money(
                salary.netSalary,
            )}

                            </div>

                        </div>

                    </div>


                    <div class="payslip-section">

                        ${salaryRows}

                    </div>

                </div>

            `;

        }


        if (
            template === 'classic'
        ) {

            return `

                <div class="payslip-sheet payslip-classic">

                    ${header}

                    ${employeeInfo}


                    <div class="payslip-section">

                        <table>

                            <tr>

                                <th>
                                    Description
                                </th>

                                <th>
                                    Amount
                                </th>

                            </tr>


                            <tr>

                                <td>
                                    Gross Salary
                                </td>

                                <td>
                                    ${money(
                salary.grossSalary,
            )}
                                </td>

                            </tr>


                            <tr>

                                <td>
                                    Deductions
                                </td>

                                <td>
                                    ${money(
                salary.totalDeduction,
            )}
                                </td>

                            </tr>


                            <tr>

                                <th>
                                    Net Salary
                                </th>

                                <th>
                                    ${money(
                salary.netSalary,
            )}
                                </th>

                            </tr>

                        </table>

                    </div>

                </div>

            `;

        }


        if (
            template === 'compact'
        ) {

            return `

                <div class="payslip-sheet payslip-compact">

                    ${header}

                    ${employeeInfo}


                    <div class="payslip-section">

                        ${salaryRows}

                    </div>

                </div>

            `;

        }


        return `

            <div class="payslip-sheet">

                ${header}

                ${employeeInfo}


                <div class="payslip-section">

                    <div class="payslip-section-title">
                        Salary Summary
                    </div>

                    ${salaryRows}

                </div>

            </div>

        `;

    }


    // ==================================================
    // LOAD TEMPLATE
    // ==================================================

    async function loadTemplateSettings() {

        try {

            const response =
                await Api.get(
                    '/payslips/template/settings',
                );


            currentTemplate =
                response?.payslipTemplate ||
                'professional';


            selectedTemplate =
                currentTemplate;

        } catch (error) {

            currentTemplate =
                'professional';

            selectedTemplate =
                currentTemplate;

        }

    }


    // ==================================================
    // TEMPLATE MODAL
    // ==================================================

    async function openTemplateModal() {

        selectedTemplate =
            currentTemplate;


        renderTemplateCards();


        bootstrap.Modal
            .getOrCreateInstance(
                $('payslipTemplateModal'),
            )
            .show();

    }


    async function saveTemplate() {

        if (
            selectedTemplate ===
            currentTemplate
        ) {

            bootstrap.Modal
                .getInstance(
                    $('payslipTemplateModal'),
                )
                ?.hide();

            return;

        }


        try {

            $('savePayslipTemplateBtn')
                .disabled = true;


            AppAlert.loading(
                'Saving payslip template...',
            );


            await Api.patch(
                '/payslips/template',
                {
                    template:
                        selectedTemplate,
                },
            );


            AppAlert.close();


            currentTemplate =
                selectedTemplate;


            bootstrap.Modal
                .getInstance(
                    $('payslipTemplateModal'),
                )
                ?.hide();


            AppAlert.success(
                'Payslip template updated',
            );

        } catch (error) {

            AppAlert.close();


            AppAlert.error(
                error?.message ||
                'Failed to save payslip template',
            );

        } finally {

            $('savePayslipTemplateBtn')
                .disabled = false;

        }

    }


    // ==================================================
    // VIEW PAYSLIP
    // ==================================================

    async function viewPayslip(
        paymentId,
    ) {

        try {

            AppAlert.loading(
                'Loading payslip...',
            );


            const response =
                await Api.get(
                    `/payslips/${paymentId}`,
                );


            AppAlert.close();


            selectedPayslip =
                response;


            renderPayslip(
                response,
            );

        } catch (error) {

            AppAlert.close();


            AppAlert.error(
                error?.message ||
                'Failed to load payslip',
            );

        }

    }


    function renderPayslip(
        data,
    ) {

        const template =
            data.template ||
            currentTemplate ||
            'professional';


        $('payslipModalPeriod')
            .textContent =
            data.period?.name ||
            '';


        $('payslipModalBody')
            .innerHTML =
            renderTemplate(
                template,
                data,
            );


        bootstrap.Modal
            .getOrCreateInstance(
                $('payslipModal'),
            )
            .show();

    }


    // ==================================================
    // PRINT
    // ==================================================

    function printPayslip() {

        const element =
            $('payslipModalBody')
                ?.firstElementChild;


        if (!element) {
            return;
        }


        const printWindow =
            window.open(
                '',
                '_blank',
                'width=900,height=700',
            );


        if (!printWindow) {

            AppAlert.error(
                'Please allow pop-ups to print the payslip',
            );

            return;

        }


        const styles =
            [...document.styleSheets]
                .map(
                    sheet => {

                        try {

                            return [...sheet.cssRules]
                                .map(
                                    rule =>
                                        rule.cssText,
                                )
                                .join('');

                        } catch {

                            return '';

                        }

                    },
                )
                .join('');


        printWindow.document.write(`

            <!DOCTYPE html>

            <html>

            <head>

                <title>
                    Payslip
                </title>

                <style>

                    ${styles}

                    body {
                        margin: 0;
                        padding: 30px;
                        background: #fff;
                    }

                    .payslip-sheet {
                        margin: auto;
                    }

                    @media print {

                        body {
                            padding: 0;
                        }

                    }

                </style>

            </head>


            <body>

                ${element.outerHTML}

            </body>

            </html>

        `);


        printWindow.document.close();


        printWindow.focus();


        setTimeout(
            () => {

                printWindow.print();

                printWindow.close();

            },
            300,
        );

    }


    // ==================================================
    // PERIODS
    // ==================================================

    async function loadPeriods() {

        try {

            const response =
                await Api.get(
                    '/payroll-periods/data',
                );


            periods =
                Array.isArray(response)
                    ? response
                    : response?.periods ||
                    [];


            const select =
                $('payslipPeriod');


            select.innerHTML = `

                <option value="">
                    Select payroll period
                </option>

            `;


            periods.forEach(
                period => {

                    const option =
                        document.createElement(
                            'option',
                        );


                    option.value =
                        period.id;


                    option.textContent =
                        period.name ||
                        `${period.year}-${String(
                            period.month,
                        ).padStart(
                            2,
                            '0',
                        )}`;


                    select.appendChild(
                        option,
                    );

                },
            );

        } catch (error) {

            AppAlert.error(
                error?.message ||
                'Failed to load payroll periods',
            );

        }

    }


    // ==================================================
    // LOAD PAYSLIPS
    // ==================================================

    async function loadPayslips() {

        const periodId =
            $('payslipPeriod')
                .value;


        if (!periodId) {

            payslips = [];


            $('payslipLoading')
                .classList
                .add('d-none');


            $('payslipSummary')
                .classList
                .add('d-none');


            $('payslipTableWrap')
                .classList
                .add('d-none');


            $('payslipMobileList')
                .classList
                .add('d-none');


            $('payslipEmpty')
                .classList
                .remove('d-none');


            $('payslipEmptyTitle')
                .textContent =
                'Select a payroll period';


            $('payslipEmptyText')
                .textContent =
                'Select a payroll period to view payslips.';


            return;

        }


        $('payslipLoading')
            .classList
            .remove('d-none');


        $('payslipLoadingText')
            .textContent =
            'Loading payslips...';


        $('payslipEmpty')
            .classList
            .add('d-none');


        $('payslipTableWrap')
            .classList
            .add('d-none');


        $('payslipMobileList')
            .classList
            .add('d-none');


        try {

            const response =
                await Api.get(
                    `/payslips/period/${periodId}`,
                );


            payslips =
                response?.payslips ||
                [];


            render();

        } catch (error) {

            $('payslipLoading')
                .classList
                .add('d-none');


            AppAlert.error(
                error?.message ||
                'Failed to load payslips',
            );

        }

    }


    // ==================================================
    // EVENTS
    // ==================================================

    function bindEvents() {

        $('payslipPeriod')
            .addEventListener(
                'change',
                loadPayslips,
            );

        $('payslipTemplateInfoBtn')
            .addEventListener(
                'click',
                openTemplateModal,
            );

        $('payslipTemplateBtn')
            .addEventListener(
                'click',
                openTemplateModal,
            );


        $('savePayslipTemplateBtn')
            .addEventListener(
                'click',
                saveTemplate,
            );


        $('printPayslipBtn')
            .addEventListener(
                'click',
                printPayslip,
            );


        $('payslipTemplates')
            .addEventListener(
                'click',
                event => {

                    const card =
                        event.target.closest(
                            '[data-template]',
                        );


                    if (!card) {
                        return;
                    }


                    selectedTemplate =
                        card.dataset.template;


                    renderTemplateCards();

                },
            );


        document.addEventListener(
            'click',
            event => {

                const button =
                    event.target.closest(
                        '[data-payslip-view]',
                    );


                if (!button) {
                    return;
                }


                viewPayslip(
                    button.dataset.payslipView,
                );

            },
        );

    }


    // ==================================================
    // INITIALIZE
    // ==================================================

    window.initializePayslipsPage =
        async function () {

            bindEvents();


            await Promise.all([
                loadPeriods(),
                loadTemplateSettings(),
            ]);


            payslips = [];


            $('payslipLoading')
                .classList
                .add('d-none');


            $('payslipEmpty')
                .classList
                .remove('d-none');


            $('payslipEmptyTitle')
                .textContent =
                'Select a payroll period';


            $('payslipEmptyText')
                .textContent =
                'Select a payroll period to view payslips.';

        };


})();