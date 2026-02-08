import { NextRequest, NextResponse } from 'next/server';
import { transactionMonitorService } from '../../../lib/services/TransactionMonitor';
import { logger } from '../../../lib/backend/logger';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
    // Simple security: check for an auth header if configured, 
    // or just rely on Vercel's internal cron security if using their systemic cron.
    const authHeader = req.headers.get('authorization');
    if (process.env.CRON_SECRET && authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    logger.info('Monitor endpoint triggered via GET');

    try {
        await transactionMonitorService.processQueue();
        return NextResponse.json({
            success: true,
            timestamp: Date.now(),
            message: 'Queue processed'
        });
    } catch (error) {
        logger.error('Monitor endpoint failed', { error: (error as Error).message });
        return NextResponse.json({
            success: false,
            error: (error as Error).message
        }, { status: 500 });
    }
}

// Support POST as well for flexibility
export async function POST(req: NextRequest) {
    return GET(req);
}
