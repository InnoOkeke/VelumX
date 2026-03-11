import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';

export interface AuthRequest extends Request {
    userId?: string;
}

export const verifySupabaseToken = (req: AuthRequest, res: Response, next: NextFunction) => {
    const authHeader = req.headers.authorization;

    if (!authHeader || !authHeader.startsWith('Bearer ')) {
        return res.status(401).json({ error: 'Missing or invalid authorization header' });
    }

    const token = authHeader.split(' ')[1];
    const jwtSecret = process.env.SUPABASE_JWT_SECRET;

    if (!jwtSecret) {
        console.error("Relayer Auth: SUPABASE_JWT_SECRET is not set in environment.");
        // In local development or if not yet configured, we might allow bypass IF explicitely enabled
        // but for safety, we'll fail fast.
        return res.status(500).json({ error: 'Server authentication misconfiguration' });
    }

    try {
        const decoded = jwt.verify(token, jwtSecret) as { sub: string };
        req.userId = decoded.sub; // 'sub' in Supabase JWT is the user's UUID
        next();
    } catch (error) {
        console.error("Relayer Auth: JWT verification failed:", error);
        return res.status(401).json({ error: 'Unauthorized' });
    }
};
