
/* ==========================================================
   TeamoTrack
   alert.js
   Centralized SweetAlert2 Application Alerts
   ========================================================== */

const AppAlert = {

    /* ======================================================
       Base Configuration
       ====================================================== */

    base() {

        return {
            target: document.body,
            heightAuto: false,
            backdrop: true,
            allowOutsideClick: true,
            allowEscapeKey: true
        };

    },


    /* ======================================================
       Success
       ====================================================== */

    success(message, title = "Success") {

        return Swal.fire({

            ...this.base(),

            title: title,
            text: message,
            icon: "success",

            confirmButtonColor: "#3085d6",
            confirmButtonText: "OK"

        });

    },


    /* ======================================================
       Error
       ====================================================== */

    error(message, title = "Error") {

        return Swal.fire({

            ...this.base(),

            title: title,
            text: message,
            icon: "error",

            confirmButtonColor: "#d33",
            confirmButtonText: "OK"

        });

    },


    /* ======================================================
       Warning
       ====================================================== */

    warning(message, title = "Warning") {

        return Swal.fire({

            ...this.base(),

            title: title,
            text: message,
            icon: "warning",

            confirmButtonColor: "#f8bb86",
            confirmButtonText: "OK"

        });

    },


    /* ======================================================
       Information
       ====================================================== */

    info(message, title = "Information") {

        return Swal.fire({

            ...this.base(),

            title: title,
            text: message,
            icon: "info",

            confirmButtonColor: "#3085d6",
            confirmButtonText: "OK"

        });

    },


    /* ======================================================
       Confirmation
       ====================================================== */

    async confirm(
        message,
        title = "Are you sure?"
    ) {

        const result = await Swal.fire({

            ...this.base(),

            title: title,
            text: message,
            icon: "warning",

            showCancelButton: true,

            confirmButtonColor: "#3085d6",
            cancelButtonColor: "#d33",

            confirmButtonText: "Yes",
            cancelButtonText: "Cancel",

            reverseButtons: true

        });

        return result.isConfirmed;

    },


    /* ======================================================
       Delete Confirmation
       ====================================================== */

    async deleteConfirm(
        message = "You won't be able to revert this!",
        title = "Are you sure?"
    ) {

        const result = await Swal.fire({

            ...this.base(),

            title: title,
            text: message,
            icon: "warning",

            showCancelButton: true,

            confirmButtonColor: "#3085d6",
            cancelButtonColor: "#d33",

            confirmButtonText: "Yes, delete it!",
            cancelButtonText: "Cancel",

            reverseButtons: true

        });

        if (result.isConfirmed) {

            await Swal.fire({

                ...this.base(),

                title: "Deleted!",
                text: "The item has been deleted.",
                icon: "success",

                confirmButtonColor: "#3085d6",
                confirmButtonText: "OK"

            });

            return true;
        }

        return false;

    },


    /* ======================================================
       Loading
       ====================================================== */

    loading(message = "Loading...") {

        // Remove existing loader
        this.close();


        const loader =
            document.createElement("div");

        loader.id = "appLoading";

        loader.className =
            "app-loading-overlay";


        loader.innerHTML = `

            <div class="app-loading-popup">

                <div class="lds-roller">

                    <div></div>
                    <div></div>
                    <div></div>
                    <div></div>
                    <div></div>
                    <div></div>
                    <div></div>
                    <div></div>

                </div>

                <div class="app-loading-message">
                    ${this.escapeHtml(message)}
                </div>

            </div>

        `;


        document.body.appendChild(loader);


        document.body.classList.add(
            "app-loading-active"
        );

    },


    /* ======================================================
    Close Loading
    ====================================================== */

    close() {

        const loader =
            document.getElementById(
                "appLoading"
            );


        if (loader) {

            loader.remove();

        }


        document.body.classList.remove(
            "app-loading-active"
        );

    },


    /* ======================================================
    Escape HTML
    ====================================================== */

    escapeHtml(value) {

        return String(value)
            .replaceAll("&", "&amp;")
            .replaceAll("<", "&lt;")
            .replaceAll(">", "&gt;")
            .replaceAll('"', "&quot;")
            .replaceAll("'", "&#039;");

    },


    /* ======================================================
       Toast
       ====================================================== */

    toast(
        message,
        icon = "success"
    ) {

        return Swal.fire({

            ...this.base(),

            toast: true,

            position: "top-end",

            icon: icon,

            title: message,

            showConfirmButton: false,

            timer: 3000,

            timerProgressBar: true

        });

    }

};
