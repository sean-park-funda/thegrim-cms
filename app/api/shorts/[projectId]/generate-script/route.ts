import { NextRequest, NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';
import { GoogleGenAI, HarmCategory, HarmBlockThreshold } from '@google/genai';
import { GridSize, GRID_CONFIGS } from '@/lib/video-generation/grid-splitter';

// 패널 각각의 상세 설명
interface PanelDescription {
  panelIndex: number;
  description: string; // 이 패널에 대한 상세 시각적 설명
  characters: string[]; // 이 패널에 등장하는 캐릭터들
  action: string; // 캐릭터의 동작/표정
  environment: string; // 배경/환경 설명
}

// 영상 씬 (패널 → 패널 전환)
interface VideoScene {
  sceneIndex: number;
  startPanelIndex: number;
  endPanelIndex: number;
  motionDescription: string;
  dialogue: string; // 해당 씬의 대사 (원본 언어 유지)
  veoPrompt: string;
}

interface VideoScript {
  panels: PanelDescription[];
  scenes: VideoScene[];
  totalDuration: number;
  style: string;
  gridSize: GridSize;
}

// POST: /api/shorts/[projectId]/generate-script - 영상용 스크립트 생성
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ projectId: string }> }
) {
  const { projectId } = await params;
  console.log('[shorts][generate-script][POST] 영상 스크립트 생성:', projectId);

  // body에서 모델 선택 및 그리드 크기 받기
  const body = await request.json().catch(() => null) as {
    model?: string;
    gridSize?: GridSize;
  } | null;
  const selectedModel = body?.model || 'gemini-2.5-flash';
  const gridSize: GridSize = body?.gridSize || '3x3';
  const gridConfig = GRID_CONFIGS[gridSize];
  
  console.log('[shorts][generate-script] 선택된 모델:', selectedModel);
  console.log('[shorts][generate-script] 그리드 크기:', gridSize, '패널:', gridConfig.panelCount, '씬:', gridConfig.sceneCount);

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

  // LLM 프롬프트 구성 (그리드 크기에 따라 동적)
  const systemPrompt = `당신은 숏폼 동영상 제작 전문가입니다. 
주어진 대본을 바탕으로:
1. ${gridConfig.panelCount}개의 핵심 장면(패널)을 정의하고 각각의 시각적 설명을 작성합니다.
2. 연속된 패널 사이의 ${gridConfig.sceneCount}개 영상 전환(씬)에 대한 Veo 프롬프트를 작성합니다.

패널 설명은 이미지 생성에 사용되고, 씬 프롬프트는 영상 생성에 사용됩니다.
일관성을 위해 두 가지를 함께 설계해야 합니다.`;

  // 그리드 크기에 따른 패널/씬 연결 설명 생성
  const lastPanelIndex = gridConfig.panelCount - 1;
  const lastSceneIndex = gridConfig.sceneCount - 1;
  const panelConnections = Array.from({ length: gridConfig.sceneCount }, (_, i) => `${i}→${i + 1}`).join(', ');

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
      "veoPrompt": "Starting from [첫 프레임 설명], [카메라/캐릭터 움직임], transitioning to [끝 프레임 설명]. [캐릭터 설명] says: '[대사]' with [감정/톤]. Audio: [환경 사운드 목록], no background music."
    }
  ],
  "totalDuration": 전체 예상 길이(초),
  "style": "전체 영상 스타일 설명 (영어)",
  "gridSize": "${gridSize}"
}

요구사항:
1. panels는 정확히 ${gridConfig.panelCount}개 (panelIndex 0-${lastPanelIndex})
2. scenes는 정확히 ${gridConfig.sceneCount}개 (sceneIndex 0-${lastSceneIndex}, 각각 연속된 두 패널 연결: ${panelConnections})
3. panels의 description은 이미지 생성에 바로 사용될 수 있도록 구체적이고 시각적으로 작성 (영어)
4. dialogue는 대본에서 해당 씬에 맞는 대사를 원본 언어로 추출 (한국어면 한국어)
5. 카메라 움직임(pan, zoom, dolly, tracking 등)을 구체적으로 명시
6. 캐릭터 외모/의상 설명을 panels에 포함하여 일관성 유지
7. 숏폼에 적합한 역동적 연출

