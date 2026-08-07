const form = document.getElementById("loginForm");

const email = document.getElementById("email");
const password = document.getElementById("password");

const errorMessage = document.getElementById("errorMessage");

form.addEventListener("submit", async function (e) {

    e.preventDefault();

    errorMessage.classList.add("d-none");

    try {

        const result = await Api.post("/auth/login", {
            email: email.value.trim(),
            password: password.value
        });

        if (result.token) {

            localStorage.setItem("token", result.token);

            window.location.href = "/dashboard/pages/dashboard.html";

        } else {

            errorMessage.innerText = result.message;

            errorMessage.classList.remove("d-none");

        }

    } catch (e) {

        errorMessage.innerText = "Unable to connect to server.";

        errorMessage.classList.remove("d-none");

    }

});