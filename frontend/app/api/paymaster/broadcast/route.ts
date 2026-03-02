import { NextRequest, NextResponse } from 'next/server';
import { getPaymasterService } from '../../../../lib/services/PaymasterService';
import { logger } from '../../../../lib/backend/logger';

export const dynamic = 'force-dynamic';

/**
 * Broadcast API Route
 * Matches VelumX SDK's expected /broadcast endpoint
 */
export async function POST(req: NextRequest) {
    try {
        const { txHex } = await req.json();

        if (!txHex) {
            return NextResponse.json({ error: 'Missing txHex' }, { status: 400 });
        }

        // Use the paymaster service to broadcast
        // We reuse the sponsorTransaction logic but detect it's a raw hex
        const txid = await getPaymasterService().sponsorTransaction(
            txHex,
            'N/A', // userAddress not strictly required for raw broadcast in the service logic
            0n     // fee already embedded if it's a signed sponsored tx
        );

        return NextResponse.json({
            txid,
            status: 'broadcasted',
            timestamp: Date.now()
        });
    } catch (error: any) {
        logger.error('Broadcast failed', { error: error.message });
        return NextResponse.json({
            error: error.message || 'Internal Server Error'
        }, { status: 500 });
    }
}
