/* ==========================================================
   TeamoTrack Theme
   theme.js
========================================================== */

const THEME_KEY = "teamotrack-theme";

/* ==========================================================
   Initialize Theme
========================================================== */

function initializeTheme() {

    const savedTheme =
        localStorage.getItem(THEME_KEY) || "light";

    applyTheme(savedTheme);

    const themeButton =
        document.getElementById("themeToggle");

    if (!themeButton) return;

    themeButton.addEventListener("click", toggleTheme);

}

/* ==========================================================
   Toggle Theme
========================================================== */

function toggleTheme() {

    const current =
        document.documentElement.getAttribute(
            "data-theme"
        ) || "light";

    const next =
        current === "light"
            ? "dark"
            : "light";

    applyTheme(next);

    localStorage.setItem(
        THEME_KEY,
        next
    );

}

/* ==========================================================
   Apply Theme
========================================================== */

function applyTheme(theme) {

    document.documentElement.setAttribute(
        "data-theme",
        theme
    );

    updateThemeIcon(theme);

}

/* ==========================================================
   Update Theme Icon
========================================================== */

function updateThemeIcon(theme) {

    const icon =
        document.querySelector(
            "#themeToggle i"
        );

    if (!icon) return;

    icon.className =
        theme === "dark"
            ? "bi bi-sun-fill"
            : "bi bi-moon-stars";

}

/* ==========================================================
   Optional Theme API
========================================================== */

function getCurrentTheme() {

    return document.documentElement.getAttribute(
        "data-theme"
    ) || "light";

}