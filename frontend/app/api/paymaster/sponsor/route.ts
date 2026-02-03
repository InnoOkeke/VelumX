import { NextRequest, NextResponse } from 'next/server';
import { paymasterService } from '@/lib/services/PaymasterService';
import { logger } from '@/lib/backend/logger';

export async function POST(req: NextRequest) {
    try {
        const { transaction, userAddress, feeInUsdcx } = await req.json();

        if (!transaction || !userAddress || !feeInUsdcx) {
            return NextResponse.json({ error: 'Missing required fields' }, { status: 400 });
        }

        const txid = await paymasterService.sponsorTransaction(
            transaction,
            userAddress,
            BigInt(feeInUsdcx)
        );

        return NextResponse.json({ txid, timestamp: Date.now() });
    } catch (error: any) {
        logger.error('Sponsorship failed', { error: error.message });
        return NextResponse.json({
            error: error.message || 'Internal Server Error'
        }, { status: 500 });
    }
}
