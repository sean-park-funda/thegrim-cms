import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { GoogleGenAI } from '@google/genai';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseServiceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const GEMINI_API_KEY = process.env.GEMINI_API_KEY!;

const supabase = createClient(supabaseUrl, supabaseServiceRoleKey);

interface ReanalyzedCut {
  cameraShot: string;
  cameraAngle: string;
  cameraComposition: string;
  imagePrompt: string;
  characters: string[];
  backgroundName: string;
  dialogue: string;
  duration: number;
}

// 컷 재분석 (LLM)
async function reanalyzeCut(
  script: string,
  currentCut: {
    cutIndex: number;
    cameraShot: string | null;
    cameraAngle: string | null;
    cameraComposition: string | null;
    imagePrompt: string | null;
    characters: string[];
    backgroundName: string | null;
    dialogue: string | null;
    duration: number;
  },
  userPrompt: string,
  model: string = 'gemini-3-pro-preview'
): Promise<ReanalyzedCut> {
  const genAI = new GoogleGenAI({ apiKey: GEMINI_API_KEY });

  // 구조화된 프롬프트에서 순수 장면 묘사만 추출
  const extractSceneDescription = (fullPrompt: string): string => {
    // [SCENE] 섹션 추출
    const sceneMatch = fullPrompt.match(/\[SCENE\]\s*([\s\S]*?)(?:\[OUTPUT\]|$)/);
    if (sceneMatch) {
      return sceneMatch[1].trim();
    }
    // 구조화되지 않은 경우 그대로 반환
    return fullPrompt;
  };

  const pureSceneDescription = extractSceneDescription(currentCut.imagePrompt || '');

  const systemPrompt = `당신은 영화 컷 분석 전문가입니다. 사용자의 수정 요청에 따라 기존 컷 정보를 **부분 수정**해주세요.

[매우 중요] 수정 원칙:
1. 사용자가 명시적으로 수정을 요청한 항목만 변경하세요.
2. 수정 요청에 언급되지 않은 항목은 반드시 기존 값을 그대로 유지하세요.
3. 예: "카메라를 클로즈업으로 바꿔줘"라고 하면 cameraShot만 변경하고, 나머지(앵글, 구도, 이미지프롬프트, 등장인물, 배경, 대사 등)는 모두 기존 값 유지.

현재 컷 정보 (수정 요청에 없는 항목은 이 값을 그대로 반환):
- 컷 번호: ${currentCut.cutIndex}
- 카메라 샷(cameraShot): ${currentCut.cameraShot || 'MS'}
- 카메라 앵글(cameraAngle): ${currentCut.cameraAngle || 'Eye Level'}
- 카메라 구도(cameraComposition): ${currentCut.cameraComposition || 'Center'}
- 장면 묘사(imagePrompt): ${pureSceneDescription}
- 등장인물(characters): ${JSON.stringify(currentCut.characters || [])}
- 배경(backgroundName): ${currentCut.backgroundName || ''}
- 대사(dialogue): ${currentCut.dialogue || ''}
- 길이(duration): ${currentCut.duration}초

카메라 옵션 (참고용):
- Shot Size: ELS, LS, FS, MLS, MS, MCU, CU, ECU, Insert
- Angle: Eye Level, High Angle, Low Angle, Bird's-Eye View, Dutch Angle, POV, OTS, Reaction Shot
- Composition: Single Shot, Two Shot, Three Shot, Symmetrical, Asymmetrical, Frame Within Frame, Rule of Thirds, Center Framing, Foreground Framing, Depth Framing

[중요 규칙]
- imagePrompt는 순수한 장면 묘사만 작성하세요 (스타일, 카메라, 레퍼런스 정보 제외)
- 대본에서 특별히 다른 국가나 지역을 명시하지 않은 경우, 한국 배경임을 명시하세요.

반드시 다음 JSON 형식으로만 응답하세요.
**수정 요청에 언급되지 않은 항목은 위의 "현재 컷 정보" 값을 그대로 복사하세요:**
{
  "cameraShot": "${currentCut.cameraShot || 'MS'}",
  "cameraAngle": "${currentCut.cameraAngle || 'Eye Level'}",
  "cameraComposition": "${currentCut.cameraComposition || 'Center'}",
  "imagePrompt": "순수 장면 묘사만 (스타일/카메라/레퍼런스 제외)",
  "characters": ${JSON.stringify(currentCut.characters || [])},
  "backgroundName": "${currentCut.backgroundName || ''}",
  "dialogue": "${(currentCut.dialogue || '').replace(/"/g, '\\"').substring(0, 50)}...(기존 유지 또는 수정)",
  "duration": ${currentCut.duration}
}`;

  const userMessage = `대본:
===
${script}
===

사용자의 수정 요청:
"${userPrompt}"

[지시사항]
위 수정 요청에서 언급된 항목만 수정하고, 언급되지 않은 모든 항목은 현재 컷 정보의 값을 그대로 유지하여 컷 ${currentCut.cutIndex}번을 반환해주세요.`;

  // 프롬프트 전문 로그
  console.log('\n========== 📤 LLM REQUEST (Reanalyze) ==========');
  console.log('--- SYSTEM PROMPT ---');
  console.log(systemPrompt);
  console.log('\n--- USER MESSAGE ---');
  console.log(userMessage);
  console.log('==================================================\n');

  try {
    const response = await genAI.models.generateContent({
      model,
      contents: [{ role: 'user', parts: [{ text: userMessage }] }],
      config: {
        systemInstruction: systemPrompt,
        temperature: 0.7,
      },
    });

    const text = response.text || '';

    // LLM 응답 전문 로그
    console.log('\n========== 📥 LLM RESPONSE (Reanalyze) ==========');
    console.log(text);
    console.log('==================================================\n');

    // JSON 파싱
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      throw new Error('LLM 응답에서 JSON을 찾을 수 없습니다.');
    }

    const parsed = JSON.parse(jsonMatch[0]) as ReanalyzedCut;
    return parsed;
  } catch (error) {
    console.error('[reanalyze-cut] LLM 오류:', error);
    throw error;
  }
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ projectId: string; cutId: string }> }
) {
  const startTime = Date.now();

  try {
    const { projectId, cutId } = await params;
    const { userPrompt, model = 'gemini-3-pro-preview' } = await request.json();

    console.log('\n========== 🔄 CUT REANALYZE START ==========');
    console.log(`[reanalyze] projectId: ${projectId}`);
    console.log(`[reanalyze] cutId: ${cutId}`);
    console.log(`[reanalyze] userPrompt: "${userPrompt}"`);
    console.log(`[reanalyze] model: ${model}`);

    if (!userPrompt || typeof userPrompt !== 'string' || !userPrompt.trim()) {
      return NextResponse.json(
        { error: '수정 요청 프롬프트를 입력해주세요.' },
        { status: 400 }
      );
    }

    // 1. 프로젝트 정보 (대본, 스타일) 가져오기
    const { data: project, error: projectError } = await supabase
      .from('movie_projects')
      .select('script, image_style')
      .eq('id', projectId)
      .single();

    if (projectError || !project) {
      return NextResponse.json(
        { error: '프로젝트를 찾을 수 없습니다.' },
        { status: 404 }
      );
    }

    if (!project.script || !project.script.trim()) {
      return NextResponse.json(
        { error: '대본이 없습니다.' },
        { status: 400 }
      );
    }

    // 2. 현재 컷 정보 가져오기
    const { data: cut, error: cutError } = await supabase
      .from('movie_cuts')
      .select('*')
      .eq('id', cutId)
      .eq('project_id', projectId)
      .single();

    if (cutError || !cut) {
      return NextResponse.json(
        { error: '컷을 찾을 수 없습니다.' },
        { status: 404 }
      );
    }

    // 3. LLM으로 컷 재분석
    console.log('\n--- [reanalyze] 기존 컷 정보 ---');
    console.log(`  컷 번호: ${cut.cut_index}`);
    console.log(`  배경: ${cut.background_name}`);
    console.log(`  등장인물: ${JSON.stringify(cut.characters || [])}`);
    console.log(`  카메라: ${cut.camera_shot || 'N/A'} / ${cut.camera_angle || 'N/A'} / ${cut.camera_composition || 'N/A'}`);
    console.log(`  대사: ${cut.dialogue?.substring(0, 50)}...`);
    console.log(`  이미지 프롬프트: ${cut.image_prompt?.substring(0, 80)}...`);
    console.log('\n[reanalyze] LLM 호출 시작...');

    const reanalyzed = await reanalyzeCut(
      project.script,
      {
        cutIndex: cut.cut_index,
        cameraShot: cut.camera_shot,
        cameraAngle: cut.camera_angle,
        cameraComposition: cut.camera_composition,
        imagePrompt: cut.image_prompt,
        characters: cut.characters || [],
        backgroundName: cut.background_name,
        dialogue: cut.dialogue,
        duration: cut.duration || 4,
      },
      userPrompt,
      model
    );

    console.log('\n--- [reanalyze] LLM 응답 (재분석 결과) ---');
    console.log(`  배경: ${reanalyzed.backgroundName}`);
    console.log(`  등장인물: ${JSON.stringify(reanalyzed.characters)}`);
    console.log(`  카메라: ${reanalyzed.cameraShot || 'N/A'} / ${reanalyzed.cameraAngle || 'N/A'} / ${reanalyzed.cameraComposition || 'N/A'}`);
    console.log(`  대사: ${reanalyzed.dialogue?.substring(0, 50)}...`);
    console.log(`  이미지 프롬프트: ${reanalyzed.imagePrompt?.substring(0, 80)}...`);
    console.log(`  지속시간: ${reanalyzed.duration}초`);

    // 4. 배경 ID 찾기 (이름으로 매칭)
    let backgroundId = cut.background_id;
    if (reanalyzed.backgroundName && reanalyzed.backgroundName !== cut.background_name) {
      const { data: backgrounds } = await supabase
        .from('movie_backgrounds')
        .select('id, name')
        .eq('project_id', projectId);

      if (backgrounds) {
        const matchedBg = backgrounds.find(
          bg => bg.name.toLowerCase() === reanalyzed.backgroundName.toLowerCase()
        );
        if (matchedBg) {
          backgroundId = matchedBg.id;
        }
      }
    }

    // 5. 구조화된 프롬프트 생성
    const style = project.image_style || 'realistic';
    const styleDescription = style === 'cartoon'
      ? '한국 웹툰 스타일의 이상화된 아름다운 캐릭터 디자인. 완벽한 이목구비, 결점 없는 피부, 매력적인 비율, 시각적 완성도 강조. 외모와 시각적 매력을 강조하는 인기 한국 웹툰 캐릭터처럼.'
      : '초사실적 사진 스타일. 전문 카메라로 촬영한 실제 사진처럼 보여야 함. 실제 인간의 피부 질감, 모공, 머리카락이 보임. 자연스러운 그림자와 영화 같은 조명. 일러스트나 만화 요소 절대 금지. 할리우드 영화나 고급 사진처럼.';

    const fullPrompt = `[STYLE]
${styleDescription}

[CAMERA]
- Shot Size: ${reanalyzed.cameraShot || 'Medium Shot'}
- Camera Angle: ${reanalyzed.cameraAngle || 'Eye Level'}
- Composition: ${reanalyzed.cameraComposition || 'Center Framing'}

[REFERENCE]
- CHARACTER: Use provided character images for consistent facial features. Adapt clothing/pose to scene.
- BACKGROUND: Use provided background as environment reference. Render from the specified camera angle above.

[SCENE]
${reanalyzed.imagePrompt}

[OUTPUT]
A single cohesive movie scene image matching the specified camera settings, style, and scene description.`;

    // 6. 컷 업데이트
    console.log('\n[reanalyze] DB 업데이트 중...');
    console.log('[reanalyze] 구조화된 프롬프트:', fullPrompt.substring(0, 200) + '...');

    const { data: updatedCut, error: updateError } = await supabase
      .from('movie_cuts')
      .update({
        camera_shot: reanalyzed.cameraShot,
        camera_angle: reanalyzed.cameraAngle,
        camera_composition: reanalyzed.cameraComposition,
        image_prompt: fullPrompt,  // 구조화된 완전본 저장
        characters: reanalyzed.characters,
        background_id: backgroundId,
        background_name: reanalyzed.backgroundName,
        dialogue: reanalyzed.dialogue,
        duration: reanalyzed.duration,
        updated_at: new Date().toISOString(),
      })
      .eq('id', cutId)
      .select()
      .single();

    if (updateError) {
      console.error('[reanalyze-cut] 업데이트 오류:', updateError);
      return NextResponse.json(
        { error: '컷 업데이트에 실패했습니다.' },
        { status: 500 }
      );
    }

    const elapsed = Date.now() - startTime;
    console.log('\n--- [reanalyze] DB 업데이트 완료 ---');
    console.log(`  저장된 배경: ${updatedCut.background_name}`);
    console.log(`  저장된 등장인물: ${JSON.stringify(updatedCut.characters)}`);
    console.log(`  저장된 카메라: ${updatedCut.camera_shot} / ${updatedCut.camera_angle} / ${updatedCut.camera_composition}`);
    console.log(`  저장된 이미지 프롬프트: ${updatedCut.image_prompt?.substring(0, 80)}...`);
    console.log(`========== ✅ CUT REANALYZE COMPLETE (${elapsed}ms) ==========\n`);

    return NextResponse.json({
      success: true,
      cut: updatedCut,
    });
  } catch (error) {
    console.error('[reanalyze-cut] 오류:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : '컷 재분석에 실패했습니다.' },
      { status: 500 }
    );
  }
}
