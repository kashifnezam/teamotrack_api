const API_BASE = "";

const Api = {

    async post(url, body) {

        const response = await fetch(API_BASE + url, {
            method: "POST",
            headers: {
                "Content-Type": "application/json"
            },
            body: JSON.stringify(body)
        });

        return response.json();
    },

    async get(url) {

        const token = localStorage.getItem("token");

        const response = await fetch(API_BASE + url, {
            headers: {
                "Authorization": `Bearer ${token}`
            }
        });

        return response.json();
    }
};