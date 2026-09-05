/* ==========================================================
   TeamoTrack
   attendance-regularization-review.js

   HR / Manager Attendance Regularization Review
   ========================================================== */


// ==========================================================
// STATE
// ==========================================================

const state = {
  requests: [],
  filteredRequests: [],
  selectedRequestId: null,
  selectedRequest: null,
  loading: false,
  detailLoading: false,
};

// ==========================================================
// TYPE LABELS
// ==========================================================

const TYPE_LABELS = {
  missed_check_in: 'Missed Check-in',
  missed_check_out: 'Missed Check-out',
  missed_both: 'Missed Both',
  wrong_check_in: 'Wrong Check-in',
  wrong_check_out: 'Wrong Check-out',
  wrong_both: 'Wrong Both',
  system_error: 'System Error',
  location_error: 'Location Error',
  other: 'Other',
};

// ==========================================================
// INITIALIZATION
// ==========================================================

async function initializeAttendanceRegularizationReviewPage() {
  bindEvents();

  await loadRequests();
}

// ==========================================================
// DOM HELPERS
// ==========================================================

function $(id) {
  return document.getElementById(id);
}

function show(element) {
  if (element) {
    element.hidden = false;
  }
}

function hide(element) {
  if (element) {
    element.hidden = true;
  }
}

// ==========================================================
// EVENTS
// ==========================================================

function bindEvents() {
  $('refreshRequestsBtn')?.addEventListener('click', async () => {
    await loadRequests();
  });

  $('retryRequestsBtn')?.addEventListener('click', async () => {
    await loadRequests();
  });

  $('clearFiltersBtn')?.addEventListener('click', () => {
    $('requestSearch').value = '';

    $('requestTypeFilter').value = '';

    $('requestDateFilter').value = '';

    applyFilters();
  });

  $('requestSearch')?.addEventListener('input', () => {
    applyFilters();
  });

  $('requestTypeFilter')?.addEventListener('change', () => {
    applyFilters();
  });

  $('requestDateFilter')?.addEventListener('change', () => {
    applyFilters();
  });

  $('closeDetailModalBtn')?.addEventListener('click', () => {
    closeDetailModal();
  });

  $('requestDetailModal')?.addEventListener('click', (event) => {
    if (event.target === $('requestDetailModal')) {
      closeDetailModal();
    }
  });

  $('approveRequestBtn')?.addEventListener('click', async () => {
    await approveSelectedRequest();
  });

  $('rejectRequestBtn')?.addEventListener('click', async () => {
    await rejectSelectedRequest();
  });

  document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape' && !$('requestDetailModal').hidden) {
      closeDetailModal();
    }
  });
}

// ==========================================================
// LOAD APPROVAL REQUESTS
// ==========================================================

async function loadRequests() {
  if (state.loading) {
    return;
  }

  state.loading = true;

  setListLoading(true);

  try {
    const response = await Api.get('/attendance-regularization/approvals');

    state.requests = Array.isArray(response?.requests) ? response.requests : [];

    state.filteredRequests = [...state.requests];

    updateSummary();

    applyFilters();
  } catch (error) {
    console.error('Failed to load attendance regularization approvals:', error);

    state.requests = [];

    state.filteredRequests = [];

    showListError(error?.message || 'Unable to load attendance regularization requests.');
  } finally {
    state.loading = false;

    setListLoading(false);
  }
}

// ==========================================================
// FILTERS
// ==========================================================

function applyFilters() {
  const search = String($('requestSearch')?.value || '')
    .trim()
    .toLowerCase();

  const type = String($('requestTypeFilter')?.value || '');

  const date = String($('requestDateFilter')?.value || '');

  state.filteredRequests = state.requests.filter((request) => {
    if (type && request.type !== type) {
      return false;
    }

    if (date && String(request.date || '') !== date) {
      return false;
    }

    if (search) {
      const searchableText = [
        request.userName,
        request.userRole,
        request.date,
        request.type,
        request.reason,
        request.parentName,
      ]
        .filter(Boolean)
        .join(' ')
        .toLowerCase();

      if (!searchableText.includes(search)) {
        return false;
      }
    }

    return true;
  });

  renderRequests();
}

// ==========================================================
// SUMMARY
// ==========================================================

function updateSummary() {
  const total = state.requests.length;

  const pending = state.requests.filter((request) => request.status === 'pending').length;

  $('pendingCount').textContent = String(pending);

  $('totalCount').textContent = String(total);

  $('visibleRequestCount').textContent = String(state.filteredRequests.length);
}

