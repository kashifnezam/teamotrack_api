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

        const data = await response.json();

        console.log("POST:", API_BASE + url);
        console.log("Status:", response.status);
        console.log("Response:", data);

        if (!response.ok) {
            throw data;
        }

        return data;
    },

    async get(url) {

        const token = localStorage.getItem("token");

        const response = await fetch(API_BASE + url, {
            method: "GET",

            headers: {
                "Authorization": `Bearer ${token}`
            }
        });

        const data = await response.json();

        console.log("GET:", API_BASE + url);
        console.log("Status:", response.status);
        console.log("Response:", data);

        if (!response.ok) {
            throw data;
        }

        return data;
    }
};