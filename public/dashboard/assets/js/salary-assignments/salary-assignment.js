(function () {
  'use strict';

  let assignments = [];

  let employees = [];

  let structures = [];

  let modal;

  const $ = (id) => document.getElementById(id);

  function escapeHtml(value = '') {
    return String(value)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
  }

  function formatDate(value) {
    if (!value) {
      return '-';
    }

    const parts = String(value).split('-');

    if (parts.length !== 3) {
      return value;
    }

    return `${parts[2]}-${parts[1]}-${parts[0]}`;
  }

  function getEmployee(id) {
    return employees.find((item) => item.id === id || item.uid === id);
  }

  function getStructure(id) {
    return structures.find((item) => item.id === id);
  }

  function employeeName(assignment) {
    const employee = getEmployee(assignment.employeeId);

    return assignment.employeeName || employee?.fullName || 'Unknown employee';
  }

  function structureName(assignment) {
    const structure = getStructure(assignment.salaryStructureId);

    return structure?.name || assignment.salaryStructureName || 'Unknown structure';
  }

  function renderAction(item) {
    if (item.active === false) {
      return `
                <span class="badge text-bg-secondary">
                    Inactive
                </span>
            `;
    }

    return `
            <button
                type="button"
                class="btn btn-sm btn-outline-danger"
                onclick="window.deactivateSalaryAssignment('${item.id}')">

                <i class="bi bi-pause-circle"></i>

                <span class="d-none d-md-inline ms-1">
                    Deactivate
                </span>

            </button>
        `;
  }

  function render() {
    $('salaryAssignmentLoading').classList.add('d-none');

    if (!assignments.length) {
      $('salaryAssignmentEmpty').classList.remove('d-none');

      $('salaryAssignmentTableWrap').classList.add('d-none');

      $('salaryAssignmentMobileList').classList.add('d-none');

      return;
    }

    $('salaryAssignmentEmpty').classList.add('d-none');

    $('salaryAssignmentTableWrap').classList.remove('d-none');

    $('salaryAssignmentMobileList').classList.remove('d-none');

    $('salaryAssignmentTableBody').innerHTML = assignments
      .map(
        (item) => `

                    <tr>

                        <td>

                            <div class="fw-semibold">
                                ${escapeHtml(employeeName(item))}
                            </div>

                            <div class="small text-muted">
                                ${escapeHtml(item.employeeId || '')}
                            </div>

                        </td>


                        <td>

                            ${escapeHtml(structureName(item))}

                        </td>


                        <td>

                            ${formatDate(item.effectiveFrom)}

                        </td>


                        <td>

                            ${
                              item.active === false
                                ? `
                                        <span class="badge text-bg-secondary">
                                            Inactive
                                        </span>
                                      `
                                : `
                                        <span class="badge text-bg-success">
                                            Active
                                        </span>
                                      `
                            }

                        </td>


                        <td class="text-end">

                            ${renderAction(item)}

                        </td>

                    </tr>

                `
      )
      .join('');

    $('salaryAssignmentMobileList').innerHTML = assignments
      .map(
        (item) => `

                    <div class="salary-assignment-card">

                        <div class="d-flex justify-content-between gap-3">

                            <div>

                                <div class="salary-assignment-name">

                                    ${escapeHtml(employeeName(item))}

                                </div>

                                <div class="small text-muted">

                                    ${escapeHtml(structureName(item))}

                                </div>

                            </div>


                            ${
                              item.active === false
                                ? `
                                        <span class="badge text-bg-secondary">
                                            Inactive
                                        </span>
                                      `
                                : `
                                        <span class="badge text-bg-success">
                                            Active
                                        </span>
                                      `
                            }

                        </div>


                        <div class="salary-assignment-meta mt-3">

                            <div class="text-muted">
                                Effective From
                            </div>

                            <div class="fw-semibold">
                                ${formatDate(item.effectiveFrom)}
                            </div>

                        </div>


                        ${
                          item.active !== false
                            ? `
                                    <div class="mt-3">
                                        ${renderAction(item)}
                                    </div>
                                  `
                            : ''
                        }

                    </div>

                `
      )
      .join('');
  }

  async function loadData() {
    $('salaryAssignmentLoading').classList.remove('d-none');

    try {
      AppAlert.loading('Loading salary assignments...');
      const [assignmentResponse, employeeResponse, structureResponse] = await Promise.all([
        Api.get('/salary-assignments/data'),
        Api.get('/executives/data'),
        Api.get('/salary-structures/data'),
      ]);
      AppAlert.close();

      assignments = Array.isArray(assignmentResponse) ? assignmentResponse : assignmentResponse?.assignments || [];

      /*
       * Executives endpoint returns:
       *
       * {
       *     executives: [],
       *     teams: []
       * }
       *
       * Keep this compatible with
       * the existing endpoint.
       */

      employees = Array.isArray(employeeResponse)
        ? employeeResponse
        : employeeResponse?.executives || employeeResponse?.users || [];

      structures = Array.isArray(structureResponse) ? structureResponse : structureResponse?.structures || [];

      render();
    } catch (error) {
      $('salaryAssignmentLoading').classList.add('d-none');

      AppAlert.error(error?.message || 'Failed to load salary assignments');
    }
  }

  function loadEmployees() {
    const select = $('salaryEmployee');

    select.innerHTML = `
            <option value="">
                Select employee
            </option>
        `;

    employees.forEach((employee) => {
      const id = employee.id || employee.uid;

      if (!id) {
        return;
      }

      const option = document.createElement('option');

      option.value = id;

      option.textContent = employee.fullName || employee.name || employee.email || id;

      select.appendChild(option);
    });
  }

  function loadStructures() {
    const select = $('salaryStructure');

    select.innerHTML = `
            <option value="">
                Select salary structure
            </option>
        `;

    structures
      .filter((item) => item.active !== false)
      .forEach((structure) => {
        const option = document.createElement('option');

        option.value = structure.id;

        option.textContent = structure.name;

        select.appendChild(option);
      });
  }

  function resetForm() {
    $('salaryAssignmentForm').reset();

    $('salaryAssignmentId').value = '';

    $('salaryAssignmentModalTitle').textContent = 'Assign Salary';

    $('saveSalaryAssignmentBtn').textContent = 'Assign Salary';

    const today = new Date();

    const yyyy = today.getFullYear();

    const mm = String(today.getMonth() + 1).padStart(2, '0');

    const dd = String(today.getDate()).padStart(2, '0');

    $('salaryEffectiveFrom').value = `${yyyy}-${mm}-${dd}`;
  }

  function openModal() {
    resetForm();

    loadEmployees();

    loadStructures();

    modal = bootstrap.Modal.getOrCreateInstance($('salaryAssignmentModal'));

    modal.show();
  }

  async function saveAssignment(event) {
    event.preventDefault();

    const dto = {
      employeeId: $('salaryEmployee').value,

      salaryStructureId: $('salaryStructure').value,

      effectiveFrom: $('salaryEffectiveFrom').value,
    };

    if (!dto.employeeId) {
      AppAlert.error('Employee is required');

      return;
    }

    if (!dto.salaryStructureId) {
      AppAlert.error('Salary structure is required');

      return;
    }

    if (!dto.effectiveFrom) {
      AppAlert.error('Effective date is required');

      return;
    }

    try {
      $('saveSalaryAssignmentBtn').disabled = true;

      AppAlert.loading('Assigning salary...');

      await Api.post('/salary-assignments', dto);

      AppAlert.close();

      bootstrap.Modal.getOrCreateInstance($('salaryAssignmentModal')).hide();

      await loadData();

      AppAlert.success('Salary assigned successfully');
    } catch (error) {
      AppAlert.close();

      AppAlert.error(error?.message || 'Failed to assign salary');
    } finally {
      $('saveSalaryAssignmentBtn').disabled = false;
    }
  }

  window.deactivateSalaryAssignment = async function (id) {
    const confirmed = await AppAlert.confirm('Deactivate this salary assignment?');

    if (!confirmed) {
      return;
    }

    try {
      AppAlert.loading('Deactivating salary assignment...');

      await Api.patch(`/salary-assignments/${id}/deactivate`, {});

      AppAlert.close();

      await loadData();

      AppAlert.success('Salary assignment deactivated successfully');
    } catch (error) {
      AppAlert.close();

      AppAlert.error(error?.message || 'Failed to deactivate salary assignment');
    }
  };

  window.initializeSalaryAssignmentsPage = async function () {
    modal = bootstrap.Modal.getOrCreateInstance($('salaryAssignmentModal'));

    $('addSalaryAssignmentBtn').addEventListener('click', openModal);

    $('salaryAssignmentForm').addEventListener('submit', saveAssignment);

    $('salaryAssignmentModal').addEventListener('hidden.bs.modal', resetForm);

    await loadData();
  };
})();
