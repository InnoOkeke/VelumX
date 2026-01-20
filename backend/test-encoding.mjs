import { toHex, toBytes } from 'viem';

const addr = '0x1c7D4B196Cb0C7B01d743Fbc6116a902379C7238';
const bytes = toBytes(addr);
const paddedBytes = new Uint8Array(32);
paddedBytes.fill(0);
paddedBytes.set(bytes, 12);
const hex = toHex(paddedBytes);
console.log('Type:', typeof hex);
console.log('Value:', hex);
console.log('Length:', hex.length);
