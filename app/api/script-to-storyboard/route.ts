import { NextRequest, NextResponse } from 'next/server';
import { GoogleGenAI } from '@google/genai';

const GEMINI_API_KEY = process.env.GEMINI_API_KEY;
const GEMINI_API_TIMEOUT = 60000; // 60초

interface ScriptToStoryboardRequest {
  script: string; // 대본 텍스트
}

interface ScriptToStoryboardResponse {
  cuts: Array<{
    cutNumber: number; // 컷 번호
    title: string; // 컷 제목
    description: string; // 컷 설명 (연출/구도)
    dialogue?: string; // 대사/내레이션
  }>;
}

const SYSTEM_PROMPT = `당신은 웹툰 제작회사의 프로 작가입니다. 대본의 씬 내용을 받아서 적절한 컷으로 나누어 각 컷별로 콘티를 그리기 위한 상세한 설명(글콘티)을 만드는 것이 당신의 할 일입니다.

**중요: 응답은 반드시 완전한 JSON 형태로만 작성해주세요. 설명 텍스트, 마크다운, 코드 블록 등은 포함하지 마세요. 순수 JSON만 반환해주세요.**

각 컷의 description 필드에는 다음 내용을 포함해주세요:
- 등장인물의 위치와 자세
- 카메라의 구도와 시점 (클로즈업, 미디엄샷, 와이드샷, 버드아이뷰 등)
- 인기있는 웹툰의 스타일리시한 연출 (모션 블러, 빛의 잔상, 명암 효과 등)
- 장면의 분위기와 톤

응답 형식:
{
  "cuts": [
    {
      "cutNumber": 1,
      "title": "컷 제목",
      "description": "등장인물의 위치, 자세, 카메라 구도, 연출 기법 등을 상세히 설명",
      "dialogue": "대사 또는 내레이션 (있는 경우)"
    }
  ]
}

다음 대본을 글콘티로 변환해주세요:`;

