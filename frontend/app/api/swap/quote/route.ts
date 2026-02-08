import { NextRequest, NextResponse } from 'next/server';
// import { getSwapService } from '@/lib/services/SwapService';
import { logger } from '@/lib/backend/logger';

export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest) {
    try {
        const { inputToken, outputToken, inputAmount } = await req.json();

        if (!inputToken || !outputToken || !inputAmount) {
            return NextResponse.json({ error: 'Missing required fields' }, { status: 400 });
        }

        // const quote = await getSwapService().getQuote(inputToken, outputToken, inputAmount);
        const quote = { inputAmount, outputAmount: '0', priceImpact: 0, estimatedFee: '0', path: [] };

        return NextResponse.json({
            success: true,
            data: quote
        });
    } catch (error: any) {
        logger.error('Swap quote failed', { error: error.message });
        return NextResponse.json({
            success: false,
            error: error.message || 'Internal Server Error'
        }, { status: 500 });
    }
}
