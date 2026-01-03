import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { GoogleGenAI } from '@google/genai';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseServiceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const GEMINI_API_KEY = process.env.GEMINI_API_KEY!;

const supabase = createClient(supabaseUrl, supabaseServiceRoleKey);

interface ExtractedCut {
  cutIndex: number;
  cameraShot: string;        // Shot Size: ELS, LS, FS, MLS, MS, MCU, CU, ECU, Insert
  cameraAngle: string;       // Perspective: Eye Level, High Angle, Low Angle, etc.
  cameraComposition: string; // Composition: Two Shot, Rule of Thirds, etc.
  imagePrompt: string;       // 장면 묘사 (카메라 구도 제외)
  characters: string[];
  backgroundName: string;
  dialogue: string;
  duration: number;
}

interface LLMResponse {
  cuts: ExtractedCut[];
}

interface Character {
  id: string;
  name: string;
  description?: string;
}

interface Background {
  id: string;
  name: string;
  image_prompt?: string;
}

// LLM으로 대본을 컷으로 분할
async function analyzeCutsFromScript(
  script: string,
  characters: Character[],
  backgrounds: Background[],
  model: string = 'gemini-3-flash-preview'
): Promise<ExtractedCut[]> {
  const genAI = new GoogleGenAI({ apiKey: GEMINI_API_KEY });

  // 캐릭터 목록 문자열 생성
  const characterList = characters.length > 0
    ? characters.map((c, i) => `${i + 1}. ${c.name}${c.description ? `: ${c.description}` : ''}`).join('\n')
    : '(등장인물 없음)';

  // 배경 목록 문자열 생성
  const backgroundList = backgrounds.length > 0
    ? backgrounds.map((b, i) => `${i + 1}. ${b.name}`).join('\n')
    : '(배경 없음)';

  const systemPrompt = `당신은 영화 대본을 시각적 컷으로 분할하는 전문가 영화 감독입니다.
주어진 대본을 분석하여 영화의 각 장면(컷)으로 분할해주세요.

다음 규칙을 따라주세요:
1. 대본의 흐름에 따라 시각적으로 구분되는 장면별로 컷을 분할합니다.
2. 각 컷은 하나의 이미지로 표현 가능해야 합니다.
3. 캐릭터가 등장하면 해당 캐릭터를 characters 배열에 포함합니다.
4. 배경은 제공된 배경 목록에서 가장 적합한 것을 선택합니다.
5. 대사가 있으면 dialogue에 포함합니다.
6. 각 컷의 권장 영상 길이(duration)를 초 단위로 지정합니다 (보통 3-6초).

[이미지 프롬프트 작성 규칙 - 매우 중요!]
imagePrompt는 한글로 작성하며, 다음 요소들을 반드시 포함해야 합니다:

A. 카메라 구도 (Shot Size) - 캐릭터 얼굴과 감정에 집중! 클로즈업 위주로:
   ★★★ 가장 많이 사용 (70% 이상) ★★★
   - Close-Up (CU): 얼굴 중심, 감정 표현에 집중 - 대부분의 대화/감정 장면에 사용
   - Medium Close-Up (MCU): 가슴 위까지 - 대화 장면에 적합
   - Extreme Close-Up (ECU): 눈, 입 등 특정 부위 강조 - 강렬한 감정 순간

   ★★ 보조적으로 사용 (20%) ★★
   - Medium Shot (MS): 허리 위까지 - 동작이 필요한 대화 장면
   - Over-the-Shoulder Shot (OTS): 어깨 너머 촬영 - 대화 장면 변화용

   ★ 특별한 경우에만 사용 (10%) - 남용 금지! ★
   - Long Shot (LS): 전신 - 장소 소개나 입장/퇴장 시에만
   - Full Shot (FS): 전신 - 복장이나 전체 동작이 중요할 때만
   - Extreme Long Shot (ELS): 광활한 배경 - 매우 드물게, 장소 확립 시에만
   - Insert Shot: 소품 클로즈업 - 스토리상 중요한 물건일 때만

   ⚠️ 주의: Long Shot, Full Shot은 캐릭터 얼굴이 잘 안 보이므로 최소화!

B. 카메라 앵글 (Perspective) - 감정과 권력관계 표현:
   - Eye Level: 평범한 시선, 관객과 동일시
   - High Angle: 위에서 내려다봄, 취약함/나약함 표현
   - Low Angle: 아래에서 올려다봄, 위엄/권력 표현
   - Bird's-Eye View / Overhead Shot: 완전히 위에서 내려다봄
   - Dutch Angle / Dutch Tilt: 기울어진 프레임, 불안감/긴장감
   - Point-of-View Shot (POV): 캐릭터 시점
   - Over-the-Shoulder Shot (OTS): 어깨 너머로 대화 상대 촬영
   - Reaction Shot: 반응하는 캐릭터에 집중

C. 구도 및 프레이밍 (Composition) - 시각적 흥미와 균형:
   - Two Shot: 두 인물을 한 프레임에
   - Single Shot: 한 인물만
   - Three Shot: 세 인물을 한 프레임에
   - Symmetrical Composition: 대칭 구도, 균형/안정감
   - Asymmetrical Composition: 비대칭 구도, 긴장감/역동성
   - Frame Within a Frame: 창문, 문틀 등으로 프레임 속 프레임
   - Leading Room / Look Room: 시선 방향에 여백
   - Negative Space: 의도적 빈 공간
   - Rule of Thirds: 삼등분 법칙
   - Center Framing: 중앙 배치
   - Foreground Framing: 전경 요소로 프레이밍
   - Depth Framing: 전경-중경-배경 레이어 활용

D. 배경 내 캐릭터 위치:
   - 캐릭터가 배경 안에서 어디에 위치하는지 (foreground, center, background, left side, right side 등)
   - 여러 캐릭터일 경우 상대적 위치 (facing each other, side by side, one behind another 등)
   - 배경 요소와의 관계 (standing near the window, sitting at the desk, leaning against the wall 등)

E. 캐릭터 동작 및 표정:
   - 구체적인 동작 (walking, running, sitting, standing, pointing, holding something 등)
   - 표정과 감정 (smiling warmly, looking worried, crying, surprised expression 등)
   - 시선 방향 (looking at camera, looking at another character, gazing into distance 등)

F. 해당 장면에 맞는 캐릭터 복장:
   - 레퍼런스 이미지의 옷을 그대로 입는 것이 아니라, 해당 장면/상황에 어울리는 복장을 지정
   - 예: 집에서는 캐주얼/잠옷, 직장에서는 정장, 외출 시는 코트 등

G. 조명 및 분위기:
   - 조명 (soft natural lighting, dramatic shadows, warm sunset light, cold blue lighting 등)
   - 전체 분위기 (romantic, tense, peaceful, mysterious 등)

[중요] 연출의 다양성:
- 연속된 컷에서 같은 구도가 반복되지 않도록 다양한 Shot Size, Angle, Composition을 조합하세요.
- 감정의 고조에 따라 Close-Up이나 Dutch Angle을 사용하고, 상황 설명에는 Long Shot을 활용하세요.
- 대화 장면에서는 OTS와 Reaction Shot을 번갈아 사용하여 역동적인 연출을 만드세요.

[매우 중요] 배경 설정 - 반드시 따르세요:
- 대본에서 특별히 다른 국가나 지역을 명시하지 않은 경우, 모든 imagePrompt에 "Korean"을 반드시 포함하세요.
- 예: "Korean wedding hall", "Korean apartment living room", "Korean office", "Seoul street" 등
- 모든 장면에 한국적인 요소를 자연스럽게 포함하세요.

반드시 다음 JSON 형식으로만 응답하세요. 카메라 구도는 반드시 별도 필드로 분리해서 작성하세요:
{
  "cuts": [
    {
      "cutIndex": 1,
      "cameraShot": "MCU",
      "cameraAngle": "Low Angle",
      "cameraComposition": "Rule of Thirds",
      "imagePrompt": "[Character name] positioned on the right third of the frame, wearing a navy blue business suit. Determined expression with dramatic side lighting. Korean office interior with modern Korean furniture visible in the blurred background.",
      "characters": ["캐릭터이름1"],
      "backgroundName": "배경이름",
      "dialogue": "대사 내용",
      "duration": 4
    }
  ]
}

cameraShot 가능값: ELS (Extreme Long Shot), LS (Long Shot), FS (Full Shot), MLS (Medium Long Shot), MS (Medium Shot), MCU (Medium Close-Up), CU (Close-Up), ECU (Extreme Close-Up), Insert
cameraAngle 가능값: Eye Level, High Angle, Low Angle, Bird's-Eye View, Dutch Angle, POV, OTS (Over-the-Shoulder), Reaction Shot
cameraComposition 가능값: Single Shot, Two Shot, Three Shot, Symmetrical, Asymmetrical, Frame Within Frame, Rule of Thirds, Center Framing, Foreground Framing, Depth Framing`;

  const userPrompt = `다음 대본을 영화 컷으로 분할해주세요.

[등장인물]
${characterList}

[배경 목록]
${backgroundList}

[대본]
${script}`;

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
        maxOutputTokens: 8192,
      },
    });

    const text = response.text || '';
    console.log('[analyze-cuts] LLM 응답 길이:', text.length);

    // JSON 파싱
    const jsonMatch = text.match(/\{[\s\S]*"cuts"[\s\S]*\}/);
    if (!jsonMatch) {
      throw new Error('LLM 응답에서 JSON을 찾을 수 없습니다.');
    }

    const parsed: LLMResponse = JSON.parse(jsonMatch[0]);

    if (!parsed.cuts || !Array.isArray(parsed.cuts)) {
      throw new Error('유효한 컷 배열이 없습니다.');
    }

    return parsed.cuts;
  } catch (error) {
    console.error('[analyze-cuts] LLM 컷 분석 실패:', error);
    throw error;
  }
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ projectId: string }> }
) {
  const startTime = Date.now();
  const { projectId } = await params;

  console.log('[analyze-cuts] 요청 시작:', { projectId });

  try {
    const body = await request.json();
    const { model = 'gemini-3-flash-preview', style = 'realistic' } = body;

    // 스타일에 따른 설명 (한글로 통일)
    const styleDescription = style === 'cartoon'
      ? '한국 웹툰 스타일의 이상화된 아름다운 캐릭터 디자인. 완벽한 이목구비, 결점 없는 피부, 매력적인 비율, 시각적 완성도 강조. 외모와 시각적 매력을 강조하는 인기 한국 웹툰 캐릭터처럼.'
      : '초사실적 사진 스타일. 전문 카메라로 촬영한 실제 사진처럼 보여야 함. 실제 인간의 피부 질감, 모공, 머리카락이 보임. 자연스러운 그림자와 영화 같은 조명. 일러스트나 만화 요소 절대 금지. 할리우드 영화나 고급 사진처럼.';

    // 1. 프로젝트 정보 가져오기
    const { data: project, error: projectError } = await supabase
      .from('movie_projects')
      .select('script')
      .eq('id', projectId)
      .single();

    if (projectError || !project) {
      console.error('[analyze-cuts] 프로젝트 조회 실패:', projectError);
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

    // 2. 캐릭터 목록 가져오기
    const { data: characters } = await supabase
      .from('movie_characters')
      .select('id, name, description')
      .eq('project_id', projectId);

    // 3. 배경 목록 가져오기
    const { data: backgrounds } = await supabase
      .from('movie_backgrounds')
      .select('id, name, image_prompt')
      .eq('project_id', projectId)
      .order('order_index');

    // 4. LLM으로 컷 분할
    console.log('[analyze-cuts] LLM 컷 분석 시작...');
    const extractedCuts = await analyzeCutsFromScript(
      project.script,
      characters || [],
      backgrounds || [],
      model
    );
    console.log('[analyze-cuts] 분석된 컷 수:', extractedCuts.length);

    if (extractedCuts.length === 0) {
      return NextResponse.json(
        { error: '대본에서 컷을 추출할 수 없습니다.' },
        { status: 400 }
      );
    }

    // 5. 기존 컷 삭제
    await supabase
      .from('movie_cuts')
      .delete()
      .eq('project_id', projectId);

    // 6. 배경 이름으로 배경 ID 매핑
    const backgroundMap = new Map<string, string>();
    if (backgrounds) {
      backgrounds.forEach(bg => {
        backgroundMap.set(bg.name, bg.id);
      });
    }

    // 7. 새 컷 저장 (구조화된 완전본 프롬프트 생성)
    const cutsToSave = extractedCuts.map((cut) => {
      // 구조화된 완전본 프롬프트 생성
      const fullPrompt = `[STYLE]
${styleDescription}

[CAMERA]
- Shot Size: ${cut.cameraShot || 'Medium Shot'}
- Camera Angle: ${cut.cameraAngle || 'Eye Level'}
- Composition: ${cut.cameraComposition || 'Center Framing'}

[REFERENCE]
- CHARACTER: Use provided character images for consistent facial features. Adapt clothing/pose to scene.
- BACKGROUND: Use provided background as environment reference. Render from the specified camera angle above.

[SCENE]
${cut.imagePrompt}

[OUTPUT]
A single cohesive movie scene image matching the specified camera settings, style, and scene description.`;

      return {
        project_id: projectId,
        cut_index: cut.cutIndex,
        camera_shot: cut.cameraShot || null,
        camera_angle: cut.cameraAngle || null,
        camera_composition: cut.cameraComposition || null,
        image_prompt: fullPrompt,  // 구조화된 완전본 저장
        characters: cut.characters,
        background_id: backgroundMap.get(cut.backgroundName) || null,
        background_name: cut.backgroundName,
        dialogue: cut.dialogue || '',
        duration: cut.duration || 4,
      };
    });

    const { data: savedCuts, error: saveError } = await supabase
      .from('movie_cuts')
      .insert(cutsToSave)
      .select();

    if (saveError) {
      console.error('[analyze-cuts] 컷 저장 실패:', saveError);
      return NextResponse.json(
        { error: '컷 저장에 실패했습니다.' },
        { status: 500 }
      );
    }

    // 8. 프로젝트 상태 업데이트
    await supabase
      .from('movie_projects')
      .update({
        status: 'cuts_ready',
        updated_at: new Date().toISOString(),
      })
      .eq('id', projectId);

    const totalTime = Date.now() - startTime;
    console.log('[analyze-cuts] 완료:', {
      totalTime: `${totalTime}ms`,
      cutsCount: savedCuts?.length || 0,
    });

    return NextResponse.json({
      cuts: savedCuts,
      count: savedCuts?.length || 0,
    });
  } catch (error) {
    console.error('[analyze-cuts] 오류:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : '컷 분석에 실패했습니다.' },
      { status: 500 }
    );
  }
}
