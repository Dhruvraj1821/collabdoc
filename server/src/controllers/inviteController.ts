import { Response } from 'express';
import { z } from 'zod';
import prisma from '../db/prisma.js';
import { AuthRequest } from '../middleware/auth.js';

// ── Validation ────────────────────────────────────────────────────────────────

const addMemberSchema = z.object({
  username: z.string().min(1),
  role: z.enum(['EDITOR', 'VIEWER']),
});

// ── Helper — verify requester is OWNER ────────────────────────────────────────

async function requireOwner(
  userId: string,
  docId: string
): Promise<boolean> {
  const doc = await prisma.document.findUnique({
    where: { id: docId },
    select: { ownerId: true },
  });
  return doc?.ownerId === userId;
}

// ── GET /api/docs/:id/members ─────────────────────────────────────────────────

export async function listMembers(
  req: AuthRequest,
  res: Response
): Promise<void> {
  try {
    const docId = req.params.id as string;
    const userId = req.user!.userId;

    // Any member of the doc can view the member list
    const doc = await prisma.document.findUnique({
      where: { id: docId },
      select: { ownerId: true },
    });

    if (!doc) {
      res.status(404).json({ error: 'Document not found' });
      return;
    }

    const isOwner = doc.ownerId === userId;

    if (!isOwner) {
      const membership = await prisma.docMember.findUnique({
        where: { userId_documentId: { userId, documentId: docId } },
        select: { role: true },
      });
      if (!membership) {
        res.status(403).json({ error: 'Access denied' });
        return;
      }
    }

    const members = await prisma.docMember.findMany({
      where: { documentId: docId },
      include: {
        user: { select: { id: true, username: true, email: true } },
      },
      orderBy: { joinedAt: 'asc' },
    });

    const result = members.map(m => ({
      userId: m.user.id,
      username: m.user.username,
      email: m.user.email,
      role: m.role,
      isOwner: m.user.id === doc.ownerId,
    }));

    res.json({ members: result });
  } catch (err) {
    console.error('listMembers error:', err);
    res.status(500).json({ error: 'Failed to list members' });
  }
}

// ── POST /api/docs/:id/members ────────────────────────────────────────────────

export async function addMember(
  req: AuthRequest,
  res: Response
): Promise<void> {
  try {
    const docId = req.params.id as string;
    const userId = req.user!.userId;

    const isOwner = await requireOwner(userId, docId);
    if (!isOwner) {
      res.status(403).json({ error: 'Only the owner can invite members' });
      return;
    }

    const parsed = addMemberSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: z.treeifyError(parsed.error) });
      return;
    }

    const { username, role } = parsed.data;

    // Look up target user
    const target = await prisma.user.findUnique({
      where: { username },
      select: { id: true, username: true, email: true },
    });

    if (!target) {
      res.status(404).json({ error: `No user found with username "${username}"` });
      return;
    }

    // Can't invite yourself
    if (target.id === userId) {
      res.status(400).json({ error: 'You cannot invite yourself' });
      return;
    }

    // Already a member?
    const existing = await prisma.docMember.findUnique({
      where: { userId_documentId: { userId: target.id, documentId: docId } },
    });

    if (existing) {
      res.status(409).json({ error: `${username} is already a member of this document` });
      return;
    }

    const member = await prisma.docMember.create({
      data: {
        userId: target.id,
        documentId: docId,
        role,
      },
    });

    res.status(201).json({
      userId: target.id,
      username: target.username,
      email: target.email,
      role: member.role,
      isOwner: false,
    });
  } catch (err) {
    console.error('addMember error:', err);
    res.status(500).json({ error: 'Failed to add member' });
  }
}

// ── DELETE /api/docs/:id/members/:userId ──────────────────────────────────────

export async function removeMember(
  req: AuthRequest,
  res: Response
): Promise<void> {
  try {
    const docId = req.params.id as string;
    const targetUserId = req.params.userId as string;
    const requesterId = req.user!.userId;

    const isOwner = await requireOwner(requesterId, docId);
    if (!isOwner) {
      res.status(403).json({ error: 'Only the owner can remove members' });
      return;
    }

    // Can't remove yourself (the owner)
    if (targetUserId === requesterId) {
      res.status(400).json({ error: 'The owner cannot be removed from the document' });
      return;
    }

    const membership = await prisma.docMember.findUnique({
      where: { userId_documentId: { userId: targetUserId, documentId: docId } },
    });

    if (!membership) {
      res.status(404).json({ error: 'Member not found' });
      return;
    }

    await prisma.docMember.delete({
      where: { userId_documentId: { userId: targetUserId, documentId: docId } },
    });

    res.status(204).send();
  } catch (err) {
    console.error('removeMember error:', err);
    res.status(500).json({ error: 'Failed to remove member' });
  }
}