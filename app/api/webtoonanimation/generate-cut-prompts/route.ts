import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { GoogleGenAI } from '@google/genai';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

const GEMINI_API_KEY = process.env.GEMINI_API_KEY;

const FRAME_STRATEGY_LABELS: Record<string, string> = {
  enter: '캐릭터 등장 (빈 배경 → 캐릭터)',
  exit: '캐릭터 퇴장 (모든 인물 → 일부 퇴장)',
  expression: '표정 변화 (감정 변화 클로즈업)',
  empty_to_action: '빈 배경 → 액션 (캐릭터 포즈)',
};

const FRAME_ROLE_LABELS: Record<string, string> = {
  start: '시작 프레임 (이 컷 = 시작, 끝 프레임 생성 필요)',
  end: '끝 프레임 (이 컷 = 끝, 시작 프레임 생성 필요)',
  middle: '중간 레퍼런스 (단독 이미지로 영상 생성)',
};

function buildOtherFrameInstruction(frameRole: string, strategyLabel: string): string {
  if (frameRole === 'start') {
    return `3. **gemini_other_frame** (시작 프레임 → 끝 프레임 생성):
   - 이 컷이 시작 상태임. 이 상태에서 연출이 끝난 후의 모습을 생성
   - 컷 유형(${strategyLabel})에 맞춰 End 상태 정의
   - **반드시**: "Keep the exact same camera angle, perspective, and lighting as the provided image."
   - 추가되거나 변화될 대상 명시
   - 영어로 작성`;
  }
  if (frameRole === 'middle') {
    return `3. **gemini_other_frame** (중간 레퍼런스 모드 — 빈 문자열 반환):
   - frame_role이 'middle'이므로 다른 프레임 생성 불필요
   - 빈 문자열 "" 반환`;
  }
  // default: 'end'
  return `3. **gemini_other_frame** (끝 프레임 → 시작 프레임 생성):
   - 이 컷이 끝 상태임. 이 상태가 되기 전의 시작 모습을 생성
   - 컷 유형(${strategyLabel})에 맞춰 Start 상태 정의
   - **반드시**: "Keep the exact same camera angle, perspective, and lighting as the provided image."
   - 제거할 대상과 빈 공간을 채울 내용 명시
   - 영어로 작성`;
}

/**
 * POST: 컷 기획 텍스트 → 5종 프롬프트 자동 생성
 * { cutId, cutSynopsis, frameRole, frameStrategy, useColorize, characterSettings? }
 */
