/* ==========================================================
   TeamoTrack
   login.js
   Login Page
   ========================================================== */

console.log("Login.js loaded");


/* ==========================================================
   Login Initialization
   ========================================================== */

function initializeLogin() {

    console.log(
        "Login page initialized"
    );


    const form =
        document.getElementById("loginForm");

    const email =
        document.getElementById("email");

    const password =
        document.getElementById("password");

    const loginBtn =
        document.getElementById("loginBtn");


    /* ======================================================
       Validate Elements
       ====================================================== */

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


    /* ======================================================
       Dashboard Redirect Alert
       ====================================================== */

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


    /* ======================================================
       Login Submit
       ====================================================== */

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

                console.log(
                    "Sending login request..."
                );


                const response = await fetch(
                "/auth/login",
                {
                    method: "POST",

                    credentials: "include",

                    headers: {
                        "Content-Type":
                            "application/json"
                    },

                    body: JSON.stringify({
                        email:
                            email.value.trim(),

                        password:
                            password.value
                    })
                }
            );


            const result =
                await response.json();


            console.log(
                "Login response:",
                result
            );


            if (!response.ok) {

                throw new Error(
                    result?.message ||
                    "Invalid email or password."
                );
            }


            if (result?.success) {

                console.log(
                    "Login successful"
                );

                // Store user information only.
                // DO NOT store the authentication token.
                if (result.user) {

                    localStorage.setItem(
                        "userData",
                        JSON.stringify(result.user)
                    );

                }


                await AppAlert.success(
                    "Login successful. Welcome back!",
                    "Welcome!"
                );


                window.location.href =
                    "/dashboard";


                return;
            }


            throw new Error(
                result?.message ||
                "Login failed."
            );


            } catch (error) {

                console.error(
                    "LOGIN ERROR:",
                    error
                );


                await AppAlert.error(
                    error?.message ||
                    "Unable to connect to server. Please try again.",
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


    /* ======================================================
       Password Visibility
       ====================================================== */

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


/* ==========================================================
   Start Login
   ========================================================== */

initializeLogin();