// ==========================================================
// RENDER LIST
// ==========================================================

function renderRequests() {
  const tableBody = $('requestTableBody');

  const mobileList = $('mobileRequestList');

  if (!tableBody || !mobileList) {
    return;
  }

  tableBody.innerHTML = '';

  mobileList.innerHTML = '';

  $('visibleRequestCount').textContent = String(state.filteredRequests.length);

  hide($('requestEmpty'));

  hide($('requestTableWrapper'));

  hide($('mobileRequestList'));

  if (state.filteredRequests.length === 0) {
    show($('requestEmpty'));

    return;
  }

  for (const request of state.filteredRequests) {
    tableBody.appendChild(createTableRow(request));

    mobileList.appendChild(createMobileRequest(request));
  }

  show($('requestTableWrapper'));

  show($('mobileRequestList'));
}

// ==========================================================
// TABLE ROW
// ==========================================================

function createTableRow(request) {
  const template = $('requestRowTemplate');

  const row = template.content.firstElementChild.cloneNode(true);

  const name = request.userName || 'Unknown Employee';

  const role = request.userRole || 'Employee';

  const avatar = row.querySelector('.employee-avatar');

  avatar.textContent = getInitials(name);

  row.querySelector('.employee-name').textContent = name;

  row.querySelector('.employee-role').textContent = formatRole(role);

  row.querySelector('.request-date').textContent = formatDate(request.date);

  const typeElement = row.querySelector('.request-type');

  typeElement.textContent = getTypeLabel(request.type);

  applyTypeClass(typeElement, request.type);

  row.querySelector('.request-check-in').textContent = formatDateTime(request.requestedCheckInTime);

  row.querySelector('.request-check-out').textContent = formatDateTime(request.requestedCheckOutTime);

  row.querySelector('.reason-preview').textContent = request.reason || 'No reason provided';

  row.querySelector('.submitted-date').textContent = formatDateTime(request.createdAt);

  row.querySelector('.view-request-btn').addEventListener('click', async () => {
    await openRequestDetail(request.id);
  });

  return row;
}

// ==========================================================
// MOBILE REQUEST CARD
// ==========================================================

function createMobileRequest(request) {
  const wrapper = document.createElement('article');

  wrapper.className = 'mobile-request-item';

  const name = request.userName || 'Unknown Employee';

  wrapper.innerHTML = `
    <div class="mobile-request-top">

      <div class="employee-cell">

        <div class="employee-avatar employee-avatar-small">
          ${escapeHtml(getInitials(name))}
        </div>

        <div>
          <strong class="employee-name">
            ${escapeHtml(name)}
          </strong>

          <span class="employee-role">
            ${escapeHtml(formatRole(request.userRole))}
          </span>
        </div>

      </div>

      <span class="type-badge">
        ${escapeHtml(getTypeLabel(request.type))}
      </span>

    </div>


    <div class="mobile-request-meta">

      <div class="mobile-meta-item">
        <span>Date</span>
        <strong>
          ${escapeHtml(formatDate(request.date))}
        </strong>
      </div>

      <div class="mobile-meta-item">
        <span>Submitted</span>
        <strong>
          ${escapeHtml(formatDateTime(request.createdAt))}
        </strong>
      </div>

      <div class="mobile-meta-item">
        <span>Check-in</span>
        <strong>
          ${escapeHtml(formatDateTime(request.requestedCheckInTime))}
        </strong>
      </div>

      <div class="mobile-meta-item">
        <span>Check-out</span>
        <strong>
          ${escapeHtml(formatDateTime(request.requestedCheckOutTime))}
        </strong>
      </div>

    </div>


    <div class="mobile-request-reason">
      ${escapeHtml(request.reason || 'No reason provided')}
    </div>


    <div class="mobile-request-action">

      <button
        type="button"
        class="btn btn-view"
      >
        View Request
      </button>

    </div>
  `;

  wrapper.querySelector('.btn-view').addEventListener('click', async () => {
    await openRequestDetail(request.id);
  });

  return wrapper;
}

// ==========================================================
// REQUEST DETAIL
// ==========================================================

async function openRequestDetail(id) {
  if (!id) {
    return;
  }

  state.selectedRequestId = id;

  state.selectedRequest = null;

  openDetailModal();

  setDetailLoading(true);

  try {
    const response = await Api.get(`/attendance-regularization/${encodeURIComponent(id)}`);

    if (!response) {
      return;
    }

    state.selectedRequest = response;

    renderRequestDetail(response);
  } catch (error) {
    console.error('Failed to load regularization detail:', error);

    showDetailError(error?.message || 'Unable to load request details.');
  } finally {
    setDetailLoading(false);
  }
}

