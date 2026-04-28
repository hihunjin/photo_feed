import React, { useState } from 'react';
import { login } from '../api';
import ThemeToggle from '../components/ThemeToggle';

export default function LoginPage({ onLogin }) {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  async function handleSubmit(event) {
    event.preventDefault();
    setError('');
    setLoading(true);
    try {
      const result = await login(username, password);
      localStorage.setItem('token', result.accessToken);
      onLogin(result.user);
    } catch (submitError) {
      setError(submitError.message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="login-container">
      <div className="card login-card grid" style={{ gap: 0 }}>
        <div className="login-header">
          <div className="topbar-logo" style={{ width: 48, height: 48, fontSize: 18, margin: '0 auto 16px', borderRadius: 14 }}>PF</div>
          <h1>Photo Feed</h1>
          <p className="muted" style={{ marginTop: 6 }}>Sign in to view bands, feeds, and albums.</p>
        </div>
        <form className="grid" onSubmit={handleSubmit} style={{ gap: 14 }}>
          <input
            className="input"
            name="username"
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            placeholder="Username"
            autoComplete="username"
          />
          <input
            className="input"
            name="password"
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="Password"
            autoComplete="current-password"
          />
          {error ? <p className="error-text">{error}</p> : null}
          <button className="btn btn-primary" type="submit" disabled={loading} style={{ width: '100%', marginTop: 4 }}>
            {loading ? 'Signing in…' : 'Sign In'}
          </button>
        </form>
        <div style={{ textAlign: 'center', marginTop: 20 }}>
          <ThemeToggle />
        </div>
      </div>
    </div>
  );
}
