import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { GoogleGenAI } from '@google/genai';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

const GEMINI_API_KEY = process.env.GEMINI_API_KEY;

/**
 * POST: 영상 프롬프트 AI 개선
 * { cutId, instruction, currentPromptEn, currentPromptKo }
 * → Gemini로 개선된 한국어/영어 프롬프트 반환 + DB 저장
 */
export async function POST(request: NextRequest) {
  try {
    if (!GEMINI_API_KEY) {
      return NextResponse.json({ error: 'GEMINI_API_KEY 필요' }, { status: 500 });
    }

    const { cutId, instruction, currentPromptEn, currentPromptKo } = await request.json();
    if (!cutId || !instruction) {
      return NextResponse.json({ error: 'cutId, instruction 필요' }, { status: 400 });
    }

    const systemPrompt = `당신은 한국 웹툰 애니메이션 제작 전문가입니다.
아래 기존 영상 프롬프트를 주어진 수정 지시사항에 따라 개선해주세요.

[기존 영어 프롬프트]:
${currentPromptEn || '(없음)'}

[기존 한국어 설명]:
${currentPromptKo || '(없음)'}

[수정 지시사항]:
${instruction}

---

개선된 프롬프트를 아래 JSON 형식으로 반환하세요:

{
  "video_prompt": "...",
  "video_prompt_ko": "..."
}

규칙:
- video_prompt: Wan 2.2 / fal.ai 영상 생성용 영어 프롬프트 (2~4문장, "Anime style, Korean webtoon aesthetic" 스타일)
- video_prompt_ko: 위 영어 프롬프트의 한국어 설명 (제작자가 이해할 수 있도록)
- 수정 지시사항의 의도를 충실히 반영
- JSON 외 다른 텍스트 없이 오직 JSON만 반환`;

    const ai = new GoogleGenAI({ apiKey: GEMINI_API_KEY });
    const response = await ai.models.generateContent({
      model: 'gemini-2.5-flash',
      config: { temperature: 0.7 },
      contents: [{ role: 'user' as const, parts: [{ text: systemPrompt }] }],
    });

    const raw = response.text?.trim() || '';
    const jsonMatch = raw.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      return NextResponse.json({ error: 'Gemini 응답 파싱 실패', raw }, { status: 500 });
    }

    const refined = JSON.parse(jsonMatch[0]);

    // DB 저장
    await supabase
      .from('webtoonanimation_cuts')
      .update({
        video_prompt: refined.video_prompt,
        video_prompt_ko: refined.video_prompt_ko || null,
      })
      .eq('id', cutId);

    return NextResponse.json({
      video_prompt: refined.video_prompt,
      video_prompt_ko: refined.video_prompt_ko,
    });
  } catch (error) {
    console.error('[refine-video-prompt] 실패:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : '프롬프트 개선 실패' },
      { status: 500 }
    );
  }
}
