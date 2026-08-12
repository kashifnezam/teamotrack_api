/* ==========================================================
   TeamoTrack Executives
========================================================== */

(function () {

    "use strict";


    let executives = [];
    let teams = [];
    let editingId = null;


    /* ==========================================================
       Initialize
    ========================================================== */

    window.initializeExecutivesPage = async function () {

        await loadExecutives();


        document
            .getElementById("searchInput")
            ?.addEventListener(
                "input",
                renderExecutives
            );


        document
            .getElementById("teamFilter")
            ?.addEventListener(
                "change",
                renderExecutives
            );


        initializePasswordToggle();

    };


    /* ==========================================================
       Password Toggle
    ========================================================== */

    function initializePasswordToggle() {

        const password =
            document.getElementById(
                "password"
            );

        const toggle =
            document.getElementById(
                "togglePassword"
            );


        if (!password || !toggle) {
            return;
        }


        toggle.onclick = () => {

            const icon =
                toggle.querySelector("i");


            if (
                password.type ===
                "password"
            ) {

                password.type =
                    "text";

                icon?.classList.remove(
                    "bi-eye"
                );

                icon?.classList.add(
                    "bi-eye-slash"
                );

                toggle.title =
                    "Hide password";

                toggle.setAttribute(
                    "aria-label",
                    "Hide password"
                );

            } else {

                password.type =
                    "password";

                icon?.classList.remove(
                    "bi-eye-slash"
                );

                icon?.classList.add(
                    "bi-eye"
                );

                toggle.title =
                    "Show password";

                toggle.setAttribute(
                    "aria-label",
                    "Show password"
                );

            }

        };

    }


    /* ==========================================================
       Load
    ========================================================== */

    async function loadExecutives() {

        try {

            const data =
                await Api.get(
                    "/executives/data"
                );


            if (!data) {
                return;
            }


            executives =
                data.executives || [];

            teams =
                data.teams || [];


            populateTeams();

            renderExecutives();

        } catch (error) {

            console.error(error);

            AppAlert.error(
                error.message ||
                "Unable to load executives"
            );

        }

    }


    /* ==========================================================
       Teams
    ========================================================== */

    function populateTeams() {

        const selects = [

            document.getElementById(
                "teamFilter"
            ),

            document.getElementById(
                "teamId"
            )

        ];


        selects.forEach(
            (select, index) => {

                if (!select) {
                    return;
                }


                const first =
                    index === 0
                        ? "All Teams"
                        : "Select Team";


                select.innerHTML =
                    `<option value="">${first}</option>`;


                teams.forEach(team => {

                    select.insertAdjacentHTML(
                        "beforeend",
                        `
                            <option value="${team.id}">
                                ${escapeHtml(
                                    team.name
                                )}
                            </option>
                        `
                    );

                });

            }
        );

    }


    /* ==========================================================
       Render
    ========================================================== */

    function renderExecutives() {

        const searchInput =
            document.getElementById(
                "searchInput"
            );

        const teamFilter =
            document.getElementById(
                "teamFilter"
            );

        const tbody =
            document.getElementById(
                "executiveTable"
            );


        if (
            !searchInput ||
            !teamFilter ||
            !tbody
        ) {
            return;
        }


        const search =
            searchInput.value
                .trim()
                .toLowerCase();


        const team =
            teamFilter.value;


        const list =
            executives.filter(
                exec => {

                    const matchesSearch =
                        !search ||
                        exec.fullName
                            ?.toLowerCase()
                            .includes(search) ||
                        exec.mobile
                            ?.includes(search) ||
                        exec.email
                            ?.toLowerCase()
                            .includes(search);


                    const matchesTeam =
                        !team ||
                        exec.teamId === team;


                    return (
                        matchesSearch &&
                        matchesTeam
                    );

                }
            );


        const count =
            document.getElementById(
                "executiveCount"
            );


        if (count) {
            count.textContent =
                list.length;
        }


        if (!list.length) {

            tbody.innerHTML = `
                <tr>
                    <td
                        colspan="6"
                        class="empty-state"
                    >
                        No executives found
                    </td>
                </tr>
            `;

            return;
        }


        tbody.innerHTML =
            list.map(exec => {

                const teamName =
                    teams.find(
                        t =>
                            t.id ===
                            exec.teamId
                    )?.name ||
                    "No Team";


                return `
                    <tr>

                        <td>

                            <div class="exec-name">
                                ${escapeHtml(
                                    exec.fullName ||
                                    "Unknown"
                                )}
                            </div>

                            <div class="exec-email">
                                ${escapeHtml(
                                    exec.email ||
                                    ""
                                )}
                            </div>

                        </td>

                        <td>
                            ${escapeHtml(
                                exec.mobile ||
                                "-"
                            )}
                        </td>

                        <td>
                            ${escapeHtml(
                                teamName
                            )}
                        </td>

                        <td>

                            <span
                                class="tracking-badge ${
                                    exec.isTrackingEnable
                                        ? "tracking-on"
                                        : "tracking-off"
                                }"
                            >
                                ${
                                    exec.isTrackingEnable
                                        ? "Enabled"
                                        : "Disabled"
                                }
                            </span>

                        </td>

                        <td>

                            <span
                                class="status-badge ${
                                    exec.isActive
                                        ? "status-active"
                                        : "status-inactive"
                                }"
                            >
                                ${
                                    exec.isActive
                                        ? "Active"
                                        : "Inactive"
                                }
                            </span>

                        </td>

                        <td class="text-end">

                            <button
                                type="button"
                                class="action-btn"
                                title="Edit"
                                onclick="editExecutive('${exec.id}')"
                            >
                                <i class="bi bi-pencil"></i>
                            </button>

                        </td>

                    </tr>
                `;

            }).join("");

    }


    /* ==========================================================
       Modal
    ========================================================== */

    function openExecutiveModal(
        id = null
    ) {

        editingId = id;


        document.getElementById(
            "modalTitle"
        ).textContent =
            id
                ? "Edit Executive"
                : "Add Executive";


        document.getElementById(
            "saveExecutiveBtn"
        ).textContent =
            id
                ? "Update Executive"
                : "Save Executive";


        document.getElementById(
            "email"
        ).disabled =
            !!editingId;


        document.getElementById(
            "password"
        ).value = "";


        if (!id) {

            document.getElementById(
                "executiveId"
            ).value = "";

            document.getElementById(
                "fullName"
            ).value = "";

            document.getElementById(
                "mobile"
            ).value = "";

            document.getElementById(
                "email"
            ).value = "";

            document.getElementById(
                "teamId"
            ).value = "";

            document.getElementById(
                "gpsPriority"
            ).value = "low";

            document.getElementById(
                "isActive"
            ).checked = true;

            document.getElementById(
                "isTrackingEnable"
            ).checked = false;

        }


        bootstrap.Modal
            .getOrCreateInstance(
                document.getElementById(
                    "executiveModal"
                )
            )
            .show();

    }


    /* ==========================================================
       Edit
    ========================================================== */

    function editExecutive(id) {

        const exec =
            executives.find(
                e => e.id === id
            );


        if (!exec) {
            return;
        }


        document.getElementById(
            "executiveId"
        ).value = id;


        document.getElementById(
            "fullName"
        ).value =
            exec.fullName || "";


        document.getElementById(
            "mobile"
        ).value =
            exec.mobile || "";


        document.getElementById(
            "email"
        ).value =
            exec.email || "";


        document.getElementById(
            "teamId"
        ).value =
            exec.teamId || "";


        document.getElementById(
            "gpsPriority"
        ).value =
            exec.gpsPriority || "low";


        document.getElementById(
            "isActive"
        ).checked =
            exec.isActive !== false;


        document.getElementById(
            "isTrackingEnable"
        ).checked =
            exec.isTrackingEnable === true;


        openExecutiveModal(id);

    }


    /* ==========================================================
       Save
    ========================================================== */

    async function saveExecutive() {

        const fullName =
            document
                .getElementById(
                    "fullName"
                )
                .value
                .trim();


        const mobile =
            document
                .getElementById(
                    "mobile"
                )
                .value
                .trim();


        const email =
            document
                .getElementById(
                    "email"
                )
                .value
                .trim();


        const password =
            document
                .getElementById(
                    "password"
                )
                .value
                .trim();


        const teamId =
            document.getElementById(
                "teamId"
            ).value;


        const saveBtn =
            document.getElementById(
                "saveExecutiveBtn"
            );


        if (
            !fullName ||
            !mobile ||
            !teamId ||
            (
                !editingId &&
                (!email || !password)
            )
        ) {

            AppAlert.warning(
                "Please fill all required fields"
            );

            return;
        }


        const body = {

            fullName,

            mobile,

            teamId,

            isActive:
                document.getElementById(
                    "isActive"
                ).checked,

            isTrackingEnable:
                document.getElementById(
                    "isTrackingEnable"
                ).checked,

            gpsPriority:
                document.getElementById(
                    "gpsPriority"
                ).value

        };


        if (!editingId) {

            body.email =
                email;

            body.password =
                password;

        } else if (password) {

            body.password =
                password;

        }


        try {

            saveBtn.disabled =
                true;


            AppAlert.loading(
                editingId
                    ? "Updating executive..."
                    : "Adding executive..."
            );


            const data =
                editingId

                    ? await Api.patch(
                        `/executives/${editingId}`,
                        body
                    )

                    : await Api.post(
                        "/executives",
                        body
                    );


            if (!data) {

                AppAlert.close();

                return;
            }


            AppAlert.close();


            AppAlert.success(
                editingId
                    ? "Executive updated successfully"
                    : "Executive created successfully"
            );


            bootstrap.Modal
                .getInstance(
                    document.getElementById(
                        "executiveModal"
                    )
                )
                ?.hide();


            await loadExecutives();

        } catch (error) {

            console.error(error);

            AppAlert.close();

            AppAlert.error(
                error.message ||
                "Failed to save executive"
            );

        } finally {

            saveBtn.disabled =
                false;

        }

    }


    /* ==========================================================
       Escape
    ========================================================== */

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


    /* ==========================================================
       GLOBAL HTML HANDLERS
    ========================================================== */

    window.editExecutive =
        editExecutive;

    window.openExecutiveModal =
        openExecutiveModal;

    window.saveExecutive =
        saveExecutive;


})();