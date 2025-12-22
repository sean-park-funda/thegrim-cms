import { NextRequest, NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';
import { generateGeminiImage, generateSeedreamImage } from '@/lib/image-generation';
import type { ImageProvider } from '@/lib/image-generation/types';
import { splitGridImage, createPanelPairs, createPerCutScenes, GridSize, VideoMode, GRID_CONFIGS } from '@/lib/video-generation/grid-splitter';

// 스타일 타입
type ImageStyle = 'realistic' | 'cartoon';

// POST: /api/shorts/[projectId]/generate-grid - 그리드 이미지 생성
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ projectId: string }> }
) {
  const { projectId } = await params;
  
  // 요청 body에서 스타일, 그리드 크기, 영상 모드, 이미지 모델 파라미터 추출
  const body = await request.json().catch(() => ({})) as {
    style?: ImageStyle;
    gridSize?: GridSize;
    videoMode?: VideoMode;
    apiProvider?: ImageProvider;
  };
  const style: ImageStyle = body.style || 'realistic';
  const gridSize: GridSize = body.gridSize || '3x3';
  const videoMode: VideoMode = body.videoMode || 'cut-to-cut';
  const apiProvider: ImageProvider = body.apiProvider === 'seedream' ? 'seedream' : 'gemini';
  const gridConfig = GRID_CONFIGS[gridSize];
  
  console.log('[shorts][generate-grid][POST] 그리드 이미지 생성:', projectId, '스타일:', style, '그리드:', gridSize, '영상모드:', videoMode, '모델:', apiProvider);

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
  const characterImageDataUrls: string[] = []; // Seedream용 data URL 저장

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

          // Seedream에서는 data URL을 사용하므로 따로 저장
          characterImageDataUrls.push(`data:${mimeType};base64,${base64}`);
        }
      } catch (err) {
        console.warn(`[shorts][generate-grid] 캐릭터 이미지 로드 실패: ${char.name}`, err);
      }
    }
  }

  // 스타일 설명 구성
  const styleDescription = style === 'realistic'
    ? 'HYPER-REALISTIC photographic style. Must look like REAL photographs taken with a professional camera. Real human skin textures, pores, hair strands visible. Cinematic movie-quality lighting with natural shadows. Absolutely NO illustration or cartoon elements. Like frames from a Hollywood movie or high-end photography.'
    : 'Lookism-focused Korean webtoon style with highly idealized, beautiful character designs. Perfect facial features, flawless skin, attractive proportions, and emphasis on visual perfection. Characters should be exceptionally good-looking with stylized but realistic proportions. Like characters from popular Korean webtoons that emphasize appearance and visual appeal.';

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
  let usePanelDescriptions = false;
  
  if (panelDescriptions.length > 0) {
    // 패널 설명이 있으면 사용 (개수가 정확히 맞지 않아도 사용)
    usePanelDescriptions = true;
    panelSection = `
PANEL DESCRIPTIONS (follow these EXACTLY for each panel):
${panelDescriptions.map((p: PanelDesc) => `
Panel ${p.panelIndex + 1}:
- Scene: ${p.description}
- Characters: ${p.characters?.join(', ') || 'N/A'}
- Action: ${p.action || 'N/A'}
- Environment: ${p.environment || 'N/A'}
`).join('')}`;
    
    if (panelDescriptions.length === gridConfig.panelCount) {
      console.log('[shorts][generate-grid] 패널 설명 사용:', panelDescriptions.length);
    } else {
      console.warn(`[shorts][generate-grid] 패널 설명 개수 불일치. 기대: ${gridConfig.panelCount}, 실제: ${panelDescriptions.length}. 패널 설명을 사용하되 개수 불일치 주의.`);
    }
  } else {
    console.log('[shorts][generate-grid] 패널 설명 없음, 대본 기반 생성');
  }

  // 프롬프트 구성 (그리드 크기에 따라 동적)
  const panelCount = gridSize === '2x2' ? 4 : 9;
  const gridLayoutDesc = gridSize === '2x2' 
    ? '2 columns x 2 rows (EXACTLY 4 total panels)\n2. Reading order: left to right, top to bottom (panels 1-2 on top row, 3-4 on bottom row)'
    : '3 columns x 3 rows (EXACTLY 9 total panels)\n2. Reading order: left to right, top to bottom (panels 1-3 on top row, 4-6 on middle row, 7-9 on bottom row)';
  
  // 실사풍일 때 contact sheet 스타일 강조
  const gridLayoutStyle = style === 'realistic'
    ? `Professional photography contact sheet layout. Collage of ${panelCount} DISTINCT photographs separated by THICK WHITE BORDERS (at least 20px). Film strip layout with clear visual separation. Each photo must be a completely separate scene - NO overlapping, NO blending between panels.`
    : `Comic/webtoon panel layout with ${panelCount} panels separated by clear borders.`;

  // 대본과 패널 설명을 함께 제공 (대본으로 전체 맥락 제공, 패널 설명으로 구체적 요구사항 제공)
  const contentSection = usePanelDescriptions
    ? `STORY SCRIPT:\n${project.script}${panelSection}`
    : `STORY SCRIPT:\n${project.script}`;

  const promptText = `CRITICAL LAYOUT INSTRUCTION:
${gridLayoutStyle}
You MUST create EXACTLY ${panelCount} separate panels arranged in a ${gridSize} grid.

Create a ${gridSize} grid of ${panelCount} sequential story panels for a short video.

${contentSection}

CHARACTERS (maintain strict visual consistency across all panels):
${characterDescriptions}

STYLE:
${styleDescription}
${videoScript?.style && style === 'realistic' ? `\nOverall style: ${videoScript.style}` : ''}

REQUIREMENTS:
1. Layout: ${gridLayoutDesc}
2. GRID STRUCTURE: Create EXACTLY ${panelCount} panels of EQUAL SIZE arranged in a perfect ${gridSize} grid
3. PANEL SEPARATION: Each panel MUST be clearly separated by thick white borders (minimum 20px width)
4. Each panel MUST match its description exactly${usePanelDescriptions ? ' as specified in the PANEL DESCRIPTIONS above. Use the story script for overall context and narrative flow, but follow the panel descriptions precisely for visual details.' : ' based on the story script'}
5. Maintain STRICT character appearance consistency across ALL panels
6. Use cinematic composition suitable for video transitions
7. Each panel is 9:16 vertical format (portrait orientation for mobile shorts)
8. ALL ${panelCount} panels must be the SAME SIZE - uniform grid with no variation

CRITICAL - NO TEXT OR SPEECH BUBBLES:
- Do NOT include any text, letters, words, or numbers in the image
- Do NOT include speech bubbles, dialogue boxes, or captions
- Do NOT include any written sound effects or onomatopoeia
- The image should be purely visual with NO textual elements
- This is for video production where audio/TTS will be added separately

Create the complete ${gridSize} grid image with EXACTLY ${panelCount} equal-sized panels now.`;

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
    // 이미지 모델에 따라 분기 (Gemini / Seedream)
    const result = apiProvider === 'seedream'
      ? await generateSeedreamImage({
          provider: 'seedream',
          prompt: promptText,
          images: characterImageDataUrls,
          size: '2K',
          timeoutMs: 180000, // 3분
        })
      : await generateGeminiImage({
          provider: 'gemini',
          model: 'gemini-3-pro-image-preview',
          contents,
          config: {
            responseModalities: ['IMAGE', 'TEXT'],
            imageConfig: {
              imageSize: '2K', // 고해상도: 각 패널이 영상 재료로 사용됨
              aspectRatio: '9:16', // 세로형 비율 (모든 그리드 크기에서 동일)
            },
          },
          timeoutMs: 180000, // 3분
        });

    // 그리드 이미지를 패널로 분할
    const splitResult = await splitGridImage(result.base64, result.mimeType, gridSize);

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
      duration?: number;
    }
    const videoScenePrompts = (videoScript as { scenes?: VideoSceneDesc[] } | null)?.scenes || [];

    // 분할된 패널 이미지들 저장 (영상 모드에 따라 다르게 처리)
    const sceneData: Array<{
      project_id: string;
      scene_index: number;
      start_panel_path: string;
      end_panel_path: string | null;
      video_prompt: string | null;
      duration: number;
      status: string;
    }> = [];

    if (videoMode === 'per-cut') {
      // per-cut 모드: 각 패널마다 개별 씬 생성 (end_panel = null)
      const perCutScenes = createPerCutScenes(splitResult.panels, gridSize);
      
      for (const scene of perCutScenes) {
        const panelFileName = `${projectId}/panel-${scene.sceneIndex}-${Date.now()}.png`;

        // 패널 저장
        const panelBuffer = Buffer.from(scene.panel.base64, 'base64');
        await supabase.storage
          .from('shorts-videos')
          .upload(panelFileName, panelBuffer, {
            contentType: 'image/png',
            upsert: true,
          });

        const { data: panelUrlData } = supabase.storage
          .from('shorts-videos')
          .getPublicUrl(panelFileName);

        // video_script에서 해당 씬의 veoPrompt와 duration 가져오기
        const scenePrompt = videoScenePrompts.find(s => s.sceneIndex === scene.sceneIndex);

        sceneData.push({
          project_id: projectId,
          scene_index: scene.sceneIndex,
          start_panel_path: panelUrlData.publicUrl,
          end_panel_path: null, // per-cut 모드에서는 끝 패널 없음
          video_prompt: scenePrompt?.veoPrompt || null,
          duration: scenePrompt?.duration || 4, // 기본 4초
          status: 'pending',
        });
      }
    } else {
      // cut-to-cut 모드: 연속된 패널 페어로 씬 생성 (기존 로직)
      const panelPairs = createPanelPairs(splitResult.panels, gridSize);
      
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

        // video_script에서 해당 씬의 veoPrompt와 duration 가져오기
        const scenePrompt = videoScenePrompts.find(s => s.sceneIndex === pair.sceneIndex);

        sceneData.push({
          project_id: projectId,
          scene_index: pair.sceneIndex,
          start_panel_path: startUrlData.publicUrl,
          end_panel_path: endUrlData.publicUrl,
          video_prompt: scenePrompt?.veoPrompt || null,
          duration: scenePrompt?.duration || 4, // 기본 4초
          status: 'pending',
        });
      }
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

    // 프로젝트 업데이트 (영상 모드 포함)
    // 참고: grid_image_base64는 저장하지 않음 (스토리지 URL만 사용)
    await supabase
      .from('shorts_projects')
      .update({
        grid_image_path: gridUrlData.publicUrl,
        video_mode: videoMode,
        status: 'grid_generated',
      })
      .eq('id', projectId);

    return NextResponse.json({
      gridImagePath: gridUrlData.publicUrl,
      prompt: promptText, // 이미지 생성 프롬프트 반환
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
