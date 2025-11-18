import { NextRequest, NextResponse } from 'next/server';
import { GoogleGenAI } from '@google/genai';

const GEMINI_API_KEY = process.env.GEMINI_API_KEY;
const SEEDREAM_API_KEY = process.env.SEEDREAM_API_KEY;
// ByteDance ARK API 설정 (공식 REST API 샘플 기준)
const SEEDREAM_API_BASE_URL = process.env.SEEDREAM_API_BASE_URL || 'https://ark.ap-southeast.bytepluses.com/api/v3';
const SEEDREAM_API_ENDPOINT = `${SEEDREAM_API_BASE_URL}/images/generations`; // 복수형!

interface RegenerateImageRequest {
  imageUrl: string;
  stylePrompt: string;
  index?: number; // 이미지 생성 순서 (0부터 시작, 홀수는 Gemini, 짝수는 Seedream)
}

export async function POST(request: NextRequest) {
  const startTime = Date.now();
  console.log('[이미지 재생성] 재생성 요청 시작');

  try {
    const body: RegenerateImageRequest = await request.json();
    const { imageUrl, stylePrompt, index = 0 } = body;

    // 홀수 인덱스는 Gemini, 짝수 인덱스는 Seedream 사용
    // 인덱스 0(짝수) -> Seedream, 인덱스 1(홀수) -> Gemini, 인덱스 2(짝수) -> Seedream, ...
    const useSeedream = index % 2 === 0;

    console.log('[이미지 재생성] 요청 파라미터:', {
      imageUrl,
      stylePrompt: stylePrompt.substring(0, 50) + '...',
      index,
      provider: useSeedream ? 'Seedream' : 'Gemini'
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

    let generatedImageData: string | null = null;
    let generatedImageMimeType: string | null = null;

    if (useSeedream) {
      // Seedream API 호출
      if (!SEEDREAM_API_KEY) {
        console.error('[이미지 재생성] SEEDREAM_API_KEY가 설정되지 않음');
        return NextResponse.json(
          { error: 'SEEDREAM_API_KEY가 설정되지 않았습니다.' },
          { status: 500 }
        );
      }

      console.log('[이미지 재생성] Seedream API 호출 시작...');
      const seedreamRequestStart = Date.now();

      try {
        // Seedream API 요청 (ByteDance ARK API)
        // 공식 REST API 샘플 기준:
        // - 엔드포인트: /api/v3/images/generations (복수형)
        // - 인증: Authorization: Bearer {API_KEY}
        // - 필드명: snake_case 형식
        
        console.log('[이미지 재생성] Seedream API 호출:', {
          endpoint: SEEDREAM_API_ENDPOINT,
          imageUrl,
          promptLength: stylePrompt.length,
        });

        const seedreamResponse = await fetch(SEEDREAM_API_ENDPOINT, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${SEEDREAM_API_KEY}`,
          },
          body: JSON.stringify({
            model: 'seedream-4-0-250828',
            prompt: stylePrompt,
            image: [imageUrl], // 이미지 편집을 위한 이미지 URL 배열
            sequential_image_generation: 'disabled',
            response_format: 'url',
            size: '2K',
            stream: false,
            watermark: true,
          }),
        });

        if (!seedreamResponse.ok) {
          const errorText = await seedreamResponse.text().catch(() => '응답 본문을 읽을 수 없음');
          console.error('[이미지 재생성] Seedream API 오류:', {
            status: seedreamResponse.status,
            statusText: seedreamResponse.statusText,
            errorText,
          });
          throw new Error(`Seedream API 오류: ${seedreamResponse.status} ${seedreamResponse.statusText}. ${errorText}`);
        }

        const seedreamData = await seedreamResponse.json();
        console.log('[이미지 재생성] Seedream API 응답:', {
          hasData: !!seedreamData,
          keys: Object.keys(seedreamData || {}),
          responseStructure: seedreamData,
        });

        // 응답 형식: Java SDK 샘플 기준 imagesResponse.getData().get(0).getUrl()
        // 응답 구조: { data: [{ url: "..." }] } 또는 { data: [{ b64_json: "..." }] }
        if (seedreamData.data && Array.isArray(seedreamData.data) && seedreamData.data[0]) {
          const imageResult = seedreamData.data[0];
          
          if (imageResult.url) {
            // URL 형식 응답: 이미지 URL에서 다운로드
            console.log('[이미지 재생성] Seedream 이미지 URL 받음:', imageResult.url);
            const imageResponse = await fetch(imageResult.url);
            if (imageResponse.ok) {
              const imageBuffer = await imageResponse.arrayBuffer();
              generatedImageData = Buffer.from(imageBuffer).toString('base64');
              generatedImageMimeType = imageResponse.headers.get('content-type') || 'image/png';
            } else {
              console.error('[이미지 재생성] Seedream 이미지 URL 다운로드 실패:', {
                status: imageResponse.status,
                statusText: imageResponse.statusText,
              });
            }
          } else if (imageResult.b64_json) {
            // base64 형식 응답: 직접 사용
            console.log('[이미지 재생성] Seedream base64 이미지 받음');
            generatedImageData = imageResult.b64_json;
            generatedImageMimeType = 'image/png';
          } else {
            console.error('[이미지 재생성] Seedream 응답에 이미지 데이터 없음:', imageResult);
          }
        } else {
          console.error('[이미지 재생성] Seedream 응답 구조가 예상과 다름:', seedreamData);
        }

        const seedreamRequestTime = Date.now() - seedreamRequestStart;
        console.log('[이미지 재생성] Seedream API 응답:', {
          requestTime: `${seedreamRequestTime}ms`,
          hasImageData: !!generatedImageData,
          mimeType: generatedImageMimeType
        });

        if (!generatedImageData) {
          console.error('[이미지 재생성] Seedream에서 생성된 이미지 데이터가 없음');
          return NextResponse.json(
            {
              error: 'Seedream에서 생성된 이미지를 받을 수 없습니다.',
              details: seedreamData
            },
            { status: 500 }
          );
        }
      } catch (error: unknown) {
        console.error('[이미지 재생성] Seedream API 예외:', error);
        throw error;
      }
    } else {
      // Gemini API 호출
      if (!GEMINI_API_KEY) {
        console.error('[이미지 재생성] GEMINI_API_KEY가 설정되지 않음');
        return NextResponse.json(
          { error: 'GEMINI_API_KEY가 설정되지 않았습니다.' },
          { status: 500 }
        );
      }

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

