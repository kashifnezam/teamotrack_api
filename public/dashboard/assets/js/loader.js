/* ==========================================================
   TeamoTrack Loader
   loader.js
========================================================== */

/* ==========================================================
   Page Loader
========================================================== */

window.addEventListener("load", () => {

    hidePageLoader();

});

/* ==========================================================
   Show Loader
========================================================== */

function showPageLoader() {

    let loader = document.getElementById("pageLoader");

    if (loader) {

        loader.style.display = "flex";

        requestAnimationFrame(() => {

            loader.style.opacity = "1";

        });

    }

}

/* ==========================================================
   Hide Loader
========================================================== */

function hidePageLoader() {

    const loader =
        document.getElementById("pageLoader");

    if (!loader) return;

    loader.style.opacity = "0";

    setTimeout(() => {

        loader.style.display = "none";

    }, 300);

}

/* ==========================================================
   Create Loader Dynamically
========================================================== */

document.addEventListener("DOMContentLoaded", () => {

    if (document.getElementById("pageLoader")) return;

    const loader = document.createElement("div");

    loader.id = "pageLoader";

    loader.innerHTML = `
        <div class="tt-loader">
            <div class="spinner-border text-primary"
                 role="status">
            </div>
        </div>
    `;

    Object.assign(loader.style, {

        position: "fixed",
        inset: "0",
        display: "flex",
        justifyContent: "center",
        alignItems: "center",
        background: "#ffffff",
        zIndex: "99999",
        transition: "opacity .3s ease"

    });

    document.body.appendChild(loader);

});