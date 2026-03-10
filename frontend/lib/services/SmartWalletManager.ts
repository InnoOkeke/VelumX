/**
 * Smart Wallet Manager Service
 * Handles automatic Smart Wallet registration and management
 */

import { getStacksTransactions, getStacksConnect, getNetworkInstance } from '../stacks-loader';
import { getConfig } from '../config';
import { getVelumXClient } from '../velumx';
import { Cl } from '@stacks/transactions';

interface SmartWalletCache {
  [userAddress: string]: {
    address: string | null;
    timestamp: number;
    isRegistering: boolean;
  };
}

const cache: SmartWalletCache = {};
const CACHE_DURATION = 300000; // 5 minutes (increased from 1 minute)

export class SmartWalletManager {
  private config = getConfig();

  /**
   * Get Smart Wallet address from factory (with caching)
   */
  async getSmartWalletAddress(ownerAddress: string): Promise<string | null> {
    // Check cache first
    const cached = cache[ownerAddress];
    if (cached && Date.now() - cached.timestamp < CACHE_DURATION && !cached.isRegistering) {
      console.log('Smart Wallet from cache:', cached.address);
      return cached.address;
    }

    try {
      const network = await getNetworkInstance();
      const { fetchCallReadOnlyFunction, cvToString } = await getStacksTransactions();
      const [contractAddress, contractName] = this.config.stacksWalletFactoryAddress.split('.');

      console.log('Fetching Smart Wallet from factory:', { ownerAddress, factory: `${contractAddress}.${contractName}` });

      const result = await fetchCallReadOnlyFunction({
        contractAddress,
        contractName,
        functionName: 'get-wallet',
        functionArgs: [Cl.principal(ownerAddress)],
        senderAddress: ownerAddress,
        network,
      });

      console.log('Factory response:', JSON.stringify(result, (key, value) => typeof value === 'bigint' ? value.toString() : value, 2));

      let address: string | null = null;

      // Handle optional/some types
      if (result.type === 'some' || result.type === 'optionalSome' || result.type === 9) {
        const value = result.value || (result as any).data;
        
        // Try to convert to string using cvToString
        if (cvToString) {
          try {
            address = cvToString(value);
            console.log('Smart Wallet address (cvToString):', address);
          } catch (e) {
            console.warn('cvToString failed, trying manual extraction:', e);
          }
        }
        
        // Fallback: manual extraction
        if (!address && value && typeof value === 'object' && 'data' in value) {
          address = value.data;
          console.log('Smart Wallet address (manual):', address);
        } else if (!address && typeof value === 'string') {
          address = value;
          console.log('Smart Wallet address (string):', address);
        }
      }

      // Update cache
      cache[ownerAddress] = {
        address,
        timestamp: Date.now(),
        isRegistering: false,
      };

      console.log('Smart Wallet lookup result:', { ownerAddress, address, cached: true });

      return address;
    } catch (error) {
      console.error('Error fetching smart wallet:', error);
      return null;
    }
  }

  /**
   * Get Smart Wallet nonce
   */
  async getSmartWalletNonce(walletAddress: string): Promise<number> {
    try {
      const network = await getNetworkInstance();
      const { fetchCallReadOnlyFunction } = await getStacksTransactions();
      const [contractAddress, contractName] = walletAddress.split('.');

      const result = await fetchCallReadOnlyFunction({
        contractAddress,
        contractName,
        functionName: 'get-nonce',
        functionArgs: [],
        senderAddress: contractAddress,
        network,
      });

      let extracted: any = result;

      // Unwrap ok/response wrapper
      if (extracted.type === 'ok' || extracted.type === 'responseOk' || extracted.type === 7 || extracted.type === 10) {
        extracted = extracted.value || (extracted as any).data;
      }

      // Extract uint value
      if (extracted && typeof extracted === 'object') {
        const rawVal = extracted.value !== undefined ? extracted.value : extracted;
        const parsed = Number(rawVal);
        return isNaN(parsed) ? 0 : parsed;
      }

      return 0;
    } catch (error) {
      console.error('Error fetching nonce:', error);
      return 0;
    }
  }

