const API_BASE = "";


const Api = {

    async get(url) {

        const response =
            await fetch(
                API_BASE + url,
                {
                    method: "GET",
                    credentials: "include"
                }
            );


        const data =
            await response.json();


        if (response.status === 401) {

            sessionStorage.setItem(
                "loginAlert",
                "Your session has expired. Please login again."
            );


            window.location.href =
                "/login";


            return null;
        }


        if (!response.ok) {

            throw new Error(
                data?.message ||
                "Request failed"
            );

        }


        return data;

    },


    async post(url, body) {

        const response =
            await fetch(
                API_BASE + url,
                {
                    method: "POST",

                    credentials: "include",

                    headers: {
                        "Content-Type":
                            "application/json"
                    },

                    body:
                        JSON.stringify(body)
                }
            );


        const data =
            await response.json();


        if (response.status === 401) {

            window.location.href =
                "/login";

            return null;

        }


        if (!response.ok) {

            throw new Error(
                data?.message ||
                "Request failed"
            );

        }


        return data;

    },


    async patch(url, body) {

        const response =
            await fetch(
                API_BASE + url,
                {
                    method: "PATCH",

                    credentials: "include",

                    headers: {
                        "Content-Type":
                            "application/json"
                    },

                    body:
                        JSON.stringify(body)
                }
            );


        const data =
            await response.json();


        if (response.status === 401) {

            window.location.href =
                "/login";

            return null;

        }


        if (!response.ok) {

            throw new Error(
                data?.message ||
                "Request failed"
            );

        }


        return data;

    },

    async delete(url) {

    const response =
        await fetch(
            API_BASE + url,
            {
                method: "DELETE",
                credentials: "include"
            }
        );

    const data =
        await response.json();

    if (response.status === 401) {

        window.location.href =
            "/login";

        return null;
    }

    if (!response.ok) {

        throw new Error(
            data?.message ||
            "Request failed"
        );

    }

    return data;
}

};