import { NextRequest, NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';
import { generateGeminiImage } from '@/lib/image-generation/providers/gemini';
import { splitGridImage, createPanelPairs } from '@/lib/video-generation/grid-splitter';

// 스타일 타입
type ImageStyle = 'realistic' | 'cartoon';

// POST: /api/shorts/[projectId]/generate-grid - 4x2 그리드 이미지 생성
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ projectId: string }> }
) {
  const { projectId } = await params;
  
  // 요청 body에서 스타일 파라미터 추출
  const body = await request.json().catch(() => ({})) as { style?: ImageStyle };
  const style: ImageStyle = body.style || 'realistic';
  
  console.log('[shorts][generate-grid][POST] 그리드 이미지 생성:', projectId, '스타일:', style);

  // 프로젝트, 캐릭터, 영상스크립트 정보 조회
  const { data: project, error: projectError } = await supabase
    .from('shorts_projects')
    .select(`
      id,
      script,
      video_script,
      shorts_characters (
        id,
        name,
        description,
        image_path
      )
    `)
    .eq('id', projectId)
    .single();

  if (projectError || !project) {
    console.error('[shorts][generate-grid][POST] 프로젝트 조회 실패:', projectError);
    return NextResponse.json({ error: '프로젝트를 찾을 수 없습니다.' }, { status: 404 });
  }

  const characters = project.shorts_characters as Array<{
    id: string;
    name: string;
    description: string | null;
    image_path: string | null;
  }> || [];

  // 캐릭터 참조 이미지 다운로드 및 Base64 변환
  const characterParts: Array<{ text: string } | { inlineData: { data: string; mimeType: string } }> = [];

  // 캐릭터 설명 텍스트 추가
  let characterDescriptions = '';
  for (const char of characters) {
    characterDescriptions += `- ${char.name}: ${char.description || '주요 등장인물'}\n`;

    // 캐릭터 이미지가 있으면 참조로 추가
    if (char.image_path) {
      try {
        const response = await fetch(char.image_path);
        if (response.ok) {
          const arrayBuffer = await response.arrayBuffer();
          const base64 = Buffer.from(arrayBuffer).toString('base64');
          const mimeType = response.headers.get('content-type') || 'image/png';

          characterParts.push({
            inlineData: {
              data: base64,
              mimeType,
            },
          });
          characterParts.push({
            text: `위 이미지는 "${char.name}" 캐릭터입니다. 모든 패널에서 이 캐릭터의 외모를 일관되게 유지해주세요.`,
          });
        }
      } catch (err) {
        console.warn(`[shorts][generate-grid] 캐릭터 이미지 로드 실패: ${char.name}`, err);
      }
    }
  }

  // 스타일 설명 구성
  const styleDescription = style === 'realistic'
    ? 'HYPER-REALISTIC photographic style. Must look like REAL photographs taken with a professional camera. Real human skin textures, pores, hair strands visible. Cinematic movie-quality lighting with natural shadows. Absolutely NO illustration or cartoon elements. Like frames from a Hollywood movie or high-end photography.'
    : 'Cartoon/anime style with bold outlines, vibrant colors, expressive characters, and stylized features. Like a modern webtoon or anime.';

  // video_script에서 패널 설명 추출
  interface PanelDesc {
    panelIndex: number;
    description: string;
    characters?: string[];
    action?: string;
    environment?: string;
  }
  
  const videoScript = project.video_script as { panels?: PanelDesc[]; style?: string } | null;
  const panelDescriptions = videoScript?.panels || [];
  
  // 패널 설명이 있으면 상세 프롬프트 구성
  let panelSection = '';
  if (panelDescriptions.length === 9) {
    panelSection = `
PANEL DESCRIPTIONS (follow these EXACTLY for each panel):
${panelDescriptions.map((p: PanelDesc) => `
Panel ${p.panelIndex + 1}:
- Scene: ${p.description}
- Characters: ${p.characters?.join(', ') || 'N/A'}
- Action: ${p.action || 'N/A'}
- Environment: ${p.environment || 'N/A'}
`).join('')}`;
    console.log('[shorts][generate-grid] 패널 설명 사용:', panelDescriptions.length);
  } else {
    console.log('[shorts][generate-grid] 패널 설명 없음, 대본 기반 생성');
  }

  // 프롬프트 구성 (3x3 그리드 = 9개 패널, 각 패널 9:16 → 전체 9:16)
  const promptText = `Create a 3x3 grid of 9 sequential story panels for a short video.

${panelSection ? panelSection : `STORY SCRIPT:\n${project.script}`}

CHARACTERS (maintain strict visual consistency across all panels):
${characterDescriptions}

STYLE:
${styleDescription}
${videoScript?.style ? `\nOverall style: ${videoScript.style}` : ''}

REQUIREMENTS:
1. Layout: 3 columns x 3 rows (9 total panels)
2. Reading order: left to right, top to bottom (panels 1-3 on top row, 4-6 on middle row, 7-9 on bottom row)
3. Each panel MUST match its description exactly${panelSection ? ' as specified above' : ''}
4. Maintain STRICT character appearance consistency across ALL panels
5. Use cinematic composition suitable for video transitions
6. Each panel is 9:16 vertical format (portrait orientation for mobile shorts)
7. Leave clear visual separation between panels with thin borders or gaps

CRITICAL - NO TEXT OR SPEECH BUBBLES:
- Do NOT include any text, letters, words, or numbers in the image
- Do NOT include speech bubbles, dialogue boxes, or captions
- Do NOT include any written sound effects or onomatopoeia
- The image should be purely visual with NO textual elements
- This is for video production where audio/TTS will be added separately

Create the complete 3x3 grid image now.`;

  console.log('='.repeat(80));
  console.log('[shorts][generate-grid] 전체 프롬프트:');
  console.log('='.repeat(80));
  console.log(promptText);
  console.log('='.repeat(80));
  console.log('[shorts][generate-grid] 캐릭터 이미지 수:', characterParts.filter(p => 'inlineData' in p).length);

  const contents = [
    {
      role: 'user' as const,
      parts: [
        ...characterParts,
        { text: promptText },
      ],
    },
  ];

  try {
    // Gemini로 그리드 이미지 생성
    // 3x3 그리드, 각 패널 9:16 → 전체 (9*3):(16*3) = 27:48 = 9:16
    const result = await generateGeminiImage({
      provider: 'gemini',
      model: 'gemini-3-pro-image-preview',
      contents,
      config: {
        responseModalities: ['IMAGE', 'TEXT'],
        imageConfig: {
          imageSize: '2K', // 고해상도: 각 패널이 영상 재료로 사용됨
          aspectRatio: '9:16', // 3x3 그리드의 세로형 비율
        },
      },
      timeoutMs: 180000, // 3분
    });

    // 그리드 이미지를 8개 패널로 분할
    const splitResult = await splitGridImage(result.base64, result.mimeType);
    const panelPairs = createPanelPairs(splitResult.panels);

    // Supabase Storage에 그리드 이미지 저장
    const gridFileName = `${projectId}/grid-${Date.now()}.png`;
    const gridBuffer = Buffer.from(result.base64, 'base64');

    const { error: uploadError } = await supabase.storage
      .from('shorts-videos')
      .upload(gridFileName, gridBuffer, {
        contentType: 'image/png',
        upsert: true,
      });

    if (uploadError) {
      console.error('[shorts][generate-grid] 그리드 이미지 업로드 실패:', uploadError);
      return NextResponse.json({ error: '이미지 저장에 실패했습니다.' }, { status: 500 });
    }

    const { data: gridUrlData } = supabase.storage
      .from('shorts-videos')
      .getPublicUrl(gridFileName);

    // video_script에서 영상 프롬프트 추출
    interface VideoSceneDesc {
      sceneIndex: number;
      veoPrompt: string;
    }
    const videoScenePrompts = (videoScript as { scenes?: VideoSceneDesc[] } | null)?.scenes || [];

    // 분할된 패널 이미지들 저장
    const sceneData = [];
    for (const pair of panelPairs) {
      const startPanelFileName = `${projectId}/panel-${pair.sceneIndex}-start-${Date.now()}.png`;
      const endPanelFileName = `${projectId}/panel-${pair.sceneIndex}-end-${Date.now()}.png`;

      // 시작 패널 저장
      const startBuffer = Buffer.from(pair.startPanel.base64, 'base64');
      await supabase.storage
        .from('shorts-videos')
        .upload(startPanelFileName, startBuffer, {
          contentType: 'image/png',
          upsert: true,
        });

      // 끝 패널 저장
      const endBuffer = Buffer.from(pair.endPanel.base64, 'base64');
      await supabase.storage
        .from('shorts-videos')
        .upload(endPanelFileName, endBuffer, {
          contentType: 'image/png',
          upsert: true,
        });

      const { data: startUrlData } = supabase.storage
        .from('shorts-videos')
        .getPublicUrl(startPanelFileName);

      const { data: endUrlData } = supabase.storage
        .from('shorts-videos')
        .getPublicUrl(endPanelFileName);

      // video_script에서 해당 씬의 veoPrompt 가져오기
      const scenePrompt = videoScenePrompts.find(s => s.sceneIndex === pair.sceneIndex);

      sceneData.push({
        project_id: projectId,
        scene_index: pair.sceneIndex,
        start_panel_path: startUrlData.publicUrl,
        end_panel_path: endUrlData.publicUrl,
        video_prompt: scenePrompt?.veoPrompt || null, // 영상 프롬프트 저장
        status: 'pending',
      });
    }

    // 기존 씬 삭제 후 새로 생성
    await supabase
      .from('shorts_scenes')
      .delete()
      .eq('project_id', projectId);

    const { error: sceneError } = await supabase
      .from('shorts_scenes')
      .insert(sceneData);

    if (sceneError) {
      console.error('[shorts][generate-grid] 씬 저장 실패:', sceneError);
    }

    // 프로젝트 업데이트
    await supabase
      .from('shorts_projects')
      .update({
        grid_image_path: gridUrlData.publicUrl,
        grid_image_base64: result.base64,
        status: 'grid_generated',
      })
      .eq('id', projectId);

    return NextResponse.json({
      gridImagePath: gridUrlData.publicUrl,
      panels: splitResult.panels.map(p => ({
        index: p.index,
        row: p.row,
        col: p.col,
      })),
      scenes: sceneData.map(s => ({
        sceneIndex: s.scene_index,
        startPanelPath: s.start_panel_path,
        endPanelPath: s.end_panel_path,
      })),
    });
  } catch (err) {
    console.error('[shorts][generate-grid] 이미지 생성 실패:', err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : '이미지 생성에 실패했습니다.' },
      { status: 500 }
    );
  }
}
