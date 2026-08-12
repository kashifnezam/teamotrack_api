/* ==========================================================
   TeamoTrack SPA
   app.js
========================================================== */

if (window.TeamoTrackApp) {

    console.warn(
        "TeamoTrack app.js already loaded."
    );

} else {

    window.TeamoTrackApp = true;


    const App = {

        currentPath: null,

        loadedScripts:
            window.__TT_LOADED_SCRIPTS ||
            new Set(),

        loadedCss:
            window.__TT_LOADED_CSS ||
            new Set(),


        /* ==================================================
           INIT
        ================================================== */

        async init() {

            if (this.initialized) {
                return;
            }

            this.initialized = true;

            console.log(
                "Initializing TeamoTrack..."
            );

            try {

                await this.loadShell();

                this.bindNavigation();

                await this.navigate(
                    window.location.pathname,
                    false
                );

                console.log(
                    "TeamoTrack initialized"
                );

            } catch (error) {

                console.error(
                    "Application initialization failed:",
                    error
                );

            }

        },


        /* ==================================================
           STATIC SHELL
        ================================================== */

        async loadShell() {

            await Promise.all([

                loadComponent(
                    "sidebar-container",
                    "/dashboard/components/sidebar.html"
                ),

                loadComponent(
                    "header-container",
                    "/dashboard/components/header.html"
                )

            ]);


            initializeSidebar();

            initializeTheme();

            initializeRipple();


            document.body.classList.remove(
                "app-loading"
            );


            document.body.classList.add(
                "app-ready"
            );

        },


        /* ==================================================
           NAVIGATION
        ================================================== */

        bindNavigation() {

            if (this.navigationBound) {
                return;
            }

            this.navigationBound = true;


            document.addEventListener(
                "click",
                event => {

                    const link =
                        event.target.closest("a[href]");

                    if (!link) return;

                    /*
                     * Only handle real SPA navigation links.
                     */
                    if (
                        link.target === "_blank" ||
                        link.hasAttribute("download")
                    ) {
                        return;
                    }

                    const href =
                        link.getAttribute("href");

                    if (
                        !href ||
                        href === "#" ||
                        href.startsWith("#") ||
                        href.startsWith("http://") ||
                        href.startsWith("https://") ||
                        href.startsWith("mailto:") ||
                        href.startsWith("tel:")
                    ) {
                        return;
                    }

                    const url =
                        new URL(
                            href,
                            window.location.origin
                        );

                    if (
                        url.origin !==
                        window.location.origin
                    ) {
                        return;
                    }

                    event.preventDefault();

                    if (window.innerWidth <= 992) {

                        document.body.classList.remove(
                            "sidebar-open"
                        );

                    }

                    this.navigate(
                        url.pathname
                    );

                }
            );


            window.addEventListener(
                "popstate",
                () => {

                    this.navigate(
                        window.location.pathname,
                        false
                    );

                }
            );

        },


        /* ==================================================
           NAVIGATE
        ================================================== */

        async navigate(
            path,
            push = true
        ) {

            path =
                path.replace(
                    /\/$/,
                    ""
                ) || "/dashboard";


            if (
                this.currentPath === path
            ) {
                return;
            }


            const page =
                this.getPage(path);


            if (!page) {

                load404();

                return;

            }


            if (push) {

                history.pushState(
                    {},
                    "",
                    path
                );

            }


            this.currentPath =
                path;


            updatePageHeader(
                page.title,
                page.description
            );


            const content =
                document.getElementById(
                    "page-content"
                );


            if (!content) {
                return;
            }


            content.innerHTML =
                `<div class="page-loader"></div>`;


            try {

                /* ======================================
                   HTML
                ====================================== */

                const response =
                    await fetch(
                        page.html
                    );


                if (!response.ok) {

                    throw new Error(
                        `Unable to load ${page.html}`
                    );

                }


                content.innerHTML =
                    await response.text();


                /* ======================================
                   CSS
                ====================================== */

                await this.loadPageCss(
                    page.css
                );


                /* ======================================
                   JS
                ====================================== */

                await this.loadPageScript(
                    page.js
                );


                /* ======================================
                   INITIALIZE
                ====================================== */

                const initializer =
                    window[page.init];


                if (
                    typeof initializer !==
                    "function"
                ) {

                    throw new Error(
                        `Initializer not found: ${page.init}`
                    );

                }


                await initializer();


                /* ======================================
                   SIDEBAR
                ====================================== */

                setActiveMenu();


                /* ======================================
                   RIPPLE
                ====================================== */

                initializeRipple();


            } catch (error) {

                console.error(
                    "Page loading failed:",
                    error
                );


                content.innerHTML = `

                    <div class="empty-state">

                        <h5>
                            Unable to load page
                        </h5>

                        <p>
                            ${escapeHtml(
                    error.message
                )}
                        </p>

                    </div>

                `;

            }

        },


        /* ==================================================
           PAGE SCRIPT
        ================================================== */

        loadPageScript(script) {

            if (!script) {
                return Promise.resolve();
            }


            if (
                this.loadedScripts.has(script)
            ) {

                return Promise.resolve();

            }


            const existing =
                document.querySelector(
                    `script[data-page-script="${script}"]`
                );


            if (existing) {

                this.loadedScripts.add(
                    script
                );

                return Promise.resolve();

            }


            return new Promise(
                (resolve, reject) => {

                    const element =
                        document.createElement(
                            "script"
                        );


                    element.src =
                        script;


                    element.dataset.pageScript =
                        script;


                    element.onload =
                        () => {

                            this.loadedScripts.add(
                                script
                            );

                            console.log(
                                "Loaded:",
                                script
                            );

                            resolve();

                        };


                    element.onerror =
                        () => {

                            reject(
                                new Error(
                                    `Unable to load ${script}`
                                )
                            );

                        };


                    document.body.appendChild(
                        element
                    );

                }
            );

        },


        /* ==================================================
           PAGE CSS
        ================================================== */

        loadPageCss(css) {

            if (!css) {
                return Promise.resolve();
            }


            if (
                this.loadedCss.has(css)
            ) {

                return Promise.resolve();

            }


            const existing =
                document.querySelector(
                    `link[data-page-css="${css}"]`
                );


            if (existing) {

                this.loadedCss.add(
                    css
                );

                return Promise.resolve();

            }


            return new Promise(
                (resolve, reject) => {

                    const link =
                        document.createElement(
                            "link"
                        );


                    link.rel =
                        "stylesheet";


                    link.href =
                        css;


                    link.dataset.pageCss =
                        css;


                    link.onload =
                        () => {

                            this.loadedCss.add(
                                css
                            );

                            resolve();

                        };


                    link.onerror =
                        () => {

                            reject(
                                new Error(
                                    `Unable to load ${css}`
                                )
                            );

                        };


                    document.head.appendChild(
                        link
                    );

                }
            );

        },


        /* ==================================================
           PAGES
        ================================================== */

        getPage(path) {

            const pages = {

                "/dashboard": {

                    html:
                        "/dashboard/pages/dashboard.html",

                    js:
                        "/dashboard/assets/js/dashboard.js",

                    css:
                        null,

                    init:
                        "initializeDashboard",

                    title:
                        "Dashboard",

                    description:
                        "Welcome back! Here's what's happening today."

                },


                "/tasks": {

                    html:
                        "/dashboard/pages/task/tasks.html",

                    js:
                        "/dashboard/assets/js/task/tasks.js",

                    css:
                        "/dashboard/assets/css/task/tasks.css",

                    init:
                        "initializeTasksPage",

                    title:
                        "Tasks",

                    description:
                        "Manage and track your team's tasks."

                },


                "/executives": {

                    html:
                        "/dashboard/pages/team/executives.html",

                    js:
                        "/dashboard/assets/js/team/executives.js",

                    css:
                        "/dashboard/assets/css/team/executives.css",

                    init:
                        "initializeExecutivesPage",

                    title:
                        "Executives",

                    description:
                        "Manage your field executives."

                },


                "/teams": {

                    html:
                        "/dashboard/pages/team/teams.html",

                    js:
                        "/dashboard/assets/js/team/teams.js",

                    css:
                        "/dashboard/assets/css/team/teams.css",

                    init:
                        "initializeTeamsPage",

                    title:
                        "Teams",

                    description:
                        "Manage your teams and members."

                },


                "/shifts": {

                    html:
                        "/dashboard/pages/team/shifts.html",

                    js:
                        "/dashboard/assets/js/team/shifts.js",

                    css:
                        "/dashboard/assets/css/team/shifts.css",

                    init:
                        "initializeShiftsPage",

                    title:
                        "Shifts",

                    description:
                        "Manage executive shifts and schedules."

                }

            };


            return pages[path] || null;

        }

    };


    window.App = App;


    /* ======================================================
       COMPONENT
    ====================================================== */

    async function loadComponent(
        elementId,
        file
    ) {

        const element =
            document.getElementById(
                elementId
            );


        if (!element) {

            throw new Error(
                `#${elementId} not found`
            );

        }


        const response =
            await fetch(file);


        if (!response.ok) {

            throw new Error(
                `Unable to load ${file}`
            );

        }


        element.innerHTML =
            await response.text();

    }


    /* ======================================================
       HEADER
    ====================================================== */

    function updatePageHeader(
        title,
        description
    ) {

        const titleElement =
            document.getElementById(
                "pageTitle"
            );


        const descriptionElement =
            document.getElementById(
                "pageDescription"
            );


        if (titleElement) {

            titleElement.textContent =
                title;

        }


        if (descriptionElement) {

            descriptionElement.textContent =
                description;

        }

    }


    /* ======================================================
       ACTIVE MENU
    ====================================================== */

    function setActiveMenu() {

        const currentPath =
            window.location.pathname
                .replace(/\/$/, "") ||
            "/dashboard";


        document
            .querySelectorAll(
                ".menu-item"
            )
            .forEach(item => {

                item.classList.remove(
                    "active",
                    "open"
                );

            });


        document
            .querySelectorAll(
                ".submenu a"
            )
            .forEach(link => {

                link.classList.remove(
                    "active"
                );

            });


        document
            .querySelectorAll(
                ".menu-link[href]"
            )
            .forEach(link => {

                if (
                    link.getAttribute("href") ===
                    currentPath
                ) {

                    link
                        .closest(".menu-item")
                        ?.classList.add(
                            "active"
                        );

                }

            });


        document
            .querySelectorAll(
                ".submenu a"
            )
            .forEach(link => {

                if (
                    link.getAttribute("href") !==
                    currentPath
                ) {
                    return;
                }


                link.classList.add(
                    "active"
                );


                link
                    .closest(".has-submenu")
                    ?.classList.add(
                        "active",
                        "open"
                    );

            });

    }


    /* ======================================================
       RIPPLE
    ====================================================== */

    function initializeRipple() {

        document
            .querySelectorAll(
                ".ripple"
            )
            .forEach(button => {

                button.onclick =
                    function (event) {

                        const circle =
                            document.createElement(
                                "span"
                            );


                        const diameter =
                            Math.max(
                                this.clientWidth,
                                this.clientHeight
                            );


                        circle.style.width =
                            `${diameter}px`;

                        circle.style.height =
                            `${diameter}px`;


                        circle.style.left =
                            `${event.offsetX - diameter / 2}px`;

                        circle.style.top =
                            `${event.offsetY - diameter / 2}px`;


                        circle.className =
                            "ripple-circle";


                        this.appendChild(
                            circle
                        );


                        setTimeout(
                            () =>
                                circle.remove(),
                            500
                        );

                    };

            });

    }


    /* ======================================================
       404
    ====================================================== */

    function load404() {

        const content =
            document.getElementById(
                "page-content"
            );


        if (!content) {
            return;
        }


        content.innerHTML = `

            <div class="empty-state">

                <h4>
                    Page not found
                </h4>

                <p>
                    The requested page does not exist.
                </p>

                <a
                    href="/dashboard"
                    class="btn btn-primary"
                >
                    Go to Dashboard
                </a>

            </div>

        `;

    }


    /* ======================================================
       ESCAPE
    ====================================================== */

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


    /* ======================================================
       START
    ====================================================== */

    if (
        document.readyState ===
        "loading"
    ) {

        document.addEventListener(
            "DOMContentLoaded",
            () => App.init(),
            {
                once: true
            }
        );

    } else {

        App.init();

    }

}