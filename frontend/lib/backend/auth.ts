import prisma from '@/lib/prisma';
import { logger } from '@/lib/backend/logger';

export async function verifyApiKey(apiKey: string | null): Promise<{ valid: boolean; devId?: string; error?: string }> {
    if (!apiKey) {
        return { valid: false, error: 'API Key is missing' };
    }

    try {
        const developer = await (prisma as any).developer.findUnique({
            where: { apiKey }
        });

        if (!developer) {
            return { valid: false, error: 'Invalid API Key' };
        }

        // Increment usage asynchronously
        (prisma as any).developer.update({
            where: { id: developer.id },
            data: { usage: { increment: 1 } }
        }).catch((err: any) => logger.error('Failed to increment dev usage', { devId: developer.id, error: err.message }));

        return { valid: true, devId: developer.id };
    } catch (error: any) {
        logger.error('Error verifying API Key', { error: error.message });
        return { valid: false, error: 'Auth server error' };
    }
}
