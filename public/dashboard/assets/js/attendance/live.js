(function () {
  'use strict';

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

  window.initializeLiveTrackingPage = async function () {
    setToday();

    initMap();

    bindEvents();

    await loadExecutives();
  };

  function initMap() {
    if (map) return;

    map = L.map('trackingMap').setView([20.5937, 78.9629], 5);

    /*
     * ============================================================
     * BASE MAP LAYERS
     * ============================================================
     */

    const street = L.tileLayer('https://mt1.google.com/vt/lyrs=m&x={x}&y={y}&z={z}', {
      maxZoom: 19,
    });

    const satellite = L.tileLayer(
      'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}',
      {
        maxZoom: 19,
      }
    );

    const topo = L.tileLayer('https://{s}.tile.opentopomap.org/{z}/{x}/{y}.png', {
      maxZoom: 17,
    });

    const dark = L.tileLayer('https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png', {
      maxZoom: 19,
    });

    /*
     * Default map
     */
    street.addTo(map);

    /*
     * ============================================================
     * MAP LAYER SWITCHER
     * ============================================================
     */

    const baseMaps = {
      Street: street,
      Satellite: satellite,
      Topo: topo,
      Dark: dark,
    };

    L.control
      .layers(baseMaps, null, {
        position: 'topright',
        collapsed: true,
      })
      .addTo(map);
  }

  function bindEvents() {
    document.getElementById('loadTrackingBtn')?.addEventListener('click', loadTracking);

    document.getElementById('playBtn')?.addEventListener('click', togglePlayback);

    document.getElementById('stopBtn')?.addEventListener('click', stopPlayback);

    document.getElementById('playbackSlider')?.addEventListener('input', (event) => {
      seekPlayback(Number(event.target.value));
    });

    /*
     * TEAM FILTER
     */
    document.getElementById('liveTeam')?.addEventListener('change', (event) => {
      const teamId = event.target.value;

      renderExecutiveOptions(teamId, '');

      resetExecutiveSelection();
    });

    /*
     * EXECUTIVE DROPDOWN
     */
    const executiveDropdown = document.getElementById('liveExecutiveDropdown');

    const executiveTrigger = document.getElementById('liveExecutiveTrigger');

    const executiveMenu = document.getElementById('liveExecutiveMenu');

    const executiveSearch = document.getElementById('liveExecutiveSearch');

    executiveTrigger?.addEventListener('click', (event) => {
      event.stopPropagation();

      const isOpen = executiveDropdown.classList.contains('open');

      if (isOpen) {
        closeExecutiveDropdown();
      } else {
        openExecutiveDropdown();
      }
    });

    executiveSearch?.addEventListener('input', (event) => {
      const teamId = document.getElementById('liveTeam')?.value || '';

      renderExecutiveOptions(teamId, event.target.value);
    });

    executiveMenu?.addEventListener('click', (event) => {
      const option = event.target.closest('.tracking-executive-option');

      if (!option) return;

      const executiveId = option.dataset.id;

      selectExecutive(executiveId);
    });

    /*
     * CLOSE DROPDOWN WHEN CLICKING OUTSIDE
     */
    document.addEventListener('click', (event) => {
      if (executiveDropdown && !executiveDropdown.contains(event.target)) {
        closeExecutiveDropdown();
      }
    });
  }

  async function loadExecutives() {
    try {
      const select = document.getElementById('liveExecutive');

      if (!select) {
        throw new Error('Element "#liveExecutive" not found in live.html');
      }

      const data = await Api.get('/executives/data');

      if (!data) return;

      executives = data.executives || [];

      populateTeams();

      renderExecutiveOptions('', '');
    } catch (error) {
      console.error('loadExecutives failed:', error);

      AppAlert.error(error.message || 'Unable to load executives');
    }
  }

  /*
   * ============================================================
   * TEAM FILTER
   * ============================================================
   */

  function populateTeams() {
    const teamSelect = document.getElementById('liveTeam');

    if (!teamSelect) return;

    const teams = new Map();

    executives
      .filter((executive) => executive.isActive !== false)
      .forEach((executive) => {
        const teamId =
          executive.teamId ??
          executive.team?.id ??
          executive.team?.teamId ??
          executive.teamName ??
          executive.team?.name ??
          '';

        const teamName =
          executive.teamName ?? executive.team?.name ?? executive.team?.teamName ?? (teamId ? String(teamId) : '');

        if (teamId && teamName) {
          teams.set(String(teamId), String(teamName));
        }
      });

    teamSelect.innerHTML = `
                <option value="">All Teams</option>
            `;

    Array.from(teams.entries())
      .sort((a, b) => a[1].localeCompare(b[1]))
      .forEach(([teamId, teamName]) => {
        teamSelect.insertAdjacentHTML(
          'beforeend',
          `
                            <option value="${escapeHtml(teamId)}">
                                ${escapeHtml(teamName)}
                            </option>
                        `
        );
      });
  }

  /*
   * ============================================================
   * EXECUTIVE DROPDOWN
   * ============================================================
   */

  function renderExecutiveOptions(teamId = '', searchTerm = '') {
    const options = document.getElementById('liveExecutiveOptions');

    if (!options) return;

    const search = String(searchTerm || '')
      .trim()
      .toLowerCase();

    const filtered = executives
      .filter((executive) => executive.isActive !== false)
      .filter((executive) => matchesTeam(executive, teamId))
      .filter((executive) => {
        if (!search) {
          return true;
        }

        const name = String(executive.fullName || '').toLowerCase();

        const email = String(executive.email || '').toLowerCase();

        const phone = String(executive.phone || executive.mobile || '').toLowerCase();

        const employeeCode = String(executive.employeeCode || executive.employeeId || '').toLowerCase();

        return (
          name.includes(search) || email.includes(search) || phone.includes(search) || employeeCode.includes(search)
        );
      });

    if (!filtered.length) {
      options.innerHTML = `
                    <div class="tracking-select-empty">
                        <i class="bi bi-person-x"></i>
                        <span>
                            No executives found
                        </span>
                    </div>
                `;

      return;
    }

    const selectedId = document.getElementById('liveExecutive')?.value || '';

    options.innerHTML = filtered.map((executive) => buildExecutiveOption(executive, selectedId)).join('');
  }

  function buildExecutiveOption(executive, selectedId) {
    const id = String(executive.id ?? '');

    const name = String(executive.fullName || executive.name || 'Unnamed Executive');

    const teamName = executive.teamName ?? executive.team?.name ?? '';

    const email = executive.email || '';

    const meta = teamName || email || executive.employeeCode || '';

    const initials = getInitials(name);

    const active = id === String(selectedId);

    return `
            <button
                type="button"
                class="tracking-executive-option${active ? ' active' : ''}"
                data-id="${escapeHtml(id)}"
            >

                <span class="tracking-executive-avatar">
                    ${escapeHtml(initials)}
                </span>

                <span class="tracking-executive-info">

                    <span class="tracking-executive-name">
                        ${escapeHtml(name)}
                    </span>

                    ${
                      meta
                        ? `
                                <span class="tracking-executive-meta">
                                    ${escapeHtml(meta)}
                                </span>
                              `
                        : ''
                    }

                </span>

                ${
                  active
                    ? `
                            <span class="tracking-executive-check">
                                <i class="bi bi-check"></i>
                            </span>
                          `
                    : ''
                }

            </button>
        `;
  }

  function matchesTeam(executive, selectedTeamId) {
    if (!selectedTeamId) {
      return true;
    }

    const executiveTeamId =
      executive.teamId ??
      executive.team?.id ??
      executive.team?.teamId ??
      executive.teamName ??
      executive.team?.name ??
      '';

    return String(executiveTeamId) === String(selectedTeamId);
  }

  function selectExecutive(executiveId) {
    const executive = executives.find((item) => String(item.id) === String(executiveId));

    if (!executive) return;

    const hiddenInput = document.getElementById('liveExecutive');

    const selectedText = document.getElementById('liveExecutiveText');

    if (hiddenInput) {
      hiddenInput.value = executive.id;
    }

    if (selectedText) {
      selectedText.textContent = executive.fullName || executive.name || 'Select Executive';
    }

    const teamId = document.getElementById('liveTeam')?.value || '';

    const search = document.getElementById('liveExecutiveSearch')?.value || '';

    renderExecutiveOptions(teamId, search);

    closeExecutiveDropdown();
  }

  function resetExecutiveSelection() {
    const hiddenInput = document.getElementById('liveExecutive');

    const selectedText = document.getElementById('liveExecutiveText');

    const search = document.getElementById('liveExecutiveSearch');

    if (hiddenInput) {
      hiddenInput.value = '';
    }

    if (selectedText) {
      selectedText.textContent = 'Select Executive';
    }

    if (search) {
      search.value = '';
    }
  }

  function openExecutiveDropdown() {
    const dropdown = document.getElementById('liveExecutiveDropdown');

    const menu = document.getElementById('liveExecutiveMenu');

    const trigger = document.getElementById('liveExecutiveTrigger');

    if (!dropdown || !menu || !trigger) {
      return;
    }

    dropdown.classList.add('open');

    menu.classList.remove('hidden');

    trigger.setAttribute('aria-expanded', 'true');

    const teamId = document.getElementById('liveTeam')?.value || '';

    const search = document.getElementById('liveExecutiveSearch')?.value || '';

    renderExecutiveOptions(teamId, search);

    const searchInput = document.getElementById('liveExecutiveSearch');

    if (searchInput) {
      setTimeout(() => {
        searchInput.focus();
      }, 0);
    }
  }

  function closeExecutiveDropdown() {
    const dropdown = document.getElementById('liveExecutiveDropdown');

    const menu = document.getElementById('liveExecutiveMenu');

    const trigger = document.getElementById('liveExecutiveTrigger');

    dropdown?.classList.remove('open');

    menu?.classList.add('hidden');

    trigger?.setAttribute('aria-expanded', 'false');
  }

  /*
   * ============================================================
   * TRACKING
   * ============================================================
   */

  async function loadTracking() {
    const executiveId = document.getElementById('liveExecutive').value;

    const date = document.getElementById('liveDate').value;

    if (!executiveId) {
      AppAlert.warning('Please select an executive');

      return;
    }

    if (!date) {
      AppAlert.warning('Please select a date');

      return;
    }

    try {
      AppAlert.loading('Loading tracking...');

      const data = await Api.post('/attendance/live/history', {
        executiveId,
        date,
      });

      AppAlert.close();

      if (!data) return;

      renderTracking(data);
    } catch (error) {
      console.error(error);

      AppAlert.close();

      AppAlert.error(error.message || 'Unable to load tracking');
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

    data.forEach((packet) => {
      const locations = packet.locations || [];

      locations.forEach((location) => {
        const lat = Number(location[0]);

        const lng = Number(location[1]);

        if (Math.abs(lat) > 90 || Math.abs(lng) > 180) {
          return;
        }

        points.push({
          lat,
          lng,
          timestamp: packet.startTime,
        });
      });
    });

    if (!points.length) {
      setText('trackingStatus', 'No tracking data');

      return;
    }

    const latLngs = points.map((point) => [point.lat, point.lng]);

    route = L.polyline(latLngs, {
      weight: 4,
    }).addTo(map);

    startMarker = L.marker(latLngs[0]).addTo(map).bindPopup('Start');

    endMarker = L.marker(latLngs[latLngs.length - 1])
      .addTo(map)
      .bindPopup('End');

    currentMarker = L.marker(latLngs[0]).addTo(map);

    map.fitBounds(route.getBounds(), {
      padding: [30, 30],
    });

    detectStops();

    setText('trackingStart', formatDateTime(points[0].timestamp));

    setText('trackingEnd', formatDateTime(points[points.length - 1].timestamp));

    setText('trackingDistance', formatDistance(calculateDistance()));

    setText('trackingStops', stops.length);

    const slider = document.getElementById('playbackSlider');

    slider.max = Math.max(points.length - 1, 0);

    slider.value = 0;

    playbackIndex = 0;

    setText('trackingStatus', `${points.length} GPS points`);

    updatePlaybackTime();
  }

  function calculateDistance() {
    let total = 0;

    for (let i = 1; i < points.length; i++) {
      const distance = map.distance([points[i - 1].lat, points[i - 1].lng], [points[i].lat, points[i].lng]);

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

    for (let i = 1; i < points.length; i++) {
      const distance = map.distance([points[start].lat, points[start].lng], [points[i].lat, points[i].lng]);

      if (distance > radius) {
        const startTime = points[start].timestamp;

        const endTime = points[i - 1].timestamp;

        if (endTime - startTime > duration) {
          stops.push({
            lat: points[start].lat,

            lng: points[start].lng,

            startTime,

            endTime,
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
      clearInterval(playbackTimer);

      playbackTimer = null;

      document.getElementById('playBtn').innerHTML = `<i class="bi bi-play-fill"></i>`;

      return;
    }

    document.getElementById('playBtn').innerHTML = `<i class="bi bi-pause-fill"></i>`;

    playbackTimer = setInterval(() => {
      if (playbackIndex >= points.length - 1) {
        stopPlayback();

        return;
      }

      seekPlayback(playbackIndex + 1);
    }, 500);
  }

  function stopPlayback() {
    clearInterval(playbackTimer);

    playbackTimer = null;

    playbackIndex = 0;

    document.getElementById('playBtn').innerHTML = `<i class="bi bi-play-fill"></i>`;

    seekPlayback(0);
  }

  function seekPlayback(index) {
    if (!points[index]) {
      return;
    }

    playbackIndex = index;

    const point = points[index];

    currentMarker?.setLatLng([point.lat, point.lng]);

    map.panTo([point.lat, point.lng], {
      animate: false,
    });

    document.getElementById('playbackSlider').value = index;

    updatePlaybackTime();
  }

  function updatePlaybackTime() {
    const point = points[playbackIndex];

    setText('playbackTime', point ? formatDateTime(point.timestamp) : '--');
  }

  function clearMap() {
    clearInterval(playbackTimer);

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
      return `${(distance / 1000).toFixed(2)} km`;
    }

    return `${Math.round(distance)} m`;
  }

  function formatDateTime(value) {
    if (!value) return '--';

    return new Date(Number(value)).toLocaleString('en-IN', {
      day: '2-digit',
      month: 'short',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
    });
  }

  function setToday() {
    const now = new Date();

    document.getElementById('liveDate').value = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(
      2,
      '0'
    )}-${String(now.getDate()).padStart(2, '0')}`;
  }

  function setText(id, value) {
    const element = document.getElementById(id);

    if (element) {
      element.textContent = value;
    }
  }

  function getInitials(name) {
    const words = String(name || '')
      .trim()
      .split(/\s+/)
      .filter(Boolean);

    if (!words.length) {
      return 'EX';
    }

    if (words.length === 1) {
      return words[0].substring(0, 2).toUpperCase();
    }

    return (words[0][0] + words[words.length - 1][0]).toUpperCase();
  }

  function escapeHtml(value) {
    return String(value ?? '')
      .replaceAll('&', '&amp;')
      .replaceAll('<', '&lt;')
      .replaceAll('>', '&gt;')
      .replaceAll('"', '&quot;')
      .replaceAll("'", '&#039;');
  }
})();
