/* ==========================================================
   TeamoTrack
   attendance-regularization-review.js

   HR / Manager Attendance Regularization Review

   Same page:
   - Pending Requests
   - History
   ========================================================== */

const state = {
  activeTab: 'pending',

  pendingRequests: [],
  historyRequests: [],

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
  MISSED_CHECK_IN: 'Missed Check-in',
  MISSED_CHECK_OUT: 'Missed Check-out',
  MISSED_BOTH: 'Missed Both',
  WRONG_CHECK_IN: 'Wrong Check-in',
  WRONG_CHECK_OUT: 'Wrong Check-out',
  WRONG_BOTH: 'Wrong Both',
  SYSTEM_ERROR: 'System Error',
  LOCATION_ERROR: 'Location Error',
  OTHER: 'Other',
};

// ==========================================================
// INITIALIZATION
// ==========================================================

async function initializeAttendanceRegularizationReviewPage() {
  bindEvents();

  setActiveTab('pending');

  await loadAllRequests();
}

// ==========================================================
// DOM
// ==========================================================

function $(id) {
  return document.getElementById(id);
}

// ==========================================================
// VISIBILITY
// ==========================================================

function show(element) {
  if (!element) {
    return;
  }

  element.hidden = false;

  element.classList.remove('hidden');
}

function hide(element) {
  if (!element) {
    return;
  }

  element.hidden = true;

  element.classList.add('hidden');
}

// ==========================================================
// EVENTS
// ==========================================================

function bindEvents() {
  $('refreshRequestsBtn')?.addEventListener('click', async () => {
    await loadAllRequests();
  });

  $('retryRequestsBtn')?.addEventListener('click', async () => {
    await loadAllRequests();
  });

  $('pendingTabBtn')?.addEventListener('click', () => {
    setActiveTab('pending');
  });

  $('historyTabBtn')?.addEventListener('click', () => {
    setActiveTab('history');
  });

  $('clearFiltersBtn')?.addEventListener('click', () => {
    $('requestSearch').value = '';

    $('requestTypeFilter').value = '';

    $('requestStatusFilter').value = '';

    $('requestDateFilter').value = '';

    applyFilters();
  });

  $('requestSearch')?.addEventListener('input', () => {
    applyFilters();
  });

  $('requestTypeFilter')?.addEventListener('change', () => {
    applyFilters();
  });

  $('requestStatusFilter')?.addEventListener('change', () => {
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
    if (event.key === 'Escape' && $('requestDetailModal') && !$('requestDetailModal').hidden) {
      closeDetailModal();
    }
  });
}

// ==========================================================
// TABS
// ==========================================================

function setActiveTab(tab) {
  state.activeTab = tab === 'history' ? 'history' : 'pending';

  const pendingButton = $('pendingTabBtn');

  const historyButton = $('historyTabBtn');

  pendingButton?.classList.toggle('active', state.activeTab === 'pending');

  historyButton?.classList.toggle('active', state.activeTab === 'history');

  /*
   * Status filter only makes sense
   * for history.
   */
  if ($('requestStatusFilter')) {
    $('requestStatusFilter').disabled = state.activeTab !== 'history';
  }

  if ($('requestListTitle')) {
    $('requestListTitle').textContent = state.activeTab === 'pending' ? 'Pending Requests' : 'Processing History';
  }

  if ($('requestListDescription')) {
    $('requestListDescription').textContent =
      state.activeTab === 'pending'
        ? 'Attendance requests waiting for your action.'
        : 'Attendance regularization requests you have already processed.';
  }

  if ($('emptyTitle')) {
    $('emptyTitle').textContent = state.activeTab === 'pending' ? 'No pending requests' : 'No processing history';
  }

  if ($('emptyDescription')) {
    $('emptyDescription').textContent =
      state.activeTab === 'pending'
        ? 'There are currently no attendance regularization requests requiring your approval.'
        : 'You have not approved or rejected any attendance regularization requests yet.';
  }

  /*
   * History has a different sixth column.
   */
  if ($('actionHeader')) {
    $('actionHeader').textContent = state.activeTab === 'pending' ? 'Submitted' : 'Processed';
  }

  /*
   * Clear status filter when
   * switching to pending.
   */
  if (state.activeTab === 'pending' && $('requestStatusFilter')) {
    $('requestStatusFilter').value = '';
  }

  refreshCurrentDataset();
}

// ==========================================================
// LOAD BOTH DATASETS
// ==========================================================

