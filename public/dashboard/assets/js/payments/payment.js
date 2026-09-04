(function () {
  'use strict';

  let payments = [];

  let payable = [];

  let periods = [];

  let selectedPayrollRecord = null;

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

  function formatDate(value) {
    if (!value) {
      return '-';
    }

    const date = new Date(value);

    if (Number.isNaN(date.getTime())) {
      return '-';
    }

    return new Intl.DateTimeFormat('en-IN', {
      day: '2-digit',
      month: 'short',
      year: 'numeric',
    }).format(date);
  }

  function statusBadge(status) {
    if (status === 'paid') {
      return `
                <span class="badge text-bg-success">
                    Paid
                </span>
            `;
    }

    if (status === 'cancelled') {
      return `
                <span class="badge text-bg-danger">
                    Cancelled
                </span>
            `;
    }

    if (status === 'unpaid') {
      return `
                <span class="badge text-bg-warning">
                    Pending
                </span>
            `;
    }

    return `
            <span class="badge text-bg-secondary">
                ${escapeHtml(status || 'Unknown')}
            </span>
        `;
  }

  function methodLabel(method) {
    const labels = {
      cash: 'Cash',

      bank_transfer: 'Bank Transfer',

      upi: 'UPI',

      cheque: 'Cheque',

      other: 'Other',
    };

    return labels[method] || method || '-';
  }

  function periodName(payment) {
    if (payment.periodName) {
      return payment.periodName;
    }

    const period = periods.find((item) => item.id === payment.payrollPeriodId);

    if (period) {
      return period.name || `${period.year}-${String(period.month).padStart(2, '0')}`;
    }

    return payment.payrollPeriodId || '-';
  }

  function getNetSalary(record) {
    return Number(record.salary?.netSalary || 0);
  }

  function renderSummary() {
    const paid = payments.filter((item) => item.status === 'paid');

    const total = paid.reduce((sum, item) => sum + Number(item.amount || 0), 0);

    const cancelled = payments.filter((item) => item.status === 'cancelled').length;

    $('paymentEmployees').textContent = paid.length;

    $('paymentTotal').textContent = money(total);

    $('paymentPending').textContent = payable.length;

    $('paymentCancelled').textContent = cancelled;

    if (payments.length || payable.length) {
      $('paymentSummary').classList.remove('d-none');
    } else {
      $('paymentSummary').classList.add('d-none');
    }
  }

  function showDetails(id) {
    const payment = payments.find((item) => item.id === id);

    if (!payment) {
      return;
    }

    $('paymentDetailsBody').innerHTML = `

                <div class="mb-3">

                    <div class="small text-muted">
                        Employee
                    </div>

                    <div class="fw-semibold">
                        ${escapeHtml(payment.employeeName || payment.employeeId || '-')}
                    </div>

                </div>


                <div class="row g-3">

                    <div class="col-6">

                        <div class="small text-muted">
                            Period
                        </div>

                        <div class="fw-semibold">
                            ${escapeHtml(periodName(payment))}
                        </div>

                    </div>


                    <div class="col-6">

                        <div class="small text-muted">
                            Amount
                        </div>

                        <div class="fw-semibold">
                            ${money(payment.amount)}
                        </div>

                    </div>


                    <div class="col-6">

                        <div class="small text-muted">
                            Method
                        </div>

                        <div>
                            ${escapeHtml(methodLabel(payment.paymentMethod))}
                        </div>

                    </div>


                    <div class="col-6">

                        <div class="small text-muted">
                            Payment Date
                        </div>

                        <div>
                            ${formatDate(payment.paymentDate)}
                        </div>

                    </div>


                    <div class="col-12">

                        <div class="small text-muted">
                            Transaction ID
                        </div>

                        <div>
                            ${escapeHtml(payment.transactionId || '-')}
                        </div>

                    </div>


                    <div class="col-12">

                        <div class="small text-muted">
                            Remarks
                        </div>

                        <div>
                            ${escapeHtml(payment.remarks || '-')}
                        </div>

                    </div>


                    <div class="col-12">

                        <div class="small text-muted">
                            Status
                        </div>

                        <div>
                            ${statusBadge(payment.status)}
                        </div>

                    </div>

                </div>

            `;

    bootstrap.Modal.getOrCreateInstance($('paymentDetailsModal')).show();
  }

  function openPaymentModal(id) {
    const record = payable.find((item) => item.payrollRecordId === id || item.id === id);

    if (!record) {
      return;
    }

    selectedPayrollRecord = record;

    $('paymentEmployeeName').textContent = record.employeeName || record.employeeId || '-';

    $('paymentAmount').textContent = money(getNetSalary(record));

    $('paymentMethod').value = 'bank_transfer';

    $('paymentTransactionId').value = '';

    $('paymentRemarks').value = '';

    bootstrap.Modal.getOrCreateInstance($('paymentModal')).show();
  }

  async function confirmPayment() {
    if (!selectedPayrollRecord) {
      return;
    }

    const payrollRecordId = selectedPayrollRecord.payrollRecordId || selectedPayrollRecord.id;

    const paymentMethod = $('paymentMethod').value;

    const transactionId = $('paymentTransactionId').value.trim();

    const remarks = $('paymentRemarks').value.trim();

    try {
      $('confirmPaymentBtn').disabled = true;

      AppAlert.loading('Processing payment...');

      await Api.post('/payments', {
        payrollRecordId,

        paymentMethod,

        transactionId,

        remarks,
      });

      AppAlert.close();

      bootstrap.Modal.getInstance($('paymentModal'))?.hide();

      AppAlert.success('Salary paid successfully');

      selectedPayrollRecord = null;

      await loadPayments();
    } catch (error) {
      AppAlert.close();

      AppAlert.error(error?.message || 'Failed to process payment');
    } finally {
      $('confirmPaymentBtn').disabled = false;
    }
  }

  async function cancelPayment(id) {
    const confirmed = await AppAlert.confirm('Cancel this payment?');

    if (!confirmed) {
      return;
    }

    try {
      AppAlert.loading('Cancelling payment...');

      await Api.patch(`/payments/${id}/cancel`, {});

      AppAlert.close();

      AppAlert.success('Payment cancelled successfully');

      await loadPayments();
    } catch (error) {
      AppAlert.close();

      AppAlert.error(error?.message || 'Failed to cancel payment');
    }
  }

  function render() {
    $('paymentLoading').classList.add('d-none');

    renderSummary();

    const rows = [];

    /*
     * Unpaid payroll records.
     */
    payable.forEach((record) => {
      rows.push({
        type: 'payable',

        record,
      });
    });

    /*
     * Existing payment history.
     */
    payments.forEach((payment) => {
      rows.push({
        type: 'payment',

        payment,
      });
    });

    if (!rows.length) {
      $('paymentEmpty').classList.remove('d-none');

      $('paymentTableWrap').classList.add('d-none');

      $('paymentMobileList').classList.add('d-none');

      return;
    }

    $('paymentEmpty').classList.add('d-none');

    $('paymentTableWrap').classList.remove('d-none');

    $('paymentMobileList').classList.remove('d-none');

    $('paymentTableBody').innerHTML = rows
      .map((item) => {
        if (item.type === 'payable') {
          const record = item.record;

          return `

                            <tr>

                                <td>

                                    <div class="fw-semibold">
                                        ${escapeHtml(record.employeeName || record.employeeId || '-')}
                                    </div>

                                    <div class="small text-muted">
                                        ${escapeHtml(record.role || '')}
                                    </div>

                                </td>


                                <td>
                                    ${Number(record.payableDays || 0)}
                                </td>


                                <td class="fw-semibold">
                                    ${money(getNetSalary(record))}
                                </td>


                                <td>
                                    ${statusBadge('unpaid')}
                                </td>


                                <td>
                                    -
                                </td>


                                <td>
                                    -
                                </td>


                                <td>
                                    -
                                </td>


                                <td class="text-end">

                                    <button
                                        type="button"
                                        class="btn btn-sm btn-primary"
                                        data-payment-pay="${escapeHtml(record.payrollRecordId || record.id)}">

                                        <i class="bi bi-cash-stack me-1"></i>
                                        Pay

                                    </button>

                                </td>

                            </tr>

                        `;
        }

        const payment = item.payment;

        return `

                        <tr>

                            <td>

                                <div class="fw-semibold">
                                    ${escapeHtml(payment.employeeName || payment.employeeId || '-')}
                                </div>

                            </td>


                            <td>
                                -
                            </td>


                            <td class="fw-semibold">
                                ${money(payment.amount)}
                            </td>


                            <td>
                                ${statusBadge(payment.status)}
                            </td>


                            <td>
                                ${escapeHtml(methodLabel(payment.paymentMethod))}
                            </td>


                            <td>
                                ${formatDate(payment.paymentDate)}
                            </td>


                            <td>
                                ${escapeHtml(payment.transactionId || '-')}
                            </td>


                            <td class="text-end">

                                <div class="btn-group btn-group-sm">

                                    <button
                                        type="button"
                                        class="btn btn-outline-secondary"
                                        data-payment-view="${escapeHtml(payment.id)}">

                                        <i class="bi bi-eye"></i>

                                    </button>


                                    ${
                                      payment.status === 'paid'
                                        ? `
                                                <button
                                                    type="button"
                                                    class="btn btn-outline-danger"
                                                    data-payment-cancel="${escapeHtml(payment.id)}">

                                                    <i class="bi bi-x-circle"></i>

                                                </button>
                                            `
                                        : ''
                                    }

                                </div>

                            </td>

                        </tr>

                    `;
      })
      .join('');

    $('paymentMobileList').innerHTML = rows
      .map((item) => {
        if (item.type === 'payable') {
          const record = item.record;

          return `

                            <div class="payment-mobile-card">

                                <div class="d-flex justify-content-between gap-3">

                                    <div>

                                        <div class="payment-name">
                                            ${escapeHtml(record.employeeName || record.employeeId || '-')}
                                        </div>

                                        <div class="payment-meta text-muted">
                                            ${escapeHtml(record.role || '')}
                                        </div>

                                    </div>

                                    ${statusBadge('unpaid')}

                                </div>


                                <div class="row g-3 mt-2">

                                    <div class="col-6">

                                        <div class="payment-meta text-muted">
                                            Payable Days
                                        </div>

                                        <div>
                                            ${Number(record.payableDays || 0)}
                                        </div>

                                    </div>


                                    <div class="col-6">

                                        <div class="payment-meta text-muted">
                                            Net Salary
                                        </div>

                                        <div class="payment-amount">
                                            ${money(getNetSalary(record))}
                                        </div>

                                    </div>

                                </div>


                                <div class="d-flex justify-content-end mt-3">

                                    <button
                                        type="button"
                                        class="btn btn-sm btn-primary"
                                        data-payment-pay="${escapeHtml(record.payrollRecordId || record.id)}">

                                        <i class="bi bi-cash-stack me-1"></i>
                                        Pay Salary

                                    </button>

                                </div>

                            </div>

                        `;
        }

        const payment = item.payment;

        return `

                        <div class="payment-mobile-card">

                            <div class="d-flex justify-content-between gap-3">

                                <div>

                                    <div class="payment-name">
                                        ${escapeHtml(payment.employeeName || payment.employeeId || '-')}
                                    </div>

                                    <div class="payment-meta text-muted">
                                        ${escapeHtml(periodName(payment))}
                                    </div>

                                </div>


                                ${statusBadge(payment.status)}

                            </div>


                            <div class="row g-3 mt-2">

                                <div class="col-6">

                                    <div class="payment-meta text-muted">
                                        Amount
                                    </div>

                                    <div class="payment-amount">
                                        ${money(payment.amount)}
                                    </div>

                                </div>


                                <div class="col-6">

                                    <div class="payment-meta text-muted">
                                        Method
                                    </div>

                                    <div>
                                        ${escapeHtml(methodLabel(payment.paymentMethod))}
                                    </div>

                                </div>


                                <div class="col-6">

                                    <div class="payment-meta text-muted">
                                        Payment Date
                                    </div>

                                    <div>
                                        ${formatDate(payment.paymentDate)}
                                    </div>

                                </div>


                                <div class="col-6">

                                    <div class="payment-meta text-muted">
                                        Transaction
                                    </div>

                                    <div class="text-truncate">
                                        ${escapeHtml(payment.transactionId || '-')}
                                    </div>

                                </div>

                            </div>


                            <div class="d-flex justify-content-end gap-2 mt-3">

                                <button
                                    type="button"
                                    class="btn btn-sm btn-outline-secondary"
                                    data-payment-view="${escapeHtml(payment.id)}">

                                    <i class="bi bi-eye me-1"></i>
                                    Details

                                </button>


                                ${
                                  payment.status === 'paid'
                                    ? `
                                            <button
                                                type="button"
                                                class="btn btn-sm btn-outline-danger"
                                                data-payment-cancel="${escapeHtml(payment.id)}">

                                                <i class="bi bi-x-circle me-1"></i>
                                                Cancel

                                            </button>
                                        `
                                    : ''
                                }

                            </div>

                        </div>

                    `;
      })
      .join('');
  }

  async function loadPayments() {
    const periodId = $('paymentPeriod').value;

    /*
     * No period selected.
     */
    if (!periodId) {
      payments = [];

      payable = [];

      $('paymentLoading').classList.add('d-none');

      $('paymentSummary').classList.add('d-none');

      $('paymentTableWrap').classList.add('d-none');

      $('paymentMobileList').classList.add('d-none');

      $('paymentEmpty').classList.remove('d-none');

      $('paymentEmpty').querySelector('h6').textContent = 'Select a payroll period';

      $('paymentEmpty').querySelector('p').textContent = 'Select a payroll period to view salary payments.';

      return;
    }

    $('paymentLoading').classList.remove('d-none');

    $('paymentEmpty').classList.add('d-none');

    $('paymentTableWrap').classList.add('d-none');

    $('paymentMobileList').classList.add('d-none');

    try {
      const [paymentResponse, payableResponse] = await Promise.all([
        Api.get(`/payments/period/${periodId}`),

        Api.get(`/payments/payable/${periodId}`),
      ]);

      payments = paymentResponse?.payments || [];

      payable = payableResponse?.records || [];

      render();
    } catch (error) {
      $('paymentLoading').classList.add('d-none');

      AppAlert.error(error?.message || 'Failed to load payment data');
    }
  }

  async function loadPeriods() {
    try {
        AppAlert.loading('Loading payroll periods...');
      const response = await Api.get('/payroll-periods/data');

      periods = Array.isArray(response) ? response : response?.periods || [];

      const select = $('paymentPeriod');

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

  function bindEvents() {
    $('paymentPeriod').addEventListener('change', loadPayments);

    $('confirmPaymentBtn').addEventListener('click', confirmPayment);

    document.addEventListener('click', (event) => {
      const payButton = event.target.closest('[data-payment-pay]');

      if (payButton) {
        openPaymentModal(payButton.dataset.paymentPay);

        return;
      }

      const viewButton = event.target.closest('[data-payment-view]');

      if (viewButton) {
        showDetails(viewButton.dataset.paymentView);

        return;
      }

      const cancelButton = event.target.closest('[data-payment-cancel]');

      if (cancelButton) {
        cancelPayment(cancelButton.dataset.paymentCancel);
      }
    });
  }

  window.initializePaymentsPage = async function () {
    bindEvents();

    await loadPeriods();

    /*
     * Default state:
     * no payroll period selected.
     */
    payments = [];

    payable = [];

    $('paymentLoading').classList.add('d-none');

    $('paymentSummary').classList.add('d-none');

    $('paymentTableWrap').classList.add('d-none');

    $('paymentMobileList').classList.add('d-none');

    $('paymentEmpty').classList.remove('d-none');

    $('paymentEmpty').querySelector('h6').textContent = 'Select a payroll period';

    $('paymentEmpty').querySelector('p').textContent = 'Select a payroll period to view salary payments.';
  };
})();
