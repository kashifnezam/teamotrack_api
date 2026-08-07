/* ==========================================================
   TeamoTrack Sidebar
   sidebar.js
========================================================== */

function initializeSidebar() {

    const sidebarToggle = document.getElementById("sidebarToggle");
    const sidebar = document.getElementById("sidebar");

    if (!sidebar) return;

    /* ==========================================
       Desktop Collapse
    ========================================== */

    if (sidebarToggle) {

        sidebarToggle.addEventListener("click", () => {

            if (window.innerWidth <= 992) {

                document.body.classList.toggle("sidebar-open");

            } else {

                document.body.classList.toggle("sidebar-collapsed");

            }

        });

    }

    /* ==========================================
       Overlay
    ========================================== */

    let overlay = document.querySelector(".sidebar-overlay");

    if (!overlay) {

        overlay = document.createElement("div");

        overlay.className = "sidebar-overlay";

        document.body.appendChild(overlay);

    }

    overlay.addEventListener("click", () => {

        document.body.classList.remove("sidebar-open");

    });

    /* ==========================================
       Expandable Menus
    ========================================== */

    document.querySelectorAll(".has-submenu > .menu-link")
        .forEach(menu => {

            menu.addEventListener("click", () => {

                const parent = menu.parentElement;

                document
                    .querySelectorAll(".has-submenu.open")
                    .forEach(item => {

                        if (item !== parent) {
                            item.classList.remove("open");
                        }

                    });

                parent.classList.toggle("open");

            });

        });

    /* ==========================================
       Active Submenu
    ========================================== */

    document.querySelectorAll(".submenu a")
        .forEach(link => {

            link.addEventListener("click", () => {

                document
                    .querySelectorAll(".submenu a.active")
                    .forEach(item => {

                        item.classList.remove("active");

                    });

                link.classList.add("active");

            });

        });

    /* ==========================================
       Keyboard Accessibility
    ========================================== */

    document.querySelectorAll(".menu-link")
        .forEach(link => {

            link.setAttribute("tabindex", "0");

            link.addEventListener("keydown", e => {

                if (
                    e.key === "Enter" ||
                    e.key === " "
                ) {

                    e.preventDefault();

                    link.click();

                }

            });

        });

    /* ==========================================
       Resize Handler
    ========================================== */

    window.addEventListener("resize", () => {

        if (window.innerWidth > 992) {

            document.body.classList.remove("sidebar-open");

        }

    });

}