import { Response } from 'express';
import { z } from 'zod';
import prisma from '../db/prisma.js';
import { AuthRequest } from '../middleware/auth.js';

// ── Validation schemas ────────────────────────────────────────────────────────

const createDocSchema = z.object({
  title: z.string().min(1).max(100).default('Untitled'),
});

const updateDocSchema = z.object({
  title: z.string().min(1).max(100),
});

// ── Helper — check user has required role on a document ───────────────────────

async function getUserRole(
  userId: string,
  docId: string
): Promise<'OWNER' | 'EDITOR' | 'VIEWER' | null> {
  const doc = await prisma.document.findUnique({
    where: { id: docId },
    select: { ownerId: true },
  });

  if (!doc) return null;
  if (doc.ownerId === userId) return 'OWNER';

  const membership = await prisma.docMember.findUnique({
    where: { userId_documentId: { userId, documentId: docId } },
    select: { role: true },
  });

  return membership?.role ?? null;
}

// ── Create document ───────────────────────────────────────────────────────────

export async function createDocument(
  req: AuthRequest,
  res: Response
): Promise<void> {
  try {
    const parsed = createDocSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: z.treeifyError(parsed.error) });
      return;
    }

    const { title } = parsed.data;
    const userId = req.user!.userId;

    const doc = await prisma.document.create({
      data: {
        title,
        ownerId: userId,
        members: {
          create: { userId, role: 'OWNER' },
        },
      },
    });

    res.status(201).json({ id: doc.id, title: doc.title, role: 'OWNER' });
  } catch (err) {
    console.error('createDocument error:', err);
    res.status(500).json({ error: 'Failed to create document' });
  }
}

// ── List documents for the current user ───────────────────────────────────────

export async function listDocuments(
  req: AuthRequest,
  res: Response
): Promise<void> {
  try {
    const userId = req.user!.userId;

    const memberships = await prisma.docMember.findMany({
      where: { userId },
      include: {
        document: {
          select: { id: true, title: true, updatedAt: true, ownerId: true },
        },
      },
      orderBy: { document: { updatedAt: 'desc' } },
    });

    const docs = memberships.map(m => ({
      id: m.document.id,
      title: m.document.title,
      updatedAt: m.document.updatedAt,
      role: m.role,
      isOwner: m.document.ownerId === userId,
    }));

    res.json({ documents: docs });
  } catch (err) {
    console.error('listDocuments error:', err);
    res.status(500).json({ error: 'Failed to list documents' });
  }
}

// ── Get a single document

export async function getDocument(req: AuthRequest, res: Response) {
  try {
    const id = req.params.id as string;
    const userId = req.user!.userId;

    const doc = await prisma.document.findUnique({
      where: { id },
      select: { id: true, title: true, ownerId: true, updatedAt: true },
    });

    if (!doc) return res.status(404).json({ error: 'Document not found' });

    if (doc.ownerId === userId) {
      return res.json({ id: doc.id, title: doc.title, role: 'OWNER', updatedAt: doc.updatedAt });
    }

    const membership = await prisma.docMember.findUnique({
      where: { userId_documentId: { userId, documentId: id } },
      select: { role: true },
    });

    if (!membership) return res.status(404).json({ error: 'Document not found' });

    return res.json({ id: doc.id, title: doc.title, role: membership.role, updatedAt: doc.updatedAt });
  } catch (err) {
    console.error('getDocument error:', err);
    return res.status(500).json({ error: 'Internal server error' });
  }
}

// ── Update document title ─────────────────────────────────────────────────────

export async function updateDocument(
  req: AuthRequest,
  res: Response
): Promise<void> {
  try {
    const userId = req.user!.userId;
    const docId = req.params.id as string;

    const role = await getUserRole(userId, docId);
    if (!role) {
      res.status(404).json({ error: 'Document not found' });
      return;
    }

    if (role !== 'OWNER') {
      res.status(403).json({ error: 'Only the owner can rename this document' });
      return;
    }

    const parsed = updateDocSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: z.treeifyError(parsed.error) });
      return;
    }

    const doc = await prisma.document.update({
      where: { id: docId },
      data: { title: parsed.data.title },
    });

    res.json({ id: doc.id, title: doc.title });
  } catch (err) {
    console.error('updateDocument error:', err);
    res.status(500).json({ error: 'Failed to update document' });
  }
}

// ── Delete document ───────────────────────────────────────────────────────────

export async function deleteDocument(
  req: AuthRequest,
  res: Response
): Promise<void> {
  try {
    const userId = req.user!.userId;
    const docId = req.params.id as string;

    const role = await getUserRole(userId, docId);
    if (!role) {
      res.status(404).json({ error: 'Document not found' });
      return;
    }

    if (role !== 'OWNER') {
      res.status(403).json({ error: 'Only the owner can delete this document' });
      return;
    }

    // Delete in correct order — children before parents (foreign key constraints)
    await prisma.event.deleteMany({ where: { documentId: docId } });
    await prisma.docMember.deleteMany({ where: { documentId: docId } });
    await prisma.document.delete({ where: { id: docId } });

    res.status(204).send();
  } catch (err) {
    console.error('deleteDocument error:', err);
    res.status(500).json({ error: 'Failed to delete document' });
  }
}