export async function POST(request: NextRequest) {
  try {
    if (!GEMINI_API_KEY) {
      return NextResponse.json({ error: 'GEMINI_API_KEY 필요' }, { status: 500 });
    }

    const { cutId, cutSynopsis, frameRole = 'end', frameStrategy, useColorize = true, characterSettings } = await request.json();

    if (!cutId || !cutSynopsis) {
      return NextResponse.json({ error: 'cutId, cutSynopsis 필요' }, { status: 400 });
    }

    // 컷 이미지 가져오기
    const { data: cut, error: cutError } = await supabase
      .from('webtoonanimation_cuts')
      .select('file_path, file_name')
      .eq('id', cutId)
      .single();

    if (cutError || !cut) {
      return NextResponse.json({ error: '컷을 찾을 수 없습니다' }, { status: 404 });
    }

    // 이미지 다운로드 → base64
    const imgRes = await fetch(cut.file_path);
    if (!imgRes.ok) throw new Error('이미지 다운로드 실패');
    const imgBuf = Buffer.from(await imgRes.arrayBuffer());
    const imageBase64 = imgBuf.toString('base64');
    const mimeType = imgRes.headers.get('content-type') || 'image/png';

    const characterText = characterSettings
      ? Object.entries(characterSettings as Record<string, string>)
          .map(([name, desc]) => `- ${name}: ${desc}`)
          .join('\n')
      : '(캐릭터 설정 없음)';

    const strategyLabel = FRAME_STRATEGY_LABELS[frameStrategy] || frameStrategy || '일반';
    const roleLabel = FRAME_ROLE_LABELS[frameRole] || frameRole;
    const otherFrameInstruction = buildOtherFrameInstruction(frameRole, strategyLabel);

    const colorizeInstruction = useColorize
      ? `1. **gemini_colorize** (라인아트 → 컬러 이미지):
   - 캐릭터별 정확한 색상 명시 (머리색, 의상, 피부톤)
   - 배경 조명과 분위기
   - 화풍: "Korean webtoon style, flat color, cel shading"
   - 영어로 작성`
      : `1. **gemini_colorize** (컬러화 불필요 — 빈 문자열 반환):
   - use_colorize가 false이므로 빈 문자열 "" 반환`;

    const systemPrompt = `당신은 한국 웹툰 애니메이션 제작 전문가입니다.
아래 컷 이미지와 기획 정보를 바탕으로 AI 이미지/영상 생성 프롬프트를 작성해주세요.

[컷 기획]: ${cutSynopsis}
[이 컷의 역할]: ${roleLabel}
[컷 유형 힌트]: ${strategyLabel}
[컬러화 필요]: ${useColorize ? '예' : '아니오 (이미 컬러)'}
[캐릭터 설정]:
${characterText}

---

아래 JSON 형식으로 반환하세요:

{
  "gemini_colorize": "...",
  "gemini_colorize_ko": "...",
  "gemini_expand": "...",
  "gemini_expand_ko": "...",
  "gemini_other_frame": "...",
  "gemini_other_frame_ko": "...",
  "video_prompt": "...",
  "video_prompt_ko": "..."
}

---

각 프롬프트 작성 지침:

${colorizeInstruction}

2. **gemini_expand** (앵커 프레임 — 16:9 와이드로 확장):
   - 이 컷이 앵커 프레임(${frameRole === 'start' ? '시작' : frameRole === 'end' ? '끝' : '레퍼런스'})이 됨
   - 확장 방향 (좌/우/양측)
   - 추가될 배경 요소 (사물함, 벽, 창문, 바닥 등)
   - 캐릭터 최종 위치 (중앙/중앙-좌/중앙-우)
   - "Extend to 1376x768 widescreen. Keep same lighting and perspective."
   - "Do not add new characters."
   - 영어로 작성

${otherFrameInstruction}

4. **video_prompt** (Wan 2.2 영상 생성 — 영어):
   - "Anime style, Korean webtoon aesthetic" 으로 시작
   - 구체적인 모션 서술 (인물 동작, 카메라 움직임)
   - 감정/분위기 (quiet, tense, lonely 등)
   - 카메라: static / slow push-in / camera shake 등
   - 반드시 영어로 작성, 2~4문장

각 영어 프롬프트(gemini_colorize, gemini_expand, gemini_other_frame)에는 반드시 한국어 설명 쌍을 작성:
- **gemini_colorize_ko**: gemini_colorize의 한국어 설명 (빈 문자열이면 빈 문자열)
- **gemini_expand_ko**: gemini_expand의 한국어 설명
- **gemini_other_frame_ko**: gemini_other_frame의 한국어 설명 (빈 문자열이면 빈 문자열)

5. **video_prompt_ko** (영상 프롬프트 한국어 설명):
   - video_prompt와 동일한 내용을 한국어로 설명
   - 한국어로 작성

JSON 외 다른 텍스트 없이 오직 JSON만 반환하세요.`;

    const ai = new GoogleGenAI({ apiKey: GEMINI_API_KEY });
    const response = await ai.models.generateContent({
      model: 'gemini-2.5-flash',
      config: { temperature: 0.7 },
      contents: [{
        role: 'user' as const,
        parts: [
          { text: systemPrompt },
          { inlineData: { mimeType: mimeType as 'image/png', data: imageBase64 } },
        ],
      }],
    });

    const raw = response.text?.trim() || '';
    const jsonMatch = raw.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      return NextResponse.json({ error: 'Gemini 응답 파싱 실패', raw }, { status: 500 });
    }

    const prompts = JSON.parse(jsonMatch[0]);

    // DB 저장
    const { error: updateError } = await supabase
      .from('webtoonanimation_cuts')
      .update({
        cut_synopsis: cutSynopsis,
        frame_role: frameRole,
        frame_strategy: frameStrategy || null,
        use_colorize: useColorize,
        gemini_colorize_prompt: prompts.gemini_colorize || null,
        gemini_colorize_prompt_ko: prompts.gemini_colorize_ko || null,
        gemini_expand_prompt: prompts.gemini_expand,
        gemini_expand_prompt_ko: prompts.gemini_expand_ko || null,
        gemini_start_frame_prompt: prompts.gemini_other_frame || null,
        gemini_other_frame_prompt_ko: prompts.gemini_other_frame_ko || null,
        video_prompt: prompts.video_prompt,
        video_prompt_ko: prompts.video_prompt_ko || null,
      })
      .eq('id', cutId);

    if (updateError) throw updateError;

    return NextResponse.json({ prompts });
  } catch (error) {
    console.error('[generate-cut-prompts] 실패:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : '프롬프트 생성 실패' },
      { status: 500 }
    );
  }
}

/**
 * PATCH: 개별 필드 수동 저장
 * { cutId, field, value }
 */
export async function PATCH(request: NextRequest) {
  try {
    const { cutId, field, value } = await request.json();

    const allowed = [
      'cut_synopsis', 'frame_role', 'frame_strategy', 'use_colorize', 'aspect_ratio',
      'gemini_colorize_prompt', 'gemini_colorize_prompt_ko',
      'gemini_expand_prompt', 'gemini_expand_prompt_ko',
      'gemini_start_frame_prompt', 'gemini_other_frame_prompt_ko',
      'video_prompt', 'video_prompt_ko',
    ];
    if (!cutId || !field || !allowed.includes(field)) {
      return NextResponse.json({ error: '잘못된 요청' }, { status: 400 });
    }

    const { error } = await supabase
      .from('webtoonanimation_cuts')
      .update({ [field]: value })
      .eq('id', cutId);

    if (error) throw error;
    return NextResponse.json({ ok: true });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : '저장 실패' },
      { status: 500 }
    );
  }
}
