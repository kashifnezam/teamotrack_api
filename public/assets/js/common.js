

/* =========================================
   COMMON JS
   Include this file on every page
   ========================================= */

(function () {

    const scripts = [

        
        // SweetAlert
        "../vendor/sweetalert2/sweetalert2.min.js",
        "../../assets/js/bootstrap.min.js",
        "../../assets/js/alert.js",

        
        "../../assets/js/api.js",

        // Common dashboard/application scripts
        "../../dashboard/assets/js/theme.js",
        "../../dashboard/assets/js/sidebar.js",
        "../../dashboard/assets/js/loader.js",
        "../../dashboard/assets/js/app.js"
    ];

    function loadScript(src) {
        return new Promise((resolve, reject) => {

            const script = document.createElement("script");

            script.src = src;

            script.onload = () => {
                resolve();
            };

            script.onerror = () => {
                reject(new Error(`Failed to load: ${src}`));
            };

            document.body.appendChild(script);
        });
    }

    async function loadCommonScripts() {

        try {

            for (const src of scripts) {
                await loadScript(src);
            }

            console.log("All common scripts loaded");

            /*
             * Tell page-specific scripts that
             * common.js is completely ready.
             */
            window.dispatchEvent(
                new Event("commonReady")
            );

        } catch (error) {

            console.error(
                "Common scripts initialization failed:",
                error
            );

        }

    }
    
    loadCommonScripts();

})();