// ==========================================================
// RENDER DETAIL
// ==========================================================

function renderRequestDetail(request) {
  hide($('detailError'));

  show($('detailContent'));

  show($('detailActions'));

  const name = request.userName || 'Unknown Employee';

  $('detailEmployeeAvatar').textContent = getInitials(name);

  $('detailEmployeeName').textContent = name;

  $('detailEmployeeRole').textContent = formatRole(request.userRole);

  $('detailStatus').innerHTML = createStatusBadge(request.status);

  $('detailDate').textContent = formatDate(request.date);

  $('detailType').textContent = getTypeLabel(request.type);

  $('detailCheckIn').textContent = formatDateTime(request.requestedCheckInTime);

  $('detailCheckOut').textContent = formatDateTime(request.requestedCheckOutTime);

  renderPreviousAttendance(request.previousAttendance);

  $('detailReason').textContent = request.reason || 'No reason provided';

  renderAttachment(request.attachmentUrl);

  renderApprovalTimeline(request.approval);

  const isPending = request.status === 'pending';

  $('approveRequestBtn').disabled = !isPending;

  $('rejectRequestBtn').disabled = !isPending;
}

// ==========================================================
// PREVIOUS ATTENDANCE
// ==========================================================

function renderPreviousAttendance(previous) {
  const container = $('previousAttendance');

  if (!previous) {
    container.textContent = 'No attendance record existed when this request was created.';

    return;
  }

  container.innerHTML = `

    <div class="previous-attendance-grid">

      <div class="previous-value">
        <span>Check-in</span>
        <strong>
          ${escapeHtml(formatDateTime(previous.checkInTime))}
        </strong>
      </div>

      <div class="previous-value">
        <span>Check-out</span>
        <strong>
          ${escapeHtml(formatDateTime(previous.checkOutTime))}
        </strong>
      </div>

      <div class="previous-value">
        <span>Working Time</span>
        <strong>
          ${escapeHtml(formatMinutes(previous.workingMinutes))}
        </strong>
      </div>

      <div class="previous-value">
        <span>Status</span>
        <strong>
          ${escapeHtml(formatStatus(previous.status))}
        </strong>
      </div>

      <div class="previous-value">
        <span>Attendance Type</span>
        <strong>
          ${escapeHtml(formatStatus(previous.attendanceType))}
        </strong>
      </div>

      <div class="previous-value">
        <span>Punctuality</span>
        <strong>
          ${escapeHtml(formatStatus(previous.punctuality))}
        </strong>
      </div>

    </div>
  `;
}

// ==========================================================
// ATTACHMENT
// ==========================================================

function renderAttachment(url) {
  const section = $('attachmentSection');

  const link = $('detailAttachment');

  if (!url) {
    hide(section);

    link.removeAttribute('href');

    return;
  }

  link.href = url;

  show(section);
}

// ==========================================================
// APPROVAL TIMELINE
// ==========================================================

function renderApprovalTimeline(approval) {
  const container = $('approvalTimeline');

  container.innerHTML = '';

  if (!Array.isArray(approval) || approval.length === 0) {
    container.innerHTML = `
      <div class="approval-step approval-pending">
        <div class="approval-step-title">
          Pending approval
        </div>

        <div class="approval-step-meta">
          No approval history available.
        </div>
      </div>
    `;

    return;
  }

  for (const step of approval) {
    const status = String(step.status || 'pending').toLowerCase();

    const wrapper = document.createElement('div');

    wrapper.className = `approval-step approval-${status}`;

    let person = 'Assigned approver';

    let timestamp = null;

    if (status === 'approved') {
      person = step.approvedByRole ? `${formatRole(step.approvedByRole)} approved` : 'Approved';

      timestamp = step.approvedAt;
    } else if (status === 'rejected') {
      person = step.rejectedByRole ? `${formatRole(step.rejectedByRole)} rejected` : 'Rejected';

      timestamp = step.rejectedAt;
    } else {
      person = 'Pending approval';
    }

    wrapper.innerHTML = `

      <div class="approval-step-title">
        Level ${Number(step.level ?? 0) + 1}
        · ${escapeHtml(person)}
      </div>

      <div class="approval-step-meta">
        ${timestamp ? escapeHtml(formatDateTime(timestamp)) : 'Waiting for action'}
      </div>

    `;

    container.appendChild(wrapper);
  }
}

// ==========================================================
// APPROVE
// ==========================================================

