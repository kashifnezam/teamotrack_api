/* ==========================================================
   TeamoTrack Dashboard
   dashboard.js
========================================================== */

document.addEventListener("DOMContentLoaded", async () => {

    const token = localStorage.getItem("token");

    if (!token) {
        window.location.href = "/login";
        return;
    }

    try {

        const result = await Api.get("/dashboard/me", {
            headers: {
                Authorization: `Bearer ${token}`
            }
        });

        console.log("Dashboard User:", result);

        // Example
        document.getElementById("userEmail").innerText =
            result.email;

    } catch (error) {

        console.error("Dashboard authentication failed:", error);

    }
});

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

// Default Location
const map = L.map('employeeMap').setView([28.6139,77.2090],11);

// Layers
const street = L.tileLayer(
'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png',
{
    maxZoom:19,
    attribution:'© OpenStreetMap'
});

const satellite = L.tileLayer(
'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}',
{
    attribution:'Esri'
});

const topo = L.tileLayer(
'https://{s}.tile.opentopomap.org/{z}/{x}/{y}.png',
{
    maxZoom:17,
    attribution:'OpenTopoMap'
});

const dark = L.tileLayer(
'https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png',
{
    attribution:'CartoDB'
});

street.addTo(map);

// Employee Locations
const employees = [
    {
        name:"John",
        lat:28.6139,
        lng:77.2090
    },
    {
        name:"Sarah",
        lat:28.6210,
        lng:77.2250
    },
    {
        name:"Rahul",
        lat:28.6045,
        lng:77.1945
    }
];

employees.forEach(emp=>{

    L.marker([emp.lat,emp.lng])
        .addTo(map)
        .bindPopup(`<b>${emp.name}</b><br>Online`);

});

// Layer Switcher
L.control.layers({

    "Street":street,
    "Satellite":satellite,
    "Dark":dark,
    "Topographic":topo

}).addTo(map);