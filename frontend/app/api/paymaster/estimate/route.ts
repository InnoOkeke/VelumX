import { NextRequest, NextResponse } from 'next/server';
import { paymasterService } from '@/lib/services/PaymasterService';
import { logger } from '@/lib/backend/logger';

export async function POST(req: NextRequest) {
    try {
        const { estimatedGasInStx } = await req.json();
        if (!estimatedGasInStx) {
            return NextResponse.json({ error: 'Missing estimatedGasInStx' }, { status: 400 });
        }

        const estimate = await paymasterService.estimateFee(BigInt(estimatedGasInStx));

        // Convert BigInt to string for JSON serialization
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
