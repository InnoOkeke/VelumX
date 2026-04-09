import { Redis } from 'ioredis';

// Shared Redis client — single connection reused across the entire relayer process.
// Falls back gracefully to null if REDIS_URL is not configured.
let client: Redis | null = null;

export function getRedisClient(): Redis | null {
    if (client) return client;

    const redisUrl = process.env.REDIS_URL;
    if (!redisUrl) return null;

    client = new Redis(redisUrl, {
        maxRetriesPerRequest: 1,
        connectTimeout: 3000,
        lazyConnect: true,
        enableOfflineQueue: false,
    });

    client.connect().catch(() => {
        console.warn('[Redis] Connection failed — dashboard caching disabled');
        client = null;
    });

    client.on('error', () => {}); // suppress unhandled error events

    return client;
}

// Dashboard stats cache — 2 minute TTL
const STATS_TTL = 120; // seconds

export async function getCachedStats(userId: string): Promise<any | null> {
    const redis = getRedisClient();
    if (!redis) return null;
    try {
        const val = await redis.get(`dashboard:stats:${userId}`);
        return val ? JSON.parse(val) : null;
    } catch { return null; }
}

export async function setCachedStats(userId: string, data: any): Promise<void> {
    const redis = getRedisClient();
    if (!redis) return;
    try {
        await redis.set(`dashboard:stats:${userId}`, JSON.stringify(data), 'EX', STATS_TTL);
    } catch {}
}

export async function invalidateStatsCache(userId: string): Promise<void> {
    const redis = getRedisClient();
    if (!redis) return;
    try {
        await redis.del(`dashboard:stats:${userId}`);
    } catch {}
}
