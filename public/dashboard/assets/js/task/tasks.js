/* ==========================================================
   TeamoTrack Tasks
   Hierarchy-aware frontend
========================================================== */

(function () {
  'use strict';

  let tasks = [];
  let executives = [];
  let managers = [];

  let editingId = null;

  let currentMonth = new Date().toISOString().slice(0, 7);

  let startMap = null;
  let endMap = null;
  let startMarker = null;
  let endMarker = null;

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

    await loadTasks();
  };

  /* ==========================================================
       LOAD
    ========================================================== */

  async function loadTasks() {
    const value = document.getElementById('monthFilter')?.value;

    if (!value) return;

    const [year, month] = value.split('-').map(Number);

    try {
      AppAlert.loading('Loading tasks...');

      /*
       * Backend already applies hierarchy.
       */
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
    const select = document.getElementById('assignedTo');

    if (!select) return;

    select.innerHTML = `<option value="">Unassigned</option>`;

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

                        <!-- TASK -->

                        <td>

                            <div class="task-name">
                                ${escapeHtml(task.title || 'Untitled')}
                            </div>

                            <div class="task-description">
                                ${escapeHtml(task.description || '')}
                            </div>

                        </td>


                        <!-- EXECUTIVE -->

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


                        <!-- CREATED BY -->

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


                        <!-- SCHEDULE -->

                        <td>

                            <div class="task-time">
                                ${formatDateTime(task.startDate)}
                            </div>

                            <small class="text-muted">
                                ${formatDateTime(task.endDate)}
                            </small>

                        </td>


                        <!-- PRIORITY -->

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


                        <!-- LOCATION -->

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


                        <!-- STATUS -->

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


                        <!-- ACTIONS -->

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

    statusEl.className = `status-badge status-${status}`;

    statusEl.textContent = formatStatus(status);

    const priorityEl = document.getElementById('detailPriority');

    priorityEl.className = `priority-badge priority-${priority}`;

    priorityEl.textContent = task.priority || 'Medium';

    setText('detailDescription', task.description || 'No description');

    setText('detailScheduledStart', formatDateTime(task.startDate));

    setText('detailScheduledEnd', formatDateTime(task.endDate));

    setText('detailStartedAt', formatDateTime(task.startedAt));

    setText('detailCompletedAt', formatDateTime(task.completedAt));

    setText('detailCompletionDuration', formatDuration(task.startedAt, task.completedAt));

    /* Proof */

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

    /* Location */

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
       MODAL
    ========================================================== */

  function openTaskModal(id = null) {
    editingId = id;

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

      document.getElementById('assignedTo').value = '';

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

    /*
     * Assigned executive must exist
     * in current hierarchy.
     */
    if (task.assignedTo && !getExecutive(task.assignedTo)) {
      AppAlert.warning('This task is assigned outside your current hierarchy.');

      return;
    }

    /*
     * Open modal first.
     *
     * openTaskModal() populates the
     * executive dropdown.
     */
    openTaskModal(id);

    /*
     * Now populate task values.
     */
    document.getElementById('taskId').value = id;
    document.getElementById('taskTitle').value = task.title || '';
    document.getElementById('description').value = task.description || '';
    document.getElementById('priority').value = task.priority || 'Medium';
    document.getElementById('startDate').value = toDateTimeLocal(task.startDate);
    document.getElementById('endDate').value = toDateTimeLocal(task.endDate);

    /*
     * IMPORTANT:
     *
     * populateExecutives() has already
     * created the options.
     *
     * Now select the existing executive.
     */
    const assignedSelect = document.getElementById('assignedTo');
    if (assignedSelect) {
      assignedSelect.value = task.assignedTo || '';
    }
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

    const assignedTo = document.getElementById('assignedTo').value;

    if (!title || !description || !startDate || !endDate) {
      AppAlert.warning('Please fill all required fields');

      return;
    }

    if (new Date(endDate) <= new Date(startDate)) {
      AppAlert.warning('End date must be after start date');

      return;
    }

    /*
     * UX check only.
     * Backend remains security authority.
     */

    if (assignedTo && !getExecutive(assignedTo)) {
      AppAlert.warning('Selected executive is outside your management hierarchy');

      return;
    }

    const isGeofence = document.getElementById('isGeofence').checked;

    const body = {
      title,

      description,

      priority: document.getElementById('priority').value,

      startDate: new Date(startDate).toISOString(),

      endDate: new Date(endDate).toISOString(),

      assignedTo: assignedTo,

      isGeofence,

      startLocation: isGeofence ? getLocation('start') : null,

      endLocation: isGeofence ? getLocation('end') : null,
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
       LOCATION
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
    }
  }

  function initializeMaps() {
    if (!startMap) {
      startMap = L.map('startMap').setView([20.5937, 78.9629], 5);

      L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        attribution: '&copy; OpenStreetMap',
      }).addTo(startMap);

      startMap.on('click', (e) => setMarker('start', e.latlng.lat, e.latlng.lng));
    }

    if (!endMap) {
      endMap = L.map('endMap').setView([20.5937, 78.9629], 5);

      L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        attribution: '&copy; OpenStreetMap',
      }).addTo(endMap);

      endMap.on('click', (e) => setMarker('end', e.latlng.lat, e.latlng.lng));
    }

    startMap.invalidateSize();
    endMap.invalidateSize();
  }

  function setMarker(type, lat, lng) {
    const map = type === 'start' ? startMap : endMap;

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

    document.getElementById(`${type}Lat`).value = lat;

    document.getElementById(`${type}Lng`).value = lng;
  }

  function setLocation(type, location) {
    if (!location) return;

    const lat = Number(location.lat);

    const lng = Number(location.lng);

    if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
      return;
    }

    document.getElementById(`${type}Lat`).value = lat;

    document.getElementById(`${type}Lng`).value = lng;

    document.getElementById(`${type}Address`).value = location.address || '';

    setTimeout(() => {
      const map = type === 'start' ? startMap : endMap;

      if (!map) return;

      setMarker(type, lat, lng);

      map.setView([lat, lng], 15);
    }, 150);
  }

  function getLocation(type) {
    return {
      address: document.getElementById(`${type}Address`).value.trim(),

      lat: Number(document.getElementById(`${type}Lat`).value),

      lng: Number(document.getElementById(`${type}Lng`).value),
    };
  }

  function clearLocations() {
    ['startLat', 'startLng', 'endLat', 'endLng', 'startAddress', 'endAddress'].forEach((id) => {
      const element = document.getElementById(id);

      if (element) {
        element.value = '';
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

    /*
     * IMPORTANT:
     * Only backend-provided executives.
     */

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
                    <tr class="${ok ? 'import-row-valid' : 'import-row-error'}">

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

    document.getElementById('taskTitle').value = row.title;

    document.getElementById('description').value = row.description;

    document.getElementById('priority').value = row.priority;

    document.getElementById('startDate').value = toDateTimeLocal(row.start);

    document.getElementById('endDate').value = toDateTimeLocal(row.end);

    populateExecutives();

    document.getElementById('assignedTo').value = row.execId || '';

    document.getElementById('isGeofence').checked = row.isGeofence === true;

    clearLocations();

    setLocation('start', row.startLocation);

    setLocation('end', row.endLocation);

    /*
     * Imported-row editing is kept separate
     * from normal task editing.
     */
    editingId = null;

    bootstrap.Modal.getOrCreateInstance(document.getElementById('taskModal')).show();
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
        /*
         * Final frontend hierarchy check.
         */
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

      /* Executives */

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

      /* Priority */

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
