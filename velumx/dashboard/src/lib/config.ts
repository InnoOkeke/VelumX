/**
 * Dashboard Configuration
 */

export const RELAYER_URL = process.env.NEXT_PUBLIC_VELUMX_RELAYER_URL || 'https://sgal-relayer.onrender.com';

export const API_ENDPOINTS = {
    STATS: `${RELAYER_URL}/api/dashboard/stats`,
    KEYS: `${RELAYER_URL}/api/dashboard/keys`,
    LOGS: `${RELAYER_URL}/api/dashboard/logs`,
};
