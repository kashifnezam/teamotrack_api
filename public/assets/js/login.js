// ==========================================================
// TeamoTrack
// login.js
// Login Page
// ==========================================================

import {
    loginUser
} from "./auth.js";


console.log(
    "Login.js loaded"
);


// ==========================================================
// Login Initialization
// ==========================================================

function initializeLogin() {

    console.log(
        "Login page initialized"
    );


    const form =
        document.getElementById(
            "loginForm"
        );


    const email =
        document.getElementById(
            "email"
        );


    const password =
        document.getElementById(
            "password"
        );


    const loginBtn =
        document.getElementById(
            "loginBtn"
        );


    // ======================================================
    // Validate Elements
    // ======================================================

    if (
        !form ||
        !email ||
        !password ||
        !loginBtn
    ) {

        console.error(
            "Login form elements not found.",
            {
                form,
                email,
                password,
                loginBtn
            }
        );

        return;

    }


    console.log(
        "Login form found"
    );


    // ======================================================
    // Login Alert
    // ======================================================

    const loginAlert =
        sessionStorage.getItem(
            "loginAlert"
        );


    if (loginAlert) {

        AppAlert.warning(
            loginAlert,
            "Login Required"
        );


        sessionStorage.removeItem(
            "loginAlert"
        );

    }


    // ======================================================
    // Login Submit
    // ======================================================

    form.addEventListener(
        "submit",
        async function (e) {

            e.preventDefault();


            console.log(
                "Login form submitted"
            );


            loginBtn.disabled = true;


            loginBtn.innerHTML = `
                <span
                    class="spinner-border spinner-border-sm me-2"
                    aria-hidden="true"
                ></span>
                Signing in...
            `;


            try {

                /*
                 * Firebase Authentication
                 */
                const result =
                    await loginUser(
                        email.value.trim(),
                        password.value
                    );


                console.log(
                    "Firebase login successful"
                );


                /*
                 * ==================================================
                 * Ask NestJS to authorize this Firebase user.
                 * ==================================================
                 */

                const response =
                    await fetch(
                        "/auth/me",
                        {
                            method: "GET",

                            headers: {
                                "Authorization":
                                    `Bearer ${result.token}`
                            }
                        }
                    );


                const userData =
                    await response.json();


                if (!response.ok) {

                    throw new Error(
                        userData?.message ||
                        "You are not authorized to access this dashboard."
                    );

                }


                /*
                 * Store application user data.
                 *
                 * This is NOT the authentication token.
                 */
                localStorage.setItem(
                    "userData",
                    JSON.stringify(
                        userData
                    )
                );


                console.log(
                    "Application authorization successful"
                );


                await AppAlert.success(
                    "Login successful. Welcome back!",
                    "Welcome!"
                );


                window.location.href =
                    "/dashboard";


            } catch (error) {

                console.error(
                    "LOGIN ERROR:",
                    error
                );


                await AppAlert.error(
                    error?.message ||
                    "Unable to login. Please try again.",
                    "Login Failed"
                );

            } finally {

                loginBtn.disabled =
                    false;


                loginBtn.innerHTML =
                    "Login";

            }

        }
    );


    // ======================================================
    // Password Visibility
    // ======================================================

    const togglePassword =
        document.getElementById(
            "togglePassword"
        );


    if (togglePassword) {

        togglePassword.addEventListener(
            "click",
            () => {

                const icon =
                    togglePassword
                        .querySelector("i");


                if (
                    password.type ===
                    "password"
                ) {

                    password.type =
                        "text";


                    icon.classList.remove(
                        "bi-eye-slash"
                    );


                    icon.classList.add(
                        "bi-eye"
                    );

                } else {

                    password.type =
                        "password";


                    icon.classList.remove(
                        "bi-eye"
                    );


                    icon.classList.add(
                        "bi-eye-slash"
                    );

                }

            }
        );

    }


    console.log(
        "Login initialization completed"
    );

}


initializeLogin();