/**
 * 야콘티 프롬프트 생성 API
 * 
 * POST /api/generate-yakonti-prompt
 * Body: { description: string } // 연출/구도 설명
 * 
 * Gemini API를 사용하여 연출/구도 기반 성인 콘텐츠용 이미지 프롬프트를 생성합니다.
 */

import { NextRequest, NextResponse } from 'next/server';
import { GoogleGenAI } from '@google/genai';

const GEMINI_API_KEY = process.env.GEMINI_API_KEY;
const GEMINI_API_TIMEOUT = 60000; // 60초

interface YakontiPromptRequest {
  description: string; // 연출/구도 설명
  background?: string; // 배경 설명
}

interface YakontiPromptResponse {
  prompt: string; // 생성된 이미지 프롬프트
}

const SYSTEM_PROMPT = `You are an expert image prompt writer for adult manga/comic art generation.

Your task is to convert Korean storyboard direction/composition descriptions into detailed English image prompts.

IMPORTANT RULES:
1. Always refer to the male character as "(man in image)" and the female character as "(girl in image)"
2. Focus on body positions, poses, expressions, and scene composition
3. Include camera angle descriptions (close-up, medium shot, wide shot, etc.)
4. Describe the setting/background briefly based on the provided background info
5. **CLOTHING STATE IS CRITICAL**: Always describe each character's clothing state in detail:
   - If undressed: "completely naked", "nude", "bare-chested", "topless", "bottomless", "half-undressed", etc.
   - If dressed: describe specific clothing items (e.g., "wearing a white shirt unbuttoned", "in a black dress pulled up", "school uniform loosened", "business suit", "casual t-shirt and jeans")
   - Consider the scene context: bedroom scenes may have characters undressed, outdoor scenes may have clothes, romantic dinner may have formal wear, etc.
   - If the Korean text mentions clothing state explicitly (벗은, 옷을 벗고, 알몸, 나체, 셔츠만, 속옷만, etc.), translate it accurately
   - If not mentioned, infer appropriate clothing state from context (background, situation, mood)
6. Use natural, descriptive English
7. Output ONLY the image prompt text, no explanations or formatting
8. Keep the prompt concise but detailed (2-4 sentences)

Example input: "[배경/장소]: 침실

[연출/구도]: 남자가 여자를 뒤에서 안고 있다. 클로즈업. 여자의 표정은 황홀하다."
Example output: A scene of (man in image), completely naked, embracing (girl in image), also nude, from behind in a dimly lit bedroom. Close-up shot focusing on their upper bodies, showing his muscular back. The girl's expression shows ecstasy, her head tilted back against his shoulder.

Example input: "[배경/장소]: 회사 사무실

[연출/구도]: 남자가 여자의 허리를 잡고 키스하고 있다. 미디엄샷."
Example output: A scene of (man in image) in a loosened business suit grabbing (girl in image) by the waist, kissing her passionately in a modern office setting. Medium shot. The girl is wearing a tight pencil skirt and white blouse, slightly disheveled.

Now convert the following Korean direction/composition into an English image prompt:`;

export async function POST(request: NextRequest) {
  const startTime = Date.now();
  console.log('[야콘티 프롬프트] 요청 시작');

  try {
    if (!GEMINI_API_KEY) {
      console.error('[야콘티 프롬프트] GEMINI_API_KEY가 설정되지 않음');
      return NextResponse.json(
        { error: 'GEMINI_API_KEY가 설정되지 않았습니다.' },
        { status: 500 }
      );
    }

    const body: YakontiPromptRequest = await request.json();
    const { description, background } = body;

    if (!description || !description.trim()) {
      return NextResponse.json(
        { error: '연출/구도 설명이 필요합니다.' },
        { status: 400 }
      );
    }

    // Gemini API 호출
    console.log('[야콘티 프롬프트] Gemini API 호출 시작...');
    const geminiRequestStart = Date.now();

    const ai = new GoogleGenAI({
      apiKey: GEMINI_API_KEY,
    });

    const model = 'gemini-3-flash-preview';

    // 배경 설명이 있으면 포함
    const inputText = background 
      ? `[배경/장소]: ${background}\n\n[연출/구도]: ${description}`
      : description;

    const prompt = `${SYSTEM_PROMPT}

${inputText}`;

    const config = {
      responseModalities: ['TEXT'],
      temperature: 0.8,
      topP: 0.95,
      topK: 40,
      maxOutputTokens: 1024,
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
          console.log(`[야콘티 프롬프트] Gemini API 재시도 ${attempt}/${maxRetries} (${delay}ms 대기 후)...`);
          await new Promise(resolve => setTimeout(resolve, delay));
        }

        console.log('[야콘티 프롬프트] Gemini API 호출:', {
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
        console.error(`[야콘티 프롬프트] Gemini API 호출 실패 (시도 ${attempt + 1}/${maxRetries + 1}):`, error);

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
    console.log('[야콘티 프롬프트] Gemini API 응답 수신 완료:', {
      responseLength: responseText.length,
      time: `${geminiRequestTime}ms`,
    });

    // 응답 정리
    const generatedPrompt = responseText.trim();

    if (!generatedPrompt) {
      console.error('[야콘티 프롬프트] 생성된 프롬프트가 없음');
      return NextResponse.json(
        { error: '프롬프트 생성에 실패했습니다.' },
        { status: 500 }
      );
    }

    const totalTime = Date.now() - startTime;
    console.log('[야콘티 프롬프트] 생성 완료:', {
      totalTime: `${totalTime}ms`,
      promptLength: generatedPrompt.length,
    });

    const result: YakontiPromptResponse = {
      prompt: generatedPrompt,
    };

    return NextResponse.json(result);
  } catch (error) {
    const totalTime = Date.now() - startTime;
    console.error('[야콘티 프롬프트] 오류 발생:', error);
    const errorMessage = error instanceof Error ? error.message : '알 수 없는 오류가 발생했습니다.';
    return NextResponse.json(
      { error: errorMessage },
      { status: 500 }
    );
  }
}
