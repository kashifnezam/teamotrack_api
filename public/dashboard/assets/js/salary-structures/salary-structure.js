(function () {
  'use strict';

  let structures = [];

  let salaryStructureModal;

  const $ = (id) => document.getElementById(id);

  function escapeHtml(value = '') {
    return String(value)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
  }

  function money(value) {
    return Number(value || 0).toLocaleString('en-IN', {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    });
  }

  function numberValue(id) {
    return Number($(id).value || 0);
  }

  function earningsTotal(item) {
    return (
      Number(item.basic || 0) +
      Number(item.hra || 0) +
      Number(item.conveyance || 0) +
      Number(item.otherAllowance || 0) +
      Number(item.incentive || 0) +
      Number(item.overtime || 0)
    );
  }

  function deductionsTotal(item) {
    return Number(item.pf || 0) + Number(item.esi || 0) + Number(item.tax || 0) + Number(item.otherDeduction || 0);
  }

  function renderActions(item) {
    if (item.active !== false) {
      return `
                <div class="d-flex justify-content-end gap-1">

                    <button
                        class="btn btn-sm btn-outline-primary"
                        onclick="window.editSalaryStructure('${item.id}')">

                        <i class="bi bi-pencil"></i>

                        <span class="d-none d-md-inline ms-1">
                            Edit
                        </span>

                    </button>


                    <button
                        class="btn btn-sm btn-outline-danger"
                        onclick="window.deactivateSalaryStructure('${item.id}')">

                        <i class="bi bi-pause-circle"></i>

                        <span class="d-none d-md-inline ms-1">
                            Deactivate
                        </span>

                    </button>

                </div>
            `;
    }

    return `
            <button
                class="btn btn-sm btn-outline-success"
                onclick="window.reactivateSalaryStructure('${item.id}')">

                <i class="bi bi-arrow-counterclockwise"></i>

                <span class="ms-1">
                    Reactivate
                </span>

            </button>
        `;
  }

  function render() {
    $('salaryStructureLoading').classList.add('d-none');

    if (!structures.length) {
      $('salaryStructureEmpty').classList.remove('d-none');

      $('salaryStructureTableWrap').classList.add('d-none');

      $('salaryStructureMobileList').classList.add('d-none');

      return;
    }

    $('salaryStructureEmpty').classList.add('d-none');

    $('salaryStructureTableWrap').classList.remove('d-none');

    $('salaryStructureMobileList').classList.remove('d-none');

    $('salaryStructureTableBody').innerHTML = structures
      .map(
        (item) => `

                    <tr>

                        <td>

                            <div class="fw-semibold">
                                ${escapeHtml(item.name)}
                            </div>

                            ${
                              item.description
                                ? `
                                        <div class="small text-muted">
                                            ${escapeHtml(item.description)}
                                        </div>
                                      `
                                : ''
                            }

                        </td>


                        <td>
                            ₹${money(item.basic)}
                        </td>


                        <td>

                            <div class="salary-component">

                                ₹${money(
                                  Number(item.hra || 0) +
                                    Number(item.conveyance || 0) +
                                    Number(item.otherAllowance || 0) +
                                    Number(item.incentive || 0) +
                                    Number(item.overtime || 0)
                                )}

                            </div>

                        </td>


                        <td>

                            <div class="salary-component">

                                ₹${money(deductionsTotal(item))}

                            </div>

                        </td>


                        <td>

                            ${
                              item.active !== false
                                ? `
                                        <span class="badge text-bg-success">
                                            Active
                                        </span>
                                      `
                                : `
                                        <span class="badge text-bg-secondary">
                                            Inactive
                                        </span>
                                      `
                            }

                        </td>


                        <td class="text-end">

                            ${renderActions(item)}

                        </td>

                    </tr>

                `
      )
      .join('');

    $('salaryStructureMobileList').innerHTML = structures
      .map(
        (item) => `

                    <div class="salary-structure-card">

                        <div class="d-flex justify-content-between gap-3">

                            <div>

                                <div class="fw-semibold">
                                    ${escapeHtml(item.name)}
                                </div>

                                ${
                                  item.description
                                    ? `
                                            <div class="small text-muted mt-1">
                                                ${escapeHtml(item.description)}
                                            </div>
                                          `
                                    : ''
                                }

                            </div>


                            ${
                              item.active !== false
                                ? `
                                        <span class="badge text-bg-success">
                                            Active
                                        </span>
                                      `
                                : `
                                        <span class="badge text-bg-secondary">
                                            Inactive
                                        </span>
                                      `
                            }

                        </div>


                        <div class="row g-2 mt-3">

                            <div class="col-6">

                                <div class="text-muted small">
                                    Basic
                                </div>

                                <div class="salary-total">
                                    ₹${money(item.basic)}
                                </div>

                            </div>


                            <div class="col-6">

                                <div class="text-muted small">
                                    Allowances
                                </div>

                                <div class="salary-total">
                                    ₹${money(earningsTotal(item) - Number(item.basic || 0))}
                                </div>

                            </div>


                            <div class="col-6">

                                <div class="text-muted small">
                                    Deductions
                                </div>

                                <div class="salary-total">
                                    ₹${money(deductionsTotal(item))}
                                </div>

                            </div>


                            <div class="col-6">

                                <div class="text-muted small">
                                    Earnings
                                </div>

                                <div class="salary-total">
                                    ₹${money(earningsTotal(item))}
                                </div>

                            </div>

                        </div>


                        <div class="mt-3">

                            ${renderActions(item)}

                        </div>

                    </div>

                `
      )
      .join('');
  }

  async function loadStructures() {
    $('salaryStructureLoading').classList.remove('d-none');

    $('salaryStructureEmpty').classList.add('d-none');

    $('salaryStructureTableWrap').classList.add('d-none');

    $('salaryStructureMobileList').classList.add('d-none');

    try {
      AppAlert.loading('Loading salary structures...');
      const response = await Api.get('/salary-structures/data');
      AppAlert.close();
      structures = Array.isArray(response) ? response : response?.structures || [];

      render();
    } catch (error) {
      AppAlert.close();
      $('salaryStructureLoading').classList.add('d-none');

      AppAlert.error(error?.message || 'Failed to load salary structures');
    }
  }

  function resetForm() {
    $('salaryStructureForm').reset();

    $('salaryStructureId').value = '';

    [
      'salaryBasic',
      'salaryHra',
      'salaryConveyance',
      'salaryOtherAllowance',
      'salaryIncentive',
      'salaryOvertime',
      'salaryPf',
      'salaryEsi',
      'salaryTax',
      'salaryOtherDeduction',
    ].forEach((id) => ($(id).value = 0));

    $('salaryStructureModalTitle').textContent = 'Add Salary Structure';

    $('saveSalaryStructureBtn').textContent = 'Save Structure';
  }

  function openCreateModal() {
    resetForm();

    salaryStructureModal = bootstrap.Modal.getOrCreateInstance($('salaryStructureModal'));

    salaryStructureModal.show();
  }

  window.editSalaryStructure = function (id) {
    const item = structures.find((x) => x.id === id);

    if (!item) {
      return;
    }

    $('salaryStructureId').value = item.id;

    $('salaryStructureName').value = item.name || '';

    $('salaryBasic').value = item.basic || 0;

    $('salaryHra').value = item.hra || 0;

    $('salaryConveyance').value = item.conveyance || 0;

    $('salaryOtherAllowance').value = item.otherAllowance || 0;

    $('salaryIncentive').value = item.incentive || 0;

    $('salaryOvertime').value = item.overtime || 0;

    $('salaryPf').value = item.pf || 0;

    $('salaryEsi').value = item.esi || 0;

    $('salaryTax').value = item.tax || 0;

    $('salaryOtherDeduction').value = item.otherDeduction || 0;

    $('salaryDescription').value = item.description || '';

    $('salaryStructureModalTitle').textContent = 'Edit Salary Structure';

    $('saveSalaryStructureBtn').textContent = 'Update Structure';

    salaryStructureModal = bootstrap.Modal.getOrCreateInstance($('salaryStructureModal'));

    salaryStructureModal.show();
  };

  async function saveStructure(event) {
    event.preventDefault();

    const id = $('salaryStructureId').value;

    const dto = {
      name: $('salaryStructureName').value.trim(),

      basic: numberValue('salaryBasic'),

      hra: numberValue('salaryHra'),

      conveyance: numberValue('salaryConveyance'),

      otherAllowance: numberValue('salaryOtherAllowance'),

      incentive: numberValue('salaryIncentive'),

      overtime: numberValue('salaryOvertime'),

      pf: numberValue('salaryPf'),

      esi: numberValue('salaryEsi'),

      tax: numberValue('salaryTax'),

      otherDeduction: numberValue('salaryOtherDeduction'),

      description: $('salaryDescription').value.trim(),
    };

    if (!dto.name) {
      AppAlert.error('Salary structure name is required');

      return;
    }

    try {
      $('saveSalaryStructureBtn').disabled = true;

      AppAlert.loading(id ? 'Updating salary structure...' : 'Creating salary structure...');

      if (id) {
        await Api.patch(`/salary-structures/${id}`, dto);
      } else {
        await Api.post('/salary-structures', dto);
      }

      AppAlert.close();

      bootstrap.Modal.getOrCreateInstance($('salaryStructureModal')).hide();

      await loadStructures();

      AppAlert.success(id ? 'Salary structure updated successfully' : 'Salary structure created successfully');

      resetForm();
    } catch (error) {
      AppAlert.close();

      AppAlert.error(
        error?.message || (id ? 'Failed to update salary structure' : 'Failed to create salary structure')
      );
    } finally {
      $('saveSalaryStructureBtn').disabled = false;
    }
  }

  window.deactivateSalaryStructure = async function (id) {
    const confirmed = await AppAlert.confirm('Deactivate this salary structure?');

    if (!confirmed) {
      return;
    }

    try {
      AppAlert.loading('Deactivating salary structure...');

      await Api.patch(`/salary-structures/${id}/deactivate`, {});

      AppAlert.close();

      await loadStructures();

      AppAlert.success('Salary structure deactivated successfully');
    } catch (error) {
      AppAlert.close();

      AppAlert.error(error?.message || 'Failed to deactivate salary structure');
    }
  };

  window.reactivateSalaryStructure = async function (id) {
    const confirmed = await AppAlert.confirm('Reactivate this salary structure?');

    if (!confirmed) {
      return;
    }

    try {
      AppAlert.loading('Reactivating salary structure...');

      await Api.patch(`/salary-structures/${id}/reactivate`, {});

      AppAlert.close();

      await loadStructures();

      AppAlert.success('Salary structure reactivated successfully');
    } catch (error) {
      AppAlert.close();

      AppAlert.error(error?.message || 'Failed to reactivate salary structure');
    }
  };

  window.initializeSalaryStructuresPage = async function () {
    salaryStructureModal = bootstrap.Modal.getOrCreateInstance($('salaryStructureModal'));

    $('addSalaryStructureBtn').addEventListener('click', openCreateModal);

    $('salaryStructureForm').addEventListener('submit', saveStructure);

    $('salaryStructureModal').addEventListener('hidden.bs.modal', resetForm);

    await loadStructures();
  };
})();
