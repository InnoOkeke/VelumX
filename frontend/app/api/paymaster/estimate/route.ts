import { NextRequest, NextResponse } from 'next/server';
import { getPaymasterService } from '../../../../lib/services/PaymasterService';
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

        const body = await req.json();
        const estimatedGasInStx = body.estimatedGasInStx || body.intent?.estimatedGas || body.intent?.gasUsage;

        if (!estimatedGasInStx) {
            return NextResponse.json({ error: 'Missing gas estimation parameter' }, { status: 400 });
        }

        const estimate = await getPaymasterService().estimateFee(BigInt(estimatedGasInStx));

        // Return both the internal legacy format and the SDK's expected format
        return NextResponse.json({
            success: true,
            // SDK fields
            maxFeeUSDCx: estimate.gasInUsdcx.toString(),
            estimatedGas: Number(estimate.gasInStx),
            // Legacy/Internal fields
            data: {
                ...estimate,
                gasInStx: estimate.gasInStx.toString(),
                gasInUsdcx: estimate.gasInUsdcx.toString(),
            }
        });
    } catch (error) {
        logger.error('Estimate fee failed', { error: (error as Error).message });
        return NextResponse.json({ success: false, error: 'Internal Server Error' }, { status: 500 });
    }
}
