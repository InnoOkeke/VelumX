import { NextRequest, NextResponse } from 'next/server';
import { transactionMonitorService } from '@/lib/services/TransactionMonitor';
import { logger } from '@/lib/backend/logger';

export async function GET(req: NextRequest) {
    const { searchParams } = new URL(req.url);
    const address = searchParams.get('address');

    try {
        const transactions = address
            ? await transactionMonitorService.getUserTransactions(address)
            : await transactionMonitorService.getAllTransactions();

        return NextResponse.json(transactions);
    } catch (error) {
        logger.error('Failed to get transactions', { error: (error as Error).message });
        return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
    }
}

export async function POST(req: NextRequest) {
    try {
        const body = await req.json();
        const transaction = await transactionMonitorService.addTransaction(body);
        return NextResponse.json(transaction);
    } catch (error) {
        logger.error('Failed to create transaction', { error: (error as Error).message });
        return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
    }
}
