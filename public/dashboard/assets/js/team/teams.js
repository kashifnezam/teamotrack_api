/* ==========================================================
   TeamoTrack Teams
========================================================== */

(function () {

    "use strict";


    let teams = [];
    let managers = [];
    let shifts = [];
    let editingId = null;


    /* ==========================================================
       Initialize
    ========================================================== */

    window.initializeTeamsPage = async function () {

        await loadTeams();

        document
            .getElementById("searchInput")
            ?.addEventListener(
                "input",
                renderTeams
            );

    };


    /* ==========================================================
       Load Teams
    ========================================================== */

    async function loadTeams() {

        try {

            const data =
                await Api.get("/teams/data");

            if (!data) return;

            teams =
                data.teams || [];

            managers =
                data.managers || [];

            shifts =
                data.shifts || [];


            populateManagers();
            populateShifts();
            renderTeams();

        } catch (error) {

            console.error(error);

            AppAlert.error(
                error.message ||
                "Unable to load teams"
            );

        }

    }


    /* ==========================================================
       Managers
    ========================================================== */

    function populateManagers() {

        const select =
            document.getElementById("leadId");

        if (!select) return;


        select.innerHTML =
            `<option value="">No Manager</option>`;


        managers.forEach(manager => {

            select.insertAdjacentHTML(
                "beforeend",
                `
                    <option value="${manager.id}">
                        ${escapeHtml(manager.fullName)}
                    </option>
                `
            );

        });

    }


    /* ==========================================================
       Shifts
    ========================================================== */

    function populateShifts() {

        const select =
            document.getElementById("shiftId");

        const message =
            document.getElementById(
                "noShiftMessage"
            );

        if (!select) return;


        select.innerHTML =
            `<option value="">Select Shift</option>`;


        shifts.forEach(shift => {

            select.insertAdjacentHTML(
                "beforeend",
                `
                    <option value="${shift.id}">
                        ${escapeHtml(shift.name)}
                    </option>
                `
            );

        });


        if (!shifts.length) {

            select.disabled = true;

            message?.classList.add(
                "d-none"
            );

        } else {

            select.disabled = false;

            message?.classList.add(
                "d-none"
            );

        }

    }


    /* ==========================================================
       Render
    ========================================================== */

    function renderTeams() {

        const searchInput =
            document.getElementById(
                "searchInput"
            );

        const tbody =
            document.getElementById(
                "teamTable"
            );

        if (!searchInput || !tbody) {
            return;
        }


        const search =
            searchInput.value
                .trim()
                .toLowerCase();


        const list =
            teams.filter(team =>
                !search ||
                team.name
                    ?.toLowerCase()
                    .includes(search)
            );


        const count =
            document.getElementById(
                "teamCount"
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
                        No teams found
                    </td>
                </tr>
            `;

            return;
        }


        tbody.innerHTML =
            list.map(team => {

                const manager =
                    managers.find(
                        m =>
                            m.id ===
                            team.leadId
                    )?.fullName ||
                    "No Manager";


                const shift =
                    shifts.find(
                        s =>
                            s.id ===
                            team.shiftId
                    )?.name ||
                    "No Shift";


                return `
                    <tr>

                        <td>
                            <div class="team-name">
                                ${escapeHtml(
                                    team.name ||
                                    "Unnamed"
                                )}
                            </div>
                        </td>

                        <td>
                            ${escapeHtml(manager)}
                        </td>

                        <td>
                            ${
                                team.shiftId
                                    ? escapeHtml(shift)
                                    : `
                                        <span class="team-badge team-no-shift">
                                            No Shift
                                        </span>
                                    `
                            }
                        </td>

                        <td>
                            ${team.totalExecutives || 0}
                        </td>

                        <td class="text-end">

                            <button
                                type="button"
                                class="action-btn"
                                title="Edit"
                                onclick="editTeam('${team.id}')"
                            >
                                <i class="bi bi-pencil"></i>
                            </button>

                            <button
                                type="button"
                                class="action-btn"
                                title="Delete"
                                onclick="deleteTeam('${team.id}')"
                            >
                                <i class="bi bi-trash"></i>
                            </button>

                        </td>

                    </tr>
                `;

            }).join("");

    }


    /* ==========================================================
       Modal
    ========================================================== */

    function openTeamModal(id = null) {

        editingId = id;


        document.getElementById(
            "modalTitle"
        ).textContent =
            id
                ? "Edit Team"
                : "Add Team";


        document.getElementById(
            "saveTeamBtn"
        ).textContent =
            id
                ? "Update Team"
                : "Save Team";


        if (!id) {

            document.getElementById(
                "teamId"
            ).value = "";

            document.getElementById(
                "teamName"
            ).value = "";

            document.getElementById(
                "leadId"
            ).value = "";

            document.getElementById(
                "shiftId"
            ).value = "";

        }


        bootstrap.Modal
            .getOrCreateInstance(
                document.getElementById(
                    "teamModal"
                )
            )
            .show();

    }


    /* ==========================================================
       Edit
    ========================================================== */

    function editTeam(id) {

        const team =
            teams.find(
                t => t.id === id
            );

        if (!team) return;


        document.getElementById(
            "teamId"
        ).value = id;


        document.getElementById(
            "teamName"
        ).value =
            team.name || "";


        document.getElementById(
            "leadId"
        ).value =
            team.leadId || "";


        document.getElementById(
            "shiftId"
        ).value =
            team.shiftId || "";


        openTeamModal(id);

    }


    /* ==========================================================
       Save
    ========================================================== */

    async function saveTeam() {

        const name =
            document
                .getElementById("teamName")
                .value
                .trim();


        const leadId =
            document.getElementById(
                "leadId"
            ).value;


        const shiftId =
            document.getElementById(
                "shiftId"
            ).value;


        const button =
            document.getElementById(
                "saveTeamBtn"
            );


        if (!name) {

            AppAlert.warning(
                "Team name is required"
            );

            return;
        }


        if (!shiftId) {

            AppAlert.warning(
                "Shift policy is required"
            );

            return;
        }


        try {

            button.disabled = true;


            AppAlert.loading(
                editingId
                    ? "Updating team..."
                    : "Creating team..."
            );


            const body = {
                name,
                leadId:
                    leadId || undefined,
                shiftId
            };


            const data =
                editingId

                    ? await Api.patch(
                        `/teams/${editingId}`,
                        body
                    )

                    : await Api.post(
                        "/teams",
                        body
                    );


            if (!data) {

                AppAlert.close();

                return;
            }


            AppAlert.close();


            AppAlert.success(
                editingId
                    ? "Team updated successfully"
                    : "Team created successfully"
            );


            bootstrap.Modal
                .getInstance(
                    document.getElementById(
                        "teamModal"
                    )
                )
                ?.hide();


            await loadTeams();

        } catch (error) {

            console.error(error);

            AppAlert.close();

            AppAlert.error(
                error.message ||
                "Failed to save team"
            );

        } finally {

            button.disabled = false;

        }

    }


    /* ==========================================================
       Delete
    ========================================================== */

    async function deleteTeam(id) {

        const team =
            teams.find(
                t => t.id === id
            );

        if (!team) return;


        const confirmed = await AppAlert.confirm(
                `Are you sure you want to delete the team "${team.name}"? This action cannot be undone.`
            );


        if (!confirmed) {
            return;
        }


        try {

            AppAlert.loading(
                "Deleting team..."
            );


            const data =
                await Api.delete(
                    `/teams/${id}`
                );


            if (!data) {

                AppAlert.close();

                return;
            }


            AppAlert.close();


            AppAlert.success(
                "Team deleted successfully"
            );


            await loadTeams();

        } catch (error) {

            console.error(error);

            AppAlert.close();

            AppAlert.error(
                error.message ||
                "Unable to delete team"
            );

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

    window.editTeam =
        editTeam;

    window.deleteTeam =
        deleteTeam;

    window.openTeamModal =
        openTeamModal;

    window.saveTeam =
        saveTeam;


})();