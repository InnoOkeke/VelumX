import { NextRequest, NextResponse } from 'next/server';

/**
 * VelumX Secure Proxy Route
 * 
 * This route acts as a gateway between the DeFi frontend and the VelumX Relayer.
 * It injects the secret API Key on the server-side, preventing exposure to the browser.
 */
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ path: string[] }> }
) {
  const { path: pathSegments } = await params;
  const path = pathSegments.join('/');
  const relayerUrl = process.env.VELUMX_RELAYER_URL || 'https://api.velumx.xyz';
  const apiKey = process.env.VELUMX_API_KEY;

  if (!apiKey) {
    console.error('VelumX Proxy: VELUMX_API_KEY is not defined in environment variables.');
    return NextResponse.json({ error: 'Relayer configuration error' }, { status: 500 });
  }

  const targetUrl = `${relayerUrl}/api/v1/${path}`;

  try {
    const body = await req.json();

    const response = await fetch(targetUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey, // Inject the secret key here!
      },
      body: JSON.stringify(body),
    });

    const data = await response.json();
    return NextResponse.json(data, { status: response.status });
  } catch (error) {
    console.error(`VelumX Proxy Error (${path}):`, error);
    return NextResponse.json({ error: 'Failed to communicate with VelumX Relayer' }, { status: 502 });
  }
}

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ path: string[] }> }
) {
  const { path: pathSegments } = await params;
  const path = pathSegments.join('/');
  const relayerUrl = process.env.VELUMX_RELAYER_URL || 'https://api.velumx.xyz';
  const apiKey = process.env.VELUMX_API_KEY;

  if (!apiKey) {
    return NextResponse.json({ error: 'Relayer configuration error' }, { status: 500 });
  }

  const targetUrl = `${relayerUrl}/api/v1/${path}`;

  try {
    const response = await fetch(targetUrl, {
      method: 'GET',
      headers: {
        'x-api-key': apiKey,
      },
    });

    const data = await response.json();
    return NextResponse.json(data, { status: response.status });
  } catch (error) {
    console.error(`VelumX Proxy Error (${path}):`, error);
    return NextResponse.json({ error: 'Failed to communicate with VelumX Relayer' }, { status: 502 });
  }
}