import { NextRequest, NextResponse } from 'next/server';
import { GoogleGenAI } from '@google/genai';
import { supabase } from '@/lib/supabase';

const GEMINI_API_KEY = process.env.GEMINI_API_KEY;
const GEMINI_API_TIMEOUT = 60000;

export async function GET(
  _request: NextRequest,
  context: { params: Promise<{ scriptId: string }> }
) {
  const { scriptId } = await context.params;
  if (!scriptId) {
    return NextResponse.json({ error: 'scriptId가 필요합니다.' }, { status: 400 });
  }

  const { data, error } = await supabase
    .from('episode_script_storyboards')
    .select('*, images:episode_script_storyboard_images(*)')
    .eq('script_id', scriptId)
    .order('created_at', { ascending: false });

  if (error) {
    console.error('[storyboards][GET] 조회 실패:', error);
    return NextResponse.json({ error: '글콘티 조회에 실패했습니다.' }, { status: 500 });
  }

  return NextResponse.json(data ?? []);
}

export async function POST(
  request: NextRequest,
  context: { params: Promise<{ scriptId?: string }> }
) {
  const body = await request.json().catch(() => null) as { model?: string; createdBy?: string; scriptId?: string; deleteExisting?: boolean } | null;
  const { scriptId: paramScriptId } = await context.params;
  const scriptId = paramScriptId || body?.scriptId;

  if (!scriptId) {
    console.error('[storyboards][POST] scriptId 누락', { paramScriptId, body });
    return NextResponse.json({ error: 'scriptId가 필요합니다.' }, { status: 400 });
  }

  if (!GEMINI_API_KEY) {
    return NextResponse.json({ error: 'GEMINI_API_KEY가 설정되지 않았습니다.' }, { status: 500 });
  }

  const model = body?.model || 'gemini-3-pro-preview';
  const createdBy = body?.createdBy;
  const deleteExisting = body?.deleteExisting ?? false;

  // 기존 스토리보드와 이미지 삭제
  if (deleteExisting) {
    console.log('[storyboards][POST] 기존 스토리보드 및 이미지 삭제 시작', { scriptId });
    
    // 기존 스토리보드 조회
    const { data: existingStoryboards, error: fetchError } = await supabase
      .from('episode_script_storyboards')
      .select('id')
      .eq('script_id', scriptId);

    if (fetchError) {
      console.error('[storyboards][POST] 기존 스토리보드 조회 실패:', fetchError);
    } else if (existingStoryboards && existingStoryboards.length > 0) {
      const storyboardIds = existingStoryboards.map(s => s.id);
      
      // 이미지 삭제 (CASCADE로 자동 삭제되지만 명시적으로 삭제)
      const { error: imageDeleteError } = await supabase
        .from('episode_script_storyboard_images')
        .delete()
        .in('storyboard_id', storyboardIds);

      if (imageDeleteError) {
        console.error('[storyboards][POST] 이미지 삭제 실패:', imageDeleteError);
      } else {
        console.log('[storyboards][POST] 이미지 삭제 완료', { count: storyboardIds.length });
      }

      // 스토리보드 삭제
      const { error: storyboardDeleteError } = await supabase
        .from('episode_script_storyboards')
        .delete()
        .eq('script_id', scriptId);

      if (storyboardDeleteError) {
        console.error('[storyboards][POST] 스토리보드 삭제 실패:', storyboardDeleteError);
      } else {
        console.log('[storyboards][POST] 스토리보드 삭제 완료', { count: existingStoryboards.length });
      }
    }
  }

  // 스크립트 조회
  const { data: script, error: scriptError } = await supabase
    .from('episode_scripts')
    .select('content, title')
    .eq('id', scriptId)
    .single();

  if (scriptError || !script) {
    console.error('[storyboards][POST] 스크립트 조회 실패:', scriptError);
    return NextResponse.json({ error: '스크립트를 찾을 수 없습니다.' }, { status: 404 });
  }

  const basePrompt = `당신은 웹툰 제작회사의 프로 작가입니다. 대본을 적절한 컷으로 나누고, 각 컷별로 그림 콘티를 그리기 위한 상세한 글콘티(JSON)를 만듭니다.

**중요: 응답은 반드시 순수 JSON으로만 반환하세요. 마크다운/코드블록/설명 텍스트는 포함하지 마세요.**

각 컷의 필드 설명:
- **background (배경 설명, 필수)**: 각 컷마다 배경의 구체적인 설명을 포함해야 합니다. 배경의 장소, 시간대, 분위기, 주요 요소(건물, 가구, 자연물 등)를 상세히 설명하세요. 이는 이미지 생성 시 일관성을 유지하기 위해 필수입니다.
- **description (연출/구도 설명)**: 다음을 포함하세요:
  - 등장인물의 위치와 자세
  - 카메라의 구도와 시점 (클로즈업, 미디엄샷, 와이드샷, 버드아이뷰 등)
  - 웹툰 형식의 스타일리시한 연출 (모션 블러, 빛의 잔상, 명암 효과 등) - 판화나 만화책 형식이 아닌 웹툰 스크롤 형식에 맞는 구도
  - 장면의 분위기와 톤
  - 화면 연출에 필요한 이미지 비율 - **중요: 웹툰은 스마트폰을 세로로 보기 때문에 컷들은 주로 세로로 길어야 합니다. 세로형 비율을 우선적으로 사용하세요 (예: 9:16, 3:4, 2:3 등). 가로형 비율(16:9, 21:9 등)은 특별한 연출이 필요한 경우에만 사용하세요.**
  - **charactersInCut (이 컷에 등장하는 모든 인물의 이름 배열, 필수)**: 대사가 없더라도 이 컷에 등장하는 모든 캐릭터의 이름을 배열로 반환하세요. 예: ["원도진", "신민철", "금호용"]

**웹툰 형식 구성:**
- 스크롤 형식에 최적화된 세로형 구도 (스마트폰 세로 보기에 최적화)
- 컷들은 주로 세로로 길게 구성되어 스크롤하면서 읽기 편해야 함
- 모바일과 데스크톱 모두에서 읽기 편한 레이아웃
- 판화나 전통적인 만화책 형식이 아닌 현대적인 웹툰 스타일

**등장인물 목록:**
대본에서 등장하는 모든 캐릭터의 이름과 생김새를 추출하여 characters 배열에 포함하세요.
또한, 각 컷마다 **charactersInCut**에 그 컷에 실제로 등장하는 모든 캐릭터 이름을 포함하세요. 대사가 없는 캐릭터라도 컷 안에 보이면 반드시 포함해야 합니다.

응답 형식:
{
  "cuts": [
    {
      "cutNumber": 1,
      "title": "컷 제목",
      "background": "배경의 장소, 시간대, 분위기, 주요 요소(건물, 가구, 자연물 등)를 상세히 설명",
      "description": "등장인물 위치/자세, 카메라 구도·시점, 웹툰 형식 연출, 분위기, 이미지 비율(세로형 우선: 9:16, 3:4 등) 등을 상세히 설명",
      "dialogue": "대사 또는 내레이션 (있는 경우)",
      "charactersInCut": ["이 컷에 등장하는 모든 캐릭터 이름들 (대사가 없는 캐릭터도 포함)"]
    }
  ],
  "characters": [
    {
      "name": "캐릭터 이름",
      "description": "캐릭터의 생김새, 복장, 특징 등을 상세히 묘사"
    }
  ]
}`;

  const prompt = `${basePrompt}\n\n제목: ${script.title || '씬'}\n대본:\n${script.content}`;

  const ai = new GoogleGenAI({ apiKey: GEMINI_API_KEY });

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
        console.error('[storyboards][POST] Gemini 호출 실패:', error);
        return NextResponse.json({ error: '글콘티 생성에 실패했습니다.' }, { status: 500 });
      }
    }
  }

  if (!response) {
    console.error('[storyboards][POST] Gemini 응답 없음:', lastError);
    return NextResponse.json({ error: '글콘티 생성에 실패했습니다.' }, { status: 500 });
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
  let parsed: { cuts?: Array<{ cutNumber?: number }>; characters: Array<{ name?: string; description?: string }> };
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
    parsed = JSON.parse(cleaned);
  } catch (error) {
    console.error('[storyboards][POST] JSON 파싱 실패:', error, responseText);
    return NextResponse.json({ error: 'Gemini 응답 파싱에 실패했습니다.' }, { status: 500 });
  }

  const cutsCount = Array.isArray(parsed.cuts) ? parsed.cuts.length : null;
  
  // characters 필드 초기화 (없으면 빈 배열)
  if (!parsed.characters || !Array.isArray(parsed.characters)) {
    parsed.characters = [];
  }

  // characters가 비어있으면 캐릭터 분석 결과에서 가져오기
  if (parsed.characters.length === 0) {
    // 스크립트의 캐릭터 분석 결과 조회
    const { data: scriptWithAnalysis } = await supabase
      .from('episode_scripts')
      .select('character_analysis')
      .eq('id', scriptId)
      .single();

    if (scriptWithAnalysis?.character_analysis?.characters) {
      // 캐릭터 분석 결과에서 이름과 설명만 추출
      parsed.characters = scriptWithAnalysis.character_analysis.characters.map((char: any) => ({
        name: char.name,
        description: char.description,
      }));
      console.log('[storyboards][POST] 캐릭터 분석 결과에서 characters 추가:', parsed.characters.length);
    } else {
      console.log('[storyboards][POST] 캐릭터 분석 결과 없음, 빈 배열로 유지');
    }
  }

  // 저장
  const { data, error: insertError } = await supabase
    .from('episode_script_storyboards')
    .insert({
      script_id: scriptId,
      model,
      prompt,
      response_json: parsed,
      cuts_count: cutsCount,
      created_by: createdBy ?? null,
    })
    .select('*')
    .single();

  if (insertError) {
    console.error('[storyboards][POST] 저장 실패:', insertError);
    return NextResponse.json({ error: '글콘티 저장에 실패했습니다.' }, { status: 500 });
  }

  return NextResponse.json(data, { status: 201 });
}

