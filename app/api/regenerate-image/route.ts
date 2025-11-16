import { NextRequest, NextResponse } from 'next/server';

const GEMINI_API_KEY = process.env.GEMINI_API_KEY;
const GEMINI_API_URL = 'https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-image:generateContent';

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

    const geminiResponse = await fetch(
      `${GEMINI_API_URL}?key=${GEMINI_API_KEY}`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          contents: [
            {
              role: 'user',
              parts: [
                {
                  text: stylePrompt,
                },
                {
                  inline_data: {
                    mime_type: mimeType,
                    data: imageBase64,
                  },
                },
              ],
            },
          ],
          generationConfig: {
            responseModalities: ['IMAGE', 'TEXT'],
            imageConfig: {
              imageSize: '1K',
            },
            temperature: 1.0,
            topP: 0.95,
            topK: 40,
            maxOutputTokens: 32768,
          },
        }),
      }
    );

    const geminiRequestTime = Date.now() - geminiRequestStart;
    console.log('[이미지 재생성] Gemini API 응답:', {
      status: geminiResponse.status,
      statusText: geminiResponse.statusText,
      requestTime: `${geminiRequestTime}ms`
    });

    if (!geminiResponse.ok) {
      const errorData = await geminiResponse.text().catch(() => '응답 본문을 읽을 수 없음');
      console.error('[이미지 재생성] Gemini API 오류:', {
        status: geminiResponse.status,
        statusText: geminiResponse.statusText,
        errorData: errorData.substring(0, 500),
        url: GEMINI_API_URL
      });
      return NextResponse.json(
        {
          error: '이미지 재생성에 실패했습니다.',
          details: {
            status: geminiResponse.status,
            statusText: geminiResponse.statusText,
            errorData: errorData.substring(0, 500)
          }
        },
        { status: 500 }
      );
    }

    const geminiData = await geminiResponse.json();
    console.log('[이미지 재생성] Gemini API 응답 데이터 구조:', {
      hasCandidates: !!geminiData.candidates,
      candidatesLength: geminiData.candidates?.length,
      firstCandidate: geminiData.candidates?.[0] ? {
        hasContent: !!geminiData.candidates[0].content,
        hasParts: !!geminiData.candidates[0].content?.parts,
        partsLength: geminiData.candidates[0].content?.parts?.length
      } : null
    });

    // 전체 응답 구조 로깅 (디버깅용)
    console.log('[이미지 재생성] 전체 응답 구조:', JSON.stringify(geminiData, null, 2));

    // Gemini 응답에서 이미지 데이터 추출
    const parts = geminiData.candidates?.[0]?.content?.parts || [];
    let generatedImageData: string | null = null;
    let generatedImageMimeType: string | null = null;

    console.log('[이미지 재생성] Parts 배열:', {
      partsLength: parts.length,
      partsTypes: parts.map((part: unknown, index: number) => {
        const p = part as { 
          text?: string; 
          inline_data?: { mime_type?: string; data?: string };
          inlineData?: { mimeType?: string; data?: string };
        };
        return {
          index,
          hasText: !!p.text,
          hasInlineData_snake: !!p.inline_data,
          hasInlineData_camel: !!p.inlineData,
          inlineDataType_snake: p.inline_data?.mime_type || null,
          inlineDataType_camel: p.inlineData?.mimeType || null,
          inlineDataLength_snake: p.inline_data?.data?.length || null,
          inlineDataLength_camel: p.inlineData?.data?.length || null,
          keys: Object.keys(p)
        };
      })
    });

    // 모든 parts를 순회하며 이미지 데이터 찾기
    for (let i = 0; i < parts.length; i++) {
      const part = parts[i] as { 
        text?: string; 
        inline_data?: { mime_type?: string; data?: string };
        inlineData?: { mimeType?: string; data?: string };
      };
      console.log(`[이미지 재생성] Part ${i}:`, {
        hasText: !!part.text,
        hasInlineData_snake: !!part.inline_data,
        hasInlineData_camel: !!part.inlineData,
        keys: Object.keys(part)
      });

      // 카멜케이스 형식 (inlineData) 확인
      if (part.inlineData) {
        const inlineData = part.inlineData;
        if (inlineData.data && typeof inlineData.data === 'string' && inlineData.data.length > 0) {
          generatedImageData = inlineData.data;
          generatedImageMimeType = inlineData.mimeType || 'image/png';
          console.log(`[이미지 재생성] 이미지 데이터를 Part ${i}에서 찾음 (카멜케이스):`, {
            dataLength: generatedImageData.length,
            mimeType: generatedImageMimeType
          });
          break;
        }
      }

      // 스네이크케이스 형식 (inline_data) 확인 (하위 호환성)
      if (part.inline_data) {
        const inlineData = part.inline_data;
        if (inlineData.data && typeof inlineData.data === 'string' && inlineData.data.length > 0) {
          generatedImageData = inlineData.data;
          generatedImageMimeType = inlineData.mime_type || 'image/png';
          console.log(`[이미지 재생성] 이미지 데이터를 Part ${i}에서 찾음 (스네이크케이스):`, {
            dataLength: generatedImageData.length,
            mimeType: generatedImageMimeType
          });
          break;
        }
      }
    }

    console.log('[이미지 재생성] 이미지 데이터 추출 결과:', {
      hasImageData: !!generatedImageData,
      mimeType: generatedImageMimeType,
      dataLength: generatedImageData?.length
    });

    if (!generatedImageData) {
      console.error('[이미지 재생성] 생성된 이미지 데이터가 없음. 전체 응답:', JSON.stringify(geminiData, null, 2));
      return NextResponse.json(
        {
          error: '생성된 이미지를 받을 수 없습니다.',
          details: {
            responseStructure: {
              hasCandidates: !!geminiData.candidates,
              candidatesLength: geminiData.candidates?.length,
              partsCount: parts.length,
              partsDetails: parts.map((part: unknown) => {
                const p = part as { text?: string; inline_data?: unknown };
                return {
                  hasText: !!p.text,
                  hasInlineData: !!p.inline_data,
                  keys: Object.keys(p)
                };
              })
            }
          }
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

