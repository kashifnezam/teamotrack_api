/* ==========================================================
   TeamoTrack HR
========================================================== */

(function () {

    "use strict";

    let hr = [];
    let editingId = null;


    window.initializeHrPage = async function () {

        await loadHr();

        document
            .getElementById("hrSearch")
            ?.addEventListener(
                "input",
                renderHr
            );

    };


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
                    .includes(search)
            );


        document.getElementById(
            "hrCount"
        ).textContent =
            list.length;


        if (!list.length) {

            tbody.innerHTML = `
                <tr>
                    <td
                        colspan="4"
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

                        <td>

                            <div class="staff-user">

                                <div class="staff-avatar">
                                    ${escapeHtml(
                                        getInitials(name)
                                    )}
                                </div>

                                <div>

                                    <div class="staff-name">
                                        ${escapeHtml(name)}
                                    </div>

                                    <div class="staff-email">
                                        ${escapeHtml(
                                            item.email || ""
                                        )}
                                    </div>

                                </div>

                            </div>

                        </td>


                        <td>
                            ${escapeHtml(
                                item.mobile || "--"
                            )}
                        </td>


                        <td>

                            <span class="staff-status ${
                                item.isActive
                                    ? "active"
                                    : "inactive"
                            }">

                                <i class="bi ${
                                    item.isActive
                                        ? "bi-check-circle"
                                        : "bi-pause-circle"
                                }"></i>

                                ${
                                    item.isActive
                                        ? "Active"
                                        : "Inactive"
                                }

                            </span>

                        </td>


                        <td>

                            <div class="staff-actions">

                                <button
                                    class="staff-action"
                                    title="Edit"
                                    onclick="editHr('${item.id}')"
                                >
                                    <i class="bi bi-pencil"></i>
                                </button>

                                <button
                                    class="staff-action"
                                    title="Delete"
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


    function openHrModal(id = null) {

        editingId = id;

        const item =
            hr.find(
                x => x.id === id
            );


        document.getElementById(
            "hrModalTitle"
        ).textContent =
            id
                ? "Edit HR"
                : "Add HR";


        document.getElementById(
            "saveHrBtn"
        ).textContent =
            id
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
            !!id;


        document.getElementById(
            "hrPasswordHint"
        ).textContent =
            id
                ? "Leave blank to keep current password."
                : "Required when creating.";


        bootstrap.Modal
            .getOrCreateInstance(
                document.getElementById(
                    "hrModal"
                )
            )
            .show();

    }


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

        const isActive =
            document.getElementById(
                "hrActive"
            ).checked;

        const button =
            document.getElementById(
                "saveHrBtn"
            );


        if (!name || !email) {

            AppAlert.warning(
                "Name and email are required"
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


            if (password) {
                body.password = password;
            }


            const data =
                editingId

                    ? await Api.patch(
                        `/hr/${editingId}`,
                        body
                    )

                    : await Api.post(
                        "/hr",
                        {
                            ...body,
                            password
                        }
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


        if (!confirmed.isConfirmed) {
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


    function getInitials(name) {

        return name
            .split(" ")
            .filter(Boolean)
            .slice(0, 2)
            .map(
                x => x[0]
            )
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


    window.openHrModal =
        openHrModal;

    window.editHr =
        openHrModal;

    window.saveHr =
        saveHr;

    window.deleteHr =
        deleteHr;

})();