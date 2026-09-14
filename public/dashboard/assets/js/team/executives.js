/* ==========================================================
   TeamoTrack Executives
========================================================== */

(function () {
  'use strict';

  let executives = [];
  let teams = [];

  let editingId = null;
  let permissionId = null;

  /* ==========================================================
       Initialize
  ========================================================== */

  window.initializeExecutivesPage = async function () {
    await loadExecutives();

    document.getElementById('searchInput')?.addEventListener('input', renderExecutives);

    document.getElementById('teamFilter')?.addEventListener('change', renderExecutives);

    document.getElementById('teamId')?.addEventListener('change', updateParentFromTeam);

    initializePasswordToggle();
  };

  /* ==========================================================
       Password Toggle
  ========================================================== */

  function initializePasswordToggle() {
    const password = document.getElementById('password');
    const toggle = document.getElementById('togglePassword');

    if (!password || !toggle) {
      return;
    }

    toggle.onclick = () => {
      const icon = toggle.querySelector('i');

      if (password.type === 'password') {
        password.type = 'text';

        icon?.classList.remove('bi-eye');
        icon?.classList.add('bi-eye-slash');

        toggle.title = 'Hide password';
        toggle.setAttribute('aria-label', 'Hide password');
      } else {
        password.type = 'password';

        icon?.classList.remove('bi-eye-slash');
        icon?.classList.add('bi-eye');

        toggle.title = 'Show password';
        toggle.setAttribute('aria-label', 'Show password');
      }
    };
  }

  /* ==========================================================
       Load Executives
  ========================================================== */

  async function loadExecutives() {
    try {
      AppAlert.loading('Loading executives...');

      const data = await Api.get('/executives/data');

      if (!data) {
        AppAlert.close();
        return;
      }

      executives = Array.isArray(data.executives) ? data.executives : [];

      teams = Array.isArray(data.teams) ? data.teams : [];

      populateTeams();
      renderExecutives();

      AppAlert.close();
    } catch (error) {
      console.error(error);

      AppAlert.close();

      AppAlert.error(error.message || 'Unable to load executives');
    }
  }

  /* ==========================================================
       Teams
  ========================================================== */

  function populateTeams() {
    const filter = document.getElementById('teamFilter');
    const select = document.getElementById('teamId');

    if (filter) {
      filter.innerHTML = `
        <option value="">
          All Teams
        </option>
      `;

      teams.forEach((team) => {
        filter.insertAdjacentHTML(
          'beforeend',
          `
            <option value="${escapeHtml(team.id)}">
              ${escapeHtml(team.name || 'Unnamed Team')}
            </option>
          `
        );
      });
    }

    if (select) {
      select.innerHTML = `
        <option value="">
          Select Team
        </option>
      `;

      teams.forEach((team) => {
        select.insertAdjacentHTML(
          'beforeend',
          `
            <option value="${escapeHtml(team.id)}">
              ${escapeHtml(team.name || 'Unnamed Team')}
            </option>
          `
        );
      });
    }
  }

  /* ==========================================================
       Parent Manager + Shift
  ========================================================== */

  function updateParentFromTeam() {
    const teamId = document.getElementById('teamId')?.value || '';

    const parentSelect = document.getElementById('parentId');

    const hint = document.getElementById('parentHint');

    const shiftDisplay = document.getElementById('shiftDisplay');

    const shiftHint = document.getElementById('shiftHint');

    if (!parentSelect) {
      return;
    }

    parentSelect.innerHTML = '';

    if (shiftDisplay) {
      shiftDisplay.value = '';
    }

    if (!teamId) {
      parentSelect.innerHTML = `
        <option value="">
          Select Team first
        </option>
      `;

      parentSelect.disabled = true;

      if (hint) {
        hint.textContent = "Parent manager is determined by the selected team's manager.";
      }

      if (shiftHint) {
        shiftHint.textContent = "Shift is determined by the selected team's shift.";
      }

      return;
    }

    const team = teams.find((item) => item.id === teamId);

    if (!team) {
      parentSelect.innerHTML = `
        <option value="">
          Manager unavailable
        </option>
      `;

      parentSelect.disabled = true;

      if (shiftDisplay) {
        shiftDisplay.value = '';
      }

      if (hint) {
        hint.textContent = 'Manager information is unavailable.';
      }

      return;
    }

    /*
     * ------------------------------------------------------
     * ROOT-OWNED TEAM SUPPORT
     * ------------------------------------------------------
     *
     * Backend returns rootId as leadId when the team is
     * directly owned by root.
     *
     * Therefore use nullish coalescing instead of ||.
     *
     * This preserves a valid rootId.
     */
    const leadId = team.leadId ?? team.rootId ?? '';

    const parentName =
      team.leadName || team.managerName || (leadId && team.leadId == null ? 'Root Manager' : 'No Manager');

    parentSelect.innerHTML = `
      <option value="${escapeHtml(leadId)}">
        ${escapeHtml(parentName)}
      </option>
    `;

    parentSelect.disabled = true;

    if (hint) {
      hint.textContent = leadId
        ? "Parent manager is automatically inherited from the team's manager."
        : 'This team has no assigned parent manager.';
    }

    /*
     * ------------------------------------------------------
     * SHIFT
     * ------------------------------------------------------
     */

    const shift = team.shift || null;

    const shiftName = team.shiftName || shift?.name || '';

    if (shiftDisplay) {
      shiftDisplay.value = shiftName;
    }

    if (shiftHint) {
      shiftHint.textContent = shiftName
        ? 'Shift is automatically inherited from the selected team.'
        : 'This team has no assigned shift.';
    }
  }

  /* ==========================================================
       Render Executives
  ========================================================== */

  function renderExecutives() {
    const tbody = document.getElementById('executiveTable');

    if (!tbody) {
      return;
    }

    const search = document.getElementById('searchInput')?.value?.trim()?.toLowerCase() || '';

    const teamFilterId = document.getElementById('teamFilter')?.value || '';

    const list = executives.filter((exec) => {
      const matchesSearch =
        !search ||
        exec.fullName?.toLowerCase().includes(search) ||
        exec.email?.toLowerCase().includes(search) ||
        exec.mobile?.toLowerCase().includes(search) ||
        exec.teamName?.toLowerCase().includes(search) ||
        exec.shiftName?.toLowerCase().includes(search);

      const matchesTeam = !teamFilterId || exec.teamId === teamFilterId;

      return matchesSearch && matchesTeam;
    });

    const count = document.getElementById('executiveCount');

    if (count) {
      count.textContent = list.length;
    }

    if (!list.length) {
      tbody.innerHTML = `
        <tr>
          <td
            colspan="8"
            class="empty-state"
          >
            No executives found
          </td>
        </tr>
      `;

      return;
    }

    tbody.innerHTML = list.map(renderExecutiveRow).join('');
  }

  /* ==========================================================
       Executive Row
  ========================================================== */

  function renderExecutiveRow(exec) {
    const team = teams.find((item) => item.id === exec.teamId);

    const teamName = exec.teamName || team?.name || 'No Team';

    const parentName = exec.parentName || team?.leadName || team?.managerName || 'No Manager';

    const shiftName = exec.shiftName || team?.shiftName || team?.shift?.name || 'No Shift';

    return `
      <tr>

        <!-- Executive -->

        <td>
          <div class="exec-name">
            ${escapeHtml(exec.fullName || 'Unknown')}
          </div>

          <div class="exec-email">
            ${escapeHtml(exec.email || '')}
          </div>
        </td>

        <!-- Parent -->

        <td>
          <div class="exec-parent">
            ${escapeHtml(parentName)}
          </div>

          <div class="exec-parent-label">
            Parent Manager
          </div>
        </td>

        <!-- Mobile -->

        <td>
          ${escapeHtml(exec.mobile || '-')}
        </td>

        <!-- Team -->

        <td>
          <div class="exec-team">
            ${escapeHtml(teamName)}
          </div>
        </td>

        <!-- Shift -->

        <td>
          <div class="exec-shift">
            <i class="bi bi-clock me-1"></i>
            ${escapeHtml(shiftName)}
          </div>
        </td>

        <!-- Tracking -->

        <td>
          <span
            class="tracking-badge ${exec.isTrackingEnable ? 'tracking-on' : 'tracking-off'}"
          >
            ${exec.isTrackingEnable ? 'Enabled' : 'Disabled'}
          </span>
        </td>

        <!-- Status -->

        <td>
          <span
            class="status-badge ${exec.isActive ? 'status-active' : 'status-inactive'}"
          >
            ${exec.isActive ? 'Active' : 'Inactive'}
          </span>
        </td>

        <!-- Actions -->

        <td class="text-end">

          <div class="executive-actions">

            <!-- Edit -->

            <button
              type="button"
              class="action-btn"
              title="Edit"
              onclick="editExecutive('${escapeJs(exec.id)}')"
            >
              <i class="bi bi-pencil"></i>
            </button>

            <!-- Permissions -->

            <button
              type="button"
              class="action-btn"
              title="Permissions"
              onclick="openExecutivePermissions('${escapeJs(exec.id)}')"
            >
              <i class="bi bi-shield-lock"></i>
            </button>

          </div>

        </td>

      </tr>
    `;
  }

  /* ==========================================================
       Executive Modal
  ========================================================== */

  function openExecutiveModal(id = null) {
    editingId = id;

    const exec = executives.find((item) => item.id === id);

    const modalTitle = document.getElementById('modalTitle');

    const saveButton = document.getElementById('saveExecutiveBtn');

    const email = document.getElementById('email');

    const password = document.getElementById('password');

    const passwordHint = document.getElementById('passwordHint');

    if (modalTitle) {
      modalTitle.textContent = id ? 'Edit Executive' : 'Add Executive';
    }

    if (saveButton) {
      saveButton.textContent = id ? 'Update Executive' : 'Save Executive';
    }

    if (email) {
      email.disabled = !!id;
    }

    if (password) {
      password.value = '';
      password.type = 'password';
    }

    if (passwordHint) {
      passwordHint.textContent = id
        ? 'Leave blank to keep current password.'
        : 'Required when creating a new executive.';
    }

    if (!id) {
      resetExecutiveForm();
    } else {
      document.getElementById('executiveId').value = id;

      document.getElementById('fullName').value = exec?.fullName || '';

      document.getElementById('mobile').value = exec?.mobile || '';

      document.getElementById('email').value = exec?.email || '';

      document.getElementById('teamId').value = exec?.teamId || '';

      document.getElementById('gpsPriority').value = exec?.gpsPriority || 'low';

      document.getElementById('isActive').checked = exec?.isActive !== false;

      document.getElementById('isTrackingEnable').checked = exec?.isTrackingEnable === true;

      updateParentFromTeam();
    }

    bootstrap.Modal.getOrCreateInstance(document.getElementById('executiveModal')).show();
  }

  /* ==========================================================
       Reset Form
  ========================================================== */

  function resetExecutiveForm() {
    document.getElementById('executiveId').value = '';

    document.getElementById('fullName').value = '';

    document.getElementById('mobile').value = '';

    document.getElementById('email').value = '';

    document.getElementById('password').value = '';

    document.getElementById('password').type = 'password';

    document.getElementById('teamId').value = '';

    document.getElementById('parentId').innerHTML = `
      <option value="">
        Select Team first
      </option>
    `;

    document.getElementById('parentId').disabled = true;

    document.getElementById('shiftDisplay').value = '';

    document.getElementById('gpsPriority').value = 'low';

    document.getElementById('isActive').checked = true;

    document.getElementById('isTrackingEnable').checked = false;

    const hint = document.getElementById('parentHint');

    if (hint) {
      hint.textContent = "Parent manager is determined by the selected team's manager.";
    }

    const shiftHint = document.getElementById('shiftHint');

    if (shiftHint) {
      shiftHint.textContent = "Shift is determined by the selected team's shift.";
    }
  }

  /* ==========================================================
       Edit
  ========================================================== */

  function editExecutive(id) {
    if (!executives.some((exec) => exec.id === id)) {
      return;
    }

    openExecutiveModal(id);
  }

  /* ==========================================================
       Save Executive
  ========================================================== */

  async function saveExecutive() {
    const fullName = document.getElementById('fullName').value.trim();

    const mobile = document.getElementById('mobile').value.trim();

    const email = document.getElementById('email').value.trim();

    const password = document.getElementById('password').value.trim();

    const teamId = document.getElementById('teamId').value;

    const saveBtn = document.getElementById('saveExecutiveBtn');

    if (!fullName || !mobile || !teamId || (!editingId && (!email || !password))) {
      AppAlert.warning('Please fill all required fields');

      return;
    }

    const team = teams.find((item) => item.id === teamId);

    if (!team) {
      AppAlert.warning('Invalid team selected');

      return;
    }

    /*
     * ------------------------------------------------------
     * PARENT
     * ------------------------------------------------------
     *
     * Parent is derived from the team.
     *
     * IMPORTANT:
     * Do not use:
     *
     *   team.leadId || ''
     *
     * because rootId is a valid fallback for a root-owned
     * team.
     *
     * Backend remains authoritative.
     */
    const parentId = team.leadId ?? team.rootId ?? '';

    const body = {
      fullName,

      mobile,

      teamId,

      parentId,

      isActive: document.getElementById('isActive').checked,

      isTrackingEnable: document.getElementById('isTrackingEnable').checked,

      gpsPriority: document.getElementById('gpsPriority').value,
    };

    if (!editingId) {
      body.email = email;
      body.password = password;
    } else if (password) {
      body.password = password;
    }

    try {
      saveBtn.disabled = true;

      AppAlert.loading(editingId ? 'Updating executive...' : 'Adding executive...');

      const data = editingId ? await Api.patch(`/executives/${editingId}`, body) : await Api.post('/executives', body);

      if (!data) {
        return;
      }

      AppAlert.close();

      AppAlert.success(editingId ? 'Executive updated successfully' : 'Executive created successfully');

      bootstrap.Modal.getInstance(document.getElementById('executiveModal'))?.hide();

      await loadExecutives();
    } catch (error) {
      console.error(error);

      AppAlert.close();

      AppAlert.error(error.message || 'Failed to save executive');
    } finally {
      saveBtn.disabled = false;
    }
  }

  /* ==========================================================
       EXECUTIVE PERMISSIONS
  ========================================================== */

  async function openExecutivePermissions(id) {
    permissionId = id;

    const executive = executives.find((item) => item.id === id);

    if (!executive) {
      return;
    }

    try {
      AppAlert.loading('Loading permissions...');

      const data = await Api.get(`/executives/${id}/permissions`);

      if (!data) {
        return;
      }

      AppAlert.close();

      /*
       * The complete permission map returned
       * by the backend is passed directly to the
       * renderer.
       *
       * Nothing is hardcoded here.
       */
      renderExecutivePermissions(data.permissions || {});

      bootstrap.Modal.getOrCreateInstance(document.getElementById('executivePermissionModal')).show();
    } catch (error) {
      AppAlert.close();

      AppAlert.error(error.message || 'Unable to load executive permissions');
    }
  }

  /* ==========================================================
       Render Executive Permissions
  ========================================================== */

  function renderExecutivePermissions(permissions) {
    const container = document.getElementById('executivePermissionList');

    if (!container) {
      return;
    }

    /*
     * ------------------------------------------------------
     * PERMISSION GROUP LABELS
     * ------------------------------------------------------
     *
     * Individual permission keys are NOT hardcoded.
     *
     * Example:
     *
     * task.create
     * task.edit
     * task.delete
     *
     * will all automatically appear under Tasks.
     *
     * If a new group is introduced later, only its
     * display label needs to be added here.
     */
    const groups = {
      task: 'Tasks',
    };

    const permissionKeys = Object.keys(permissions);

    /*
     * ------------------------------------------------------
     * GROUPS PRESENT IN DB
     * ------------------------------------------------------
     *
     * First render the known groups in the desired order.
     */
    const knownGroups = Object.entries(groups);

    const knownGroupKeys = new Set(knownGroups.map(([group]) => group));

    let html = '';

    knownGroups.forEach(([group, title]) => {
      const keys = permissionKeys.filter((key) => key.startsWith(`${group}.`));

      if (!keys.length) {
        return;
      }

      html += renderExecutivePermissionGroup(title, keys, permissions);
    });

    /*
     * ------------------------------------------------------
     * UNKNOWN GROUPS
     * ------------------------------------------------------
     *
     * This keeps the UI future-proof.
     *
     * If the backend later introduces:
     *
     * attendance.view
     * tracking.view
     * leave.approve
     *
     * they will still render instead of disappearing.
     *
     * The raw prefix is formatted as the group title.
     */
    const unknownGroups = {};

    permissionKeys.forEach((key) => {
      const separatorIndex = key.indexOf('.');

      if (separatorIndex === -1) {
        return;
      }

      const group = key.slice(0, separatorIndex);

      if (knownGroupKeys.has(group)) {
        return;
      }

      if (!unknownGroups[group]) {
        unknownGroups[group] = [];
      }

      unknownGroups[group].push(key);
    });

    Object.entries(unknownGroups).forEach(([group, keys]) => {
      html += renderExecutivePermissionGroup(formatExecutivePermission(group), keys, permissions);
    });

    /*
     * ------------------------------------------------------
     * PERMISSIONS WITHOUT A GROUP
     * ------------------------------------------------------
     *
     * This is only a fallback for malformed/unusual keys.
     */
    const ungroupedKeys = permissionKeys.filter((key) => !key.includes('.'));

    if (ungroupedKeys.length) {
      html += renderExecutivePermissionGroup('Other', ungroupedKeys, permissions);
    }

    if (!html.trim()) {
      container.innerHTML = `
        <div class="executive-permission-empty">
          No permissions available.
        </div>
      `;

      return;
    }

    container.innerHTML = html;
  }

  /* ==========================================================
       Render Permission Group
  ========================================================== */

  function renderExecutivePermissionGroup(title, keys, permissions) {
    return `
      <div class="executive-permission-group">

        <div class="executive-permission-group-title">
          ${escapeHtml(title)}
        </div>

        ${keys
          .map((key) => {
            const action = key.split('.').slice(1).join(' ');

            /*
             * For a normal grouped permission:
             *
             * task.create -> Create
             *
             * For an unusual ungrouped permission:
             *
             * example -> Example
             */
            const label = action ? formatExecutivePermission(action) : formatExecutivePermission(key);

            return `
              <div class="executive-permission-item">

                <div>
                  <div class="executive-permission-label">
                    ${escapeHtml(label)}
                  </div>

                  <div class="executive-permission-key">
                    ${escapeHtml(key)}
                  </div>
                </div>

                <div class="form-check form-switch m-0">

                  <input
                    class="form-check-input executive-permission-toggle"
                    type="checkbox"
                    data-key="${escapeHtml(key)}"
                    ${permissions[key] === true ? 'checked' : ''}
                  />

                </div>

              </div>
            `;
          })
          .join('')}

      </div>
    `;
  }

  /* ==========================================================
       Save Executive Permissions
  ========================================================== */

  async function saveExecutivePermissions() {
    if (!permissionId) {
      return;
    }

    const permissions = {};

    /*
     * Collect every permission currently rendered
     * by the DB-driven UI.
     */
    document.querySelectorAll('.executive-permission-toggle').forEach((input) => {
      const key = input.dataset.key;

      if (!key) {
        return;
      }

      permissions[key] = input.checked;
    });

    const button = document.getElementById('saveExecutivePermissionBtn');

    if (!button) {
      return;
    }

    try {
      button.disabled = true;

      AppAlert.loading('Saving permissions...');

      const data = await Api.patch(`/executives/${permissionId}/permissions`, permissions);

      if (!data) {
        return;
      }

      AppAlert.close();

      AppAlert.success('Executive permissions updated');

      bootstrap.Modal.getInstance(document.getElementById('executivePermissionModal'))?.hide();
    } catch (error) {
      AppAlert.close();

      AppAlert.error(error.message || 'Unable to save executive permissions');
    } finally {
      button.disabled = false;
    }
  }

  /* ==========================================================
       Permission Label Formatter
  ========================================================== */

  function formatExecutivePermission(value) {
    return String(value ?? '')
      .replaceAll('_', ' ')
      .replace(/\b\w/g, (char) => char.toUpperCase());
  }

  /* ==========================================================
       Escape HTML
  ========================================================== */

  function escapeHtml(value) {
    return String(value ?? '')
      .replaceAll('&', '&amp;')
      .replaceAll('<', '&lt;')
      .replaceAll('>', '&gt;')
      .replaceAll('"', '&quot;')
      .replaceAll("'", '&#039;');
  }

  /* ==========================================================
       Escape JS
  ========================================================== */

  function escapeJs(value) {
    return String(value ?? '')
      .replaceAll('\\', '\\\\')
      .replaceAll("'", "\\'")
      .replaceAll('\n', '\\n')
      .replaceAll('\r', '\\r');
  }

  /* ==========================================================
       GLOBAL
  ========================================================== */

  window.openExecutiveModal = openExecutiveModal;

  window.editExecutive = editExecutive;

  window.saveExecutive = saveExecutive;

  window.openExecutivePermissions = openExecutivePermissions;

  window.saveExecutivePermissions = saveExecutivePermissions;
})();
