import { NextRequest, NextResponse } from 'next/server';
import { GoogleGenAI } from '@google/genai';

const GEMINI_API_KEY = process.env.GEMINI_API_KEY;
const GEMINI_API_TIMEOUT = 60000;

export async function POST(request: NextRequest) {
  const body = await request.json().catch(() => null) as {
    name: string;
    description?: string;
  } | null;

  if (!body?.name) {
    return NextResponse.json({ error: '캐릭터 이름이 필요합니다.' }, { status: 400 });
  }

  if (!GEMINI_API_KEY) {
    return NextResponse.json({ error: 'GEMINI_API_KEY가 설정되지 않았습니다.' }, { status: 500 });
  }

  // 프롬프트 생성
  const prompt = `웹툰 캐릭터 이미지를 생성하세요.

캐릭터 이름: ${body.name}
${body.description ? `캐릭터 설명: ${body.description}` : ''}

요구사항:
- 웹툰 스타일의 캐릭터 일러스트
- 전신 이미지 (머리부터 발끝까지)
- 중립적인 포즈, 정면 또는 약간의 3/4 각도
- 깔끔한 배경 또는 투명 배경
- 캐릭터의 특징을 잘 드러내는 디자인`;

  const ai = new GoogleGenAI({ apiKey: GEMINI_API_KEY });

  const config = {
    responseModalities: ['IMAGE'],
    imageConfig: {
      imageSize: '1K',
    },
    temperature: 0.8,
    topP: 0.95,
    topK: 40,
    maxOutputTokens: 32768,
  };

  const contents = [
    {
      role: 'user' as const,
      parts: [{ text: prompt }],
    },
  ];

  // 타임아웃과 재시도
  const maxRetries = 3;
  let lastError: unknown = null;
  let response: Awaited<ReturnType<typeof ai.models.generateContentStream>> | null = null;

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      if (attempt > 0) {
        const delay = Math.min(1000 * Math.pow(2, attempt - 1), 10000);
        await new Promise(resolve => setTimeout(resolve, delay));
      }

      const timeoutPromise = new Promise<never>((_, reject) => {
        setTimeout(() => reject(new Error(`Gemini API 타임아웃: ${GEMINI_API_TIMEOUT}ms 초과`)), GEMINI_API_TIMEOUT);
      });

      const apiPromise = ai.models.generateContentStream({
        model: 'gemini-3-pro-image-preview',
        config,
        contents,
      });

      response = await Promise.race([apiPromise, timeoutPromise]);
      break;
    } catch (error: unknown) {
      lastError = error;
      if (attempt >= maxRetries) {
        console.error('[generate-character-image-preview][POST] Gemini 호출 실패:', error);
        return NextResponse.json({ error: '캐릭터 이미지 생성에 실패했습니다.' }, { status: 500 });
      }
    }
  }

  if (!response) {
    console.error('[generate-character-image-preview][POST] Gemini 응답 없음:', lastError);
    return NextResponse.json({ error: '캐릭터 이미지 생성에 실패했습니다.' }, { status: 500 });
  }

  // 이미지 데이터 추출
  let generatedImageData: string | null = null;
  let generatedImageMimeType: string | null = null;

  for await (const chunk of response) {
    const parts = chunk.candidates?.[0]?.content?.parts;
    if (!parts) continue;
    for (const part of parts) {
      if (part.inlineData) {
        const { data, mimeType } = part.inlineData;
        if (data && typeof data === 'string' && data.length > 0) {
          generatedImageData = data;
          generatedImageMimeType = mimeType || 'image/png';
          break;
        }
      }
    }
    if (generatedImageData) break;
  }

  if (!generatedImageData) {
    console.error('[generate-character-image-preview][POST] 이미지 데이터 없음');
    return NextResponse.json({ error: '이미지 생성에 실패했습니다.' }, { status: 500 });
  }

  // base64 이미지 URL 반환 (저장하지 않음)
  const imageUrl = `data:${generatedImageMimeType || 'image/png'};base64,${generatedImageData}`;

  return NextResponse.json({
    success: true,
    imageUrl,
    mimeType: generatedImageMimeType || 'image/png',
    imageData: generatedImageData, // 채택 시 저장용
  });
}

