const form = document.getElementById("loginForm");

const email = document.getElementById("email");
const password = document.getElementById("password");

const errorMessage = document.getElementById("errorMessage");

form.addEventListener("submit", async function (e) {

    e.preventDefault();

    errorMessage.classList.add("d-none");

    try {

        console.log("Sending login request...");

        const result = await Api.post("/auth/login", {
            email: email.value.trim(),
            password: password.value
        });

        console.log("Login response:", result);

        if (result.token) {

            localStorage.setItem("token", result.token);

            window.location.href = "/dashboard";

        } else {

            errorMessage.innerText =
                result.message || "Login failed.";

            errorMessage.classList.remove("d-none");
        }

    } catch (e) {

        console.error("LOGIN ERROR:", e);

        errorMessage.innerText =
            e?.message || "Unable to connect to server.";

        errorMessage.classList.remove("d-none");
    }
});