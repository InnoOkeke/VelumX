import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  console.log('--- VelumX Data Correction: Linking Orphaned Transactions ---');

  // Identify the core user in the DB (Your account)
  const userRecord = await (prisma.transaction as any).findFirst({
    where: { userId: { not: null } },
    select: { userId: true }
  });

  if (!userRecord) {
    console.error('CRITICAL: No active user ID found in the database to link to.');
    return;
  }

  const userId = userRecord.userId;
  console.log(`Linking orphaned testnet transactions to userId: ${userId}...`);

  const { count } = await (prisma.transaction as any).updateMany({
    where: {
      userId: null,
      network: 'testnet'
    },
    data: {
      userId: userId
    }
  });

  console.log(`✅ Success: Linked ${count} transactions to your dashboard account.`);
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
