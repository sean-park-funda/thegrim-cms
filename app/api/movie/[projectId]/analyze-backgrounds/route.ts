import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { GoogleGenAI } from '@google/genai';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseServiceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const GEMINI_API_KEY = process.env.GEMINI_API_KEY!;

const supabase = createClient(supabaseUrl, supabaseServiceRoleKey);

interface ExtractedBackground {
  name: string;
  imagePrompt: string;
}

interface LLMResponse {
  backgrounds: ExtractedBackground[];
}

// LLM으로 대본에서 배경(씬) 추출
async function extractBackgroundsFromScript(script: string, model: string = 'gemini-3-flash-preview'): Promise<ExtractedBackground[]> {
  const genAI = new GoogleGenAI({ apiKey: GEMINI_API_KEY });

  const systemPrompt = `당신은 영화 대본 분석 전문가입니다. 주어진 대본에서 등장하는 장소(씬)들을 추출하고, 각 장소의 배경 이미지 생성 프롬프트를 작성해주세요.

다음 규칙을 따라주세요:
1. 대본에서 언급되거나 암시되는 모든 주요 장소를 추출합니다.
2. 동일한 장소는 한 번만 추출합니다 (예: "집 거실"이 여러 번 나와도 하나만).
3. 각 장소에 대해 배경 이미지 생성용 상세 프롬프트를 한글로 작성합니다.
4. 대본에서 특별히 다른 국가나 지역을 명시하지 않은 경우, 배경은 한국으로 설정합니다.
   - 한국식 인테리어, 한국 간판, 한국 건축 스타일을 자연스럽게 반영하세요.

[중요] 배경 프롬프트 작성 규칙:
- 순수 배경만 묘사: 캐릭터, 인물, 사람은 절대 포함하지 마세요. 빈 공간으로 그려야 합니다.
- 자연스러운 조명: "드라마틱한 조명", "영화적 조명" 같은 과장된 표현 대신 자연광이나 실제 공간의 조명을 묘사하세요.
- 사실적 묘사: 실제로 존재할 법한 공간처럼 객관적으로 묘사하세요.
- 공간의 특징: 가구, 소품, 창문, 벽 색상 등 공간 자체의 특징을 구체적으로 묘사하세요.

반드시 다음 JSON 형식으로만 응답하세요:
{
  "backgrounds": [
    {
      "name": "장소 이름",
      "imagePrompt": "한국식 고급 호텔 웨딩홀. 크리스탈 샹들리에가 천장에 매달려 있고, 하얀 대리석 바닥에 붉은 카펫이 깔려 있다. 양쪽에 하객들을 위한 의자가 배치되어 있고, 정면에 화려한 꽃장식이 있는 단상이 보인다. 창문으로 들어오는 자연광과 샹들리에 조명."
    }
  ]
}`;

  const userPrompt = `다음 대본에서 등장하는 장소(씬)들을 추출하고 각 장소의 배경 이미지 생성 프롬프트를 작성해주세요:

===대본===
${script}
===대본 끝===`;

  try {
    const response = await genAI.models.generateContent({
      model,
      contents: [
        {
          role: 'user',
          parts: [{ text: systemPrompt + '\n\n' + userPrompt }],
        },
      ],
      config: {
        temperature: 0.7,
        topP: 0.9,
        maxOutputTokens: 4096,
      },
    });

    const text = response.text || '';
    console.log('[analyze-backgrounds] LLM 응답:', text.substring(0, 500));

    // JSON 파싱
    const jsonMatch = text.match(/\{[\s\S]*"backgrounds"[\s\S]*\}/);
    if (!jsonMatch) {
      throw new Error('LLM 응답에서 JSON을 찾을 수 없습니다.');
    }

    const parsed: LLMResponse = JSON.parse(jsonMatch[0]);

    if (!parsed.backgrounds || !Array.isArray(parsed.backgrounds)) {
      throw new Error('유효한 배경 배열이 없습니다.');
    }

    return parsed.backgrounds;
  } catch (error) {
    console.error('[analyze-backgrounds] LLM 배경 추출 실패:', error);
    throw error;
  }
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ projectId: string }> }
) {
  const startTime = Date.now();
  const { projectId } = await params;

  console.log('[analyze-backgrounds] 요청 시작:', { projectId });

  try {
    const body = await request.json();
    const { model = 'gemini-3-flash-preview', style = 'realistic' } = body;

    // 구조화된 프롬프트 생성 함수 (스타일 + 장면 구분)
    const createStructuredPrompt = (sceneDescription: string) => {
      const styleSection = style === 'cartoon'
        ? `[STYLE]\n한국 웹툰 스타일 배경. 정교하고 아름답게 렌더링된 환경 일러스트레이션. 시각적 완성도와 분위기를 강조하는 인기 한국 웹툰의 배경처럼.`
        : `[STYLE]\n초사실적 사진 스타일 배경. 전문 카메라로 촬영한 실제 사진처럼 보여야 함. 자연광과 사실적인 그림자. 일러스트나 만화 요소 절대 금지. 할리우드 영화나 고급 사진의 로케이션 촬영처럼.`;

      return `${styleSection}\n\n[SCENE]\n${sceneDescription}\n\n[REQUIREMENTS]\n- 인물/캐릭터 없음 (빈 공간)\n- 와이드 앵글 배경 샷`;
    };

    // 1. 프로젝트 정보 가져오기
    const { data: project, error: projectError } = await supabase
      .from('movie_projects')
      .select('script')
      .eq('id', projectId)
      .single();

    if (projectError || !project) {
      console.error('[analyze-backgrounds] 프로젝트 조회 실패:', projectError);
      return NextResponse.json(
        { error: '프로젝트를 찾을 수 없습니다.' },
        { status: 404 }
      );
    }

    if (!project.script || project.script.trim().length === 0) {
      return NextResponse.json(
        { error: '대본이 없습니다. 먼저 대본을 입력해주세요.' },
        { status: 400 }
      );
    }

    // 2. LLM으로 배경 추출
    console.log('[analyze-backgrounds] LLM 배경 추출 시작...');
    const extractedBackgrounds = await extractBackgroundsFromScript(project.script, model);
    console.log('[analyze-backgrounds] 추출된 배경:', extractedBackgrounds.length);

    if (extractedBackgrounds.length === 0) {
      return NextResponse.json(
        { error: '대본에서 배경을 찾을 수 없습니다.' },
        { status: 400 }
      );
    }

    // 3. 기존 배경 삭제
    await supabase
      .from('movie_backgrounds')
      .delete()
      .eq('project_id', projectId);

    // 4. 새 배경 저장 (구조화된 완전본으로 저장)
    const backgroundsToSave = extractedBackgrounds.map((bg, index) => ({
      project_id: projectId,
      name: bg.name,
      image_prompt: createStructuredPrompt(bg.imagePrompt),  // 구조화된 완전본
      order_index: index,
    }));

    const { data: savedBackgrounds, error: saveError } = await supabase
      .from('movie_backgrounds')
      .insert(backgroundsToSave)
      .select();

    if (saveError) {
      console.error('[analyze-backgrounds] 배경 저장 실패:', saveError);
      return NextResponse.json(
        { error: '배경 저장에 실패했습니다.' },
        { status: 500 }
      );
    }

    // 5. 프로젝트 상태 업데이트
    await supabase
      .from('movie_projects')
      .update({ updated_at: new Date().toISOString() })
      .eq('id', projectId);

    const totalTime = Date.now() - startTime;
    console.log('[analyze-backgrounds] 완료:', {
      totalTime: `${totalTime}ms`,
      backgroundsCount: savedBackgrounds?.length || 0,
    });

    return NextResponse.json({
      backgrounds: savedBackgrounds,
      count: savedBackgrounds?.length || 0,
    });
  } catch (error) {
    console.error('[analyze-backgrounds] 오류:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : '배경 분석에 실패했습니다.' },
      { status: 500 }
    );
  }
}
