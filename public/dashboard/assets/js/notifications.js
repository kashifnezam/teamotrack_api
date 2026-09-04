/* ==========================================================
   TeamoTrack Notifications
========================================================== */

(function () {
  'use strict';

  const PAGE_LIMIT = 10;

  let notifications = [];

  let currentCursor = null;

  let pageHistory = [];

  let currentPage = 1;

  let hasNext = false;

  let unreadCount = 0;

  let isLoading = false;

  let initialized = false;

  /* ==========================================================
     INITIALIZE
  ========================================================== */

  window.initializeNotifications = async function () {
    if (initialized) {
      return;
    }

    initialized = true;

    bindEvents();

    updateUnreadCount(0);

    /*
     * Do not load notifications immediately.
     *
     * Notifications are loaded when the bell is opened.
     * This keeps the header lightweight.
     */
  };

  /* ==========================================================
     ELEMENTS
  ========================================================== */

  function getElements() {
    return {
      wrapper: document.getElementById('headerNotificationWrapper'),

      button: document.getElementById('notificationButton'),

      panel: document.getElementById('notificationPanel'),

      list: document.getElementById('notificationList'),

      empty: document.getElementById('notificationEmpty'),

      footer: document.getElementById('notificationFooter'),

      previous: document.getElementById('notificationPreviousBtn'),

      next: document.getElementById('notificationNextBtn'),

      pageInfo: document.getElementById('notificationPageInfo'),

      markAll: document.getElementById('markAllNotificationsBtn'),

      count: document.getElementById('notificationHeaderCount'),

      badge: document.getElementById('notificationBadge'),

      loading: document.getElementById('notificationPanelLoading'),

      loadingText: document.getElementById('notificationPanelLoadingText'),
    };
  }

  /* ==========================================================
     EVENTS
  ========================================================== */

  function bindEvents() {
    const elements = getElements();

    elements.button?.addEventListener('click', togglePanel);

    elements.previous?.addEventListener('click', loadPreviousPage);

    elements.next?.addEventListener('click', loadNextPage);

    elements.markAll?.addEventListener('click', markAllAsRead);

    document.addEventListener('click', handleOutsideClick);

    elements.list?.addEventListener('click', handleNotificationClick);
  }

  /* ==========================================================
     TOGGLE PANEL
  ========================================================== */

  async function togglePanel(event) {
    event.stopPropagation();

    const elements = getElements();

    if (!elements.panel) {
      return;
    }

    const isOpen = elements.panel.classList.contains('show');

    if (isOpen) {
      closePanel();
      return;
    }

    openPanel();

    /*
     * First open:
     * load only the first 10 notifications.
     */
    if (!notifications.length) {
      await loadFirstPage();
    }
  }

  /* ==========================================================
     OPEN
  ========================================================== */

  function openPanel() {
    const elements = getElements();

    if (!elements.panel) {
      return;
    }

    elements.panel.classList.add('show');

    elements.panel.setAttribute('aria-hidden', 'false');

    elements.button?.setAttribute('aria-expanded', 'true');
  }

  /* ==========================================================
     CLOSE
  ========================================================== */

  function closePanel() {
    const elements = getElements();

    elements.panel?.classList.remove('show');

    elements.panel?.setAttribute('aria-hidden', 'true');

    elements.button?.setAttribute('aria-expanded', 'false');
  }

  /* ==========================================================
     OUTSIDE CLICK
  ========================================================== */

  function handleOutsideClick(event) {
    const elements = getElements();

    if (!elements.wrapper) {
      return;
    }

    if (elements.panel?.classList.contains('show') && !elements.wrapper.contains(event.target)) {
      closePanel();
    }
  }

  /* ==========================================================
     FIRST PAGE
  ========================================================== */

  async function loadFirstPage() {
    if (isLoading) {
      return;
    }

    isLoading = true;

    setPanelLoading(true, 'Loading notifications...');

    /*
     * First page has no existing content to preserve,
     * so show the normal loading state.
     */
    renderLoading();

    try {
      const data = await Api.get(`/notifications/data?limit=${PAGE_LIMIT}`);

      if (!data) {
        return;
      }

      notifications = Array.isArray(data.notifications) ? data.notifications : [];

      currentCursor = data.pagination?.nextCursor || null;

      hasNext = data.pagination?.hasNext === true;

      currentPage = 1;

      pageHistory = [];

      updateUnreadCount(data.unreadCount);

      renderNotifications();

      updatePagination();
    } catch (error) {
      console.error('Failed to load notifications:', error);

      renderError(error.message || 'Unable to load notifications');
    } finally {
      isLoading = false;

      setPanelLoading(false);

      updatePagination();
    }
  }

  /* ==========================================================
     NEXT PAGE
  ========================================================== */

  async function loadNextPage() {
    if (isLoading || !hasNext || !currentCursor) {
      return;
    }

    const cursor = currentCursor;

    isLoading = true;

    setPanelLoading(true, 'Loading next notifications...');

    try {
      const data = await Api.get(`/notifications/data?limit=${PAGE_LIMIT}&cursor=${encodeURIComponent(cursor)}`);

      if (!data) {
        return;
      }

      /*
       * Save the current page so Previous can
       * restore it without another API request.
       */
      pageHistory.push({
        page: currentPage,

        cursor: currentCursor,

        notifications: notifications,

        nextCursor: currentCursor,

        hasNext: hasNext,
      });

      notifications = Array.isArray(data.notifications) ? data.notifications : [];

      currentCursor = data.pagination?.nextCursor || null;

      hasNext = data.pagination?.hasNext === true;

      currentPage++;

      updateUnreadCount(data.unreadCount);

      renderNotifications();

      updatePagination();
    } catch (error) {
      console.error('Failed to load next notifications:', error);

      AppAlert.error(error.message || 'Unable to load next notifications');
    } finally {
      isLoading = false;

      setPanelLoading(false);

      updatePagination();
    }
  }

  /* ==========================================================
     PREVIOUS PAGE
  ========================================================== */

  async function loadPreviousPage() {
    if (isLoading || !pageHistory.length) {
      return;
    }

    const previous = pageHistory.pop();

    if (!previous) {
      return;
    }

    isLoading = true;

    setPanelLoading(true, 'Loading previous notifications...');

    try {
      /*
       * Previous page is already stored locally.
       * No API request is necessary.
       */
      notifications = previous.notifications || [];

      currentCursor = previous.nextCursor || null;

      hasNext = previous.hasNext === true;

      currentPage = previous.page;

      renderNotifications();

      updatePagination();
    } catch (error) {
      console.error('Failed to restore previous notifications:', error);

      AppAlert.error(error.message || 'Unable to load previous notifications');
    } finally {
      isLoading = false;

      setPanelLoading(false);

      updatePagination();
    }
  }

  /* ==========================================================
     RENDER
  ========================================================== */

  function renderNotifications() {
    const elements = getElements();

    if (!elements.list) {
      return;
    }

    const empty = notifications.length === 0;

    elements.list.style.display = empty ? 'none' : '';

    if (elements.empty) {
      elements.empty.hidden = !empty;
    }

    if (elements.footer) {
      elements.footer.style.display = empty ? 'none' : '';
    }

    if (empty) {
      elements.list.innerHTML = '';
      return;
    }

    elements.list.innerHTML = notifications.map(renderNotification).join('');
  }

  /* ==========================================================
     RENDER NOTIFICATION
  ========================================================== */

  function renderNotification(notification) {
    const id = escapeHtml(notification.id);

    const title = escapeHtml(notification.title || 'Notification');

    /*
     * Backend returns body.
     *
     * message is kept as fallback for
     * older notification documents.
     */
    const message = escapeHtml(notification.body || notification.message || '');

    const type = notification.type || 'general';

    const icon = getNotificationIcon(notification.icon, type);

    const time = formatRelativeTime(notification.createdAt);

    const unread = notification.read !== true;

    return `
      <div
        class="notification-item ${unread ? 'unread' : ''}"
        data-notification-id="${id}"
      >

        <div class="notification-item-icon">
          <i class="bi ${icon}"></i>
        </div>

        <div class="notification-item-content">

          <div class="notification-item-title">
            ${title}
          </div>

          <div class="notification-item-message">
            ${message}
          </div>

          <span class="notification-item-time">
            ${time}
          </span>

        </div>

        <span class="notification-unread-dot"></span>

        ${
          unread
            ? `
              <button
                type="button"
                class="notification-read-btn"
                data-action="read"
                data-id="${id}"
                aria-label="Mark as read"
                title="Mark as read"
              >
                <i class="bi bi-check2"></i>
              </button>
            `
            : ''
        }

      </div>
    `;
  }

  /* ==========================================================
     CLICK NOTIFICATION
  ========================================================== */

  async function handleNotificationClick(event) {
    const readButton = event.target.closest('[data-action="read"]');

    if (readButton) {
      event.stopPropagation();

      const id = readButton.dataset.id;

      await markAsRead(id);

      return;
    }

    const item = event.target.closest('.notification-item');

    if (!item) {
      return;
    }

    const id = item.dataset.notificationId;

    const notification = notifications.find((item) => item.id === id);

    if (!notification) {
      return;
    }

    /*
     * Mark notification as read
     * when opened.
     */
    if (!notification.read) {
      await markAsRead(id);
    }

    /*
     * Navigate when the notification
     * contains an action URL.
     */
    if (notification.actionUrl) {
      window.location.href = notification.actionUrl;
    }
  }

  /* ==========================================================
     MARK ONE AS READ
  ========================================================== */

  async function markAsRead(id) {
    if (!id) {
      return;
    }

    const notification = notifications.find((item) => item.id === id);

    if (!notification || notification.read) {
      return;
    }

    try {
      const data = await Api.patch(`/notifications/${encodeURIComponent(id)}/read`, {});

      if (!data) {
        return;
      }

      notification.read = true;

      /*
       * Keep the total unread count,
       * not just the current page count.
       */
      updateUnreadCount(Math.max(0, unreadCount - 1));

      renderNotifications();
    } catch (error) {
      console.error('Failed to mark notification as read:', error);

      AppAlert.error(error.message || 'Unable to mark notification as read');
    }
  }

  /* ==========================================================
     MARK ALL AS READ
  ========================================================== */

  async function markAllAsRead() {
    const elements = getElements();

    if (isLoading || unreadCount === 0) {
      return;
    }

    isLoading = true;

    setPanelLoading(true, 'Marking notifications as read...');

    try {
      const data = await Api.post('/notifications/read-all', {});

      if (!data) {
        return;
      }

      /*
       * Update currently visible page.
       *
       * Backend has already marked every
       * notification as read.
       */
      notifications.forEach((notification) => {
        notification.read = true;
      });

      updateUnreadCount(0);

      renderNotifications();
    } catch (error) {
      console.error('Failed to mark all notifications as read:', error);

      AppAlert.error(error.message || 'Unable to mark notifications as read');
    } finally {
      isLoading = false;

      setPanelLoading(false);

      if (elements.markAll) {
        elements.markAll.disabled = unreadCount === 0;
      }

      updatePagination();
    }
  }

  /* ==========================================================
     UNREAD COUNT
  ========================================================== */

  function updateUnreadCount(count) {
    const safeCount = Math.max(0, Number(count) || 0);

    unreadCount = safeCount;

    const elements = getElements();

    if (elements.count) {
      elements.count.textContent = safeCount > 99 ? '99+' : String(safeCount);
    }

    updateBadge(safeCount);

    if (elements.markAll) {
      elements.markAll.disabled = safeCount === 0 || isLoading;
    }
  }

  /* ==========================================================
     BADGE
  ========================================================== */

  function updateBadge(count) {
    const elements = getElements();

    if (!elements.badge) {
      return;
    }

    if (count > 0) {
      elements.badge.classList.add('has-unread');

      elements.badge.setAttribute('aria-label', `${count} unread notifications`);
    } else {
      elements.badge.classList.remove('has-unread');

      elements.badge.removeAttribute('aria-label');
    }
  }

  /* ==========================================================
     PAGINATION
  ========================================================== */

  function updatePagination() {
    const elements = getElements();

    if (elements.pageInfo) {
      elements.pageInfo.textContent = `Page ${currentPage}`;
    }

    if (elements.previous) {
      elements.previous.disabled = currentPage === 1 || pageHistory.length === 0 || isLoading;
    }

    if (elements.next) {
      elements.next.disabled = !hasNext || !currentCursor || isLoading;
    }

    if (elements.markAll) {
      elements.markAll.disabled = unreadCount === 0 || isLoading;
    }
  }

  /* ==========================================================
     PANEL LOADING OVERLAY
  ========================================================== */

  function setPanelLoading(loading, message = 'Loading notifications...') {
    const elements = getElements();

    if (!elements.loading) {
      return;
    }

    if (elements.loadingText) {
      elements.loadingText.textContent = message;
    }

    elements.loading.hidden = !loading;

    /*
     * Keep the current page visible underneath
     * while the overlay is active.
     */
    updatePagination();
  }

  /* ==========================================================
     INITIAL LOADING STATE
  ========================================================== */

  function renderLoading() {
    const elements = getElements();

    if (!elements.list) {
      return;
    }

    elements.list.style.display = '';

    if (elements.empty) {
      elements.empty.hidden = true;
    }

    if (elements.footer) {
      elements.footer.style.display = 'none';
    }

    elements.list.innerHTML = `
      <div class="notification-loading">

        <div
          class="spinner-border spinner-border-sm"
          role="status"
          aria-hidden="true"
        ></div>

        <span>
          Loading notifications...
        </span>

      </div>
    `;
  }

  /* ==========================================================
     ERROR
  ========================================================== */

  function renderError(message) {
    const elements = getElements();

    if (!elements.list) {
      return;
    }

    elements.list.style.display = '';

    if (elements.empty) {
      elements.empty.hidden = true;
    }

    if (elements.footer) {
      elements.footer.style.display = 'none';
    }

    elements.list.innerHTML = `
      <div class="notification-empty">

        <div class="notification-empty-icon">
          <i class="bi bi-exclamation-circle"></i>
        </div>

        <div class="notification-empty-title">
          Unable to load notifications
        </div>

        <div class="notification-empty-text">
          ${escapeHtml(message)}
        </div>

      </div>
    `;
  }

  /* ==========================================================
     ICON
  ========================================================== */

  function getNotificationIcon(customIcon, type) {
    if (customIcon && /^[a-z0-9-]+$/i.test(customIcon)) {
      return customIcon;
    }

    const icons = {
      leave: 'bi-calendar-check',

      attendance: 'bi-clock-history',

      payroll: 'bi-cash-stack',

      holiday: 'bi-calendar-event',

      team: 'bi-people',

      employee: 'bi-person',

      shift: 'bi-calendar3',

      announcement: 'bi-megaphone',

      warning: 'bi-exclamation-triangle',

      success: 'bi-check-circle',

      general: 'bi-bell',
    };

    return icons[type] || icons.general;
  }

  /* ==========================================================
     RELATIVE TIME
  ========================================================== */

  function formatRelativeTime(value) {
    if (!value) {
      return '';
    }

    const date = new Date(value);

    if (Number.isNaN(date.getTime())) {
      return '';
    }

    const diff = Date.now() - date.getTime();

    /*
     * Future timestamps.
     */
    if (diff < 0) {
      return 'Just now';
    }

    const seconds = Math.floor(diff / 1000);

    if (seconds < 10) {
      return 'Just now';
    }

    if (seconds < 60) {
      return `${seconds}s ago`;
    }

    const minutes = Math.floor(seconds / 60);

    if (minutes < 60) {
      return `${minutes}m ago`;
    }

    const hours = Math.floor(minutes / 60);

    if (hours < 24) {
      return `${hours}h ago`;
    }

    const days = Math.floor(hours / 24);

    if (days < 7) {
      return `${days}d ago`;
    }

    return date.toLocaleDateString(undefined, {
      day: 'numeric',

      month: 'short',

      year: date.getFullYear() !== new Date().getFullYear() ? 'numeric' : undefined,
    });
  }

  /* ==========================================================
     ESCAPE HTML
  ========================================================== */

  function escapeHtml(value) {
    return String(value ?? '')
      .replaceAll('&', '&amp;')
      .replaceAll('<', '&lt;')
      .replaceAll('>', '&gt;')
      .replaceAll('"', '&quot;')
      .replaceAll("'", '&#039;');
  }

  /* ==========================================================
     GLOBAL REFRESH
  ========================================================== */

  window.refreshNotifications = async function () {
    if (!initialized) {
      return;
    }

    /*
     * Refresh from page 1.
     */
    await loadFirstPage();
  };
})();