export async function POST(request: NextRequest) {
  const startTime = Date.now();
  console.log('[대본to글콘티] 요청 시작');

  try {
    if (!GEMINI_API_KEY) {
      console.error('[대본to글콘티] GEMINI_API_KEY가 설정되지 않음');
      return NextResponse.json(
        { error: 'GEMINI_API_KEY가 설정되지 않았습니다.' },
        { status: 500 }
      );
    }

    const body: ScriptToStoryboardRequest = await request.json();
    const { script } = body;

    if (!script || !script.trim()) {
      return NextResponse.json(
        { error: '대본 텍스트가 필요합니다.' },
        { status: 400 }
      );
    }

    // Gemini API 호출
    console.log('[대본to글콘티] Gemini API 호출 시작...');
    const geminiRequestStart = Date.now();

    const ai = new GoogleGenAI({
      apiKey: GEMINI_API_KEY,
    });

    const model = 'gemini-3-pro-preview';

    const prompt = `${SYSTEM_PROMPT}

--
${script}`;

    const config = {
      responseModalities: ['TEXT'],
      temperature: 0.7,
      topP: 0.95,
      topK: 40,
      maxOutputTokens: 8192,
    };

    const contents = [
      {
        role: 'user' as const,
        parts: [
          {
            text: prompt,
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
          console.log(`[대본to글콘티] Gemini API 재시도 ${attempt}/${maxRetries} (${delay}ms 대기 후)...`);
          await new Promise(resolve => setTimeout(resolve, delay));
        }

        console.log('[대본to글콘티] Gemini API 호출:', {
          model,
          attempt: attempt + 1,
          maxRetries: maxRetries + 1,
        });

        // 타임아웃 설정
        const timeoutPromise = new Promise<never>((_, reject) => {
          setTimeout(() => {
            reject(new Error(`Gemini API 타임아웃: ${GEMINI_API_TIMEOUT}ms 초과`));
          }, GEMINI_API_TIMEOUT);
        });

        const apiPromise = ai.models.generateContentStream({
          model,
          config,
          contents,
        });

        response = await Promise.race([apiPromise, timeoutPromise]);

        // 성공 시 루프 종료
        break;
      } catch (error: unknown) {
        lastError = error;
        console.error(`[대본to글콘티] Gemini API 호출 실패 (시도 ${attempt + 1}/${maxRetries + 1}):`, error);

        if (attempt >= maxRetries) {
          throw error;
        }
      }
    }

    if (!response) {
      throw lastError || new Error('Gemini API 응답을 받지 못했습니다.');
    }

    // 스트림에서 모든 chunk 수집
    let responseText = '';
    for await (const chunk of response) {
      if (!chunk.candidates || !chunk.candidates[0]?.content?.parts) {
        continue;
      }

      const parts = chunk.candidates[0].content.parts;

      for (const part of parts) {
        if (part.text) {
          responseText += part.text;
        }
      }
    }

    const geminiRequestTime = Date.now() - geminiRequestStart;
    console.log('[대본to글콘티] Gemini API 응답 수신 완료:', {
      responseLength: responseText.length,
      time: `${geminiRequestTime}ms`,
    });

    // JSON 파싱 시도
    let parsedResponse: ScriptToStoryboardResponse;
    try {
      let cleanedText = responseText.trim();
      
      // 마크다운 코드 블록 제거 (```json ... ``` 또는 ``` ... ```)
      if (cleanedText.includes('```')) {
        const codeBlockStart = cleanedText.indexOf('```');
        const codeBlockEnd = cleanedText.lastIndexOf('```');
        if (codeBlockStart !== -1 && codeBlockEnd !== -1 && codeBlockEnd > codeBlockStart) {
          // 코드 블록 내부만 추출
          const codeBlockContent = cleanedText.substring(codeBlockStart, codeBlockEnd + 3);
          // json, json:json 등의 언어 태그 제거
          cleanedText = codeBlockContent.replace(/```json:?json?/gi, '').replace(/```/g, '').trim();
        }
      }
      
      // JSON 객체 시작과 끝 찾기 (앞뒤 설명 텍스트 제거)
      const jsonStart = cleanedText.indexOf('{');
      const jsonEnd = cleanedText.lastIndexOf('}');
      
      if (jsonStart !== -1 && jsonEnd !== -1 && jsonEnd > jsonStart) {
        cleanedText = cleanedText.substring(jsonStart, jsonEnd + 1);
      } else {
        // JSON 객체를 찾을 수 없으면 원본 텍스트 사용
        console.warn('[대본to글콘티] JSON 객체를 찾을 수 없어 원본 텍스트 사용');
      }

      parsedResponse = JSON.parse(cleanedText);
    } catch (parseError) {
      console.error('[대본to글콘티] JSON 파싱 실패:', parseError);
      console.error('[대본to글콘티] 원본 응답:', responseText);
      return NextResponse.json(
        { error: 'Gemini API 응답을 파싱할 수 없습니다. 응답 형식을 확인해주세요.' },
        { status: 500 }
      );
    }

    // 응답 검증
    if (!parsedResponse.cuts || !Array.isArray(parsedResponse.cuts)) {
      console.error('[대본to글콘티] 잘못된 응답 형식:', parsedResponse);
      return NextResponse.json(
        { error: 'Gemini API 응답 형식이 올바르지 않습니다. cuts 배열이 필요합니다.' },
        { status: 500 }
      );
    }

    const totalTime = Date.now() - startTime;
    console.log('[대본to글콘티] 요청 완료:', {
      cutsCount: parsedResponse.cuts.length,
      totalTime: `${totalTime}ms`,
    });

    return NextResponse.json(parsedResponse);
  } catch (error) {
    const totalTime = Date.now() - startTime;
    console.error('[대본to글콘티] 오류 발생:', error);
    const errorMessage = error instanceof Error ? error.message : '알 수 없는 오류가 발생했습니다.';
    return NextResponse.json(
      { error: errorMessage },
      { status: 500 }
    );
  }
}

