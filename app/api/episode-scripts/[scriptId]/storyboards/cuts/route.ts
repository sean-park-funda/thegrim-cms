import { NextRequest, NextResponse } from 'next/server';
import { GoogleGenAI } from '@google/genai';
import { supabase } from '@/lib/supabase';

const GEMINI_API_KEY = process.env.GEMINI_API_KEY;
const GEMINI_API_TIMEOUT = 60000;

interface Cut {
  cutNumber: number;
  title: string;
  background?: string;
  description: string;
  dialogue?: string;
  charactersInCut?: string[];
}

export async function PATCH(
  request: NextRequest,
  context: { params: Promise<{ scriptId: string }> }
) {
  const startTime = Date.now();
  console.log('[컷 수정] 요청 시작');

  try {
    const { scriptId } = await context.params;
    if (!scriptId) {
      return NextResponse.json({ error: 'scriptId가 필요합니다.' }, { status: 400 });
    }

    if (!GEMINI_API_KEY) {
      return NextResponse.json({ error: 'GEMINI_API_KEY가 설정되지 않았습니다.' }, { status: 500 });
    }

    const body = await request.json().catch(() => null) as {
      storyboardId: string;
      cutIndex: number;
      modificationPrompt: string;
    } | null;

    if (!body || !body.storyboardId || body.cutIndex === undefined || !body.modificationPrompt) {
      return NextResponse.json(
        { error: 'storyboardId, cutIndex, modificationPrompt가 필요합니다.' },
        { status: 400 }
      );
    }

    const { storyboardId, cutIndex, modificationPrompt } = body;

    // 스크립트 조회
    const { data: script, error: scriptError } = await supabase
      .from('episode_scripts')
      .select('content, title')
      .eq('id', scriptId)
      .single();

    if (scriptError || !script) {
      console.error('[컷 수정] 스크립트 조회 실패:', scriptError);
      return NextResponse.json({ error: '스크립트를 찾을 수 없습니다.' }, { status: 404 });
    }

    // 스토리보드 조회
    const { data: storyboard, error: storyboardError } = await supabase
      .from('episode_script_storyboards')
      .select('response_json')
      .eq('id', storyboardId)
      .single();

    if (storyboardError || !storyboard) {
      console.error('[컷 수정] 스토리보드 조회 실패:', storyboardError);
      return NextResponse.json({ error: '스토리보드를 찾을 수 없습니다.' }, { status: 404 });
    }

    const responseJson = storyboard.response_json as { cuts?: Cut[] };
    const cuts = responseJson?.cuts || [];

    if (cutIndex < 0 || cutIndex >= cuts.length) {
      return NextResponse.json({ error: '유효하지 않은 컷 인덱스입니다.' }, { status: 400 });
    }

    const currentCut = cuts[cutIndex];

    // Gemini에 수정 요청
    const basePrompt = `당신은 웹툰 제작회사의 프로 작가입니다. 전체 대본과 현재 컷 내용을 받아서, 사용자의 수정 지시에 따라 해당 컷을 수정합니다.

**중요: 응답은 반드시 순수 JSON으로만 반환하세요. 마크다운/코드블록/설명 텍스트는 포함하지 마세요.**

각 컷의 필드 설명:
- **cutNumber (컷 번호, 필수)**: 컷 번호를 유지해야 합니다.
- **title (컷 제목)**: 컷의 제목
- **background (배경 설명, 필수)**: 각 컷마다 배경의 구체적인 설명을 포함해야 합니다. 배경의 장소, 시간대, 분위기, 주요 요소(건물, 가구, 자연물 등)를 상세히 설명하세요.
- **description (연출/구도 설명)**: 다음을 포함하세요:
  - 등장인물의 위치와 자세
  - 카메라의 구도와 시점 (클로즈업, 미디엄샷, 와이드샷, 버드아이뷰 등)
  - 웹툰 형식의 스타일리시한 연출 (모션 블러, 빛의 잔상, 명암 효과 등)
  - 장면의 분위기와 톤
  - 화면 연출에 필요한 이미지 비율 - **중요: 웹툰은 스마트폰을 세로로 보기 때문에 컷들은 주로 세로로 길어야 합니다. 세로형 비율을 우선적으로 사용하세요 (예: 9:16, 3:4, 2:3 등).**
- **dialogue (대사/내레이션)**: 대사 또는 내레이션이 있는 경우
- **charactersInCut (이 컷에 등장하는 모든 인물의 이름 배열, 필수)**: 대사가 없더라도 이 컷에 등장하는 모든 캐릭터의 이름을 배열로 반환하세요.

응답 형식:
{
  "cutNumber": 1,
  "title": "컷 제목",
  "background": "배경의 장소, 시간대, 분위기, 주요 요소(건물, 가구, 자연물 등)를 상세히 설명",
  "description": "등장인물 위치/자세, 카메라 구도·시점, 웹툰 형식 연출, 분위기, 이미지 비율(세로형 우선: 9:16, 3:4 등) 등을 상세히 설명",
  "dialogue": "대사 또는 내레이션 (있는 경우)",
  "charactersInCut": ["이 컷에 등장하는 모든 캐릭터 이름들 (대사가 없는 캐릭터도 포함)"]
}`;

    const prompt = `${basePrompt}

---

**전체 대본:**
제목: ${script.title || '씬'}
대본:
${script.content}

---

**현재 컷 내용 (컷 번호 ${currentCut.cutNumber}):**
제목: ${currentCut.title || '(제목 없음)'}
배경: ${currentCut.background || '(배경 없음)'}
연출/구도: ${currentCut.description || '(연출 없음)'}
대사/내레이션: ${currentCut.dialogue || '(대사 없음)'}
등장인물: ${Array.isArray(currentCut.charactersInCut) ? currentCut.charactersInCut.join(', ') : '(등장인물 없음)'}

---

**사용자 수정 지시:**
${modificationPrompt}

---

위 수정 지시에 따라 현재 컷을 수정하여 반환해주세요. 컷 번호는 ${currentCut.cutNumber}로 유지해야 합니다.`;

    const ai = new GoogleGenAI({ apiKey: GEMINI_API_KEY });
    const model = 'gemini-3-pro-preview';

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

    // 타임아웃과 재시도
    const maxRetries = 3;
    let lastError: unknown = null;
    let response: Awaited<ReturnType<typeof ai.models.generateContentStream>> | null = null;

    for (let attempt = 0; attempt <= maxRetries; attempt++) {
      try {
        if (attempt > 0) {
          const delay = Math.min(1000 * Math.pow(2, attempt - 1), 10000);
          console.log(`[컷 수정] Gemini API 재시도 ${attempt}/${maxRetries} (${delay}ms 대기 후)...`);
          await new Promise(resolve => setTimeout(resolve, delay));
        }

        const timeoutPromise = new Promise<never>((_, reject) => {
          setTimeout(() => reject(new Error(`Gemini API 타임아웃: ${GEMINI_API_TIMEOUT}ms 초과`)), GEMINI_API_TIMEOUT);
        });

        const apiPromise = ai.models.generateContentStream({ model, config, contents });

        response = await Promise.race([apiPromise, timeoutPromise]);
        break;
      } catch (error: unknown) {
        lastError = error;
        if (attempt >= maxRetries) {
          console.error('[컷 수정] Gemini 호출 실패:', error);
          return NextResponse.json({ error: '컷 수정에 실패했습니다.' }, { status: 500 });
        }
      }
    }

    if (!response) {
      console.error('[컷 수정] Gemini 응답 없음:', lastError);
      return NextResponse.json({ error: '컷 수정에 실패했습니다.' }, { status: 500 });
    }

    let responseText = '';
    for await (const chunk of response) {
      const parts = chunk.candidates?.[0]?.content?.parts;
      if (!parts) continue;
      for (const part of parts) {
        if (part.text) responseText += part.text;
      }
    }

    // JSON 파싱
    let modifiedCut: Cut;
    try {
      let cleaned = responseText.trim();
      if (cleaned.includes('```')) {
        const start = cleaned.indexOf('```');
        const end = cleaned.lastIndexOf('```');
        if (start !== -1 && end !== -1 && end > start) {
          cleaned = cleaned.substring(start, end + 3).replace(/```json:?json?/gi, '').replace(/```/g, '').trim();
        }
      }
      const jsonStart = cleaned.indexOf('{');
      const jsonEnd = cleaned.lastIndexOf('}');
      if (jsonStart !== -1 && jsonEnd !== -1 && jsonEnd > jsonStart) {
        cleaned = cleaned.substring(jsonStart, jsonEnd + 1);
      }
      modifiedCut = JSON.parse(cleaned);
    } catch (error) {
      console.error('[컷 수정] JSON 파싱 실패:', error, responseText);
      return NextResponse.json({ error: 'Gemini 응답 파싱에 실패했습니다.' }, { status: 500 });
    }

    // 컷 번호 검증 및 유지
    if (modifiedCut.cutNumber !== currentCut.cutNumber) {
      console.warn('[컷 수정] 컷 번호가 변경됨, 원래 번호로 복원:', {
        original: currentCut.cutNumber,
        modified: modifiedCut.cutNumber,
      });
      modifiedCut.cutNumber = currentCut.cutNumber;
    }

    // 스토리보드의 해당 컷 업데이트
    const updatedCuts = [...cuts];
    updatedCuts[cutIndex] = modifiedCut;

    const updatedResponseJson = {
      ...responseJson,
      cuts: updatedCuts,
    };

    const { data: updatedStoryboard, error: updateError } = await supabase
      .from('episode_script_storyboards')
      .update({ response_json: updatedResponseJson })
      .eq('id', storyboardId)
      .select('*')
      .single();

    if (updateError) {
      console.error('[컷 수정] 스토리보드 업데이트 실패:', updateError);
      return NextResponse.json({ error: '컷 수정 저장에 실패했습니다.' }, { status: 500 });
    }

    const totalTime = Date.now() - startTime;
    console.log('[컷 수정] 요청 완료:', {
      cutIndex,
      totalTime: `${totalTime}ms`,
    });

    return NextResponse.json({ cut: modifiedCut, storyboard: updatedStoryboard });
  } catch (error) {
    const totalTime = Date.now() - startTime;
    console.error('[컷 수정] 오류 발생:', error);
    const errorMessage = error instanceof Error ? error.message : '알 수 없는 오류가 발생했습니다.';
    return NextResponse.json({ error: errorMessage }, { status: 500 });
  }
}



