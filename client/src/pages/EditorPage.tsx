import { useEffect, useRef, useState, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { getDocument } from '../services/docService.js';
import type { DocDetail } from '../services/docService.js';
import { useWebSocket } from '../hooks/useWebSocket.js';
import { diffContent, applyTransformedOp, generateEventId } from '../hooks/useTextareaEditor.js';
import type { EventId, TransformedOp } from '../types/crdt.js';
import type { PresenceUser } from '../hooks/useWebSocket.js';

export default function EditorPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();

  const [doc, setDoc] = useState<DocDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  // The single source of truth for editor content
  const [content, setContent] = useState('');
  const [presence, setPresence] = useState<PresenceUser[]>([]);

  // Refs that must not trigger re-renders
  const frontierRef = useRef<EventId[]>([]);
  const clientId = useRef<string>(`client-${generateEventId('init')}`);
  const isApplyingRemote = useRef(false);
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);

  // ── WebSocket callbacks ───────────────────────────────────────────────────

  const onDocState = useCallback((serverContent: string, frontier: EventId[]) => {
    setContent(serverContent);
    frontierRef.current = frontier;
  }, []);

  const onRemoteOp = useCallback((transformedOp: TransformedOp, eventId: string) => {
    isApplyingRemote.current = true;

    // Save cursor position before applying
    const textarea = textareaRef.current;
    const selStart = textarea?.selectionStart ?? 0;
    const selEnd = textarea?.selectionEnd ?? 0;

    setContent(prev => {
      const newContent = applyTransformedOp(prev, transformedOp);

      // Restore cursor after React re-renders
      // Adjust cursor if the op was before the cursor position
      requestAnimationFrame(() => {
        if (!textareaRef.current) return;
        let newStart = selStart;
        let newEnd = selEnd;

        if (transformedOp.type === 'insert' && transformedOp.index <= selStart) {
          newStart += 1;
          newEnd += 1;
        } else if (transformedOp.type === 'delete' && transformedOp.index < selStart) {
          newStart -= 1;
          newEnd -= 1;
        }

        textareaRef.current.selectionStart = newStart;
        textareaRef.current.selectionEnd = newEnd;
        isApplyingRemote.current = false;
      });

      return newContent;
    });

    // Update frontier with the remote event
    frontierRef.current = [eventId];
  }, []);

  const onPresence = useCallback((users: PresenceUser[]) => {
    setPresence(users);
  }, []);

  // ── WebSocket hook ────────────────────────────────────────────────────────

  const { connectionState, sendOperation, sendCursor } = useWebSocket(
    id,
    onDocState,
    onRemoteOp,
    onPresence
  );

  // ── Load document metadata ────────────────────────────────────────────────

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

  // ── Handle textarea change ────────────────────────────────────────────────

  function handleChange(e: React.ChangeEvent<HTMLTextAreaElement>) {
    // Skip if this change was triggered by a remote op
    if (isApplyingRemote.current) return;
    if (doc?.role === 'VIEWER') return;

    const newContent = e.target.value;
    const oldContent = content;

    // Diff old vs new to get events
    const events = diffContent(
      oldContent,
      newContent,
      frontierRef.current,
      clientId.current
    );

    // Update local content immediately
    setContent(newContent);

    // Send each event
    for (const event of events) {
      sendOperation(event);
    }

    // Update frontier to last event
    if (events.length > 0) {
      frontierRef.current = [events[events.length - 1].id];
    }
  }

  // ── Handle cursor move ────────────────────────────────────────────────────

  function handleSelect(e: React.SyntheticEvent<HTMLTextAreaElement>) {
    const target = e.target as HTMLTextAreaElement;
    sendCursor(target.selectionStart);
  }

  // ── Connection status ─────────────────────────────────────────────────────

  function getStatusLabel() {
    switch (connectionState) {
      case 'connected': return 'Live';
      case 'connecting': return 'Connecting...';
      case 'reconnecting': return 'Reconnecting...';
      case 'disconnected': return 'Offline';
    }
  }

  function getStatusClass() {
    switch (connectionState) {
      case 'connected': return 'connected';
      case 'connecting':
      case 'reconnecting': return 'reconnecting';
      case 'disconnected': return 'disconnected';
    }
  }

  // ── Render ────────────────────────────────────────────────────────────────

  if (loading) {
    return (
      <div className="page-wrap" style={{
        minHeight: '100vh', display: 'flex',
        alignItems: 'center', justifyContent: 'center',
      }}>
        <span className="font-typewriter" style={{ color: 'var(--ink-faded)', fontSize: '13px' }}>
          Loading document...
        </span>
      </div>
    );
  }

  if (error) {
    return (
      <div className="page-wrap" style={{
        minHeight: '100vh', display: 'flex', flexDirection: 'column',
        alignItems: 'center', justifyContent: 'center', gap: '20px',
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
          {/* Presence avatars */}
          {presence.length > 0 && (
            <div style={{ display: 'flex', gap: '4px' }}>
              {presence.map(user => (
                <div
                  key={user.userId}
                  title={user.username}
                  style={{
                    width: '26px', height: '26px',
                    borderRadius: '50%',
                    background: user.color,
                    border: '2px solid var(--parchment-dark)',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    fontSize: '11px', color: 'white', fontWeight: 700,
                    fontFamily: "'Lato', sans-serif",
                  }}
                >
                  {user.username[0].toUpperCase()}
                </div>
              ))}
            </div>
          )}

          {/* Connection status */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
            <span className={`status-dot ${getStatusClass()}`} />
            <span className="font-typewriter" style={{
              fontSize: '11px', color: 'var(--ink-faded)', letterSpacing: '0.08em',
            }}>
              {getStatusLabel()}
            </span>
          </div>

          <span className="font-typewriter" style={{
            fontSize: '10px', color: 'var(--ink-ghost)',
            border: '1px solid var(--ink-ghost)',
            padding: '2px 8px', letterSpacing: '0.1em', textTransform: 'uppercase',
          }}>
            {doc?.role}
          </span>
        </div>
      </div>

      {/* Textarea */}
      <div style={{ flex: 1, padding: '32px', overflow: 'hidden', display: 'flex' }}>
        <textarea
          ref={textareaRef}
          value={content}
          onChange={handleChange}
          onSelect={handleSelect}
          readOnly={doc?.role === 'VIEWER'}
          spellCheck={false}
          style={{
            flex: 1,
            width: '100%',
            resize: 'none',
            border: 'none',
            outline: 'none',
            background: 'transparent',
            fontFamily: "'IM Fell English', Georgia, serif",
            fontSize: '16px',
            lineHeight: '1.8',
            color: 'var(--ink)',
            letterSpacing: '0.02em',
          }}
          placeholder="Start writing..."
        />
      </div>

      {/* Status bar */}
      <div className="editor-statusbar">
        <span>CollabDoc · {doc?.title}</span>
        <span>
          {presence.length} user{presence.length !== 1 ? 's' : ''} · id: {id?.slice(0, 8)}
        </span>
      </div>
    </div>
  );
}