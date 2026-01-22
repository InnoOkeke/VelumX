/**
 * Script to mark old/stuck transactions as failed
 * Run with: node mark-old-transactions-failed.js
 */

const fs = require('fs');
const path = require('path');

const QUEUE_FILE = path.join(__dirname, 'data', 'transaction-queue.json');

async function markOldTransactionsFailed() {
  try {
    // Read the queue file
    const data = fs.readFileSync(QUEUE_FILE, 'utf-8');
    const entries = JSON.parse(data);

    console.log(`Found ${entries.length} transactions in queue`);

    // Mark all non-complete transactions as failed
    let updatedCount = 0;
    const updatedEntries = entries.map(([id, tx]) => {
      if (tx.status !== 'complete' && tx.status !== 'failed') {
        console.log(`Marking transaction ${id} as failed (was: ${tx.status})`);
        updatedCount++;
        return [
          id,
          {
            ...tx,
            status: 'failed',
            error: 'Manually marked as failed - old transaction',
            updatedAt: Date.now(),
          },
        ];
      }
      return [id, tx];
    });

    // Write back to file
    fs.writeFileSync(QUEUE_FILE, JSON.stringify(updatedEntries, null, 2), 'utf-8');

    console.log(`\n✅ Successfully marked ${updatedCount} transactions as failed`);
    console.log('Restart your backend server for changes to take effect.');
  } catch (error) {
    if (error.code === 'ENOENT') {
      console.log('No transaction queue file found. Nothing to do.');
    } else {
      console.error('Error:', error.message);
    }
  }
}

markOldTransactionsFailed();
