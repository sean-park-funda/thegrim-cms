import { NextRequest, NextResponse } from 'next/server';
import { generateGeminiImage } from '@/lib/image-generation';
import fs from 'fs';
import path from 'path';

export const maxDuration = 300; // 5분
export const dynamic = 'force-dynamic';

const GEMINI_API_KEY = process.env.GEMINI_API_KEY;

// 레퍼런스 이미지를 base64로 로드
function loadReferenceImage(): { data: string; mimeType: string } {
  const refPath = path.join(process.cwd(), 'public', 'jungkistyle.png');
  const buffer = fs.readFileSync(refPath);
  return {
    data: buffer.toString('base64'),
    mimeType: 'image/png',
  };
}

export async function POST(request: NextRequest) {
  const startTime = Date.now();
  console.log('[중기작가스타일] 요청 시작');

  try {
    if (!GEMINI_API_KEY) {
      return NextResponse.json({ error: 'GEMINI_API_KEY가 설정되지 않았습니다.' }, { status: 500 });
    }

    const body = await request.json();
    const { sketchBase64, sketchMimeType, mode, prompt } = body;

    if (!sketchBase64) {
      return NextResponse.json({ error: '스케치 이미지가 필요합니다.' }, { status: 400 });
    }
    if (!mode || !['line', 'manga'].includes(mode)) {
      return NextResponse.json({ error: 'mode는 line 또는 manga 이어야 합니다.' }, { status: 400 });
    }
    if (!prompt) {
      return NextResponse.json({ error: '프롬프트가 필요합니다.' }, { status: 400 });
    }

    const ref = loadReferenceImage();

    console.log(`[중기작가스타일] 모드: ${mode}, Gemini 호출 시작`);

    const result = await generateGeminiImage({
      provider: 'gemini',
      model: 'gemini-3-pro-image-preview',
      contents: [
        {
          role: 'user',
          parts: [
            { text: prompt },
            {
              inlineData: {
                mimeType: ref.mimeType,
                data: ref.data,
              },
            },
            {
              inlineData: {
                mimeType: sketchMimeType || 'image/png',
                data: sketchBase64,
              },
            },
          ],
        },
      ],
      config: {
        responseModalities: ['IMAGE', 'TEXT'],
        imageConfig: { imageSize: '1K' },
        temperature: 1.0,
        topP: 0.95,
        topK: 40,
        maxOutputTokens: 32768,
      },
      retries: 3,
      timeoutMs: 180000,
    });

    const elapsed = Date.now() - startTime;
    console.log(`[중기작가스타일] 완료 (${elapsed}ms)`);

    return NextResponse.json({
      imageData: result.base64,
      mimeType: result.mimeType || 'image/png',
    });
  } catch (error: unknown) {
    const elapsed = Date.now() - startTime;
    console.error(`[중기작가스타일] 오류 (${elapsed}ms):`, error);
    const msg = error instanceof Error ? error.message : '이미지 생성 중 오류가 발생했습니다.';
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
