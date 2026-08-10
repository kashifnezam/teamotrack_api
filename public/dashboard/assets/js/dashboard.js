/* ==========================================================
   TeamoTrack Dashboard
   dashboard.js
========================================================== */

function escapeHtml(value) {
    return String(value)
        .replaceAll("&", "&amp;")
        .replaceAll("<", "&lt;")
        .replaceAll(">", "&gt;")
        .replaceAll('"', "&quot;")
        .replaceAll("'", "&#039;");
}

window.addEventListener(
    "commonReady",
    async () => {

        
        try {
            const userData =
            JSON.parse(
                localStorage.getItem("userData") || "{}"
            );
            document.getElementById("userName").textContent = userData.user?.name || "User";
           
            AppAlert.loading(
                "Loading dashboard..."
            );


            console.log(
                "Loading dashboard..."
            );


            const data =
                await Api.get(
                    "/dashboard/me"
                );


            if (!data) return;


            populateDashboard(data);

            initializeDashboard();

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

        }

    },
    { once: true }
);

function populateDashboard(data) {

    const {
        total = 0,
        present = 0,
        leave = 0,
        late = 0,
        executives = []
    } = data;

    const absent = Math.max(total - present - leave, 0);

    const attendance =
        total ? Math.round((present / total) * 100) : 0;

    // KPI
    document.getElementById("totalExecutives").textContent = total;
    document.getElementById("presentCount").textContent = present;
    document.getElementById("leaveCount").textContent = leave;
    document.getElementById("lateCount").textContent = late;

    // Attendance
    document.getElementById("attendancePercent").textContent =
        `${attendance}%`;

    document.getElementById("attendanceCircle").textContent =
        attendance;

    document.getElementById("attendancePresent").textContent =
        present;

    document.getElementById("attendanceAbsent").textContent =
        absent;

    document.getElementById("attendanceLeave").textContent =
        leave;

    // Map
    document.getElementById("onlineCount").textContent =
        `${executives.length} Online`;

    updateEmployeeMap(executives);
}

function updateEmployeeMap(executives) {

    const bounds = [];

    executives.forEach(exec => {

        const loc = exec.currLoc;

        if (!loc?.lat || !loc?.lng) return;

        const marker = L.marker([
            loc.lat,
            loc.lng
        ])
            .addTo(map)
            .bindPopup(`
            <strong>${escapeHtml(exec.fullName)}</strong>
            <br>
            Online
        `);

        bounds.push([
            loc.lat,
            loc.lng
        ]);
    });

    if (bounds.length === 1) {
        map.setView(bounds[0], 15);
    }

    if (bounds.length > 1) {
        map.fitBounds(bounds, {
            padding: [40, 40]
        });
    }
}


function initializeDashboard() {

    highlightCurrentMenu();

    animateCards();

    initializeTooltips();

}

/* ==========================================================
   Highlight Active Menu
========================================================== */

function highlightCurrentMenu() {

    const currentPage = window.location.pathname
        .split("/")
        .pop();

    document
        .querySelectorAll(".menu a")
        .forEach(link => {

            const href = link.getAttribute("href");

            if (
                href &&
                href !== "#" &&
                href.endsWith(currentPage)
            ) {

                document
                    .querySelectorAll(".menu-item.active")
                    .forEach(item =>
                        item.classList.remove("active")
                    );

                const menuItem =
                    link.closest(".menu-item");

                if (menuItem) {

                    menuItem.classList.add("active");

                }

                const parent =
                    link.closest(".has-submenu");

                if (parent) {

                    parent.classList.add("open");

                }

                link.classList.add("active");

            }

        });

}

/* ==========================================================
   Card Animation
========================================================== */

function animateCards() {

    const observer = new IntersectionObserver(

        entries => {

            entries.forEach(entry => {

                if (entry.isIntersecting) {

                    entry.target.classList.add(
                        "fade-up"
                    );

                    observer.unobserve(entry.target);

                }

            });

        },

        {
            threshold: 0.15
        }

    );

    document
        .querySelectorAll(
            ".card-ui, .welcome-card"
        )
        .forEach(card => {

            observer.observe(card);

        });

}

/* ==========================================================
   Bootstrap Tooltips
========================================================== */

function initializeTooltips() {

    if (
        typeof bootstrap === "undefined"
    ) return;

    document
        .querySelectorAll(
            '[data-bs-toggle="tooltip"]'
        )
        .forEach(el => {

            new bootstrap.Tooltip(el);

        });

}

// ==========================================================
// Leaflet Map Initialization
// =========================================================
// Layers


// Employee Locations
const map = L.map("employeeMap").setView(
    [28.6139, 77.2090],
    11
);

const street = L.tileLayer(
    'https://mt1.google.com/vt/lyrs=m&x={x}&y={y}&z={z}',
    {
        maxZoom: 19,
        attribution: "© OpenStreetMap"
    }
);

const satellite = L.tileLayer(
    "https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}",
    {
        attribution: "Esri"
    }
);

const topo = L.tileLayer(
    "https://{s}.tile.opentopomap.org/{z}/{x}/{y}.png",
    {
        maxZoom: 17,
        attribution: "OpenTopoMap"
    }
);

const dark = L.tileLayer(
    "https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png",
    {
        attribution: "CartoDB"
    }
);

street.addTo(map);

L.control.layers({
    "Street": street,
    "Satellite": satellite,
    "Dark": dark,
    "Topographic": topo
}).addTo(map);

// Layer Switcher
L.control.layers({

    "Street": street,
    "Satellite": satellite,
    "Dark": dark,
    "Topographic": topo

}).addTo(map);