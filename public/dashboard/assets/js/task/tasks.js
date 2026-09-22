/* ==========================================================
   TeamoTrack Tasks
   Hierarchy-aware frontend
   Location Search + Coordinates + Multi-layer Maps
   Searchable Executive Assignment
========================================================== */

(function () {
  'use strict';

  /* ==========================================================
       STATE
  ========================================================== */

  let tasks = [];
  let executives = [];
  let managers = [];

  let editingId = null;

  let currentMonth = new Date().toISOString().slice(0, 7);

  /* ==========================================================
       MAP STATE
  ========================================================== */

  let startMap = null;
  let endMap = null;

  let startMarker = null;
  let endMarker = null;

  let startTileControl = null;
  let endTileControl = null;

  const DEFAULT_MAP_CENTER = [20.5937, 78.9629];
  const DEFAULT_MAP_ZOOM = 5;
  const LOCATION_ZOOM = 15;

  /* ==========================================================
       LOCATION SEARCH
  ========================================================== */

  const PLACE_SEARCH_URL = 'https://photon.komoot.io/api/';

  const LOCATION_SEARCH_DEBOUNCE = 450;
  const LOCATION_SEARCH_LIMIT = 5;

  const locationSearchTimers = {
    start: null,
    end: null,
  };

  const locationSearchControllers = {
    start: null,
    end: null,
  };

  const locationSearchState = {
    start: {
      results: [],
      activeIndex: -1,
    },

    end: {
      results: [],
      activeIndex: -1,
    },
  };

  /* ==========================================================
       EXECUTIVE SEARCH STATE
  ========================================================== */

  let selectedExecutiveId = '';

  /* ==========================================================
       GOOGLE TEST LAYERS
       
       Keep this true only if you intentionally want these
       Google tile endpoints in your current environment.

       For production Google Maps integration, use Google's
       supported Maps/Map Tiles API.
  ========================================================== */

  const ENABLE_GOOGLE_TEST_LAYERS = true;

  /* ==========================================================
       INITIALIZE
  ========================================================== */

  window.initializeTasksPage = async function () {
    const month = document.getElementById('monthFilter');

    if (!month) return;

    month.value = currentMonth;

    month.addEventListener('change', loadTasks);

    document.getElementById('searchInput')?.addEventListener('input', renderTasks);

    document.getElementById('statusFilter')?.addEventListener('change', renderTasks);

    document.getElementById('isGeofence')?.addEventListener('change', toggleLocation);

    initializeLocationInputs();

    initializeExecutivePicker();

    initializeTaskModalEvents();

    await loadTasks();
  };

  /* ==========================================================
       MODAL EVENTS
  ========================================================== */

  function initializeTaskModalEvents() {
    const modal = document.getElementById('taskModal');

    if (!modal) return;

    /*
     * Bootstrap modal has finished opening.
     *
     * This is the correct point to tell Leaflet that its
     * container dimensions are now available.
     */

    modal.addEventListener('shown.bs.modal', () => {
      refreshMaps();

      /*
       * Multiple refreshes help with:
       *
       * 1. Bootstrap transition
       * 2. Browser layout calculation
       * 3. Different desktop/window sizes
       */
      setTimeout(refreshMaps, 50);

      setTimeout(refreshMaps, 200);

      setTimeout(refreshMaps, 500);
    });

    /*
     * When modal closes, completely reset transient UI.
     *
     * This prevents old location search results from
     * appearing when Add Task is opened again.
     */

    modal.addEventListener('hidden.bs.modal', () => {
      resetTransientTaskUI();
    });
  }

  /* ==========================================================
       WINDOW RESIZE
  ========================================================== */

  let resizeTimer = null;

  window.addEventListener('resize', () => {
    clearTimeout(resizeTimer);

    resizeTimer = setTimeout(() => {
      refreshMaps();
    }, 120);
  });

  /* ==========================================================
       MAP REFRESH
  ========================================================== */

  function refreshMaps() {
    if (startMap) {
      startMap.invalidateSize({
        animate: false,
        pan: false,
      });
    }

    if (endMap) {
      endMap.invalidateSize({
        animate: false,
        pan: false,
      });
    }
  }

  /* ==========================================================
       LOCATION INPUT INITIALIZATION
  ========================================================== */

  function initializeLocationInputs() {
    ['start', 'end'].forEach((type) => {
      const searchInput = document.getElementById(`${type}LocationSearch`);

      const latitudeInput = document.getElementById(`${type}Lat`);

      const longitudeInput = document.getElementById(`${type}Lng`);

      if (searchInput) {
        searchInput.addEventListener('input', () => {
          debounceLocationSearch(type);
        });

        searchInput.addEventListener('keydown', (event) => {
          handleSuggestionKeyboard(type, event);
        });

        searchInput.addEventListener('focus', () => {
          const state = locationSearchState[type];

          if (state.results.length) {
            renderLocationSuggestions(type);
          }
        });
      }

      if (latitudeInput) {
        latitudeInput.addEventListener('input', () => {
          validateCoordinateInput(type);
        });

        latitudeInput.addEventListener('blur', () => {
          applyCoordinateInputs(type);
        });
      }

      if (longitudeInput) {
        longitudeInput.addEventListener('input', () => {
          validateCoordinateInput(type);
        });

        longitudeInput.addEventListener('blur', () => {
          applyCoordinateInputs(type);
        });
      }

      /*
       * Use ONE delegated document listener for each
       * location search area.
       */
      document.addEventListener('click', (event) => {
        const container = document.getElementById(`${type}LocationSearchWrap`);

        if (!container) return;

        if (!container.contains(event.target)) {
          hideLocationSuggestions(type);
        }
      });
    });
  }

  /* ==========================================================
       LOAD TASKS
  ========================================================== */

  async function loadTasks() {
    const value = document.getElementById('monthFilter')?.value;

    if (!value) return;

    const [year, month] = value.split('-').map(Number);

    try {
      AppAlert.loading('Loading tasks...');

      const data = await Api.get(`/tasks/data?year=${year}&month=${month}`);

      if (!data) return;

      tasks = Array.isArray(data.tasks) ? data.tasks : [];

      executives = Array.isArray(data.executives) ? data.executives : [];

      managers = Array.isArray(data.managers) ? data.managers : [];

      populateExecutives();

      renderTasks();

      AppAlert.close();
    } catch (error) {
      AppAlert.close();

      console.error('Task loading failed:', error);

      AppAlert.error(error.message || 'Unable to load tasks');
    }
  }

  /* ==========================================================
       EXECUTIVES
  ========================================================== */

  function populateExecutives() {
    /*
     * Keep the old select populated too, if it exists.
     *
     * This provides backward compatibility with any code
     * elsewhere that may still reference #assignedTo.
     */

    const select = document.getElementById('assignedTo');

    if (select) {
      select.innerHTML = `
        <option value="">
          Unassigned
        </option>
      `;

      executives.forEach((executive) => {
        const name = executive.fullName || executive.email || 'Unknown';

        select.insertAdjacentHTML(
          'beforeend',
          `
              <option value="${escapeHtml(executive.id)}">
                ${escapeHtml(name)}
              </option>
            `
        );
      });

      select.value = selectedExecutiveId || '';
    }

    renderExecutiveOptions();
  }

  function getExecutive(id) {
    if (!id) return null;

    return executives.find((executive) => executive.id === id) || null;
  }

  function getManager(id) {
    if (!id) return null;

    return managers.find((manager) => manager.id === id) || null;
  }

  function getUserName(id) {
    if (!id) {
      return 'Unknown';
    }

    const executive = getExecutive(id);

    if (executive) {
      return executive.fullName || executive.email || 'Unknown';
    }

    const manager = getManager(id);

    if (manager) {
      return manager.fullName || manager.email || 'Unknown';
    }

    return id;
  }

  /* ==========================================================
       EXECUTIVE PICKER
  ========================================================== */

  function initializeExecutivePicker() {
    const input = document.getElementById('assignedToSearch');

    const wrapper = document.getElementById('executivePicker');

    const clearButton = document.getElementById('clearAssignedExecutive');

    if (!input || !wrapper) {
      return;
    }

    input.addEventListener('focus', () => {
      openExecutivePicker();
    });

    input.addEventListener('input', () => {
      renderExecutiveOptions();
      openExecutivePicker();
    });

    input.addEventListener('keydown', (event) => {
      handleExecutiveKeyboard(event);
    });

    if (clearButton) {
      clearButton.addEventListener('click', (event) => {
        event.preventDefault();
        event.stopPropagation();

        clearAssignedExecutive();
      });
    }

    document.addEventListener('click', (event) => {
      if (!wrapper.contains(event.target)) {
        closeExecutivePicker();
      }
    });
  }

  function renderExecutiveOptions() {
    const dropdown = document.getElementById('executiveOptions');

    const input = document.getElementById('assignedToSearch');

    if (!dropdown || !input) {
      return;
    }

    const query = input.value.trim().toLowerCase();

    const filtered = executives.filter((executive) => {
      if (!query) {
        return true;
      }

      const name = executive.fullName || '';

      const email = executive.email || '';

      return name.toLowerCase().includes(query) || email.toLowerCase().includes(query);
    });

    if (!filtered.length) {
      dropdown.innerHTML = `
        <div class="executive-empty">
          <i class="bi bi-person-x me-1"></i>
          No executives found
        </div>
      `;

      return;
    }

    dropdown.innerHTML = `
      <button
        type="button"
        class="executive-option executive-unassigned"
        data-executive-id=""
      >
        <span class="executive-option-avatar">
          <i class="bi bi-person"></i>
        </span>

        <span class="executive-option-info">
          <strong>Unassigned</strong>
          <small>No executive assigned</small>
        </span>
      </button>

      ${filtered
        .map((executive) => {
          const name = executive.fullName || executive.email || 'Unknown';

          const email = executive.email || '';

          const initials = getInitials(name);

          const selected = selectedExecutiveId === executive.id;

          return `
              <button
                type="button"
                class="
                  executive-option
                  ${selected ? 'selected' : ''}
                "
                data-executive-id="${escapeHtml(executive.id)}"
              >

                <span class="executive-option-avatar">
                  ${escapeHtml(initials)}
                </span>

                <span class="executive-option-info">

                  <strong>
                    ${escapeHtml(name)}
                  </strong>

                  ${
                    email
                      ? `
                        <small>
                          ${escapeHtml(email)}
                        </small>
                      `
                      : ''
                  }

                </span>

                ${
                  selected
                    ? `
                      <i class="bi bi-check2 executive-option-check"></i>
                    `
                    : ''
                }

              </button>
            `;
        })
        .join('')}
    `;

    dropdown.querySelectorAll('[data-executive-id]').forEach((button) => {
      button.addEventListener('click', () => {
        const id = button.dataset.executiveId || '';

        selectExecutive(id);
      });
    });
  }

  function openExecutivePicker() {
    const dropdown = document.getElementById('executiveOptions');

    if (!dropdown) return;

    dropdown.classList.add('show');
  }

  function closeExecutivePicker() {
    const dropdown = document.getElementById('executiveOptions');

    if (!dropdown) return;

    dropdown.classList.remove('show');
  }

  function selectExecutive(id) {
    selectedExecutiveId = id || '';

    const executive = getExecutive(id);

    const input = document.getElementById('assignedToSearch');

    const hidden = document.getElementById('assignedTo');

    const selectedDisplay = document.getElementById('selectedExecutive');

    if (hidden) {
      hidden.value = selectedExecutiveId;
    }

    if (input) {
      input.value = executive ? '' : '';
    }

    if (selectedDisplay) {
      if (executive) {
        const name = executive.fullName || executive.email || 'Unknown';

        selectedDisplay.innerHTML = `
          <span class="selected-executive-avatar">
            ${escapeHtml(getInitials(name))}
          </span>

          <span class="selected-executive-info">

            <strong>
              ${escapeHtml(name)}
            </strong>

            ${
              executive.email
                ? `
                  <small>
                    ${escapeHtml(executive.email)}
                  </small>
                `
                : ''
            }

          </span>

          <button
            type="button"
            id="clearAssignedExecutive"
            class="selected-executive-clear"
            title="Remove assignment"
          >
            <i class="bi bi-x"></i>
          </button>
        `;

        selectedDisplay.classList.remove('d-none');

        selectedDisplay.querySelector('#clearAssignedExecutive')?.addEventListener('click', (event) => {
          event.preventDefault();
          event.stopPropagation();

          clearAssignedExecutive();
        });
      } else {
        selectedDisplay.innerHTML = '';

        selectedDisplay.classList.add('d-none');
      }
    }

    if (input) {
      input.placeholder = executive ? 'Change executive...' : 'Search executive by name or email...';

      input.value = '';
    }

    closeExecutivePicker();

    renderExecutiveOptions();

    /*
     * Keep old select synchronized.
     */
    if (hidden) {
      hidden.value = selectedExecutiveId;
    }
  }

  function clearAssignedExecutive() {
    selectedExecutiveId = '';

    const hidden = document.getElementById('assignedTo');

    if (hidden) {
      hidden.value = '';
    }

    const input = document.getElementById('assignedToSearch');

    if (input) {
      input.value = '';

      input.placeholder = 'Search executive by name or email...';
    }

    const selectedDisplay = document.getElementById('selectedExecutive');

    if (selectedDisplay) {
      selectedDisplay.innerHTML = '';

      selectedDisplay.classList.add('d-none');
    }

    renderExecutiveOptions();
  }

  function handleExecutiveKeyboard(event) {
    if (event.key === 'Escape') {
      closeExecutivePicker();

      return;
    }

    if (event.key === 'Enter') {
      const dropdown = document.getElementById('executiveOptions');

      const first = dropdown?.querySelector('.executive-option');

      if (dropdown?.classList.contains('show') && first) {
        event.preventDefault();

        first.click();
      }
    }
  }

  function getInitials(name) {
    return String(name || '?')
      .trim()
      .split(/\s+/)
      .slice(0, 2)
      .map((part) => part.charAt(0))
      .join('')
      .toUpperCase();
  }

  /* ==========================================================
       FILTER
  ========================================================== */

  function renderTasks() {
    const search = document.getElementById('searchInput')?.value.trim().toLowerCase() || '';

    const filter = document.getElementById('statusFilter')?.value || '';

    const list = tasks.filter((task) => {
      if (filter === 'assigned_to' && !task.assignedTo) {
        return false;
      }

      if (filter === 'unassigned' && task.assignedTo) {
        return false;
      }

      if (filter && !['assigned_to', 'unassigned'].includes(filter) && task.status !== filter) {
        return false;
      }

      if (!search) {
        return true;
      }

      const executive = getExecutive(task.assignedTo);

      const executiveName = executive ? executive.fullName || executive.email || '' : '';

      const createdBy = getUserName(task.createdBy);

      const text = [task.title, task.description, executiveName, createdBy, task.priority, task.status]
        .filter(Boolean)
        .join(' ')
        .toLowerCase();

      return text.includes(search);
    });

    const count = document.getElementById('taskCount');

    if (count) {
      count.textContent = list.length;
    }

    renderTaskRows(list);
  }

  /* ==========================================================
       TABLE
  ========================================================== */

  function renderTaskRows(list) {
    const tbody = document.getElementById('taskTable');

    if (!tbody) return;

    if (!list.length) {
      tbody.innerHTML = `
        <tr>
          <td
            colspan="8"
            class="empty-state"
          >
            <i class="bi bi-inbox"></i>

            <div class="mt-2">
              No tasks found
            </div>
          </td>
        </tr>
      `;

      return;
    }

    tbody.innerHTML = list
      .map((task) => {
        const executive = getExecutive(task.assignedTo);

        const executiveName = executive ? executive.fullName || executive.email || 'Unknown' : '';

        const createdBy = task.createdByName || getUserName(task.createdBy);

        const status = task.status || 'pending';

        const priority = String(task.priority || 'Medium').toLowerCase();

        const locked = ['completed', 'cancelled', 'failed'].includes(status);

        return `
              <tr>

                <td>

                  <div class="task-name">
                    ${escapeHtml(task.title || 'Untitled')}
                  </div>

                  <div class="task-description">
                    ${escapeHtml(task.description || '')}
                  </div>

                </td>


                <td>

                  ${
                    executive
                      ? `
                        <div class="task-executive">
                          ${escapeHtml(executiveName)}
                        </div>

                        ${
                          executive.email
                            ? `
                              <small>
                                ${escapeHtml(executive.email)}
                              </small>
                            `
                            : ''
                        }
                      `
                      : `
                        <span class="text-muted">
                          Unassigned
                        </span>
                      `
                  }

                </td>


                <td>

                  <div class="task-created-by">
                    ${escapeHtml(createdBy)}
                  </div>

                  ${
                    task.createdBy
                      ? `
                        <small>
                          Creator
                        </small>
                      `
                      : ''
                  }

                </td>


                <td>

                  <div class="task-time">
                    ${formatDateTime(task.startDate)}
                  </div>

                  <small class="text-muted">
                    ${formatDateTime(task.endDate)}
                  </small>

                </td>


                <td>

                  <span
                    class="
                      priority-badge
                      priority-${priority}
                    "
                  >
                    ${escapeHtml(task.priority || 'Medium')}
                  </span>

                </td>


                <td>

                  ${
                    task.isGeofence
                      ? `
                        <span class="location-badge">
                          <i class="bi bi-geo-alt me-1"></i>
                          Geofence
                        </span>
                      `
                      : `
                        <span class="text-muted">
                          None
                        </span>
                      `
                  }

                </td>


                <td>

                  <span
                    class="
                      status-badge
                      status-${status}
                    "
                  >
                    ${formatStatus(status)}
                  </span>

                </td>


                <td class="text-end">

                  <button
                    type="button"
                    class="action-btn"
                    title="View"
                    onclick="openTaskDetails('${escapeHtml(task.id)}')"
                  >
                    <i class="bi bi-eye"></i>
                  </button>


                  ${
                    locked
                      ? ''
                      : `
                        <button
                          type="button"
                          class="action-btn"
                          title="Edit"
                          onclick="editTask('${escapeHtml(task.id)}')"
                        >
                          <i class="bi bi-pencil"></i>
                        </button>
                      `
                  }


                  <button
                    type="button"
                    class="action-btn text-danger"
                    title="Delete"
                    onclick="deleteTask('${escapeHtml(task.id)}')"
                  >
                    <i class="bi bi-trash"></i>
                  </button>

                </td>

              </tr>
            `;
      })
      .join('');
  }

  /* ==========================================================
       DETAILS
  ========================================================== */

  function openTaskDetails(id) {
    const task = tasks.find((item) => item.id === id);

    if (!task) return;

    const executive = getExecutive(task.assignedTo);

    const createdBy = task.createdByName || getUserName(task.createdBy);

    const status = task.status || 'pending';

    const priority = String(task.priority || 'Medium').toLowerCase();

    setText('detailTitle', task.title || 'Untitled');

    const detailExecutive = document.getElementById('detailExecutive');

    if (detailExecutive) {
      detailExecutive.innerHTML = `
        <div>
          <i class="bi bi-person me-1"></i>

          ${escapeHtml(executive ? executive.fullName || executive.email || 'Unknown' : 'Unassigned')}
        </div>

        <div class="mt-1">

          <i class="bi bi-person-badge me-1"></i>

          Created by:

          ${escapeHtml(createdBy)}

        </div>
      `;
    }

    const statusEl = document.getElementById('detailStatus');

    if (statusEl) {
      statusEl.className = `status-badge status-${status}`;

      statusEl.textContent = formatStatus(status);
    }

    const priorityEl = document.getElementById('detailPriority');

    if (priorityEl) {
      priorityEl.className = `priority-badge priority-${priority}`;

      priorityEl.textContent = task.priority || 'Medium';
    }

    setText('detailDescription', task.description || 'No description');

    setText('detailScheduledStart', formatDateTime(task.startDate));

    setText('detailScheduledEnd', formatDateTime(task.endDate));

    setText('detailStartedAt', formatDateTime(task.startedAt));

    setText('detailCompletedAt', formatDateTime(task.completedAt));

    setText('detailCompletionDuration', formatDuration(task.startedAt, task.completedAt));

    const proofSection = document.getElementById('detailProofSection');

    const proof = document.getElementById('detailProof');

    const proofLink = document.getElementById('detailProofLink');

    if (task.proofUrl) {
      proof.src = task.proofUrl;

      proofLink.href = task.proofUrl;

      proofSection.classList.remove('d-none');
    } else {
      proof.removeAttribute('src');

      proofLink.href = '#';

      proofSection.classList.add('d-none');
    }

    const locationSection = document.getElementById('detailLocationSection');

    if (task.startLocation || task.endLocation) {
      setText(
        'detailStartAddress',
        task.startLocation?.address ? `Start: ${task.startLocation.address}` : 'Start location not available'
      );

      setText(
        'detailEndAddress',
        task.endLocation?.address ? `End: ${task.endLocation.address}` : 'End location not available'
      );

      locationSection.classList.remove('d-none');
    } else {
      locationSection.classList.add('d-none');
    }

    bootstrap.Modal.getOrCreateInstance(document.getElementById('taskDetailsModal')).show();
  }

  /* ==========================================================
       OPEN TASK MODAL
  ========================================================== */

  function openTaskModal(id = null) {
    editingId = id;

    /*
     * Always reset transient UI before opening.
     *
     * This fixes stale search results from previous modal.
     */
    resetTransientTaskUI();

    document.getElementById('modalTitle').textContent = id ? 'Edit Task' : 'Add Task';

    document.getElementById('saveTaskBtn').textContent = id ? 'Update Task' : 'Save Task';

    populateExecutives();

    if (!id) {
      document.getElementById('taskId').value = '';

      document.getElementById('taskTitle').value = '';

      document.getElementById('description').value = '';

      document.getElementById('priority').value = 'Medium';

      document.getElementById('startDate').value = '';

      document.getElementById('endDate').value = '';

      clearAssignedExecutive();

      document.getElementById('isGeofence').checked = false;

      clearLocations();
    }

    toggleLocation();

    bootstrap.Modal.getOrCreateInstance(document.getElementById('taskModal')).show();
  }

  /* ==========================================================
       EDIT
  ========================================================== */

  function editTask(id) {
    const task = tasks.find((item) => item.id === id);

    if (!task) return;

    if (['completed', 'cancelled', 'failed'].includes(task.status)) {
      AppAlert.warning('This task can no longer be edited');

      return;
    }

    if (task.assignedTo && !getExecutive(task.assignedTo)) {
      AppAlert.warning('This task is assigned outside your current hierarchy.');

      return;
    }

    openTaskModal(id);

    document.getElementById('taskId').value = id;

    document.getElementById('taskTitle').value = task.title || '';

    document.getElementById('description').value = task.description || '';

    document.getElementById('priority').value = task.priority || 'Medium';

    document.getElementById('startDate').value = toDateTimeLocal(task.startDate);

    document.getElementById('endDate').value = toDateTimeLocal(task.endDate);

    /*
     * Existing assignment.
     */
    selectedExecutiveId = task.assignedTo || '';

    selectExecutive(selectedExecutiveId);

    document.getElementById('isGeofence').checked = task.isGeofence === true;

    clearLocations();

    setLocation('start', task.startLocation);

    setLocation('end', task.endLocation);

    toggleLocation();
  }

  /* ==========================================================
       SAVE
  ========================================================== */

  async function saveTask() {
    const title = document.getElementById('taskTitle').value.trim();

    const description = document.getElementById('description').value.trim();

    const startDate = document.getElementById('startDate').value;

    const endDate = document.getElementById('endDate').value;

    const assignedTo = selectedExecutiveId || document.getElementById('assignedTo')?.value || '';

    if (!title || !description || !startDate || !endDate) {
      AppAlert.warning('Please fill all required fields');

      return;
    }

    if (new Date(endDate) <= new Date(startDate)) {
      AppAlert.warning('End date must be after start date');

      return;
    }

    if (assignedTo && !getExecutive(assignedTo)) {
      AppAlert.warning('Selected executive is outside your management hierarchy');

      return;
    }

    const isGeofence = document.getElementById('isGeofence').checked;

    let startLocation = null;

    let endLocation = null;

    if (isGeofence) {
      startLocation = getLocation('start');

      endLocation = getLocation('end');

      if (!isValidLocation(startLocation) || !isValidLocation(endLocation)) {
        AppAlert.warning('Please select or enter valid Start and End locations');

        return;
      }
    }

    const body = {
      title,

      description,

      priority: document.getElementById('priority').value,

      startDate: new Date(startDate).toISOString(),

      endDate: new Date(endDate).toISOString(),

      assignedTo,

      isGeofence,

      startLocation,

      endLocation,
    };

    const button = document.getElementById('saveTaskBtn');

    try {
      button.disabled = true;

      AppAlert.loading(editingId ? 'Updating task...' : 'Creating task...');

      const data = editingId ? await Api.patch(`/tasks/${editingId}`, body) : await Api.post('/tasks', body);

      if (!data) return;

      AppAlert.close();

      AppAlert.success(editingId ? 'Task updated successfully' : 'Task created successfully');

      bootstrap.Modal.getInstance(document.getElementById('taskModal'))?.hide();

      await loadTasks();
    } catch (error) {
      AppAlert.close();

      console.error('Task save failed:', error);

      AppAlert.error(error.message || 'Failed to save task');
    } finally {
      button.disabled = false;
    }
  }

  /* ==========================================================
       DELETE
  ========================================================== */

  async function deleteTask(id) {
    const task = tasks.find((item) => item.id === id);

    if (!task) return;

    const confirmed = await AppAlert.confirm(
      'Delete Task',
      'Are you sure you want to delete this task? This action cannot be undone.'
    );

    if (!confirmed) return;

    try {
      AppAlert.loading('Deleting task...');

      await Api.delete(`/tasks/${id}`);

      AppAlert.close();

      AppAlert.success('Task deleted successfully');

      await loadTasks();
    } catch (error) {
      AppAlert.close();

      console.error('Task deletion failed:', error);

      AppAlert.error(error.message || 'Unable to delete task');
    }
  }

  /* ==========================================================
       LOCATION TOGGLE
  ========================================================== */

  function toggleLocation() {
    const checkbox = document.getElementById('isGeofence');

    const section = document.getElementById('locationSection');

    if (!checkbox || !section) {
      return;
    }

    const enabled = checkbox.checked;

    section.classList.toggle('d-none', !enabled);

    if (enabled) {
      setTimeout(initializeMaps, 100);

      setTimeout(refreshMaps, 200);
    }
  }

  /* ==========================================================
       MAP INITIALIZATION
  ========================================================== */

  function initializeMaps() {
    if (typeof L === 'undefined') {
      console.error('Leaflet is not loaded');

      return;
    }

    /*
     * START MAP
     */

    if (!startMap) {
      startMap = L.map('startMap', {
        zoomControl: true,
      }).setView(DEFAULT_MAP_CENTER, DEFAULT_MAP_ZOOM);

      const layers = createMapLayers();

      layers['Google'].addTo(startMap);

      startTileControl = L.control
        .layers(layers, null, {
          position: 'topright',
          collapsed: true,
        })
        .addTo(startMap);

      startMap.on('click', (event) => {
        setMarker('start', event.latlng.lat, event.latlng.lng, true);
      });
    }

    /*
     * END MAP
     */

    if (!endMap) {
      endMap = L.map('endMap', {
        zoomControl: true,
      }).setView(DEFAULT_MAP_CENTER, DEFAULT_MAP_ZOOM);

      const layers = createMapLayers();

      layers['Google'].addTo(endMap);

      endTileControl = L.control
        .layers(layers, null, {
          position: 'topright',
          collapsed: true,
        })
        .addTo(endMap);

      endMap.on('click', (event) => {
        setMarker('end', event.latlng.lat, event.latlng.lng, true);
      });
    }

    refreshMaps();
  }

  /* ==========================================================
       MAP TILE LAYERS
  ========================================================== */

  function createMapLayers() {
    const layers = {};

    layers['Google'] = L.tileLayer('https://mt1.google.com/vt/lyrs=m&x={x}&y={y}&z={z}', {
      maxZoom: 19,
    });

    layers['Topographic'] = L.tileLayer('https://{s}.tile.opentopomap.org/{z}/{x}/{y}.png', {
      maxZoom: 17,
    });

    layers['Esri Street'] = L.tileLayer(
      'https://server.arcgisonline.com/ArcGIS/rest/services/World_Street_Map/MapServer/tile/{z}/{y}/{x}',
      {
        maxZoom: 19,
      }
    );

    layers['Esri Topographic'] = L.tileLayer(
      'https://server.arcgisonline.com/ArcGIS/rest/services/World_Topo_Map/MapServer/tile/{z}/{y}/{x}',
      {
        maxZoom: 19,
      }
    );

    layers['Satellite'] = L.tileLayer(
      'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}',
      {
        maxZoom: 19,
      }
    );

    if (ENABLE_GOOGLE_TEST_LAYERS) {
      layers['Google Roadmap'] = L.tileLayer('https://mt1.google.com/vt/lyrs=m&x={x}&y={y}&z={z}', {
        maxZoom: 20,
      });

      layers['Google Satellite'] = L.tileLayer('https://mt1.google.com/vt/lyrs=s&x={x}&y={y}&z={z}', {
        maxZoom: 20,
      });

      layers['Google Hybrid'] = L.tileLayer('https://mt1.google.com/vt/lyrs=y&x={x}&y={y}&z={z}', {
        maxZoom: 20,
      });

      layers['Google Terrain'] = L.tileLayer('https://mt1.google.com/vt/lyrs=p&x={x}&y={y}&z={z}', {
        maxZoom: 20,
      });
    }

    return layers;
  }

  /* ==========================================================
       MARKER
  ========================================================== */

  function setMarker(type, lat, lng, updateAddress = false) {
    const map = type === 'start' ? startMap : endMap;

    if (!map) return;

    const marker = type === 'start' ? startMarker : endMarker;

    if (marker) {
      map.removeLayer(marker);
    }

    const newMarker = L.marker([lat, lng]).addTo(map);

    if (type === 'start') {
      startMarker = newMarker;
    } else {
      endMarker = newMarker;
    }

    const latInput = document.getElementById(`${type}Lat`);

    const lngInput = document.getElementById(`${type}Lng`);

    if (latInput) {
      latInput.value = Number(lat).toFixed(6);
    }

    if (lngInput) {
      lngInput.value = Number(lng).toFixed(6);
    }

    map.setView([lat, lng], Math.max(map.getZoom(), LOCATION_ZOOM), {
      animate: true,
    });

    refreshMaps();
  }

  /* ==========================================================
       SET LOCATION
  ========================================================== */

  function setLocation(type, location) {
    if (!location) return;

    const lat = Number(location.lat);

    const lng = Number(location.lng);

    if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
      return;
    }

    const latInput = document.getElementById(`${type}Lat`);

    const lngInput = document.getElementById(`${type}Lng`);

    const addressInput = document.getElementById(`${type}Address`);

    const searchInput = document.getElementById(`${type}LocationSearch`);

    if (latInput) {
      latInput.value = Number(lat).toFixed(6);
    }

    if (lngInput) {
      lngInput.value = Number(lng).toFixed(6);
    }

    if (addressInput) {
      addressInput.value = location.address || '';
    }

    if (searchInput) {
      searchInput.value = location.address || '';
    }

    setTimeout(() => {
      const map = type === 'start' ? startMap : endMap;

      if (!map) return;

      setMarker(type, lat, lng);

      map.setView([lat, lng], LOCATION_ZOOM, {
        animate: true,
      });

      showLocationSelected(type, {
        address: location.address || '',
        lat,
        lng,
      });

      refreshMaps();
    }, 250);
  }

  /* ==========================================================
       GET LOCATION
  ========================================================== */

  function getLocation(type) {
    return {
      address: document.getElementById(`${type}Address`)?.value.trim() || '',

      lat: Number(document.getElementById(`${type}Lat`)?.value),

      lng: Number(document.getElementById(`${type}Lng`)?.value),
    };
  }

  function isValidLocation(location) {
    return (
      location &&
      Number.isFinite(location.lat) &&
      Number.isFinite(location.lng) &&
      location.lat >= -90 &&
      location.lat <= 90 &&
      location.lng >= -180 &&
      location.lng <= 180
    );
  }

  /* ==========================================================
       LOCATION SEARCH
  ========================================================== */

  function debounceLocationSearch(type) {
    clearTimeout(locationSearchTimers[type]);

    const input = document.getElementById(`${type}LocationSearch`);

    if (!input) return;

    const query = input.value.trim();

    if (query.length < 2) {
      hideLocationSuggestions(type);

      return;
    }

    showLocationSearchLoading(type);

    locationSearchTimers[type] = setTimeout(() => {
      searchPlaces(type, query);
    }, LOCATION_SEARCH_DEBOUNCE);
  }

  async function searchPlaces(type, query) {
    if (locationSearchControllers[type]) {
      locationSearchControllers[type].abort();
    }

    const controller = new AbortController();

    locationSearchControllers[type] = controller;

    try {
      const url = new URL(PLACE_SEARCH_URL);

      url.searchParams.set('q', query);

      url.searchParams.set('limit', LOCATION_SEARCH_LIMIT);

      url.searchParams.set('lang', 'en');

      const response = await fetch(url.toString(), {
        method: 'GET',

        signal: controller.signal,

        headers: {
          Accept: 'application/json',
        },
      });

      if (!response.ok) {
        throw new Error(`Location search failed: ${response.status}`);
      }

      const data = await response.json();

      const results = Array.isArray(data?.features)
        ? data.features.slice(0, LOCATION_SEARCH_LIMIT).map(normalizePhotonResult).filter(Boolean)
        : [];

      /*
       * Ignore stale responses.
       */
      const currentQuery = document.getElementById(`${type}LocationSearch`)?.value.trim();

      if (currentQuery !== query) {
        return;
      }

      locationSearchState[type].results = results;

      locationSearchState[type].activeIndex = -1;

      renderLocationSuggestions(type);

      hideLocationSearchLoading(type);
    } catch (error) {
      if (error.name === 'AbortError') {
        return;
      }

      console.error('Location search failed:', error);

      locationSearchState[type].results = [];

      renderLocationSuggestions(type, 'Unable to search locations');

      hideLocationSearchLoading(type);
    }
  }

  function normalizePhotonResult(feature) {
    if (!feature || !Array.isArray(feature.geometry?.coordinates)) {
      return null;
    }

    const [lng, lat] = feature.geometry.coordinates;

    if (!Number.isFinite(Number(lat)) || !Number.isFinite(Number(lng))) {
      return null;
    }

    const props = feature.properties || {};

    const parts = [];

    [props.name, props.street, props.district, props.city, props.state, props.country].forEach((value) => {
      if (value && !parts.includes(String(value))) {
        parts.push(String(value));
      }
    });

    return {
      lat: Number(lat),

      lng: Number(lng),

      name: props.name || props.street || 'Selected location',

      address: parts.join(', '),

      properties: props,
    };
  }

  /* ==========================================================
       LOCATION SUGGESTIONS
  ========================================================== */

  function renderLocationSuggestions(type, errorMessage = '') {
    const dropdown = document.getElementById(`${type}LocationSuggestions`);

    if (!dropdown) return;

    if (errorMessage) {
      dropdown.innerHTML = `
        <div class="location-search-empty">
          <i class="bi bi-exclamation-circle me-1"></i>

          ${escapeHtml(errorMessage)}

        </div>
      `;

      dropdown.classList.add('show');

      return;
    }

    const results = locationSearchState[type].results;

    if (!results.length) {
      dropdown.innerHTML = `
        <div class="location-search-empty">
          <i class="bi bi-search me-1"></i>
          No locations found
        </div>
      `;

      dropdown.classList.add('show');

      return;
    }

    dropdown.innerHTML = results
      .map(
        (result, index) => `
            <button
              type="button"
              class="
                location-suggestion
                ${locationSearchState[type].activeIndex === index ? 'active' : ''}
              "
              data-location-index="${index}"
            >

              <span class="location-suggestion-icon">
                <i class="bi bi-geo-alt"></i>
              </span>

              <span class="location-suggestion-content">

                <strong>
                  ${escapeHtml(result.name)}
                </strong>

                <small>
                  ${escapeHtml(result.address)}
                </small>

              </span>

            </button>
          `
      )
      .join('');

    dropdown.querySelectorAll('[data-location-index]').forEach((button) => {
      button.addEventListener('click', () => {
        const index = Number(button.dataset.locationIndex);

        selectLocationSuggestion(type, index);
      });
    });

    dropdown.classList.add('show');
  }

  function showLocationSearchLoading(type) {
    const spinner = document.getElementById(`${type}LocationSpinner`);

    if (spinner) {
      spinner.classList.add('show');
    }

    const dropdown = document.getElementById(`${type}LocationSuggestions`);

    if (!dropdown) return;

    dropdown.innerHTML = `
      <div class="location-search-loading">

        <span
          class="spinner-border spinner-border-sm me-2"
        ></span>

        Searching locations...

      </div>
    `;

    dropdown.classList.add('show');
  }

  function hideLocationSearchLoading(type) {
    const spinner = document.getElementById(`${type}LocationSpinner`);

    if (spinner) {
      spinner.classList.remove('show');
    }
  }

  function hideLocationSuggestions(type) {
    const dropdown = document.getElementById(`${type}LocationSuggestions`);

    if (!dropdown) return;

    dropdown.classList.remove('show');

    locationSearchState[type].activeIndex = -1;
  }

  /* ==========================================================
       SELECT LOCATION SUGGESTION
  ========================================================== */

  function selectLocationSuggestion(type, index) {
    const result = locationSearchState[type].results[index];

    if (!result) return;

    setLocation(type, {
      address: result.address,

      lat: result.lat,

      lng: result.lng,
    });

    const searchInput = document.getElementById(`${type}LocationSearch`);

    if (searchInput) {
      searchInput.value = result.address;
    }

    const addressInput = document.getElementById(`${type}Address`);

    if (addressInput) {
      addressInput.value = result.address;
    }

    hideLocationSuggestions(type);

    showLocationSelected(type, result);
  }

  function showLocationSelected(type, result) {
    const selected = document.getElementById(`${type}LocationSelected`);

    if (!selected) return;

    selected.innerHTML = `
      <i class="bi bi-check-circle-fill"></i>

      <span>

        <strong>
          Location selected
        </strong>

        <small>
          ${escapeHtml(result.address || `${result.lat}, ${result.lng}`)}
        </small>

      </span>
    `;

    selected.classList.remove('d-none');
  }

  /* ==========================================================
       LOCATION KEYBOARD
  ========================================================== */

  function handleSuggestionKeyboard(type, event) {
    const state = locationSearchState[type];

    if (!state.results.length) {
      return;
    }

    if (event.key === 'ArrowDown') {
      event.preventDefault();

      state.activeIndex = Math.min(state.activeIndex + 1, state.results.length - 1);

      renderLocationSuggestions(type);

      return;
    }

    if (event.key === 'ArrowUp') {
      event.preventDefault();

      state.activeIndex = Math.max(state.activeIndex - 1, 0);

      renderLocationSuggestions(type);

      return;
    }

    if (event.key === 'Enter') {
      event.preventDefault();

      selectLocationSuggestion(type, state.activeIndex >= 0 ? state.activeIndex : 0);

      return;
    }

    if (event.key === 'Escape') {
      hideLocationSuggestions(type);
    }
  }

  /* ==========================================================
       COORDINATES
  ========================================================== */

  function validateCoordinateInput(type) {
    const lat = Number(document.getElementById(`${type}Lat`)?.value);

    const lng = Number(document.getElementById(`${type}Lng`)?.value);

    const latInput = document.getElementById(`${type}Lat`);

    const lngInput = document.getElementById(`${type}Lng`);

    const validLat = Number.isFinite(lat) && lat >= -90 && lat <= 90;

    const validLng = Number.isFinite(lng) && lng >= -180 && lng <= 180;

    latInput?.classList.toggle('is-invalid', latInput.value !== '' && !validLat);

    lngInput?.classList.toggle('is-invalid', lngInput.value !== '' && !validLng);
  }

  function applyCoordinateInputs(type) {
    const lat = Number(document.getElementById(`${type}Lat`)?.value);

    const lng = Number(document.getElementById(`${type}Lng`)?.value);

    if (!Number.isFinite(lat) || !Number.isFinite(lng) || lat < -90 || lat > 90 || lng < -180 || lng > 180) {
      return;
    }

    setMarker(type, lat, lng);

    const searchInput = document.getElementById(`${type}LocationSearch`);

    if (searchInput) {
      searchInput.value = `${lat.toFixed(6)}, ${lng.toFixed(6)}`;
    }

    const addressInput = document.getElementById(`${type}Address`);

    if (addressInput && !addressInput.value.trim()) {
      addressInput.value = `${lat.toFixed(6)}, ${lng.toFixed(6)}`;
    }

    showCoordinatesSelected(type, lat, lng);
  }

  function showCoordinatesSelected(type, lat, lng) {
    const selected = document.getElementById(`${type}LocationSelected`);

    if (!selected) return;

    selected.innerHTML = `
      <i class="bi bi-check-circle-fill"></i>

      <span>

        <strong>
          Coordinates selected
        </strong>

        <small>
          ${lat.toFixed(6)},
          ${lng.toFixed(6)}
        </small>

      </span>
    `;

    selected.classList.remove('d-none');
  }

  /* ==========================================================
       CLEAR LOCATIONS
  ========================================================== */

  function clearLocations() {
    ['startLat', 'startLng', 'endLat', 'endLng', 'startAddress', 'endAddress'].forEach((id) => {
      const element = document.getElementById(id);

      if (element) {
        element.value = '';
      }
    });

    ['startLocationSearch', 'endLocationSearch'].forEach((id) => {
      const element = document.getElementById(id);

      if (element) {
        element.value = '';
      }
    });

    ['start', 'end'].forEach((type) => {
      cancelLocationSearch(type);

      locationSearchState[type].results = [];

      locationSearchState[type].activeIndex = -1;

      hideLocationSuggestions(type);

      hideLocationSearchLoading(type);

      const selected = document.getElementById(`${type}LocationSelected`);

      if (selected) {
        selected.innerHTML = '';

        selected.classList.add('d-none');
      }
    });

    if (startMap && startMarker) {
      startMap.removeLayer(startMarker);

      startMarker = null;
    }

    if (endMap && endMarker) {
      endMap.removeLayer(endMarker);

      endMarker = null;
    }

    if (startMap) {
      startMap.setView(DEFAULT_MAP_CENTER, DEFAULT_MAP_ZOOM);
    }

    if (endMap) {
      endMap.setView(DEFAULT_MAP_CENTER, DEFAULT_MAP_ZOOM);
    }

    refreshMaps();
  }

  /* ==========================================================
       CANCEL SEARCH
  ========================================================== */

  function cancelLocationSearch(type) {
    clearTimeout(locationSearchTimers[type]);

    locationSearchTimers[type] = null;

    if (locationSearchControllers[type]) {
      locationSearchControllers[type].abort();

      locationSearchControllers[type] = null;
    }
  }

  /* ==========================================================
       RESET TRANSIENT MODAL UI
  ========================================================== */

  function resetTransientTaskUI() {
    /*
     * Cancel both location searches.
     */
    cancelLocationSearch('start');

    cancelLocationSearch('end');

    /*
     * Clear location search state.
     */
    ['start', 'end'].forEach((type) => {
      locationSearchState[type].results = [];

      locationSearchState[type].activeIndex = -1;

      hideLocationSuggestions(type);

      hideLocationSearchLoading(type);
    });

    /*
     * Clear visible search fields.
     */
    ['startLocationSearch', 'endLocationSearch'].forEach((id) => {
      const input = document.getElementById(id);

      if (input) {
        input.value = '';
      }
    });

    /*
     * Clear selected location indicators.
     */
    ['startLocationSelected', 'endLocationSelected'].forEach((id) => {
      const element = document.getElementById(id);

      if (element) {
        element.innerHTML = '';

        element.classList.add('d-none');
      }
    });

    /*
     * Reset executive search.
     */
    selectedExecutiveId = '';

    const executiveSearch = document.getElementById('assignedToSearch');

    if (executiveSearch) {
      executiveSearch.value = '';

      executiveSearch.placeholder = 'Search executive by name or email...';
    }

    const selectedExecutive = document.getElementById('selectedExecutive');

    if (selectedExecutive) {
      selectedExecutive.innerHTML = '';

      selectedExecutive.classList.add('d-none');
    }

    closeExecutivePicker();

    /*
     * Synchronize old hidden/select value.
     */
    const assignedTo = document.getElementById('assignedTo');

    if (assignedTo) {
      assignedTo.value = '';
    }
  }

  /* ==========================================================
       BULK IMPORT
  ========================================================== */

  function openImportModal() {
    document.getElementById('excelFile').value = '';

    document.getElementById('importPreview').classList.add('d-none');

    document.getElementById('importTasksBtn').disabled = true;

    window.importResults = [];

    bootstrap.Modal.getOrCreateInstance(document.getElementById('importModal')).show();
  }

  document.addEventListener('change', (event) => {
    if (event.target.id !== 'excelFile') {
      return;
    }

    validateExcel(event.target.files[0]);
  });

  async function validateExcel(file) {
    if (!file) return;

    AppAlert.loading('Reading Excel file...');

    try {
      const buffer = await file.arrayBuffer();

      const workbook = XLSX.read(buffer, {
        type: 'array',
      });

      const sheet = workbook.Sheets['Tasks'];

      if (!sheet) {
        throw new Error('Tasks sheet not found');
      }

      const rows = XLSX.utils.sheet_to_json(sheet, {
        defval: '',
      });

      if (!rows.length) {
        throw new Error('No tasks found in file');
      }

      if (rows.length > 50) {
        throw new Error('Maximum 50 tasks can be imported at once');
      }

      const results = rows.map((row, index) => validateRow(row, index + 2));

      renderImportPreview(results);

      AppAlert.close();
    } catch (error) {
      AppAlert.close();

      AppAlert.error(error.message || 'Unable to read Excel file');
    }
  }

  function validateRow(row, rowNumber) {
    const errors = [];

    const email = String(row.Email || '').trim();

    const title = String(row.Title || '').trim();

    const description = String(row.Description || '').trim();

    const priority = String(row.Priority || '').trim();

    if (!title) {
      errors.push('Title required');
    }

    if (!description) {
      errors.push('Description required');
    }

    if (!['Low', 'Medium', 'High'].includes(priority)) {
      errors.push('Invalid priority');
    }

    let executive = null;

    if (email) {
      executive = executives.find((item) => item.email?.toLowerCase() === email.toLowerCase());

      if (!executive) {
        errors.push('Executive not found in your hierarchy');
      }
    }

    const start = parseExcelDateTime(row['Start Date'], row['Start Time']);

    const end = parseExcelDateTime(row['End Date'], row['End Time']);

    if (!start) {
      errors.push('Invalid start date/time');
    }

    if (!end) {
      errors.push('Invalid end date/time');
    }

    if (start && end && end <= start) {
      errors.push('End must be after start');
    }

    const isGeofence = String(row['Is Geofence'] || '').toLowerCase() === 'true';

    if (isGeofence) {
      if (!row['Start Latitude'] || !row['Start Longitude'] || !row['End Latitude'] || !row['End Longitude']) {
        errors.push('Geofence coordinates required');
      }
    }

    return {
      row: rowNumber,

      email,

      execId: executive?.id || '',

      title,

      description,

      priority,

      start,

      end,

      isGeofence,

      startLocation: {
        address: row['Start Address'] || '',

        lat: Number(row['Start Latitude']),

        lng: Number(row['Start Longitude']),
      },

      endLocation: {
        address: row['End Address'] || '',

        lat: Number(row['End Latitude']),

        lng: Number(row['End Longitude']),
      },

      errors,
    };
  }

  function renderImportPreview(results) {
    const tbody = document.getElementById('importTable');

    const valid = results.filter((row) => !row.errors.length).length;

    document.getElementById('importSummary').textContent = `${valid} valid / ${results.length - valid} invalid`;

    tbody.innerHTML = results
      .map((row) => {
        const ok = !row.errors.length;

        return `
              <tr
                class="${ok ? 'import-row-valid' : 'import-row-error'}"
              >

                <td>
                  ${row.row}
                </td>

                <td>
                  ${
                    row.email
                      ? escapeHtml(row.email)
                      : `
                        <span class="text-muted">
                          Unassigned
                        </span>
                      `
                  }
                </td>

                <td>
                  ${escapeHtml(row.title)}
                </td>

                <td>
                  ${escapeHtml(row.priority)}
                </td>

                <td>
                  ${formatDateTime(row.start)}
                </td>

                <td>
                  ${formatDateTime(row.end)}
                </td>

                <td>
                  ${row.isGeofence ? 'Geofence' : 'None'}
                </td>

                <td>
                  ${
                    ok
                      ? `
                        <span class="text-success">
                          Valid
                        </span>
                      `
                      : `
                        <span class="text-danger">
                          ${escapeHtml(row.errors.join(', '))}
                        </span>
                      `
                  }
                </td>

                <td>

                  <button
                    type="button"
                    class="action-btn"
                    title="Edit"
                    onclick="editImportedTask(${row.row})"
                  >
                    <i class="bi bi-pencil"></i>
                  </button>

                </td>

              </tr>
            `;
      })
      .join('');

    window.importResults = results;

    document.getElementById('importPreview').classList.remove('d-none');

    document.getElementById('importTasksBtn').disabled = valid === 0;
  }

  function editImportedTask(rowNumber) {
    const row = (window.importResults || []).find((item) => item.row === rowNumber);

    if (!row) return;

    openTaskModal();

    document.getElementById('taskTitle').value = row.title;

    document.getElementById('description').value = row.description;

    document.getElementById('priority').value = row.priority;

    document.getElementById('startDate').value = toDateTimeLocal(row.start);

    document.getElementById('endDate').value = toDateTimeLocal(row.end);

    selectedExecutiveId = row.execId || '';

    selectExecutive(selectedExecutiveId);

    document.getElementById('isGeofence').checked = row.isGeofence === true;

    clearLocations();

    setLocation('start', row.startLocation);

    setLocation('end', row.endLocation);

    editingId = null;

    toggleLocation();
  }

  async function importTasks() {
    const valid = (window.importResults || []).filter((row) => !row.errors.length);

    if (!valid.length) {
      AppAlert.warning('No valid tasks to import');

      return;
    }

    try {
      AppAlert.loading('Importing tasks...');

      for (const row of valid) {
        if (row.execId && !getExecutive(row.execId)) {
          throw new Error(`Executive is outside your hierarchy: ${row.email}`);
        }

        await Api.post('/tasks', {
          title: row.title,

          description: row.description,

          priority: row.priority,

          startDate: row.start.toISOString(),

          endDate: row.end.toISOString(),

          assignedTo: row.execId || undefined,

          isGeofence: row.isGeofence,

          startLocation: row.isGeofence ? row.startLocation : null,

          endLocation: row.isGeofence ? row.endLocation : null,
        });
      }

      AppAlert.close();

      AppAlert.success(`${valid.length} tasks imported successfully`);

      bootstrap.Modal.getInstance(document.getElementById('importModal'))?.hide();

      await loadTasks();
    } catch (error) {
      AppAlert.close();

      console.error('Task import failed:', error);

      AppAlert.error(error.message || 'Task import failed');
    }
  }

  /* ==========================================================
       TEMPLATE
  ========================================================== */

  function downloadTemplate(event) {
    event?.preventDefault();
    event?.stopPropagation();

    if (typeof XLSX === 'undefined') {
      AppAlert.error('Excel library is not loaded');

      return;
    }

    try {
      const workbook = XLSX.utils.book_new();

      const headers = [
        'Email',
        'Title',
        'Description',
        'Priority',
        'Start Date',
        'End Date',
        'Start Time',
        'End Time',
        'Is Geofence',
        'Start Latitude',
        'Start Longitude',
        'Start Address',
        'End Latitude',
        'End Longitude',
        'End Address',
      ];

      const exampleRow = [
        executives[0]?.email || 'executive@example.com',

        'Visit Client A',

        'Discuss contract terms',

        'High',

        '25/08/2026',

        '25/08/2026',

        '10:00',

        '18:30',

        'false',

        '',
        '',
        '',
        '',
        '',
        '',
      ];

      const taskSheet = XLSX.utils.aoa_to_sheet([headers, exampleRow]);

      taskSheet['!cols'] = [
        { wch: 30 },
        { wch: 30 },
        { wch: 45 },
        { wch: 15 },
        { wch: 18 },
        { wch: 18 },
        { wch: 15 },
        { wch: 15 },
        { wch: 15 },
        { wch: 20 },
        { wch: 20 },
        { wch: 45 },
        { wch: 20 },
        { wch: 20 },
        { wch: 45 },
      ];

      headers.forEach((_, column) => {
        const cell =
          taskSheet[
            XLSX.utils.encode_cell({
              r: 0,
              c: column,
            })
          ];

        if (cell) {
          cell.s = {
            font: {
              bold: true,
            },
          };
        }
      });

      taskSheet['!freeze'] = {
        xSplit: 0,
        ySplit: 1,
      };

      XLSX.utils.book_append_sheet(workbook, taskSheet, 'Tasks');

      const executiveRows = [['Email']];

      executives.forEach((executive) => {
        if (executive.email) {
          executiveRows.push([executive.email]);
        }
      });

      const executiveSheet = XLSX.utils.aoa_to_sheet(executiveRows);

      executiveSheet['!cols'] = [{ wch: 35 }];

      executiveSheet['!freeze'] = {
        xSplit: 0,
        ySplit: 1,
      };

      XLSX.utils.book_append_sheet(workbook, executiveSheet, 'Executives');

      const prioritySheet = XLSX.utils.aoa_to_sheet([['Allowed Priority Values'], ['Low'], ['Medium'], ['High']]);

      prioritySheet['!cols'] = [{ wch: 30 }];

      XLSX.utils.book_append_sheet(workbook, prioritySheet, 'Priority_Values');

      XLSX.writeFile(workbook, 'TeamoTrack_Task_Template.xlsx');

      AppAlert.success('Task template downloaded successfully');
    } catch (error) {
      console.error('Template generation failed:', error);

      AppAlert.error('Unable to create task template');
    }
  }

  /* ==========================================================
       HELPERS
  ========================================================== */

  function setText(id, value) {
    const element = document.getElementById(id);

    if (element) {
      element.textContent = value || '-';
    }
  }

  function formatStatus(status) {
    const value = String(status || 'pending');

    return value.charAt(0).toUpperCase() + value.slice(1);
  }

  function formatDateTime(value) {
    if (!value) return '-';

    let date;

    if (typeof value === 'object' && value?._seconds) {
      date = new Date(value._seconds * 1000);
    } else {
      date = new Date(value);
    }

    if (Number.isNaN(date.getTime())) {
      return '-';
    }

    return date.toLocaleString('en-IN', {
      day: '2-digit',

      month: 'short',

      year: 'numeric',

      hour: '2-digit',

      minute: '2-digit',
    });
  }

  function formatDuration(start, end) {
    if (!start || !end) {
      return '-';
    }

    const startTime = new Date(start).getTime();

    const endTime = new Date(end).getTime();

    if (Number.isNaN(startTime) || Number.isNaN(endTime) || endTime < startTime) {
      return '-';
    }

    const totalMinutes = Math.floor((endTime - startTime) / 60000);

    const days = Math.floor(totalMinutes / 1440);

    const hours = Math.floor((totalMinutes % 1440) / 60);

    const minutes = totalMinutes % 60;

    const parts = [];

    if (days) {
      parts.push(`${days}d`);
    }

    if (hours) {
      parts.push(`${hours}h`);
    }

    if (minutes || !parts.length) {
      parts.push(`${minutes}m`);
    }

    return parts.join(' ');
  }

  function toDateTimeLocal(value) {
    if (!value) return '';

    const date = new Date(value);

    if (Number.isNaN(date.getTime())) {
      return '';
    }

    const pad = (value) => String(value).padStart(2, '0');

    return (
      `${date.getFullYear()}-` +
      `${pad(date.getMonth() + 1)}-` +
      `${pad(date.getDate())}T` +
      `${pad(date.getHours())}:` +
      `${pad(date.getMinutes())}`
    );
  }

  function parseExcelDateTime(dateValue, timeValue) {
    if (!dateValue || !timeValue) {
      return null;
    }

    const date = String(dateValue).trim().split('/');

    const time = String(timeValue).trim().split(':');

    if (date.length !== 3 || time.length !== 2) {
      return null;
    }

    const result = new Date(Number(date[2]), Number(date[1]) - 1, Number(date[0]), Number(time[0]), Number(time[1]));

    return Number.isNaN(result.getTime()) ? null : result;
  }

  function escapeHtml(value) {
    return String(value ?? '')
      .replaceAll('&', '&amp;')
      .replaceAll('<', '&lt;')
      .replaceAll('>', '&gt;')
      .replaceAll('"', '&quot;')
      .replaceAll("'", '&#039;');
  }

  /* ==========================================================
       GLOBAL HANDLERS
  ========================================================== */

  window.openTaskDetails = openTaskDetails;

  window.openTaskModal = openTaskModal;

  window.editTask = editTask;

  window.saveTask = saveTask;

  window.deleteTask = deleteTask;

  window.openImportModal = openImportModal;

  window.importTasks = importTasks;

  window.downloadTemplate = downloadTemplate;

  window.editImportedTask = editImportedTask;
})();
