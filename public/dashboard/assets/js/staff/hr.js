/* ==========================================================
   TeamoTrack HR
   HR has no hierarchy.

   Parent:
   - Root Manager
   - Manager
========================================================== */

(function () {

    "use strict";


    let hr = [];
    let managers = [];
    let editingId = null;
    let defaultParentId = "";


    /* ======================================================
       INIT
    ====================================================== */

    window.initializeHrPage = async function () {

        await Promise.all([
            loadHr(),
            loadManagers(),
        ]);


        document
            .getElementById("hrSearch")
            ?.addEventListener(
                "input",
                renderHr
            );

    };


    /* ======================================================
       LOAD HR
    ====================================================== */

    async function loadHr() {

        try {

            const data =
                await Api.get("/hr/data");

            if (!data) return;

            hr =
                data.users || [];

            renderHr();

        } catch (error) {

            AppAlert.error(
                error.message ||
                "Unable to load HR"
            );

        }

    }


    /* ======================================================
       LOAD PARENTS
       Called only once during page initialization.
    ====================================================== */

    /* ======================================================
   LOAD PARENTS
====================================================== */

    async function loadManagers() {

        try {

            const data =
                await Api.get("/hr/parents");

            if (!data) return;


            managers =
                data.users || [];


            console.log(
                "HR Parents:",
                managers
            );


            /*
             * Backend preferred parent.
             */
            defaultParentId =
                data.defaultParentId || "";


            /*
             * If backend didn't provide one,
             * find Root Manager.
             */
            if (!defaultParentId) {

                const rootManager =
                    managers.find(manager => {

                        const role =
                            String(
                                manager.role || ""
                            ).toLowerCase();

                        return (
                            role === "root_manager" ||
                            role === "rootmanager"
                        );

                    });


                if (rootManager) {

                    defaultParentId =
                        rootManager.uid ||
                        rootManager.id ||
                        "";

                }

            }


            /*
             * Last fallback:
             * if there is only one parent,
             * use that parent.
             */
            if (
                !defaultParentId &&
                managers.length === 1
            ) {

                defaultParentId =
                    managers[0].uid ||
                    managers[0].id ||
                    "";

            }


            console.log(
                "Default HR Parent:",
                defaultParentId
            );


            renderParentOptions(
                defaultParentId
            );

        } catch (error) {

            AppAlert.error(
                error.message ||
                "Unable to load managers"
            );

        }

    }


    /* ======================================================
       RENDER HR TABLE
    ====================================================== */

    function renderHr() {

        const tbody =
            document.getElementById(
                "hrTable"
            );

        if (!tbody) return;


        const search =
            document.getElementById(
                "hrSearch"
            )?.value
                .trim()
                .toLowerCase() || "";


        const list =
            hr.filter(item =>

                !search ||

                item.fullName
                    ?.toLowerCase()
                    .includes(search) ||

                item.email
                    ?.toLowerCase()
                    .includes(search) ||

                item.mobile
                    ?.toLowerCase()
                    .includes(search) ||

                item.parentName
                    ?.toLowerCase()
                    .includes(search)

            );


        const count =
            document.getElementById(
                "hrCount"
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
                        No HR found
                    </td>
                </tr>
            `;

            return;
        }


        tbody.innerHTML =
            list.map(item => {

                const name =
                    item.fullName ||
                    "Unnamed";


                return `

            <tr>

                <!-- HR MEMBER -->

                <td>

                    <div class="hr-user">

                        <div class="hr-avatar">

                            ${escapeHtml(
                    getInitials(name)
                )}

                        </div>

                        <div>

                            <div class="hr-name">

                                ${escapeHtml(
                    name
                )}

                            </div>

                            <div class="hr-email">

                                ${escapeHtml(
                    item.email || ""
                )}

                            </div>

                        </div>

                    </div>

                </td>


                <!-- PARENT -->

                <td>

                    <span class="hr-parent">

                        ${escapeHtml(
                    item.parentName ||
                    "—"
                )}

                    </span>

                </td>


                <!-- MOBILE -->

                <td>

                    ${escapeHtml(
                    item.mobile || "--"
                )}

                </td>


                <!-- STATUS -->

                <td>

                    <span
                        class="hr-status ${item.isActive
                        ? "active"
                        : "inactive"
                    }"
                    >

                        <i
                            class="bi ${item.isActive
                        ? "bi-check-circle"
                        : "bi-pause-circle"
                    }"
                        ></i>

                        ${item.isActive
                        ? "Active"
                        : "Inactive"
                    }

                    </span>

                </td>


                <!-- ACTIONS -->

                <td>

                    <div class="hr-actions">

                        <button
                            type="button"
                            class="hr-action"
                            title="Edit HR"
                            aria-label="Edit HR"
                            onclick="editHr('${item.id}')"
                        >

                            <i class="bi bi-pencil"></i>

                        </button>


                        <button
                            type="button"
                            class="hr-action"
                            title="Delete HR"
                            aria-label="Delete HR"
                            onclick="deleteHr('${item.id}')"
                        >

                            <i class="bi bi-trash"></i>

                        </button>

                    </div>

                </td>

            </tr>

        `;

            }).join("");

    }


    /* ======================================================
       OPEN HR MODAL
    ====================================================== */

    function openHrModal(id = null) {

        editingId = id;


        const item =
            hr.find(
                x => x.id === id
            );


        const isEdit =
            !!id;


        document.getElementById(
            "hrModalTitle"
        ).textContent =
            isEdit
                ? "Edit HR"
                : "Add HR";


        document.getElementById(
            "saveHrBtn"
        ).textContent =
            isEdit
                ? "Update HR"
                : "Save HR";


        document.getElementById(
            "hrName"
        ).value =
            item?.fullName || "";


        document.getElementById(
            "hrEmail"
        ).value =
            item?.email || "";


        document.getElementById(
            "hrMobile"
        ).value =
            item?.mobile || "";


        document.getElementById(
            "hrPassword"
        ).value =
            "";


        document.getElementById(
            "hrActive"
        ).checked =
            item?.isActive !== false;


        document.getElementById(
            "hrEmail"
        ).disabled =
            isEdit;


        document.getElementById(
            "hrPasswordHint"
        ).textContent =
            isEdit
                ? "Leave blank to keep current password."
                : "Required when creating.";


        const parentSelect =
            document.getElementById(
                "hrParentId"
            );


        if (parentSelect) {

            /*
             * ADD:
             * select Root Manager.
             *
             * EDIT:
             * select existing parent.
             */
            const selectedParentId =
                isEdit
                    ? (
                        item?.parentId ||
                        item?.parentUid ||
                        ""
                    )
                    : defaultParentId;


            renderParentOptions(
                selectedParentId
            );


            /*
             * HR cannot be moved while editing.
             */
            parentSelect.disabled =
                isEdit;

        }


        bootstrap.Modal
            .getOrCreateInstance(
                document.getElementById(
                    "hrModal"
                )
            )
            .show();

    }


    /* ======================================================
       RENDER PARENT DROPDOWN
    ====================================================== */

    function renderParentOptions(
        selectedId = ""
    ) {

        const select =
            document.getElementById(
                "hrParentId"
            );

        if (!select) return;


        select.innerHTML = `
        <option value="">
            Select manager
        </option>
    `;


        managers.forEach(manager => {

            const managerId =
                manager.uid ||
                manager.id ||
                "";


            const role =
                String(
                    manager.role || ""
                ).toLowerCase();


            const isRootManager =
                role === "root_manager" ||
                role === "rootmanager";


            const roleLabel =
                isRootManager
                    ? "Root Manager"
                    : "Manager";


            const isSelected =
                String(managerId) ===
                String(selectedId);


            select.insertAdjacentHTML(
                "beforeend",
                `
                <option
                    value="${escapeHtml(
                    managerId
                )}"
                    ${isSelected ? "selected" : ""}
                >
                    ${escapeHtml(
                    manager.fullName ||
                    manager.name ||
                    "Unnamed"
                )}
                    (${roleLabel})
                </option>
            `
            );

        });


        /*
         * Make absolutely sure the selected
         * option is applied after rendering.
         */
        if (selectedId) {

            select.value =
                String(selectedId);

        }

    }


    /* ======================================================
       SAVE HR
    ====================================================== */

    async function saveHr() {

        const name =
            document.getElementById(
                "hrName"
            ).value.trim();


        const email =
            document.getElementById(
                "hrEmail"
            ).value.trim();


        const mobile =
            document.getElementById(
                "hrMobile"
            ).value.trim();


        const password =
            document.getElementById(
                "hrPassword"
            ).value;


        const parentId =
            document.getElementById(
                "hrParentId"
            ).value;


        const isActive =
            document.getElementById(
                "hrActive"
            ).checked;


        const button =
            document.getElementById(
                "saveHrBtn"
            );


        /* --------------------------------------------------
           Validation
        -------------------------------------------------- */

        if (!name || !email) {

            AppAlert.warning(
                "Name and email are required"
            );

            return;
        }


        if (
            !editingId &&
            !parentId
        ) {

            AppAlert.warning(
                "Please select a manager"
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

                    ? "Updating HR..."

                    : "Creating HR..."

            );


            const body = {

                fullName:
                    name,

                email,

                mobile,

                isActive,

            };


            /*
             * Parent is only sent during creation.
             */
            if (!editingId) {

                body.parentId =
                    parentId;

                body.password =
                    password;

            }


            /*
             * Password can still be changed
             * during edit.
             */
            if (
                editingId &&
                password
            ) {

                body.password =
                    password;

            }


            const data =

                editingId

                    ? await Api.patch(
                        `/hr/${editingId}`,
                        body
                    )

                    : await Api.post(
                        "/hr",
                        body
                    );


            if (!data) return;


            AppAlert.close();


            AppAlert.success(

                editingId

                    ? "HR updated successfully"

                    : "HR created successfully"

            );


            bootstrap.Modal
                .getInstance(
                    document.getElementById(
                        "hrModal"
                    )
                )
                ?.hide();


            /*
             * Refresh only after
             * successful operation.
             */
            await loadHr();

        } catch (error) {

            AppAlert.close();


            AppAlert.error(

                error.message ||

                "Unable to save HR"

            );

        } finally {

            button.disabled =
                false;

        }

    }


    /* ======================================================
       DELETE HR
    ====================================================== */

    async function deleteHr(id) {

        const item =
            hr.find(
                x => x.id === id
            );


        if (!item) return;


        const confirmed =
            await AppAlert.confirm(

                `Delete "${item.fullName}"?`

            );


        if (
            !confirmed.isConfirmed
        ) {

            return;

        }


        try {

            AppAlert.loading(
                "Deleting HR..."
            );


            const data =
                await Api.delete(
                    `/hr/${id}`
                );


            if (!data) return;


            AppAlert.close();


            AppAlert.success(
                "HR deleted successfully"
            );


            await loadHr();

        } catch (error) {

            AppAlert.close();


            AppAlert.error(

                error.message ||

                "Unable to delete HR"

            );

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
                value =>
                    value[0]
            )

            .join("")

            .toUpperCase();

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
       GLOBAL FUNCTIONS
    ====================================================== */

    window.openHrModal =
        openHrModal;


    window.editHr =
        openHrModal;


    window.saveHr =
        saveHr;


    window.deleteHr =
        deleteHr;


})();