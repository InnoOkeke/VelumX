import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';

export interface AuthRequest extends Request {
    userId?: string;
}

export const verifySupabaseToken = (req: AuthRequest, res: Response, next: NextFunction) => {
    const authHeader = req.headers.authorization;

    if (!authHeader || !authHeader.startsWith('Bearer ')) {
        console.warn("Relayer Auth: Missing or invalid Bearer token header.");
        return res.status(401).json({ error: 'Missing or invalid authorization header' });
    }

    const token = authHeader.split(' ')[1];
    const jwtSecret = process.env.SUPABASE_JWT_SECRET;

    if (!jwtSecret) {
        console.error("Relayer Auth: SUPABASE_JWT_SECRET is not set in environment.");
        return res.status(500).json({ error: 'Server authentication misconfiguration' });
    }

    try {
        const decoded = jwt.verify(token, jwtSecret) as { sub: string };
        req.userId = decoded.sub;
        next();
    } catch (error: any) {
        console.error("Relayer Auth: JWT verification failed!", {
            error: error.message,
            tokenSnippet: token.substring(0, 10) + "..."
        });
        return res.status(401).json({ error: 'Unauthorized' });
    }
};
