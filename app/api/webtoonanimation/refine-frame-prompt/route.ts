import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { GoogleGenAI } from '@google/genai';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

const GEMINI_API_KEY = process.env.GEMINI_API_KEY;

// promptType → DB 컬럼명 매핑
const DB_FIELDS: Record<string, { en: string; ko: string }> = {
  colorize:    { en: 'gemini_colorize_prompt',      ko: 'gemini_colorize_prompt_ko' },
  expand:      { en: 'gemini_expand_prompt',         ko: 'gemini_expand_prompt_ko' },
  other_frame: { en: 'gemini_start_frame_prompt',    ko: 'gemini_other_frame_prompt_ko' },
  video:       { en: 'video_prompt',                 ko: 'video_prompt_ko' },
};

const PROMPT_ROLE: Record<string, string> = {
  colorize:    '라인아트 → 컬러 변환 (Gemini 이미지 생성용)',
  expand:      '앵커 프레임 16:9 확장 (Gemini 이미지 생성용)',
  other_frame: '반대쪽 프레임 생성 (Gemini 이미지 생성용)',
  video:       '영상 생성 (Wan 2.2 FLF2V용)',
};

/**
 * POST: 개별 프롬프트 AI 수정
 * { cutId, promptType, instruction, currentEn, currentKo }
 * → { prompt_en, prompt_ko }
 */
export async function POST(request: NextRequest) {
  try {
    if (!GEMINI_API_KEY) {
      return NextResponse.json({ error: 'GEMINI_API_KEY 필요' }, { status: 500 });
    }

    const { cutId, promptType, instruction, currentEn, currentKo } = await request.json();

    if (!cutId || !promptType || !instruction?.trim()) {
      return NextResponse.json({ error: 'cutId, promptType, instruction 필요' }, { status: 400 });
    }

    const fields = DB_FIELDS[promptType];
    if (!fields) {
      return NextResponse.json({ error: `알 수 없는 promptType: ${promptType}` }, { status: 400 });
    }

    const roleDesc = PROMPT_ROLE[promptType] || promptType;
    const isImagePrompt = promptType !== 'video';

    const systemPrompt = `당신은 한국 웹툰 애니메이션 제작 전문가입니다.
아래 프롬프트를 수정 지시에 따라 개선해주세요.

[프롬프트 용도]: ${roleDesc}
[현재 한국어 설명]: ${currentKo || '(없음)'}
[현재 영어 프롬프트]: ${currentEn || '(없음)'}
[수정 지시]: ${instruction}

---

${isImagePrompt
  ? `규칙:
- prompt_en: Gemini 이미지 생성에 직접 사용될 영어 프롬프트. 구체적이고 시각적으로 작성.
- prompt_ko: prompt_en의 한국어 설명 (사람이 읽기 위한 것).`
  : `규칙:
- prompt_en: Wan 2.2 영상 생성에 직접 사용될 영어 프롬프트. "Anime style, Korean webtoon aesthetic"으로 시작, 2~4문장.
- prompt_ko: prompt_en의 한국어 설명.`}

JSON만 반환하세요:
{"prompt_en": "...", "prompt_ko": "..."}`;

    const ai = new GoogleGenAI({ apiKey: GEMINI_API_KEY });
    const response = await ai.models.generateContent({
      model: 'gemini-2.5-flash',
      config: { temperature: 0.7 },
      contents: [{ role: 'user', parts: [{ text: systemPrompt }] }],
    });

    const raw = response.text?.trim() || '';
    const jsonMatch = raw.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      return NextResponse.json({ error: 'Gemini 응답 파싱 실패', raw }, { status: 500 });
    }

    const result = JSON.parse(jsonMatch[0]);
    const promptEn = result.prompt_en || '';
    const promptKo = result.prompt_ko || '';

    // DB 저장
    await supabase
      .from('webtoonanimation_cuts')
      .update({ [fields.en]: promptEn, [fields.ko]: promptKo })
      .eq('id', cutId);

    return NextResponse.json({ prompt_en: promptEn, prompt_ko: promptKo });
  } catch (error) {
    console.error('[refine-frame-prompt] 실패:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : '프롬프트 수정 실패' },
      { status: 500 }
    );
  }
}
