import api from './api.js';

export interface Doc {
  id: string;
  title: string;
  updatedAt: string;
  role: 'OWNER' | 'EDITOR' | 'VIEWER';
  isOwner: boolean;
}

export interface DocDetail extends Doc {
  content: string;
}

export interface Member {
  userId: string;
  username: string;
  email: string;
  role: 'OWNER' | 'EDITOR' | 'VIEWER';
  isOwner: boolean;
}

export async function listDocuments(): Promise<Doc[]> {
  const res = await api.get<{ documents: Doc[] }>('/api/docs');
  return res.data.documents;
}

export async function createDocument(title: string): Promise<Doc> {
  const res = await api.post<Doc>('/api/docs', { title });
  return res.data;
}

export async function getDocument(id: string): Promise<DocDetail> {
  const res = await api.get<DocDetail>(`/api/docs/${id}`);
  return res.data;
}

export async function updateDocument(id: string, title: string): Promise<Doc> {
  const res = await api.patch<Doc>(`/api/docs/${id}`, { title });
  return res.data;
}

export async function deleteDocument(id: string): Promise<void> {
  await api.delete(`/api/docs/${id}`);
}

// ── Member management ─────────────────────────────────────────────────────────

export async function listMembers(docId: string): Promise<Member[]> {
  const res = await api.get<{ members: Member[] }>(`/api/docs/${docId}/members`);
  return res.data.members;
}

export async function addMember(
  docId: string,
  username: string,
  role: 'EDITOR' | 'VIEWER'
): Promise<Member> {
  const res = await api.post<Member>(`/api/docs/${docId}/members`, { username, role });
  return res.data;
}

export async function removeMember(docId: string, userId: string): Promise<void> {
  await api.delete(`/api/docs/${docId}/members/${userId}`);
}