import { NextRequest, NextResponse } from 'next/server';

const GEMINI_API_KEY = process.env.GEMINI_API_KEY;
const GEMINI_API_URL = 'https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-pro:generateContent';

interface AnalyzeImageRequest {
  imageUrl: string;
}

interface GeminiResponse {
  scene_summary: string;
  tags: string[];
  characters_count: number;
}

export async function POST(request: NextRequest) {
  const startTime = Date.now();
  console.log('[이미지 분석] 분석 요청 시작');
  
  try {
    if (!GEMINI_API_KEY) {
      console.error('[이미지 분석] GEMINI_API_KEY가 설정되지 않음');
      return NextResponse.json(
        { error: 'GEMINI_API_KEY가 설정되지 않았습니다.' },
        { status: 500 }
      );
    }

    const body: AnalyzeImageRequest = await request.json();
    const { imageUrl } = body;

    console.log('[이미지 분석] 이미지 URL:', imageUrl);

    if (!imageUrl) {
      console.error('[이미지 분석] 이미지 URL이 없음');
      return NextResponse.json(
        { error: '이미지 URL이 필요합니다.' },
        { status: 400 }
      );
    }

    // 이미지 URL에서 이미지 데이터 가져오기
    console.log('[이미지 분석] 이미지 다운로드 시작...');
    const imageResponse = await fetch(imageUrl);
    
    console.log('[이미지 분석] 이미지 다운로드 응답:', {
      status: imageResponse.status,
      statusText: imageResponse.statusText,
      headers: Object.fromEntries(imageResponse.headers.entries()),
      url: imageUrl
    });

    if (!imageResponse.ok) {
      const errorText = await imageResponse.text().catch(() => '응답 본문을 읽을 수 없음');
      console.error('[이미지 분석] 이미지 다운로드 실패:', {
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
    
    console.log('[이미지 분석] 이미지 다운로드 완료:', {
      size: imageSize,
      mimeType,
      base64Length: imageBase64.length
    });

    // 프롬프트 구성
    const prompt = `You are an assistant that analyzes webtoon scene images 

to generate metadata for internal scene search and reuse.

Your goal is to describe the essential meaning and emotional tone of the scene, 
not detailed appearance like clothing or hair color.

Focus on emotion, relationship, composition, and atmosphere.

Follow these steps:

1. **Understand the scene**
   - Identify how many people are visible and what kind of interaction or mood exists.
   - Focus on the emotional or narrative context rather than physical details.

2. **Summarize the scene**
   - Write one concise Korean sentence that captures the main meaning or feeling of the scene.

3. **Generate Korean tags**
   - Produce 5–10 short Korean tags (single words or short phrases) that reflect:
     감정, 행동, 관계, 구도, 장소, 분위기.
   - Tags should be generic and reusable.
   - Avoid duplicates or similar synonyms.
   - Example: ["두_사람", "화해", "조용함", "실내", "감정교류", "겨울"]

4. **Output format**
   - Return only valid JSON in this exact structure:

{
  "scene_summary": "...",
  "tags": ["...", "...", "..."],
  "characters_count": number
}`;

    // Gemini API 호출
    console.log('[이미지 분석] Gemini API 호출 시작...');
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
              parts: [
                {
                  text: prompt,
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
        }),
      }
    );

    const geminiRequestTime = Date.now() - geminiRequestStart;
    console.log('[이미지 분석] Gemini API 응답:', {
      status: geminiResponse.status,
      statusText: geminiResponse.statusText,
      requestTime: `${geminiRequestTime}ms`
    });

    if (!geminiResponse.ok) {
      const errorData = await geminiResponse.text().catch(() => '응답 본문을 읽을 수 없음');
      console.error('[이미지 분석] Gemini API 오류:', {
        status: geminiResponse.status,
        statusText: geminiResponse.statusText,
        errorData,
        url: GEMINI_API_URL
      });
      return NextResponse.json(
        { 
          error: '이미지 분석에 실패했습니다.',
          details: {
            status: geminiResponse.status,
            statusText: geminiResponse.statusText,
            errorData: errorData.substring(0, 500) // 처음 500자만
          }
        },
        { status: 500 }
      );
    }

    const geminiData = await geminiResponse.json();
    console.log('[이미지 분석] Gemini API 응답 데이터 구조:', {
      hasCandidates: !!geminiData.candidates,
      candidatesLength: geminiData.candidates?.length,
      firstCandidate: geminiData.candidates?.[0] ? {
        hasContent: !!geminiData.candidates[0].content,
        hasParts: !!geminiData.candidates[0].content?.parts,
        partsLength: geminiData.candidates[0].content?.parts?.length
      } : null
    });

    // Gemini 응답에서 텍스트 추출
    const responseText =
      geminiData.candidates?.[0]?.content?.parts?.[0]?.text;

    console.log('[이미지 분석] 응답 텍스트:', {
      hasText: !!responseText,
      textLength: responseText?.length,
      textPreview: responseText?.substring(0, 200)
    });

    if (!responseText) {
      console.error('[이미지 분석] 응답 텍스트가 없음. 전체 응답:', JSON.stringify(geminiData, null, 2));
      return NextResponse.json(
        { 
          error: '분석 결과를 받을 수 없습니다.',
          details: {
            responseStructure: {
              hasCandidates: !!geminiData.candidates,
              candidatesLength: geminiData.candidates?.length
            }
          }
        },
        { status: 500 }
      );
    }

    // JSON 파싱 시도
    console.log('[이미지 분석] JSON 파싱 시작...');
    let analysisResult: GeminiResponse;
    try {
      // 응답 텍스트에서 JSON 부분만 추출 (마크다운 코드 블록 제거)
      const jsonMatch = responseText.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        analysisResult = JSON.parse(jsonMatch[0]);
        console.log('[이미지 분석] JSON 파싱 성공:', {
          hasSceneSummary: !!analysisResult.scene_summary,
          tagsCount: analysisResult.tags?.length,
          charactersCount: analysisResult.characters_count
        });
      } else {
        throw new Error('JSON을 찾을 수 없습니다.');
      }
    } catch (parseError) {
      console.error('[이미지 분석] JSON 파싱 오류:', parseError);
      console.error('[이미지 분석] 전체 응답 텍스트:', responseText);
      return NextResponse.json(
        { 
          error: '분석 결과를 파싱할 수 없습니다.',
          details: {
            parseError: parseError instanceof Error ? parseError.message : String(parseError),
            responseText: responseText.substring(0, 1000) // 처음 1000자만
          }
        },
        { status: 500 }
      );
    }

    // 결과 검증
    console.log('[이미지 분석] 결과 검증 시작...');
    if (
      !analysisResult.scene_summary ||
      !Array.isArray(analysisResult.tags) ||
      typeof analysisResult.characters_count !== 'number'
    ) {
      console.error('[이미지 분석] 결과 형식 오류:', {
        hasSceneSummary: !!analysisResult.scene_summary,
        isTagsArray: Array.isArray(analysisResult.tags),
        charactersCountType: typeof analysisResult.characters_count,
        result: analysisResult
      });
      return NextResponse.json(
        { 
          error: '분석 결과 형식이 올바르지 않습니다.',
          details: {
            received: analysisResult
          }
        },
        { status: 500 }
      );
    }

    const totalTime = Date.now() - startTime;
    console.log('[이미지 분석] 분석 완료:', {
      totalTime: `${totalTime}ms`,
      sceneSummary: analysisResult.scene_summary.substring(0, 50) + '...',
      tagsCount: analysisResult.tags.length
    });

    return NextResponse.json(analysisResult);
  } catch (error: unknown) {
    const totalTime = Date.now() - startTime;
    console.error('[이미지 분석] 예외 발생:', {
      error,
      errorType: error instanceof Error ? error.constructor.name : typeof error,
      errorMessage: error instanceof Error ? error.message : String(error),
      errorStack: error instanceof Error ? error.stack : undefined,
      totalTime: `${totalTime}ms`
    });
    const errorMessage = error instanceof Error ? error.message : '이미지 분석 중 오류가 발생했습니다.';
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

