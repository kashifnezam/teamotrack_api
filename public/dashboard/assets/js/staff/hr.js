/* ==========================================================
   TeamoTrack HR
   HR hierarchy:
   Root Manager
        ↓
     Manager
        ↓
       HR

   HR permissions are controlled by its parent authority.
========================================================== */

(function () {
  'use strict';

  /* ======================================================
     STATE
  ====================================================== */

  let hr = [];

  let managers = [];

  let editingId = null;

  let permissionId = null;

  let defaultParentId = '';

  let shifts = [];

  let shiftsLoaded = false;

  /* ======================================================
     HELPERS
  ====================================================== */

  const $ = (id) => document.getElementById(id);

  function value(id) {
    return $(id)?.value?.trim() || '';
  }

  function setValue(id, val = '') {
    const element = $(id);

    if (element) {
      element.value = val ?? '';
    }
  }

  function setText(id, val = '') {
    const element = $(id);

    if (element) {
      element.textContent = val ?? '';
    }
  }

  /* ======================================================
     INIT
  ====================================================== */

  window.initializeHrPage = async function () {
    try {
      AppAlert.loading('Initializing HR page...');
      await Promise.all([loadShifts(), loadHr(), loadManagers()]);
      AppAlert.close();
      $('hrSearch')?.addEventListener('input', renderHr);
    } catch (error) {
      AppAlert.close();
      console.error('HR page initialization failed:', error);

      AppAlert.error(error.message || 'Unable to initialize HR page');
    }
  };

  /* ======================================================
     LOAD SHIFTS
  ====================================================== */

  async function loadShifts() {
    if (shiftsLoaded) {
      return;
    }

    try {
      const data = await Api.get('/shifts/data');

      if (!data) {
        return;
      }

      shifts = Array.isArray(data.shifts) ? data.shifts : Array.isArray(data.data) ? data.data : [];

      shiftsLoaded = true;
    } catch (error) {
      console.error('Unable to load shifts:', error);

      AppAlert.error(error.message || 'Unable to load shifts');
    }
  }

  function renderShiftOptions(selectedId = '') {
    const select = $('hrShiftId');

    if (!select) {
      return;
    }

    select.innerHTML = `
      <option value="">
        Select shift
      </option>
    `;

    shifts.forEach((shift) => {
      const option = document.createElement('option');

      option.value = shift.id;

      const start = formatShiftTime(shift.startHour, shift.startMinute);

      const end = formatShiftTime(shift.endHour, shift.endMinute);

      option.textContent = `${shift.name || 'Shift'} (${start} - ${end})`;

      select.appendChild(option);
    });

    if (selectedId) {
      select.value = selectedId;
    }
  }

  function formatShiftTime(hour, minute) {
    if (hour === undefined || hour === null) {
      return '--';
    }

    const h = Number(hour);

    const m = Number(minute || 0);

    const suffix = h >= 12 ? 'PM' : 'AM';

    const displayHour = h % 12 || 12;

    return `${displayHour}:${String(m).padStart(2, '0')} ${suffix}`;
  }

  /* ======================================================
     LOAD HR
  ====================================================== */

  async function loadHr() {
    try {
      const data = await Api.get('/hr/data');

      if (!data) {
        return;
      }

      hr = Array.isArray(data.users) ? data.users : [];

      renderHr();
    } catch (error) {
      console.error('Unable to load HR:', error);

      AppAlert.error(error.message || 'Unable to load HR');
    }
  }

  /* ======================================================
     LOAD PARENT MANAGERS
  ====================================================== */

  /* ======================================================
   LOAD PARENT MANAGERS
====================================================== */

  async function loadManagers() {
    try {
      const data = await Api.get('/hr/parents');

      if (!data) {
        return;
      }

      managers = Array.isArray(data.users) ? data.users : [];

      /*
       * Backend may provide the default parent.
       */
      defaultParentId = data.defaultParentId || data.defaultParent || '';

      /*
       * Normalize manager IDs.
       */
      managers = managers
        .map((manager) => ({
          ...manager,
          id: manager.id || manager.uid || '',
        }))
        .filter((manager) => manager.id);

      /*
       * --------------------------------------------------
       * ROOT MANAGER
       * --------------------------------------------------
       *
       * Root Manager must always be available as a
       * possible HR parent.
       *
       * If backend already returned it, use it.
       */

      const rootManager = managers.find((manager) =>
        ['root_manager', 'rootmanager', 'root'].includes(String(manager.role || '').toLowerCase())
      );

      /*
       * If backend supplied a root manager,
       * use it as the default when no default
       * parent was explicitly supplied.
       */
      if (!defaultParentId && rootManager) {
        defaultParentId = rootManager.id;
      }

      /*
       * If there is only one possible parent,
       * use it automatically.
       */
      if (!defaultParentId && managers.length === 1) {
        defaultParentId = managers[0].id;
      }

      /*
       * Render the options immediately so that
       * Add HR has a selected parent.
       */
      console.log(defaultParentId);
      renderParentOptions(defaultParentId);
    } catch (error) {
      console.error('Unable to load HR parents:', error);

      AppAlert.error(error.message || 'Unable to load managers');
    }
  }

  /* ======================================================
     RENDER HR
  ====================================================== */

  function renderHr() {
    const tbody = $('hrTable');

    if (!tbody) {
      return;
    }

    const search = value('hrSearch').toLowerCase();

    const list = hr.filter((item) => {
      if (!search) {
        return true;
      }

      return [item.fullName, item.email, item.mobile, item.parentName].some((v) =>
        String(v || '')
          .toLowerCase()
          .includes(search)
      );
    });

    setText('hrCount', list.length);

    if (!list.length) {
      tbody.innerHTML = `
        <tr>
          <td
            colspan="6"
            class="empty-state"
          >
            No HR found
          </td>
        </tr>
      `;

      return;
    }

    tbody.innerHTML = list
      .map((item) => {
        const name = item.fullName || 'Unnamed';

        const active = item.isActive !== false;

        return `
          <tr>

            <!-- USER -->

            <td>
              <div class="hr-user">

                <div class="hr-avatar">
                  ${escapeHtml(getInitials(name))}
                </div>

                <div>

                  <div class="hr-name">
                    ${escapeHtml(name)}
                  </div>

                  <div class="hr-email">
                    ${escapeHtml(item.email || '')}
                  </div>

                </div>

              </div>
            </td>


            <!-- DIRECT PARENT -->

            <td>
              <span class="hr-parent">
                ${escapeHtml(item.parentName || '—')}
              </span>
            </td>


            <!-- SHIFT -->

            <td>
              <span class="hr-parent">
                ${escapeHtml(getShiftName(item.shiftId))}
              </span>
            </td>


            <!-- MOBILE -->

            <td>
              ${escapeHtml(item.mobile || '--')}
            </td>


            <!-- STATUS -->

            <td>

              <span
                class="hr-status ${active ? 'active' : 'inactive'}"
              >

                <i
                  class="bi ${active ? 'bi-check-circle' : 'bi-pause-circle'}"
                ></i>

                ${active ? 'Active' : 'Inactive'}

              </span>

            </td>


            <!-- ACTIONS -->

            <td>

              <div class="hr-actions">

                <!-- EDIT -->

                <button
                  type="button"
                  class="hr-action"
                  title="Edit HR"
                  onclick="editHr('${escapeHtml(item.id)}')"
                >
                  <i class="bi bi-pencil"></i>
                </button>


                <!-- PERMISSIONS -->

                <button
                  type="button"
                  class="hr-action"
                  title="Permissions"
                  onclick="openHrPermissions('${escapeHtml(item.id)}')"
                >
                  <i class="bi bi-shield-lock"></i>
                </button>

              </div>

            </td>

          </tr>
        `;
      })
      .join('');
  }

  /* ======================================================
     OPEN HR MODAL
  ====================================================== */

  async function openHrModal(id = null) {
    editingId = id;

    const item = hr.find((x) => x.id === id);

    const edit = !!item;

    await loadShifts();

    renderShiftOptions(item?.shiftId || '');

    setText('hrModalTitle', edit ? 'Edit HR' : 'Add HR');

    setText('saveHrBtn', edit ? 'Update HR' : 'Save HR');

    setValue('hrName', item?.fullName || '');

    setValue('hrEmail', item?.email || '');

    setValue('hrMobile', item?.mobile || '');

    setValue('hrPassword', '');

    const active = $('hrActive');

    if (active) {
      active.checked = item?.isActive !== false;
    }

    const email = $('hrEmail');

    if (email) {
      email.disabled = edit;
    }

    const passwordHint = $('hrPasswordHint');

    if (passwordHint) {
      passwordHint.textContent = edit ? 'Leave blank to keep current password.' : 'Required when creating.';
    }

    const parent = $('hrParentId');

    if (edit) {
      /*
       * Parent cannot be changed
       * while editing HR.
       */

      if (parent) {
        parent.innerHTML = `
          <option
            value="${escapeHtml(item?.parentId || item?.parentUid || '')}"
          >
            ${escapeHtml(item?.parentName || 'Root')}
          </option>
        `;

        parent.value = item?.parentId || item?.parentUid || '';

        parent.disabled = true;
      }
    } else {
      /*
       * Parent is selectable
       * during creation.
       */

      renderParentOptions(defaultParentId);

      if (parent) {
        parent.disabled = false;
      }
    }

    bootstrap.Modal.getOrCreateInstance($('hrModal')).show();
  }

  /* ======================================================
     PARENT OPTIONS
  ====================================================== */

  function renderParentOptions(selectedId = '') {
    const select = $('hrParentId');

    if (!select) {
      return;
    }

    select.innerHTML = `
      <option value="">
        Select manager
      </option>
    `;
    console.log(managers);
    managers.forEach((manager) => {
      const id = manager.uid || manager.id || '';

      if (!id) {
        return;
      }

      const root = ['root_manager', 'rootmanager'].includes(String(manager.role || '').toLowerCase());

      const option = document.createElement('option');

      option.value = id;

      option.textContent = `${manager.fullName || manager.name || 'Unnamed'} (${root ? 'Root Manager' : 'Manager'})`;

      option.selected = String(id) === String(selectedId);

      select.appendChild(option);
    });

    if (selectedId) {
      select.value = selectedId;
    }
  }

  /* ======================================================
     EDIT
  ====================================================== */

  function editHr(id) {
    if (!hr.some((item) => item.id === id)) {
      return;
    }

    openHrModal(id);
  }

  /* ======================================================
     SAVE HR
  ====================================================== */

  async function saveHr() {
    const name = value('hrName');

    const email = value('hrEmail');

    const mobile = value('hrMobile');

    const password = $('hrPassword')?.value || '';

    const parentId = value('hrParentId');

    const shiftId = value('hrShiftId');

    const isActive = $('hrActive')?.checked !== false;

    const button = $('saveHrBtn');

    /*
     * --------------------------------------------------
     * VALIDATION
     * --------------------------------------------------
     */

    if (!name || !email) {
      AppAlert.warning('Name and email are required');

      return;
    }

    if (!editingId && !parentId) {
      AppAlert.warning('Please select a manager');

      return;
    }

    if (!shiftId) {
      AppAlert.warning('Please select a shift');

      return;
    }

    if (!editingId && !password) {
      AppAlert.warning('Password is required');

      return;
    }

    try {
      if (button) {
        button.disabled = true;
      }

      AppAlert.loading(editingId ? 'Updating HR...' : 'Creating HR...');

      const body = {
        fullName: name,
        email,
        mobile,
        isActive,
        shiftId,
      };

      if (!editingId) {
        body.parentId = parentId;

        body.password = password;
      } else if (password) {
        body.password = password;
      }

      const data = editingId ? await Api.patch(`/hr/${editingId}`, body) : await Api.post('/hr', body);

      if (!data) {
        return;
      }

      AppAlert.close();

      AppAlert.success(editingId ? 'HR updated successfully' : 'HR created successfully');

      bootstrap.Modal.getInstance($('hrModal'))?.hide();

      await loadHr();
    } catch (error) {
      console.error('Unable to save HR:', error);

      AppAlert.close();

      AppAlert.error(error.message || 'Unable to save HR');
    } finally {
      if (button) {
        button.disabled = false;
      }
    }
  }

  /* ======================================================
     DELETE
  ====================================================== */

  async function deleteHr(id) {
    const item = hr.find((x) => x.id === id);

    if (!item) {
      return;
    }

    const result = await AppAlert.confirm(`Delete "${item.fullName}"?`);

    if (!result.isConfirmed) {
      return;
    }

    try {
      AppAlert.loading('Deleting HR...');

      const data = await Api.delete(`/hr/${id}`);

      if (!data) {
        return;
      }

      AppAlert.close();

      AppAlert.success('HR deleted successfully');

      await loadHr();
    } catch (error) {
      console.error('Unable to delete HR:', error);

      AppAlert.close();

      AppAlert.error(error.message || 'Unable to delete HR');
    }
  }

  /* ======================================================
     PERMISSIONS
  ====================================================== */

  async function openHrPermissions(id) {
    const item = hr.find((entry) => entry.id === id);

    if (!item) {
      return;
    }

    permissionId = id;

    try {
      AppAlert.loading('Loading permissions...');

      const data = await Api.get(`/hr/${id}/permissions`);

      if (!data) {
        return;
      }

      AppAlert.close();

      renderPermissions(data.permissions || {});

      bootstrap.Modal.getOrCreateInstance($('permissionModal')).show();
    } catch (error) {
      console.error('Unable to load HR permissions:', error);

      AppAlert.close();

      AppAlert.error(error.message || 'Unable to load permissions');
    }
  }

  /* ======================================================
     RENDER PERMISSIONS
  ====================================================== */

  function renderPermissions(permissions) {
    const container = $('permissionList');

    if (!container) {
      return;
    }

    const groups = {
      manager: 'Managers',

      hr: 'HR',

      field_executive: 'Executives',

      team: 'Teams',

      leave: 'Leave Approval',

      attendance: 'Attendance',

      task: 'Tasks',

      tracking: 'Live Tracking',
    };

    container.innerHTML = Object.entries(groups)
      .map(([group, title]) => {
        const keys = Object.keys(permissions).filter((key) => key.startsWith(`${group}.`));

        if (!keys.length) {
          return '';
        }

        return `
              <div class="permission-group">

                <div
                  class="permission-group-title"
                >
                  ${escapeHtml(title)}
                </div>

                ${keys
                  .map((key) => {
                    const action = key.split('.').slice(1).join(' ');

                    const checked = permissions[key] === true;

                    return `
                      <div
                        class="permission-item"
                      >

                        <span
                          class="permission-label"
                        >
                          ${escapeHtml(formatPermission(action))}
                        </span>

                        <div
                          class="form-check form-switch"
                        >

                          <input
                            class="form-check-input permission-toggle"
                            type="checkbox"
                            data-key="${escapeHtml(key)}"
                            ${checked ? 'checked' : ''}
                          >

                        </div>

                      </div>
                    `;
                  })
                  .join('')}

              </div>
            `;
      })
      .join('');
  }

  /* ======================================================
     SAVE PERMISSIONS
  ====================================================== */

  async function saveHrPermissions() {
    if (!permissionId) {
      return;
    }

    const permissions = {};

    document.querySelectorAll('#permissionModal .permission-toggle').forEach((input) => {
      const key = input.dataset.key;

      if (!key) {
        return;
      }

      permissions[key] = input.checked;
    });

    const button = $('savePermissionBtn');

    try {
      if (button) {
        button.disabled = true;
      }

      AppAlert.loading('Saving permissions...');

      const data = await Api.patch(`/hr/${permissionId}/permissions`, permissions);

      if (!data) {
        return;
      }

      AppAlert.close();

      AppAlert.success('Permissions updated');

      bootstrap.Modal.getInstance($('permissionModal'))?.hide();
    } catch (error) {
      console.error('Unable to save HR permissions:', error);

      AppAlert.close();

      AppAlert.error(error.message || 'Unable to save permissions');
    } finally {
      if (button) {
        button.disabled = false;
      }
    }
  }

  /* ======================================================
     HELPERS
  ====================================================== */

  function getInitials(name) {
    return String(name || '')
      .trim()
      .split(/\s+/)
      .filter(Boolean)
      .slice(0, 2)
      .map((word) => word.charAt(0))
      .join('')
      .toUpperCase();
  }

  function formatPermission(value) {
    return String(value || '')
      .replaceAll('_', ' ')
      .replace(/\b\w/g, (char) => char.toUpperCase());
  }

  function getShiftName(shiftId) {
    if (!shiftId) {
      return '--';
    }

    const shift = shifts.find((item) => item.id === shiftId);

    return shift?.name || 'Unknown shift';
  }

  function escapeHtml(value) {
    return String(value ?? '')
      .replaceAll('&', '&amp;')
      .replaceAll('<', '&lt;')
      .replaceAll('>', '&gt;')
      .replaceAll('"', '&quot;')
      .replaceAll("'", '&#039;');
  }

  /* ======================================================
     GLOBAL
  ====================================================== */

  window.openHrModal = openHrModal;

  window.editHr = editHr;

  window.saveHr = saveHr;

  window.deleteHr = deleteHr;

  window.openHrPermissions = openHrPermissions;

  window.saveHrPermissions = saveHrPermissions;
})();
