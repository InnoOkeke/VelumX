"use strict";
/**
 * Address encoding utilities for cross-chain bridge
 * Handles conversion between Stacks addresses and bytes32 format
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.encodeStacksAddress = encodeStacksAddress;
exports.decodeStacksAddress = decodeStacksAddress;
exports.encodeEthereumAddress = encodeEthereumAddress;
exports.decodeEthereumAddress = decodeEthereumAddress;
exports.isValidStacksAddress = isValidStacksAddress;
exports.isValidEthereumAddress = isValidEthereumAddress;
const transactions_1 = require("@stacks/transactions");
const viem_1 = require("viem");
/**
 * Encodes a Stacks address to bytes32 format for xReserve protocol
 * Format: [11 zero bytes][1 version byte][20 hash160 bytes]
 *
 * @param address - Stacks address (e.g., "ST1PQHQKV0RJXZFY1DGX8MNSNYVE3VGZJSRTPGZGM")
 * @returns 32-byte hex string
 */
function encodeStacksAddress(address) {
    const stacksAddr = (0, transactions_1.createAddress)(address);
    const buffer = new Uint8Array(32);
    // 11 zero bytes (padding)
    buffer.fill(0, 0, 11);
    // 1 version byte
    buffer[11] = stacksAddr.version;
    // 20 hash160 bytes
    const hash = hexToBytes(stacksAddr.hash160);
    buffer.set(hash, 12);
    return (0, viem_1.toHex)(buffer);
}
/**
 * Decodes a bytes32 value back to a Stacks address
 *
 * @param bytes32 - 32-byte hex string
 * @returns Stacks address string
 */
function decodeStacksAddress(bytes32) {
    const buffer = (0, viem_1.toBytes)(bytes32);
    // Skip 11 zero bytes
    // Extract version byte (position 11)
    const version = buffer[11];
    // Extract 20 hash160 bytes (positions 12-31)
    const hash = buffer.slice(12, 32);
    const hash160 = bytesToHex(hash);
    return (0, transactions_1.addressToString)({
        hash160,
        version,
        type: transactions_1.StacksWireType.Address,
    });
}
/**
 * Encodes an Ethereum address to bytes32 format
 * Left-padded with zeros
 *
 * @param address - Ethereum address (e.g., "0x1234...")
 * @returns 32-byte hex string
 */
function encodeEthereumAddress(address) {
    // Remove 0x prefix and convert to bytes
    const addressBytes = (0, viem_1.toBytes)(address);
    // Pad to 32 bytes (left-padded with zeros)
    return (0, viem_1.pad)(addressBytes, { size: 32 });
}
/**
 * Decodes a bytes32 value back to an Ethereum address
 *
 * @param bytes32 - 32-byte hex string
 * @returns Ethereum address string
 */
function decodeEthereumAddress(bytes32) {
    const buffer = (0, viem_1.toBytes)(bytes32);
    // Extract last 20 bytes (Ethereum address is 20 bytes)
    const addressBytes = buffer.slice(12, 32);
    return (0, viem_1.toHex)(addressBytes);
}
/**
 * Validates a Stacks address format
 *
 * @param address - Address to validate
 * @returns true if valid Stacks address
 */
function isValidStacksAddress(address) {
    try {
        (0, transactions_1.createAddress)(address);
        return true;
    }
    catch {
        return false;
    }
}
/**
 * Validates an Ethereum address format
 *
 * @param address - Address to validate
 * @returns true if valid Ethereum address
 */
function isValidEthereumAddress(address) {
    return /^0x[a-fA-F0-9]{40}$/.test(address);
}
// ============ Helper Functions ============
/**
 * Converts hex string to Uint8Array
 */
function hexToBytes(hex) {
    const bytes = new Uint8Array(hex.length / 2);
    for (let i = 0; i < hex.length; i += 2) {
        bytes[i / 2] = parseInt(hex.substr(i, 2), 16);
    }
    return bytes;
}
/**
 * Converts Uint8Array to hex string
 */
function bytesToHex(bytes) {
    return Array.from(bytes)
        .map(b => b.toString(16).padStart(2, '0'))
        .join('');
}
//# sourceMappingURL=address-encoding.js.map