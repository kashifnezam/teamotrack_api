/* ==========================================================
   TeamoTrack HR
   HR has no hierarchy.
   Parent: Root Manager / Manager
========================================================== */

(function () {

    "use strict";

    let hr = [];
    let managers = [];
    let editingId = null;
    let defaultParentId = "";


    /* ======================================================
       HELPERS
    ====================================================== */

    const $ = id =>
        document.getElementById(id);


    const value = id =>
        $(id)?.value.trim() || "";


    const setValue = (id, val = "") => {
        if ($(id)) $(id).value = val;
    };


    /* ======================================================
       INIT
    ====================================================== */

    window.initializeHrPage = async function () {

        await Promise.all([
            loadHr(),
            loadManagers()
        ]);

        $("hrSearch")
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

            hr = data.users || [];

            renderHr();

        } catch (error) {

            AppAlert.error(
                error.message ||
                "Unable to load HR"
            );

        }

    }


    /* ======================================================
       LOAD MANAGERS
    ====================================================== */

    async function loadManagers() {

        try {

            const data =
                await Api.get("/hr/parents");

            if (!data) return;

            managers =
                data.users || [];


            defaultParentId =
                data.defaultParentId || "";


            /*
             * Find Root Manager if backend
             * did not provide default parent.
             */
            if (!defaultParentId) {

                const root =
                    managers.find(manager =>
                        [
                            "root_manager",
                            "rootmanager"
                        ].includes(
                            String(
                                manager.role || ""
                            ).toLowerCase()
                        )
                    );

                defaultParentId =
                    root?.uid ||
                    root?.id ||
                    "";
            }


            /*
             * Single-parent fallback.
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
       RENDER HR
    ====================================================== */

    function renderHr() {

        const tbody = $("hrTable");

        if (!tbody) return;


        const search =
            value("hrSearch").toLowerCase();


        const list =
            hr.filter(item => {

                if (!search) return true;

                return [
                    item.fullName,
                    item.email,
                    item.mobile,
                    item.parentName
                ]
                    .some(v =>
                        String(v || "")
                            .toLowerCase()
                            .includes(search)
                    );

            });


        $("hrCount").textContent =
            list.length;


        if (!list.length) {

            tbody.innerHTML = `
                <tr>
                    <td colspan="5"
                        class="empty-state">
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

                const active =
                    item.isActive;


                return `
                    <tr>

                        <td>
                            <div class="hr-user">

                                <div class="hr-avatar">
                                    ${escapeHtml(
                    getInitials(name)
                )}
                                </div>

                                <div>

                                    <div class="hr-name">
                                        ${escapeHtml(name)}
                                    </div>

                                    <div class="hr-email">
                                        ${escapeHtml(
                    item.email || ""
                )}
                                    </div>

                                </div>

                            </div>
                        </td>


                        <td>
                            <span class="hr-parent">
                                ${escapeHtml(
                    item.parentName || "—"
                )}
                            </span>
                        </td>


                        <td>
                            ${escapeHtml(
                    item.mobile || "--"
                )}
                        </td>


                        <td>

                            <span class="hr-status ${active
                        ? "active"
                        : "inactive"
                    }">

                                <i class="bi ${active
                        ? "bi-check-circle"
                        : "bi-pause-circle"
                    }"></i>

                                ${active
                        ? "Active"
                        : "Inactive"
                    }

                            </span>

                        </td>


                        <td>

                            <div class="hr-actions">

                                <button
                                    type="button"
                                    class="hr-action"
                                    title="Edit HR"
                                    onclick="editHr('${item.id}')"
                                >
                                    <i class="bi bi-pencil"></i>
                                </button>

                            </div>

                        </td>

                    </tr>
                `;

            }).join("");

    }


    /* ======================================================
       OPEN MODAL
    ====================================================== */

    function openHrModal(id = null) {

        editingId = id;

        const item = hr.find(x => x.id === id);
        const edit = !!item;


        text(
            "hrModalTitle",
            edit ? "Edit HR" : "Add HR"
        );

        text(
            "saveHrBtn",
            edit ? "Update HR" : "Save HR"
        );


        setValue(
            "hrName",
            item?.fullName
        );

        setValue(
            "hrEmail",
            item?.email
        );

        setValue(
            "hrMobile",
            item?.mobile
        );

        setValue("hrPassword");


        $("hrActive").checked =
            item?.isActive !== false;


        $("hrEmail").disabled =
            edit;


        $("hrPasswordHint").textContent =
            edit
                ? "Leave blank to keep current password."
                : "Required when creating.";


        const parent = $("hrParentId");


        if (edit) {

            /*
             * Parent cannot be changed during edit.
             * Keep the existing option and select it.
             */
            parent.value =
                item?.parentId ||
                item?.parentUid ||
                "";

            parent.disabled = true;

        } else {

            /*
             * Populate only when creating.
             */
            renderParentOptions(
                defaultParentId
            );

            parent.disabled = false;

        }


        bootstrap.Modal
            .getOrCreateInstance(
                $("hrModal")
            )
            .show();

    }


    /* ======================================================
       PARENT OPTIONS
    ====================================================== */

    function renderParentOptions(selectedId = "") {

        const select = $("hrParentId");

        if (!select) return;


        select.innerHTML = `
        <option value="">
            Select manager
        </option>
    `;


        managers.forEach(manager => {

            const id =
                manager.uid ||
                manager.id ||
                "";


            const root =
                [
                    "root_manager",
                    "rootmanager"
                ].includes(
                    String(
                        manager.role || ""
                    ).toLowerCase()
                );


            select.insertAdjacentHTML(
                "beforeend",
                `
                <option
                    value="${escapeHtml(id)}"
                    ${id == selectedId
                    ? "selected"
                    : ""}
                >
                    ${escapeHtml(
                        manager.fullName ||
                        manager.name ||
                        "Unnamed"
                    )}
                    (${root
                    ? "Root Manager"
                    : "Manager"
                })
                </option>
            `
            );

        });

    }


    /* ======================================================
       SAVE HR
    ====================================================== */

    async function saveHr() {

        const name =
            value("hrName");

        const email =
            value("hrEmail");

        const mobile =
            value("hrMobile");

        const password =
            $("hrPassword")?.value || "";

        const parentId =
            value("hrParentId");

        const isActive =
            $("hrActive").checked;

        const button =
            $("saveHrBtn");


        if (!name || !email) {

            AppAlert.warning(
                "Name and email are required"
            );

            return;
        }


        if (!editingId && !parentId) {

            AppAlert.warning(
                "Please select a manager"
            );

            return;
        }


        if (!editingId && !password) {

            AppAlert.warning(
                "Password is required"
            );

            return;
        }


        try {

            button.disabled = true;


            AppAlert.loading(
                editingId
                    ? "Updating HR..."
                    : "Creating HR..."
            );


            const body = {
                fullName: name,
                email,
                mobile,
                isActive
            };


            if (!editingId) {

                body.parentId =
                    parentId;

                body.password =
                    password;

            } else if (password) {

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
                    $("hrModal")
                )
                ?.hide();


            await loadHr();

        } catch (error) {

            AppAlert.close();

            AppAlert.error(
                error.message ||
                "Unable to save HR"
            );

        } finally {

            button.disabled = false;

        }

    }


    /* ======================================================
       DELETE
    ====================================================== */

    async function deleteHr(id) {

        const item =
            hr.find(x => x.id === id);

        if (!item) return;


        const result =
            await AppAlert.confirm(
                `Delete "${item.fullName}"?`
            );


        if (!result.isConfirmed) return;


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
            .split(/\s+/)
            .filter(Boolean)
            .slice(0, 2)
            .map(x => x[0])
            .join("")
            .toUpperCase();

    }


    function escapeHtml(value) {

        return String(value ?? "")
            .replaceAll("&", "&amp;")
            .replaceAll("<", "&lt;")
            .replaceAll(">", "&gt;")
            .replaceAll('"', "&quot;")
            .replaceAll("'", "&#039;");

    }

    const text = (id, val = "") => {
        if ($(id)) $(id).textContent = val;
    };

    /* ======================================================
       GLOBAL
    ====================================================== */

    window.openHrModal = openHrModal;
    window.editHr = openHrModal;
    window.saveHr = saveHr;
    window.deleteHr = deleteHr;

})();