/* ==========================================================
   TeamoTrack Executives
========================================================== */

(function () {
  'use strict';

  let executives = [];
  let teams = [];
  let editingId = null;

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
       Load
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
       Parent Manager
    ========================================================== */

  function updateParentFromTeam() {
    const teamId = document.getElementById('teamId')?.value || '';

    const parentSelect = document.getElementById('parentId');

    const hint = document.getElementById('parentHint');

    if (!parentSelect) {
      return;
    }

    parentSelect.innerHTML = '';

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

      return;
    }

    /*
     * Team's leadId is the executive's
     * parent manager.
     */
    const leadId = team.leadId || '';

    const parentName = team.leadName || team.managerName || 'No Manager';

    parentSelect.innerHTML = `
                <option value="${escapeHtml(leadId)}">
                    ${escapeHtml(parentName)}
                </option>
            `;

    parentSelect.disabled = true;

    if (hint) {
      hint.textContent = leadId
        ? "Parent manager is automatically inherited from the team's manager."
        : 'This team has no manager.';
    }
  }

  /* ==========================================================
       Render
    ========================================================== */

  function renderExecutives() {
    const searchInput = document.getElementById('searchInput');

    const teamFilter = document.getElementById('teamFilter');

    const tbody = document.getElementById('executiveTable');

    if (!searchInput || !teamFilter || !tbody) {
      return;
    }

    const search = searchInput.value.trim().toLowerCase();

    const teamFilterId = teamFilter.value;

    const list = executives.filter((exec) => {
      const matchesSearch =
        !search ||
        exec.fullName?.toLowerCase().includes(search) ||
        exec.mobile?.toLowerCase().includes(search) ||
        exec.email?.toLowerCase().includes(search) ||
        exec.parentName?.toLowerCase().includes(search);

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
                            colspan="7"
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

                    ${escapeHtml(teamName)}

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


                <!-- Action -->

                <td class="text-end">

                    <button
                        type="button"
                        class="action-btn"
                        title="Edit"
                        onclick="editExecutive('${escapeJs(exec.id)}')"
                    >

                        <i class="bi bi-pencil"></i>

                    </button>

                </td>

            </tr>
        `;
  }

  /* ==========================================================
       Modal
    ========================================================== */

  function openExecutiveModal(id = null) {
    editingId = id;

    document.getElementById('modalTitle').textContent = id ? 'Edit Executive' : 'Add Executive';

    document.getElementById('saveExecutiveBtn').textContent = id ? 'Update Executive' : 'Save Executive';

    document.getElementById('email').disabled = !!editingId;

    document.getElementById('password').value = '';

    if (!id) {
      document.getElementById('executiveId').value = '';

      document.getElementById('fullName').value = '';

      document.getElementById('mobile').value = '';

      document.getElementById('email').value = '';

      document.getElementById('teamId').value = '';

      document.getElementById('parentId').innerHTML = `
                    <option value="">
                        Select Team first
                    </option>
                `;

      document.getElementById('parentId').disabled = true;

      document.getElementById('gpsPriority').value = 'low';

      document.getElementById('isActive').checked = true;

      document.getElementById('isTrackingEnable').checked = false;
    }

    bootstrap.Modal.getOrCreateInstance(document.getElementById('executiveModal')).show();
  }

  /* ==========================================================
       Edit
    ========================================================== */

  function editExecutive(id) {
    const exec = executives.find((item) => item.id === id);

    if (!exec) {
      return;
    }

    document.getElementById('executiveId').value = id;

    document.getElementById('fullName').value = exec.fullName || '';

    document.getElementById('mobile').value = exec.mobile || '';

    document.getElementById('email').value = exec.email || '';

    document.getElementById('teamId').value = exec.teamId || '';

    document.getElementById('gpsPriority').value = exec.gpsPriority || 'low';

    document.getElementById('isActive').checked = exec.isActive !== false;

    document.getElementById('isTrackingEnable').checked = exec.isTrackingEnable === true;

    updateParentFromTeam();

    openExecutiveModal(id);
  }

  /* ==========================================================
       Save
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
     * Parent is NOT taken from
     * an independently editable field.
     *
     * Backend should derive it from
     * team.leadId.
     */
    const parentId = team.leadId || '';

    if (!parentId) {
      AppAlert.warning('Selected team has no manager');

      return;
    }

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
        AppAlert.close();

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
       GLOBAL HTML HANDLERS
    ========================================================== */

  window.editExecutive = editExecutive;

  window.openExecutiveModal = openExecutiveModal;

  window.saveExecutive = saveExecutive;
})();
