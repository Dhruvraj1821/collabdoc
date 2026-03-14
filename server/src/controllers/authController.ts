import { Request, Response } from 'express';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { z } from 'zod';
import prisma from '../db/prisma.js';
import { env } from '../config/env.js';

const registerSchema = z.object({
    email: z.string().email(),
    username: z.string().min(3).max(20),
    password: z.string().min(8),
});

const loginSchema = z.object({
    email: z.string().email(),
    password: z.string().min(1),
});

export async function register(req: Request, res: Response): Promise<void> {
    const parsed = registerSchema.safeParse(req.body);
    if (!parsed.success) {
        res.status(400).json({ error: z.treeifyError(parsed.error) });
        return;
    }

    const { email, username, password } = parsed.data;

    const passwordHash = await bcrypt.hash(password, 12);

    try {
        const user = await prisma.user.create({
            data: { email, username, passwordHash },
        });

        const token = jwt.sign(
            { userId: user.id, username: user.username },
            env.JWT_SECRET,
            { expiresIn: '7d' }
        );

        res.status(201).json({ token, userId: user.id, username: user.username });
    } catch {
        res.status(409).json({ error: 'Email or username already taken' });
    }
}

export async function login(req: Request, res: Response): Promise<void> {
    const parsed = loginSchema.safeParse(req.body);
    if (!parsed.success) {
        res.status(400).json({ error: z.treeifyError(parsed.error) });
        return; // ← this was missing
    }

    const { email, password } = parsed.data;

    const user = await prisma.user.findUnique({ where: { email } });

    const dummyHash = '$2a$12$dummy.hash.to.prevent.timing.attacks.xxxxxxxxxxxxxxxxx';

    const passwordMatch = await bcrypt.compare(
        password,
        user?.passwordHash ?? dummyHash
    );

    if (!user || !passwordMatch) {
        res.status(401).json({ error: 'Invalid email or password' });
        return;
    }

    const token = jwt.sign(
        { userId: user.id, username: user.username },
        env.JWT_SECRET,
        { expiresIn: '7d' }
    );

    res.json({ token, userId: user.id, username: user.username });
}