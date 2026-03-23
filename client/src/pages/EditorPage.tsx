import { useEffect, useRef, useState, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { getDocument } from '../services/docService.js';
import type { DocDetail } from '../services/docService.js';
import { useWebSocket } from '../hooks/useWebSocket.js';
import { diffContent, generateEventId } from '../hooks/useTextareaEditor.js';
import { EgWalker } from '../crdt/egWalker.js';
import type { EgEvent, EventId, TransformedOp } from '../crdt/types.js';
import type { PresenceUser } from '../hooks/useWebSocket.js';

export default function EditorPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();

  const [doc, setDoc] = useState<DocDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [content, setContent] = useState('');
  const [presence, setPresence] = useState<PresenceUser[]>([]);

  const frontierRef = useRef<EventId[]>([]);
  const clientId = useRef<string>(`client-${generateEventId('init')}`);
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);
  const walkerRef = useRef<EgWalker>(new EgWalker());
  const docStateReceivedRef = useRef(false);

  // ── WebSocket callbacks ───────────────────────────────────────────────────

  const onDocState = useCallback((
    serverContent: string,
    frontier: EventId[],
    events: EgEvent[]
  ) => {
    // Replay all real events into a fresh client walker
    const newWalker = new EgWalker();
    for (const event of events) {
      if (!event.op || !event.op.type) continue;
      newWalker.applyEvent(event);
    }
    walkerRef.current = newWalker;
    setContent(serverContent);
    frontierRef.current = frontier;
    docStateReceivedRef.current = true;
  }, []);

  const onRemoteOp = useCallback((event: EgEvent, _transformedOp: TransformedOp) => {
    // Run through client walker for correct convergence
    const { transformedOp } = walkerRef.current.applyEvent(event);
    if (!transformedOp) return;

    const textarea = textareaRef.current;
    const selStart = textarea?.selectionStart ?? 0;
    const selEnd = textarea?.selectionEnd ?? 0;

    setContent(prev => {
      if (transformedOp.type === 'insert' && transformedOp.char) {
        return (
          prev.slice(0, transformedOp.index) +
          transformedOp.char +
          prev.slice(transformedOp.index)
        );
      } else if (transformedOp.type === 'delete') {
        return (
          prev.slice(0, transformedOp.index) +
          prev.slice(transformedOp.index + 1)
        );
      }
      return prev;
    });

    frontierRef.current = [event.id];

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

      textareaRef.current.selectionStart = Math.max(0, newStart);
      textareaRef.current.selectionEnd = Math.max(0, newEnd);
    });
  }, []);

  const onPresence = useCallback((users: PresenceUser[]) => {
    setPresence(users);
  }, []);

  // ── WebSocket ─────────────────────────────────────────────────────────────

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
    if (doc?.role === 'VIEWER') return;
    if(!docStateReceivedRef.current) return;

    const newContent = e.target.value;
    const oldContent = content;

    const events = diffContent(
      oldContent,
      newContent,
      frontierRef.current,
      clientId.current
    );

    setContent(newContent);

    for (const event of events) {
      walkerRef.current.applyEvent(event);
      sendOperation(event);
    }

    if (events.length > 0) {
      frontierRef.current = [events[events.length - 1].id];
    }
  }

  function handleSelect(e: React.SyntheticEvent<HTMLTextAreaElement>) {
    const target = e.target as HTMLTextAreaElement;
    sendCursor(target.selectionStart);
  }

  // ── Status ────────────────────────────────────────────────────────────────

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