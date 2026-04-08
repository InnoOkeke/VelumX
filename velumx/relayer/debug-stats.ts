import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();

async function main() {
  const txs = await (prisma.transaction as any).findMany({
    where: { status: 'Success' },
    select: {
      id: true,
      txid: true,
      feeAmount: true,
      feeToken: true,
      userId: true,
      type: true
    }
  });

  console.log(`Found ${txs.length} successful transactions`);
  
  const stats: Record<string, { count: number, totalAmount: bigint }> = {};
  
  txs.forEach((tx: any) => {
    const key = `${tx.userId || 'anon'}-${tx.feeToken}`;
    if (!stats[key]) stats[key] = { count: 0, totalAmount: 0n };
    stats[key].count++;
    stats[key].totalAmount += BigInt(tx.feeAmount || '0');
  });

  console.table(Object.entries(stats).map(([k, v]) => ({
    user_token: k,
    count: v.count,
    totalMicro: v.totalAmount.toString()
  })));
}

main();
