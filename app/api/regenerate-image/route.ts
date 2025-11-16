import { NextRequest, NextResponse } from 'next/server';
import { GoogleGenAI } from '@google/genai';

const GEMINI_API_KEY = process.env.GEMINI_API_KEY;

interface RegenerateImageRequest {
  imageUrl: string;
  stylePrompt: string;
}

export async function POST(request: NextRequest) {
  const startTime = Date.now();
  console.log('[이미지 재생성] 재생성 요청 시작');

  try {
    if (!GEMINI_API_KEY) {
      console.error('[이미지 재생성] GEMINI_API_KEY가 설정되지 않음');
      return NextResponse.json(
        { error: 'GEMINI_API_KEY가 설정되지 않았습니다.' },
        { status: 500 }
      );
    }

    const body: RegenerateImageRequest = await request.json();
    const { imageUrl, stylePrompt } = body;

    console.log('[이미지 재생성] 요청 파라미터:', {
      imageUrl,
      stylePrompt: stylePrompt.substring(0, 50) + '...'
    });

    if (!imageUrl) {
      console.error('[이미지 재생성] 이미지 URL이 없음');
      return NextResponse.json(
        { error: '이미지 URL이 필요합니다.' },
        { status: 400 }
      );
    }

    if (!stylePrompt) {
      console.error('[이미지 재생성] 스타일 프롬프트가 없음');
      return NextResponse.json(
        { error: '스타일 프롬프트가 필요합니다.' },
        { status: 400 }
      );
    }

    // 이미지 URL에서 이미지 데이터 가져오기
    console.log('[이미지 재생성] 이미지 다운로드 시작...');
    const imageResponse = await fetch(imageUrl);

    console.log('[이미지 재생성] 이미지 다운로드 응답:', {
      status: imageResponse.status,
      statusText: imageResponse.statusText,
      url: imageUrl
    });

    if (!imageResponse.ok) {
      const errorText = await imageResponse.text().catch(() => '응답 본문을 읽을 수 없음');
      console.error('[이미지 재생성] 이미지 다운로드 실패:', {
        status: imageResponse.status,
        statusText: imageResponse.statusText,
        errorText,
        url: imageUrl
      });
      return NextResponse.json(
        {
          error: '이미지를 가져올 수 없습니다.',
          details: {
            status: imageResponse.status,
            statusText: imageResponse.statusText,
            url: imageUrl
          }
        },
        { status: 400 }
      );
    }

    const imageBuffer = await imageResponse.arrayBuffer();
    const imageSize = imageBuffer.byteLength;
    const imageBase64 = Buffer.from(imageBuffer).toString('base64');
    const mimeType = imageResponse.headers.get('content-type') || 'image/jpeg';

    console.log('[이미지 재생성] 이미지 다운로드 완료:', {
      size: imageSize,
      mimeType,
      base64Length: imageBase64.length
    });

    // Gemini API 호출
    console.log('[이미지 재생성] Gemini API 호출 시작...');
    const geminiRequestStart = Date.now();

    const ai = new GoogleGenAI({
      apiKey: GEMINI_API_KEY,
    });

    const config = {
      responseModalities: ['IMAGE', 'TEXT'],
      imageConfig: {
        imageSize: '1K',
      },
      temperature: 1.0,
      topP: 0.95,
      topK: 40,
      maxOutputTokens: 32768,
    };

    const model = 'gemini-2.5-flash-image';

    const contents = [
      {
        role: 'user' as const,
        parts: [
          {
            text: stylePrompt,
          },
          {
            inlineData: {
              mimeType: mimeType,
              data: imageBase64,
            },
          },
        ],
      },
    ];

    const response = await ai.models.generateContentStream({
      model,
      config,
      contents,
    });

    let generatedImageData: string | null = null;
    let generatedImageMimeType: string | null = null;

    // 스트림에서 모든 chunk 수집
    for await (const chunk of response) {
      if (!chunk.candidates || !chunk.candidates[0]?.content?.parts) {
        continue;
      }

      const parts = chunk.candidates[0].content.parts;
      
      for (const part of parts) {
        if (part.inlineData) {
          const inlineData = part.inlineData;
          if (inlineData.data && typeof inlineData.data === 'string' && inlineData.data.length > 0) {
            generatedImageData = inlineData.data;
            generatedImageMimeType = inlineData.mimeType || 'image/png';
            console.log('[이미지 재생성] 이미지 데이터를 찾음:', {
              dataLength: generatedImageData.length,
              mimeType: generatedImageMimeType
            });
            break;
          }
        }
      }

      // 이미지 데이터를 찾았으면 더 이상 처리하지 않음
      if (generatedImageData) {
        break;
      }
    }

    const geminiRequestTime = Date.now() - geminiRequestStart;
    console.log('[이미지 재생성] Gemini API 응답:', {
      requestTime: `${geminiRequestTime}ms`,
      hasImageData: !!generatedImageData,
      mimeType: generatedImageMimeType
    });

    if (!generatedImageData) {
      console.error('[이미지 재생성] 생성된 이미지 데이터가 없음');
      return NextResponse.json(
        {
          error: '생성된 이미지를 받을 수 없습니다.',
        },
        { status: 500 }
      );
    }

    const totalTime = Date.now() - startTime;
    console.log('[이미지 재생성] 재생성 완료:', {
      totalTime: `${totalTime}ms`,
      mimeType: generatedImageMimeType
    });

    return NextResponse.json({
      imageData: generatedImageData,
      mimeType: generatedImageMimeType || 'image/png'
    });
  } catch (error: unknown) {
    const totalTime = Date.now() - startTime;
    console.error('[이미지 재생성] 예외 발생:', {
      error,
      errorType: error instanceof Error ? error.constructor.name : typeof error,
      errorMessage: error instanceof Error ? error.message : String(error),
      errorStack: error instanceof Error ? error.stack : undefined,
      totalTime: `${totalTime}ms`
    });
    const errorMessage = error instanceof Error ? error.message : '이미지 재생성 중 오류가 발생했습니다.';
    return NextResponse.json(
      {
        error: errorMessage,
        details: {
          errorType: error instanceof Error ? error.constructor.name : typeof error
        }
      },
      { status: 500 }
    );
  }
}

