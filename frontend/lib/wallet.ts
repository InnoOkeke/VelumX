import { mnemonicToAccount } from 'viem/accounts';
import { generateMnemonic } from 'bip39';
import { Buffer } from 'buffer';
import { getAddressFromPrivateKey } from '@stacks/transactions';
import { generateWallet, deriveStxPrivateKey, getRootNode } from '@stacks/wallet-sdk';

/**
 * Generates a starting mnemonic for the user
 * In a production app, this would be encrypted and stored safely.
 */
export function generateUserMnemonic() {
  return generateMnemonic();
}

/**
 * Derives both Ethereum and Stacks addresses from a single mnemonic
 */
export async function deriveWalletsFromMnemonic(mnemonic: string, isMainnet: boolean = false) {
  // 1. Ethereum Derivation (Default path: m/44'/60'/0'/0/0)
  const ethAccount = mnemonicToAccount(mnemonic);
  
  // 2. Stacks Derivation (Default path: m/44'/5757'/0'/0/0)
  // We use @stacks/wallet-sdk to ensure we follow the correct Stacks derivation standards
  const wallet = await generateWallet({
    secretKey: mnemonic,
    password: '', // No password for initial derivation
  });
  
  const rootNode = getRootNode(wallet);
  const stxPrivateKey = deriveStxPrivateKey({
    rootNode,
    index: 0,
  });

  const stxAddress = getAddressFromPrivateKey(
    stxPrivateKey, 
    isMainnet ? 'mainnet' : 'testnet'
  );

  return {
    ethAddress: ethAccount.address,
    stacksAddress: stxAddress,
    // We return the mnemonic so it can be stored (encrypted) if needed
    mnemonic
  };
}
