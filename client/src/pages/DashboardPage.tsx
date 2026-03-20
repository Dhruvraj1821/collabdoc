import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { listDocuments, createDocument, deleteDocument } from '../services/docService.js';
import type { Doc } from '../services/docService.js';
import { useAuth } from '../context/AuthContext.js';

export default function DashboardPage() {
  const [documents, setDocuments] = useState<Doc[]>([]);
  const [loading, setLoading] = useState(true);
  const [newTitle, setNewTitle] = useState('');
  const [creating, setCreating] = useState(false);
  const navigate = useNavigate();
  const { username, logout } = useAuth();

  useEffect(() => {
    loadDocuments();
  }, []);

  async function loadDocuments() {
    try {
      const docs = await listDocuments();
      setDocuments(docs);
    } catch (err) {
      console.error('Failed to load documents', err);
    } finally {
      setLoading(false);
    }
  }

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    if (!newTitle.trim()) return;
    setCreating(true);
    try {
      const doc = await createDocument(newTitle.trim());
      setDocuments(prev => [{ ...doc, updatedAt: new Date().toISOString(), isOwner: true }, ...prev]);
      setNewTitle('');
    } catch (err) {
      console.error('Failed to create document', err);
    } finally {
      setCreating(false);
    }
  }

  async function handleDelete(e: React.MouseEvent, id: string) {
    e.stopPropagation();
    if (!confirm('rm -rf document? This cannot be undone.')) return;
    try {
      await deleteDocument(id);
      setDocuments(prev => prev.filter(d => d.id !== id));
    } catch (err) {
      console.error('Failed to delete document', err);
    }
  }

  return (
    <div className="terminal-screen" style={{ minHeight: '100vh' }}>

      {/* Nav */}
      <nav className="terminal-nav">
        <div className="terminal-logo" style={{ fontSize: '16px' }}>
          COLLABDOC
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '20px' }}>
          <span className="terminal-nav-user">{username}</span>
          <button
            onClick={logout}
            className="terminal-btn"
            style={{ padding: '6px 14px', fontSize: '11px' }}
          >
            logout
          </button>
        </div>
      </nav>

      <div style={{ maxWidth: '760px', margin: '0 auto', padding: '40px 24px' }}>

        {/* System info bar */}
        <div style={{
          display: 'flex',
          gap: '24px',
          marginBottom: '32px',
          color: 'var(--text-dim)',
          fontSize: '11px',
          letterSpacing: '0.1em',
          borderBottom: '1px solid rgba(0,255,65,0.08)',
          paddingBottom: '16px',
        }}>
          <span>DOCS: {documents.length}</span>
          <span>USER: {username?.toUpperCase()}</span>
          <span>STATUS: <span style={{ color: 'var(--green)' }}>ONLINE</span></span>
        </div>

        {/* Create new */}
        <div className="terminal-window" style={{ marginBottom: '24px' }}>
          <div className="terminal-header">
            <div className="terminal-dot" />
            <div className="terminal-dot" />
            <div className="terminal-dot" />
            <span className="terminal-title">create — new document</span>
          </div>
          <div style={{ padding: '16px' }}>
            <form onSubmit={handleCreate} style={{ display: 'flex', gap: '12px' }}>
              <div className="prompt-line" style={{ flex: 1 }}>
                <input
                  type="text"
                  value={newTitle}
                  onChange={e => setNewTitle(e.target.value)}
                  className="terminal-input"
                  placeholder="document_title"
                  style={{ flex: 1 }}
                />
              </div>
              <button
                type="submit"
                disabled={creating || !newTitle.trim()}
                className="terminal-btn"
                style={{ whiteSpace: 'nowrap' }}
              >
                {creating ? 'creating...' : 'touch'}
              </button>
            </form>
          </div>
        </div>

        {/* Document list */}
        <div className="terminal-window">
          <div className="terminal-header">
            <div className="terminal-dot" />
            <div className="terminal-dot" />
            <div className="terminal-dot" />
            <span className="terminal-title">ls ~/docs</span>
          </div>

          <div className="terminal-section-title">
            documents — {documents.length} file{documents.length !== 1 ? 's' : ''}
          </div>

          {loading ? (
            <div style={{ padding: '24px 16px' }}>
              <span className="terminal-loading">loading filesystem...</span>
            </div>
          ) : documents.length === 0 ? (
            <div className="terminal-empty">
              run touch to create your first document
            </div>
          ) : (
            <div>
              {documents.map((doc, i) => (
                <div
                  key={doc.id}
                  className="terminal-file-entry"
                  onClick={() => navigate(`/docs/${doc.id}`)}
                  style={{ animationDelay: `${i * 0.05}s` }}
                >
                  <div>
                    <div className="file-name">{doc.title}</div>
                    <div className="file-meta">
                      {doc.role.toLowerCase()} · modified {new Date(doc.updatedAt).toLocaleDateString()} · id:{doc.id.slice(0, 8)}
                    </div>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
                    <span style={{
                      fontSize: '10px',
                      color: 'var(--text-dim)',
                      border: '1px solid rgba(0,255,65,0.2)',
                      padding: '2px 8px',
                      letterSpacing: '0.1em',
                    }}>
                      {doc.role}
                    </span>
                    {doc.isOwner && (
                      <button
                        onClick={(e) => handleDelete(e, doc.id)}
                        className="terminal-btn terminal-btn-danger"
                        style={{ padding: '4px 12px', fontSize: '11px' }}
                      >
                        delete
                      </button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* Footer */}
          <div style={{
            padding: '10px 16px',
            borderTop: '1px solid rgba(0,255,65,0.08)',
            color: 'var(--text-muted)',
            fontSize: '10px',
            letterSpacing: '0.1em',
          }}>
            click any file to open · <span className="cursor" />
          </div>
        </div>
      </div>
    </div>
  );
}