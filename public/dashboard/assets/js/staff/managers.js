/* ==========================================================
   TeamoTrack Managers
========================================================== */

(function () {

    "use strict";

    let managers = [];
    let parentManagers = [];
    let editingId = null;
    let permissionId = null;

    // Parent API is loaded only once when modal needs it
    let parentManagersLoaded = false;


    /* ======================================================
       INIT
    ====================================================== */

    window.initializeManagersPage = async function () {

        await loadManagers();

        document
            .getElementById("staffSearch")
            ?.addEventListener(
                "input",
                renderManagers
            );

    };


    /* ======================================================
       LOAD MANAGERS
    ====================================================== */

    async function loadManagers() {

        try {

            const data =
                await Api.get("/managers/data");

            if (!data) return;

            managers =
                data.users || [];

            renderManagers();

        } catch (error) {

            console.error(
                "Unable to load managers:",
                error
            );

            AppAlert.error(
                error.message ||
                "Unable to load managers"
            );

        }

    }


    /* ======================================================
       PARENT OPTIONS
       Loaded only when Add Manager is opened
    ====================================================== */

    function renderParentOptions(
        selectedId = ""
    ) {

        const select =
            document.getElementById(
                "staffParentId"
            );

        if (!select) return;

        select.innerHTML = `
            <option value="">
                Select parent
            </option>
        `;


        parentManagers.forEach(
            manager => {

                const option =
                    document.createElement(
                        "option"
                    );

                option.value =
                    manager.id;

                option.textContent =
                    `${manager.fullName || "Unnamed"} (${manager.role || "Manager"})`;

                option.selected =
                    manager.id === selectedId;

                select.appendChild(
                    option
                );

            }
        );


        if (selectedId) {
            select.value =
                selectedId;
        }

    }


    async function loadParentManagers() {

        if (parentManagersLoaded) {
            return;
        }


        try {

            const data =
                await Api.get(
                    "/managers/parents"
                );

            if (!data) return;

            parentManagers =
                data.users || [];

            parentManagersLoaded =
                true;

        } catch (error) {

            console.error(
                "Unable to load parent managers:",
                error
            );

            AppAlert.error(
                error.message ||
                "Unable to load parent managers"
            );

        }

    }


    /* ======================================================
       RENDER
    ====================================================== */

    function renderManagers() {

        const tbody =
            document.getElementById(
                "staffTable"
            );

        const search =
            document.getElementById(
                "staffSearch"
            )?.value
                .trim()
                .toLowerCase() || "";


        if (!tbody) return;


        const list =
            managers.filter(
                manager =>
                    !search ||
                    manager.fullName
                        ?.toLowerCase()
                        .includes(search) ||
                    manager.email
                        ?.toLowerCase()
                        .includes(search)
            );


        const count =
            document.getElementById(
                "staffCount"
            );

        if (count) {
            count.textContent =
                list.length;
        }


        if (!list.length) {

            tbody.innerHTML = `
                <tr>
                    <td
                        colspan="5"
                        class="empty-state"
                    >
                        No managers found
                    </td>
                </tr>
            `;

            return;
        }


        tbody.innerHTML =
            list.map(
                manager => {

                    const name =
                        manager.fullName ||
                        "Unnamed";

                    const initials =
                        getInitials(name);


                    return `
                        <tr>

                            <!-- USER -->

                            <td>

                                <div class="staff-user">

                                    <div class="staff-avatar">
                                        ${escapeHtml(
                                            initials
                                        )}
                                    </div>

                                    <div>

                                        <div class="staff-name">
                                            ${escapeHtml(
                                                name
                                            )}
                                        </div>

                                        <div class="staff-email">
                                            ${escapeHtml(
                                                manager.email ||
                                                ""
                                            )}
                                        </div>

                                    </div>

                                </div>

                            </td>


                            <!-- DIRECT PARENT -->

                            <td>

                                <div class="staff-name">

                                    ${escapeHtml(
                                        manager.parentName ||
                                        "Root"
                                    )}

                                </div>

                                ${
                                    manager.parentRole
                                        ? `
                                            <div class="staff-email">
                                                ${escapeHtml(
                                                    manager.parentRole
                                                )}
                                            </div>
                                        `
                                        : ""
                                }

                            </td>


                            <!-- MOBILE -->

                            <td>
                                ${escapeHtml(
                                    manager.mobile ||
                                    "--"
                                )}
                            </td>


                            <!-- STATUS -->

                            <td>

                                <span
                                    class="staff-status ${
                                        manager.isActive
                                            ? "active"
                                            : "inactive"
                                    }"
                                >

                                    <i
                                        class="bi ${
                                            manager.isActive
                                                ? "bi-check-circle"
                                                : "bi-pause-circle"
                                        }"
                                    ></i>

                                    ${
                                        manager.isActive
                                            ? "Active"
                                            : "Inactive"
                                    }

                                </span>

                            </td>


                            <!-- ACTIONS -->

                            <td>

                                <div class="staff-actions">

                                    <button
                                        class="staff-action"
                                        title="Edit"
                                        onclick="editStaff('${manager.id}')"
                                    >
                                        <i class="bi bi-pencil"></i>
                                    </button>


                                    <button
                                        class="staff-action"
                                        title="Permissions"
                                        onclick="openPermissions('${manager.id}')"
                                    >
                                        <i class="bi bi-shield-lock"></i>
                                    </button>


                                    <button
                                        class="staff-action"
                                        title="Delete"
                                        onclick="deleteStaff('${manager.id}')"
                                    >
                                        <i class="bi bi-trash"></i>
                                    </button>

                                </div>

                            </td>

                        </tr>
                    `;

                }
            ).join("");

    }


    /* ======================================================
       MODAL
    ====================================================== */

    async function openStaffModal(
        id = null
    ) {

        editingId = id;


        const manager =
            managers.find(
                item =>
                    item.id === id
            );


        const parentSelect =
            document.getElementById(
                "staffParentId"
            );


        /*
         * ADD
         *
         * Load parent hierarchy only
         * on first Add click.
         */
        if (!id) {

            await loadParentManagers();

            renderParentOptions();

            if (parentSelect) {
                parentSelect.disabled = false;
            }

        }


        /*
         * EDIT
         *
         * No parent API required.
         *
         * Backend already gives us:
         * parentId
         * parentName
         */
        else {

            if (parentSelect) {

                parentSelect.innerHTML = `
                    <option value="${escapeHtml(
                        manager?.parentId || ""
                    )}">
                        ${escapeHtml(
                            manager?.parentName ||
                            "Root"
                        )}
                    </option>
                `;

                parentSelect.value =
                    manager?.parentId || "";

                parentSelect.disabled = true;

            }

        }


        document.getElementById(
            "staffModalTitle"
        ).textContent =
            id
                ? "Edit Manager"
                : "Add Manager";


        document.getElementById(
            "saveStaffBtn"
        ).textContent =
            id
                ? "Update Manager"
                : "Save Manager";


        document.getElementById(
            "staffName"
        ).value =
            manager?.fullName || "";


        document.getElementById(
            "staffEmail"
        ).value =
            manager?.email || "";


        document.getElementById(
            "staffMobile"
        ).value =
            manager?.mobile || "";


        document.getElementById(
            "staffPassword"
        ).value =
            "";


        document.getElementById(
            "staffActive"
        ).checked =
            manager?.isActive !== false;


        document.getElementById(
            "staffEmail"
        ).disabled =
            !!id;


        document.getElementById(
            "passwordHint"
        ).textContent =
            id
                ? "Leave blank to keep current password."
                : "Required when creating.";


        bootstrap.Modal
            .getOrCreateInstance(
                document.getElementById(
                    "staffModal"
                )
            )
            .show();

    }


    /* ======================================================
       EDIT
    ====================================================== */

    function editStaff(id) {

        if (
            !managers.some(
                manager =>
                    manager.id === id
            )
        ) {
            return;
        }

        openStaffModal(id);

    }


    /* ======================================================
       SAVE
    ====================================================== */

    async function saveStaff() {

        const name =
            document.getElementById(
                "staffName"
            ).value.trim();


        const parentSelect =
            document.getElementById(
                "staffParentId"
            );


        const parentId =
            parentSelect?.value?.trim() || "";


        if (
            !editingId &&
            !parentId
        ) {

            AppAlert.warning(
                "Please select a parent manager"
            );

            return;
        }


        const email =
            document.getElementById(
                "staffEmail"
            ).value.trim();


        const mobile =
            document.getElementById(
                "staffMobile"
            ).value.trim();


        const password =
            document.getElementById(
                "staffPassword"
            ).value;


        const isActive =
            document.getElementById(
                "staffActive"
            ).checked;


        const button =
            document.getElementById(
                "saveStaffBtn"
            );


        if (!name) {

            AppAlert.warning(
                "Full name is required"
            );

            return;
        }


        if (!email) {

            AppAlert.warning(
                "Email is required"
            );

            return;
        }


        if (
            !editingId &&
            !password
        ) {

            AppAlert.warning(
                "Password is required"
            );

            return;
        }


        try {

            button.disabled =
                true;


            AppAlert.loading(
                editingId
                    ? "Updating manager..."
                    : "Creating manager..."
            );


            const body = {

                fullName:
                    name,

                email,

                mobile,

                isActive,

                parentId,

            };


            if (password) {

                body.password =
                    password;

            }


            const data =
                editingId

                    ? await Api.patch(
                        `/managers/${editingId}`,
                        body
                    )

                    : await Api.post(
                        "/managers",
                        body
                    );


            if (!data) {
                return;
            }


            AppAlert.close();


            AppAlert.success(
                editingId
                    ? "Manager updated successfully"
                    : "Manager created successfully"
            );


            bootstrap.Modal
                .getInstance(
                    document.getElementById(
                        "staffModal"
                    )
                )
                ?.hide();


            await loadManagers();


        } catch (error) {

            console.error(
                "Unable to save manager:",
                error
            );


            AppAlert.close();


            AppAlert.error(
                error.message ||
                "Unable to save manager"
            );


        } finally {

            button.disabled =
                false;

        }

    }


    /* ======================================================
       DELETE
    ====================================================== */

    async function deleteStaff(id) {

        const manager =
            managers.find(
                item =>
                    item.id === id
            );


        if (!manager) return;


        const confirmed =
            await AppAlert.confirm(
                `Delete "${manager.fullName}"?`
            );


        if (
            !confirmed.isConfirmed
        ) {
            return;
        }


        try {

            AppAlert.loading(
                "Deleting manager..."
            );


            const data =
                await Api.delete(
                    `/managers/${id}`
                );


            if (!data) return;


            AppAlert.close();


            AppAlert.success(
                "Manager deleted successfully"
            );


            await loadManagers();


        } catch (error) {

            AppAlert.close();


            AppAlert.error(
                error.message ||
                "Unable to delete manager"
            );

        }

    }


    /* ======================================================
       PERMISSIONS
    ====================================================== */

    async function openPermissions(id) {

        permissionId =
            id;


        try {

            AppAlert.loading(
                "Loading permissions..."
            );


            const data =
                await Api.get(
                    `/managers/${id}/permissions`
                );


            if (!data) return;


            AppAlert.close();


            renderPermissions(
                data.permissions || {}
            );


            bootstrap.Modal
                .getOrCreateInstance(
                    document.getElementById(
                        "permissionModal"
                    )
                )
                .show();


        } catch (error) {

            AppAlert.close();


            AppAlert.error(
                error.message ||
                "Unable to load permissions"
            );

        }

    }


    function renderPermissions(
        permissions
    ) {

        const container =
            document.getElementById(
                "permissionList"
            );


        if (!container) return;


        const groups = {

            manager:
                "Managers",

            hr:
                "HR",

            field_executive:
                "Executives",

            attendance:
                "Attendance",

            tracking:
                "Live Tracking",

        };


        container.innerHTML =
            Object.entries(groups)
                .map(
                    ([group, title]) => {

                        const keys =
                            Object.keys(
                                permissions
                            ).filter(
                                key =>
                                    key.startsWith(
                                        `${group}.`
                                    )
                            );


                        if (!keys.length) {
                            return "";
                        }


                        return `
                            <div class="permission-group">

                                <div class="permission-group-title">
                                    ${title}
                                </div>

                                ${keys
                                    .map(key => {

                                        const action =
                                            key
                                                .split(".")
                                                .slice(1)
                                                .join(" ");


                                        return `
                                            <div class="permission-item">

                                                <span class="permission-label">
                                                    ${formatPermission(
                                                        action
                                                    )}
                                                </span>

                                                <div class="form-check form-switch">

                                                    <input
                                                        class="form-check-input permission-toggle"
                                                        type="checkbox"
                                                        data-key="${escapeHtml(
                                                            key
                                                        )}"
                                                        ${
                                                            permissions[key]
                                                                ? "checked"
                                                                : ""
                                                        }
                                                    >

                                                </div>

                                            </div>
                                        `;

                                    })
                                    .join("")}

                            </div>
                        `;

                    }
                )
                .join("");

    }


    async function savePermissions() {

        if (!permissionId) return;


        const permissions = {};


        document
            .querySelectorAll(
                ".permission-toggle"
            )
            .forEach(
                input => {

                    permissions[
                        input.dataset.key
                    ] =
                        input.checked;

                }
            );


        const button =
            document.getElementById(
                "savePermissionBtn"
            );


        try {

            button.disabled =
                true;


            AppAlert.loading(
                "Saving permissions..."
            );


            const data =
                await Api.patch(
                    `/managers/${permissionId}/permissions`,
                    permissions
                );


            if (!data) return;


            AppAlert.close();


            AppAlert.success(
                "Permissions updated"
            );


            bootstrap.Modal
                .getInstance(
                    document.getElementById(
                        "permissionModal"
                    )
                )
                ?.hide();


        } catch (error) {

            AppAlert.close();


            AppAlert.error(
                error.message ||
                "Unable to save permissions"
            );


        } finally {

            button.disabled =
                false;

        }

    }


    /* ======================================================
       HELPERS
    ====================================================== */

    function getInitials(name) {

        return name
            .split(" ")
            .filter(Boolean)
            .slice(0, 2)
            .map(
                word =>
                    word.charAt(0)
            )
            .join("")
            .toUpperCase();

    }


    function formatPermission(value) {

        return value
            .replaceAll(
                "_",
                " "
            )
            .replace(
                /\b\w/g,
                char =>
                    char.toUpperCase()
            );

    }


    function escapeHtml(value) {

        return String(
            value ?? ""
        )
            .replaceAll(
                "&",
                "&amp;"
            )
            .replaceAll(
                "<",
                "&lt;"
            )
            .replaceAll(
                ">",
                "&gt;"
            )
            .replaceAll(
                '"',
                "&quot;"
            )
            .replaceAll(
                "'",
                "&#039;"
            );

    }


    /* ======================================================
       GLOBAL
    ====================================================== */

    window.openStaffModal =
        openStaffModal;

    window.editStaff =
        editStaff;

    window.saveStaff =
        saveStaff;

    window.deleteStaff =
        deleteStaff;

    window.openPermissions =
        openPermissions;

    window.savePermissions =
        savePermissions;

})();