  /**
   * Register Smart Wallet (automatic with progress tracking)
   */
  async registerSmartWallet(
    ownerAddress: string,
    onProgress?: (status: string) => void
  ): Promise<{ txid: string; smartWalletAddress: string } | null> {
    // Check if already registering
    if (cache[ownerAddress]?.isRegistering) {
      throw new Error('Registration already in progress');
    }

    // Mark as registering
    cache[ownerAddress] = {
      address: null,
      timestamp: Date.now(),
      isRegistering: true,
    };

    try {
      onProgress?.('Preparing registration transaction...');

      const network = await getNetworkInstance();
      const connectLib = await getStacksConnect();
      const { Cl } = await getStacksTransactions();
      const [factoryAddress, factoryName] = this.config.stacksWalletFactoryAddress.split('.');

      onProgress?.('Waiting for wallet signature...');

      const result = await new Promise<{ txid: string; txRaw: string } | null>((resolve, reject) => {
        connectLib.openContractCall({
          contractAddress: factoryAddress,
          contractName: factoryName,
          functionName: 'register-wallet',
          functionArgs: [Cl.principal(this.config.stacksSmartWalletAddress)],
          network,
          sponsored: true,
          onFinish: (data: any) => {
            resolve({ txid: data.txid, txRaw: data.txRaw });
          },
          onCancel: () => {
            resolve(null);
          },
        });
      });

      if (!result) {
        cache[ownerAddress].isRegistering = false;
        return null;
      }

      onProgress?.('Broadcasting transaction...');

      // Submit via VelumX SDK
      const velumx = getVelumXClient();
      const broadcastResult = await velumx.submitRawTransaction(result.txRaw);

      onProgress?.('Waiting for confirmation...');

      // Wait for transaction confirmation (poll for 30 seconds)
      const maxAttempts = 30;
      let attempts = 0;
      let smartWalletAddress: string | null = null;

      while (attempts < maxAttempts && !smartWalletAddress) {
        await new Promise(resolve => setTimeout(resolve, 1000));
        // Clear cache before fetching to force fresh lookup
        delete cache[ownerAddress];
        smartWalletAddress = await this.getSmartWalletAddress(ownerAddress);
        attempts++;
      }

      if (!smartWalletAddress) {
        // One final attempt after clearing cache completely
        console.warn('Registration confirmation timed out, attempting final lookup...');
        delete cache[ownerAddress];
        await new Promise(resolve => setTimeout(resolve, 2000));
        smartWalletAddress = await this.getSmartWalletAddress(ownerAddress);
        
        if (!smartWalletAddress) {
          // Don't throw error - the wallet might exist but we can't confirm yet
          console.error('Could not confirm Smart Wallet registration. TX:', result.txid);
          cache[ownerAddress].isRegistering = false;
          throw new Error(`Smart Wallet registration submitted (TX: ${result.txid}) but confirmation timed out. Please try again in a few seconds.`);
        }
      }

      onProgress?.('Registration complete!');

      // Update cache
      cache[ownerAddress] = {
        address: smartWalletAddress,
        timestamp: Date.now(),
        isRegistering: false,
      };

      return {
        txid: broadcastResult.txid,
        smartWalletAddress,
      };
    } catch (error) {
      cache[ownerAddress].isRegistering = false;
      throw error;
    }
  }

  /**
   * Ensure Smart Wallet exists (auto-register if needed)
   */
  async ensureSmartWallet(
    ownerAddress: string,
    onProgress?: (status: string) => void
  ): Promise<string> {
    onProgress?.('Checking Smart Wallet...');

    // Force fresh lookup by clearing cache if it's stale
    const cached = cache[ownerAddress];
    if (cached && cached.isRegistering) {
      throw new Error('Smart Wallet registration already in progress. Please wait.');
    }

    let smartWalletAddress = await this.getSmartWalletAddress(ownerAddress);

    console.log('Smart Wallet Check:', { ownerAddress, smartWalletAddress, cached: !!cache[ownerAddress] });

    if (smartWalletAddress) {
      onProgress?.(`Smart Wallet found: ${smartWalletAddress.substring(0, 10)}...`);
      return smartWalletAddress;
    }

    // Double-check by clearing cache and trying again
    console.log('Smart Wallet not found, clearing cache and retrying...');
    delete cache[ownerAddress];
    smartWalletAddress = await this.getSmartWalletAddress(ownerAddress);
    
    if (smartWalletAddress) {
      onProgress?.(`Smart Wallet found: ${smartWalletAddress.substring(0, 10)}...`);
      return smartWalletAddress;
    }

    onProgress?.('No Smart Wallet found. Starting registration...');

    const result = await this.registerSmartWallet(ownerAddress, onProgress);

    if (!result) {
      throw new Error('Smart Wallet registration was cancelled');
    }

    return result.smartWalletAddress;
  }

  /**
   * Clear cache for a user (useful after registration)
   */
  clearCache(ownerAddress: string) {
    delete cache[ownerAddress];
  }

  /**
   * Check if user has a Smart Wallet (cached check)
   */
  async hasSmartWallet(ownerAddress: string): Promise<boolean> {
    const address = await this.getSmartWalletAddress(ownerAddress);
    return address !== null;
  }
}

// Singleton instance
let instance: SmartWalletManager | null = null;

export function getSmartWalletManager(): SmartWalletManager {
  if (!instance) {
    instance = new SmartWalletManager();
  }
  return instance;
}
