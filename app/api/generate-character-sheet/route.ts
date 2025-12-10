import { NextRequest, NextResponse } from 'next/server';
import { GoogleGenAI } from '@google/genai';

const GEMINI_API_KEY = process.env.GEMINI_API_KEY;

// 캐릭터 시트 생성 프롬프트
const CHARACTER_SHEET_PROMPT = `Use the uploaded image as the main reference for the character. Recreate the character exactly — same face, hair, clothing style, colors, and details.

CRITICAL BODY PROPORTIONS - MUST FOLLOW:
- If the reference image clearly shows the FULL body from head to toe, preserve those exact proportions.
- Otherwise (if legs are cropped, cut off, or not fully visible), you MUST draw the character with EXAGGERATED FASHION MODEL proportions:
  * Head-to-body ratio: 1:8 or 1:9 (very small head compared to body)
  * EXTREMELY LONG LEGS - legs should be at least 4-5 times the length of the torso
  * For female characters: voluptuous figure with large bust
  * Think of unrealistic manga/manhwa style with impossibly long legs like a runway model

Generate four full-body images on a solid background, arranged HORIZONTALLY in a single row (side by side from left to right):
1. Front view (leftmost)
2. Right side view (second from left)
3. Back view (third from left)
4. Three-quarter (3/4) view (rightmost)

The character must be fully visible from head to toe, in a neutral standing pose, without emotions or added elements.
Final output: a single combined image with all four views arranged horizontally in one row.`;

interface GenerateCharacterSheetRequest {
  imageBase64: string;
  imageMimeType: string;
}

export async function POST(request: NextRequest) {
  const startTime = Date.now();
  console.log('[캐릭터 시트 생성] 요청 시작');

  try {
    if (!GEMINI_API_KEY) {
      console.error('[캐릭터 시트 생성] GEMINI_API_KEY가 설정되지 않음');
      return NextResponse.json(
        { error: 'GEMINI_API_KEY가 설정되지 않았습니다.' },
        { status: 500 }
      );
    }

    const body: GenerateCharacterSheetRequest = await request.json();
    const { imageBase64, imageMimeType } = body;

    if (!imageBase64) {
      console.error('[캐릭터 시트 생성] 이미지 데이터가 없음');
      return NextResponse.json(
        { error: '이미지 데이터가 필요합니다.' },
        { status: 400 }
      );
    }

    console.log('[캐릭터 시트 생성] Gemini API 호출 시작...');
    const geminiRequestStart = Date.now();

    const ai = new GoogleGenAI({
      apiKey: GEMINI_API_KEY,
    });

    const config = {
      responseModalities: ['IMAGE', 'TEXT'],
      imageConfig: {
        imageSize: '1K',
        aspectRatio: '21:9', // 4개 캐릭터 가로 배열을 위한 와이드 비율
      },
      temperature: 1.0,
      topP: 0.95,
      topK: 40,
      maxOutputTokens: 32768,
    };

    const model = 'gemini-3-pro-image-preview';

    const contents = [
      {
        role: 'user' as const,
        parts: [
          {
            text: CHARACTER_SHEET_PROMPT,
          },
          {
            inlineData: {
              mimeType: imageMimeType || 'image/png',
              data: imageBase64,
            },
          },
        ],
      },
    ];

    // 재시도 로직
    const maxRetries = 3;
    let lastError: unknown = null;
    let response: Awaited<ReturnType<typeof ai.models.generateContentStream>> | null = null;

    for (let attempt = 0; attempt <= maxRetries; attempt++) {
      try {
        if (attempt > 0) {
          const delay = Math.min(1000 * Math.pow(2, attempt - 1), 10000);
          console.log(`[캐릭터 시트 생성] Gemini API 재시도 ${attempt}/${maxRetries} (${delay}ms 대기 후)...`);
          await new Promise(resolve => setTimeout(resolve, delay));
        }

        console.log('[캐릭터 시트 생성] Gemini API 호출:', {
          model,
          attempt: attempt + 1,
          maxRetries: maxRetries + 1,
        });

        response = await ai.models.generateContentStream({
          model,
          config,
          contents,
        });

        break;
      } catch (error: unknown) {
        lastError = error;
        console.error(`[캐릭터 시트 생성] Gemini API 호출 실패 (시도 ${attempt + 1}/${maxRetries + 1}):`, {
          error: error instanceof Error ? error.message : String(error),
        });

        if (attempt >= maxRetries) {
          throw error;
        }
      }
    }

    if (!response) {
      throw lastError || new Error('Gemini API 응답을 받을 수 없습니다.');
    }

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
            console.log('[캐릭터 시트 생성] 이미지 데이터를 찾음:', {
              dataLength: generatedImageData.length,
              mimeType: generatedImageMimeType
            });
            break;
          }
        }
      }

      if (generatedImageData) {
        break;
      }
    }

    const geminiRequestTime = Date.now() - geminiRequestStart;
    console.log('[캐릭터 시트 생성] Gemini API 응답:', {
      requestTime: `${geminiRequestTime}ms`,
      hasImageData: !!generatedImageData,
      mimeType: generatedImageMimeType
    });

    if (!generatedImageData) {
      console.error('[캐릭터 시트 생성] 생성된 이미지 데이터가 없음');
      return NextResponse.json(
        { error: '캐릭터 시트 생성에 실패했습니다. 다시 시도해주세요.' },
        { status: 500 }
      );
    }

    const totalTime = Date.now() - startTime;
    console.log('[캐릭터 시트 생성] 생성 완료:', {
      totalTime: `${totalTime}ms`,
      mimeType: generatedImageMimeType
    });

    return NextResponse.json({
      imageData: generatedImageData,
      mimeType: generatedImageMimeType || 'image/png'
    });
  } catch (error: unknown) {
    const totalTime = Date.now() - startTime;
    console.error('[캐릭터 시트 생성] 예외 발생:', {
      error,
      errorType: error instanceof Error ? error.constructor.name : typeof error,
      errorMessage: error instanceof Error ? error.message : String(error),
      totalTime: `${totalTime}ms`
    });
    const errorMessage = error instanceof Error ? error.message : '캐릭터 시트 생성 중 오류가 발생했습니다.';
    return NextResponse.json(
      { error: errorMessage },
      { status: 500 }
    );
  }
}

