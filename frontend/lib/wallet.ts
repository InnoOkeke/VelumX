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

/**
 * Simple encryption for mnemonics before storing in Supabase.
 * NOTE: For production, consider a more robust KMS or HSM solution.
 */
export async function encryptMnemonic(mnemonic: string): Promise<string> {
  const encryptionKey = process.env.NEXT_PUBLIC_WALLET_ENCRYPTION_KEY;
  if (!encryptionKey) {
    console.warn('Encryption key missing, storing unencrypted (STRICTLY FOR TESTING)');
    return mnemonic;
  }

  try {
    const enc = new TextEncoder();
    const keyMaterial = await window.crypto.subtle.importKey(
      "raw",
      enc.encode(encryptionKey),
      { name: "PBKDF2" },
      false,
      ["deriveKey"]
    );

    const key = await window.crypto.subtle.deriveKey(
      {
        name: "PBKDF2",
        salt: enc.encode("velumx-salt"),
        iterations: 100000,
        hash: "SHA-256",
      },
      keyMaterial,
      { name: "AES-GCM", length: 256 },
      false,
      ["encrypt", "decrypt"]
    );

    const iv = window.crypto.getRandomValues(new Uint8Array(12));
    const encrypted = await window.crypto.subtle.encrypt(
      { name: "AES-GCM", iv },
      key,
      enc.encode(mnemonic)
    );

    const resultArray = new Uint8Array(iv.length + encrypted.byteLength);
    resultArray.set(iv, 0);
    resultArray.set(new Uint8Array(encrypted), iv.length);

    return Buffer.from(resultArray).toString('base64');
  } catch (error) {
    console.error('Encryption failed:', error);
    return mnemonic;
  }
}

/**
 * Decrypts a mnemonic retrieved from Supabase.
 */
export async function decryptMnemonic(encryptedData: string): Promise<string> {
  const encryptionKey = process.env.NEXT_PUBLIC_WALLET_ENCRYPTION_KEY;
  if (!encryptionKey || !encryptedData.includes(' ')) { // Simple check if it's already a mnemonic
    if (encryptedData.split(' ').length === 12) return encryptedData;
  }

  try {
    const data = Buffer.from(encryptedData, 'base64');
    const iv = data.slice(0, 12);
    const encrypted = data.slice(12);

    const enc = new TextEncoder();
    const keyMaterial = await window.crypto.subtle.importKey(
      "raw",
      enc.encode(encryptionKey!),
      { name: "PBKDF2" },
      false,
      ["deriveKey"]
    );

    const key = await window.crypto.subtle.deriveKey(
      {
        name: "PBKDF2",
        salt: enc.encode("velumx-salt"),
        iterations: 100000,
        hash: "SHA-256",
      },
      keyMaterial,
      { name: "AES-GCM", length: 256 },
      false,
      ["encrypt", "decrypt"]
    );

    const decrypted = await window.crypto.subtle.decrypt(
      { name: "AES-GCM", iv },
      key,
      encrypted
    );

    return new TextDecoder().decode(decrypted);
  } catch (error) {
    console.error('Decryption failed:', error);
    return encryptedData;
  }
}
