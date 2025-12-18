import { NextRequest, NextResponse } from 'next/server';
import { generateGeminiImage } from '@/lib/image-generation';

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

  try {
    const { base64, mimeType } = await generateGeminiImage({
      provider: 'gemini',
      model: 'gemini-3-pro-image-preview',
      contents: [
        {
          role: 'user',
          parts: [{ text: prompt }],
        },
      ],
      config: {
        responseModalities: ['IMAGE'],
        imageConfig: { imageSize: '1K' },
        temperature: 0.8,
        topP: 0.95,
        topK: 40,
        maxOutputTokens: 32768,
      },
      timeoutMs: GEMINI_API_TIMEOUT,
      retries: 3,
    });

    const imageUrl = `data:${mimeType};base64,${base64}`;

    return NextResponse.json({
      success: true,
      imageUrl,
      mimeType,
      imageData: base64, // 채택 시 저장용
    });
  } catch (error) {
    console.error('[generate-character-image-preview][POST] 이미지 생성 실패:', error);
    return NextResponse.json({ error: '캐릭터 이미지 생성에 실패했습니다.' }, { status: 500 });
  }
}





