import { NextRequest, NextResponse } from 'next/server';
import { GoogleGenAI } from '@google/genai';
import { supabase } from '@/lib/supabase';

const GEMINI_API_KEY = process.env.GEMINI_API_KEY;
const GEMINI_API_TIMEOUT = 60000;

interface RelatedBackground {
  cutNumber: number;
  background: string;
}

interface Response {
  background: string;
  relatedBackgrounds: RelatedBackground[];
}

export async function POST(request: NextRequest) {
  if (!GEMINI_API_KEY) {
    return NextResponse.json({ error: 'GEMINI_API_KEY가 설정되지 않았습니다.' }, { status: 500 });
  }

  const body = await request.json().catch(() => null) as {
    storyboardId?: string;
    cutIndex?: number;
    scriptContent?: string;
  } | null;

  if (!body?.storyboardId || typeof body.cutIndex !== 'number' || !body.scriptContent) {
    return NextResponse.json(
      { error: 'storyboardId, cutIndex, scriptContent가 필요합니다.' },
      { status: 400 }
    );
  }

  const { storyboardId, cutIndex, scriptContent } = body;

  try {
    // 스토리보드 조회
    const { data: storyboard, error: storyboardError } = await supabase
      .from('episode_script_storyboards')
      .select('response_json')
      .eq('id', storyboardId)
      .single();

    if (storyboardError || !storyboard) {
      console.error('[generate-cut-background-description] 스토리보드 조회 실패:', storyboardError);
      return NextResponse.json({ error: '스토리보드를 찾을 수 없습니다.' }, { status: 404 });
    }

    const responseJson = storyboard.response_json as { cuts?: Array<{
      cutNumber?: number;
      title?: string;
      background?: string;
      description?: string;
      dialogue?: string;
      charactersInCut?: string[];
      relatedBackgrounds?: Array<{ cutNumber: number; background: string }>;
    }> } | null;

    const cuts = responseJson?.cuts || [];
    const currentCut = cuts[cutIndex];

    if (!currentCut) {
      return NextResponse.json({ error: '컷을 찾을 수 없습니다.' }, { status: 404 });
    }

    // 이전 컷들의 배경 정보 수집
    const previousCuts = cuts.slice(0, cutIndex).map((cut, idx) => ({
      cutNumber: cut.cutNumber ?? idx + 1,
      title: cut.title || '',
      background: cut.background || '',
      description: cut.description || '',
    })).filter(cut => cut.background.trim().length > 0);

    // Gemini API 호출
    const ai = new GoogleGenAI({ apiKey: GEMINI_API_KEY });

    const prompt = `당신은 웹툰 제작회사의 프로 작가입니다. 전체 대본과 현재 컷 정보, 그리고 이전 컷들의 배경 정보를 바탕으로 현재 컷의 배경 설명을 생성하고, 배경의 연속성이 있는 이전 컷들을 찾아주세요.

**중요: 응답은 반드시 완전한(완성된) 순수 JSON으로만 반환하세요.**
- 마크다운 코드블록 사용 금지
- 설명 텍스트나 주석 포함 금지
- JSON 객체는 반드시 완전히 닫혀야 함

**전체 대본:**
${scriptContent}

**현재 컷 정보:**
- 컷 번호: ${currentCut.cutNumber ?? cutIndex + 1}
- 제목: ${currentCut.title || '없음'}
- 연출/구도: ${currentCut.description || '없음'}
- 대사/내레이션: ${currentCut.dialogue || '없음'}
- 등장인물: ${Array.isArray(currentCut.charactersInCut) ? currentCut.charactersInCut.join(', ') : '없음'}

**이전 컷들의 배경 정보:**
${previousCuts.length > 0
  ? previousCuts.map(cut => `- 컷 ${cut.cutNumber}: ${cut.background}`).join('\n')
  : '없음'}

**요구사항:**
1. 현재 컷의 배경을 상세히 설명하세요. 배경의 장소, 시간대, 분위기, 주요 요소(건물, 가구, 자연물 등)를 구체적으로 묘사하세요.
2. 이전 컷들 중에서 배경의 연속성이 있는 컷들을 찾아주세요. 예를 들어:
   - 같은 장소의 다른 각도나 위치
   - 같은 건물의 다른 방이나 층
   - 같은 지역의 다른 위치 (예: 란교타운 입구 → 란교타운 관리사무소 앞)
   - 시간대나 분위기가 연속되는 경우
3. 연속성이 있는 컷들은 최대 3개까지 선택하세요.

**응답 형식:**
{
  "background": "현재 컷의 상세한 배경 설명",
  "relatedBackgrounds": [
    {
      "cutNumber": 이전 컷 번호,
      "background": "해당 컷의 배경 설명"
    }
  ]
}`;

    const config = {
      responseModalities: ['TEXT'],
      temperature: 0.7,
      topP: 0.95,
      topK: 40,
      maxOutputTokens: 4096,
    };

    const contents = [
      {
        role: 'user' as const,
        parts: [{ text: prompt }],
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
          await new Promise(resolve => setTimeout(resolve, delay));
        }

        const timeoutPromise = new Promise<never>((_, reject) => {
          setTimeout(
            () => reject(new Error(`Gemini API 타임아웃: ${GEMINI_API_TIMEOUT}ms 초과`)),
            GEMINI_API_TIMEOUT
          );
        });

        const apiPromise = ai.models.generateContentStream({
          model: 'gemini-3-pro-preview',
          config,
          contents,
        });

        response = await Promise.race([apiPromise, timeoutPromise]);
        break;
      } catch (error: unknown) {
        lastError = error;
        if (attempt >= maxRetries) {
          console.error('[generate-cut-background-description] Gemini 호출 실패:', error);
          return NextResponse.json({ error: '배경설명 생성에 실패했습니다.' }, { status: 500 });
        }
      }
    }

    if (!response) {
      console.error('[generate-cut-background-description] Gemini 응답 없음:', lastError);
      return NextResponse.json({ error: '배경설명 생성에 실패했습니다.' }, { status: 500 });
    }

    // 응답 텍스트 수집
    let responseText = '';
    for await (const chunk of response) {
      const parts = chunk.candidates?.[0]?.content?.parts;
      if (!parts) continue;
      for (const part of parts) {
        if (part.text) responseText += part.text;
      }
    }

    // JSON 파싱
    let parsedResponse: Response;
    try {
      // 마크다운 코드블록 제거
      const cleanedText = responseText
        .replace(/```json\n?/g, '')
        .replace(/```\n?/g, '')
        .trim();

      parsedResponse = JSON.parse(cleanedText);
    } catch (parseError) {
      console.error('[generate-cut-background-description] JSON 파싱 실패:', parseError);
      console.error('[generate-cut-background-description] 응답 텍스트:', responseText);
      return NextResponse.json({ error: '응답 파싱에 실패했습니다.' }, { status: 500 });
    }

    // 스토리보드 response_json 업데이트
    const updatedCuts = [...cuts];
    updatedCuts[cutIndex] = {
      ...currentCut,
      background: parsedResponse.background,
      relatedBackgrounds: parsedResponse.relatedBackgrounds,
    };

    const { error: updateError } = await supabase
      .from('episode_script_storyboards')
      .update({
        response_json: {
          ...responseJson,
          cuts: updatedCuts,
        },
      })
      .eq('id', storyboardId);

    if (updateError) {
      console.error('[generate-cut-background-description] 스토리보드 업데이트 실패:', updateError);
      return NextResponse.json({ error: '배경설명 저장에 실패했습니다.' }, { status: 500 });
    }

    return NextResponse.json({
      background: parsedResponse.background,
      relatedBackgrounds: parsedResponse.relatedBackgrounds,
    });
  } catch (error) {
    console.error('[generate-cut-background-description] 예상치 못한 오류:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : '배경설명 생성에 실패했습니다.' },
      { status: 500 }
    );
  }
}
