import { NextRequest, NextResponse } from 'next/server';
import { paymasterService } from '@/lib/services/PaymasterService';
import { logger } from '@/lib/backend/logger';
import { verifyApiKey } from '@/lib/backend/auth';

export async function POST(req: NextRequest) {
    try {
        const apiKey = req.headers.get('x-api-key');
        const auth = await verifyApiKey(apiKey);

        const origin = req.headers.get('origin');
        const isInternal = !apiKey && (origin?.includes('localhost') || origin?.includes('velumx'));

        if (!auth.valid && !isInternal) {
            return NextResponse.json({ success: false, message: auth.error || 'Unauthorized' }, { status: 401 });
        }

        const { estimatedGasInStx } = await req.json();
        if (!estimatedGasInStx) {
            return NextResponse.json({ error: 'Missing estimatedGasInStx' }, { status: 400 });
        }

        const estimate = await paymasterService.estimateFee(BigInt(estimatedGasInStx));

        return NextResponse.json({
            ...estimate,
            gasInStx: estimate.gasInStx.toString(),
            gasInUsdcx: estimate.gasInUsdcx.toString(),
        });
    } catch (error) {
        logger.error('Estimate fee failed', { error: (error as Error).message });
        return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
    }
}
