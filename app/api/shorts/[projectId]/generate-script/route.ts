import { NextRequest, NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';
import { GoogleGenAI, HarmCategory, HarmBlockThreshold } from '@google/genai';
import { GridSize, VideoMode, GRID_CONFIGS, getSceneCount } from '@/lib/video-generation/grid-splitter';

// 패널 각각의 상세 설명
interface PanelDescription {
  panelIndex: number;
  description: string; // 이미지 생성용 프롬프트 (한글, 장면 묘사 + 연출/구도 포함)
  characters: string[]; // 등장인물
}

// 영상 씬 (패널 → 패널 전환)
interface VideoScene {
  sceneIndex: number;
  startPanelIndex: number;
  endPanelIndex: number;
  motionDescription: string;
  dialogue: string; // 해당 씬의 대사 (원본 언어 유지)
  veoPrompt: string;
  duration: number; // 영상 길이 (초) - 4, 6, 8 중 하나
}

interface VideoScript {
  panels: PanelDescription[];
  scenes: VideoScene[];
  totalDuration: number;
  style: string;
  gridSize: GridSize;
  videoMode: VideoMode;
}

// POST: /api/shorts/[projectId]/generate-script - 영상용 스크립트 생성
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ projectId: string }> }
) {
  const { projectId } = await params;
  console.log('[shorts][generate-script][POST] 영상 스크립트 생성:', projectId);

  // body에서 모델 선택, 그리드 크기, 영상 모드 받기
  const body = await request.json().catch(() => null) as {
    model?: string;
    gridSize?: GridSize;
    videoMode?: VideoMode;
  } | null;
  const selectedModel = body?.model || 'gemini-2.5-flash';
  const gridSize: GridSize = body?.gridSize || '3x3';
  const videoMode: VideoMode = body?.videoMode || 'cut-to-cut';
  const gridConfig = GRID_CONFIGS[gridSize];
  const sceneCount = getSceneCount(gridSize, videoMode);

  console.log('[shorts][generate-script] 선택된 모델:', selectedModel);
  console.log('[shorts][generate-script] 그리드 크기:', gridSize, '패널:', gridConfig.panelCount);
  console.log('[shorts][generate-script] 영상 모드:', videoMode, '씬:', sceneCount);

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
        description,
        image_path,
        storage_path
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
    image_path: string | null;
    storage_path: string | null;
  }> || [];

  // 캐릭터 이미지 로드 (이미지가 있는 캐릭터만)
  const characterImages: Array<{ name: string; base64: string; mimeType: string }> = [];
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;

  for (const char of characters) {
    // image_path가 없으면 storage_path로 URL 생성
    let imageUrl = char.image_path;
    if (!imageUrl && char.storage_path && supabaseUrl) {
      imageUrl = `${supabaseUrl}/storage/v1/object/public/shorts-videos/${char.storage_path}`;
      console.log(`[shorts][generate-script] storage_path로 URL 생성: ${char.name} -> ${imageUrl}`);
    }

    if (imageUrl) {
      try {
        const response = await fetch(imageUrl);
        if (response.ok) {
          const buffer = await response.arrayBuffer();
          const base64 = Buffer.from(buffer).toString('base64');
          const contentType = response.headers.get('content-type') || 'image/jpeg';
          characterImages.push({
            name: char.name,
            base64,
            mimeType: contentType,
          });
          console.log(`[shorts][generate-script] 캐릭터 이미지 로드: ${char.name}`);
        }
      } catch (err) {
        console.error(`[shorts][generate-script] 캐릭터 이미지 로드 실패: ${char.name}`, err);
      }
    }
  }

  const hasCharacterImages = characterImages.length > 0;
  console.log(`[shorts][generate-script] 캐릭터 이미지 ${characterImages.length}개 로드됨, 이미지 사용: ${hasCharacterImages}`);

  // 씬이 없어도 패널 설명 생성 가능 (이미지 생성 전 호출)

  // 캐릭터 설명 구성 - 이미지가 있으면 이미지 참조, 없으면 상세 묘사
  let characterDescriptions: string;
  let characterImageInstruction: string;

  if (hasCharacterImages) {
    // 캐릭터 이미지가 첨부된 경우
    characterDescriptions = characterImages
      .map((img, idx) => `- ${img.name}: [첨부된 이미지 ${idx + 1}의 캐릭터 - 외모 묘사 생략, 이미지 참조]`)
      .join('\n');

    // 이미지 없는 캐릭터도 추가 (텍스트 설명만 있는 경우)
    const imageCharNames = characterImages.map(c => c.name);
    const textOnlyChars = characters.filter(c => !imageCharNames.includes(c.name));
    if (textOnlyChars.length > 0) {
      characterDescriptions += '\n' + textOnlyChars
        .map(c => `- ${c.name}: ${c.description || '주요 등장인물'}`)
        .join('\n');
    }

    characterImageInstruction = `
CRITICAL - 캐릭터 이미지가 첨부되었습니다:
${characterImages.map((img, idx) => `- 이미지 ${idx + 1}: ${img.name}의 레퍼런스 이미지`).join('\n')}

캐릭터 외모 묘사 규칙:
- 첨부된 이미지가 있는 캐릭터의 경우, panels.description과 veoPrompt에서 외모를 상세히 묘사하지 마세요.
- 대신 "the character from reference image 1" 또는 "the person shown in attached image 2" 형태로 참조하세요.
- 외모(머리색, 옷, 체형 등)는 이미지를 보면 알 수 있으므로 별도로 설명하지 않습니다.
- 동작, 표정, 포즈만 설명하세요.

예시:
- (좋음): "The character from reference image 1 stands on a cliff, looking down with a determined expression."
- (나쁨): "A muscular man with a mustache wearing a white tank top stands on a cliff..."`;
  } else {
    // 캐릭터 이미지가 없는 경우 - 기존 방식대로 상세 묘사
    characterDescriptions = characters
      .map(c => `- ${c.name}: ${c.description || '주요 등장인물'}`)
      .join('\n');

    characterImageInstruction = `
캐릭터 외모 묘사 규칙 (이미지 없음):
- 캐릭터의 외모, 의상, 체형 등을 panels.description에 상세히 포함하세요.
- 이미지 생성 시 일관성을 위해 각 패널에서 동일한 캐릭터 묘사를 사용하세요.
- 예시: "A tall muscular man with a thick mustache, wearing a white sleeveless tank top..."`;
  }

  // 그리드 크기에 따른 패널/씬 연결 설명 생성
  const lastPanelIndex = gridConfig.panelCount - 1;
  const lastSceneIndex = sceneCount - 1;

  // 영상 모드에 따른 프롬프트 생성
  let systemPrompt: string;
  let userPrompt: string;

  if (videoMode === 'per-cut') {
    // per-cut 모드: 각 패널에 대한 개별 영상 프롬프트 생성
    systemPrompt = `당신은 숏폼 동영상 제작 전문가입니다.
주어진 대본을 바탕으로:
1. ${gridConfig.panelCount}개의 핵심 장면(패널)을 정의하고 각각의 시각적 설명을 작성합니다.
2. 각 패널에 대해 ${sceneCount}개의 개별 영상 씬을 생성합니다 (각 패널 이미지를 기반으로 애니메이션 생성).

패널 설명은 이미지 생성에 사용되고, 씬 프롬프트는 각 패널 이미지를 영상으로 변환하는 데 사용됩니다.
일관성을 위해 두 가지를 함께 설계해야 합니다.`;

    userPrompt = `대본:
${project.script}

등장인물:
${characterDescriptions || '(등장인물 정보 없음)'}

다음 형식으로 JSON을 작성해주세요:

{
  "panels": [
    {
      "panelIndex": 0,
      "description": "이미지 생성용 프롬프트 (한글로 상세히 작성, 장면 묘사 + 연출/구도 포함)",
      "characters": ["등장인물1", "등장인물2"]
    }
  ],
  "scenes": [
    {
      "sceneIndex": 0,
      "startPanelIndex": 0,
      "endPanelIndex": 0,
      "motionDescription": "이 패널 이미지에서 일어나는 움직임/애니메이션 설명",
      "dialogue": "이 씬의 대사 (원본 언어 유지 - 한국어면 한국어로)",
      "duration": 4,
      "veoPrompt": "영어로 작성된 영상 생성 프롬프트"
    }
  ],
  "totalDuration": 전체 예상 길이(초),
  "style": "전체 영상 스타일 설명 (영어)",
  "gridSize": "${gridSize}",
  "videoMode": "per-cut"
}

요구사항:
1. panels는 정확히 ${gridConfig.panelCount}개 (panelIndex 0-${lastPanelIndex})
2. scenes는 정확히 ${sceneCount}개 (sceneIndex 0-${lastSceneIndex}, 각 패널에 대응: 패널0→씬0, 패널1→씬1, ...)
3. 각 scene에서 startPanelIndex와 endPanelIndex는 동일한 값 (같은 패널)
4. **panels.description 작성 규칙 (매우 중요 - 이미지 생성 프롬프트):**
   - 한글로 상세하게 작성
   - 등장인물의 위치, 자세, 표정, 외모, 의상 포함
   - 배경/환경 묘사 포함
   - 카메라 시점(클로즈업, 미디엄샷, 와이드샷, 버드아이뷰 등) 포함
   - 구도, 연출 기법(모션 블러, 명암 효과, 역광 등) 포함
   - 이 description이 그대로 이미지 생성에 사용됩니다
5. characters: 이 패널에 등장하는 캐릭터 이름 목록
6. dialogue는 대본에서 해당 씬에 맞는 대사를 원본 언어로 추출 (한국어면 한국어)
7. 카메라 움직임(pan, zoom, dolly, tracking 등)을 구체적으로 명시
8. 숏폼에 적합한 역동적 연출
9. duration은 각 씬의 적절한 영상 길이(초)로, 반드시 4, 6, 8 중 하나를 선택 (대사 길이와 액션에 따라 결정)
${characterImageInstruction}

IMPORTANT - panels.description 작성 예시 (한글, 이미지 생성용):
- 예시 1: "근육질의 남자가 가파른 바위 절벽에 한 손으로 매달려 있다. 굳은 표정으로 아래를 내려다보고 있다. 배경에는 밝은 파란 하늘이 펼쳐져 있다. 로우 앵글 클로즈업, 아래에서 위로 올려다보는 구도. 긴장감을 주는 역광 효과."
- 예시 2: "카페 내부, 창가 테이블에 두 남녀가 마주앉아 대화를 나누고 있다. 여자는 커피잔을 들고 있고, 남자는 진지한 표정으로 상대를 바라본다. 따뜻한 오후 햇살이 창문으로 들어온다. 미디엄 투샷, 따뜻한 톤의 조명."
- 예시 3: "비 오는 도시의 밤거리. 네온사인 불빛이 반사된 젖은 아스팔트 위를 우산을 쓴 남자가 걸어간다. 뒷모습, 롱샷. 고독하고 쓸쓸한 분위기, 영화적 시네마틱 연출."

CRITICAL - 스타일 관련 용어 절대 금지:
- "anime style", "cartoon", "realistic", "webtoon", "만화풍", "애니메이션 스타일" 등 스타일 지정 금지
- 스타일은 이미지 생성 시 별도로 지정되므로, 순수하게 장면 내용과 연출만 설명

CRITICAL - veoPrompt 작성 방법 (per-cut 모드, Veo 3 오디오 생성 필수):
veoPrompt는 Veo 3 영상 생성 API에 직접 전달됩니다. 시작 이미지(해당 패널)가 레퍼런스로 제공되므로, 캐릭터 외모/생김새를 설명하지 말고 동작과 대사만 설명하세요.

1. 패널 이미지 기반 애니메이션 설명:
   - 캐릭터 외모/의상 설명 절대 금지 (이미지가 이미 제공됨)
   - 동작, 표정 변화, 움직임만 설명
   - 예시 (좋음): "The character slowly looks up at the sky, raindrops falling on their face."
   - 예시 (나쁨): "A young woman in a white dress standing on a park bench..."

2. 대사/음성 생성 (Veo 3 립싱크 기능 - 필수):
   - 대사가 있으면 "The character says: '[대사]'" 형식 사용
   - 캐릭터 외모 설명 대신 "The character", "The person" 등 일반적 표현 사용
   - 예시: "The character says: '이게 뭐지?' with curious expression."
   - 감정/톤 추가: "with [emotional tone]"

3. 카메라 움직임:
   - "Camera slowly zooms in", "Camera pans left", "Camera holds steady with subtle movement"

4. 환경 오디오 생성 (필수):
   - 반드시 "Audio: [환경 소리 목록]" 형식으로 배경 사운드 명시
   - 예시: "Audio: rain falling, city ambiance, distant thunder"

5. 절대 금지 사항:
   - DO NOT include any text, subtitles, captions in the video
   - DO NOT describe character appearance (clothes, hair, face features) - the image already shows this
   - Audio/speech only, no visual text elements

6. veoPrompt 완전한 예시:
   "The character gently turns their head to look at the sunset. The character says: '오늘 정말 아름다운 하루였어.' with peaceful tone. Camera slowly zooms out, revealing the full scenery. Audio: park ambiance, birds chirping, gentle breeze, no background music."

7. veoPrompt는 영어로 작성하되, 대사 부분만 원본 언어(한국어) 유지`;
  } else {
    // cut-to-cut 모드: 연속된 패널 사이의 전환 영상 프롬프트 생성 (기존 로직)
    const panelConnections = Array.from({ length: sceneCount }, (_, i) => `${i}→${i + 1}`).join(', ');

    systemPrompt = `당신은 숏폼 동영상 제작 전문가입니다.
주어진 대본을 바탕으로:
1. ${gridConfig.panelCount}개의 핵심 장면(패널)을 정의하고 각각의 시각적 설명을 작성합니다.
2. 연속된 패널 사이의 ${sceneCount}개 영상 전환(씬)에 대한 Veo 프롬프트를 작성합니다.

패널 설명은 이미지 생성에 사용되고, 씬 프롬프트는 영상 생성에 사용됩니다.
일관성을 위해 두 가지를 함께 설계해야 합니다.`;

    userPrompt = `대본:
${project.script}

등장인물:
${characterDescriptions || '(등장인물 정보 없음)'}

다음 형식으로 JSON을 작성해주세요:

{
  "panels": [
    {
      "panelIndex": 0,
      "description": "이미지 생성용 프롬프트 (한글로 상세히 작성, 장면 묘사 + 연출/구도 포함)",
      "characters": ["등장인물1", "등장인물2"]
    }
  ],
  "scenes": [
    {
      "sceneIndex": 0,
      "startPanelIndex": 0,
      "endPanelIndex": 1,
      "motionDescription": "패널0에서 패널1로의 카메라 움직임, 캐릭터 동작 변화 설명",
      "dialogue": "이 씬의 대사 (원본 언어 유지 - 한국어면 한국어로)",
      "duration": 4,
      "veoPrompt": "영어로 작성된 영상 생성 프롬프트"
    }
  ],
  "totalDuration": 전체 예상 길이(초),
  "style": "전체 영상 스타일 설명 (영어)",
  "gridSize": "${gridSize}",
  "videoMode": "cut-to-cut"
}

요구사항:
1. panels는 정확히 ${gridConfig.panelCount}개 (panelIndex 0-${lastPanelIndex})
2. scenes는 정확히 ${sceneCount}개 (sceneIndex 0-${lastSceneIndex}, 각각 연속된 두 패널 연결: ${panelConnections})
3. **panels.description 작성 규칙 (매우 중요 - 이미지 생성 프롬프트):**
   - 한글로 상세하게 작성
   - 등장인물의 위치, 자세, 표정, 외모, 의상 포함
   - 배경/환경 묘사 포함
   - 카메라 시점(클로즈업, 미디엄샷, 와이드샷, 버드아이뷰 등) 포함
   - 구도, 연출 기법(모션 블러, 명암 효과, 역광 등) 포함
   - 이 description이 그대로 이미지 생성에 사용됩니다
4. characters: 이 패널에 등장하는 캐릭터 이름 목록
5. dialogue는 대본에서 해당 씬에 맞는 대사를 원본 언어로 추출 (한국어면 한국어)
6. 카메라 움직임(pan, zoom, dolly, tracking 등)을 구체적으로 명시
7. 숏폼에 적합한 역동적 연출
8. duration은 각 씬의 적절한 영상 길이(초)로, 반드시 4, 6, 8 중 하나를 선택 (대사 길이와 액션에 따라 결정)
${characterImageInstruction}

IMPORTANT - panels.description 작성 예시 (한글, 이미지 생성용):
- 예시 1: "근육질의 남자가 가파른 바위 절벽에 한 손으로 매달려 있다. 굳은 표정으로 아래를 내려다보고 있다. 배경에는 밝은 파란 하늘이 펼쳐져 있다. 로우 앵글 클로즈업, 아래에서 위로 올려다보는 구도. 긴장감을 주는 역광 효과."
- 예시 2: "카페 내부, 창가 테이블에 두 남녀가 마주앉아 대화를 나누고 있다. 여자는 커피잔을 들고 있고, 남자는 진지한 표정으로 상대를 바라본다. 따뜻한 오후 햇살이 창문으로 들어온다. 미디엄 투샷, 따뜻한 톤의 조명."
- 예시 3: "비 오는 도시의 밤거리. 네온사인 불빛이 반사된 젖은 아스팔트 위를 우산을 쓴 남자가 걸어간다. 뒷모습, 롱샷. 고독하고 쓸쓸한 분위기, 영화적 시네마틱 연출."

CRITICAL - 스타일 관련 용어 절대 금지:
- "anime style", "cartoon", "realistic", "webtoon", "만화풍", "애니메이션 스타일" 등 스타일 지정 금지
- 스타일은 이미지 생성 시 별도로 지정되므로, 순수하게 장면 내용과 연출만 설명

CRITICAL - veoPrompt 작성 방법 (Veo 3 오디오 생성 필수):
veoPrompt는 Veo 3 영상 생성 API에 직접 전달됩니다. 시작 이미지(첫 프레임)와 끝 이미지(마지막 프레임)가 함께 제공되므로, 캐릭터 외모/생김새를 설명하지 말고 동작과 전환만 설명하세요.

1. 첫 프레임→끝 프레임 전환 설명:
   - 캐릭터 외모/의상 설명 절대 금지 (이미지가 이미 제공됨)
   - 카메라 움직임, 동작 변화, 표정 변화만 설명
   - 예시 (좋음): "Starting from a wide shot, the camera slowly zooms in as the characters turn to face each other, ending in a close-up of their surprised expressions."
   - 예시 (나쁨): "Starting from a wide shot of the couple in matching hiking gear..."

2. 대사/음성 생성 (Veo 3 립싱크 기능 - 필수):
   - 대사가 있으면 "The character says: '[대사]'" 형식 사용
   - 캐릭터 외모 설명 대신 "The character", "The person", "The first character" 등 일반적 표현 사용
   - 예시 (좋음): "The character says: '이게 뭐지?' with curious expression."
   - 예시 (나쁨): "The young woman in the white dress says: '이게 뭐지?'"
   - 감정/톤 추가: "with [emotional tone]" (예: with confident voice, with soft whisper, with surprised tone)

3. 환경 오디오 생성 (필수 - 매 씬마다 포함):
   - 반드시 "Audio: [환경 소리 목록]" 형식으로 배경 사운드 명시
   - 예시: "Audio: forest ambiance, birds chirping, leaves rustling, wind in trees"
   - 예시: "Audio: city street sounds, distant traffic, footsteps on pavement"
   - 예시: "Audio: quiet indoor room, soft ambient noise, natural room tone"
   - 원치 않는 소리는 "no background music, no artificial sounds" 추가

4. 절대 금지 사항:
   - DO NOT include any text, subtitles, captions, or written words in the video
   - DO NOT add any on-screen text overlays or graphics
   - DO NOT describe character appearance (clothes, hair, face features) - the images already show this
   - Audio/speech only, no visual text elements

5. veoPrompt 완전한 예시:
   "Starting from a medium shot of two characters sitting on a park bench, the camera slowly moves closer as they turn to each other. The first character says: '오늘 날씨 정말 좋다!' with cheerful tone. The second character nods and says: '그러게, 산책하기 딱 좋은 날이야.' with relaxed voice. Transitioning to a close-up of their smiling faces. Audio: park ambiance, birds chirping, distant children playing, gentle breeze, no background music."

6. veoPrompt는 영어로 작성하되, 대사 부분만 원본 언어(한국어) 유지`;
  }

  try {
    const ai = new GoogleGenAI({ apiKey });

    const fullPrompt = systemPrompt + '\n\n' + userPrompt;

    console.log('='.repeat(80));
    console.log('[shorts][generate-script] 전체 프롬프트:');
    console.log('='.repeat(80));
    console.log(fullPrompt);
    console.log('='.repeat(80));

    // 캐릭터 이미지가 있으면 이미지 파트 추가
    const parts: Array<{ text: string } | { inlineData: { mimeType: string; data: string } }> = [];

    // 텍스트 프롬프트 추가
    parts.push({ text: fullPrompt });

    // 캐릭터 이미지 첨부 (있는 경우)
    if (characterImages.length > 0) {
      console.log(`[shorts][generate-script] ${characterImages.length}개 캐릭터 이미지 첨부`);
      for (const img of characterImages) {
        parts.push({
          inlineData: {
            mimeType: img.mimeType,
            data: img.base64,
          },
        });
      }
    }

    const response = await ai.models.generateContent({
      model: selectedModel,
      contents: [
        { role: 'user', parts },
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

    // 프로젝트에 전체 스크립트 저장 (패널 설명 및 영상 모드 포함)
    await supabase
      .from('shorts_projects')
      .update({
        video_script: videoScript,
        video_mode: videoMode,
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