async function loadAllRequests() {
  if (state.loading) {
    return;
  }

  state.loading = true;

  setListLoading(true);

  try {
    /*
     * Pending approvals.
     */
    const approvalsResponse = await Api.get('/attendance-regularization/approvals');

    state.pendingRequests = Array.isArray(approvalsResponse?.requests) ? approvalsResponse.requests : [];

    /*
     * Manager / HR processing history.
     */
    const historyResponse = await Api.get('/attendance-regularization/history');

    state.historyRequests = Array.isArray(historyResponse?.requests) ? historyResponse.requests : [];

    updateSummary();

    refreshCurrentDataset();
  } catch (error) {

    AppAlert.error(error?.message || 'Unable to load attendance regularization requests.', 'Request Load Failed');
    console.error('Failed to load attendance regularization requests:', error);

    state.pendingRequests = [];

    state.historyRequests = [];

    state.requests = [];

    state.filteredRequests = [];

    showListError(error?.message || 'Unable to load attendance regularization requests.');
  } finally {
    state.loading = false;

    setListLoading(false);
  }
}

// ==========================================================
// CURRENT DATASET
// ==========================================================

function refreshCurrentDataset() {
  state.requests = state.activeTab === 'pending' ? [...state.pendingRequests] : [...state.historyRequests];

  state.filteredRequests = [...state.requests];

  applyFilters();
}

// ==========================================================
// FILTERS
// ==========================================================

