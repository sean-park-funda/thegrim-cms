import { NextRequest, NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';
import { GoogleGenAI } from '@google/genai';

// 9개 패널 각각의 상세 설명
interface PanelDescription {
  panelIndex: number; // 0-8
  description: string; // 이 패널에 대한 상세 시각적 설명
  characters: string[]; // 이 패널에 등장하는 캐릭터들
  action: string; // 캐릭터의 동작/표정
  environment: string; // 배경/환경 설명
}

// 8개 영상 씬 (패널 → 패널 전환)
interface VideoScene {
  sceneIndex: number; // 0-7
  startPanelIndex: number;
  endPanelIndex: number;
  motionDescription: string;
  dialogue: string; // 해당 씬의 대사 (원본 언어 유지)
  veoPrompt: string;
}

interface VideoScript {
  panels: PanelDescription[]; // 9개 패널 설명
  scenes: VideoScene[]; // 8개 영상 씬
  totalDuration: number;
  style: string;
}

// POST: /api/shorts/[projectId]/generate-script - 영상용 스크립트 생성
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ projectId: string }> }
) {
  const { projectId } = await params;
  console.log('[shorts][generate-script][POST] 영상 스크립트 생성:', projectId);

  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    return NextResponse.json({ error: 'GEMINI_API_KEY가 설정되지 않았습니다.' }, { status: 500 });
  }

  // 프로젝트와 씬 정보 조회
  const { data: project, error: projectError } = await supabase
    .from('shorts_projects')
    .select(`
      id,
      script,
      shorts_characters (
        name,
        description
      ),
      shorts_scenes (
        id,
        scene_index,
        start_panel_path,
        end_panel_path
      )
    `)
    .eq('id', projectId)
    .single();

  if (projectError || !project) {
    console.error('[shorts][generate-script][POST] 프로젝트 조회 실패:', projectError);
    return NextResponse.json({ error: '프로젝트를 찾을 수 없습니다.' }, { status: 404 });
  }

  const scenes = project.shorts_scenes as Array<{
    id: string;
    scene_index: number;
    start_panel_path: string | null;
    end_panel_path: string | null;
  }> || [];

  const characters = project.shorts_characters as Array<{
    name: string;
    description: string | null;
  }> || [];

  // 씬이 없어도 패널 설명 생성 가능 (이미지 생성 전 호출)

  // 캐릭터 설명 구성
  const characterDescriptions = characters
    .map(c => `- ${c.name}: ${c.description || '주요 등장인물'}`)
    .join('\n');

  // LLM 프롬프트 구성
  const systemPrompt = `당신은 숏폼 동영상 제작 전문가입니다. 
주어진 대본을 바탕으로:
1. 9개의 핵심 장면(패널)을 정의하고 각각의 시각적 설명을 작성합니다.
2. 연속된 패널 사이의 8개 영상 전환(씬)에 대한 Veo 프롬프트를 작성합니다.

패널 설명은 이미지 생성에 사용되고, 씬 프롬프트는 영상 생성에 사용됩니다.
일관성을 위해 두 가지를 함께 설계해야 합니다.`;

  const userPrompt = `대본:
${project.script}

등장인물:
${characterDescriptions || '(등장인물 정보 없음)'}

다음 형식으로 JSON을 작성해주세요:

{
  "panels": [
    {
      "panelIndex": 0,
      "description": "이 패널의 상세 시각적 설명 (영어, 이미지 생성용 프롬프트로 사용됨)",
      "characters": ["등장 캐릭터명1", "등장 캐릭터명2"],
      "action": "캐릭터의 동작/표정 (영어)",
      "environment": "배경/환경 설명 (영어)"
    }
  ],
  "scenes": [
    {
      "sceneIndex": 0,
      "startPanelIndex": 0,
      "endPanelIndex": 1,
      "motionDescription": "패널0에서 패널1로의 카메라 움직임, 캐릭터 동작 변화 설명",
      "dialogue": "이 씬의 대사 (원본 언어 유지 - 한국어면 한국어로)",
      "veoPrompt": "Starting from [첫 프레임 설명], [카메라/캐릭터 움직임], transitioning to [끝 프레임 설명]. No text or subtitles. The character speaks: '[대사]'"
    }
  ],
  "totalDuration": 전체 예상 길이(초),
  "style": "전체 영상 스타일 설명 (영어)"
}

요구사항:
1. panels는 정확히 9개 (panelIndex 0-8)
2. scenes는 정확히 8개 (sceneIndex 0-7, 각각 연속된 두 패널 연결: 0→1, 1→2, ..., 7→8)
3. panels의 description은 이미지 생성에 바로 사용될 수 있도록 구체적이고 시각적으로 작성 (영어)
4. dialogue는 대본에서 해당 씬에 맞는 대사를 원본 언어로 추출 (한국어면 한국어)
5. 카메라 움직임(pan, zoom, dolly, tracking 등)을 구체적으로 명시
6. 캐릭터 외모/의상 설명을 panels에 포함하여 일관성 유지
7. 숏폼에 적합한 역동적 연출

CRITICAL - veoPrompt 작성 방법:
veoPrompt는 Veo 영상 생성 API에 직접 전달됩니다. 시작 이미지(첫 프레임)와 끝 이미지(마지막 프레임)가 함께 제공되므로, 그 사이의 전환/동작을 설명해야 합니다.

1. 첫 프레임→끝 프레임 전환 설명:
   - "Starting from [첫 프레임 상태], transitioning to [끝 프레임 상태]"
   - 카메라 움직임, 캐릭터 동작 변화, 표정 변화를 구체적으로 설명
   - 예시: "Starting from a wide shot of the couple on the trail, the camera slowly zooms in as they turn to face each other, ending in a close-up of their surprised expressions."

2. 대사/음성 포함 (있는 경우):
   - 대사가 있으면 "The character speaks: '[대사]'" 형식으로 포함
   - 대사는 원본 언어(한국어) 유지
   - 예시: "...ending in a close-up. The character speaks: '이게 뭐지?'"

3. 절대 금지 사항 (NO TEXT):
   - DO NOT include any text, subtitles, captions, or written words in the video
   - DO NOT add any on-screen text overlays or graphics
   - Audio/speech only, no visual text elements

4. veoPrompt는 영어로 작성하되, 대사 부분만 원본 언어(한국어) 유지`;

  try {
    const ai = new GoogleGenAI({ apiKey });

    const fullPrompt = systemPrompt + '\n\n' + userPrompt;
    
    console.log('='.repeat(80));
    console.log('[shorts][generate-script] 전체 프롬프트:');
    console.log('='.repeat(80));
    console.log(fullPrompt);
    console.log('='.repeat(80));

    const response = await ai.models.generateContent({
      model: 'gemini-3-pro-preview',
      contents: [
        { role: 'user', parts: [{ text: fullPrompt }] },
      ],
      config: {
        responseMimeType: 'application/json',
      },
    });

    const responseText = response.text || '';
    
    // JSON 파싱
    let videoScript: VideoScript;
    try {
      videoScript = JSON.parse(responseText);
    } catch {
      // JSON 블록 추출 시도
      const jsonMatch = responseText.match(/```(?:json)?\s*([\s\S]*?)```/);
      if (jsonMatch) {
        videoScript = JSON.parse(jsonMatch[1].trim());
      } else {
        throw new Error('응답을 JSON으로 파싱할 수 없습니다.');
      }
    }

    // 씬이 이미 DB에 있으면 veoPrompt 업데이트
    if (scenes.length > 0) {
      for (const scene of videoScript.scenes) {
        const dbScene = scenes.find(s => s.scene_index === scene.sceneIndex);
        if (dbScene) {
          await supabase
            .from('shorts_scenes')
            .update({ video_prompt: scene.veoPrompt })
            .eq('id', dbScene.id);
        }
      }
    }

    // 프로젝트에 전체 스크립트 저장 (패널 설명 포함)
    await supabase
      .from('shorts_projects')
      .update({
        video_script: videoScript,
        status: 'script_generated',
      })
      .eq('id', projectId);

    console.log('[shorts][generate-script] 생성 완료:', {
      panels: videoScript.panels?.length || 0,
      scenes: videoScript.scenes?.length || 0,
    });

    return NextResponse.json(videoScript);
  } catch (err) {
    console.error('[shorts][generate-script] 스크립트 생성 실패:', err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : '스크립트 생성에 실패했습니다.' },
      { status: 500 }
    );
  }
}
