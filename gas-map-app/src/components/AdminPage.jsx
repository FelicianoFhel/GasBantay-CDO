import { useCallback, useEffect, useMemo, useState } from 'react';

const TOKEN_KEY = 'cdo_admin_token';

function apiBase() {
  const raw = import.meta.env.VITE_CHAT_API_URL;
  if (raw && String(raw).trim()) return String(raw).replace(/\/$/, '');
  return '/api';
}

export default function AdminPage() {
  const [token, setToken] = useState(() => localStorage.getItem(TOKEN_KEY) || '');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [loginError, setLoginError] = useState('');
  const [stations, setStations] = useState([]);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [editingId, setEditingId] = useState('');
  const [form, setForm] = useState({ name: '', address: '', lat: '', lng: '' });

  const isLoggedIn = Boolean(token);

  const authHeaders = useMemo(
    () => ({ Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' }),
    [token]
  );

  const loadStations = useCallback(async () => {
    if (!token) return;
    setLoading(true);
    setError('');
    try {
      const res = await fetch(`${apiBase()}/admin-stations`, { headers: authHeaders });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || 'Failed to load stations');
      setStations(Array.isArray(data.stations) ? data.stations : []);
    } catch (e) {
      setError(e.message || 'Failed to load stations');
    } finally {
      setLoading(false);
    }
  }, [token, authHeaders]);

  useEffect(() => {
    loadStations();
  }, [loadStations]);

  const onLogin = async (e) => {
    e.preventDefault();
    setLoginError('');
    try {
      const res = await fetch(`${apiBase()}/admin-login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username, password }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data.token) throw new Error(data.error || 'Login failed');
      localStorage.setItem(TOKEN_KEY, data.token);
      setToken(data.token);
      setPassword('');
    } catch (e2) {
      setLoginError(e2.message || 'Login failed');
    }
  };

  const resetForm = () => {
    setEditingId('');
    setForm({ name: '', address: '', lat: '', lng: '' });
  };

  const onSave = async (e) => {
    e.preventDefault();
    setSaving(true);
    setError('');
    try {
      const payload = {
        name: form.name,
        address: form.address,
        lat: Number(form.lat),
        lng: Number(form.lng),
      };
      const url = editingId
        ? `${apiBase()}/admin-stations?id=${encodeURIComponent(editingId)}`
        : `${apiBase()}/admin-stations`;
      const res = await fetch(url, {
        method: editingId ? 'PUT' : 'POST',
        headers: authHeaders,
        body: JSON.stringify(payload),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || 'Save failed');
      resetForm();
      await loadStations();
    } catch (e2) {
      setError(e2.message || 'Save failed');
    } finally {
      setSaving(false);
    }
  };

  const onEdit = (s) => {
    setEditingId(s.id);
    setForm({
      name: s.name || '',
      address: s.address || '',
      lat: String(s.lat ?? ''),
      lng: String(s.lng ?? ''),
    });
  };

  const onDelete = async (id) => {
    if (!confirm('Delete this station? Related reports may be removed by cascade.')) return;
    setError('');
    try {
      const res = await fetch(`${apiBase()}/admin-stations?id=${encodeURIComponent(id)}`, {
        method: 'DELETE',
        headers: authHeaders,
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || 'Delete failed');
      await loadStations();
      if (editingId === id) resetForm();
    } catch (e2) {
      setError(e2.message || 'Delete failed');
    }
  };

  const onLogout = () => {
    localStorage.removeItem(TOKEN_KEY);
    setToken('');
    setStations([]);
    resetForm();
  };

  if (!isLoggedIn) {
    return (
      <main className="admin-page">
        <section className="admin-login-card">
          <h1>Admin Login</h1>
          <p>Manage station data (CRUD) for CDO Gas Bantay.</p>
          <form onSubmit={onLogin} className="admin-form">
            <label>
              Username
              <input value={username} onChange={(e) => setUsername(e.target.value)} required />
            </label>
            <label>
              Password
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
              />
            </label>
            {loginError && <p className="admin-error">{loginError}</p>}
            <button type="submit" className="btn-primary">
              Login
            </button>
          </form>
        </section>
      </main>
    );
  }

  return (
    <main className="admin-page">
      <section className="admin-shell">
        <header className="admin-head">
          <h1>CDO Gas Bantay Admin</h1>
          <div className="admin-head__actions">
            <button className="btn-secondary" type="button" onClick={loadStations}>
              Refresh
            </button>
            <button className="btn-secondary" type="button" onClick={onLogout}>
              Logout
            </button>
          </div>
        </header>

        <section className="admin-panel">
          <h2>{editingId ? 'Edit Station' : 'Create Station'}</h2>
          <form onSubmit={onSave} className="admin-form admin-form--grid">
            <label>
              Name
              <input
                value={form.name}
                onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
                required
              />
            </label>
            <label>
              Address
              <input
                value={form.address}
                onChange={(e) => setForm((f) => ({ ...f, address: e.target.value }))}
              />
            </label>
            <label>
              Latitude
              <input
                type="number"
                step="0.000001"
                value={form.lat}
                onChange={(e) => setForm((f) => ({ ...f, lat: e.target.value }))}
                required
              />
            </label>
            <label>
              Longitude
              <input
                type="number"
                step="0.000001"
                value={form.lng}
                onChange={(e) => setForm((f) => ({ ...f, lng: e.target.value }))}
                required
              />
            </label>
            <div className="admin-form__actions">
              <button type="submit" className="btn-primary" disabled={saving}>
                {saving ? 'Saving…' : editingId ? 'Update' : 'Create'}
              </button>
              {editingId && (
                <button type="button" className="btn-secondary" onClick={resetForm}>
                  Cancel
                </button>
              )}
            </div>
          </form>
          {error && <p className="admin-error">{error}</p>}
        </section>

        <section className="admin-panel">
          <h2>Stations ({stations.length})</h2>
          {loading ? (
            <p>Loading stations…</p>
          ) : (
            <div className="admin-table-wrap">
              <table className="admin-table">
                <thead>
                  <tr>
                    <th>Name</th>
                    <th>Address</th>
                    <th>Lat</th>
                    <th>Lng</th>
                    <th>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {stations.map((s) => (
                    <tr key={s.id}>
                      <td>{s.name}</td>
                      <td>{s.address || '—'}</td>
                      <td>{s.lat}</td>
                      <td>{s.lng}</td>
                      <td className="admin-table__actions">
                        <button type="button" className="btn-secondary" onClick={() => onEdit(s)}>
                          Edit
                        </button>
                        <button
                          type="button"
                          className="btn-secondary"
                          onClick={() => onDelete(s.id)}
                        >
                          Delete
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
      </section>
    </main>
  );
}