async function approveSelectedRequest() {
  const request = state.selectedRequest;

  if (!request?.id) {
    return;
  }

  if (request.status !== 'pending') {
    AppAlert.warning('This request is no longer pending.');

    return;
  }

  const employeeName = request.userName || 'this employee';

  const confirmed = await AppAlert.confirm(
    `Approve the attendance regularization request submitted by ${employeeName}?`,
    'Approve Regularization'
  );

  if (!confirmed) {
    return;
  }

  AppAlert.loading('Approving attendance regularization...');

  try {
    await Api.post(`/attendance-regularization/${encodeURIComponent(request.id)}/approve`, {});

    AppAlert.close();

    closeDetailModal();

    await AppAlert.success(
      'The attendance regularization has been approved and the attendance record has been updated.',
      'Request Approved'
    );

    await loadRequests();
  } catch (error) {
    AppAlert.close();

    console.error('Failed to approve regularization:', error);

    await AppAlert.error(error?.message || 'Unable to approve this attendance regularization.', 'Approval Failed');
  }
}

// ==========================================================
// REJECT
// ==========================================================

async function rejectSelectedRequest() {
  const request = state.selectedRequest;

  if (!request?.id) {
    return;
  }

  if (request.status !== 'pending') {
    AppAlert.warning('This request is no longer pending.');

    return;
  }

  const employeeName = request.userName || 'this employee';

  const result = await Swal.fire({
    ...AppAlert.base(),

    title: 'Reject Regularization',

    html: `
      <div style="text-align:left">

        <p style="margin:0 0 12px;color:#6b7280;font-size:14px">
          You are rejecting the attendance regularization request
          submitted by <strong>${escapeHtml(employeeName)}</strong>.
        </p>

        <label
          for="regularizationRejectReason"
          style="display:block;margin-bottom:6px;font-size:13px;font-weight:600;color:#374151"
        >
          Rejection reason
        </label>

        <textarea
          id="regularizationRejectReason"
          class="swal2-textarea"
          placeholder="Enter the reason for rejection..."
          maxlength="1000"
          style="width:100%;box-sizing:border-box;margin:0"
        ></textarea>

        <div
          style="margin-top:6px;font-size:11px;color:#9ca3af;text-align:right"
        >
          Minimum 3 characters
        </div>

      </div>
    `,

    showCancelButton: true,

    confirmButtonColor: '#d33',

    cancelButtonColor: '#6b7280',

    confirmButtonText: 'Reject Request',

    cancelButtonText: 'Cancel',

    reverseButtons: true,

    focusConfirm: false,

    preConfirm: () => {
      const textarea = document.getElementById('regularizationRejectReason');

      const reason = textarea?.value.trim() || '';

      if (reason.length < 3) {
        Swal.showValidationMessage('Please provide a rejection reason of at least 3 characters.');

        return false;
      }

      return reason;
    },
  });

  if (!result.isConfirmed) {
    return;
  }

  const reason = String(result.value || '').trim();

  AppAlert.loading('Rejecting attendance regularization...');

  try {
    await Api.post(`/attendance-regularization/${encodeURIComponent(request.id)}/reject`, {
      reason,
    });

    AppAlert.close();

    closeDetailModal();

    await AppAlert.success('The attendance regularization request has been rejected.', 'Request Rejected');

    await loadRequests();
  } catch (error) {
    AppAlert.close();

    console.error('Failed to reject regularization:', error);

    await AppAlert.error(error?.message || 'Unable to reject this attendance regularization.', 'Rejection Failed');
  }
}

// ==========================================================
// MODAL
// ==========================================================

function openDetailModal() {
  show($('requestDetailModal'));

  hide($('detailContent'));

  hide($('detailActions'));

  hide($('detailError'));

  show($('detailLoading'));

  document.body.style.overflow = 'hidden';
}

function closeDetailModal() {
  hide($('requestDetailModal'));

  state.selectedRequestId = null;

  state.selectedRequest = null;

  document.body.style.overflow = '';
}

function setDetailLoading(isLoading) {
  state.detailLoading = isLoading;

  if (isLoading) {
    show($('detailLoading'));

    hide($('detailContent'));

    hide($('detailActions'));

    hide($('detailError'));

    return;
  }

  hide($('detailLoading'));
}

function showDetailError(message) {
  hide($('detailContent'));

  hide($('detailActions'));

  hide($('detailLoading'));

  show($('detailError'));

  $('detailErrorMessage').textContent = message || 'Unable to load request.';
}

// ==========================================================
// LIST LOADING
// ==========================================================

