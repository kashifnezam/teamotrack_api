// ==========================================================
// TeamoTrack
// api.js
// API Utility
// ==========================================================

import { getFreshToken } from './auth.js';

const API_BASE = '';

const Api = {
  // ======================================================
  // Get Headers
  // ======================================================

  async getHeaders() {
    const token = await getFreshToken();

    if (!token) {
      sessionStorage.setItem('loginAlert', 'Login required.');

      window.location.href = '/login';

      return null;
    }

    return {
      'Content-Type': 'application/json',

      Authorization: `Bearer ${token}`,
    };
  },

  // ======================================================
  // Public Headers
  // ======================================================

  getPublicHeaders() {
    return {
      'Content-Type': 'application/json',
    };
  },

  // ======================================================
  // Handle Response
  // ======================================================

  async handleResponse(response) {
    let data = null;

    try {
      data = await response.json();
    } catch {
      data = null;
    }

    // ====================================================
    // UNAUTHORIZED
    // ====================================================

    if (response.status === 401) {
      sessionStorage.setItem('loginAlert', 'Your session has expired. Please login again.');

      window.location.href = '/login';

      return null;
    }

    // ====================================================
    // ERROR
    // ====================================================

    if (!response.ok) {
      throw new Error(Array.isArray(data?.message) ? data.message.join(', ') : data?.message || 'Request failed');
    }

    // ====================================================
    // SUCCESS
    // ====================================================

    return data;
  },

  // ======================================================
  // GET
  // ======================================================

  async get(url) {
    const headers = await this.getHeaders();

    if (!headers) {
      return null;
    }

    const response = await fetch(API_BASE + url, {
      method: 'GET',
      headers,
    });

    return this.handleResponse(response);
  },

  // ======================================================
  // POST
  // ======================================================

  async post(url, body) {
    const headers = await this.getHeaders();

    if (!headers) {
      return null;
    }

    const response = await fetch(API_BASE + url, {
      method: 'POST',

      headers,

      body: JSON.stringify(body),
    });

    return this.handleResponse(response);
  },

  // ======================================================
  // PUBLIC POST
  // ======================================================

  async postPublic(url, body) {
    const headers = this.getPublicHeaders();

    const response = await fetch(API_BASE + url, {
      method: 'POST',

      headers,

      body: JSON.stringify(body),
    });

    return this.handleResponse(response);
  },

  // ======================================================
  // PATCH
  // ======================================================

  async patch(url, body) {
    const headers = await this.getHeaders();

    if (!headers) {
      return null;
    }

    const response = await fetch(API_BASE + url, {
      method: 'PATCH',

      headers,

      body: JSON.stringify(body),
    });

    return this.handleResponse(response);
  },

  // ======================================================
  // DELETE
  // ======================================================

  async delete(url) {
    const headers = await this.getHeaders();

    if (!headers) {
      return null;
    }

    const response = await fetch(API_BASE + url, {
      method: 'DELETE',

      headers,
    });

    return this.handleResponse(response);
  },

  // ======================================================
  // POST MULTIPART / FORMDATA
  // ======================================================

  async postMultipart(url, formData) {
    const token = await getFreshToken();

    if (!token) {
      sessionStorage.setItem('loginAlert', 'Login required.');

      window.location.href = '/login';

      return null;
    }

    const response = await fetch(API_BASE + url, {
      method: 'POST',

      headers: {
        Authorization: `Bearer ${token}`,
      },

      body: formData,
    });

    return this.handleResponse(response);
  },
};

window.Api = Api;

export default Api;
