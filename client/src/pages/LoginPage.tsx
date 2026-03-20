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
      setError(err.response?.data?.error ?? 'Authentication failed');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="terminal-screen" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '24px' }}>
      <div style={{ width: '100%', maxWidth: '420px', animation: 'fadeIn 0.4s ease' }}>

        {/* Logo */}
        <div style={{ marginBottom: '32px', textAlign: 'center' }}>
          <div className="terminal-logo">COLLABDOC</div>
          <div style={{ color: 'var(--text-dim)', fontSize: '11px', letterSpacing: '0.2em', marginTop: '6px' }}>
            COLLABORATIVE TEXT EDITOR v1.0.0
          </div>
        </div>

        {/* Window */}
        <div className="terminal-window">
          <div className="terminal-header">
            <div className="terminal-dot" />
            <div className="terminal-dot" />
            <div className="terminal-dot" />
            <span className="terminal-title">auth — login</span>
          </div>

          <div style={{ padding: '24px' }}>

            <div style={{ color: 'var(--text-dim)', fontSize: '12px', marginBottom: '20px', lineHeight: '1.6' }}>
              <span style={{ color: 'var(--green-dim)' }}>system</span>
              {' › '}Authenticate to access your workspace.
            </div>

            {error && (
              <div className="terminal-error" style={{ marginBottom: '16px' }}>
                {error}
              </div>
            )}

            <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
              <div>
                <label className="terminal-label">email_address</label>
                <div className="prompt-line">
                  <input
                    type="email"
                    value={email}
                    onChange={e => setEmail(e.target.value)}
                    className="terminal-input"
                    placeholder="user@domain.com"
                    required
                  />
                </div>
              </div>

              <div>
                <label className="terminal-label">password</label>
                <div className="prompt-line">
                  <input
                    type="password"
                    value={password}
                    onChange={e => setPassword(e.target.value)}
                    className="terminal-input"
                    placeholder="••••••••"
                    required
                  />
                </div>
              </div>

              <button
                type="submit"
                disabled={loading}
                className="terminal-btn terminal-btn-full"
                style={{ marginTop: '8px' }}
              >
                {loading ? 'authenticating...' : 'login'}
              </button>
            </form>

            <div style={{ marginTop: '20px', borderTop: '1px solid rgba(0,255,65,0.08)', paddingTop: '16px', fontSize: '12px', color: 'var(--text-dim)' }}>
              no account?{' '}
              <Link to="/register" className="terminal-link">
                register --new-user
              </Link>
            </div>
          </div>
        </div>

        {/* Footer */}
        <div style={{ textAlign: 'center', marginTop: '20px', color: 'var(--text-muted)', fontSize: '10px', letterSpacing: '0.15em' }}>
          SYSTEM READY <span className="cursor" />
        </div>
      </div>
    </div>
  );
}