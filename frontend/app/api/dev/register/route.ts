import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { logger } from '@/lib/backend/logger';
import { randomBytes } from 'crypto';

export async function POST(req: NextRequest) {
    // Simple protection for registration route (e.g., ADMIN_SECRET env var)
    const adminSecret = req.headers.get('x-admin-secret');
    if (adminSecret !== process.env.ADMIN_SECRET && process.env.NODE_ENV === 'production') {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    try {
        const { name, email } = await req.json();

        if (!name || !email) {
            return NextResponse.json({ error: 'Name and email are required' }, { status: 400 });
        }

        const apiKey = `vx_${randomBytes(24).toString('hex')}`;

        const developer = await (prisma as any).developer.create({
            data: {
                name,
                email,
                apiKey
            }
        });

        return NextResponse.json({
            success: true,
            data: {
                name: developer.name,
                apiKey: developer.apiKey
            }
        });
    } catch (error: any) {
        logger.error('Developer registration failed', { error: error.message });
        return NextResponse.json({ error: 'Email already registered or registration failed' }, { status: 500 });
    }
}
