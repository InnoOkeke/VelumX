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
        const decodedHeader = jwt.decode(token, { complete: true }) as any;
        const alg = decodedHeader?.header?.alg;
        console.log("Relayer Auth: Attempting verification. Algorithm:", alg);
        
        let decoded: any;
        try {
            // Try with raw secret
            decoded = jwt.verify(token, jwtSecret, { algorithms: ['HS256', 'HS384', 'HS512', 'ES256'] });
        } catch (rawError: any) {
            console.log("Relayer Auth: Verification with raw secret failed, trying Base64 decode...");
            // Try with Base64 decoded secret (common for Supabase)
            const decodedSecret = Buffer.from(jwtSecret, 'base64');
            decoded = jwt.verify(token, decodedSecret, { algorithms: ['HS256', 'HS384', 'HS512', 'ES256'] });
        }
        
        req.userId = decoded.sub;
        next();
    } catch (error: any) {
        console.error("Relayer Auth: JWT verification finally failed!", {
            error: error.message,
            tokenSnippet: token.substring(0, 10) + "...",
            header: jwt.decode(token, { complete: true })?.header
        });
        return res.status(401).json({ error: 'Unauthorized', details: error.message });
    }
};
