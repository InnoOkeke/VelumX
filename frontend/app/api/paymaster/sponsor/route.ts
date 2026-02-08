import { NextRequest, NextResponse } from 'next/server';
import { paymasterService } from '../../../../lib/services/PaymasterService';
import { logger } from '../../../../lib/backend/logger';
import { verifyApiKey } from '../../../../lib/backend/auth';

export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest) {
    try {
        const apiKey = req.headers.get('x-api-key');
        const auth = await verifyApiKey(apiKey);

        const origin = req.headers.get('origin');
        const isInternal = !apiKey && (origin?.includes('localhost') || origin?.includes('velumx'));

        if (!auth.valid && !isInternal) {
            return NextResponse.json({ success: false, message: auth.error || 'Unauthorized' }, { status: 401 });
        }

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
