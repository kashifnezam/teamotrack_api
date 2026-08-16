(function () {

    "use strict";


    let executives = [];
    let records = [];


    window.initializeAttendancePage = async function () {

        setCurrentMonth();

        document
            .getElementById("attendanceLoadBtn")
            ?.addEventListener(
                "click",
                loadAttendance
            );

        await loadExecutives();

    };


async function loadExecutives() {

    try {

        const data =
            await Api.get("/executives/data");

        if (!data) return;

        executives =
            data.executives || [];

        const select =
            document.getElementById(
                "attendanceExecutive"
            );

        if (!select) return;

        select.innerHTML = `
            <option value="">
                Select Executive
            </option>
        `;

        executives
            .filter(e => e.isActive !== false)
            .forEach(executive => {

                select.insertAdjacentHTML(
                    "beforeend",
                    `
                    <option value="${executive.id}">
                        ${escapeHtml(
                            executive.fullName
                        )}
                    </option>
                    `
                );

            });

    } catch (error) {

        console.error(error);

        AppAlert.error(
            error.message ||
            "Unable to load executives"
        );

    }

}


    async function loadAttendance() {

        const executiveId =
            document.getElementById(
                "attendanceExecutive"
            ).value;

        const monthValue =
            document.getElementById(
                "attendanceMonth"
            ).value;


        if (!executiveId) {

            AppAlert.warning(
                "Please select an executive"
            );

            return;

        }


        if (!monthValue) {

            AppAlert.warning(
                "Please select a month"
            );

            return;

        }


        const [
            year,
            month
        ] = monthValue
            .split("-")
            .map(Number);


        try {

            AppAlert.loading(
                "Loading attendance..."
            );


            const data =
                await Api.post(
                    "/attendance/data",
                    {
                        executiveId,
                        month,
                        year
                    }
                );


            AppAlert.close();


            if (!data) return;


            records =
                data.records || [];


            renderSummary(
                data.summary || {}
            );

            renderRecords();


        } catch (error) {

            console.error(error);

            AppAlert.close();

            AppAlert.error(
                error.message ||
                "Unable to load attendance"
            );

        }

    }


    function renderSummary(summary) {

        setText(
            "presentCount",
            summary.totalPresent || 0
        );

        setText(
            "lateCount",
            summary.totalLate || 0
        );

        setText(
            "halfDayCount",
            summary.totalHalfDay || 0
        );

        setText(
            "weeklyOffCount",
            summary.totalWeeklyOff || 0
        );

        setText(
            "absentCount",
            summary.totalAbsent || 0
        );

        setText(
            "workingTime",
            formatMinutes(
                summary.totalWorkingMinutes || 0
            )
        );

    }


    function renderRecords() {

        const tbody =
            document.getElementById(
                "attendanceTable"
            );

        setText(
            "attendanceCount",
            `${records.length} Records`
        );


        if (!records.length) {

            tbody.innerHTML = `
                <tr>
                    <td
                        colspan="5"
                        class="empty-state"
                    >
                        No attendance records found
                    </td>
                </tr>
            `;

            return;

        }


        tbody.innerHTML =
            records.map(record => {

                return `
                    <tr>

                        <td>
                            ${formatDate(record.date)}
                        </td>

                        <td>
                            ${formatTime(
                                record.checkInTime
                            )}
                        </td>

                        <td>
                            ${formatTime(
                                record.checkOutTime
                            )}
                        </td>

                        <td>
                            ${formatMinutes(
                                record.workingMinutes
                            )}
                        </td>

                        <td>
                            ${statusBadge(
                                record.status
                            )}
                        </td>

                    </tr>
                `;

            }).join("");

    }


    function statusBadge(status) {

        const labels = {
            present: "Present",
            late: "Late",
            half_day: "Half Day",
            weekly_off: "Weekly Off",
            absent: "Absent"
        };

        return `
            <span class="attendance-status status-${status}">
                ${labels[status] || status}
            </span>
        `;

    }


    function formatDate(value) {

        if (!value) return "--";

        const date =
            toDate(value);

        if (!date) return "--";

        return date.toLocaleDateString(
            "en-IN",
            {
                day: "2-digit",
                month: "short",
                year: "numeric"
            }
        );

    }


    function formatTime(value) {

        if (!value) return "--";

        const date =
            toDate(value);

        if (!date) return "--";

        return date.toLocaleTimeString(
            "en-IN",
            {
                hour: "2-digit",
                minute: "2-digit",
                hour12: true
            }
        );

    }


    function toDate(value) {

        if (!value) return null;

        if (
            typeof value === "object" &&
            value._seconds
        ) {

            return new Date(
                value._seconds * 1000
            );

        }

        const date =
            new Date(value);

        return isNaN(date)
            ? null
            : date;

    }


    function formatMinutes(minutes) {

        const hrs =
            Math.floor(minutes / 60);

        const mins =
            minutes % 60;

        return `${hrs}h ${mins}m`;

    }


    function setCurrentMonth() {

        const now = new Date();

        document.getElementById(
            "attendanceMonth"
        ).value =
            `${now.getFullYear()}-${String(
                now.getMonth() + 1
            ).padStart(2, "0")}`;

    }


    function setText(id, value) {

        const element =
            document.getElementById(id);

        if (element) {
            element.textContent = value;
        }

    }


    function escapeHtml(value) {

        return String(value ?? "")
            .replaceAll("&", "&amp;")
            .replaceAll("<", "&lt;")
            .replaceAll(">", "&gt;")
            .replaceAll('"', "&quot;")
            .replaceAll("'", "&#039;");

    }

})();