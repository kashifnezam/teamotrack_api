(function () {
  'use strict';

  let periods = [];

  let records = [];

  const $ = (id) => document.getElementById(id);

  function escapeHtml(value = '') {
    return String(value)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
  }

  function money(value) {
    return new Intl.NumberFormat('en-IN', {
      style: 'currency',
      currency: 'INR',
      maximumFractionDigits: 2,
    }).format(Number(value || 0));
  }

  function statusBadge(status) {
    if (status === 'calculated') {
      return `
                <span class="badge text-bg-success">
                    Calculated
                </span>
            `;
    }

    return `
            <span class="badge text-bg-secondary">
                ${escapeHtml(status || 'Unknown')}
            </span>
        `;
  }

  function renderSummary() {
    if (!records.length) {
      $('payrollCalculationSummary').classList.add('d-none');

      return;
    }

    const gross = records.reduce(
      (total, item) => total + Number(item.salary?.payableGross || item.salary?.grossSalary || 0),
      0
    );

    const deduction = records.reduce(
      (total, item) => total + Number(item.salary?.payableDeduction || item.salary?.totalDeduction || 0),
      0
    );

    const net = records.reduce((total, item) => total + Number(item.salary?.netSalary || 0), 0);

    $('summaryEmployees').textContent = records.length;

    $('summaryGross').textContent = money(gross);

    $('summaryDeduction').textContent = money(deduction);

    $('summaryNet').textContent = money(net);

    $('payrollCalculationSummary').classList.remove('d-none');
  }

  function render() {
    $('payrollCalculationLoading').classList.add('d-none');

    renderSummary();

    if (!records.length) {
      $('payrollCalculationEmpty').classList.remove('d-none');

      $('payrollCalculationTableWrap').classList.add('d-none');

      $('payrollCalculationMobileList').classList.add('d-none');

      return;
    }

    $('payrollCalculationEmpty').classList.add('d-none');

    $('payrollCalculationTableWrap').classList.remove('d-none');

    $('payrollCalculationMobileList').classList.remove('d-none');

    $('payrollCalculationTableBody').innerHTML = records
      .map((item) => {
        const salary = item.salary || {};

        const attendance = item.attendance || {};

        return `

                        <tr>

                            <td>

                                <div class="fw-semibold">
                                    ${escapeHtml(item.employeeName || item.employeeId || '')}
                                </div>

                                <div class="small text-muted">
                                    ${escapeHtml(item.role || '')}
                                </div>

                            </td>


                            <td>
                                ${Number(item.workingDays || 0)}
                            </td>


                            <td>
                                ${Number(item.payableDays || 0)}
                            </td>


                            <td>
                                ${money(salary.payableGross ?? salary.grossSalary)}
                            </td>


                            <td>
                                ${money(salary.payableDeduction ?? salary.totalDeduction)}
                            </td>


                            <td class="fw-semibold">
                                ${money(salary.netSalary)}
                            </td>


                            <td>
                                ${statusBadge(item.status)}
                            </td>

                        </tr>

                    `;
      })
      .join('');

    $('payrollCalculationMobileList').innerHTML = records
      .map((item) => {
        const salary = item.salary || {};

        const attendance = item.attendance || {};

        return `

                        <div class="payroll-calculation-card">

                            <div class="d-flex justify-content-between gap-3">

                                <div>

                                    <div class="payroll-calculation-name">

                                        ${escapeHtml(item.employeeName || item.employeeId || '')}

                                    </div>

                                    <div class="small text-muted">

                                        ${escapeHtml(item.role || '')}

                                    </div>

                                </div>


                                ${statusBadge(item.status)}

                            </div>


                            <div class="row g-3 mt-2">

                                <div class="col-6">

                                    <div class="payroll-calculation-meta text-muted">
                                        Working Days
                                    </div>

                                    <div class="fw-semibold">
                                        ${Number(item.workingDays || 0)}
                                    </div>

                                </div>


                                <div class="col-6">

                                    <div class="payroll-calculation-meta text-muted">
                                        Payable Days
                                    </div>

                                    <div class="fw-semibold">
                                        ${Number(item.payableDays || 0)}
                                    </div>

                                </div>


                                <div class="col-6">

                                    <div class="payroll-calculation-meta text-muted">
                                        Gross
                                    </div>

                                    <div class="payroll-calculation-amount">
                                        ${money(salary.payableGross ?? salary.grossSalary)}
                                    </div>

                                </div>


                                <div class="col-6">

                                    <div class="payroll-calculation-meta text-muted">
                                        Deduction
                                    </div>

                                    <div class="payroll-calculation-amount">
                                        ${money(salary.payableDeduction ?? salary.totalDeduction)}
                                    </div>

                                </div>


                                <div class="col-12">

                                    <div class="payroll-calculation-meta text-muted">
                                        Net Salary
                                    </div>

                                    <div class="fs-5 fw-semibold">
                                        ${money(salary.netSalary)}
                                    </div>

                                </div>

                            </div>


                            <div class="small text-muted mt-3">

                                Present:
                                ${Number(attendance.present || 0)}

                                ·

                                Late:
                                ${Number(attendance.late || 0)}

                                ·

                                Half Day:
                                ${Number(attendance.halfDay || 0)}

                                ·

                                Absent:
                                ${Number(attendance.absent || 0)}

                            </div>

                        </div>

                    `;
      })
      .join('');
  }

  function setLoading(loading) {
    if (loading) {
      $('payrollCalculationLoading').classList.remove('d-none');

      $('payrollCalculationSummary').classList.add('d-none');

      $('payrollCalculationEmpty').classList.add('d-none');

      $('payrollCalculationTableWrap').classList.add('d-none');

      $('payrollCalculationMobileList').classList.add('d-none');
    }
  }

  async function loadPeriods() {
    try {
      AppAlert.loading('Loading payroll periods...');
      const response = await Api.get('/payroll-periods/data');

      periods = Array.isArray(response) ? response : response?.periods || [];

      const select = $('payrollCalculationPeriod');

      select.innerHTML = `
                <option value="">
                    Select payroll period
                </option>
            `;

      periods.forEach((period) => {
        const option = document.createElement('option');

        option.value = period.id;

        option.textContent = period.name || `${period.year}-${String(period.month).padStart(2, '0')}`;

        select.appendChild(option);
      });
      AppAlert.close();
    } catch (error) {
      AppAlert.error(error?.message || 'Failed to load payroll periods');
      AppAlert.close();
    }
  }

  async function loadCalculations(periodId) {
    selectedPeriodId = periodId || '';

    /*
     * No period selected.
     *
     * This is the default page state.
     * Do not show the loader.
     */
    if (!periodId) {
      records = [];

      $('payrollCalculationLoading').classList.add('d-none');

      $('payrollCalculationSummary').classList.add('d-none');

      $('payrollCalculationEmpty').classList.remove('d-none');

      $('payrollCalculationTableWrap').classList.add('d-none');

      $('payrollCalculationMobileList').classList.add('d-none');

      return;
    }

    /*
     * A period was selected.
     * Now show the loader while
     * fetching its calculations.
     */
    setLoading(true);

    try {
      const response = await Api.get(`/payroll-calculations/data/${periodId}`);

      records = Array.isArray(response) ? response : response?.records || [];

      render();
    } catch (error) {
      $('payrollCalculationLoading').classList.add('d-none');

      AppAlert.error(error?.message || 'Failed to load payroll calculations');
    }
  }

  async function calculatePayroll() {
    const periodId = $('payrollCalculationPeriod').value;

    if (!periodId) {
      AppAlert.error('Select a payroll period');

      return;
    }

    const period = periods.find((item) => item.id === periodId);

    if (period?.status === 'closed') {
      AppAlert.error('Closed payroll period cannot be recalculated');

      return;
    }

    const confirmed = await AppAlert.confirm('Calculate payroll for the selected period?');

    if (!confirmed) {
      return;
    }

    try {
      $('calculatePayrollBtn').disabled = true;

      AppAlert.loading('Calculating payroll...');

      const response = await Api.post('/payroll-calculations', {
        payrollPeriodId: periodId,
      });

      AppAlert.close();

      records = response?.records || [];

      render();

      AppAlert.success(`Payroll calculated for ${response?.totalEmployees || records.length} employees`);
    } catch (error) {
      AppAlert.close();

      AppAlert.error(error?.message || 'Failed to calculate payroll');
    } finally {
      $('calculatePayrollBtn').disabled = false;
    }
  }

  window.initializePayrollCalculationsPage = async function () {
    $('payrollCalculationPeriod').addEventListener('change', (event) => loadCalculations(event.target.value));

    $('calculatePayrollBtn').addEventListener('click', calculatePayroll);

    /*
     * Default state:
     * No period selected.
     */
    records = [];

    $('payrollCalculationLoading').classList.add('d-none');

    $('payrollCalculationSummary').classList.add('d-none');

    $('payrollCalculationEmpty').classList.remove('d-none');

    $('payrollCalculationTableWrap').classList.add('d-none');

    $('payrollCalculationMobileList').classList.add('d-none');

    await loadPeriods();
  };
})();
