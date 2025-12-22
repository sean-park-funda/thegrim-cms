import { NextRequest, NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';
import { GridSize, VideoMode, GRID_CONFIGS } from '@/lib/video-generation/grid-splitter';

// 스타일 타입
type ImageStyle = 'realistic' | 'cartoon';

// GET: /api/shorts/[projectId]/preview-image-prompt - 이미지 생성 프롬프트 미리보기
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ projectId: string }> }
) {
  const { projectId } = await params;
  
  // 쿼리 파라미터에서 스타일, 그리드 크기 추출
  const searchParams = request.nextUrl.searchParams;
  const style: ImageStyle = (searchParams.get('style') as ImageStyle) || 'realistic';
  const gridSize: GridSize = (searchParams.get('gridSize') as GridSize) || '3x3';
  const gridConfig = GRID_CONFIGS[gridSize];
  
  console.log('[shorts][preview-image-prompt][GET] 프롬프트 미리보기:', projectId, '스타일:', style, '그리드:', gridSize);

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
    console.error('[shorts][preview-image-prompt][GET] 프로젝트 조회 실패:', projectError);
    return NextResponse.json({ error: '프로젝트를 찾을 수 없습니다.' }, { status: 404 });
  }

  const characters = project.shorts_characters as Array<{
    id: string;
    name: string;
    description: string | null;
    image_path: string | null;
  }> || [];

  // 캐릭터 설명 텍스트 추가
  let characterDescriptions = '';
  for (const char of characters) {
    characterDescriptions += `- ${char.name}: ${char.description || '주요 등장인물'}\n`;
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
    
    if (panelDescriptions.length !== gridConfig.panelCount) {
      console.warn(`[shorts][preview-image-prompt] 패널 설명 개수 불일치. 기대: ${gridConfig.panelCount}, 실제: ${panelDescriptions.length}`);
    }
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

  return NextResponse.json({ prompt: promptText });
}

