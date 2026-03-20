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
    if (!confirm('Delete this document? This cannot be undone.')) return;
    try {
      await deleteDocument(id);
      setDocuments(prev => prev.filter(d => d.id !== id));
    } catch (err) {
      console.error('Failed to delete', err);
    }
  }

  return (
    <div className="page-wrap">

      {/* Nav */}
      <nav className="analog-nav">
        <div className="analog-wordmark font-display">
          Collab<span>Doc</span>
        </div>
        <div className="analog-nav-right">
          <span className="font-typewriter" style={{ fontSize: '12px' }}>
            {username}
          </span>
          <button onClick={logout} className="btn-ghost">
            Sign out
          </button>
        </div>
      </nav>

      <div style={{ maxWidth: '780px', margin: '0 auto', padding: '48px 24px' }}>

        {/* Page heading */}
        <div style={{ marginBottom: '36px' }}>
          <h1 className="font-display" style={{
            fontSize: '32px',
            fontWeight: '700',
            color: 'var(--ink)',
            margin: 0,
            lineHeight: 1.2,
          }}>
            Your Documents
          </h1>
          <p className="font-typewriter" style={{
            fontSize: '11px',
            color: 'var(--ink-faded)',
            marginTop: '8px',
            letterSpacing: '0.1em',
            textTransform: 'uppercase',
          }}>
            {documents.length} file{documents.length !== 1 ? 's' : ''} · {username}
          </p>
        </div>

        {/* New document */}
        <div className="new-doc-strip">
          <div className="analog-field" style={{ flex: 1 }}>
            <label className="analog-label">New Document Title</label>
            <form
              onSubmit={handleCreate}
              style={{ display: 'flex', gap: '12px', alignItems: 'flex-end' }}
            >
              <input
                type="text"
                value={newTitle}
                onChange={e => setNewTitle(e.target.value)}
                className="analog-input"
                placeholder="Untitled document..."
                style={{ flex: 1 }}
              />
              <button
                type="submit"
                disabled={creating || !newTitle.trim()}
                className="btn-press"
                style={{ whiteSpace: 'nowrap', flexShrink: 0 }}
              >
                {creating ? 'Creating...' : '+ New'}
              </button>
            </form>
          </div>
        </div>

        {/* Document grid */}
        {loading ? (
          <div style={{
            textAlign: 'center',
            padding: '60px',
            fontFamily: "'Special Elite', monospace",
            fontSize: '13px',
            color: 'var(--ink-faded)',
            letterSpacing: '0.1em',
          }}>
            Loading your documents...
          </div>
        ) : documents.length === 0 ? (
          <div className="empty-state">
            <span className="empty-state-icon">✍</span>
            <span className="empty-state-text">No documents yet — create your first one above</span>
          </div>
        ) : (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: '20px' }}>
            {documents.map((doc, i) => (
              <div
                key={doc.id}
                className="index-card"
                style={{ animationDelay: `${i * 0.06}s` }}
                onClick={() => navigate(`/docs/${doc.id}`)}
              >
                <div className="index-card-title">{doc.title}</div>

                <div className="index-card-meta">
                  {new Date(doc.updatedAt).toLocaleDateString('en-US', {
                    month: 'short', day: 'numeric', year: 'numeric'
                  })}
                </div>

                <div className="index-card-footer">
                  <span className="font-typewriter" style={{
                    fontSize: '10px',
                    color: 'var(--ink-ghost)',
                    border: '1px solid var(--ink-ghost)',
                    padding: '2px 8px',
                    letterSpacing: '0.1em',
                    textTransform: 'uppercase',
                  }}>
                    {doc.role}
                  </span>

                  {doc.isOwner && (
                    <button
                      className="btn-danger-ghost"
                      onClick={(e) => handleDelete(e, doc.id)}
                    >
                      Delete
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}