import { NextRequest, NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';
import { generateGeminiImage, generateSeedreamImage } from '@/lib/image-generation';
import type { ImageProvider } from '@/lib/image-generation/types';

// 스타일 타입
type ImageStyle = 'realistic' | 'cartoon';

// POST: /api/movie/[projectId]/generate-panel - 개별 패널 이미지 생성
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ projectId: string }> }
) {
  const { projectId } = await params;

  // 요청 body에서 패널 인덱스와 설정 추출
  const body = await request.json().catch(() => ({})) as {
    panelIndex: number;
    style?: ImageStyle;
    apiProvider?: ImageProvider;
  };

  const panelIndex = body.panelIndex;
  const style: ImageStyle = body.style || 'cartoon';
  const apiProvider: ImageProvider = body.apiProvider === 'seedream' ? 'seedream' : 'gemini';

  if (panelIndex === undefined || panelIndex < 0) {
    return NextResponse.json({ error: '패널 인덱스가 필요합니다.' }, { status: 400 });
  }

  console.log('[movie][generate-panel][POST] 개별 패널 이미지 생성:', projectId, '패널:', panelIndex, '스타일:', style, '모델:', apiProvider);

  // 프로젝트, 캐릭터, 영상스크립트 정보 조회
  const { data: project, error: projectError } = await supabase
    .from('movie_projects')
    .select(`
      id,
      script,
      video_script,
      video_mode,
      grid_size,
      movie_characters (
        id,
        name,
        description,
        image_path
      ),
      movie_scenes (
        id,
        scene_index,
        start_panel_path,
        end_panel_path
      )
    `)
    .eq('id', projectId)
    .single();

  if (projectError || !project) {
    console.error('[movie][generate-panel][POST] 프로젝트 조회 실패:', projectError);
    return NextResponse.json({ error: '프로젝트를 찾을 수 없습니다.' }, { status: 404 });
  }

  const characters = project.movie_characters as Array<{
    id: string;
    name: string;
    description: string | null;
    image_path: string | null;
  }> || [];

  // video_script에서 패널 설명 추출
  interface PanelDesc {
    panelIndex: number;
    description: string;
    characters?: string[];
  }

  const videoScript = project.video_script as { panels?: PanelDesc[]; style?: string } | null;
  const panelDescriptions = videoScript?.panels || [];

  // 해당 패널 설명 찾기
  const panelDesc = panelDescriptions.find(p => p.panelIndex === panelIndex);
  if (!panelDesc) {
    return NextResponse.json({ error: `패널 ${panelIndex}의 설명을 찾을 수 없습니다. 먼저 컷 분석을 실행해주세요.` }, { status: 400 });
  }

  // 캐릭터 참조 이미지 다운로드 및 Base64 변환
  const characterParts: Array<{ text: string } | { inlineData: { data: string; mimeType: string } }> = [];
  const characterImageDataUrls: string[] = [];

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
            text: `위 이미지는 "${char.name}" 캐릭터입니다. 이 캐릭터의 외모를 일관되게 유지해주세요.`,
          });

          characterImageDataUrls.push(`data:${mimeType};base64,${base64}`);
        }
      } catch (err) {
        console.warn(`[movie][generate-panel] 캐릭터 이미지 로드 실패: ${char.name}`, err);
      }
    }
  }

  // 스타일 설명 구성
  const styleDescription = style === 'realistic'
    ? 'HYPER-REALISTIC photographic style. Must look like REAL photographs taken with a professional camera. Real human skin textures, pores, hair strands visible. Cinematic movie-quality lighting with natural shadows. Absolutely NO illustration or cartoon elements. Like frames from a Hollywood movie or high-end photography.'
    : 'Lookism-focused Korean webtoon style with highly idealized, beautiful character designs. Perfect facial features, flawless skin, attractive proportions, and emphasis on visual perfection. Characters should be exceptionally good-looking with stylized but realistic proportions. Like characters from popular Korean webtoons that emphasize appearance and visual appeal.';

  // 개별 패널 프롬프트 구성
  const promptText = `Create a SINGLE image for a short video panel.

PANEL DESCRIPTION:
- Scene: ${panelDesc.description}
- Characters: ${panelDesc.characters?.join(', ') || 'N/A'}

CHARACTERS (maintain visual consistency):
${characterDescriptions}

STYLE:
${styleDescription}

REQUIREMENTS:
1. Create a SINGLE panel image (NOT a grid)
2. Vertical format 9:16 aspect ratio (portrait orientation for mobile shorts)
3. High quality, cinematic composition
4. Match the panel description exactly
5. Maintain character appearance consistency

CRITICAL - NO TEXT OR SPEECH BUBBLES:
- Do NOT include any text, letters, words, or numbers in the image
- Do NOT include speech bubbles, dialogue boxes, or captions
- Do NOT include any written sound effects or onomatopoeia
- The image should be purely visual with NO textual elements

Create the single panel image now.`;

  console.log('[movie][generate-panel] 패널 프롬프트:', promptText.slice(0, 500));

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
    // 이미지 생성
    const result = apiProvider === 'seedream'
      ? await generateSeedreamImage({
          provider: 'seedream',
          prompt: promptText,
          images: characterImageDataUrls,
          size: '2K',
          timeoutMs: 120000, // 2분
        })
      : await generateGeminiImage({
          provider: 'gemini',
          model: 'gemini-3-pro-image-preview',
          contents,
          config: {
            responseModalities: ['IMAGE', 'TEXT'],
            imageConfig: {
              imageSize: '2K',
              aspectRatio: '9:16',
            },
          },
          timeoutMs: 120000, // 2분
        });

    // Supabase Storage에 패널 이미지 저장
    const panelFileName = `${projectId}/panel-${panelIndex}-${Date.now()}.png`;
    const panelBuffer = Buffer.from(result.base64, 'base64');

    const { error: uploadError } = await supabase.storage
      .from('movie-videos')
      .upload(panelFileName, panelBuffer, {
        contentType: 'image/png',
        upsert: true,
      });

    if (uploadError) {
      console.error('[movie][generate-panel] 이미지 업로드 실패:', uploadError);
      return NextResponse.json({ error: '이미지 저장에 실패했습니다.' }, { status: 500 });
    }

    const { data: panelUrlData } = supabase.storage
      .from('movie-videos')
      .getPublicUrl(panelFileName);

    const panelImagePath = panelUrlData.publicUrl;

    // movie_scenes 테이블에서 해당 패널에 대응하는 씬 업데이트
    // per-cut 모드: panelIndex = scene_index (start_panel_path만 업데이트)
    // cut-to-cut 모드: panelIndex = scene_index의 start_panel_path, 또는 scene_index-1의 end_panel_path
    const videoMode = project.video_mode || 'per-cut';
    const existingScenes = project.movie_scenes as Array<{
      id: string;
      scene_index: number;
      start_panel_path: string | null;
      end_panel_path: string | null;
    }> || [];

    if (videoMode === 'per-cut') {
      // per-cut 모드: 해당 패널 = 해당 씬의 start_panel
      const scene = existingScenes.find(s => s.scene_index === panelIndex);
      if (scene) {
        await supabase
          .from('movie_scenes')
          .update({ start_panel_path: panelImagePath })
          .eq('id', scene.id);
      } else {
        // 씬이 없으면 생성
        await supabase
          .from('movie_scenes')
          .insert({
            project_id: projectId,
            scene_index: panelIndex,
            start_panel_path: panelImagePath,
            end_panel_path: null,
            status: 'pending',
            duration: 4,
          });
      }
    } else {
      // cut-to-cut 모드:
      // panelIndex N → scene N의 start_panel_path
      // panelIndex N → scene N-1의 end_panel_path (N > 0인 경우)

      // 현재 패널을 시작으로 하는 씬 업데이트
      const startScene = existingScenes.find(s => s.scene_index === panelIndex);
      if (startScene) {
        await supabase
          .from('movie_scenes')
          .update({ start_panel_path: panelImagePath })
          .eq('id', startScene.id);
      }

      // 이전 씬의 end_panel로도 업데이트 (panelIndex > 0인 경우)
      if (panelIndex > 0) {
        const prevScene = existingScenes.find(s => s.scene_index === panelIndex - 1);
        if (prevScene) {
          await supabase
            .from('movie_scenes')
            .update({ end_panel_path: panelImagePath })
            .eq('id', prevScene.id);
        }
      }
    }

    console.log('[movie][generate-panel] 패널 생성 완료:', panelIndex, panelImagePath);

    return NextResponse.json({
      panelIndex,
      panelImagePath,
      prompt: promptText,
    });
  } catch (err) {
    console.error('[movie][generate-panel] 이미지 생성 실패:', err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : '이미지 생성에 실패했습니다.' },
      { status: 500 }
    );
  }
}
