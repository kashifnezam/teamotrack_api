/* ==========================================================
   TeamoTrack
   app.js
   Main Application Bootstrap
========================================================== */

document.addEventListener("DOMContentLoaded", async () => {

    await loadComponent(
        "sidebar-container",
        "../components/sidebar.html"
    );

    await loadComponent(
        "header-container",
        "../components/header.html"
    );
    initializeSidebar();

    initializeDashboard();

    initializeTheme();

    initializeRipple();

});

/* ==========================================================
   Load HTML Component
========================================================== */

async function loadComponent(elementId, file) {

    try {

        const response = await fetch(file);

        if (!response.ok) {
            throw new Error(`Unable to load ${file}`);
        }

        const html = await response.text();

        document.getElementById(elementId).innerHTML = html;

    } catch (error) {

        console.error(error);

    }

}

/* ==========================================================
   Ripple Effect
========================================================== */

function initializeRipple() {

    document.querySelectorAll(".ripple").forEach(button => {

        button.addEventListener("click", function (e) {

            const circle = document.createElement("span");

            const diameter = Math.max(
                this.clientWidth,
                this.clientHeight
            );

            circle.style.width = diameter + "px";
            circle.style.height = diameter + "px";

            circle.style.left =
                e.offsetX - diameter / 2 + "px";

            circle.style.top =
                e.offsetY - diameter / 2 + "px";

            circle.classList.add("ripple-circle");

            this.appendChild(circle);

            setTimeout(() => {

                circle.remove();

            }, 500);

        });

    });

}