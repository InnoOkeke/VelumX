import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  console.log('--- VelumX Debug: Checking Transaction Ownership ---');

  // Check counts for testnet
  const totalTestnet = await (prisma.transaction as any).count({
    where: { network: 'testnet' }
  });

  const orphanedTransactions = await (prisma.transaction as any).findMany({
    where: { 
      network: 'testnet',
      userId: null 
    },
    select: { id: true, txid: true, feeAmount: true }
  });

  console.log(`Total Testnet Transactions: ${totalTestnet}`);
  console.log(`Transactions with userId = null (Orphaned): ${orphanedTransactions.length}`);

  if (orphanedTransactions.length > 0) {
    console.log('Sample Orphaned Transaction:', orphanedTransactions[0]);
  }

  // Also check if there's any userId in the DB at all to see what we're comparing against
  const sampleWithUser = await (prisma.transaction as any).findFirst({
    where: { userId: { not: null } },
    select: { userId: true }
  });

  if (sampleWithUser) {
    console.log('Sample userId found in DB:', sampleWithUser.userId);
  } else {
      console.log('No transactions with a userId found in the entire database.');
  }
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
