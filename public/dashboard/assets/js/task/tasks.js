/* ==========================================================
   TeamoTrack Tasks
   Loaded after common.js
========================================================== */

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

window.addEventListener("commonReady", () => {

    initializeTasksPage();

});


async function initializeTasksPage() {

    console.log("Initializing tasks page...");

    const month =
        document.getElementById("monthFilter");

    if (!month) return;

    month.value = currentMonth;

    month.addEventListener(
        "change",
        loadTasks
    );

    document.getElementById("searchInput")
        ?.addEventListener(
            "input",
            renderTasks
        );

    document.getElementById("statusFilter")
        ?.addEventListener(
            "change",
            loadTasks
        );

    document.getElementById("isGeofence")
        ?.addEventListener(
            "change",
            toggleLocation
        );

    await loadTasks();
}


/* ==========================================================
   Load
========================================================== */

async function loadTasks() {

    const month =
        document.getElementById("monthFilter").value;

    const [year, monthNumber] =
        month.split("-").map(Number);

    const status = document.getElementById("statusFilter").value;

    try {

        AppAlert.loading("Loading tasks...");

        const params =
            new URLSearchParams({
                year,
                month: monthNumber
            });

        if (status)
            params.set("status", status);

        const data = await Api.get(`/tasks/data?${params}`);

        if (!data) return;

        tasks = data.tasks || [];

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
        document.getElementById("assignedTo");

    if (!select) return;

    select.innerHTML =
        `<option value="">Unassigned</option>`;

    executives.forEach(exec => {

        select.innerHTML += `
            <option value="${exec.id}">
                ${escapeHtml(
            exec.fullName ||
            exec.email ||
            "Unknown"
        )}
            </option>
        `;

    });
}


/* ==========================================================
   Render
========================================================== */

function renderTasks() {

    const search =
        document
            .getElementById("searchInput")
            .value
            .trim()
            .toLowerCase();

    const list =
        tasks.filter(task => {

            return !search ||
                task.title
                    ?.toLowerCase()
                    .includes(search) ||
                task.description
                    ?.toLowerCase()
                    .includes(search);

        });

    document.getElementById("taskCount")
        .textContent = list.length;

    const tbody =
        document.getElementById("taskTable");

    if (!list.length) {

        tbody.innerHTML = `
            <tr>
                <td colspan="7" class="empty-state">
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
                    e => e.id === task.assignedTo
                );

            const status =
                task.status || "pending";

            const priority =
                (task.priority || "Medium")
                    .toLowerCase();

            const start =
                formatDateTime(task.startDate);

            const end =
                formatDateTime(task.endDate);

            return `
                <tr>

                    <td>

                        <div class="task-name">
                            ${escapeHtml(
                task.title || "Untitled"
            )}
                        </div>

                        <div class="task-description">
                            ${escapeHtml(
                task.description || ""
            )}
                        </div>

                    </td>

                    <td>
                        ${executive
                    ? escapeHtml(
                        executive.fullName ||
                        executive.email
                    )
                    : `<span class="text-muted">
                                    Unassigned
                                   </span>`
                }
                    </td>

                    <td>

                        <div class="task-time">
                            ${start}
                        </div>

                        <small class="text-muted">
                            ${end}
                        </small>

                    </td>

                    <td>

                        <span class="priority-badge priority-${priority}">
                            ${escapeHtml(
                    task.priority || "Medium"
                )}
                        </span>

                    </td>

                    <td>

                        ${task.isGeofence
                    ? `<span class="location-badge">
                                    <i class="bi bi-geo-alt me-1"></i>
                                    Geofence
                                   </span>`
                    : `<span class="text-muted">
                                    None
                                   </span>`
                }

                    </td>

                    <td>

                        <span class="status-badge status-${status}">
                            ${formatStatus(status)}
                        </span>

                    </td>

                    <td class="text-end">

    ${['completed', 'cancelled', 'failed'].includes(status)
                    ? ''
                    : `
                <button
                    class="action-btn"
                    title="Edit"
                    onclick="editTask('${task.id}')">

                    <i class="bi bi-pencil"></i>

                </button>
            `
                }

            <button
                class="action-btn"
                title="Delete"
                onclick="deleteTask('${task.id}')">

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

function openTaskModal(id = null) {

    editingId = id;

    document.getElementById("modalTitle")
        .textContent =
        id ? "Edit Task" : "Add Task";

    document.getElementById("saveTaskBtn")
        .textContent =
        id ? "Update Task" : "Save Task";

    if (!id) {

        document.getElementById("taskId").value = "";
        document.getElementById("taskTitle").value = "";
        document.getElementById("description").value = "";
        document.getElementById("priority").value = "Medium";
        document.getElementById("startDate").value = "";
        document.getElementById("endDate").value = "";
        document.getElementById("assignedTo").value = "";
        document.getElementById("isGeofence").checked = false;

    }

    toggleLocation();

    bootstrap.Modal
        .getOrCreateInstance(
            document.getElementById("taskModal")
        )
        .show();
}


/* ==========================================================
   Edit
========================================================== */

function editTask(id) {
    
    const task =
        tasks.find(t => t.id === id);

    if (!task) return;

    if (
        ['completed', 'cancelled', 'failed']
            .includes(task.status)
    ) {

        AppAlert.warning(
            "This task can no longer be edited"
        );

        return;
    }

    document.getElementById("taskId").value = id;

    document.getElementById("taskTitle").value =
        task.title || "";

    document.getElementById("description").value =
        task.description || "";

    document.getElementById("priority").value =
        task.priority || "Medium";

    document.getElementById("startDate").value =
        toDateTimeLocal(task.startDate);

    document.getElementById("endDate").value =
        toDateTimeLocal(task.endDate);

    document.getElementById("assignedTo").value =
        task.assignedTo || "";

    document.getElementById("isGeofence").checked =
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
        document.getElementById("taskTitle")
            .value.trim();

    const description =
        document.getElementById("description")
            .value.trim();

    const startDate =
        document.getElementById("startDate").value;

    const endDate =
        document.getElementById("endDate").value;

    const assignedTo =
        document.getElementById("assignedTo").value;

    if (!title || !description ||
        !startDate || !endDate) {

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
        document.getElementById("isGeofence").checked;

    const body = {

        title,

        description,

        priority:
            document.getElementById("priority").value,

        startDate:
            new Date(startDate).toISOString(),

        endDate:
            new Date(endDate).toISOString(),

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
                : null
    };

    const button =
        document.getElementById("saveTaskBtn");

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

        if (!data) {
            AppAlert.close();
            return;
        }

        AppAlert.close();

        AppAlert.success(
            editingId
                ? "Task updated successfully"
                : "Task created successfully"
        );

        bootstrap.Modal
            .getInstance(
                document.getElementById("taskModal")
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
        tasks.find(t => t.id === id);

    if (!task) return;

    const result =
        await Swal.fire({

            title: "Delete task?",

            text:
                `"${task.title}" will be permanently deleted.`,

            icon: "warning",

            showCancelButton: true,

            confirmButtonText: "Delete",

            cancelButtonText: "Cancel"

        });

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
        document.getElementById(
            "isGeofence"
        ).checked;

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
                    [20.5937, 78.9629],
                    5
                );

        L.tileLayer(
            "https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png",
            {
                attribution:
                    "&copy; OpenStreetMap"
            }
        ).addTo(startMap);

        startMap.on(
            "click",
            e => {

                setMarker(
                    "start",
                    e.latlng.lat,
                    e.latlng.lng
                );

            }
        );
    }

    if (!endMap) {

        endMap =
            L.map("endMap")
                .setView(
                    [20.5937, 78.9629],
                    5
                );

        L.tileLayer(
            "https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png",
            {
                attribution:
                    "&copy; OpenStreetMap"
            }
        ).addTo(endMap);

        endMap.on(
            "click",
            e => {

                setMarker(
                    "end",
                    e.latlng.lat,
                    e.latlng.lng
                );

            }
        );
    }

    startMap.invalidateSize();
    endMap.invalidateSize();
}


function setMarker(type, lat, lng) {

    const map =
        type === "start"
            ? startMap
            : endMap;

    const marker =
        type === "start"
            ? startMarker
            : endMarker;

    if (marker)
        map.removeLayer(marker);

    const newMarker =
        L.marker([lat, lng])
            .addTo(map);

    if (type === "start")
        startMarker = newMarker;
    else
        endMarker = newMarker;

    document.getElementById(
        `${type}Lat`
    ).value = lat;

    document.getElementById(
        `${type}Lng`
    ).value = lng;
}


function setLocation(type, location) {

    if (!location) return;

    const lat =
        Number(location.lat);

    const lng =
        Number(location.lng);

    if (!Number.isFinite(lat) ||
        !Number.isFinite(lng)) {
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
            [lat, lng],
            15
        );

    }, 150);
}


function getLocation(type) {

    return {

        address:
            document.getElementById(
                `${type}Address`
            ).value.trim(),

        lat:
            Number(
                document.getElementById(
                    `${type}Lat`
                ).value
            ),

        lng:
            Number(
                document.getElementById(
                    `${type}Lng`
                ).value
            )

    };
}


/* ==========================================================
   Bulk Upload
========================================================== */

function openImportModal() {

    document.getElementById(
        "excelFile"
    ).value = "";

    document.getElementById(
        "importPreview"
    ).classList.add("d-none");

    document.getElementById(
        "importTasksBtn"
    ).disabled = true;

    bootstrap.Modal
        .getOrCreateInstance(
            document.getElementById("importModal")
        )
        .show();
}


document.addEventListener(
    "change",
    e => {

        if (
            e.target.id !== "excelFile"
        ) return;

        validateExcel(
            e.target.files[0]
        );

    }
);


async function validateExcel(file) {

    if (!file) return;

    AppAlert.loading(
        "Reading Excel file..."
    );

    /*
     * XLSX library should be loaded
     * before this function is used.
     */

    try {

        const buffer =
            await file.arrayBuffer();

        const workbook =
            XLSX.read(
                buffer,
                {
                    type: "array"
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
                    defval: ""
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


function validateRow(row, rowNumber) {

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

    if (!email)
        errors.push("Email required");

    if (!title)
        errors.push("Title required");

    if (!description)
        errors.push(
            "Description required"
        );

    if (
        !["Low", "Medium", "High"]
            .includes(priority)
    ) {
        errors.push(
            "Invalid priority"
        );
    }

    const executive =
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
        errors.push("Invalid start date/time");

    if (!end)
        errors.push("Invalid end date/time");

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
            row["Is Geofence"]
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
                )
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
                )
        },

        errors

    };
}


function renderImportPreview(results) {

    const tbody =
        document.getElementById(
            "importTable"
        );

    const valid =
        results.filter(
            r => !r.errors.length
        ).length;

    document.getElementById(
        "importSummary"
    ).textContent =
        `${valid} valid / ${results.length - valid} invalid`;

    tbody.innerHTML =
        results.map(row => {

            const valid =
                !row.errors.length;

            return `
                <tr class="${valid
                    ? "import-row-valid"
                    : "import-row-error"
                }">

                    <td>${row.row}</td>

                    <td>${escapeHtml(
                    row.email
                )}</td>

                    <td>${escapeHtml(
                    row.title
                )}</td>

                    <td>${escapeHtml(
                    row.priority
                )}</td>

                    <td>
                        ${formatDateTime(
                    row.start
                )}
                    </td>

                    <td>
                        ${formatDateTime(
                    row.end
                )}
                    </td>

                    <td>
                        ${row.isGeofence
                    ? "Geofence"
                    : "None"
                }
                    </td>

                    <td>

                        ${valid
                    ? `<span class="text-success">
                                    Valid
                                   </span>`
                    : `<span class="text-danger">
                                    ${escapeHtml(
                        row.errors.join(
                            ", "
                        )
                    )}
                                   </span>`
                }

                    </td>

                    <td>

                        <button
                            class="action-btn"
                            onclick="editImportedTask(${row.row})">

                            <i class="bi bi-pencil"></i>

                        </button>

                    </td>

                </tr>
            `;

        }).join("");

    window.importResults =
        results;

    document.getElementById(
        "importPreview"
    ).classList.remove(
        "d-none"
    );

    document.getElementById(
        "importTasksBtn"
    ).disabled =
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

        /*
         * Create sequentially to keep
         * backend load controlled.
         */

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
                        row.endLocation
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

function downloadTemplate() {

    /*
     * Keep the template generation server-side
     * later if you want the same template for
     * web + mobile.
     */

    AppAlert.info(
        "Template download will be connected to the task template endpoint."
    );
}


/* ==========================================================
   Helpers
========================================================== */

function formatStatus(status) {

    return status
        .charAt(0)
        .toUpperCase() +
        status.slice(1);
}


function formatDateTime(value) {

    if (!value) return "-";

    const date =
        new Date(value);

    if (Number.isNaN(
        date.getTime()
    )) return "-";

    return date.toLocaleString(
        "en-IN",
        {
            day: "2-digit",
            month: "short",
            year: "numeric",
            hour: "2-digit",
            minute: "2-digit"
        }
    );
}


function toDateTimeLocal(value) {

    if (!value) return "";

    const d =
        new Date(value);

    const pad =
        n => String(n).padStart(2, "0");

    return `${d.getFullYear()}-${pad(
        d.getMonth() + 1
    )}-${pad(
        d.getDate()
    )}T${pad(
        d.getHours()
    )}:${pad(
        d.getMinutes()
    )}`;
}


function parseExcelDateTime(
    dateValue,
    timeValue
) {

    if (!dateValue ||
        !timeValue) {
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

    const day =
        Number(date[0]);

    const month =
        Number(date[1]);

    const year =
        Number(date[2]);

    const hour =
        Number(time[0]);

    const minute =
        Number(time[1]);

    const result =
        new Date(
            year,
            month - 1,
            day,
            hour,
            minute
        );

    return Number.isNaN(
        result.getTime()
    )
        ? null
        : result;
}


function editImportedTask(rowNumber) {

    const row =
        (window.importResults || [])
            .find(
                r =>
                    r.row === rowNumber
            );

    if (!row) return;

    /*
     * Reuse the normal task modal
     * for manual correction.
     */

    document.getElementById(
        "taskTitle"
    ).value = row.title;

    document.getElementById(
        "description"
    ).value = row.description;

    document.getElementById(
        "priority"
    ).value = row.priority;

    document.getElementById(
        "startDate"
    ).value =
        toDateTimeLocal(row.start);

    document.getElementById(
        "endDate"
    ).value =
        toDateTimeLocal(row.end);

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

    return String(value ?? "")
        .replaceAll("&", "&amp;")
        .replaceAll("<", "&lt;")
        .replaceAll(">", "&gt;")
        .replaceAll('"', "&quot;")
        .replaceAll("'", "&#039;");

}