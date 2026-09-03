/* ==========================================================
   TeamoTrack Teams
========================================================== */

(function () {
  'use strict';

  let teams = [];
  let managers = [];
  let shifts = [];
  let isRoot = false;

  let editingId = null;

  /* ==========================================================
       Initialize
    ========================================================== */

  window.initializeTeamsPage = async function () {
    await loadTeams();

    document.getElementById('searchInput')?.addEventListener('input', renderTeams);
  };

  /* ==========================================================
       Load Teams
    ========================================================== */

  async function loadTeams() {
    try {
      const data = await Api.get('/teams/data');

      if (!data) {
        return;
      }

      teams = Array.isArray(data.teams) ? data.teams : [];

      managers = Array.isArray(data.managers) ? data.managers : [];

      shifts = Array.isArray(data.shifts) ? data.shifts : [];

      isRoot = data.isRoot === true;

      populateManagers();

      populateShifts();

      renderTeams();
    } catch (error) {
      console.error(error);

      AppAlert.error(error.message || 'Unable to load teams');
    }
  }

  /* ==========================================================
       Shifts
    ========================================================== */

  function populateShifts() {
    const select = document.getElementById('shiftId');

    const message = document.getElementById('noShiftMessage');

    if (!select) {
      return;
    }

    select.innerHTML = `
                <option value="">
                    Select Shift
                </option>
            `;

    shifts.forEach((shift) => {
      if (!shift?.id) {
        return;
      }

      select.insertAdjacentHTML(
        'beforeend',
        `
                    <option value="${escapeHtml(shift.id)}">
                        ${escapeHtml(shift.name || 'Unnamed Shift')}
                    </option>
                `
      );
    });

    if (!shifts.length) {
      select.disabled = true;

      message?.classList.remove('d-none');
    } else {
      select.disabled = false;

      message?.classList.add('d-none');
    }
  }

  /* ==========================================================
       Render Teams
    ========================================================== */

  function renderTeams() {
    const searchInput = document.getElementById('searchInput');

    const tbody = document.getElementById('teamTable');

    if (!searchInput || !tbody) {
      return;
    }

    const search = searchInput.value.trim().toLowerCase();

    /*
     * Search across:
     *
     * Team
     * Manager
     * Shift
     */
    const list = teams.filter((team) => {
      if (!search) {
        return true;
      }

      const manager = getManagerName(team.leadId);

      const shift = getShiftName(team.shiftId);

      return (
        String(team.name || '')
          .toLowerCase()
          .includes(search) ||
        manager.toLowerCase().includes(search) ||
        shift.toLowerCase().includes(search)
      );
    });

    /*
     * Count filtered teams.
     */
    const count = document.getElementById('teamCount');

    if (count) {
      count.textContent = list.length;
    }

    /*
     * Empty state.
     */
    if (!list.length) {
      tbody.innerHTML = `
                    <tr>

                        <td
                            colspan="5"
                            class="empty-state"
                        >

                            <div class="py-3">

                                <i
                                    class="bi bi-people fs-4 d-block mb-2"
                                ></i>

                                ${search ? 'No teams match your search' : 'No teams found'}

                            </div>

                        </td>

                    </tr>
                `;

      return;
    }

    /*
     * Render rows.
     */
    tbody.innerHTML = list.map(renderTeamRow).join('');
  }

  /* ==========================================================
       Render Team Row
    ========================================================== */

  function renderTeamRow(team) {
    const manager = getManagerName(team.leadId);

    const shift = getShiftName(team.shiftId);

    const hasShift = Boolean(team.shiftId);

    const executiveCount = Number(team.totalExecutives || 0);

    return `
            <tr>

                <!-- Team -->

                <td>

                    <div class="team-name">

                        ${escapeHtml(team.name || 'Unnamed')}

                    </div>

                </td>


                <!-- Manager -->

                <td>

                    ${
                      team.leadId
                        ? `
                                <div class="fw-medium">
                                    ${escapeHtml(manager)}
                                </div>
                            `
                        : `
                                <span class="team-badge">
                                    Root Manager
                                </span>
                            `
                    }

                </td>


                <!-- Shift -->

                <td>

                    ${
                      hasShift
                        ? escapeHtml(shift)
                        : `
                                <span
                                    class="team-badge team-no-shift"
                                >
                                    No Shift
                                </span>
                            `
                    }

                </td>


                <!-- Executives -->

                <td>

                    <span class="fw-medium">
                        ${executiveCount}
                    </span>

                </td>


                <!-- Actions -->

                <td class="text-end">

                    <button
                        type="button"
                        class="action-btn"
                        title="Edit Team"
                        onclick="editTeam('${escapeJs(team.id)}')"
                    >

                        <i class="bi bi-pencil"></i>

                    </button>


                    <button
                        type="button"
                        class="action-btn"
                        title="Delete Team"
                        onclick="deleteTeam('${escapeJs(team.id)}')"
                    >

                        <i class="bi bi-trash"></i>

                    </button>

                </td>

            </tr>
        `;
  }

  /* ==========================================================
       Get Manager
    ========================================================== */

  function getManagerName(leadId) {
    if (!leadId) {
      return 'No Manager';
    }

    return managers.find((manager) => manager.id === leadId)?.fullName || 'Manager unavailable';
  }

  /* ==========================================================
       Get Shift
    ========================================================== */

  function getShiftName(shiftId) {
    if (!shiftId) {
      return 'No Shift';
    }

    return shifts.find((shift) => shift.id === shiftId)?.name || 'Shift unavailable';
  }

  /* ==========================================================
   Managers
========================================================== */

  function populateManagers() {
    const select = document.getElementById('leadId');

    if (!select) {
      return;
    }

    select.innerHTML = '';

    if (isRoot) {
      select.insertAdjacentHTML(
        'beforeend',
        `
        <option value="">
          No Manager — Root Owned
        </option>
      `
      );
    } else {
      select.insertAdjacentHTML(
        'beforeend',
        `
        <option value="">
          Select Team Manager
        </option>
      `
      );
    }

    managers.forEach((manager) => {
      if (!manager?.id) {
        return;
      }

      select.insertAdjacentHTML(
        'beforeend',
        `
        <option value="${escapeHtml(manager.id)}">
          ${escapeHtml(manager.fullName || 'Unnamed Manager')}
        </option>
      `
      );
    });

    /*
     * Root can always select:
     *
     * - No Manager
     * - Any available manager
     *
     * Therefore Root manager dropdown
     * must never be disabled here.
     */
    if (isRoot) {
      select.disabled = false;
      return;
    }

    /*
     * Non-root users need a manager.
     */
    select.disabled = managers.length === 0;
  }

  /* ==========================================================
   Open Team Modal
========================================================== */

  function openTeamModal(id = null) {
    editingId = id || null;

    const modalTitle = document.getElementById('modalTitle');

    const saveButton = document.getElementById('saveTeamBtn');

    const leadSelect = document.getElementById('leadId');

    const hint = document.getElementById('teamLeadHint');

    if (modalTitle) {
      modalTitle.textContent = id ? 'Edit Team' : 'Add Team';
    }

    if (saveButton) {
      saveButton.textContent = id ? 'Update Team' : 'Save Team';
    }

    /*
     * ADD TEAM
     */
    if (!id) {
      resetTeamForm();

      /*
       * Always enable manager selection
       * when creating a new team.
       *
       * Root:
       *   manager is optional.
       *
       * Non-root:
       *   manager is required.
       */
      if (leadSelect) {
        leadSelect.disabled = !isRoot && managers.length === 0;
      }

      if (hint) {
        hint.textContent = isRoot
          ? 'You can assign a manager or keep this team directly under Root.'
          : managers.length
            ? 'Select the manager responsible for this team.'
            : 'No manager is available for your hierarchy.';
      }
    }

    /*
     * EDIT TEAM
     */
    if (id) {
      /*
       * editTeam() handles the existing
       * team's manager and executive rules.
       */
    }

    const modalElement = document.getElementById('teamModal');

    if (!modalElement) {
      return;
    }

    bootstrap.Modal.getOrCreateInstance(modalElement).show();
  }

  /* ==========================================================
   Reset Form
========================================================== */

  function resetTeamForm() {
    const teamId = document.getElementById('teamId');

    const teamName = document.getElementById('teamName');

    const leadId = document.getElementById('leadId');

    const shiftId = document.getElementById('shiftId');

    if (teamId) {
      teamId.value = '';
    }

    if (teamName) {
      teamName.value = '';
    }

    if (leadId) {
      /*
       * IMPORTANT:
       *
       * Re-enable the field here.
       *
       * Otherwise a previous Edit Team operation
       * may have disabled it.
       */
      leadId.disabled = false;

      leadId.value = '';

      /*
       * Rebuild the correct options.
       */
      populateManagers();
    }

    if (shiftId) {
      shiftId.value = '';
    }

    const hint = document.getElementById('teamLeadHint');

    if (hint) {
      hint.textContent = isRoot
        ? 'You can assign a manager or keep this team directly under Root.'
        : 'The selected manager will be responsible for this team.';
    }
  }

  /* ==========================================================
   Edit Team
========================================================== */

  function editTeam(id) {
    const team = teams.find((item) => item.id === id);

    if (!team) {
      AppAlert.warning('Team is no longer available');

      return;
    }

    const teamId = document.getElementById('teamId');

    const teamName = document.getElementById('teamName');

    const leadSelect = document.getElementById('leadId');

    const shiftSelect = document.getElementById('shiftId');

    const hint = document.getElementById('teamLeadHint');

    const executiveCount = Number(team.totalExecutives || 0);

    if (teamId) {
      teamId.value = id;
    }

    if (teamName) {
      teamName.value = team.name || '';
    }

    if (leadSelect) {
      /*
       * Existing manager must still be
       * available to this user.
       */
      if (team.leadId && !managers.some((manager) => manager.id === team.leadId)) {
        AppAlert.warning("You no longer have access to this team's manager");

        return;
      }

      leadSelect.value = team.leadId || '';

      /*
       * Existing team:
       *
       * If executives exist, changing the
       * manager would change their hierarchy.
       */
      leadSelect.disabled = executiveCount > 0;

      if (hint) {
        hint.textContent =
          executiveCount > 0
            ? 'Manager cannot be changed while executives are assigned to this team.'
            : isRoot
              ? 'You can assign a manager or keep this team directly under Root.'
              : 'The selected manager will be responsible for this team.';
      }
    }

    if (shiftSelect) {
      shiftSelect.value = team.shiftId || '';
    }

    /*
     * IMPORTANT:
     *
     * Do NOT call openTeamModal(id)
     * because it should not reset anything.
     *
     * Just show the modal.
     */
    const modalElement = document.getElementById('teamModal');

    if (!modalElement) {
      return;
    }

    bootstrap.Modal.getOrCreateInstance(modalElement).show();
  }

  /* ==========================================================
   Save Team
========================================================== */

  async function saveTeam() {
    const name = document.getElementById('teamName')?.value.trim() || '';

    const leadSelect = document.getElementById('leadId');

    const leadId = leadSelect?.value || '';

    const shiftId = document.getElementById('shiftId')?.value || '';

    const button = document.getElementById('saveTeamBtn');

    /* ======================================================
           BASIC VALIDATION
        ====================================================== */

    if (!name) {
      AppAlert.warning('Team name is required');

      return;
    }

    if (!shiftId) {
      AppAlert.warning('Shift policy is required');

      return;
    }

    /* ======================================================
           ROOT / MANAGER VALIDATION
        ====================================================== */

    /*
     * Non-root managers MUST select
     * a team manager.
     *
     * They cannot create a root-owned
     * unassigned team.
     */
    if (!isRoot && !leadId) {
      AppAlert.warning('Please select a team manager');

      return;
    }

    /*
     * Selected manager must be one of
     * the managers returned by backend.
     */
    if (leadId && !managers.some((manager) => manager.id === leadId)) {
      AppAlert.warning('Invalid team manager');

      return;
    }

    /* ======================================================
           SAVE
        ====================================================== */

    try {
      if (button) {
        button.disabled = true;
      }

      AppAlert.loading(editingId ? 'Updating team...' : 'Creating team...');

      /*
       * Only send fields the client
       * is allowed to control.
       *
       * NEVER send:
       *
       * rootId
       * parentId
       * createdBy
       */
      const body = {
        name,

        leadId: leadId || undefined,

        shiftId,
      };

      const data = editingId ? await Api.patch(`/teams/${editingId}`, body) : await Api.post('/teams', body);

      if (!data) {
        AppAlert.close();

        return;
      }

      AppAlert.close();

      AppAlert.success(editingId ? 'Team updated successfully' : 'Team created successfully');

      bootstrap.Modal.getInstance(document.getElementById('teamModal'))?.hide();

      editingId = null;

      await loadTeams();
    } catch (error) {
      console.error(error);

      AppAlert.close();

      AppAlert.error(error.message || (editingId ? 'Unable to update team' : 'Unable to create team'));
    } finally {
      if (button) {
        button.disabled = false;
      }
    }
  }

  /* ==========================================================
       Delete Team
    ========================================================== */

  async function deleteTeam(id) {
    const team = teams.find((item) => item.id === id);

    if (!team) {
      AppAlert.warning('Team is no longer available');

      return;
    }

    const confirmed = await AppAlert.confirm(
      `
                    Are you sure you want to delete
                    the team "${team.name}"?
                    This action cannot be undone.
                `
    );

    if (!confirmed) {
      return;
    }

    try {
      AppAlert.loading('Deleting team...');

      const data = await Api.delete(`/teams/${id}`);

      if (!data) {
        AppAlert.close();

        return;
      }

      AppAlert.close();

      AppAlert.success('Team deleted successfully');

      await loadTeams();
    } catch (error) {
      console.error(error);

      AppAlert.close();

      AppAlert.error(error.message || 'Unable to delete team');
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
       Escape JavaScript
    ========================================================== */

  function escapeJs(value) {
    return String(value ?? '')
      .replaceAll('\\', '\\\\')
      .replaceAll("'", "\\'")
      .replaceAll('\n', '\\n')
      .replaceAll('\r', '\\r');
  }

  /* ==========================================================
       Global HTML Handlers
    ========================================================== */

  window.editTeam = editTeam;

  window.deleteTeam = deleteTeam;

  window.openTeamModal = openTeamModal;

  window.saveTeam = saveTeam;
})();
