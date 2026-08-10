/* ==========================================================
   TeamoTrack Sidebar
   sidebar.js
========================================================== */
function initializeSidebar() {

    const sidebar = document.getElementById("sidebar");
    const toggle = document.getElementById("sidebarToggle");

    if (!sidebar) return;

    /* =========================
       Sidebar Toggle
    ========================= */

    toggle?.addEventListener("click", () => {

        if (window.innerWidth <= 992) {
            document.body.classList.toggle("sidebar-open");
        } else {
            document.body.classList.toggle("sidebar-collapsed");
        }

    });


    /* =========================
       Mobile Overlay
    ========================= */

    let overlay = document.querySelector(".sidebar-overlay");

    if (!overlay) {

        overlay = document.createElement("div");
        overlay.className = "sidebar-overlay";

        document.body.appendChild(overlay);

    }

    overlay.onclick = () => {
        document.body.classList.remove("sidebar-open");
    };


    /* =========================
       Submenus
    ========================= */

    document
        .querySelectorAll(".has-submenu > .menu-link")
        .forEach(link => {

            link.onclick = () => {

                const parent = link.parentElement;

                document
                    .querySelectorAll(".has-submenu.open")
                    .forEach(item => {

                        if (item !== parent)
                            item.classList.remove("open");

                    });

                parent.classList.toggle("open");
            };

        });


    /* =========================
       Active Page
    ========================= */

    setActiveMenu();


    /* =========================
       Close Mobile Sidebar
    ========================= */

    document
        .querySelectorAll(".submenu a, .menu > li > a")
        .forEach(link => {

            link.addEventListener("click", () => {

                if (window.innerWidth <= 992) {
                    document.body.classList.remove("sidebar-open");
                }

            });

        });


    window.addEventListener("resize", () => {

        if (window.innerWidth > 992) {
            document.body.classList.remove("sidebar-open");
        }

    });

}


/* =========================
   Active Menu
========================= */

function setActiveMenu() {

    const currentPath =
        window.location.pathname.replace(/\/$/, "") ||
        "/dashboard";

    // Clear previous state
    document
        .querySelectorAll(".menu-item")
        .forEach(item => {
            item.classList.remove("active", "open");
        });

    document
        .querySelectorAll(".submenu a")
        .forEach(link => {
            link.classList.remove("active");
        });


    // Dashboard / direct menu links
    document
        .querySelectorAll(".menu-link[href]")
        .forEach(link => {

            const href = link.getAttribute("href");

            if (!href || href === "#") return;

            const path =
                href.replace(/\/$/, "") || "/dashboard";

            if (path === currentPath) {

                link
                    .closest(".menu-item")
                    ?.classList.add("active");

            }

        });


    // Submenu links
    document
        .querySelectorAll(".submenu a")
        .forEach(link => {

            const href = link.getAttribute("href");

            if (!href || href === "#") return;

            const path =
                href.replace(/\/$/, "");

            if (path !== currentPath) return;

            // Child selected
            link.classList.add("active");

            // Parent selected + opened
            const parent =
                link.closest(".has-submenu");

            parent?.classList.add(
                "active",
                "open"
            );

        });

}