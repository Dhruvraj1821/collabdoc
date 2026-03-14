import { Request, Response, NextFunction } from "express";
import jwt from 'jsonwebtoken';
import { env } from '../config/env.js';

export interface AuthRequest extends Request {
    user?: {
        userId: string;
        username: string;
    }
}

export function authenticate(
    req: AuthRequest,
    res: Response,
    next: NextFunction
) : void {
    const authHeader = req.headers.authorization;

    if(!authHeader || !authHeader.startsWith('Bearer ')){
        res.status(401).json({ error: 'Missing or invalid authorization header'});
        return
    }

    const token = authHeader.split(' ')[1];

    try {
        const decoded = jwt.verify(token, env.JWT_SECRET) as {
            userId: string;
            username: string;
        };

        req.user = decoded;
        next();
    } catch {
        res.status(401).json({error: 'Invalid or expired token'});
    }
}