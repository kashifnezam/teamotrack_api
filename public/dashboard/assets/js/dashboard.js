/* ==========================================================
   TeamoTrack Dashboard
   dashboard.js
========================================================== */

(function () {

    "use strict";

    let dashboardMap = null;
    let dashboardMarkers = [];

    /* ==========================================================
       Initialize
    ========================================================== */

    window.initializeDashboard = async function () {

        try {

            highlightCurrentMenu();
            initializeTooltips();
            animateCards();

            initializeEmployeeMap();

            const userData =
                JSON.parse(
                    localStorage.getItem("userData") || "{}"
                );

            const userName = document.getElementById("userName");

            if (userName) {
                userName.textContent =
                    userData.fullName || userData.name || "User";
            }

            AppAlert.loading(
                "Loading dashboard..."
            );

            const data =
                await Api.get("/dashboard/me");

            if (!data) {
                AppAlert.close();
                return;
            }

            populateDashboard(data);

            AppAlert.close();

        } catch (error) {
            console.error(
                "Dashboard loading failed:",
                error
            );

            AppAlert.close();
            AppAlert.error(
                error.message ||
                "Failed to load dashboard"
            );
            window.location.href = "/login";
        }

    }


    /* ==========================================================
       Dashboard Data
    ========================================================== */

    function populateDashboard(data) {

        const {
            total = 0,
            present = 0,
            leave = 0,
            late = 0,
            executives = []
        } = data;

        const absent =
            Math.max(
                total - present - leave,
                0
            );

        const attendance =
            total
                ? Math.round(
                    (present / total) * 100
                )
                : 0;


        /* KPI */

        setText(
            "totalExecutives",
            total
        );

        setText(
            "presentCount",
            present
        );

        setText(
            "leaveCount",
            leave
        );

        setText(
            "lateCount",
            late
        );


        /* Attendance */

        setText(
            "attendancePercent",
            `${attendance}%`
        );

        setText(
            "attendanceCircle",
            attendance
        );

        setText(
            "attendancePresent",
            present
        );

        setText(
            "attendanceAbsent",
            absent
        );

        setText(
            "attendanceLeave",
            leave
        );


        /* Employee map */

        setText(
            "onlineCount",
            `${executives.length} Online`
        );

        updateEmployeeMap(
            executives
        );

    }


    /* ==========================================================
       Employee Map
    ========================================================== */

    function initializeEmployeeMap() {

        const container =
            document.getElementById(
                "employeeMap"
            );

        if (!container) return;

        if (
            typeof L === "undefined"
        ) {
            console.error(
                "Leaflet is not loaded"
            );

            return;
        }

        if (dashboardMap) {
            dashboardMap.remove();
            dashboardMap = null;
        }

        dashboardMap =
            L.map("employeeMap")
                .setView(
                    [28.6139, 77.2090],
                    11
                );


        const street =
            L.tileLayer(
                "https://mt1.google.com/vt/lyrs=m&x={x}&y={y}&z={z}",
                {
                    maxZoom: 19,
                    attribution:
                        "© OpenStreetMap"
                }
            );

        const satellite =
            L.tileLayer(
                "https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}",
                {
                    attribution:
                        "Esri"
                }
            );

        const topo =
            L.tileLayer(
                "https://{s}.tile.opentopomap.org/{z}/{x}/{y}.png",
                {
                    maxZoom: 17,
                    attribution:
                        "OpenTopoMap"
                }
            );

        const dark =
            L.tileLayer(
                "https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png",
                {
                    attribution:
                        "CartoDB"
                }
            );


        street.addTo(
            dashboardMap
        );


        L.control.layers(
            {
                Street: street,
                Satellite: satellite,
                Dark: dark,
                Topographic: topo
            }
        ).addTo(
            dashboardMap
        );


        setTimeout(
            () => {
                dashboardMap?.invalidateSize();
            },
            100
        );

    }


    /* ==========================================================
       Update Employee Markers
    ========================================================== */

    function updateEmployeeMap(
        executives
    ) {

        if (!dashboardMap) return;


        /* Remove old markers */

        dashboardMarkers.forEach(
            marker => {

                dashboardMap.removeLayer(
                    marker
                );

            }
        );

        dashboardMarkers = [];


        const bounds = [];


        executives.forEach(
            exec => {

                const loc =
                    exec.currLoc;

                if (
                    !loc ||
                    !Number.isFinite(
                        Number(loc.lat)
                    ) ||
                    !Number.isFinite(
                        Number(loc.lng)
                    )
                ) {
                    return;
                }


                const lat =
                    Number(loc.lat);

                const lng =
                    Number(loc.lng);


                const marker =
                    L.marker([
                        lat,
                        lng
                    ])
                        .addTo(
                            dashboardMap
                        )
                        .bindPopup(`
                        <strong>
                            ${escapeHtml(
                            exec.fullName
                        )}
                        </strong>
                        <br>
                        Online
                    `);


                dashboardMarkers.push(
                    marker
                );

                bounds.push([
                    lat,
                    lng
                ]);

            }
        );


        if (bounds.length === 1) {

            dashboardMap.setView(
                bounds[0],
                15
            );

        }


        if (bounds.length > 1) {

            dashboardMap.fitBounds(
                bounds,
                {
                    padding: [
                        40,
                        40
                    ]
                }
            );

        }

    }


    /* ==========================================================
       Active Menu
    ========================================================== */

    function highlightCurrentMenu() {

        const currentPath =
            window.location.pathname
                .replace(/\/$/, "") ||
            "/dashboard";


        document
            .querySelectorAll(".menu-item")
            .forEach(item => {

                item.classList.remove(
                    "active",
                    "open"
                );

            });


        document
            .querySelectorAll(".menu a")
            .forEach(link => {

                const href =
                    link.getAttribute(
                        "href"
                    );

                if (
                    !href ||
                    href === "#"
                ) {
                    return;
                }


                const path =
                    href.replace(
                        /\/$/,
                        ""
                    );


                if (
                    path !== currentPath
                ) {
                    return;
                }


                link.classList.add(
                    "active"
                );


                const menuItem =
                    link.closest(
                        ".menu-item"
                    );

                menuItem?.classList.add(
                    "active"
                );


                const parent =
                    link.closest(
                        ".has-submenu"
                    );

                parent?.classList.add(
                    "active",
                    "open"
                );

            });

    }


    /* ==========================================================
       Card Animation
    ========================================================== */

    function animateCards() {

        if (
            typeof IntersectionObserver ===
            "undefined"
        ) {
            return;
        }


        const observer =
            new IntersectionObserver(
                entries => {

                    entries.forEach(
                        entry => {

                            if (
                                !entry.isIntersecting
                            ) {
                                return;
                            }

                            entry.target.classList.add(
                                "fade-up"
                            );

                            observer.unobserve(
                                entry.target
                            );

                        }
                    );

                },
                {
                    threshold: 0.15
                }
            );


        document
            .querySelectorAll(
                ".card-ui, .welcome-card"
            )
            .forEach(
                card =>
                    observer.observe(card)
            );

    }


    /* ==========================================================
       Bootstrap Tooltips
    ========================================================== */

    function initializeTooltips() {

        if (
            typeof bootstrap ===
            "undefined"
        ) {
            return;
        }


        document
            .querySelectorAll(
                '[data-bs-toggle="tooltip"]'
            )
            .forEach(
                el => {

                    bootstrap.Tooltip
                        .getOrCreateInstance(
                            el
                        );

                }
            );

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
                value;
        }

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
})();