function setListLoading(isLoading) {
  if (isLoading) {
    show($('requestLoading'));

    hide($('requestEmpty'));

    hide($('requestError'));

    hide($('requestTableWrapper'));

    hide($('mobileRequestList'));

    return;
  }

  hide($('requestLoading'));
}

function showListError(message) {
  hide($('requestLoading'));

  hide($('requestEmpty'));

  hide($('requestTableWrapper'));

  hide($('mobileRequestList'));

  show($('requestError'));

  $('requestErrorMessage').textContent = message || 'Unable to load requests.';
}

// ==========================================================
// FORMATTING
// ==========================================================

function getTypeLabel(type) {
  if (!type) {
    return 'Unknown';
  }

  return (
    TYPE_LABELS[type] ||
    String(type)
      .replaceAll('_', ' ')
      .replace(/\b\w/g, (letter) => letter.toUpperCase())
  );
}

function formatRole(role) {
  if (!role) {
    return 'Employee';
  }

  return String(role)
    .replaceAll('_', ' ')
    .replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function formatStatus(status) {
  if (!status) {
    return 'Not available';
  }

  return String(status)
    .replaceAll('_', ' ')
    .replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function formatDate(value) {
  if (!value) {
    return '-';
  }

  if (typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value)) {
    const [year, month, day] = value.split('-');

    return `${day}/${month}/${year}`;
  }

  const date = toDate(value);

  if (!date) {
    return '-';
  }

  return new Intl.DateTimeFormat('en-IN', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    timeZone: 'Asia/Kolkata',
  }).format(date);
}

function formatDateTime(value) {
  const date = toDate(value);

  if (!date) {
    return '-';
  }

  return new Intl.DateTimeFormat('en-IN', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    hour12: true,
    timeZone: 'Asia/Kolkata',
  }).format(date);
}

function formatMinutes(value) {
  const minutes = Number(value ?? 0);

  if (!Number.isFinite(minutes) || minutes <= 0) {
    return '0 min';
  }

  const hours = Math.floor(minutes / 60);

  const remaining = minutes % 60;

  if (hours <= 0) {
    return `${remaining} min`;
  }

  if (remaining === 0) {
    return `${hours} hr`;
  }

  return `${hours} hr ${remaining} min`;
}

// ==========================================================
// FIREBASE / API DATE CONVERSION
// ==========================================================

function toDate(value) {
  if (!value) {
    return null;
  }

  if (value instanceof Date) {
    return Number.isNaN(value.getTime()) ? null : value;
  }

  /*
   * Firestore Timestamp returned as:
   *
   * {
   *   _seconds: number,
   *   _nanoseconds: number
   * }
   */
  if (typeof value === 'object' && typeof value._seconds === 'number') {
    return new Date(value._seconds * 1000 + Math.floor(Number(value._nanoseconds || 0) / 1000000));
  }

  /*
   * Some serializers return:
   *
   * {
   *   seconds: number,
   *   nanoseconds: number
   * }
   */
  if (typeof value === 'object' && typeof value.seconds === 'number') {
    return new Date(value.seconds * 1000 + Math.floor(Number(value.nanoseconds || 0) / 1000000));
  }

  /*
   * ISO string / date string.
   */
  if (typeof value === 'string') {
    const date = new Date(value);

    return Number.isNaN(date.getTime()) ? null : date;
  }

  return null;
}

// ==========================================================
// STATUS BADGE
// ==========================================================

function createStatusBadge(status) {
  const safeStatus = String(status || 'pending').toLowerCase();

  const label = formatStatus(safeStatus);

  return `
    <span class="status-badge status-${escapeHtml(safeStatus)}">
      ${escapeHtml(label)}
    </span>
  `;
}

// ==========================================================
// TYPE CSS
// ==========================================================

function applyTypeClass(element, type) {
  if (!element) {
    return;
  }

  const className = String(type || '').replace(/[^a-z0-9_-]/gi, '');

  if (className) {
    element.classList.add(`request-type-${className}`);
  }
}

// ==========================================================
// INITIALS
// ==========================================================

function getInitials(name) {
  const value = String(name || '').trim();

  if (!value) {
    return 'E';
  }

  const parts = value.split(/\s+/);

  if (parts.length === 1) {
    return parts[0].substring(0, 2).toUpperCase();
  }

  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

// ==========================================================
// ESCAPE HTML
// ==========================================================

function escapeHtml(value) {
  return String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;');
}

// ==========================================================
// EXPORT / GLOBAL INITIALIZER
// ==========================================================

window.initializeAttendanceRegularizationReviewPage = initializeAttendanceRegularizationReviewPage;
