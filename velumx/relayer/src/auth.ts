import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import jwksClient from 'jwks-rsa';

export interface AuthRequest extends Request {
    userId?: string;
}

const supabaseUrl = process.env.SUPABASE_URL || 'https://yjbsdesjzvuagcxntscd.supabase.co';
const client = jwksClient({
  jwksUri: `${supabaseUrl}/auth/v1/.well-known/jwks.json`,
  requestHeaders: {
    'apikey': process.env.SUPABASE_ANON_KEY || ''
  },
  timeout: 10000 // 10s timeout
});

function getKey(header: any, callback: any) {
  console.log("Relayer Auth: Fetching signing key for kid:", header.kid);
  client.getSigningKey(header.kid, (err, key: any) => {
    if (err) {
      console.error("Relayer Auth: JWKS getSigningKey error:", err.message);
      callback(err);
      return;
    }
    const signingKey = key.getPublicKey();
    callback(null, signingKey);
  });
}

export const verifySupabaseToken = (req: AuthRequest, res: Response, next: NextFunction) => {
    const authHeader = req.headers.authorization;

    if (!authHeader || !authHeader.startsWith('Bearer ')) {
        return res.status(401).json({ error: 'Missing or invalid authorization header' });
    }

    const token = authHeader.split(' ')[1];
    const jwtSecret = process.env.SUPABASE_JWT_SECRET;

    // First decode header to check algorithm
    const decodedToken = jwt.decode(token, { complete: true }) as any;
    if (!decodedToken) {
        return res.status(401).json({ error: 'Invalid token format' });
    }

    const alg = decodedToken.header.alg;

    if (alg === 'ES256') {
        // Use JWKS for asymmetric ES256
        jwt.verify(token, getKey, { algorithms: ['ES256'] }, (err, decoded: any) => {
            if (err) {
                console.error("Relayer Auth (ES256): JWT verification failed!", {
                    error: err.message,
                    tokenSnippet: token.substring(0, 10) + "..."
                });
                return res.status(401).json({ error: 'Unauthorized', details: err.message });
            }
            req.userId = decoded.sub;
            next();
        });
    } else {
        // Fallback to symmetric verification (HS256)
        if (!jwtSecret) {
            console.error("Relayer Auth (HS256): SUPABASE_JWT_SECRET is missing.");
            return res.status(500).json({ error: 'Server authentication misconfiguration' });
        }

        try {
            let decoded: any;
            try {
                decoded = jwt.verify(token, jwtSecret, { algorithms: ['HS256', 'HS384', 'HS512'] });
            } catch (rawError: any) {
                const decodedSecret = Buffer.from(jwtSecret, 'base64');
                decoded = jwt.verify(token, decodedSecret, { algorithms: ['HS256', 'HS384', 'HS512'] });
            }
            req.userId = decoded.sub;
            next();
        } catch (error: any) {
            console.error("Relayer Auth (HS256): JWT verification failed!", {
                error: error.message,
                tokenSnippet: token.substring(0, 10) + "..."
            });
            return res.status(401).json({ error: 'Unauthorized', details: error.message });
        }
    }
};