CRITICAL - veoPrompt 작성 방법 (Veo 3 오디오 생성 필수):
veoPrompt는 Veo 3 영상 생성 API에 직접 전달됩니다. 시작 이미지(첫 프레임)와 끝 이미지(마지막 프레임)가 함께 제공되므로, 그 사이의 전환/동작을 설명해야 합니다.

1. 첫 프레임→끝 프레임 전환 설명:
   - "Starting from [첫 프레임 상태], transitioning to [끝 프레임 상태]"
   - 카메라 움직임, 캐릭터 동작 변화, 표정 변화를 구체적으로 설명
   - 예시: "Starting from a wide shot of the couple on the trail, the camera slowly zooms in as they turn to face each other, ending in a close-up of their surprised expressions."

2. 대사/음성 생성 (Veo 3 립싱크 기능 - 필수):
   - 대사가 있으면 반드시 "[캐릭터 설명] says: '[대사]'" 형식 사용 (이 형식이 Veo 3에서 립싱크 음성 생성)
   - 캐릭터 설명은 영어, 대사는 원본 언어(한국어) 유지
   - 예시: "The young woman says: '이게 뭐지?' with curious expression."
   - 예시: "The man in blue jacket says: '정말 놀랍다!' with excited voice."
   - 감정/톤 추가: "with [emotional tone]" (예: with confident voice, with soft whisper, with surprised tone)

3. 환경 오디오 생성 (필수 - 매 씬마다 포함):
   - 반드시 "Audio: [환경 소리 목록]" 형식으로 배경 사운드 명시
   - 예시: "Audio: forest ambiance, birds chirping, leaves rustling, wind in trees"
   - 예시: "Audio: city street sounds, distant traffic, footsteps on pavement"
   - 예시: "Audio: quiet indoor room, soft ambient noise, natural room tone"
   - 원치 않는 소리는 "no background music, no artificial sounds" 추가

4. 절대 금지 사항 (NO TEXT):
   - DO NOT include any text, subtitles, captions, or written words in the video
   - DO NOT add any on-screen text overlays or graphics
   - Audio/speech only, no visual text elements

5. veoPrompt 완전한 예시:
   "Starting from a medium shot of two friends sitting on a park bench, the camera slowly moves closer as they turn to each other. The woman in the white dress says: '오늘 날씨 정말 좋다!' with cheerful tone. The man nods and says: '그러게, 산책하기 딱 좋은 날이야.' with relaxed voice. Transitioning to a close-up of their smiling faces. Audio: park ambiance, birds chirping, distant children playing, gentle breeze, no background music."

