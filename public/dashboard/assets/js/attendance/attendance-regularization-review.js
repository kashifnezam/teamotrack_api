/* ==========================================================
   TeamoTrack
   attendance-regularization-review.js

   HR / Manager Attendance Regularization Review

   Backend flow:

   Employee:
     POST /attendance-regularization
     {
       date,
       reason,
       attachmentUrl?
     }

   Reviewer:
     GET  /attendance-regularization/approvals
     GET  /attendance-regularization/history
     GET  /attendance-regularization/:id

     POST /attendance-regularization/:id/regularize
     {
       attendanceStatus:
         'full_day'
         | 'half_day'
         | 'absent'
     }

     POST /attendance-regularization/:id/reject
     {
       reason?
     }

   Supported statuses:

     pending
     regularized
     rejected
     cancelled

   IMPORTANT:
   This page intentionally contains NO:
     - request type
     - requested check-in
     - requested check-out
     - break correction
     - employee attendance time correction

   The reviewer decides the final attendance classification.
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
  processing: false,
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
    if ($('requestSearch')) {
      $('requestSearch').value = '';
    }

    if ($('requestStatusFilter')) {
      $('requestStatusFilter').value = '';
    }

    if ($('requestDateFilter')) {
      $('requestDateFilter').value = '';
    }

    applyFilters();
  });

  $('requestSearch')?.addEventListener('input', () => {
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

  $('rejectRequestBtn')?.addEventListener('click', async () => {
    await rejectSelectedRequest();
  });

  /*
   * Attendance decisions.
   */
  document.querySelectorAll('.attendance-decision-btn').forEach((button) => {
    button.addEventListener('click', async () => {
      const attendanceStatus = button.dataset.attendanceStatus;

      await regularizeSelectedRequest(attendanceStatus);
    });
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
   * Status filter only applies to history.
   */
  const statusFilter = $('requestStatusFilter');

  if (statusFilter) {
    statusFilter.disabled = state.activeTab !== 'history';
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
        ? 'There are currently no attendance regularization requests requiring your action.'
        : 'You have not processed any attendance regularization requests yet.';
  }

  if ($('actionHeader')) {
    $('actionHeader').textContent = state.activeTab === 'pending' ? 'Submitted' : 'Processed';
  }

  /*
   * Pending list should never be filtered
   * by a historical status.
   */
  if (state.activeTab === 'pending' && statusFilter) {
    statusFilter.value = '';
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
     * Pending requests waiting
     * for the current manager / HR.
     */
    const approvalsResponse = await Api.get('/attendance-regularization/approvals');

    state.pendingRequests = extractRequests(approvalsResponse);

    /*
     * Requests already processed
     * by the current manager / HR.
     */
    const historyResponse = await Api.get('/attendance-regularization/history');

    state.historyRequests = extractRequests(historyResponse);

    hide($('requestError'));

    updateSummary();

    refreshCurrentDataset();
  } catch (error) {
    console.error('Failed to load attendance regularization requests:', error);

    state.pendingRequests = [];
    state.historyRequests = [];
    state.requests = [];
    state.filteredRequests = [];

    showListError(error?.message || 'Unable to load attendance regularization requests.');

    if (typeof AppAlert !== 'undefined') {
      AppAlert.error(error?.message || 'Unable to load attendance regularization requests.', 'Request Load Failed');
    }
  } finally {
    state.loading = false;

    setListLoading(false);
  }
}

// ==========================================================
// RESPONSE NORMALIZATION
// ==========================================================

function extractRequests(response) {
  if (Array.isArray(response)) {
    return response;
  }

  if (Array.isArray(response?.requests)) {
    return response.requests;
  }

  if (Array.isArray(response?.data)) {
    return response.data;
  }

  return [];
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

  const status = String($('requestStatusFilter')?.value || '')
    .trim()
    .toLowerCase();

  const date = String($('requestDateFilter')?.value || '').trim();

  state.filteredRequests = state.requests.filter((request) => {
    /*
     * Status.
     */
    if (status && String(request.status || '').toLowerCase() !== status) {
      return false;
    }

    /*
     * Attendance date.
     */
    if (date && String(request.date || '') !== date) {
      return false;
    }

    /*
     * Search.
     */
    if (search) {
      const previous = request.previousAttendance || {};

      const searchableText = [
        request.userName,
        request.userRole,
        request.date,
        request.reason,
        request.parentName,
        request.status,

        previous.status,
        previous.attendanceType,
        previous.punctuality,

        request.attendanceStatus,
        request.regularizedAttendanceStatus,
        request.regularizedAttendanceType,

        request.regularizedByName,
        request.regularizedByRole,

        request.rejectedByName,
        request.rejectedByRole,

        request.rejectionReason,
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

  const regularized = state.historyRequests.filter(
    (request) => normalizeStatus(request.status) === 'regularized'
  ).length;

  const rejected = state.historyRequests.filter((request) => normalizeStatus(request.status) === 'rejected').length;

  setText('pendingCount', pending);
  setText('totalCount', pending);
  setText('regularizedCount', regularized);
  setText('rejectedCount', rejected);

  setText('pendingTabCount', pending);
  setText('historyTabCount', state.historyRequests.length);
}

function setText(id, value) {
  const element = $(id);

  if (element) {
    element.textContent = String(value ?? '');
  }
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

  setText('visibleRequestCount', state.filteredRequests.length);

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

  const previous = request.previousAttendance || {};

  /*
   * Employee.
   */
  const avatar = row.querySelector('.employee-avatar');

  if (avatar) {
    avatar.textContent = getInitials(name);
  }

  row.querySelector('.employee-name').textContent = name;

  row.querySelector('.employee-role').textContent = formatRole(role);

  /*
   * Date.
   */
  row.querySelector('.request-date').textContent = formatDate(request.date);

  /*
   * Current attendance.
   */
  const attendanceStatus = row.querySelector('.attendance-status-label');

  const attendanceType = row.querySelector('.attendance-type-label');

  const workingTime = row.querySelector('.attendance-working-time');

  attendanceStatus.textContent = formatAttendanceStatus(previous.status);

  attendanceType.textContent = previous.attendanceType ? formatAttendanceType(previous.attendanceType) : '';

  workingTime.textContent = previous.workingMinutes !== undefined ? formatMinutes(previous.workingMinutes) : '';

  /*
   * Reason.
   */
  row.querySelector('.reason-preview').textContent = request.reason || 'No reason provided';

  /*
   * Submitted / processed.
   */
  const processedDate = getProcessedAt(request);

  row.querySelector('.submitted-date').textContent =
    state.activeTab === 'pending' ? formatDateTime(request.createdAt) : formatDateTime(processedDate);

  /*
   * View.
   */
  row.querySelector('.view-request-btn').addEventListener('click', async () => {
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

  const previous = request.previousAttendance || {};

  const status = normalizeStatus(request.status);

  const processedDate = getProcessedAt(request);

  const hasPreviousAttendance = Object.keys(previous).length > 0;

  const currentAttendance = hasPreviousAttendance ? formatAttendanceSummary(previous) : 'No attendance record';

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

      <div class="mobile-status">
        ${createStatusBadge(status)}
      </div>
    </div>

    <div class="mobile-request-meta">
      <div class="mobile-meta-item">
        <span class="mobile-meta-label">
          Attendance Date
        </span>

        <strong class="mobile-meta-value">
          ${escapeHtml(formatDate(request.date))}
        </strong>
      </div>

      <div class="mobile-meta-item">
        <span class="mobile-meta-label">
          Current Attendance
        </span>

        <strong class="mobile-meta-value">
          ${escapeHtml(currentAttendance)}
        </strong>
      </div>

      <div class="mobile-meta-item">
        <span class="mobile-meta-label">
          Working Time
        </span>

        <strong class="mobile-meta-value">
          ${escapeHtml(previous.workingMinutes !== undefined ? formatMinutes(previous.workingMinutes) : '-')}
        </strong>
      </div>

      <div class="mobile-meta-item">
        <span class="mobile-meta-label">
          ${state.activeTab === 'pending' ? 'Submitted' : 'Processed'}
        </span>

        <strong class="mobile-meta-value">
          ${escapeHtml(formatDateTime(state.activeTab === 'pending' ? request.createdAt : processedDate))}
        </strong>
      </div>

      ${
        status === 'regularized'
          ? `
            <div class="mobile-meta-item">
              <span class="mobile-meta-label">
                Final Attendance
              </span>

              <strong class="mobile-meta-value">
                ${escapeHtml(formatAttendanceStatus(getRegularizedAttendanceStatus(request)))}
              </strong>
            </div>
          `
          : ''
      }
    </div>

    <div class="mobile-request-reason">
      ${escapeHtml(request.reason || 'No reason provided')}
    </div>

    <div class="mobile-request-actions">
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

  const status = normalizeStatus(request.status);

  /*
   * Employee.
   */
  setText('detailEmployeeAvatar', getInitials(name));

  setText('detailEmployeeName', name);

  setText('detailEmployeeRole', formatRole(request.userRole));

  /*
   * Status.
   */
  const statusContainer = $('detailStatus');

  if (statusContainer) {
    statusContainer.innerHTML = createStatusBadge(status);
  }

  /*
   * Request information.
   */
  setText('detailDate', formatDate(request.date));

  setText('detailCreatedAt', formatDateTime(request.createdAt));

  const previous = request.previousAttendance || {};

  setText('detailCurrentAttendance', formatAttendanceSummary(previous));

  /*
   * Final attendance result.
   */
  renderRegularizedResult(request, status);

  /*
   * Previous attendance.
   */
  renderPreviousAttendance(previous);

  /*
   * Employee reason.
   */
  setText('detailReason', request.reason || 'No reason provided');

  /*
   * Attachment.
   */
  renderAttachment(request.attachmentUrl);

  /*
   * Rejection reason.
   */
  renderRejectionReason(request);

  /*
   * Processing information.
   */
  renderProcessingInformation(request, status);

  /*
   * Processing history.
   */
  renderApprovalTimeline(request.approval, request);

  /*
   * Only pending requests
   * can be processed.
   */
  if (status === 'pending') {
    show($('detailActions'));

    setActionButtonsDisabled(false);
  } else {
    hide($('detailActions'));
  }
}

// ==========================================================
// REGULARIZED RESULT
// ==========================================================

function renderRegularizedResult(request, status) {
  const item = $('detailRegularizedResultItem');

  const result = $('detailRegularizedResult');

  if (!item || !result) {
    return;
  }

  const attendanceStatus = getRegularizedAttendanceStatus(request);

  if (status !== 'regularized' || !attendanceStatus) {
    hide(item);
    result.textContent = '-';
    result.className = 'attendance-result';

    return;
  }

  result.innerHTML = createAttendanceResultBadge(attendanceStatus);

  result.className = 'attendance-result';

  show(item);
}

// ==========================================================
// PREVIOUS ATTENDANCE
// ==========================================================

function renderPreviousAttendance(previous) {
  const container = $('previousAttendance');

  if (!container) {
    return;
  }

  if (!previous || Object.keys(previous).length === 0) {
    container.textContent = 'No attendance record existed when this request was created.';

    return;
  }

  container.innerHTML = `
    <div class="previous-attendance-grid">

      <div class="previous-value">
        <span>Status</span>

        <strong>
          ${escapeHtml(formatAttendanceStatus(previous.status))}
        </strong>
      </div>

      <div class="previous-value">
        <span>Attendance Type</span>

        <strong>
          ${escapeHtml(previous.attendanceType ? formatAttendanceType(previous.attendanceType) : '-')}
        </strong>
      </div>

      <div class="previous-value">
        <span>Check-in</span>

        <strong>
          ${escapeHtml(formatTime(previous.checkInTime))}
        </strong>
      </div>

      <div class="previous-value">
        <span>Check-out</span>

        <strong>
          ${escapeHtml(formatTime(previous.checkOutTime))}
        </strong>
      </div>

      <div class="previous-value">
        <span>Working Time</span>

        <strong>
          ${escapeHtml(formatMinutes(previous.workingMinutes))}
        </strong>
      </div>

      <div class="previous-value">
        <span>Punctuality</span>

        <strong>
          ${escapeHtml(previous.punctuality ? formatStatus(previous.punctuality) : '-')}
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

  if (!section || !link) {
    return;
  }

  if (!url) {
    hide(section);
    link.removeAttribute('href');

    return;
  }

  link.href = String(url);

  show(section);
}

// ==========================================================
// REJECTION REASON
// ==========================================================

function renderRejectionReason(request) {
  const section = $('rejectionReasonSection');

  const reason = $('detailRejectionReason');

  if (!section || !reason) {
    return;
  }

  if (normalizeStatus(request.status) !== 'rejected' || !request.rejectionReason) {
    hide(section);
    reason.textContent = '-';

    return;
  }

  reason.textContent = request.rejectionReason;

  show(section);
}

// ==========================================================
// PROCESSING INFORMATION
// ==========================================================

function renderProcessingInformation(request, status) {
  const section = $('processingSection');

  if (!section) {
    return;
  }

  if (status !== 'regularized' && status !== 'rejected') {
    hide(section);

    return;
  }

  const processedByName =
    request.regularizedByName ||
    request.rejectedByName ||
    request.processedByName ||
    request.regularizedByRole ||
    request.rejectedByRole ||
    '-';

  const processedAt = getProcessedAt(request);

  setText('detailProcessedBy', processedByName);

  setText('detailProcessedAt', formatDateTime(processedAt));

  show(section);
}

// ==========================================================
// PROCESSING TIMELINE
// ==========================================================

function renderApprovalTimeline(approval, request) {
  const container = $('approvalTimeline');

  if (!container) {
    return;
  }

  container.innerHTML = '';

  /*
   * New backend may still expose
   * approval information.
   *
   * Render it if present.
   */
  if (Array.isArray(approval) && approval.length > 0) {
    for (const step of approval) {
      renderApprovalStep(container, step, request);
    }

    return;
  }

  /*
   * Fallback for the simplified
   * regularization workflow.
   */
  const status = normalizeStatus(request?.status);

  if (status === 'regularized') {
    appendTimelineFallback(
      container,
      'regularized',
      'Regularized',
      getRegularizedAttendanceStatus(request),
      getProcessedAt(request)
    );

    return;
  }

  if (status === 'rejected') {
    appendTimelineFallback(
      container,
      'rejected',
      'Rejected',
      request.rejectionReason ? `Reason: ${request.rejectionReason}` : null,
      getProcessedAt(request)
    );

    return;
  }

  appendTimelineFallback(container, 'pending', 'Pending review', 'Waiting for manager / HR action.', null);
}

function renderApprovalStep(container, step, request) {
  const status = normalizeStatus(step?.status);

  const wrapper = document.createElement('div');

  wrapper.className = `approval-step ${getTimelineClass(status)}`;

  const icon = getTimelineIcon(status);

  const title = document.createElement('div');

  title.className = 'approval-step-title';

  const level = Number.isFinite(Number(step?.level)) ? Number(step.level) + 1 : null;

  let person = 'Assigned reviewer';

  let timestamp = null;

  if (status === 'regularized' || status === 'approved') {
    person = step?.regularizedByRole
      ? `${formatRole(step.regularizedByRole)} regularized`
      : step?.approvedByRole
        ? `${formatRole(step.approvedByRole)} regularized`
        : 'Regularized';

    timestamp = step?.regularizedAt || step?.approvedAt;
  } else if (status === 'rejected') {
    person = step?.rejectedByRole ? `${formatRole(step.rejectedByRole)} rejected` : 'Rejected';

    timestamp = step?.rejectedAt;
  } else {
    person = 'Pending review';
  }

  title.textContent = level !== null ? `Level ${level} · ${person}` : person;

  const meta = document.createElement('div');

  meta.className = 'approval-step-meta';

  if (timestamp) {
    meta.textContent = formatDateTime(timestamp);
  } else {
    meta.textContent = 'Waiting for action';
  }

  const iconElement = document.createElement('div');

  iconElement.className = 'approval-step-icon';

  iconElement.textContent = icon;

  const content = document.createElement('div');

  content.className = 'approval-step-content';

  content.appendChild(title);
  content.appendChild(meta);

  /*
   * Rejection reason.
   */
  if (status === 'rejected' && request?.rejectionReason) {
    const reason = document.createElement('div');

    reason.className = 'approval-step-reason';

    reason.textContent = `Reason: ${request.rejectionReason}`;

    content.appendChild(reason);
  }

  /*
   * Final attendance result.
   */
  if (status === 'regularized') {
    const attendanceStatus = getRegularizedAttendanceStatus(request);

    if (attendanceStatus) {
      const result = document.createElement('div');

      result.className = 'approval-step-meta';

      result.textContent = `Final attendance: ${formatAttendanceStatus(attendanceStatus)}`;

      content.appendChild(result);
    }
  }

  wrapper.appendChild(iconElement);
  wrapper.appendChild(content);

  container.appendChild(wrapper);
}

function appendTimelineFallback(container, status, titleText, metaText, timestamp) {
  const wrapper = document.createElement('div');

  wrapper.className = `approval-step ${getTimelineClass(status)}`;

  const icon = document.createElement('div');

  icon.className = 'approval-step-icon';

  icon.textContent = getTimelineIcon(status);

  const content = document.createElement('div');

  content.className = 'approval-step-content';

  const title = document.createElement('div');

  title.className = 'approval-step-title';

  title.textContent = titleText;

  const meta = document.createElement('div');

  meta.className = 'approval-step-meta';

  meta.textContent = timestamp ? formatDateTime(timestamp) : metaText || 'Waiting for action';

  content.appendChild(title);
  content.appendChild(meta);

  if (metaText && status === 'rejected') {
    const reason = document.createElement('div');

    reason.className = 'approval-step-reason';

    reason.textContent = metaText;

    content.appendChild(reason);
  }

  wrapper.appendChild(icon);
  wrapper.appendChild(content);

  container.appendChild(wrapper);
}

// ==========================================================
// REGULARIZE
// ==========================================================

async function regularizeSelectedRequest(attendanceStatus) {
  const request = state.selectedRequest;

  if (!request?.id) {
    return;
  }

  if (normalizeStatus(request.status) !== 'pending') {
    if (typeof AppAlert !== 'undefined') {
      AppAlert.warning('This request is no longer pending.');
    }

    return;
  }

  const allowedStatuses = ['full_day', 'half_day', 'absent'];

  if (!allowedStatuses.includes(attendanceStatus)) {
    return;
  }

  const employeeName = request.userName || 'this employee';

  const attendanceLabel = formatAttendanceStatus(attendanceStatus);

  const confirmed = await AppAlert.confirm(
    `Mark the attendance request submitted by ${employeeName} as ${attendanceLabel}?`,
    'Regularize Attendance'
  );

  if (!confirmed) {
    return;
  }

  setProcessingState(true);

  try {
    await Api.post(`/attendance-regularization/${encodeURIComponent(request.id)}/regularize`, {
      attendanceStatus,
    });

    if (typeof AppAlert !== 'undefined') {
      AppAlert.close();
    }

    closeDetailModal();

    if (typeof AppAlert !== 'undefined') {
      await AppAlert.success(`Attendance has been regularized as ${attendanceLabel}.`, 'Attendance Regularized');
    }

    await loadAllRequests();
  } catch (error) {
    if (typeof AppAlert !== 'undefined') {
      AppAlert.close();
    }

    console.error('Failed to regularize attendance:', error);

    if (typeof AppAlert !== 'undefined') {
      await AppAlert.error(error?.message || 'Unable to regularize this attendance request.', 'Regularization Failed');
    }
  } finally {
    setProcessingState(false);
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

  if (normalizeStatus(request.status) !== 'pending') {
    if (typeof AppAlert !== 'undefined') {
      AppAlert.warning('This request is no longer pending.');
    }

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
              font-size:14px;
              line-height:1.5;
            "
          >
            You are rejecting the attendance
            regularization request submitted by
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
              color:#374151;
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
              margin:0;
              resize:vertical;
            "
          ></textarea>

          <div
            style="
              margin-top:6px;
              font-size:11px;
              color:#9ca3af;
              text-align:right;
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

  setProcessingState(true);

  try {
    await Api.post(`/attendance-regularization/${encodeURIComponent(request.id)}/reject`, {
      reason,
    });

    if (typeof AppAlert !== 'undefined') {
      AppAlert.close();
    }

    closeDetailModal();

    if (typeof AppAlert !== 'undefined') {
      await AppAlert.success('The attendance regularization request has been rejected.', 'Request Rejected');
    }

    await loadAllRequests();
  } catch (error) {
    if (typeof AppAlert !== 'undefined') {
      AppAlert.close();
    }

    console.error('Failed to reject regularization:', error);

    if (typeof AppAlert !== 'undefined') {
      await AppAlert.error(error?.message || 'Unable to reject this attendance regularization.', 'Rejection Failed');
    }
  } finally {
    setProcessingState(false);
  }
}

// ==========================================================
// PROCESSING STATE
// ==========================================================

function setProcessingState(processing) {
  state.processing = processing;

  const buttons = document.querySelectorAll('.attendance-decision-btn, #rejectRequestBtn');

  buttons.forEach((button) => {
    button.disabled = processing;
  });

  if (processing) {
    if (typeof AppAlert !== 'undefined') {
      AppAlert.loading('Processing attendance regularization...');
    }
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
  state.processing = false;

  document.body.style.overflow = '';

  setProcessingState(false);
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

  setText('detailErrorMessage', message || 'Unable to load request.');
}

function setActionButtonsDisabled(disabled) {
  const buttons = document.querySelectorAll('.attendance-decision-btn, #rejectRequestBtn');

  buttons.forEach((button) => {
    button.disabled = disabled;
  });
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

  setText('requestErrorMessage', message || 'Unable to load requests.');
}

// ==========================================================
// PROCESSED DATE
// ==========================================================

function getProcessedAt(request) {
  const status = normalizeStatus(request?.status);

  if (status === 'regularized') {
    return (
      request.regularizedAt ||
      request.processedAt ||
      findApprovalTimestamp(request, 'regularized') ||
      findApprovalTimestamp(request, 'approved')
    );
  }

  if (status === 'rejected') {
    return request.rejectedAt || request.processedAt || findApprovalTimestamp(request, 'rejected');
  }

  return null;
}

function findApprovalTimestamp(request, status) {
  if (!Array.isArray(request?.approval)) {
    return null;
  }

  const step = [...request.approval].reverse().find((item) => normalizeStatus(item?.status) === status);

  if (!step) {
    return null;
  }

  if (status === 'regularized') {
    return step.regularizedAt || step.approvedAt;
  }

  if (status === 'approved') {
    return step.approvedAt;
  }

  if (status === 'rejected') {
    return step.rejectedAt;
  }

  return null;
}

// ==========================================================
// REGULARIZED ATTENDANCE STATUS
// ==========================================================

function getRegularizedAttendanceStatus(request) {
  return (
    request?.attendanceStatus ||
    request?.regularizedAttendanceStatus ||
    request?.finalAttendanceStatus ||
    request?.attendance?.attendanceType ||
    null
  );
}

// ==========================================================
// STATUS NORMALIZATION
// ==========================================================

function normalizeStatus(status) {
  const value = String(status || '')
    .trim()
    .toLowerCase();

  /*
   * approved is legacy.
   *
   * We normalize it for compatibility
   * when reading old records, but all
   * new UI/API behavior uses
   * "regularized".
   */
  if (value === 'approved') {
    return 'regularized';
  }

  return value;
}

// ==========================================================
// FORMATTING
// ==========================================================

function formatAttendanceStatus(status) {
  if (!status) {
    return 'Not available';
  }

  const normalized = String(status).trim().toLowerCase();

  switch (normalized) {
    case 'full_day':
      return 'Full Day';

    case 'half_day':
      return 'Half Day';

    case 'absent':
      return 'Absent';

    case 'present':
      return 'Present';

    default:
      return formatStatus(normalized);
  }
}

function formatAttendanceType(type) {
  if (!type) {
    return 'Not available';
  }

  const normalized = String(type).trim().toLowerCase();

  switch (normalized) {
    case 'full_day':
      return 'Full Day';

    case 'half_day':
      return 'Half Day';

    default:
      return formatStatus(normalized);
  }
}

function formatAttendanceSummary(attendance) {
  if (!attendance || Object.keys(attendance).length === 0) {
    return 'No attendance record';
  }

  const status = attendance.status ? formatAttendanceStatus(attendance.status) : null;

  const type = attendance.attendanceType ? formatAttendanceType(attendance.attendanceType) : null;

  if (status && type) {
    return `${status} · ${type}`;
  }

  return status || type || 'Attendance recorded';
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
   * Backend attendance date:
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
// TIME
// ==========================================================

function formatTime(value) {
  if (!value) {
    return '-';
  }

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
   * Serialized Firestore Timestamp.
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
  const safeStatus = normalizeStatus(status || 'pending');

  return `
    <span class="status-badge status-${escapeHtml(safeStatus)}">
      ${escapeHtml(formatStatus(safeStatus))}
    </span>
  `;
}

// ==========================================================
// ATTENDANCE RESULT BADGE
// ==========================================================

function createAttendanceResultBadge(status) {
  const safeStatus = String(status || '').toLowerCase();

  const className =
    safeStatus === 'full_day'
      ? 'attendance-result-full-day'
      : safeStatus === 'half_day'
        ? 'attendance-result-half-day'
        : safeStatus === 'absent'
          ? 'attendance-result-absent'
          : '';

  return `
    <span
      class="attendance-result-badge ${className}"
    >
      ${escapeHtml(formatAttendanceStatus(safeStatus))}
    </span>
  `;
}

// ==========================================================
// TIMELINE
// ==========================================================

function getTimelineClass(status) {
  const normalized = normalizeStatus(status);

  if (normalized === 'approved') {
    return 'regularized';
  }

  if (normalized === 'regularized') {
    return 'regularized';
  }

  if (normalized === 'rejected') {
    return 'rejected';
  }

  return 'pending';
}

function getTimelineIcon(status) {
  const normalized = normalizeStatus(status);

  if (normalized === 'regularized' || normalized === 'approved') {
    return '✓';
  }

  if (normalized === 'rejected') {
    return '×';
  }

  return '…';
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
