/* ==========================================================
   TeamoTrack Sidebar
   sidebar.js
========================================================== */

function initializeSidebar() {

    const sidebar =
        document.getElementById(
            "sidebar"
        );

    const toggle =
        document.getElementById(
            "sidebarToggle"
        );

    if (!sidebar) return;


    /* ======================================================
       Toggle
    ====================================================== */

    toggle?.addEventListener(
        "click",
        () => {

            if (
                window.innerWidth <= 992
            ) {

                document.body.classList.toggle(
                    "sidebar-open"
                );

            } else {

                document.body.classList.toggle(
                    "sidebar-collapsed"
                );

            }

        }
    );


    /* ======================================================
       Overlay
    ====================================================== */

    let overlay =
        document.querySelector(
            ".sidebar-overlay"
        );


    if (!overlay) {

        overlay =
            document.createElement(
                "div"
            );

        overlay.className =
            "sidebar-overlay";

        document.body.appendChild(
            overlay
        );

    }


    overlay.onclick =
        () => {

            document.body.classList.remove(
                "sidebar-open"
            );

        };


    /* ======================================================
       Submenus
    ====================================================== */

    document
        .querySelectorAll(
            ".has-submenu > .menu-link"
        )
        .forEach(link => {

            link.onclick =
                () => {

                    const parent =
                        link.parentElement;


                    document
                        .querySelectorAll(
                            ".has-submenu.open"
                        )
                        .forEach(item => {

                            if (
                                item !== parent
                            ) {

                                item.classList.remove(
                                    "open"
                                );

                            }

                        });


                    parent.classList.toggle(
                        "open"
                    );

                };

        });


    /* ======================================================
       Resize
    ====================================================== */

    window.addEventListener(
        "resize",
        () => {

            if (
                window.innerWidth > 992
            ) {

                document.body.classList.remove(
                    "sidebar-open"
                );

            }

        }
    );


    setActiveMenu();

}