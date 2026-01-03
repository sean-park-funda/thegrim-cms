import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { GoogleGenAI } from '@google/genai';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseServiceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const GEMINI_API_KEY = process.env.GEMINI_API_KEY!;

const supabase = createClient(supabaseUrl, supabaseServiceRoleKey);

interface ExtractedCharacter {
  name: string;
  description: string;
  imagePrompt: string;
}

interface LLMResponse {
  characters: ExtractedCharacter[];
}

// LLM으로 대본에서 캐릭터 추출
async function extractCharactersFromScript(script: string, model: string = 'gemini-3-flash-preview'): Promise<ExtractedCharacter[]> {
  const genAI = new GoogleGenAI({ apiKey: GEMINI_API_KEY });

  const systemPrompt = `당신은 대본 분석 전문가입니다. 주어진 대본에서 등장인물을 추출하고, 각 인물의 이미지 생성 프롬프트를 작성해주세요.

다음 규칙을 따라주세요:
1. 대본에 등장하는 모든 주요 인물을 추출합니다.
2. 각 인물에 대해 외형적 특징을 기반으로 이미지 생성 프롬프트를 작성합니다.
3. 이미지 프롬프트는 한글로 작성하며, 캐릭터의 외모, 의상, 표정 등을 상세히 묘사합니다.
4. 프롬프트는 상반신 초상화 스타일로 작성합니다.
5. 모든 캐릭터는 한국인으로 묘사합니다.

반드시 다음 JSON 형식으로만 응답하세요:
{
  "characters": [
    {
      "name": "캐릭터 이름",
      "description": "캐릭터 설명 (2-3문장)",
      "imagePrompt": "한국인 [나이대] [성별], [외모 특징], [의상], [표정], 상세한 얼굴"
    }
  ]
}`;

  const userPrompt = `다음 대본에서 등장인물을 추출하고 각 인물의 이미지 생성 프롬프트를 작성해주세요:

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
    console.log('[analyze-characters] LLM 응답:', text.substring(0, 500));

    // JSON 파싱
    const jsonMatch = text.match(/\{[\s\S]*"characters"[\s\S]*\}/);
    if (!jsonMatch) {
      throw new Error('LLM 응답에서 JSON을 찾을 수 없습니다.');
    }

    const parsed: LLMResponse = JSON.parse(jsonMatch[0]);

    if (!parsed.characters || !Array.isArray(parsed.characters)) {
      throw new Error('유효한 캐릭터 배열이 없습니다.');
    }

    return parsed.characters;
  } catch (error) {
    console.error('[analyze-characters] LLM 캐릭터 추출 실패:', error);
    throw error;
  }
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ projectId: string }> }
) {
  const startTime = Date.now();
  const { projectId } = await params;

  console.log('[analyze-characters] 요청 시작:', { projectId });

  try {
    const body = await request.json();
    const { model = 'gemini-3-flash-preview', style = 'realistic' } = body;

    // 구조화된 프롬프트 생성 함수 (스타일 + 캐릭터)
    const createStructuredPrompt = (characterDescription: string) => {
      const styleSection = style === 'cartoon'
        ? `[STYLE]\n한국 웹툰 스타일의 이상화된 아름다운 캐릭터 디자인. 완벽한 이목구비, 결점 없는 피부, 매력적인 비율, 시각적 완성도 강조. 외모와 시각적 매력을 강조하는 인기 한국 웹툰 캐릭터처럼.`
        : `[STYLE]\n초사실적 사진 스타일. 전문 카메라로 촬영한 실제 사진처럼 보여야 함. 실제 인간의 피부 질감, 모공, 머리카락이 보임. 자연스러운 그림자와 영화 같은 조명. 일러스트나 만화 요소 절대 금지. 할리우드 영화나 고급 사진처럼.`;

      return `${styleSection}\n\n[CHARACTER]\n${characterDescription}\n\n[REQUIREMENTS]\n- 상반신 초상화\n- 중립적인 배경\n- 정면 또는 3/4 앵글`;
    };

    // 1. 프로젝트 정보 가져오기
    const { data: project, error: projectError } = await supabase
      .from('movie_projects')
      .select('script')
      .eq('id', projectId)
      .single();

    if (projectError || !project) {
      console.error('[analyze-characters] 프로젝트 조회 실패:', projectError);
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

    // 2. LLM으로 캐릭터 추출
    console.log('[analyze-characters] LLM 캐릭터 추출 시작...');
    const extractedCharacters = await extractCharactersFromScript(project.script, model);
    console.log('[analyze-characters] 추출된 캐릭터:', extractedCharacters.length);

    if (extractedCharacters.length === 0) {
      return NextResponse.json(
        { error: '대본에서 등장인물을 찾을 수 없습니다.' },
        { status: 400 }
      );
    }

    // 3. 기존 캐릭터 삭제
    await supabase
      .from('movie_characters')
      .delete()
      .eq('project_id', projectId);

    // 4. 새 캐릭터 저장 (이미지 없이, 구조화된 프롬프트로)
    const charactersToSave = extractedCharacters.map((char) => ({
      project_id: projectId,
      name: char.name,
      description: char.description,
      image_prompt: createStructuredPrompt(char.imagePrompt), // 구조화된 완전본
    }));

    const { data: savedCharacters, error: saveError } = await supabase
      .from('movie_characters')
      .insert(charactersToSave)
      .select();

    if (saveError) {
      console.error('[analyze-characters] 캐릭터 저장 실패:', saveError);
      return NextResponse.json(
        { error: '캐릭터 저장에 실패했습니다.' },
        { status: 500 }
      );
    }

    // 5. 프로젝트 상태 업데이트
    await supabase
      .from('movie_projects')
      .update({ status: 'characters_analyzed', updated_at: new Date().toISOString() })
      .eq('id', projectId);

    const totalTime = Date.now() - startTime;
    console.log('[analyze-characters] 완료:', {
      totalTime: `${totalTime}ms`,
      charactersCount: savedCharacters?.length || 0,
    });

    return NextResponse.json({
      characters: savedCharacters,
      count: savedCharacters?.length || 0,
    });
  } catch (error) {
    console.error('[analyze-characters] 오류:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : '캐릭터 분석에 실패했습니다.' },
      { status: 500 }
    );
  }
}
