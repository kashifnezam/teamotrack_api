/* ==========================================================
   TeamoTrack Settings
========================================================== */

(function () {

    "use strict";


    let data = null;


    // ==================================================
    // PROFILE PAGE
    // ==================================================

    window.initializeProfilePage =
        async function () {

            AppAlert.loading(
                "Loading profile..."
            );


            await loadSettings();


            AppAlert.close();


            renderProfile();

        };


    // ==================================================
    // ORGANIZATION PAGE
    // ==================================================

    window.initializeCompanyPage =
        async function () {

            AppAlert.loading(
                "Loading organization..."
            );


            await loadSettings();


            AppAlert.close();


            renderCompany();


            document
                .getElementById(
                    "logoInput",
                )
                ?.addEventListener(
                    "change",
                    uploadLogo,
                );

        };


    // ==================================================
    // LOAD SETTINGS
    // ==================================================

    async function loadSettings() {

        try {

            data =
                await Api.get(
                    "/settings/data",
                );

        } catch (error) {

            AppAlert.close();


            AppAlert.error(
                error?.message ||
                "Unable to load settings",
            );

        }

    }


    // ==================================================
    // PROFILE
    // ==================================================

    function renderProfile() {

        const profile =
            data?.profile;


        if (!profile) {

            return;

        }


        const fullName =
            document.getElementById(
                "fullName",
            );


        const email =
            document.getElementById(
                "email",
            );


        const mobile =
            document.getElementById(
                "mobile",
            );


        const role =
            document.getElementById(
                "role",
            );


        if (fullName) {

            fullName.value =
                profile.fullName ||
                "";

        }


        if (email) {

            email.value =
                profile.email ||
                "";

        }


        if (mobile) {

            mobile.value =
                profile.mobile ||
                "";

        }


        if (role) {

            role.value =
                profile.role ||
                "";

        }

    }

    // ==================================================
    // ORGANIZATION
    // ==================================================

    function renderCompany() {

        const company =
            data?.company;


        if (!company) {

            return;

        }


        const fields = {

            businessName:
                company.businessName,

            legalName:
                company.legalName,

            organizationEmail:
                company.email,

            organizationPhone:
                company.phone,

            organizationWebsite:
                company.website,

            organizationAddress:
                company.address,

            organizationCity:
                company.city,

            organizationState:
                company.state,

            organizationCountry:
                company.country,

            organizationPostalCode:
                company.postalCode,

        };


        Object.entries(fields)
            .forEach(
                ([id, value]) => {

                    const element =
                        document.getElementById(
                            id,
                        );


                    if (element) {

                        element.value =
                            value || '';

                    }

                },
            );


        renderLogo(
            company.logo,
        );

    }


    // ==================================================
    // SAVE PROFILE
    // ==================================================

    window.saveProfile =
        async function () {

            const button =
                document.getElementById(
                    "saveProfileBtn",
                );


            const fullName =
                document
                    .getElementById(
                        "fullName",
                    )
                    ?.value
                    .trim();


            if (!fullName) {

                AppAlert.warning(
                    "Name is required",
                );

                return;

            }


            try {

                button.disabled =
                    true;


                AppAlert.loading(
                    "Saving profile...",
                );


                await Api.patch(
                    "/settings/profile",
                    {
                        fullName,
                    },
                );


                AppAlert.close();


                AppAlert.success(
                    "Profile updated successfully",
                );


                if (data?.profile) {

                    data.profile.fullName =
                        fullName;

                }

            } catch (error) {

                AppAlert.close();


                AppAlert.error(
                    error?.message ||
                    "Unable to update profile",
                );

            } finally {

                button.disabled =
                    false;

            }

        };


    // ==================================================
    // SAVE ORGANIZATION
    // ==================================================

    window.saveCompany =
        async function () {

            const button =
                document.getElementById(
                    "saveCompanyBtn",
                );


            const dto = {

                businessName:
                    document
                        .getElementById(
                            "businessName",
                        )
                        ?.value
                        .trim(),

                legalName:
                    document
                        .getElementById(
                            "legalName",
                        )
                        ?.value
                        .trim(),

                email:
                    document
                        .getElementById(
                            "organizationEmail",
                        )
                        ?.value
                        .trim(),

                phone:
                    document
                        .getElementById(
                            "organizationPhone",
                        )
                        ?.value
                        .trim(),

                website:
                    document
                        .getElementById(
                            "organizationWebsite",
                        )
                        ?.value
                        .trim(),

                address:
                    document
                        .getElementById(
                            "organizationAddress",
                        )
                        ?.value
                        .trim(),

                city:
                    document
                        .getElementById(
                            "organizationCity",
                        )
                        ?.value
                        .trim(),

                state:
                    document
                        .getElementById(
                            "organizationState",
                        )
                        ?.value
                        .trim(),

                country:
                    document
                        .getElementById(
                            "organizationCountry",
                        )
                        ?.value
                        .trim(),

                postalCode:
                    document
                        .getElementById(
                            "organizationPostalCode",
                        )
                        ?.value
                        .trim(),

            };


            if (!dto.businessName) {

                AppAlert.warning(
                    "Organization name is required",
                );

                return;

            }


            try {

                button.disabled =
                    true;


                AppAlert.loading(
                    "Saving organization...",
                );


                await Api.patch(
                    "/settings/company",
                    dto,
                );


                AppAlert.close();


                AppAlert.success(
                    "Organization updated successfully",
                );


                if (data?.company) {

                    Object.assign(
                        data.company,
                        dto,
                    );

                }

            } catch (error) {

                AppAlert.close();


                AppAlert.error(
                    error?.message ||
                    "Unable to update organization",
                );

            } finally {

                button.disabled =
                    false;

            }

        };


    // ==================================================
    // CHANGE ORGANIZATION LOGO
    // ==================================================

    window.changeCompanyLogo =
        function () {

            document
                .getElementById(
                    "logoInput",
                )
                ?.click();

        };


    // ==================================================
    // UPLOAD LOGO
    // ==================================================

    async function uploadLogo(
        event,
    ) {

        const file =
            event.target.files?.[0];


        if (!file) {

            return;

        }


        try {

            AppAlert.loading(
                "Uploading organization logo...",
            );


            const form =
                new FormData();


            form.append(
                "logo",
                file,
            );


            const token =
                await window.Api.getHeaders();


            const response =
                await fetch(
                    "/settings/company/logo",
                    {
                        method:
                            "POST",

                        headers: {

                            Authorization:
                                token.Authorization,

                        },

                        body:
                            form,

                    },
                );


            const result =
                await response.json();


            if (!response.ok) {

                throw new Error(
                    result?.message ||
                    "Upload failed",
                );

            }


            renderLogo(
                result.logo,
            );


            if (data?.company) {

                data.company.logo =
                    result.logo;

            }


            AppAlert.close();


            AppAlert.success(
                "Organization logo updated",
            );

        } catch (error) {

            AppAlert.close();


            AppAlert.error(
                error?.message ||
                "Unable to upload logo",
            );

        }

    }


    // ==================================================
    // RENDER LOGO
    // ==================================================

    function renderLogo(
        url,
    ) {

        const logo =
            document.getElementById(
                "companyLogo",
            );


        if (!logo) {

            return;

        }


        if (!url) {

            logo.innerHTML =
                `
                    <i class="bi bi-building"></i>
                `;

            return;

        }


        logo.innerHTML =
            `
                <img
                    src="${escapeHtml(url)}"
                    alt="Organization Logo"
                >
            `;

    }


    // ==================================================
    // ESCAPE HTML
    // ==================================================

    function escapeHtml(
        value,
    ) {

        return String(
            value ?? "",
        )
            .replaceAll(
                "&",
                "&amp;",
            )
            .replaceAll(
                "<",
                "&lt;",
            )
            .replaceAll(
                ">",
                "&gt;",
            )
            .replaceAll(
                '"',
                "&quot;",
            )
            .replaceAll(
                "'",
                "&#039;",
            );

    }

})();