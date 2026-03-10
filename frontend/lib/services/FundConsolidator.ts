/**
 * Fund Consolidator Service
 * Handles automatic fund transfers to Smart Wallet for gasless transactions
 */

import { getStacksTransactions, getStacksConnect, getNetworkInstance } from '../stacks-loader';
import { getConfig } from '../config';
import { parseUnits, formatUnits } from 'viem';
import { Cl } from '@stacks/transactions';

export class FundConsolidator {
  private config = getConfig();

  /**
   * Get USDCx balance for an address
   */
  async getUsdcxBalance(address: string): Promise<bigint> {
    try {
      const network = await getNetworkInstance();
      const { fetchCallReadOnlyFunction } = await getStacksTransactions();
      const [contractAddress, contractName] = this.config.stacksUsdcxAddress.split('.');

      const result = await fetchCallReadOnlyFunction({
        contractAddress,
        contractName,
        functionName: 'get-balance',
        functionArgs: [Cl.principal(address)],
        senderAddress: address,
        network,
      });

      let extracted: any = result;

      // Unwrap ok/response wrapper
      if (extracted.type === 'ok' || extracted.type === 'responseOk' || extracted.type === 7) {
        extracted = extracted.value || (extracted as any).data;
      }

      // Extract uint value
      if (extracted && typeof extracted === 'object') {
        const rawVal = extracted.value !== undefined ? extracted.value : extracted;
        return BigInt(rawVal);
      }

      return BigInt(0);
    } catch (error) {
      console.error('Error fetching USDCx balance:', error);
      return BigInt(0);
    }
  }

  /**
   * Transfer USDCx from personal wallet to Smart Wallet
   */
  async transferToSmartWallet(
    fromAddress: string,
    toAddress: string,
    amount: bigint,
    onProgress?: (status: string) => void
  ): Promise<string> {
    try {
      onProgress?.('Preparing transfer...');

      const connectLib = await getStacksConnect();
      const { Cl } = await getStacksTransactions();
      const network = await getNetworkInstance();
      const [contractAddress, contractName] = this.config.stacksUsdcxAddress.split('.');

      onProgress?.('Waiting for transfer approval...');

      const result = await new Promise<{ txid: string } | null>((resolve, reject) => {
        connectLib.openContractCall({
          contractAddress,
          contractName,
          functionName: 'transfer',
          functionArgs: [
            Cl.uint(amount.toString()),
            Cl.principal(fromAddress),
            Cl.principal(toAddress),
            Cl.none(),
          ],
          network,
          sponsored: true,
          onFinish: (data: any) => {
            console.log('Transfer onFinish data:', data);
            const txid = data?.txid || data?.txId || data?.result?.txid;
            if (txid) {
              resolve({ txid });
            } else {
              console.warn('No txid in transfer response:', data);
              resolve({ txid: 'pending' });
            }
          },
          onCancel: () => {
            resolve(null);
          },
        });
      });

      if (!result) {
        throw new Error('Transfer was cancelled');
      }

      onProgress?.('Transfer submitted!');

      return result.txid;
    } catch (error) {
      console.error('Transfer error:', error);
      throw error;
    }
  }

  /**
   * Ensure Smart Wallet has sufficient funds (auto-transfer if needed)
   */
  async ensureFunds(
    userAddress: string,
    smartWalletAddress: string,
    requiredAmount: bigint,
    onProgress?: (status: string) => void
  ): Promise<void> {
    onProgress?.('Checking Smart Wallet balance...');

    const swBalance = await this.getUsdcxBalance(smartWalletAddress);
    
    console.log('Smart Wallet Balance Check:', {
      smartWallet: smartWalletAddress,
      currentBalance: swBalance.toString(),
      required: requiredAmount.toString(),
      sufficient: swBalance >= requiredAmount
    });

    if (swBalance >= requiredAmount) {
      onProgress?.('Smart Wallet has sufficient funds!');
      return;
    }

    const deficit = requiredAmount - swBalance;
    onProgress?.(`Transferring ${formatUnits(deficit, 6)} USDCx to Smart Wallet...`);

    // Check personal wallet balance
    const personalBalance = await this.getUsdcxBalance(userAddress);
    
    console.log('Personal Balance Check:', {
      personal: userAddress,
      balance: personalBalance.toString(),
      deficit: deficit.toString(),
      sufficient: personalBalance >= deficit
    });

    if (personalBalance < deficit) {
      throw new Error(
        `Insufficient USDCx balance. You need ${formatUnits(deficit, 6)} more USDCx. ` +
        `Personal: ${formatUnits(personalBalance, 6)}, Smart Wallet: ${formatUnits(swBalance, 6)}`
      );
    }

    // Transfer funds
    const txid = await this.transferToSmartWallet(userAddress, smartWalletAddress, deficit, onProgress);

    // Wait longer for the transfer to confirm (30 seconds)
    if (txid && txid !== 'pending') {
      onProgress?.(`Transfer submitted (TX: ${txid.substring(0, 10)}...). Waiting for confirmation...`);
    } else {
      onProgress?.('Transfer submitted. Waiting for confirmation...');
    }
    
    // Poll for confirmation
    const maxAttempts = 30;
    let attempts = 0;
    let confirmed = false;

    while (attempts < maxAttempts && !confirmed) {
      await new Promise(resolve => setTimeout(resolve, 1000));
      const newBalance = await this.getUsdcxBalance(smartWalletAddress);
      console.log(`Polling attempt ${attempts + 1}/${maxAttempts}: Smart Wallet balance = ${newBalance.toString()}`);
      
      if (newBalance >= requiredAmount) {
        confirmed = true;
        onProgress?.('Transfer confirmed! Proceeding...');
      }
      attempts++;
    }

    if (!confirmed) {
      throw new Error(
        `Transfer is taking longer than expected. Please wait a moment and try again. ` +
        `TX: ${txid || 'unknown'}`
      );
    }
  }

  /**
   * Get total USDCx balance (personal + Smart Wallet)
   */
  async getTotalBalance(userAddress: string, smartWalletAddress: string): Promise<{
    personal: bigint;
    smartWallet: bigint;
    total: bigint;
  }> {
    const [personal, smartWallet] = await Promise.all([
      this.getUsdcxBalance(userAddress),
      this.getUsdcxBalance(smartWalletAddress),
    ]);

    return {
      personal,
      smartWallet,
      total: personal + smartWallet,
    };
  }
}

// Singleton instance
let instance: FundConsolidator | null = null;

export function getFundConsolidator(): FundConsolidator {
  if (!instance) {
    instance = new FundConsolidator();
  }
  return instance;
}
