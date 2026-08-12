/* ==========================================================
   TeamoTrack Tasks
========================================================== */
(function () {

    "use strict";

    let tasks = [];
    let executives = [];
    let editingId = null;

    let currentMonth =
        new Date().toISOString().slice(0, 7);

    let startMap = null;
    let endMap = null;
    let startMarker = null;
    let endMarker = null;


    /* ==========================================================
       Initialize
    ========================================================== */

    window.initializeTasksPage = async function () {

        const month =
            document.getElementById("monthFilter");

        if (!month) return;

        month.value =
            currentMonth;


        month.addEventListener(
            "change",
            loadTasks
        );


        document
            .getElementById("searchInput")
            ?.addEventListener(
                "input",
                renderTasks
            );


        document
            .getElementById("statusFilter")
            ?.addEventListener(
                "change",
                renderTasks
            );


        document
            .getElementById("isGeofence")
            ?.addEventListener(
                "change",
                toggleLocation
            );


        await loadTasks();
    }


    /* ==========================================================
       Load Month
    ========================================================== */

    async function loadTasks() {

        const month =
            document
                .getElementById("monthFilter")
                .value;

        const [year, monthNumber] =
            month.split("-").map(Number);


        try {

            AppAlert.loading(
                "Loading tasks..."
            );


            const data =
                await Api.get(
                    `/tasks/data?year=${year}&month=${monthNumber}`
                );


            if (!data) return;


            tasks =
                data.tasks || [];

            executives =
                data.executives || [];


            populateExecutives();

            renderTasks();

            AppAlert.close();

        } catch (error) {

            AppAlert.close();

            console.error(error);

            AppAlert.error(
                error.message ||
                "Unable to load tasks"
            );
        }
    }


    /* ==========================================================
       Executives
    ========================================================== */

    function populateExecutives() {

        const select =
            document.getElementById(
                "assignedTo"
            );

        if (!select) return;


        select.innerHTML =
            `<option value="">Unassigned</option>`;


        executives.forEach(exec => {

            select.insertAdjacentHTML(
                "beforeend",
                `
            <option value="${escapeHtml(exec.id)}">
                ${escapeHtml(
                    exec.fullName ||
                    exec.email ||
                    "Unknown"
                )}
            </option>
            `
            );

        });
    }


    /* ==========================================================
       Filter + Render
    ========================================================== */

    function renderTasks() {

        const search =
            document
                .getElementById("searchInput")
                ?.value
                .trim()
                .toLowerCase() || "";


        const filter =
            document
                .getElementById("statusFilter")
                ?.value || "";


        const list =
            tasks.filter(task => {

                /* Assigned */

                if (
                    filter === "assigned_to" &&
                    !task.assignedTo
                ) {
                    return false;
                }


                /* Unassigned */

                if (
                    filter === "unassigned" &&
                    task.assignedTo
                ) {
                    return false;
                }


                /* Real status */

                if (
                    filter &&
                    ![
                        "assigned_to",
                        "unassigned",
                    ].includes(filter) &&
                    task.status !== filter
                ) {
                    return false;
                }


                /* Search */

                if (!search) {
                    return true;
                }


                const text =
                    `${task.title || ""} ${task.description || ""}`
                        .toLowerCase();


                return text.includes(search);

            });


        document
            .getElementById("taskCount")
            .textContent =
            list.length;


        renderTaskRows(list);
    }


    /* ==========================================================
       Rows
    ========================================================== */

    function renderTaskRows(list) {

        const tbody =
            document.getElementById(
                "taskTable"
            );

        if (!tbody) return;


        if (!list.length) {

            tbody.innerHTML = `
            <tr>
                <td
                    colspan="7"
                    class="empty-state"
                >
                    No tasks found
                </td>
            </tr>
        `;

            return;
        }


        tbody.innerHTML =
            list.map(task => {

                const executive =
                    executives.find(
                        e =>
                            e.id ===
                            task.assignedTo
                    );


                const status =
                    task.status ||
                    "pending";


                const priority =
                    String(
                        task.priority ||
                        "Medium"
                    ).toLowerCase();


                const locked =
                    [
                        "completed",
                        "cancelled",
                        "failed",
                    ].includes(status);


                return `
                <tr>

                    <td>

                        <div class="task-name">
                            ${escapeHtml(
                    task.title ||
                    "Untitled"
                )}
                        </div>

                        <div class="task-description">
                            ${escapeHtml(
                    task.description ||
                    ""
                )}
                        </div>

                    </td>


                    <td>

                        ${executive

                        ? escapeHtml(
                            executive.fullName ||
                            executive.email ||
                            "Unknown"
                        )

                        : `
                                    <span class="text-muted">
                                        Unassigned
                                    </span>
                                `
                    }

                    </td>


                    <td>

                        <div class="task-time">
                            ${formatDateTime(
                        task.startDate
                    )}
                        </div>

                        <small class="text-muted">
                            ${formatDateTime(
                        task.endDate
                    )}
                        </small>

                    </td>


                    <td>

                        <span
                            class="
                                priority-badge
                                priority-${priority}
                            "
                        >
                            ${escapeHtml(
                        task.priority ||
                        "Medium"
                    )}
                        </span>

                    </td>


                    <td>

                        ${task.isGeofence

                        ? `
                                    <span class="location-badge">
                                        <i class="bi bi-geo-alt me-1"></i>
                                        Geofence
                                    </span>
                                `

                        : `
                                    <span class="text-muted">
                                        None
                                    </span>
                                `
                    }

                    </td>


                    <td>

                        <span
                            class="
                                status-badge
                                status-${status}
                            "
                        >
                            ${formatStatus(status)}
                        </span>

                    </td>


                    <td class="text-end">

                        <button
                            type="button"
                            class="action-btn"
                            title="View"
                            onclick="openTaskDetails('${escapeHtml(task.id)}')"
                        >
                            <i class="bi bi-eye"></i>
                        </button>


                        ${locked
                        ? ""

                        : `
                                    <button
                                        type="button"
                                        class="action-btn"
                                        title="Edit"
                                        onclick="editTask('${escapeHtml(task.id)}')"
                                    >
                                        <i class="bi bi-pencil"></i>
                                    </button>
                                `
                    }


                        <button
                            type="button"
                            class="action-btn"
                            title="Delete"
                            onclick="deleteTask('${escapeHtml(task.id)}')"
                        >
                            <i class="bi bi-trash"></i>
                        </button>

                    </td>

                </tr>
            `;

            }).join("");
    }


    /* ==========================================================
       Task Details
    ========================================================== */

    function openTaskDetails(id) {

        const task =
            tasks.find(
                task =>
                    task.id === id
            );


        if (!task) return;


        const executive =
            executives.find(
                exec =>
                    exec.id ===
                    task.assignedTo
            );


        const status =
            task.status ||
            "pending";


        const priority =
            String(
                task.priority ||
                "Medium"
            ).toLowerCase();


        /* Basic */

        document
            .getElementById("detailTitle")
            .textContent =
            task.title ||
            "Untitled";


        document
            .getElementById("detailExecutive")
            .textContent =
            executive
                ? (
                    executive.fullName ||
                    executive.email
                )
                : "Unassigned";


        /* Status */

        const statusEl =
            document.getElementById(
                "detailStatus"
            );

        statusEl.className =
            `status-badge status-${status}`;

        statusEl.textContent =
            formatStatus(status);


        /* Priority */

        const priorityEl =
            document.getElementById(
                "detailPriority"
            );

        priorityEl.className =
            `priority-badge priority-${priority}`;

        priorityEl.textContent =
            task.priority ||
            "Medium";


        /* Description */

        document
            .getElementById(
                "detailDescription"
            )
            .textContent =
            task.description ||
            "No description";


        /* Schedule */

        setText(
            "detailScheduledStart",
            formatDateTime(
                task.startDate
            )
        );


        setText(
            "detailScheduledEnd",
            formatDateTime(
                task.endDate
            )
        );


        /* Actual execution */

        setText(
            "detailStartedAt",
            formatDateTime(
                task.startedAt
            )
        );


        setText(
            "detailCompletedAt",
            formatDateTime(
                task.completedAt
            )
        );

        setText(
            "detailCompletionDuration",
            formatDuration(
                task.startedAt,
                task.completedAt
            )
        );


        /* Proof */

        const proofSection =
            document.getElementById(
                "detailProofSection"
            );

        const proof =
            document.getElementById(
                "detailProof"
            );

        const proofLink =
            document.getElementById(
                "detailProofLink"
            );


        if (task.proofUrl) {

            proof.src =
                task.proofUrl;

            proofLink.href =
                task.proofUrl;

            proofSection
                .classList
                .remove("d-none");

        } else {

            proof.removeAttribute("src");

            proofLink.href =
                "#";

            proofSection
                .classList
                .add("d-none");
        }


        /* Location */

        const locationSection =
            document.getElementById(
                "detailLocationSection"
            );


        if (
            task.startLocation ||
            task.endLocation
        ) {

            setText(
                "detailStartAddress",
                task.startLocation?.address
                    ? `Start: ${task.startLocation.address}`
                    : "Start location not available"
            );


            setText(
                "detailEndAddress",
                task.endLocation?.address
                    ? `End: ${task.endLocation.address}`
                    : "End location not available"
            );


            locationSection
                .classList
                .remove("d-none");

        } else {

            locationSection
                .classList
                .add("d-none");
        }


        bootstrap.Modal
            .getOrCreateInstance(
                document.getElementById(
                    "taskDetailsModal"
                )
            )
            .show();
    }


    /* ==========================================================
       Task Modal
    ========================================================== */

    function openTaskModal(id = null) {

        editingId = id;


        document
            .getElementById("modalTitle")
            .textContent =
            id
                ? "Edit Task"
                : "Add Task";


        document
            .getElementById("saveTaskBtn")
            .textContent =
            id
                ? "Update Task"
                : "Save Task";


        if (!id) {

            document.getElementById(
                "taskId"
            ).value = "";

            document.getElementById(
                "taskTitle"
            ).value = "";

            document.getElementById(
                "description"
            ).value = "";

            document.getElementById(
                "priority"
            ).value = "Medium";

            document.getElementById(
                "startDate"
            ).value = "";

            document.getElementById(
                "endDate"
            ).value = "";

            document.getElementById(
                "assignedTo"
            ).value = "";

            document.getElementById(
                "isGeofence"
            ).checked = false;
        }


        toggleLocation();


        bootstrap.Modal
            .getOrCreateInstance(
                document.getElementById(
                    "taskModal"
                )
            )
            .show();
    }


    /* ==========================================================
       Edit
    ========================================================== */

    function editTask(id) {

        const task =
            tasks.find(
                task =>
                    task.id === id
            );


        if (!task) return;


        if (
            [
                "completed",
                "cancelled",
                "failed",
            ].includes(task.status)
        ) {

            AppAlert.warning(
                "This task can no longer be edited"
            );

            return;
        }


        document.getElementById(
            "taskId"
        ).value = id;


        document.getElementById(
            "taskTitle"
        ).value =
            task.title || "";


        document.getElementById(
            "description"
        ).value =
            task.description || "";


        document.getElementById(
            "priority"
        ).value =
            task.priority || "Medium";


        document.getElementById(
            "startDate"
        ).value =
            toDateTimeLocal(
                task.startDate
            );


        document.getElementById(
            "endDate"
        ).value =
            toDateTimeLocal(
                task.endDate
            );


        document.getElementById(
            "assignedTo"
        ).value =
            task.assignedTo || "";


        document.getElementById(
            "isGeofence"
        ).checked =
            task.isGeofence === true;


        setLocation(
            "start",
            task.startLocation
        );


        setLocation(
            "end",
            task.endLocation
        );


        openTaskModal(id);
    }


    /* ==========================================================
       Save
    ========================================================== */

    async function saveTask() {

        const title =
            document
                .getElementById("taskTitle")
                .value
                .trim();


        const description =
            document
                .getElementById("description")
                .value
                .trim();


        const startDate =
            document
                .getElementById("startDate")
                .value;


        const endDate =
            document
                .getElementById("endDate")
                .value;


        const assignedTo =
            document
                .getElementById("assignedTo")
                .value;


        if (
            !title ||
            !description ||
            !startDate ||
            !endDate
        ) {

            AppAlert.warning(
                "Please fill all required fields"
            );

            return;
        }


        if (
            new Date(endDate) <=
            new Date(startDate)
        ) {

            AppAlert.warning(
                "End date must be after start date"
            );

            return;
        }


        const isGeofence =
            document
                .getElementById("isGeofence")
                .checked;


        const body = {

            title,

            description,

            priority:
                document
                    .getElementById("priority")
                    .value,

            startDate:
                new Date(
                    startDate
                ).toISOString(),

            endDate:
                new Date(
                    endDate
                ).toISOString(),

            assignedTo:
                assignedTo || undefined,

            isGeofence,

            startLocation:
                isGeofence
                    ? getLocation("start")
                    : null,

            endLocation:
                isGeofence
                    ? getLocation("end")
                    : null,
        };


        const button =
            document.getElementById(
                "saveTaskBtn"
            );


        try {

            button.disabled = true;


            AppAlert.loading(
                editingId
                    ? "Updating task..."
                    : "Creating task..."
            );


            const data =
                editingId

                    ? await Api.patch(
                        `/tasks/${editingId}`,
                        body
                    )

                    : await Api.post(
                        "/tasks",
                        body
                    );


            if (!data) return;


            AppAlert.close();


            AppAlert.success(
                editingId
                    ? "Task updated successfully"
                    : "Task created successfully"
            );


            bootstrap.Modal
                .getInstance(
                    document.getElementById(
                        "taskModal"
                    )
                )
                ?.hide();


            await loadTasks();

        } catch (error) {

            AppAlert.close();

            AppAlert.error(
                error.message ||
                "Failed to save task"
            );

        } finally {

            button.disabled = false;
        }
    }


    /* ==========================================================
       Delete
    ========================================================== */

    async function deleteTask(id) {

        const task =
            tasks.find(
                task =>
                    task.id === id
            );


        if (!task) return;


        const result =
            await AppAlert.confirm("Delete Task", "Are you sure you want to delete this task? This action cannot be undone.");


        if (!result.isConfirmed) return;


        try {

            AppAlert.loading(
                "Deleting task..."
            );


            await Api.delete(
                `/tasks/${id}`
            );


            AppAlert.close();


            AppAlert.success(
                "Task deleted successfully"
            );


            await loadTasks();

        } catch (error) {

            AppAlert.close();

            AppAlert.error(
                error.message ||
                "Unable to delete task"
            );
        }
    }


    /* ==========================================================
       Location
    ========================================================== */

    function toggleLocation() {

        const enabled =
            document
                .getElementById(
                    "isGeofence"
                )
                .checked;


        const section =
            document.getElementById(
                "locationSection"
            );


        section.classList.toggle(
            "d-none",
            !enabled
        );


        if (enabled) {

            setTimeout(
                initializeMaps,
                100
            );
        }
    }


    function initializeMaps() {

        if (!startMap) {

            startMap =
                L.map("startMap")
                    .setView(
                        [
                            20.5937,
                            78.9629
                        ],
                        5
                    );


            L.tileLayer(
                "https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png",
                {
                    attribution:
                        "&copy; OpenStreetMap",
                }
            ).addTo(startMap);


            startMap.on(
                "click",
                e =>
                    setMarker(
                        "start",
                        e.latlng.lat,
                        e.latlng.lng
                    )
            );
        }


        if (!endMap) {

            endMap =
                L.map("endMap")
                    .setView(
                        [
                            20.5937,
                            78.9629
                        ],
                        5
                    );


            L.tileLayer(
                "https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png",
                {
                    attribution:
                        "&copy; OpenStreetMap",
                }
            ).addTo(endMap);


            endMap.on(
                "click",
                e =>
                    setMarker(
                        "end",
                        e.latlng.lat,
                        e.latlng.lng
                    )
            );
        }


        startMap.invalidateSize();
        endMap.invalidateSize();
    }


    function setMarker(
        type,
        lat,
        lng
    ) {

        const map =
            type === "start"
                ? startMap
                : endMap;


        const marker =
            type === "start"
                ? startMarker
                : endMarker;


        if (marker) {
            map.removeLayer(marker);
        }


        const newMarker =
            L.marker([
                lat,
                lng
            ]).addTo(map);


        if (type === "start") {
            startMarker = newMarker;
        } else {
            endMarker = newMarker;
        }


        document.getElementById(
            `${type}Lat`
        ).value = lat;


        document.getElementById(
            `${type}Lng`
        ).value = lng;
    }


    function setLocation(
        type,
        location
    ) {

        if (!location) return;


        const lat =
            Number(location.lat);

        const lng =
            Number(location.lng);


        if (
            !Number.isFinite(lat) ||
            !Number.isFinite(lng)
        ) {
            return;
        }


        document.getElementById(
            `${type}Lat`
        ).value = lat;


        document.getElementById(
            `${type}Lng`
        ).value = lng;


        document.getElementById(
            `${type}Address`
        ).value =
            location.address || "";


        setTimeout(() => {

            const map =
                type === "start"
                    ? startMap
                    : endMap;


            if (!map) return;


            setMarker(
                type,
                lat,
                lng
            );


            map.setView(
                [
                    lat,
                    lng
                ],
                15
            );

        }, 150);
    }


    function getLocation(type) {

        return {

            address:
                document
                    .getElementById(
                        `${type}Address`
                    )
                    .value
                    .trim(),

            lat:
                Number(
                    document
                        .getElementById(
                            `${type}Lat`
                        )
                        .value
                ),

            lng:
                Number(
                    document
                        .getElementById(
                            `${type}Lng`
                        )
                        .value
                ),
        };
    }


    /* ==========================================================
       Bulk Import
    ========================================================== */

    function openImportModal() {

        document.getElementById(
            "excelFile"
        ).value = "";


        document.getElementById(
            "importPreview"
        ).classList.add(
            "d-none"
        );


        document.getElementById(
            "importTasksBtn"
        ).disabled = true;


        bootstrap.Modal
            .getOrCreateInstance(
                document.getElementById(
                    "importModal"
                )
            )
            .show();
    }


    document.addEventListener(
        "change",
        event => {

            if (
                event.target.id !==
                "excelFile"
            ) {
                return;
            }


            validateExcel(
                event.target.files[0]
            );
        }
    );


    async function validateExcel(file) {

        if (!file) return;


        AppAlert.loading(
            "Reading Excel file..."
        );


        try {

            const buffer =
                await file.arrayBuffer();


            const workbook =
                XLSX.read(
                    buffer,
                    {
                        type: "array",
                    }
                );


            const sheet =
                workbook.Sheets["Tasks"];


            if (!sheet) {

                throw new Error(
                    "Tasks sheet not found"
                );
            }


            const rows =
                XLSX.utils.sheet_to_json(
                    sheet,
                    {
                        defval: "",
                    }
                );


            if (!rows.length) {

                throw new Error(
                    "No tasks found in file"
                );
            }


            if (rows.length > 50) {

                throw new Error(
                    "Maximum 50 tasks can be imported at once"
                );
            }


            const results =
                rows.map(
                    (row, index) =>
                        validateRow(
                            row,
                            index + 2
                        )
                );


            renderImportPreview(
                results
            );


            AppAlert.close();

        } catch (error) {

            AppAlert.close();

            AppAlert.error(
                error.message ||
                "Unable to read Excel file"
            );
        }
    }


    function validateRow(
        row,
        rowNumber
    ) {

        const errors = [];


        const email =
            String(
                row.Email || ""
            ).trim();


        const title =
            String(
                row.Title || ""
            ).trim();


        const description =
            String(
                row.Description || ""
            ).trim();


        const priority =
            String(
                row.Priority || ""
            ).trim();


        if (!title)
            errors.push(
                "Title required"
            );


        if (!description)
            errors.push(
                "Description required"
            );


        if (
            ![
                "Low",
                "Medium",
                "High",
            ].includes(priority)
        ) {
            errors.push(
                "Invalid priority"
            );
        }


        let executive = null;


        if (email) {

            executive =
                executives.find(
                    e =>
                        e.email?.toLowerCase() ===
                        email.toLowerCase()
                );


            if (!executive) {

                errors.push(
                    "Executive not found"
                );
            }
        }


        const start =
            parseExcelDateTime(
                row["Start Date"],
                row["Start Time"]
            );


        const end =
            parseExcelDateTime(
                row["End Date"],
                row["End Time"]
            );


        if (!start)
            errors.push(
                "Invalid start date/time"
            );


        if (!end)
            errors.push(
                "Invalid end date/time"
            );


        if (
            start &&
            end &&
            end <= start
        ) {
            errors.push(
                "End must be after start"
            );
        }


        const isGeofence =
            String(
                row["Is Geofence"] || ""
            ).toLowerCase() === "true";


        if (isGeofence) {

            if (
                !row["Start Latitude"] ||
                !row["Start Longitude"] ||
                !row["End Latitude"] ||
                !row["End Longitude"]
            ) {

                errors.push(
                    "Geofence coordinates required"
                );
            }
        }


        return {

            row: rowNumber,

            email,

            execId:
                executive?.id || "",

            title,

            description,

            priority,

            start,

            end,

            isGeofence,

            startLocation: {
                address:
                    row["Start Address"] || "",
                lat:
                    Number(
                        row["Start Latitude"]
                    ),
                lng:
                    Number(
                        row["Start Longitude"]
                    ),
            },

            endLocation: {
                address:
                    row["End Address"] || "",
                lat:
                    Number(
                        row["End Latitude"]
                    ),
                lng:
                    Number(
                        row["End Longitude"]
                    ),
            },

            errors,
        };
    }


    function renderImportPreview(results) {

        const tbody =
            document.getElementById(
                "importTable"
            );


        const valid =
            results.filter(
                row =>
                    !row.errors.length
            ).length;


        document.getElementById(
            "importSummary"
        ).textContent =
            `${valid} valid / ${results.length - valid} invalid`;


        tbody.innerHTML =
            results.map(row => {

                const ok =
                    !row.errors.length;


                return `
                <tr
                    class="${ok
                        ? "import-row-valid"
                        : "import-row-error"
                    }"
                >

                    <td>${row.row}</td>

                    <td>
                        ${row.email
                        ? escapeHtml(
                            row.email
                        )
                        : `
                                    <span class="text-muted">
                                        Unassigned
                                    </span>
                                `
                    }
                    </td>

                    <td>
                        ${escapeHtml(row.title)}
                    </td>

                    <td>
                        ${escapeHtml(row.priority)}
                    </td>

                    <td>
                        ${formatDateTime(row.start)}
                    </td>

                    <td>
                        ${formatDateTime(row.end)}
                    </td>

                    <td>
                        ${row.isGeofence
                        ? "Geofence"
                        : "None"
                    }
                    </td>

                    <td>
                        ${ok
                        ? `
                                    <span class="text-success">
                                        Valid
                                    </span>
                                `
                        : `
                                    <span class="text-danger">
                                        ${escapeHtml(
                            row.errors.join(
                                ", "
                            )
                        )}
                                    </span>
                                `
                    }
                    </td>

                    <td>

                        <button
                            class="action-btn"
                            onclick="editImportedTask(${row.row})"
                        >
                            <i class="bi bi-pencil"></i>
                        </button>

                    </td>

                </tr>
            `;

            }).join("");


        window.importResults =
            results;


        document
            .getElementById(
                "importPreview"
            )
            .classList.remove(
                "d-none"
            );


        document
            .getElementById(
                "importTasksBtn"
            )
            .disabled =
            valid === 0;
    }


    /* ==========================================================
       Import
    ========================================================== */

    async function importTasks() {

        const valid =
            (window.importResults || [])
                .filter(
                    row =>
                        !row.errors.length
                );


        if (!valid.length) {

            AppAlert.warning(
                "No valid tasks to import"
            );

            return;
        }


        if (valid.length > 50) {

            AppAlert.warning(
                "Maximum 50 tasks allowed"
            );

            return;
        }


        try {

            AppAlert.loading(
                "Importing tasks..."
            );


            for (const row of valid) {

                await Api.post(
                    "/tasks",
                    {

                        title:
                            row.title,

                        description:
                            row.description,

                        priority:
                            row.priority,

                        startDate:
                            row.start.toISOString(),

                        endDate:
                            row.end.toISOString(),

                        assignedTo:
                            row.execId,

                        isGeofence:
                            row.isGeofence,

                        startLocation:
                            row.startLocation,

                        endLocation:
                            row.endLocation,
                    }
                );
            }


            AppAlert.close();


            AppAlert.success(
                `${valid.length} tasks imported successfully`
            );


            bootstrap.Modal
                .getInstance(
                    document.getElementById(
                        "importModal"
                    )
                )
                ?.hide();


            await loadTasks();

        } catch (error) {

            AppAlert.close();

            AppAlert.error(
                error.message ||
                "Task import failed"
            );
        }
    }


    /* ==========================================================
       Template
    ========================================================== */

     function downloadTemplate(event) {

    event?.preventDefault();
    event?.stopPropagation();

    if (typeof XLSX === "undefined") {

        AppAlert.error(
            "Excel library is not loaded"
        );

        return;
    }

    try {

        const workbook =
            XLSX.utils.book_new();


        /* ======================================================
           Common Styles
        ====================================================== */

        const headerStyle = {
            font: {
                bold: true,
                color: {
                    rgb: "1F2937"
                }
            },
            fill: {
                fgColor: {
                    rgb: "E3F2FD"
                }
            },
            alignment: {
                horizontal: "center",
                vertical: "center"
            }
        };

        const instructionStyle = {
            font: {
                bold: true,
                color: {
                    rgb: "92400E"
                }
            },
            fill: {
                fgColor: {
                    rgb: "FFF8E1"
                }
            }
        };


        /* ======================================================
           1. INSTRUCTIONS
        ====================================================== */

        const instructions = [

            ["TeamoTrack Task Import Template"],

            [""],

            ["IMPORTANT"],
            ["Do not modify the header row in the Tasks sheet."],
            ["Only valid tasks will be imported."],
            ["Maximum 50 tasks can be imported at once."],

            [""],

            ["FIELD GUIDELINES"],

            ["Email", "Required. Use an email from the Executives sheet."],
            ["Title", "Required. Task name/title."],
            ["Description", "Required. Task description."],
            ["Priority", "Required. Use Low, Medium or High."],
            ["Start Date", "Required. Format: dd/MM/yyyy."],
            ["End Date", "Required. Format: dd/MM/yyyy."],
            ["Start Time", "Required. 24-hour format, e.g. 09:30."],
            ["End Time", "Required. 24-hour format, e.g. 18:30."],
            ["Is Geofence", "Use true or false."],
            ["Start Latitude", "Required when geofence is true."],
            ["Start Longitude", "Required when geofence is true."],
            ["Start Address", "Required when geofence is true."],
            ["End Latitude", "Required when geofence is true."],
            ["End Longitude", "Required when geofence is true."],
            ["End Address", "Required when geofence is true."],

            [""],

            ["IMPORTANT RULES"],
            ["Cannot create a task for a past start date/time."],
            ["End date/time must be after start date/time."],
            ["Completed, cancelled and failed tasks cannot be edited."],
            ["Unassigned tasks will remain pending."],
            ["Tasks assigned to an executive will become assigned."],

            [""],

            ["HOW TO IMPORT"],
            ["1. Fill the Tasks sheet."],
            ["2. Use the Executives sheet to select a valid executive email."],
            ["3. Use the Priority_Values sheet for allowed priority values."],
            ["4. Save the Excel file."],
            ["5. Upload it using Bulk Upload."],
            ["6. Review and correct invalid rows before importing."]
        ];

        const instructionSheet =
            XLSX.utils.aoa_to_sheet(instructions);

        instructionSheet["!cols"] = [
            { wch: 32 },
            { wch: 90 }
        ];

        /*
         * Style important rows
         */
        [
            0,
            2,
            7,
            25,
            32
        ].forEach(row => {

            const cellA =
                instructionSheet[
                    XLSX.utils.encode_cell({
                        r: row,
                        c: 0
                    })
                ];

            if (cellA) {
                cellA.s = instructionStyle;
            }

        });

        XLSX.utils.book_append_sheet(
            workbook,
            instructionSheet,
            "Instructions"
        );


        /* ======================================================
           2. TASKS
        ====================================================== */

        const headers = [
            "Email",
            "Title",
            "Description",
            "Priority",
            "Start Date",
            "End Date",
            "Start Time",
            "End Time",
            "Is Geofence",
            "Start Latitude",
            "Start Longitude",
            "Start Address",
            "End Latitude",
            "End Longitude",
            "End Address"
        ];

        const exampleRow = [
            "executive@example.com",
            "Visit Client A",
            "Discuss contract terms",
            "High",
            "25/08/2026",
            "25/08/2026",
            "10:00",
            "18:30",
            "false",
            "",
            "",
            "",
            "",
            "",
            ""
        ];

        const taskSheet =
            XLSX.utils.aoa_to_sheet([
                headers,
                exampleRow
            ]);

        taskSheet["!cols"] = [
            { wch: 30 },
            { wch: 30 },
            { wch: 45 },
            { wch: 15 },
            { wch: 18 },
            { wch: 18 },
            { wch: 15 },
            { wch: 15 },
            { wch: 15 },
            { wch: 20 },
            { wch: 20 },
            { wch: 45 },
            { wch: 20 },
            { wch: 20 },
            { wch: 45 }
        ];

        /*
         * Header styling
         */
        headers.forEach((_, column) => {

            const cell =
                taskSheet[
                    XLSX.utils.encode_cell({
                        r: 0,
                        c: column
                    })
                ];

            if (cell) {
                cell.s = headerStyle;
            }

        });

        XLSX.utils.book_append_sheet(
            workbook,
            taskSheet,
            "Tasks"
        );


        /* ======================================================
           3. EXECUTIVES
        ====================================================== */

        const executiveRows = [
            ["Email"]
        ];

        executives.forEach(executive => {

            if (executive.email) {

                executiveRows.push([
                    executive.email
                ]);

            }

        });

        const executiveSheet =
            XLSX.utils.aoa_to_sheet(
                executiveRows
            );

        executiveSheet["!cols"] = [
            { wch: 35 }
        ];

        const executiveHeader =
            executiveSheet["A1"];

        if (executiveHeader) {
            executiveHeader.s = headerStyle;
        }

        XLSX.utils.book_append_sheet(
            workbook,
            executiveSheet,
            "Executives"
        );


        /* ======================================================
           4. PRIORITY VALUES
        ====================================================== */

        const prioritySheet =
            XLSX.utils.aoa_to_sheet([
                ["Allowed Priority Values"],
                ["Low"],
                ["Medium"],
                ["High"]
            ]);

        prioritySheet["!cols"] = [
            { wch: 30 }
        ];

        const priorityHeader =
            prioritySheet["A1"];

        if (priorityHeader) {
            priorityHeader.s = headerStyle;
        }

        XLSX.utils.book_append_sheet(
            workbook,
            prioritySheet,
            "Priority_Values"
        );


        /* ======================================================
           5. FREEZE HEADER ROWS
        ====================================================== */

        taskSheet["!freeze"] = {
            xSplit: 0,
            ySplit: 1
        };

        executiveSheet["!freeze"] = {
            xSplit: 0,
            ySplit: 1
        };

        prioritySheet["!freeze"] = {
            xSplit: 0,
            ySplit: 1
        };


        /* ======================================================
           6. DOWNLOAD
        ====================================================== */

        XLSX.writeFile(
            workbook,
            "TeamoTrack_Task_Template.xlsx"
        );

        AppAlert.success(
            "Task template downloaded successfully"
        );

    } catch (error) {

        console.error(
            "Template generation failed:",
            error
        );

        AppAlert.error(
            "Unable to create task template"
        );
    }
}


    /* ==========================================================
       Helpers
    ========================================================== */

    function setText(
        id,
        value
    ) {

        const element =
            document.getElementById(id);

        if (element) {
            element.textContent =
                value || "-";
        }
    }


    function formatStatus(status) {

        return String(status || "pending")
            .charAt(0)
            .toUpperCase() +
            String(status || "pending")
                .slice(1);
    }


    function formatDateTime(value) {

        if (!value) return "-";


        let date;


        if (
            typeof value === "object" &&
            value._seconds
        ) {

            date =
                new Date(
                    value._seconds * 1000
                );

        } else {

            date =
                new Date(value);
        }


        if (
            Number.isNaN(
                date.getTime()
            )
        ) {
            return "-";
        }


        return date.toLocaleString(
            "en-IN",
            {
                day: "2-digit",
                month: "short",
                year: "numeric",
                hour: "2-digit",
                minute: "2-digit",
            }
        );
    }

    function formatDuration(start, end) {

        if (!start || !end) {
            return "-";
        }

        const startTime =
            new Date(start).getTime();

        const endTime =
            new Date(end).getTime();

        if (
            Number.isNaN(startTime) ||
            Number.isNaN(endTime) ||
            endTime < startTime
        ) {
            return "-";
        }

        const totalMinutes =
            Math.floor(
                (endTime - startTime) / 60000
            );

        const days =
            Math.floor(
                totalMinutes / 1440
            );

        const hours =
            Math.floor(
                (totalMinutes % 1440) / 60
            );

        const minutes =
            totalMinutes % 60;


        const parts = [];

        if (days) {
            parts.push(
                `${days}d`
            );
        }

        if (hours) {
            parts.push(
                `${hours}h`
            );
        }

        if (minutes || !parts.length) {
            parts.push(
                `${minutes}m`
            );
        }

        return parts.join(" ");
    }

    function toDateTimeLocal(value) {

        if (!value) return "";


        const d =
            new Date(value);


        if (
            Number.isNaN(
                d.getTime()
            )
        ) {
            return "";
        }


        const pad =
            n =>
                String(n)
                    .padStart(2, "0");


        return (
            `${d.getFullYear()}-` +
            `${pad(d.getMonth() + 1)}-` +
            `${pad(d.getDate())}T` +
            `${pad(d.getHours())}:` +
            `${pad(d.getMinutes())}`
        );
    }


    function parseExcelDateTime(
        dateValue,
        timeValue
    ) {

        if (
            !dateValue ||
            !timeValue
        ) {
            return null;
        }


        const date =
            String(dateValue)
                .trim()
                .split("/");


        const time =
            String(timeValue)
                .trim()
                .split(":");


        if (
            date.length !== 3 ||
            time.length !== 2
        ) {
            return null;
        }


        const result =
            new Date(
                Number(date[2]),
                Number(date[1]) - 1,
                Number(date[0]),
                Number(time[0]),
                Number(time[1])
            );


        return Number.isNaN(
            result.getTime()
        )
            ? null
            : result;
    }


    function editImportedTask(
        rowNumber
    ) {

        const row =
            (window.importResults || [])
                .find(
                    item =>
                        item.row ===
                        rowNumber
                );


        if (!row) return;


        document.getElementById(
            "taskTitle"
        ).value =
            row.title;


        document.getElementById(
            "description"
        ).value =
            row.description;


        document.getElementById(
            "priority"
        ).value =
            row.priority;


        document.getElementById(
            "startDate"
        ).value =
            toDateTimeLocal(
                row.start
            );


        document.getElementById(
            "endDate"
        ).value =
            toDateTimeLocal(
                row.end
            );


        document.getElementById(
            "assignedTo"
        ).value =
            row.execId || "";


        bootstrap.Modal
            .getOrCreateInstance(
                document.getElementById(
                    "taskModal"
                )
            )
            .show();
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

    window.openTaskDetails =
        openTaskDetails;

    window.openTaskModal =
        openTaskModal;

    window.editTask =
        editTask;

    window.saveTask =
        saveTask;

    window.deleteTask =
        deleteTask;

    window.openImportModal =
        openImportModal;

    window.importTasks =
        importTasks;

    window.downloadTemplate =
        downloadTemplate;

    window.editImportedTask =
        editImportedTask;

})();
