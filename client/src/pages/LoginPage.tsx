import { useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { login, saveAuth } from '../services/authService.js';
import { useAuth } from '../context/AuthContext.js';

export default function LoginPage() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const navigate = useNavigate();
  const { refreshAuth } = useAuth();

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      const data = await login(email, password);
      saveAuth(data);
      refreshAuth();
      navigate('/dashboard');
    } catch (err: any) {
      setError(err.response?.data?.error ?? 'Login failed');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="page-wrap" style={{
      minHeight: '100vh',
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      justifyContent: 'center',
      padding: '24px',
    }}>

      {/* Wordmark */}
      <div style={{ marginBottom: '36px', textAlign: 'center' }}>
        <div className="analog-wordmark font-display" style={{ fontSize: '32px' }}>
          Collab<span>Doc</span>
        </div>
        <div className="font-typewriter" style={{
          fontSize: '11px',
          color: 'var(--ink-faded)',
          letterSpacing: '0.18em',
          marginTop: '6px',
          textTransform: 'uppercase',
        }}>
          Collaborative Text Editor
        </div>
      </div>

      {/* Auth panel */}
      <div className="auth-panel anim-ink-drop">
        <div className="auth-panel-title">Sign In</div>
        <div className="auth-panel-subtitle">Enter your credentials to continue</div>

        {error && (
          <div className="notice-error" style={{ marginBottom: '24px' }}>
            {error}
          </div>
        )}

        <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
          <div className="analog-field">
            <label className="analog-label">Email Address</label>
            <input
              type="email"
              value={email}
              onChange={e => setEmail(e.target.value)}
              className="analog-input"
              placeholder="your@email.com"
              required
            />
          </div>

          <div className="analog-field">
            <label className="analog-label">Password</label>
            <input
              type="password"
              value={password}
              onChange={e => setPassword(e.target.value)}
              className="analog-input"
              placeholder="········"
              required
            />
          </div>

          <button
            type="submit"
            disabled={loading}
            className="btn-press btn-press-accent"
            style={{ width: '100%', marginTop: '8px' }}
          >
            {loading ? 'Signing in...' : 'Sign In'}
          </button>
        </form>

        <div style={{
          marginTop: '28px',
          paddingTop: '20px',
          borderTop: '1px dashed var(--paper-line)',
          fontFamily: "'Special Elite', monospace",
          fontSize: '12px',
          color: 'var(--ink-faded)',
          textAlign: 'center',
        }}>
          No account yet?{' '}
          <Link to="/register" className="analog-link">
            Create one
          </Link>
        </div>
      </div>

      <div className="font-typewriter" style={{
        marginTop: '28px',
        fontSize: '10px',
        color: 'var(--ink-ghost)',
        letterSpacing: '0.12em',
        textTransform: 'uppercase',
      }}>
        CollabDoc · EuroSys 2025 · Eg-Walker CRDT
      </div>
    </div>
  );
}