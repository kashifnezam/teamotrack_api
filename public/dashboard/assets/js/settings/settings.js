/* ==========================================================
   TeamoTrack Settings
========================================================== */

(function () {

    "use strict";


    let data = null;


    window.initializeProfilePage = async function () {

        AppAlert.loading(
            "Loading profile..."
        );

        await loadSettings();

        AppAlert.close();

        renderProfile();

    };


    window.initializeCompanyPage = async function () {

        AppAlert.loading(
            "Loading company..."
        );

        await loadSettings();

        AppAlert.close();

        renderCompany();

        document
            .getElementById("logoInput")
            ?.addEventListener(
                "change",
                uploadLogo
            );

    };


    window.initializeRolesPage = async function () {

        AppAlert.loading(
            "Loading permissions..."
        );

        await loadSettings();

        AppAlert.close();

        renderPermissions();

    };


    async function loadSettings() {

        try {

            data =
                await Api.get(
                    "/settings/data"
                );

        } catch (error) {

            AppAlert.close();

            AppAlert.error(
                error.message ||
                "Unable to load settings"
            );

        }

    }


    function renderProfile() {

        const profile =
            data?.profile;

        if (!profile) return;

        const fullName =
            document.getElementById("fullName");

        const email =
            document.getElementById("email");

        const mobile =
            document.getElementById("mobile");

        const role =
            document.getElementById("role");


        if (fullName)
            fullName.value =
                profile.fullName || "";

        if (email)
            email.value =
                profile.email || "";

        if (mobile)
            mobile.value =
                profile.mobile || "";

        if (role)
            role.value =
                profile.role || "";

    }


    function renderCompany() {

        const company =
            data?.company;

        if (!company) return;

        const businessName =
            document.getElementById(
                "businessName"
            );

        if (businessName) {

            businessName.value =
                company.businessName || "";

        }

        renderLogo(
            company.logo
        );

    }


    function renderPermissions() {

        const permissions =
            data?.permissions || {};

        [
            "canCreateTask",
            "canEditTask",
            "canDeleteTask",
            "canApproveLeave",
            "canMarkAttendance",
        ].forEach(key => {

            const input =
                document.getElementById(key);

            if (input) {

                input.checked =
                    permissions[key] === true;

            }

        });

    }


    window.saveProfile = async function () {

        const button =
            document.getElementById(
                "saveProfileBtn"
            );

        const fullName =
            document.getElementById(
                "fullName"
            )?.value.trim();


        if (!fullName) {

            AppAlert.warning(
                "Name is required"
            );

            return;

        }


        try {

            button.disabled = true;

            AppAlert.loading(
                "Saving profile..."
            );


            await Api.patch(
                "/settings/profile",
                { fullName }
            );


            AppAlert.close();

            AppAlert.success(
                "Profile updated successfully"
            );

        } catch (error) {

            AppAlert.close();

            AppAlert.error(
                error.message ||
                "Unable to update profile"
            );

        } finally {

            button.disabled = false;

        }

    };


    window.saveCompany = async function () {

        const button =
            document.getElementById(
                "saveCompanyBtn"
            );

        const businessName =
            document.getElementById(
                "businessName"
            )?.value.trim();


        if (!businessName) {

            AppAlert.warning(
                "Company name is required"
            );

            return;

        }


        try {

            button.disabled = true;

            AppAlert.loading(
                "Saving company..."
            );


            await Api.patch(
                "/settings/company",
                { businessName }
            );


            AppAlert.close();

            AppAlert.success(
                "Company updated successfully"
            );

        } catch (error) {

            AppAlert.close();

            AppAlert.error(
                error.message ||
                "Unable to update company"
            );

        } finally {

            button.disabled = false;

        }

    };


    window.savePermissions = async function () {

        const button =
            document.getElementById(
                "savePermissionsBtn"
            );


        const permissions = {

            canCreateTask:
                document.getElementById(
                    "canCreateTask"
                )?.checked || false,

            canEditTask:
                document.getElementById(
                    "canEditTask"
                )?.checked || false,

            canDeleteTask:
                document.getElementById(
                    "canDeleteTask"
                )?.checked || false,

            canApproveLeave:
                document.getElementById(
                    "canApproveLeave"
                )?.checked || false,

            canMarkAttendance:
                document.getElementById(
                    "canMarkAttendance"
                )?.checked || false,

        };


        try {

            button.disabled = true;

            AppAlert.loading(
                "Saving permissions..."
            );


            await Api.patch(
                "/settings/permissions",
                permissions
            );


            AppAlert.close();

            AppAlert.success(
                "Permissions updated successfully"
            );

        } catch (error) {

            AppAlert.close();

            AppAlert.error(
                error.message ||
                "Unable to update permissions"
            );

        } finally {

            button.disabled = false;

        }

    };


    window.changeCompanyLogo = function () {

        document
            .getElementById("logoInput")
            ?.click();

    };


    async function uploadLogo(event) {

        const file =
            event.target.files?.[0];

        if (!file) return;


        try {

            AppAlert.loading(
                "Uploading logo..."
            );


            const form =
                new FormData();

            form.append(
                "logo",
                file
            );


            const token =
                await window.Api.getHeaders();


            const response =
                await fetch(
                    "/settings/company/logo",
                    {
                        method: "POST",
                        headers: {
                            Authorization:
                                token.Authorization
                        },
                        body: form
                    }
                );


            const result =
                await response.json();


            if (!response.ok) {

                throw new Error(
                    result?.message ||
                    "Upload failed"
                );

            }


            renderLogo(
                result.logo
            );

            AppAlert.close();

            AppAlert.success(
                "Company logo updated"
            );

        } catch (error) {

            AppAlert.close();

            AppAlert.error(
                error.message ||
                "Unable to upload logo"
            );

        }

    }


    function renderLogo(url) {

        const logo =
            document.getElementById(
                "companyLogo"
            );

        if (!logo) return;


        if (!url) {

            logo.innerHTML =
                '<i class="bi bi-building"></i>';

            return;

        }


        logo.innerHTML = `
            <img
                src="${escapeHtml(url)}"
                alt="Company Logo"
            >
        `;

    }


    function escapeHtml(value) {

        return String(value ?? "")
            .replaceAll("&", "&amp;")
            .replaceAll("<", "&lt;")
            .replaceAll(">", "&gt;")
            .replaceAll('"', "&quot;")
            .replaceAll("'", "&#039;");

    }

})();