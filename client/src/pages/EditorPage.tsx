import { useEffect, useRef, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import Editor from '@monaco-editor/react';
import type { OnMount } from '@monaco-editor/react';
import type { editor } from 'monaco-editor';
import { getDocument } from '../services/docService.js';
import type { DocDetail } from '../services/docService.js';

export default function EditorPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();

  const [doc, setDoc] = useState<DocDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const editorRef = useRef<editor.IStandaloneCodeEditor | null>(null);

  useEffect(() => {
    if (!id) return;

    async function loadDocument() {
      try {
        const data = await getDocument(id!);
        setDoc(data);
      } catch (err: any) {
        if (err.response?.status === 404) {
          setError('Document not found');
        } else {
          setError('Failed to load document');
        }
      } finally {
        setLoading(false);
      }
    }

    loadDocument();
  }, [id]);

  const handleMount: OnMount = (editorInstance) => {
    editorRef.current = editorInstance;
    if (doc?.content !== undefined) {
      editorInstance.setValue(doc.content);
    }
    editorInstance.focus();
  };

  useEffect(() => {
    if (doc && editorRef.current) {
      editorRef.current.setValue(doc.content);
    }
  }, [doc]);

  if (loading) {
    return (
      <div className="page-wrap" style={{
        minHeight: '100vh',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
      }}>
        <span className="font-typewriter" style={{ color: 'var(--ink-faded)', fontSize: '13px', letterSpacing: '0.1em' }}>
          Loading document...
        </span>
      </div>
    );
  }

  if (error) {
    return (
      <div className="page-wrap" style={{
        minHeight: '100vh',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        gap: '20px',
      }}>
        <div className="notice-error">{error}</div>
        <button className="btn-press" onClick={() => navigate('/dashboard')}>
          ← Back to Dashboard
        </button>
      </div>
    );
  }

  return (
    <div className="page-wrap" style={{ display: 'flex', flexDirection: 'column', height: '100vh' }}>

      {/* Top bar */}
      <div className="editor-topbar">
        <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
          <button
            onClick={() => navigate('/dashboard')}
            className="btn-press btn-press-sm"
          >
            ← Dashboard
          </button>
          <span className="editor-doc-title">{doc?.title}</span>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
          {/* Connection status — wired in Step 22 */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
            <span className="status-dot disconnected" />
            <span className="font-typewriter" style={{ fontSize: '11px', color: 'var(--ink-faded)', letterSpacing: '0.08em' }}>
              Offline
            </span>
          </div>

          <span className="font-typewriter" style={{
            fontSize: '10px',
            color: 'var(--ink-ghost)',
            border: '1px solid var(--ink-ghost)',
            padding: '2px 8px',
            letterSpacing: '0.1em',
            textTransform: 'uppercase',
          }}>
            {doc?.role}
          </span>
        </div>
      </div>

      {/* Monaco */}
      <div style={{ flex: 1, overflow: 'hidden' }}>
        <Editor
          height="100%"
          defaultLanguage="plaintext"
          theme="vs"
          onMount={handleMount}
          options={{
            fontSize: 15,
            fontFamily: "'Special Elite', 'Courier New', monospace",
            lineNumbers: 'on',
            minimap: { enabled: false },
            scrollBeyondLastLine: false,
            wordWrap: 'on',
            readOnly: doc?.role === 'VIEWER',
            cursorStyle: 'line',
            cursorBlinking: 'smooth',
            renderLineHighlight: 'line',
            padding: { top: 24, bottom: 24 },
            lineHeight: 26,
            letterSpacing: 0.3,
          }}
        />
      </div>

      {/* Status bar */}
      <div className="editor-statusbar">
        <span>CollabDoc Editor · {doc?.title}</span>
        <span>id: {id?.slice(0, 8)} · Plain Text</span>
      </div>
    </div>
  );
}