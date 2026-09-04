/* ==========================================================
   TeamoTrack Leave
=========================================================== */

(() => {
  'use strict';

  let leaves = [];

  let leaveTypes = [];

  let canManageLeaveTypes = false;

  /* ======================================================
       PUBLIC INITIALIZER
       Called by app.js
    ======================================================= */

  window.initializeLeavePage = async function () {
    hideMyLeaveForRootManager();

    bindEvents();

    /*
     * Do NOT call /leave/types/manage here.
     *
     * Normal users only need active
     * leave types for applying leave.
     */
    AppAlert.loading('Loading leave data...');
    await Promise.all([loadLeaves(), loadLeaveTypes(), loadApprovals(), loadTeamLeaves(), loadLeaveTypeAccess()]);
    AppAlert.close();
  };

  /* ======================================================
       EVENTS
    ======================================================= */

  function bindEvents() {
    document.getElementById('btnApplyLeave')?.addEventListener('click', openLeaveModal);

    document.getElementById('leaveTypes')?.addEventListener('click', handleLeaveTypeAction);

    document.getElementById('btnSubmitLeave')?.addEventListener('click', submitLeave);

    document.getElementById('btnAddLeaveType')?.addEventListener('click', openLeaveTypeModal);

    document.getElementById('btnSaveLeaveType')?.addEventListener('click', saveLeaveType);

    document.querySelectorAll('#leaveTabs [data-tab]').forEach((button) => {
      button.addEventListener('click', () => switchTab(button.dataset.tab));
    });

    document.getElementById('startDate')?.addEventListener('change', calculateDays);

    document.getElementById('endDate')?.addEventListener('change', calculateDays);
  }

  /* ======================================================
       LOAD MY LEAVES
    ======================================================= */

  async function loadLeaves() {
    try {
      const response = await Api.get('/leave/data');

      leaves = response?.leaves ?? [];

      renderLeaves();

      updateSummary();
    } catch (error) {
      AppAlert.error(error?.message || 'Failed to load leave');
    }
  }

  /* ======================================================
       LOAD ACTIVE LEAVE TYPES
       Available to everyone who can apply leave
    ======================================================= */

  async function loadLeaveTypes() {
    try {
      const response = await Api.get('/leave/types');

      leaveTypes = response?.types ?? [];

      fillLeaveTypeSelect();
    } catch (error) {
      AppAlert.error(error?.message || 'Failed to load leave types');
    }
  }

  /* ======================================================
       LEAVE TYPE ACCESS
    ======================================================= */

  async function loadLeaveTypeAccess() {
    const tab = document.querySelector('[data-tab="types"]');

    if (!tab) {
      return;
    }

    const navItem = tab.closest('.nav-item');

    /*
     * ALWAYS HIDDEN BY DEFAULT
     */
    navItem?.classList.add('d-none');

    canManageLeaveTypes = false;

    try {
      const response = await Api.get('/leave/types/access');

      canManageLeaveTypes = response?.canManage === true;

      /*
       * Show ONLY when backend
       * explicitly grants access.
       */
      if (!canManageLeaveTypes) {
        return;
      }

      navItem?.classList.remove('d-none');

      /*
       * Load all types including
       * inactive types for management.
       */
      await loadManageableLeaveTypes();
    } catch (error) {
      /*
       * Stay hidden if access check
       * fails for any reason.
       */
      canManageLeaveTypes = false;

      navItem?.classList.add('d-none');
    }
  }

  /* ======================================================
       LOAD MANAGEABLE LEAVE TYPES
       Only root_manager or authorized root_hr
    ======================================================= */

  async function loadManageableLeaveTypes() {
    try {
      const response = await Api.get('/leave/types/manage');

      leaveTypes = response?.types ?? [];

      renderTypes();

      fillLeaveTypeSelect();
    } catch (error) {
      canManageLeaveTypes = false;

      document.querySelector('[data-tab="types"]')?.closest('.nav-item')?.classList.add('d-none');
    }
  }

  /* ======================================================
       LOAD APPROVALS
    ======================================================= */

  async function loadApprovals() {
    const table = document.getElementById('approvalTable');

    if (!table) {
      return;
    }

    try {
      const response = await Api.get('/leave/approvals');

      const approvals = response?.approvals ?? [];

      updateApprovalBadge(approvals.length);

      if (!approvals.length) {
        table.innerHTML = `
                    <tr>

                        <td
                            colspan="6"
                            class="text-center
                                   text-muted
                                   py-5">

                            No pending approvals

                        </td>

                    </tr>
                `;

        return;
      }

      table.innerHTML = approvals
        .map((leave) => {
          const type = leaveTypes.find((type) => type.id === leave.leaveTypeId);

          return `
                            <tr>

                                <td>

                                    <strong>
                                        ${escapeHtml(leave.userName || leave.userId)}
                                    </strong>

                                </td>


                                <td>

                                    ${escapeHtml(type?.name || 'Leave')}

                                </td>


                                <td>

                                    ${formatDate(leave.startDate)}

                                    -

                                    ${formatDate(leave.endDate)}

                                </td>


                                <td>
                                    ${leave.days ?? 0}
                                </td>


                                <td>

                                    ${escapeHtml(leave.reason || '-')}

                                </td>


                                <td class="text-end">

                                    <button
                                        class="btn
                                               btn-sm
                                               btn-success
                                               me-1"
                                        data-approve="${leave.id}">

                                        <i
                                            class="bi
                                                   bi-check-lg">
                                        </i>

                                    </button>


                                    <button
                                        class="btn
                                               btn-sm
                                               btn-danger"
                                        data-reject="${leave.id}">

                                        <i
                                            class="bi
                                                   bi-x-lg">
                                        </i>

                                    </button>

                                </td>

                            </tr>
                        `;
        })
        .join('');

      table.querySelectorAll('[data-approve]').forEach((button) => {
        button.addEventListener('click', () => approveLeave(button.dataset.approve));
      });

      table.querySelectorAll('[data-reject]').forEach((button) => {
        button.addEventListener('click', () => rejectLeave(button.dataset.reject));
      });
    } catch (error) {
      table.innerHTML = `
                <tr>

                    <td
                        colspan="6"
                        class="text-center
                               text-danger
                               py-5">

                        Failed to load approvals

                    </td>

                </tr>
            `;

      updateApprovalBadge(0);

      AppAlert.error(error?.message || 'Failed to load approvals');
    }
  }

  /* ======================================================
       APPROVE LEAVE
    ======================================================= */

  async function approveLeave(id) {
    const confirmed = await AppAlert.confirm('Approve this leave request?');

    if (!confirmed) {
      return;
    }

    try {
      AppAlert.loading('Approving leave...');

      await Api.patch(`/leave/${id}/approve`, {});

      AppAlert.close();

      AppAlert.success('Leave approved successfully');

      await loadLeaves();

      await loadApprovals();

      await loadTeamLeaves();
    } catch (error) {
      AppAlert.close();

      AppAlert.error(error?.message || 'Failed to approve leave');
    }
  }

  /* ======================================================
       REJECT LEAVE
    ======================================================= */

  async function rejectLeave(id) {
    const confirmed = await AppAlert.confirm('Reject this leave request?');

    if (!confirmed) {
      return;
    }

    try {
      AppAlert.loading('Rejecting leave...');

      await Api.patch(`/leave/${id}/reject`, {
        reason: 'Rejected by approver',
      });

      AppAlert.close();

      AppAlert.success('Leave rejected successfully');

      await loadLeaves();

      await loadApprovals();

      await loadTeamLeaves();
    } catch (error) {
      AppAlert.close();

      AppAlert.error(error?.message || 'Failed to reject leave');
    }
  }

  /* ======================================================
       APPROVAL BADGE
    ======================================================= */

  function updateApprovalBadge(count) {
    const badge = document.getElementById('approvalCount');

    if (!badge) {
      return;
    }

    badge.textContent = count;

    badge.classList.toggle('d-none', count === 0);
  }

  /* ======================================================
       TEAM LEAVES
    ======================================================= */

  async function loadTeamLeaves() {
    const table = document.getElementById('teamLeaveTable');

    if (!table) {
      return;
    }

    try {
      const response = await Api.get('/leave/team');

      const teamLeaves = response?.leaves ?? [];

      if (!teamLeaves.length) {
        table.innerHTML = `
                    <tr>

                        <td
                            colspan="6"
                            class="text-center
                                   text-muted
                                   py-5">

                            No team leave records

                        </td>

                    </tr>
                `;

        return;
      }

      table.innerHTML = teamLeaves
        .map((leave) => {
          const type = leaveTypes.find((type) => type.id === leave.leaveTypeId);

          return `
                            <tr>

                                <td>

                                    <strong>
                                        ${escapeHtml(leave.userName || leave.userId)}
                                    </strong>

                                </td>


                                <td>

                                    ${escapeHtml(type?.name || 'Leave')}

                                </td>


                                <td>

                                    ${formatDate(leave.startDate)}

                                    -

                                    ${formatDate(leave.endDate)}

                                </td>


                                <td>
                                    ${leave.days ?? 0}
                                </td>


                                <td>
                                    ${statusBadge(leave.status)}
                                </td>


                                <td>
                                    ${approvalText(leave)}
                                </td>

                            </tr>
                        `;
        })
        .join('');
    } catch (error) {
      table.innerHTML = `
                <tr>

                    <td
                        colspan="6"
                        class="text-center
                               text-danger
                               py-5">

                        Failed to load team leave

                    </td>

                </tr>
            `;

      AppAlert.error(error?.message || 'Failed to load team leave');
    }
  }

  /* ======================================================
       RENDER MY LEAVES
    ======================================================= */

  function renderLeaves() {
    const table = document.getElementById('leaveTable');

    if (!table) {
      return;
    }

    if (!leaves.length) {
      table.innerHTML = `
                <tr>

                    <td
                        colspan="6"
                        class="text-center
                               text-muted
                               py-5">

                        No leave requests found

                    </td>

                </tr>
            `;

      return;
    }

    table.innerHTML = leaves
      .map((leave) => {
        const type = leaveTypes.find((type) => type.id === leave.leaveTypeId);

        return `
                        <tr>

                            <td>

                                <strong>
                                    ${escapeHtml(type?.name || 'Leave')}
                                </strong>

                                <div
                                    class="small
                                           text-muted">

                                    ${escapeHtml(type?.code || '')}

                                </div>

                            </td>


                            <td>

                                ${formatDate(leave.startDate)}

                                -

                                ${formatDate(leave.endDate)}

                            </td>


                            <td>
                                ${leave.days ?? 0}
                            </td>


                            <td>
                                ${statusBadge(leave.status)}
                            </td>


                            <td>
                                ${approvalText(leave)}
                            </td>


                            <td class="text-end">

                                ${actionButtons(leave)}

                            </td>

                        </tr>
                    `;
      })
      .join('');

    bindRowActions();
  }

  /* ======================================================
       ACTION BUTTONS
    ======================================================= */

  function actionButtons(leave) {
    if (leave.status === 'pending') {
      return `
                <button
                    class="btn
                           btn-sm
                           btn-outline-danger"
                    data-action="cancel"
                    data-id="${leave.id}">

                    Cancel

                </button>
            `;
    }

    if (leave.status === 'draft') {
      return `
                <button
                    class="btn
                           btn-sm
                           btn-outline-danger"
                    data-action="cancel"
                    data-id="${leave.id}">

                    Cancel

                </button>
            `;
    }

    return `
            <button
                class="btn
                       btn-sm
                       btn-outline-secondary"
                data-action="view"
                data-id="${leave.id}">

                View

            </button>
        `;
  }

  function bindRowActions() {
    document.querySelectorAll('[data-action="cancel"]').forEach((button) => {
      button.addEventListener('click', () => cancelLeave(button.dataset.id));
    });
  }

  /* ======================================================
       APPROVAL TEXT
    ======================================================= */

  function approvalText(leave) {
    if (leave.status === 'approved') {
      return `
                <span class="text-success">

                    <i
                        class="bi
                               bi-check-circle
                               me-1">
                    </i>

                    Approved

                </span>
            `;
    }

    if (leave.status === 'rejected') {
      return `
                <span class="text-danger">

                    <i
                        class="bi
                               bi-x-circle
                               me-1">
                    </i>

                    Rejected

                </span>
            `;
    }

    const level = leave.currentLevel;

    const step = leave.approval?.[level];

    if (step) {
      return `
                <span class="text-warning">

                    Waiting for
                    ${escapeHtml(step.role || 'Approver')}

                </span>
            `;
    }

    return '-';
  }

  /* ======================================================
       SUMMARY
    ======================================================= */

  function updateSummary() {
    const pending = leaves.filter((x) => x.status === 'pending').length;

    const approved = leaves.filter((x) => x.status === 'approved').length;

    const rejected = leaves.filter((x) => x.status === 'rejected').length;

    setText('pendingLeave', pending);

    setText('approvedLeave', approved);

    setText('rejectedLeave', rejected);
  }

  /* ======================================================
       APPLY LEAVE
    ======================================================= */

  function openLeaveModal() {
    document.getElementById('leaveForm')?.reset();

    bootstrap.Modal.getOrCreateInstance(document.getElementById('leaveModal')).show();
  }

  async function submitLeave() {
    const dto = {
      leaveTypeId: value('leaveTypeId'),

      startDate: value('startDate'),

      endDate: value('endDate'),

      days: Number(value('leaveDays')),

      durationUnit: value('durationUnit'),

      reason: value('leaveReason'),
    };

    if (!dto.leaveTypeId || !dto.startDate || !dto.endDate || !dto.days) {
      AppAlert.error('Please fill all required fields');

      return;
    }

    if (new Date(dto.endDate) < new Date(dto.startDate)) {
      AppAlert.error('End date cannot be before start date');

      return;
    }

    try {
      AppAlert.loading('Submitting leave...');

      await Api.post('/leave', dto);

      AppAlert.close();

      AppAlert.success('Leave submitted successfully');

      bootstrap.Modal.getInstance(document.getElementById('leaveModal'))?.hide();

      await loadLeaves();

      await loadApprovals();

      await loadTeamLeaves();
    } catch (error) {
      AppAlert.close();

      AppAlert.error(error?.message || 'Failed to submit leave');
    }
  }

  /* ======================================================
       CANCEL
    ======================================================= */

  async function cancelLeave(id) {
    const confirmed = await AppAlert.confirm('Cancel this leave request?');

    if (!confirmed) {
      return;
    }

    try {
      AppAlert.loading('Cancelling...');

      await Api.delete(`/leave/${id}`);

      AppAlert.close();

      AppAlert.success('Leave cancelled');

      await loadLeaves();

      await loadApprovals();

      await loadTeamLeaves();
    } catch (error) {
      AppAlert.close();

      AppAlert.error(error?.message || 'Failed to cancel leave');
    }
  }

  /* ======================================================
       LEAVE TYPES
    ======================================================= */

  function renderTypes() {
    const container = document.getElementById('leaveTypes');

    if (!container) {
      return;
    }

    if (!canManageLeaveTypes) {
      container.innerHTML = '';

      return;
    }

    if (!leaveTypes.length) {
      container.innerHTML = `
                <div class="col-12">

                    <div
                        class="text-center
                               text-muted
                               py-4">

                        No leave types configured.

                    </div>

                </div>
            `;

      return;
    }

    container.innerHTML = leaveTypes
      .map((type) => {
        const active = type.active === true;

        return `
                        <div
                            class="col-12
                                   col-md-6
                                   col-xl-4">

                            <div
                                class="card
                                       border
                                       h-100
                                       ${active ? '' : 'opacity-75'}">

                                <div
                                    class="card-body">

                                    <div
                                        class="d-flex
                                               justify-content-between
                                               align-items-start">

                                        <div>

                                            <h6
                                                class="mb-1">

                                                ${escapeHtml(type.name)}

                                            </h6>


                                            <small
                                                class="text-muted">

                                                ${escapeHtml(type.code)}

                                            </small>

                                        </div>


                                        <span
                                            class="badge
                                                   ${
                                                     active
                                                       ? 'bg-success-subtle text-success'
                                                       : 'bg-secondary-subtle text-secondary'
                                                   }">

                                            ${active ? 'Active' : 'Inactive'}

                                        </span>

                                    </div>


                                    <hr>


                                    <div class="small">

                                        <div class="mb-1">

                                            <strong>
                                                Paid:
                                            </strong>

                                            ${type.isPaid ? 'Yes' : 'No'}

                                        </div>


                                        <div class="mb-1">

                                            <strong>
                                                Deduct Salary:
                                            </strong>

                                            ${type.deductSalary ? 'Yes' : 'No'}

                                        </div>


                                        <div class="mb-1">

                                            <strong>
                                                Approval:
                                            </strong>

                                            ${approvalLabel(type.approvalMode)}

                                        </div>


                                        <div class="mb-1">

                                            <strong>
                                                Requires Approval:
                                            </strong>

                                            ${type.requiresApproval ? 'Yes' : 'No'}

                                        </div>


                                        <div class="mb-1">

                                            <strong>
                                                Annual:
                                            </strong>

                                            ${type.annualAllocation ?? 0}
                                            days

                                        </div>


                                        <div>

                                            <strong>
                                                Max Request:
                                            </strong>

                                            ${type.maxDaysPerRequest ?? 0}
                                            days

                                        </div>

                                    </div>


                                    <hr>


                                    <div
                                        class="d-flex
                                               justify-content-end">

                                        ${
                                          active
                                            ? `
                                                <button
                                                    type="button"
                                                    class="btn
                                                           btn-sm
                                                           btn-outline-danger"
                                                    data-type-action="deactivate"
                                                    data-id="${type.id}">

                                                    <i
                                                        class="bi
                                                               bi-pause-circle
                                                               me-1">
                                                    </i>

                                                    Deactivate

                                                </button>
                                            `
                                            : `
                                                <button
                                                    type="button"
                                                    class="btn
                                                           btn-sm
                                                           btn-outline-success"
                                                    data-type-action="reactivate"
                                                    data-id="${type.id}">

                                                    <i
                                                        class="bi
                                                               bi-play-circle
                                                               me-1">
                                                    </i>

                                                    Reactivate

                                                </button>
                                            `
                                        }

                                    </div>

                                </div>

                            </div>

                        </div>
                    `;
      })
      .join('');
  }

  /* ======================================================
       LEAVE TYPE ACTION
    ======================================================= */

  async function handleLeaveTypeAction(event) {
    if (!canManageLeaveTypes) {
      return;
    }

    const button = event.target.closest('[data-type-action]');

    if (!button) {
      return;
    }

    const id = button.dataset.id;

    const action = button.dataset.typeAction;

    if (action === 'deactivate') {
      await deactivateLeaveType(id);

      return;
    }

    if (action === 'reactivate') {
      await reactivateLeaveType(id);
    }
  }

  /* ======================================================
       DEACTIVATE LEAVE TYPE
    ======================================================= */

  async function deactivateLeaveType(id) {
    if (!canManageLeaveTypes) {
      return;
    }

    const confirmed = await AppAlert.confirm(
      'Deactivate this leave type? Existing leave history will remain unchanged.'
    );

    if (!confirmed) {
      return;
    }

    try {
      AppAlert.loading('Deactivating leave type...');

      await Api.patch(`/leave/types/${id}/deactivate`, {});

      AppAlert.close();

      AppAlert.success('Leave type deactivated');

      await loadManageableLeaveTypes();
    } catch (error) {
      AppAlert.close();

      AppAlert.error(error?.message || 'Failed to deactivate leave type');
    }
  }

  /* ======================================================
       REACTIVATE LEAVE TYPE
    ======================================================= */

  async function reactivateLeaveType(id) {
    if (!canManageLeaveTypes) {
      return;
    }

    const confirmed = await AppAlert.confirm('Reactivate this leave type?');

    if (!confirmed) {
      return;
    }

    try {
      AppAlert.loading('Reactivating leave type...');

      await Api.patch(`/leave/types/${id}/reactivate`, {});

      AppAlert.close();

      AppAlert.success('Leave type reactivated');

      await loadManageableLeaveTypes();
    } catch (error) {
      AppAlert.close();

      AppAlert.error(error?.message || 'Failed to reactivate leave type');
    }
  }

  /* ======================================================
       LEAVE TYPE SELECT
    ======================================================= */

  function fillLeaveTypeSelect() {
    const select = document.getElementById('leaveTypeId');

    if (!select) {
      return;
    }

    select.innerHTML = `
            <option value="">
                Select leave type
            </option>
        `;

    leaveTypes
      .filter((type) => type.active === true)
      .forEach((type) => {
        select.insertAdjacentHTML(
          'beforeend',
          `
                            <option
                                value="${type.id}">

                                ${escapeHtml(type.name)}

                            </option>
                        `
        );
      });
  }

  /* ======================================================
       OPEN LEAVE TYPE MODAL
    ======================================================= */

  function openLeaveTypeModal() {
    if (!canManageLeaveTypes) {
      return;
    }

    document.getElementById('leaveTypeForm')?.reset();

    bootstrap.Modal.getOrCreateInstance(document.getElementById('leaveTypeModal')).show();
  }

  /* ======================================================
       SAVE LEAVE TYPE
    ======================================================= */

  async function saveLeaveType() {
    if (!canManageLeaveTypes) {
      return;
    }

    const dto = {
      name: value('typeName'),

      code: value('typeCode').toUpperCase(),

      isPaid: checked('isPaid'),

      deductSalary: checked('deductSalary'),

      requiresApproval: checked('requiresApproval'),

      allowHalfDay: checked('allowHalfDay'),

      annualAllocation: Number(value('annualAllocation') || 0),

      maxDaysPerRequest: Number(value('maxDaysPerRequest') || 0),

      approvalMode: value('approvalMode'),
    };

    if (!dto.name || !dto.code) {
      AppAlert.error('Name and code are required');

      return;
    }

    /*
     * Auto approval and Requires Approval
     * cannot logically be enabled together.
     */
    if (dto.approvalMode === 'auto') {
      dto.requiresApproval = false;
    }

    try {
      AppAlert.loading('Saving leave type...');

      await Api.post('/leave/types', dto);

      AppAlert.close();

      AppAlert.success('Leave type created');

      bootstrap.Modal.getInstance(document.getElementById('leaveTypeModal'))?.hide();

      await loadManageableLeaveTypes();
    } catch (error) {
      AppAlert.close();

      AppAlert.error(error?.message || 'Failed to create leave type');
    }
  }

  /* ======================================================
       TABS
    ======================================================= */

  function switchTab(tab) {
    /*
     * Never allow unauthorized access
     * to Leave Types UI.
     */
    if (tab === 'types' && !canManageLeaveTypes) {
      return;
    }

    document.querySelectorAll('#leaveTabs .nav-link').forEach((button) => {
      button.classList.toggle('active', button.dataset.tab === tab);
    });

    toggle('tabRequests', tab !== 'requests');

    toggle('tabApprovals', tab !== 'approvals');

    toggle('tabTeam', tab !== 'team');

    toggle('tabTypes', tab !== 'types');

    if (tab === 'approvals') {
      loadApprovals();
    }

    if (tab === 'team') {
      loadTeamLeaves();
    }

    if (tab === 'types') {
      loadManageableLeaveTypes();
    }
  }

  /* ======================================================
       DATE
    ======================================================= */

  function calculateDays() {
    const start = value('startDate');

    const end = value('endDate');

    if (!start || !end) {
      return;
    }

    const first = new Date(start);

    const last = new Date(end);

    if (last < first) {
      return;
    }

    const days = Math.floor((last - first) / 86400000) + 1;

    const input = document.getElementById('leaveDays');

    if (input) {
      input.value = days;
    }
  }

  /* ======================================================
       HELPERS
    ======================================================= */

  function value(id) {
    return document.getElementById(id)?.value?.trim() || '';
  }

  function checked(id) {
    return Boolean(document.getElementById(id)?.checked);
  }

  function setText(id, text) {
    const element = document.getElementById(id);

    if (element) {
      element.textContent = text;
    }
  }

  function toggle(id, hidden) {
    const element = document.getElementById(id);

    if (element) {
      element.classList.toggle('d-none', hidden);
    }
  }

  function formatDate(date) {
    if (!date) {
      return '-';
    }

    const parsed = new Date(date);

    if (isNaN(parsed.getTime())) {
      return '-';
    }

    return parsed.toLocaleDateString('en-IN', {
      day: '2-digit',

      month: 'short',

      year: 'numeric',
    });
  }

  function statusBadge(status) {
    const map = {
      pending: ['warning', 'Pending'],

      approved: ['success', 'Approved'],

      rejected: ['danger', 'Rejected'],

      cancelled: ['secondary', 'Cancelled'],

      draft: ['secondary', 'Draft'],
    };

    const item = map[status] || ['secondary', status || 'Unknown'];

    return `
            <span
                class="badge
                       bg-${item[0]}">

                ${escapeHtml(item[1])}

            </span>
        `;
  }

  function approvalLabel(mode) {
    const labels = {
      auto: 'Auto Approve',

      one_level: '1 Level',

      two_level: '2 Levels',

      root: 'Root Approval',
    };

    return labels[mode] || mode || '-';
  }

  function hideMyLeaveForRootManager() {
    const role = document.getElementById('profileMenuUserRole')?.textContent?.trim().toLowerCase();

    if (role !== 'root_manager') {
      return;
    }

    const myLeaveTab = document.querySelector('#leaveTabs [data-tab="requests"]');

    myLeaveTab?.closest('.nav-item')?.classList.add('d-none');

    // Make sure root_manager doesn't stay on the hidden tab
    switchTab('approvals');
  }

  function escapeHtml(value) {
    return String(value ?? '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
  }
})();
