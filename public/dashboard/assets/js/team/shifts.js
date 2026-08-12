/* ==========================================================
   TeamoTrack Shifts
========================================================== */

(function () {

    "use strict";


    let shifts = [];
    let editingId = null;


    const WEEK_DAYS = [
        "Sunday",
        "Monday",
        "Tuesday",
        "Wednesday",
        "Thursday",
        "Friday",
        "Saturday"
    ];


    /* ==========================================================
       Initialize
    ========================================================== */

    window.initializeShiftsPage = async function () {

        await loadShifts();


        document
            .getElementById("searchInput")
            ?.addEventListener(
                "input",
                renderShifts
            );

    };


    /* ==========================================================
       Load
    ========================================================== */

    async function loadShifts() {

        try {

            const data =
                await Api.get(
                    "/shifts/data"
                );


            if (!data) {
                return;
            }


            shifts =
                data.shifts || [];


            renderShifts();

        } catch (error) {

            console.error(error);

            AppAlert.error(
                error.message ||
                "Unable to load shifts"
            );

        }

    }


    /* ==========================================================
       Render
    ========================================================== */

    function renderShifts() {

        const searchInput =
            document.getElementById(
                "searchInput"
            );

        const tbody =
            document.getElementById(
                "shiftTable"
            );


        if (!searchInput || !tbody) {
            return;
        }


        const search =
            searchInput.value
                .trim()
                .toLowerCase();


        const list =
            shifts.filter(
                shift =>
                    !search ||
                    shift.name
                        ?.toLowerCase()
                        .includes(search)
            );


        const count =
            document.getElementById(
                "shiftCount"
            );


        if (count) {
            count.textContent =
                list.length;
        }


        if (!list.length) {

            tbody.innerHTML = `
                <tr>
                    <td
                        colspan="7"
                        class="empty-state"
                    >
                        No shifts found
                    </td>
                </tr>
            `;

            return;
        }


        tbody.innerHTML =
            list.map(shift => {

                const weeklyOff =
                    shift.weeklyOff || [];


                const off =
                    weeklyOff
                        .map(day =>
                            typeof day === "number"
                                ? WEEK_DAYS[day]
                                : day
                        )
                        .filter(Boolean)
                        .join(", ");


                return `
                    <tr>

                        <td>
                            <div class="shift-name">
                                ${escapeHtml(
                                    shift.name ||
                                    "Unnamed"
                                )}
                            </div>
                        </td>

                        <td>

                            <span class="shift-time">

                                ${formatTime(
                                    shift.startHour,
                                    shift.startMinute
                                )}

                                -

                                ${formatTime(
                                    shift.endHour,
                                    shift.endMinute
                                )}

                            </span>

                        </td>

                        <td>
                            ${shift.graceMinutes || 0} min
                        </td>

                        <td>
                            ${shift.halfDayMinutes || 0} min
                        </td>

                        <td>
                            ${shift.fullDayMinutes || 0} min
                        </td>

                        <td>

                            ${
                                off
                                    ? `
                                        <span class="weekly-badge">
                                            ${escapeHtml(off)}
                                        </span>
                                    `
                                    : `
                                        <span class="no-off">
                                            None
                                        </span>
                                    `
                            }

                        </td>

                        <td class="text-end">

                            <button
                                type="button"
                                class="action-btn"
                                title="Edit"
                                onclick="editShift('${shift.id}')"
                            >
                                <i class="bi bi-pencil"></i>
                            </button>

                            <button
                                type="button"
                                class="action-btn"
                                title="Delete"
                                onclick="deleteShift('${shift.id}')"
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

    function openShiftModal(
        id = null
    ) {

        editingId = id;


        document.getElementById(
            "modalTitle"
        ).textContent =
            id
                ? "Edit Shift"
                : "Add Shift";


        document.getElementById(
            "saveShiftBtn"
        ).textContent =
            id
                ? "Update Shift"
                : "Save Shift";


        if (!id) {

            document.getElementById(
                "shiftId"
            ).value = "";

            document.getElementById(
                "shiftName"
            ).value = "";

            document.getElementById(
                "startTime"
            ).value = "";

            document.getElementById(
                "endTime"
            ).value = "";

            document.getElementById(
                "graceMinutes"
            ).value = 0;

            document.getElementById(
                "halfDayMinutes"
            ).value = 240;

            document.getElementById(
                "fullDayMinutes"
            ).value = 480;


            document
                .querySelectorAll(
                    "#shiftModal .weekly-off input"
                )
                .forEach(input => {

                    input.checked =
                        false;

                });

        }


        bootstrap.Modal
            .getOrCreateInstance(
                document.getElementById(
                    "shiftModal"
                )
            )
            .show();

    }


    /* ==========================================================
       Edit
    ========================================================== */

    function editShift(id) {

        const shift =
            shifts.find(
                s => s.id === id
            );


        if (!shift) {
            return;
        }


        document.getElementById(
            "shiftId"
        ).value = id;


        document.getElementById(
            "shiftName"
        ).value =
            shift.name || "";


        document.getElementById(
            "startTime"
        ).value =
            formatTime(
                shift.startHour,
                shift.startMinute
            );


        document.getElementById(
            "endTime"
        ).value =
            formatTime(
                shift.endHour,
                shift.endMinute
            );


        document.getElementById(
            "graceMinutes"
        ).value =
            shift.graceMinutes || 0;


        document.getElementById(
            "halfDayMinutes"
        ).value =
            shift.halfDayMinutes || 0;


        document.getElementById(
            "fullDayMinutes"
        ).value =
            shift.fullDayMinutes || 0;


        const weeklyOff =
            shift.weeklyOff || [];


        document
            .querySelectorAll(
                "#shiftModal .weekly-off input"
            )
            .forEach(input => {

                const value =
                    Number(input.value);


                input.checked =
                    weeklyOff.includes(
                        WEEK_DAYS[value]
                    ) ||
                    weeklyOff.includes(
                        value
                    );

            });


        openShiftModal(id);

    }


    /* ==========================================================
       Save
    ========================================================== */

    async function saveShift() {

        const name =
            document.getElementById(
                "shiftName"
            ).value.trim();


        const start =
            document.getElementById(
                "startTime"
            ).value;


        const end =
            document.getElementById(
                "endTime"
            ).value;


        const button =
            document.getElementById(
                "saveShiftBtn"
            );


        if (
            !name ||
            !start ||
            !end
        ) {

            AppAlert.warning(
                "Shift name and time are required"
            );

            return;
        }


        const [
            startHour,
            startMinute
        ] =
            start
                .split(":")
                .map(Number);


        const [
            endHour,
            endMinute
        ] =
            end
                .split(":")
                .map(Number);


        const body = {

            name,

            startHour,
            startMinute,

            endHour,
            endMinute,

            graceMinutes:
                Number(
                    document.getElementById(
                        "graceMinutes"
                    ).value
                ) || 0,

            halfDayMinutes:
                Number(
                    document.getElementById(
                        "halfDayMinutes"
                    ).value
                ) || 0,

            fullDayMinutes:
                Number(
                    document.getElementById(
                        "fullDayMinutes"
                    ).value
                ) || 0,

            weeklyOff:
                [
                    ...document.querySelectorAll(
                        "#shiftModal .weekly-off input:checked"
                    )
                ]
                    .map(
                        input =>
                            WEEK_DAYS[
                                Number(
                                    input.value
                                )
                            ]
                    )

        };


        try {

            button.disabled =
                true;


            AppAlert.loading(
                editingId
                    ? "Updating shift..."
                    : "Creating shift..."
            );


            const data =
                editingId

                    ? await Api.patch(
                        `/shifts/${editingId}`,
                        body
                    )

                    : await Api.post(
                        "/shifts",
                        body
                    );


            if (!data) {

                AppAlert.close();

                return;
            }


            AppAlert.close();


            AppAlert.success(
                editingId
                    ? "Shift updated successfully"
                    : "Shift created successfully"
            );


            bootstrap.Modal
                .getInstance(
                    document.getElementById(
                        "shiftModal"
                    )
                )
                ?.hide();


            await loadShifts();

        } catch (error) {

            console.error(error);

            AppAlert.close();

            AppAlert.error(
                error.message ||
                "Failed to save shift"
            );

        } finally {

            button.disabled =
                false;

        }

    }


    /* ==========================================================
       Delete
    ========================================================== */

    async function deleteShift(id) {

        const shift =
            shifts.find(
                s => s.id === id
            );


        if (!shift) {
            return;
        }


        const result =
            await AppAlert.confirm(
                `Are you sure you want to delete the shift "${shift.name}"?`,
                "This action cannot be undone."
            );


        if (!result.isConfirmed) {
            return;
        }


        try {

            AppAlert.loading(
                "Deleting shift..."
            );


            const data =
                await Api.delete(
                    `/shifts/${id}`
                );


            if (!data) {

                AppAlert.close();

                return;
            }


            AppAlert.close();


            AppAlert.success(
                "Shift deleted successfully"
            );


            await loadShifts();

        } catch (error) {

            console.error(error);

            AppAlert.close();

            AppAlert.error(
                error.message ||
                "Unable to delete shift"
            );

        }

    }


    /* ==========================================================
       Helpers
    ========================================================== */

    function formatTime(
        hour,
        minute
    ) {

        return `${String(
            hour || 0
        ).padStart(2, "0")}:${String(
            minute || 0
        ).padStart(2, "0")}`;

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


    /* ==========================================================
       GLOBAL HTML HANDLERS
    ========================================================== */

    window.editShift =
        editShift;

    window.deleteShift =
        deleteShift;

    window.openShiftModal =
        openShiftModal;

    window.saveShift =
        saveShift;


})();