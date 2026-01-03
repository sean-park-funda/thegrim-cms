/**
 * 괴수 프롬프트 생성 API
 *
 * POST /api/generate-monster-prompt
 * Body: { style?: 'normal' | 'jjk' }
 *
 * 스타일별 프롬프트를 생성하여 반환합니다.
 */

import { NextRequest, NextResponse } from 'next/server';
import { GoogleGenAI } from '@google/genai';
import {
  createStyleGenerator,
  selectRandomCreatures,
  selectHumanBodyPart,
  isValidStyle,
  MonsterStyle,
} from '@/lib/monster-styles';

const GEMINI_API_KEY = process.env.GEMINI_API_KEY;
const GEMINI_API_TIMEOUT = 60000; // 60초

export async function POST(request: NextRequest) {
  const startTime = Date.now();
  console.log('[괴수 프롬프트 생성] 요청 시작');

  try {
    // 요청 본문에서 스타일 파라미터 추출
    let style: MonsterStyle = 'normal';
    try {
      const body = await request.json();
      if (body.style && isValidStyle(body.style)) {
        style = body.style;
      }
    } catch {
      // 본문이 없거나 파싱 실패 시 기본값 사용
    }

    console.log('[괴수 프롬프트 생성] 스타일:', style);

    if (!GEMINI_API_KEY) {
      console.error('[괴수 프롬프트 생성] GEMINI_API_KEY가 설정되지 않음');
      return NextResponse.json(
        { error: 'GEMINI_API_KEY가 설정되지 않았습니다.' },
        { status: 500 }
      );
    }

    // 생물 랜덤 선택
    const selectedCreatures = selectRandomCreatures();

    // 스타일 생성기 인스턴스 생성 (인간 요소 포함 여부 결정을 위해 먼저 생성)
    const tempGenerator = createStyleGenerator(style, selectedCreatures, undefined);
    const includeHuman = tempGenerator.shouldIncludeHuman();
    const humanPart = includeHuman ? selectHumanBodyPart() : undefined;

    // 최종 생성기 인스턴스 생성
    const generator = createStyleGenerator(style, selectedCreatures, humanPart);

    console.log('[괴수 프롬프트 생성] 선택된 생물:', {
      style,
      creatures: selectedCreatures.map(sc => `${sc.category}: ${sc.creature.name}`),
      includeHuman,
      humanPart,
    });

    // 프롬프트 생성
    const promptText = generator.generatePrompt();

    console.log('[괴수 프롬프트 생성] Gemini API 호출 시작...');
    const geminiRequestStart = Date.now();

    const ai = new GoogleGenAI({
      apiKey: GEMINI_API_KEY,
    });

    const config = {
      temperature: 1.0,
      topP: 0.95,
      topK: 40,
      maxOutputTokens: 8192,
    };

    const model = 'gemini-3-pro-preview';

    const contents = [
      {
        role: 'user' as const,
        parts: [
          {
            text: promptText,
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
          console.log(`[괴수 프롬프트 생성] Gemini API 재시도 ${attempt}/${maxRetries} (${delay}ms 대기 후)...`);
          await new Promise(resolve => setTimeout(resolve, delay));
        }

        console.log('[괴수 프롬프트 생성] Gemini API 호출:', {
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
        break;
      } catch (error: unknown) {
        lastError = error;
        console.error(`[괴수 프롬프트 생성] Gemini API 호출 실패 (시도 ${attempt + 1}/${maxRetries + 1}):`, {
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

    // 스트림에서 텍스트 수집
    let generatedText = '';
    for await (const chunk of response) {
      if (!chunk.candidates || !chunk.candidates[0]?.content?.parts) {
        continue;
      }

      const parts = chunk.candidates[0].content.parts;

      for (const part of parts) {
        if (part.text) {
          generatedText += part.text;
        }
      }
    }

    const geminiRequestTime = Date.now() - geminiRequestStart;
    console.log('[괴수 프롬프트 생성] Gemini API 응답:', {
      requestTime: `${geminiRequestTime}ms`,
      textLength: generatedText.length,
    });

    if (!generatedText || generatedText.trim().length === 0) {
      console.error('[괴수 프롬프트 생성] 생성된 텍스트가 없음');
      return NextResponse.json(
        { error: '프롬프트 생성에 실패했습니다. 다시 시도해주세요.' },
        { status: 500 }
      );
    }

    // JSON 파싱 시도
    let imagePrompt = '';
    let negativePrompt = '';
    let aspectRatio: string = '1:1';
    const fullText = generatedText.trim();

    try {
      // 마크다운 코드 블록에서 JSON 추출 시도
      let jsonText = fullText;

      // ```json ... ``` 형식인 경우 추출
      const jsonBlockMatch = fullText.match(/```json\s*([\s\S]*?)```/i);
      if (jsonBlockMatch) {
        jsonText = jsonBlockMatch[1].trim();
      } else {
        // ``` ... ``` 형식인 경우 추출
        const codeBlockMatch = fullText.match(/```\s*([\s\S]*?)```/);
        if (codeBlockMatch) {
          jsonText = codeBlockMatch[1].trim();
        }
      }

      // JSON 파싱
      const parsed = JSON.parse(jsonText);

      if (parsed.imagePrompt && typeof parsed.imagePrompt === 'string') {
        imagePrompt = parsed.imagePrompt.trim();
      }

      // negativePrompt 파싱 (JJK 스타일 등에서 사용)
      if (parsed.negativePrompt && typeof parsed.negativePrompt === 'string') {
        negativePrompt = parsed.negativePrompt.trim();
      }

      if (parsed.aspectRatio && typeof parsed.aspectRatio === 'string') {
        const ratio = parsed.aspectRatio.trim();
        // 유효한 비율인지 확인
        const validRatios = generator.getValidAspectRatios();
        if (validRatios.includes(ratio)) {
          aspectRatio = ratio;
        } else {
          console.warn('[괴수 프롬프트 생성] 유효하지 않은 비율:', ratio);
        }
      }

      console.log('[괴수 프롬프트 생성] JSON 파싱 성공:', {
        imagePromptLength: imagePrompt.length,
        negativePromptLength: negativePrompt.length,
        aspectRatio,
        style,
      });
    } catch (jsonError) {
      console.warn('[괴수 프롬프트 생성] JSON 파싱 실패, 텍스트 파싱 시도:', jsonError);

      // JSON 파싱 실패 시 기존 텍스트 파싱 방식으로 폴백
      const aspectRatioMatch = fullText.match(/\[이미지 비율\]:?\s*(\d+:\d+)/i);
      if (aspectRatioMatch) {
        aspectRatio = aspectRatioMatch[1];
      }

      const imagePromptMatch = fullText.match(/\[Image Prompt\]:?\s*([\s\S]*?)(?=\n\n|\n\[|$)/i);
      if (imagePromptMatch) {
        imagePrompt = imagePromptMatch[1].trim();
        imagePrompt = imagePrompt.replace(/```markdown\s*/g, '').replace(/```\s*/g, '').trim();
        imagePrompt = imagePrompt.replace(/^\/imagine\s+prompt:\s*/i, '').trim();
      } else {
        imagePrompt = fullText;
      }
    }

    if (!imagePrompt) {
      console.error('[괴수 프롬프트 생성] Image Prompt를 찾을 수 없음');
      return NextResponse.json(
        { error: '프롬프트 생성에 실패했습니다. Image Prompt를 찾을 수 없습니다.' },
        { status: 500 }
      );
    }

    const totalTime = Date.now() - startTime;
    console.log('[괴수 프롬프트 생성] 생성 완료:', {
      totalTime: `${totalTime}ms`,
      textLength: generatedText.length,
      imagePromptLength: imagePrompt.length,
    });

    return NextResponse.json({
      prompt: fullText,
      imagePrompt: imagePrompt,
      negativePrompt: negativePrompt || undefined,
      aspectRatio: aspectRatio,
      style: style,
    });
  } catch (error: unknown) {
    const totalTime = Date.now() - startTime;
    console.error('[괴수 프롬프트 생성] 예외 발생:', {
      error,
      errorType: error instanceof Error ? error.constructor.name : typeof error,
      errorMessage: error instanceof Error ? error.message : String(error),
      totalTime: `${totalTime}ms`,
    });
    const errorMessage = error instanceof Error ? error.message : '프롬프트 생성 중 오류가 발생했습니다.';
    return NextResponse.json(
      { error: errorMessage },
      { status: 500 }
    );
  }
}