6. veoPrompt는 영어로 작성하되, 대사 부분만 원본 언어(한국어) 유지`;

  try {
    const ai = new GoogleGenAI({ apiKey });

    const fullPrompt = systemPrompt + '\n\n' + userPrompt;
    
    console.log('='.repeat(80));
    console.log('[shorts][generate-script] 전체 프롬프트:');
    console.log('='.repeat(80));
    console.log(fullPrompt);
    console.log('='.repeat(80));

    const response = await ai.models.generateContent({
      model: selectedModel,
      contents: [
        { role: 'user', parts: [{ text: fullPrompt }] },
      ],
      config: {
        responseMimeType: 'application/json',
        safetySettings: [
          { category: HarmCategory.HARM_CATEGORY_HATE_SPEECH, threshold: HarmBlockThreshold.BLOCK_NONE },
          { category: HarmCategory.HARM_CATEGORY_SEXUALLY_EXPLICIT, threshold: HarmBlockThreshold.BLOCK_NONE },
          { category: HarmCategory.HARM_CATEGORY_DANGEROUS_CONTENT, threshold: HarmBlockThreshold.BLOCK_NONE },
          { category: HarmCategory.HARM_CATEGORY_HARASSMENT, threshold: HarmBlockThreshold.BLOCK_NONE },
          { category: HarmCategory.HARM_CATEGORY_CIVIC_INTEGRITY, threshold: HarmBlockThreshold.BLOCK_NONE },
        ],
      },
    });

    console.log('='.repeat(80));
    console.log('[shorts][generate-script] Gemini 응답 객체:');
    console.log('='.repeat(80));
    console.log('response.text:', typeof response.text, response.text ? `exists (${response.text.length} chars)` : 'empty/undefined');
    console.log('response keys:', Object.keys(response || {}));
    
    // candidates 확인 (finishReason이 SAFETY나 OTHER면 응답이 차단된 것)
    if (response.candidates && response.candidates.length > 0) {
      const candidate = response.candidates[0];
      console.log('candidates[0].finishReason:', candidate.finishReason);
      console.log('candidates[0].safetyRatings:', JSON.stringify(candidate.safetyRatings, null, 2));
      if (candidate.content) {
        console.log('candidates[0].content.parts 개수:', candidate.content.parts?.length || 0);
        if (candidate.content.parts?.[0]?.text) {
          console.log('candidates[0].content.parts[0].text 길이:', candidate.content.parts[0].text.length);
        }
      }
    } else {
      console.log('candidates가 없습니다!');
      console.log('promptFeedback:', JSON.stringify(response.promptFeedback, null, 2));
    }
    console.log('='.repeat(80));

    const responseText = response.text || '';
    
    console.log('[shorts][generate-script] responseText 길이:', responseText.length);
    if (responseText.length > 0) {
      console.log('[shorts][generate-script] responseText 내용 (처음 2000자):');
      console.log(responseText.slice(0, 2000));
    } else {
      console.log('[shorts][generate-script] 응답이 비었습니다! 전체 response:', JSON.stringify(response, null, 2).slice(0, 3000));
    }
    
    // 응답이 비었으면 상세 정보 포함해서 에러 반환
    if (!responseText) {
      const blockReason = response.promptFeedback?.blockReason;
      const finishReason = response.candidates?.[0]?.finishReason;
      
      let errorMessage = 'Gemini API 응답이 비어있습니다.';
      if (blockReason) {
        errorMessage = `Gemini API가 요청을 차단했습니다. 차단 사유: ${blockReason}`;
        if (blockReason === 'PROHIBITED_CONTENT') {
          errorMessage += ' (대본 내용이 안전 필터에 의해 차단되었습니다. 대본 내용을 확인해주세요.)';
        }
      } else if (finishReason && finishReason !== 'STOP') {
        errorMessage = `Gemini API 응답 종료 사유: ${finishReason}`;
      }
      
      return NextResponse.json({
        error: errorMessage,
        geminiResponse: {
          blockReason,
          finishReason,
          modelVersion: response.modelVersion,
        },
      }, { status: 400 });
    }
    
    // JSON 파싱
    let videoScript: VideoScript;
    try {
      videoScript = JSON.parse(responseText);
    } catch (parseError) {
      console.log('[shorts][generate-script] 직접 JSON 파싱 실패, 코드블록 추출 시도...');
      
      // JSON 블록 추출 시도 (```json ... ``` 또는 ``` ... ```)
      const jsonMatch = responseText.match(/```(?:json)?\s*([\s\S]*?)```/);
      if (jsonMatch) {
        try {
          videoScript = JSON.parse(jsonMatch[1].trim());
        } catch (innerError) {
          console.error('[shorts][generate-script] 코드블록 JSON 파싱 실패:', innerError);
          console.log('[shorts][generate-script] 코드블록 내용:', jsonMatch[1].slice(0, 500));
          throw new Error('응답을 JSON으로 파싱할 수 없습니다.');
        }
      } else {
        // { 로 시작하는 JSON 객체 추출 시도
        const jsonObjectMatch = responseText.match(/\{[\s\S]*\}/);
        if (jsonObjectMatch) {
          try {
            videoScript = JSON.parse(jsonObjectMatch[0]);
          } catch (objError) {
            console.error('[shorts][generate-script] JSON 객체 파싱 실패:', objError);
            throw new Error('응답을 JSON으로 파싱할 수 없습니다.');
          }
        } else {
          console.error('[shorts][generate-script] JSON을 찾을 수 없음. 전체 응답:', responseText);
          throw new Error('응답을 JSON으로 파싱할 수 없습니다.');
        }
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
