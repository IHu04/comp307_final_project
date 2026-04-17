// shared.js — API utilities, auth guard, and logout helper.
// Every page loads this first via <script src="shared.js">.

const API = {
  _user: null,

  // Returns the logged-in user or null (no redirect)
  async getUser() {
    if (this._user) return this._user;
    try {
      const res = await fetch('/api/auth/me', { credentials: 'include' });
      if (!res.ok) return null;
      const body = await res.json();
      this._user = body.data?.user || null;
      return this._user;
    } catch {
      return null;
    }
  },

  // Redirects to login.html if not authenticated, otherwise returns user
  async requireAuth() {
    const user = await this.getUser();
    if (!user) {
      window.location.href = 'login.html';
      return null;
    }
    return user;
  },

  // Redirects non-owners to book.html
  async requireOwner() {
    const user = await this.requireAuth();
    if (!user) return null;
    if (!user.isOwner) {
      window.location.href = 'book.html';
      return null;
    }
    return user;
  },

  // POST /api/auth/logout then go to homepage
  async logout() {
    try {
      await fetch('/api/auth/logout', { method: 'POST', credentials: 'include' });
    } catch { /* ignore */ }
    window.location.href = 'homepage.html';
  },

  // ── HTTP helpers ─────────────────────────────────────────────────────────

  async get(path) {
    const res = await fetch('/api' + path, { credentials: 'include' });
    const body = await res.json();
    if (!res.ok) throw new Error(body.message || 'Request failed');
    return body.data;
  },

  async post(path, payload = {}) {
    const res = await fetch('/api' + path, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify(payload),
    });
    const body = await res.json();
    if (!res.ok) throw new Error(body.message || 'Request failed');
    return body.data;
  },

  async patch(path, payload = {}) {
    const res = await fetch('/api' + path, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify(payload),
    });
    const body = await res.json();
    if (!res.ok) throw new Error(body.message || 'Request failed');
    return body.data;
  },

  async del(path) {
    const res = await fetch('/api' + path, {
      method: 'DELETE',
      credentials: 'include',
    });
    const body = await res.json();
    if (!res.ok) throw new Error(body.message || 'Request failed');
    return body.data;
  },
};
