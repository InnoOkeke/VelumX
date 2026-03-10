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

    if (swBalance >= requiredAmount) {
      onProgress?.('Smart Wallet has sufficient funds!');
      return;
    }

    const deficit = requiredAmount - swBalance;
    onProgress?.(`Transferring ${formatUnits(deficit, 6)} USDCx to Smart Wallet...`);

    // Check personal wallet balance
    const personalBalance = await this.getUsdcxBalance(userAddress);

    if (personalBalance < deficit) {
      throw new Error(
        `Insufficient USDCx balance. You need ${formatUnits(deficit, 6)} more USDCx. ` +
        `Personal: ${formatUnits(personalBalance, 6)}, Smart Wallet: ${formatUnits(swBalance, 6)}`
      );
    }

    // Transfer funds
    const txid = await this.transferToSmartWallet(userAddress, smartWalletAddress, deficit, onProgress);

    // Don't wait for confirmation - the transaction will be processed before the bridge tx
    // Just give it a moment to propagate
    if (txid) {
      onProgress?.(`Transfer submitted (TX: ${txid.substring(0, 10)}...). Continuing...`);
    } else {
      onProgress?.('Transfer submitted. Continuing...');
    }
    await new Promise(resolve => setTimeout(resolve, 2000));
    
    onProgress?.('Proceeding with transaction...');
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
