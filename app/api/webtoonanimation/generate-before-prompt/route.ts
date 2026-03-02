import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { GoogleGenAI } from '@google/genai';
import sharp from 'sharp';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

const GEMINI_API_KEY = process.env.GEMINI_API_KEY;

const SYSTEM_PROMPTS = {
  from_self: `당신은 웹툰/만화 장면 분석 전문가입니다.

첨부된 웹툰 컷 이미지를 분석하여, 이 장면의 **0.5초 전** 모습을 그리기 위한 이미지 생성 프롬프트를 한국어로 작성해주세요.

분석 순서:
1. 이미지 속 상황 파악 (누가 무엇을 하고 있는지, 액션의 결과인지 등)
2. 카메라 앵글/구도 파악 (버드아이뷰, 정면, 로우앵글 등)
3. 0.5초 전에는 어떤 포즈/동작이었을지 추론
4. 원하는 카메라 앵글 결정 (정면에서 보면 자연스러운 영상이 됨)

프롬프트 작성 규칙:
- 첨부 이미지가 어떤 장면인지 먼저 설명 (예: "첨부 이미지는 ~한 장면입니다")
- 그 다음 원하는 출력을 구체적으로 기술 (예: "이 장면의 0.5초 전을 정면에서 본 모습으로 그려주세요")
- 캐릭터의 구체적 포즈와 위치를 상세히 기술
- 같은 화풍, 선화, 채색을 유지하라고 명시
- 텍스트, 말풍선, 효과음 없이
- 프롬프트만 출력 (설명이나 JSON 없이)`,

  from_prev: `당신은 웹툰/만화 장면 분석 전문가입니다.

첨부된 이미지가 2장입니다:
- 첫 번째: 직전 컷 (이전 장면)
- 두 번째: 현재 컷 (목표 장면)

직전 컷의 장면을 현재 컷의 카메라 앵글/구도로 변환하는 이미지 생성 프롬프트를 한국어로 작성해주세요.

분석 순서:
1. 직전 컷의 상황 파악 (캐릭터 포즈, 동작, 위치)
2. 현재 컷의 카메라 앵글/구도 파악
3. 직전 컷의 장면을 현재 컷 앵글로 변환하면 어떻게 보일지 추론

프롬프트 작성 규칙:
- 첨부 이미지들이 어떤 장면인지 먼저 설명
- 첫 번째 이미지의 장면을 두 번째 이미지의 앵글로 다시 그려달라고 요청
- 캐릭터의 구체적 포즈와 위치를 상세히 기술
- 같은 화풍, 선화, 채색을 유지하라고 명시
- 텍스트, 말풍선, 효과음 없이
- 프롬프트만 출력 (설명이나 JSON 없이)`,
};

export async function POST(request: NextRequest) {
  try {
    if (!GEMINI_API_KEY) {
      return NextResponse.json({ error: 'GEMINI_API_KEY 필요' }, { status: 500 });
    }

    const { projectId, imageCutIndices, mode } = await request.json();

    if (!projectId || !imageCutIndices?.length) {
      return NextResponse.json({ error: 'projectId, imageCutIndices 필요' }, { status: 400 });
    }

    // 1. 컷 이미지 다운로드 + 리사이즈
    const { data: fetchedCuts, error: cutError } = await supabase
      .from('webtoonanimation_cuts')
      .select('order_index, file_path')
      .eq('project_id', projectId)
      .in('order_index', imageCutIndices)
      .order('order_index');

    if (cutError || !fetchedCuts?.length) {
      return NextResponse.json({ error: '컷을 찾을 수 없습니다' }, { status: 404 });
    }

    // imageCutIndices 순서 유지
    const orderedCuts = imageCutIndices
      .map((idx: number) => fetchedCuts.find(c => c.order_index === idx))
      .filter(Boolean) as typeof fetchedCuts;

    const imageParts: { inlineData: { mimeType: string; data: string } }[] = [];
    for (const c of orderedCuts) {
      const imgRes = await fetch(c.file_path);
      if (!imgRes.ok) throw new Error(`컷 ${c.order_index} 이미지 다운로드 실패`);
      const imgBuffer = Buffer.from(await imgRes.arrayBuffer());
      const resized = await sharp(imgBuffer)
        .resize(800, undefined, { fit: 'inside' })
        .png()
        .toBuffer();
      imageParts.push({ inlineData: { mimeType: 'image/png', data: resized.toString('base64') } });
    }

    // 2. Gemini 텍스트로 장면 분석 + 프롬프트 생성
    const selectedMode = mode === 'from_prev' ? 'from_prev' : 'from_self';
    const systemPrompt = SYSTEM_PROMPTS[selectedMode];

    const ai = new GoogleGenAI({ apiKey: GEMINI_API_KEY });
    const response = await ai.models.generateContent({
      model: 'gemini-3.1-pro-preview',
      config: { temperature: 0.7 },
      contents: [{
        role: 'user' as const,
        parts: [
          ...imageParts,
          { text: systemPrompt },
        ],
      }],
    });

    const prompt = response.text?.trim();
    if (!prompt) {
      return NextResponse.json({ error: 'Gemini 응답이 비어 있습니다' }, { status: 500 });
    }

    console.log(`[generate-before-prompt] 완료 (mode: ${selectedMode}, cuts: [${imageCutIndices.join(',')}])`);
    return NextResponse.json({ prompt });
  } catch (error) {
    console.error('[generate-before-prompt] 실패:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : '프롬프트 생성 실패' },
      { status: 500 }
    );
  }
}