function applyFilters() {
  const search = String($('requestSearch')?.value || '')
    .trim()
    .toLowerCase();

  const type = String($('requestTypeFilter')?.value || '');

  const status = String($('requestStatusFilter')?.value || '').toLowerCase();

  const date = String($('requestDateFilter')?.value || '');

  state.filteredRequests = state.requests.filter((request) => {
    /*
     * Type.
     */
    if (type && request.type !== type) {
      return false;
    }

    /*
     * Status.
     */
    if (status && String(request.status || '').toLowerCase() !== status) {
      return false;
    }

    /*
     * Date.
     */
    if (date && String(request.date || '') !== date) {
      return false;
    }

    /*
     * Search.
     */
    if (search) {
      const searchableText = [
        request.userName,

        request.userRole,

        request.date,

        request.type,

        TYPE_LABELS[request.type],

        request.reason,

        request.parentName,

        request.status,

        request.approvedByRole,

        request.rejectedByRole,
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
  const pending = state.pendingRequests.length;

  const approved = state.historyRequests.filter(
    (request) => String(request.status || '').toLowerCase() === 'approved'
  ).length;

  const rejected = state.historyRequests.filter(
    (request) => String(request.status || '').toLowerCase() === 'rejected'
  ).length;

  $('pendingCount').textContent = String(pending);

  $('totalCount').textContent = String(pending);

  $('approvedCount').textContent = String(approved);

  $('rejectedCount').textContent = String(rejected);

  $('pendingTabCount').textContent = String(pending);

  $('historyTabCount').textContent = String(state.historyRequests.length);
}

// ==========================================================
// RENDER REQUESTS
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

  /*
   * IMPORTANT:
   *
   * Requested values are displayed
   * as TIME ONLY.
   *
   * Date is already a separate column.
   */
  row.querySelector('.request-check-in').textContent = formatTime(request.requestedCheckInTime);

  row.querySelector('.request-check-out').textContent = formatTime(request.requestedCheckOutTime);

  row.querySelector('.reason-preview').textContent = request.reason || 'No reason provided';

  const processedDate = getProcessedAt(request);

  row.querySelector('.submitted-date').textContent =
    state.activeTab === 'pending' ? formatDateTime(request.createdAt) : formatDateTime(processedDate);

  const button = row.querySelector('.view-request-btn');

  button.addEventListener('click', async () => {
    await openRequestDetail(request.id);
  });

  return row;
}

// ==========================================================
// MOBILE CARD
// ==========================================================

function createMobileRequest(request) {
  const wrapper = document.createElement('article');

  wrapper.className = 'mobile-request-item';

  const name = request.userName || 'Unknown Employee';

  const status = String(request.status || '').toLowerCase();

  const processedDate = getProcessedAt(request);

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

        <span>
          Date
        </span>

        <strong>
          ${escapeHtml(formatDate(request.date))}
        </strong>

      </div>


      <div class="mobile-meta-item">

        <span>
          Status
        </span>

        <strong>
          ${escapeHtml(formatStatus(status))}
        </strong>

      </div>


      <div class="mobile-meta-item">

        <span>
          Check-in
        </span>

        <strong>
          ${escapeHtml(formatTime(request.requestedCheckInTime))}
        </strong>

      </div>


      <div class="mobile-meta-item">

        <span>
          Check-out
        </span>

        <strong>
          ${escapeHtml(formatTime(request.requestedCheckOutTime))}
        </strong>

      </div>


      <div class="mobile-meta-item">

        <span>
          ${state.activeTab === 'pending' ? 'Submitted' : 'Processed'}
        </span>

        <strong>
          ${escapeHtml(formatDateTime(state.activeTab === 'pending' ? request.createdAt : processedDate))}
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
// DETAIL
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
      throw new Error('Attendance regularization not found.');
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

  const name = request.userName || 'Unknown Employee';

  const status = String(request.status || 'pending').toLowerCase();

  $('detailEmployeeAvatar').textContent = getInitials(name);

  $('detailEmployeeName').textContent = name;

  $('detailEmployeeRole').textContent = formatRole(request.userRole);

  $('detailStatus').innerHTML = createStatusBadge(status);

  $('detailDate').textContent = formatDate(request.date);

  $('detailType').textContent = getTypeLabel(request.type);

  /*
   * TIME ONLY.
   */
  $('detailCheckIn').textContent = formatTime(request.requestedCheckInTime);

  $('detailCheckOut').textContent = formatTime(request.requestedCheckOutTime);

  renderPreviousAttendance(request.previousAttendance);

  $('detailReason').textContent = request.reason || 'No reason provided';

  renderAttachment(request.attachmentUrl);

  renderApprovalTimeline(request.approval, request);

  const isPending = status === 'pending';

  /*
   * Approve/reject are available
   * only while reviewing pending
   * requests.
   *
   * History is read-only.
   */
  if (isPending) {
    show($('detailActions'));

    $('approveRequestBtn').disabled = false;

    $('rejectRequestBtn').disabled = false;
  } else {
    hide($('detailActions'));
  }
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

        <span>
          Check-in
        </span>

        <strong>
          ${escapeHtml(formatTime(previous.checkInTime))}
        </strong>

      </div>


      <div class="previous-value">

        <span>
          Check-out
        </span>

        <strong>
          ${escapeHtml(formatTime(previous.checkOutTime))}
        </strong>

      </div>


      <div class="previous-value">

        <span>
          Working Time
        </span>

        <strong>
          ${escapeHtml(formatMinutes(previous.workingMinutes))}
        </strong>

      </div>


      <div class="previous-value">

        <span>
          Status
        </span>

        <strong>
          ${escapeHtml(formatStatus(previous.status))}
        </strong>

      </div>


      <div class="previous-value">

        <span>
          Attendance Type
        </span>

        <strong>
          ${escapeHtml(formatStatus(previous.attendanceType))}
        </strong>

      </div>


      <div class="previous-value">

        <span>
          Punctuality
        </span>

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

function renderApprovalTimeline(approval, request) {
  const container = $('approvalTimeline');

  container.innerHTML = '';

  if (!Array.isArray(approval) || approval.length === 0) {
    /*
     * Fallback to top-level
     * approval information.
     */
    if (request?.status === 'approved') {
      container.innerHTML = `
        <div class="approval-step approval-approved">

          <div class="approval-step-title">
            Approved
          </div>

          <div class="approval-step-meta">
            ${escapeHtml(formatDateTime(request.approvedAt))}
          </div>

        </div>
      `;

      return;
    }

    if (request?.status === 'rejected') {
      container.innerHTML = `
        <div class="approval-step approval-rejected">

          <div class="approval-step-title">
            Rejected
          </div>

          <div class="approval-step-meta">
            ${escapeHtml(formatDateTime(request.rejectedAt))}
          </div>

        </div>
      `;

      return;
    }

    container.innerHTML = `
      <div class="approval-step approval-pending">

        <div class="approval-step-title">
          Pending approval
        </div>

        <div class="approval-step-meta">
          Waiting for action.
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

        ·

        ${escapeHtml(person)}

      </div>


      <div class="approval-step-meta">

        ${timestamp ? escapeHtml(formatDateTime(timestamp)) : 'Waiting for action'}

      </div>

    `;

    /*
     * Rejection reason.
     */
    if (status === 'rejected' && request?.rejectionReason) {
      const reason = document.createElement('div');

      reason.className = 'approval-step-meta';

      reason.textContent = `Reason: ${request.rejectionReason}`;

      wrapper.appendChild(reason);
    }

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

    await loadAllRequests();
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

          <p
            style="
              margin:0 0 12px;
              color:#6b7280;
              font-size:14px
            "
          >
            You are rejecting the attendance regularization request submitted by
            <strong>
              ${escapeHtml(employeeName)}
            </strong>.
          </p>


          <label
            for="regularizationRejectReason"
            style="
              display:block;
              margin-bottom:6px;
              font-size:13px;
              font-weight:600;
              color:#374151
            "
          >
            Rejection reason
          </label>


          <textarea
            id="regularizationRejectReason"
            class="swal2-textarea"
            placeholder="Enter the reason for rejection..."
            maxlength="1000"
            style="
              width:100%;
              box-sizing:border-box;
              margin:0
            "
          ></textarea>


          <div
            style="
              margin-top:6px;
              font-size:11px;
              color:#9ca3af;
              text-align:right
            "
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

    await loadAllRequests();
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
// PROCESSED DATE
// ==========================================================

function getProcessedAt(request) {
  if (String(request.status || '').toLowerCase() === 'approved') {
    return request.approvedAt || findApprovalTimestamp(request, 'approved');
  }

  if (String(request.status || '').toLowerCase() === 'rejected') {
    return request.rejectedAt || findApprovalTimestamp(request, 'rejected');
  }

  return null;
}

function findApprovalTimestamp(request, status) {
  if (!Array.isArray(request?.approval)) {
    return null;
  }

  const step = [...request.approval].reverse().find((item) => String(item?.status || '').toLowerCase() === status);

  if (!step) {
    return null;
  }

  return status === 'approved' ? step.approvedAt : step.rejectedAt;
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

// ==========================================================
// DATE
// ==========================================================

function formatDate(value) {
  if (!value) {
    return '-';
  }

  /*
   * Backend date:
   *
   * YYYY-MM-DD
   *
   * Do not pass this directly
   * to new Date().
   */
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

// ==========================================================
// TIME ONLY
// ==========================================================

function formatTime(value) {
  if (!value) {
    return '-';
  }

  /*
   * If backend ever sends
   * plain HH:mm.
   */
  if (typeof value === 'string' && /^\d{1,2}:\d{2}(:\d{2})?$/.test(value)) {
    const parts = value.split(':');

    return formatHourMinute(Number(parts[0]), Number(parts[1]));
  }

  const date = toDate(value);

  if (!date) {
    return '-';
  }

  return new Intl.DateTimeFormat('en-IN', {
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
    timeZone: 'Asia/Kolkata',
  }).format(date);
}

function formatHourMinute(hour, minute) {
  const suffix = hour >= 12 ? 'PM' : 'AM';

  const displayHour = hour % 12 || 12;

  return `${displayHour}:${String(minute).padStart(2, '0')} ${suffix}`;
}

// ==========================================================
// DATE + TIME
// ==========================================================

function formatDateTime(value) {
  if (!value) {
    return '-';
  }

  const date = toDate(value);

  if (!date) {
    return '-';
  }

  return new Intl.DateTimeFormat('en-IN', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
    timeZone: 'Asia/Kolkata',
  }).format(date);
}

// ==========================================================
// MINUTES
// ==========================================================

function formatMinutes(value) {
  if (value === null || value === undefined || value === '') {
    return '0 min';
  }

  const minutes = Number(value);

  if (!Number.isFinite(minutes) || minutes < 0) {
    return '0 min';
  }

  const hours = Math.floor(minutes / 60);

  const remaining = minutes % 60;

  if (hours === 0) {
    return `${remaining} min`;
  }

  if (remaining === 0) {
    return `${hours} hr`;
  }

  return `${hours} hr ${remaining} min`;
}

// ==========================================================
// FIRESTORE DATE CONVERSION
// ==========================================================

function toDate(value) {
  if (!value) {
    return null;
  }

  if (value instanceof Date) {
    return Number.isNaN(value.getTime()) ? null : value;
  }

  /*
   * Firestore Timestamp-like.
   */
  if (typeof value === 'object' && typeof value._seconds === 'number') {
    return new Date(value._seconds * 1000 + Math.floor(Number(value._nanoseconds || 0) / 1000000));
  }

  /*
   * Firestore serialized Timestamp.
   */
  if (typeof value === 'object' && typeof value.seconds === 'number') {
    return new Date(value.seconds * 1000 + Math.floor(Number(value.nanoseconds || 0) / 1000000));
  }

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

  return `
    <span
      class="status-badge status-${escapeHtml(safeStatus)}"
    >
      ${escapeHtml(formatStatus(safeStatus))}
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
// GLOBAL INITIALIZER
// ==========================================================

window.initializeAttendanceRegularizationReviewPage = initializeAttendanceRegularizationReviewPage;
