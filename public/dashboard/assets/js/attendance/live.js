(function () {

    "use strict";


    let executives = [];
    let map = null;

    let route = null;
    let startMarker = null;
    let endMarker = null;
    let currentMarker = null;

    let points = [];
    let stops = [];

    let playbackIndex = 0;
    let playbackTimer = null;


    window.initializeLiveTrackingPage =
        async function () {

            setToday();

            initMap();

            bindEvents();

            await loadExecutives();

        };


    function initMap() {

        if (map) return;

        map = L.map(
            "trackingMap"
        ).setView(
            [20.5937, 78.9629],
            5
        );


        L.tileLayer(
            "https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png",
            {
                maxZoom: 19,
                attribution: "&copy; OpenStreetMap"
            }
        ).addTo(map);

    }


    function bindEvents() {

        document
            .getElementById(
                "loadTrackingBtn"
            )
            ?.addEventListener(
                "click",
                loadTracking
            );


        document
            .getElementById("playBtn")
            ?.addEventListener(
                "click",
                togglePlayback
            );


        document
            .getElementById("stopBtn")
            ?.addEventListener(
                "click",
                stopPlayback
            );


        document
            .getElementById("playbackSlider")
            ?.addEventListener(
                "input",
                event => {

                    seekPlayback(
                        Number(
                            event.target.value
                        )
                    );

                }
            );

    }


    async function loadExecutives() {
    try {
        const select = document.getElementById("liveExecutive");

        if (!select) {
            throw new Error(
                'Element "#liveExecutive" not found in live.html'
            );
        }

        const data = await Api.get("/executives/data");

        if (!data) return;

        executives = data.executives || [];

        select.innerHTML = `
            <option value="">
                Select Executive
            </option>
        `;

        executives
            .filter(e => e.isActive !== false)
            .forEach(executive => {
                select.insertAdjacentHTML(
                    "beforeend",
                    `
                    <option value="${executive.id}">
                        ${escapeHtml(executive.fullName)}
                    </option>
                    `
                );
            });

    } catch (error) {
        console.error("loadExecutives failed:", error);

        AppAlert.error(
            error.message || "Unable to load executives"
        );
    }
}


    async function loadTracking() {

        const executiveId =
            document.getElementById(
                "liveExecutive"
            ).value;

        const date =
            document.getElementById(
                "liveDate"
            ).value;


        if (!executiveId) {

            AppAlert.warning(
                "Please select an executive"
            );

            return;

        }


        if (!date) {

            AppAlert.warning(
                "Please select a date"
            );

            return;

        }


        try {

            AppAlert.loading(
                "Loading tracking..."
            );


            const data =
                await Api.post(
                    "/attendance/live/history",
                    {
                        executiveId,
                        date
                    }
                );


            AppAlert.close();


            if (!data) return;


            renderTracking(
                data
            );


        } catch (error) {

            console.error(error);

            AppAlert.close();

            AppAlert.error(
                error.message ||
                "Unable to load tracking"
            );

        }

    }


    function renderTracking(data) {

        clearMap();

        points = [];
        stops = [];


        /*
         * Backend returns the same
         * packet structure used by
         * Flutter:
         *
         * {
         *   locations: [[lat,lng],...],
         *   startTime,
         *   endTime,
         *   offlinePacket
         * }
         */


        data.forEach(packet => {

            const locations =
                packet.locations || [];

            locations.forEach(
                location => {

                    const lat =
                        Number(location[0]);

                    const lng =
                        Number(location[1]);


                    if (
                        Math.abs(lat) > 90 ||
                        Math.abs(lng) > 180
                    ) {
                        return;
                    }


                    points.push({
                        lat,
                        lng,
                        timestamp:
                            packet.startTime
                    });

                }
            );

        });


        if (!points.length) {

            setText(
                "trackingStatus",
                "No tracking data"
            );

            return;

        }


        const latLngs =
            points.map(
                point => [
                    point.lat,
                    point.lng
                ]
            );


        route =
            L.polyline(
                latLngs,
                {
                    weight: 4
                }
            ).addTo(map);


        startMarker =
            L.marker(
                latLngs[0]
            )
            .addTo(map)
            .bindPopup(
                "Start"
            );


        endMarker =
            L.marker(
                latLngs[
                    latLngs.length - 1
                ]
            )
            .addTo(map)
            .bindPopup(
                "End"
            );


        currentMarker =
            L.marker(
                latLngs[0]
            )
            .addTo(map);


        map.fitBounds(
            route.getBounds(),
            {
                padding: [30, 30]
            }
        );


        detectStops();


        setText(
            "trackingStart",
            formatDateTime(
                points[0].timestamp
            )
        );


        setText(
            "trackingEnd",
            formatDateTime(
                points[
                    points.length - 1
                ].timestamp
            )
        );


        setText(
            "trackingDistance",
            formatDistance(
                calculateDistance()
            )
        );


        setText(
            "trackingStops",
            stops.length
        );


        const slider =
            document.getElementById(
                "playbackSlider"
            );


        slider.max =
            Math.max(
                points.length - 1,
                0
            );

        slider.value = 0;

        playbackIndex = 0;


        setText(
            "trackingStatus",
            `${points.length} GPS points`
        );

        updatePlaybackTime();

    }


    function calculateDistance() {

        let total = 0;


        for (
            let i = 1;
            i < points.length;
            i++
        ) {

            const distance =
                map.distance(
                    [
                        points[i - 1].lat,
                        points[i - 1].lng
                    ],
                    [
                        points[i].lat,
                        points[i].lng
                    ]
                );


            /*
             * Ignore GPS drift.
             */
            if (distance < 10) {
                continue;
            }


            /*
             * Ignore unrealistic
             * GPS jumps.
             */
            if (distance > 5000) {
                continue;
            }


            total += distance;

        }


        return total;

    }


    function detectStops() {

        stops = [];

        if (points.length < 2) {
            return;
        }


        const radius = 30;
        const duration = 5 * 60 * 1000;

        let start = 0;


        for (
            let i = 1;
            i < points.length;
            i++
        ) {

            const distance =
                map.distance(
                    [
                        points[start].lat,
                        points[start].lng
                    ],
                    [
                        points[i].lat,
                        points[i].lng
                    ]
                );


            if (distance > radius) {

                const startTime =
                    points[start].timestamp;

                const endTime =
                    points[i - 1].timestamp;


                if (
                    endTime -
                    startTime >
                    duration
                ) {

                    stops.push({
                        lat:
                            points[start].lat,

                        lng:
                            points[start].lng,

                        startTime,

                        endTime
                    });

                }


                start = i;

            }

        }

    }


    function togglePlayback() {

        if (!points.length) {
            return;
        }


        if (playbackTimer) {

            clearInterval(
                playbackTimer
            );

            playbackTimer = null;

            document.getElementById(
                "playBtn"
            ).innerHTML =
                `<i class="bi bi-play-fill"></i>`;

            return;

        }


        document.getElementById(
            "playBtn"
        ).innerHTML =
            `<i class="bi bi-pause-fill"></i>`;


        playbackTimer =
            setInterval(
                () => {

                    if (
                        playbackIndex >=
                        points.length - 1
                    ) {

                        stopPlayback();

                        return;

                    }


                    seekPlayback(
                        playbackIndex + 1
                    );

                },
                500
            );

    }


    function stopPlayback() {

        clearInterval(
            playbackTimer
        );

        playbackTimer = null;

        playbackIndex = 0;

        document.getElementById(
            "playBtn"
        ).innerHTML =
            `<i class="bi bi-play-fill"></i>`;

        seekPlayback(0);

    }


    function seekPlayback(index) {

        if (!points[index]) {
            return;
        }


        playbackIndex =
            index;


        const point =
            points[index];


        currentMarker?.setLatLng([
            point.lat,
            point.lng
        ]);


        map.panTo(
            [
                point.lat,
                point.lng
            ],
            {
                animate: false
            }
        );


        document.getElementById(
            "playbackSlider"
        ).value = index;


        updatePlaybackTime();

    }


    function updatePlaybackTime() {

        const point =
            points[playbackIndex];


        setText(
            "playbackTime",
            point
                ? formatDateTime(
                    point.timestamp
                )
                : "--"
        );

    }


    function clearMap() {

        clearInterval(
            playbackTimer
        );

        playbackTimer = null;


        route?.remove();
        startMarker?.remove();
        endMarker?.remove();
        currentMarker?.remove();


        route = null;
        startMarker = null;
        endMarker = null;
        currentMarker = null;

    }


    function formatDistance(distance) {

        if (distance >= 1000) {

            return `${(
                distance / 1000
            ).toFixed(2)} km`;

        }

        return `${Math.round(distance)} m`;

    }


    function formatDateTime(value) {

        if (!value) return "--";

        return new Date(
            Number(value)
        ).toLocaleString(
            "en-IN",
            {
                day: "2-digit",
                month: "short",
                year: "numeric",
                hour: "2-digit",
                minute: "2-digit",
                second: "2-digit"
            }
        );

    }


    function setToday() {

        const now = new Date();

        document.getElementById(
            "liveDate"
        ).value =
            `${now.getFullYear()}-${String(
                now.getMonth() + 1
            ).padStart(2, "0")}-${String(
                now.getDate()
            ).padStart(2, "0")}`;

    }


    function setText(id, value) {

        const element =
            document.getElementById(id);

        if (element) {
            element.textContent = value;
        }

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