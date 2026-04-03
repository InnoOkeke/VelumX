import { createClient } from '@/lib/supabase/server';
import { NextResponse } from 'next/server';

export async function GET() {
    const supabase = await createClient();
    const { data: { session } } = await supabase.auth.getSession();

    if (!session) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const relayerUrl = process.env.NEXT_PUBLIC_VELUMX_RELAYER_URL || 'https://sgal-relayer.onrender.com';

    try {
        const response = await fetch(`${relayerUrl}/api/dashboard/export-key`, {
            headers: {
                'Authorization': `Bearer ${session.access_token}`
            }
        });

        if (!response.ok) {
            throw new Error('Failed to fetch from relayer');
        }

        const data = await response.json();
        return NextResponse.json(data);
    } catch (error) {
        console.error('Relayer Export Proxy Error:', error);
        return NextResponse.json({ error: 'Relayer communication failed' }, { status: 502 });
    }
}
