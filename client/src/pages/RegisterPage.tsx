import { useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { register, saveAuth } from '../services/authService.js';
import { useAuth } from '../context/AuthContext.js';

export default function RegisterPage() {
  const [email, setEmail] = useState('');
  const [username, setUsername] = useState('');
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
      const data = await register(email, username, password);
      saveAuth(data);
      refreshAuth();
      navigate('/dashboard');
    } catch (err: any) {
      setError(err.response?.data?.error ?? 'Registration failed');
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
            <span className="terminal-title">auth — register</span>
          </div>

          <div style={{ padding: '24px' }}>

            <div style={{ color: 'var(--text-dim)', fontSize: '12px', marginBottom: '20px', lineHeight: '1.6' }}>
              <span style={{ color: 'var(--green-dim)' }}>system</span>
              {' › '}Create a new user account.
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
                <label className="terminal-label">username</label>
                <div className="prompt-line">
                  <input
                    type="text"
                    value={username}
                    onChange={e => setUsername(e.target.value)}
                    className="terminal-input"
                    placeholder="min 3 chars"
                    required
                    minLength={3}
                    maxLength={20}
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
                    placeholder="min 8 chars"
                    required
                    minLength={8}
                  />
                </div>
              </div>

              <button
                type="submit"
                disabled={loading}
                className="terminal-btn terminal-btn-full"
                style={{ marginTop: '8px' }}
              >
                {loading ? 'creating account...' : 'register --new-user'}
              </button>
            </form>

            <div style={{ marginTop: '20px', borderTop: '1px solid rgba(0,255,65,0.08)', paddingTop: '16px', fontSize: '12px', color: 'var(--text-dim)' }}>
              already registered?{' '}
              <Link to="/login" className="terminal-link">
                login
              </Link>
            </div>
          </div>
        </div>

        <div style={{ textAlign: 'center', marginTop: '20px', color: 'var(--text-muted)', fontSize: '10px', letterSpacing: '0.15em' }}>
          SYSTEM READY <span className="cursor" />
        </div>
      </div>
    </div>
  );
}