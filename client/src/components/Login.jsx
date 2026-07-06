import React, { useState } from 'react';
import { KeyRound, Lock, AlertCircle } from 'lucide-react';

function Login({ onLoginSuccess }) {
  const [password, setPassword] = useState('');
  const [error, setError] = useState(null);
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!password) return;

    setError(null);
    setLoading(true);

    try {
      const res = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ password })
      });

      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.error || 'Authentication failed');
      }

      onLoginSuccess(data.token);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="login-screen">
      <div className="login-mesh" />
      <div className="login-card card">
        <div className="brand" style={{ borderBottom: 'none', marginBottom: '1.5rem', textAlign: 'center', alignItems: 'center' }}>
          <h1 className="brand-title" style={{ fontSize: '1.8rem' }}>Onyx Cockpit</h1>
          <span className="brand-subtitle">Diagnostics Lock</span>
        </div>

        <div className="login-icon-wrap">
          <KeyRound className="login-lock-icon" />
        </div>

        <form onSubmit={handleSubmit} style={{ width: '100%' }}>
          <div className="form-group" style={{ position: 'relative' }}>
            <label htmlFor="password-input" style={{ fontFamily: 'var(--mono)', fontSize: '0.75rem', letterSpacing: '1px' }}>
              ACCESS CODE REQUIRED
            </label>
            <div style={{ position: 'relative' }}>
              <input
                id="password-input"
                type="password"
                placeholder="Enter Access Key..."
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                disabled={loading}
                autoFocus
                required
                style={{ paddingLeft: '2.5rem', letterSpacing: password ? '0.3em' : 'normal' }}
              />
              <Lock style={{ position: 'absolute', left: '0.85rem', top: '50%', transform: 'translateY(-50%)', width: '16px', height: '16px', color: 'var(--text-muted)' }} />
            </div>
          </div>

          {error && (
            <div className="login-error-alert">
              <AlertCircle style={{ width: '16px', height: '16px', flexShrink: 0 }} />
              <span>{error}</span>
            </div>
          )}

          <button
            type="submit"
            className="btn btn-primary"
            style={{ width: '100%', marginTop: '1.25rem', padding: '0.8rem', display: 'flex', justifyContent: 'center', alignItems: 'center', gap: '0.5rem' }}
            disabled={loading}
          >
            {loading ? 'INITIALIZING LINK...' : 'ENGAGE COCKPIT'}
          </button>
        </form>
      </div>
    </div>
  );
}

export default Login;
