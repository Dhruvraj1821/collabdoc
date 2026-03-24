import { useState, useEffect } from 'react';
import { listMembers, addMember, removeMember } from '../services/docService.js';
import type { Member } from '../services/docService.js';

interface InvitePanelProps {
  docId: string;
  onClose: () => void;
}

export default function InvitePanel({ docId, onClose }: InvitePanelProps) {
  const [members, setMembers] = useState<Member[]>([]);
  const [loading, setLoading] = useState(true);
  const [username, setUsername] = useState('');
  const [role, setRole] = useState<'EDITOR' | 'VIEWER'>('EDITOR');
  const [inviting, setInviting] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [removingId, setRemovingId] = useState<string | null>(null);

  useEffect(() => {
    loadMembers();
  }, [docId]);

  async function loadMembers() {
    try {
      const data = await listMembers(docId);
      setMembers(data);
    } catch {
      setError('Failed to load members');
    } finally {
      setLoading(false);
    }
  }

  async function handleInvite(e: React.FormEvent) {
    e.preventDefault();
    if (!username.trim()) return;

    setInviting(true);
    setError('');
    setSuccess('');

    try {
      const newMember = await addMember(docId, username.trim(), role);
      setMembers(prev => [...prev, newMember]);
      setUsername('');
      setSuccess(`${newMember.username} added as ${role.toLowerCase()}`);
    } catch (err: any) {
      const msg = err.response?.data?.error ?? 'Failed to invite user';
      setError(msg);
    } finally {
      setInviting(false);
    }
  }

  async function handleRemove(member: Member) {
    if (!confirm(`Remove ${member.username} from this document?`)) return;

    setRemovingId(member.userId);
    setError('');
    setSuccess('');

    try {
      await removeMember(docId, member.userId);
      setMembers(prev => prev.filter(m => m.userId !== member.userId));
      setSuccess(`${member.username} removed`);
    } catch (err: any) {
      const msg = err.response?.data?.error ?? 'Failed to remove member';
      setError(msg);
    } finally {
      setRemovingId(null);
    }
  }

  return (
    <>
      {/* Backdrop */}
      <div
        onClick={onClose}
        style={{
          position: 'fixed', inset: 0,
          background: 'rgba(0,0,0,0.3)',
          zIndex: 100,
        }}
      />

      {/* Panel */}
      <div style={{
        position: 'fixed',
        top: '50%', left: '50%',
        transform: 'translate(-50%, -50%)',
        zIndex: 101,
        background: 'var(--parchment)',
        border: '1px solid var(--ink-ghost)',
        padding: '32px',
        width: '480px',
        maxWidth: '90vw',
        maxHeight: '80vh',
        display: 'flex',
        flexDirection: 'column',
        gap: '24px',
        boxShadow: '4px 4px 0 rgba(0,0,0,0.15)',
      }}>

        {/* Header */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <h2 className="font-display" style={{
            fontSize: '20px', fontWeight: 700,
            color: 'var(--ink)', margin: 0,
          }}>
            Manage Access
          </h2>
          <button
            onClick={onClose}
            className="btn-ghost"
            style={{ fontSize: '18px', lineHeight: 1, padding: '4px 8px' }}
          >
            ✕
          </button>
        </div>

        {/* Invite form */}
        <form onSubmit={handleInvite} style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
          <div className="analog-field">
            <label className="analog-label">Invite by Username</label>
            <div style={{ display: 'flex', gap: '8px' }}>
              <input
                type="text"
                value={username}
                onChange={e => { setUsername(e.target.value); setError(''); setSuccess(''); }}
                className="analog-input"
                placeholder="username"
                style={{ flex: 1 }}
                autoComplete="off"
              />
              <select
                value={role}
                onChange={e => setRole(e.target.value as 'EDITOR' | 'VIEWER')}
                className="analog-input"
                style={{ width: '100px', flexShrink: 0 }}
              >
                <option value="EDITOR">Editor</option>
                <option value="VIEWER">Viewer</option>
              </select>
              <button
                type="submit"
                disabled={inviting || !username.trim()}
                className="btn-press"
                style={{ whiteSpace: 'nowrap', flexShrink: 0 }}
              >
                {inviting ? '...' : 'Invite'}
              </button>
            </div>
          </div>

          {error && (
            <span className="font-typewriter" style={{
              fontSize: '11px', color: 'var(--error, #c0392b)',
              letterSpacing: '0.05em',
            }}>
              {error}
            </span>
          )}
          {success && (
            <span className="font-typewriter" style={{
              fontSize: '11px', color: 'var(--success, #27ae60)',
              letterSpacing: '0.05em',
            }}>
              ✓ {success}
            </span>
          )}
        </form>

        {/* Members list */}
        <div style={{ flex: 1, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '4px' }}>
          <span className="analog-label" style={{ marginBottom: '8px' }}>
            Current Members
          </span>

          {loading ? (
            <span className="font-typewriter" style={{ fontSize: '12px', color: 'var(--ink-faded)' }}>
              Loading...
            </span>
          ) : members.length === 0 ? (
            <span className="font-typewriter" style={{ fontSize: '12px', color: 'var(--ink-faded)' }}>
              No members yet
            </span>
          ) : (
            members.map(member => (
              <div
                key={member.userId}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  padding: '8px 12px',
                  background: 'var(--parchment-dark)',
                  border: '1px solid var(--ink-ghost)',
                }}
              >
                <div style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
                  <span style={{
                    fontFamily: "'Lato', sans-serif",
                    fontSize: '13px',
                    color: 'var(--ink)',
                    fontWeight: 600,
                  }}>
                    {member.username}
                  </span>
                  <span className="font-typewriter" style={{
                    fontSize: '10px', color: 'var(--ink-faded)',
                  }}>
                    {member.email}
                  </span>
                </div>

                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <span className="font-typewriter" style={{
                    fontSize: '10px',
                    color: 'var(--ink-ghost)',
                    border: '1px solid var(--ink-ghost)',
                    padding: '2px 8px',
                    letterSpacing: '0.1em',
                    textTransform: 'uppercase',
                  }}>
                    {member.role}
                  </span>

                  {!member.isOwner && (
                    <button
                      onClick={() => handleRemove(member)}
                      disabled={removingId === member.userId}
                      className="btn-danger-ghost"
                      style={{ fontSize: '11px', padding: '2px 8px' }}
                    >
                      {removingId === member.userId ? '...' : 'Remove'}
                    </button>
                  )}
                </div>
              </div>
            ))
          )}
        </div>
      </div>
    </>
  );
}