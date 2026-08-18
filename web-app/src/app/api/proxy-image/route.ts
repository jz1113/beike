import { NextResponse } from 'next/server';
import { normalizeImageUrlToStandardJpg } from '@/lib/drawing';

export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const rawImageUrl = searchParams.get('url');

    if (!rawImageUrl) {
      return new NextResponse('Missing url parameter', { status: 400 });
    }

    const imageUrl = normalizeImageUrlToStandardJpg(rawImageUrl);

    const response = await fetch(imageUrl, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Referer': imageUrl.includes('360buyimg') ? 'https://www.jd.com/' : 'https://www.taobao.com/'
      }
    });

    if (!response.ok) {
      return new NextResponse(`Failed to fetch image: ${response.statusText}`, { status: response.status });
    }

    const contentType = response.headers.get('content-type') || 'image/jpeg';
    const arrayBuffer = await response.arrayBuffer();

    return new NextResponse(arrayBuffer, {
      headers: {
        'Content-Type': contentType,
        'Cache-Control': 'public, max-age=86400',
        'Access-Control-Allow-Origin': '*'
      }
    });
  } catch (error: any) {
    return new NextResponse(error.message, { status: 500 });
  }
}
