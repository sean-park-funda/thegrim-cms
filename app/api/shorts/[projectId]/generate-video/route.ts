import { NextRequest, NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';
import { generateVeoVideo } from '@/lib/video-generation/veo';

// POST: /api/shorts/[projectId]/generate-video - Veo 영상 생성
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ projectId: string }> }
) {
  const { projectId } = await params;
  console.log('[shorts][generate-video][POST] 영상 생성:', projectId);

  const body = await request.json().catch(() => null) as {
    sceneIndex?: number;
  } | null;

  // sceneIndex가 지정되면 해당 씬만, 아니면 모든 씬 생성
  const targetSceneIndex = body?.sceneIndex;

  // 프로젝트와 씬 정보 조회
  const { data: project, error: projectError } = await supabase
    .from('shorts_projects')
    .select(`
      id,
      script,
      video_script,
      shorts_scenes (
        id,
        scene_index,
        start_panel_path,
        end_panel_path,
        video_prompt,
        status
      )
    `)
    .eq('id', projectId)
    .single();

  if (projectError || !project) {
    console.error('[shorts][generate-video][POST] 프로젝트 조회 실패:', projectError);
    return NextResponse.json({ error: '프로젝트를 찾을 수 없습니다.' }, { status: 404 });
  }

  // video_script에서 영상 프롬프트 추출 (백업용)
  interface VideoSceneDesc {
    sceneIndex: number;
    veoPrompt: string;
  }
  const videoScript = project.video_script as { scenes?: VideoSceneDesc[] } | null;
  const videoScenePrompts = videoScript?.scenes || [];

  let scenes = project.shorts_scenes as Array<{
    id: string;
    scene_index: number;
    start_panel_path: string | null;
    end_panel_path: string | null;
    video_prompt: string | null;
    status: string;
  }> || [];

  if (scenes.length === 0) {
    return NextResponse.json({ error: '먼저 그리드 이미지를 생성해주세요.' }, { status: 400 });
  }

  // 특정 씬만 생성하는 경우 필터링
  if (targetSceneIndex !== undefined) {
    scenes = scenes.filter(s => s.scene_index === targetSceneIndex);
    if (scenes.length === 0) {
      return NextResponse.json({ error: '해당 씬을 찾을 수 없습니다.' }, { status: 404 });
    }
  }

  // 프로젝트 상태 업데이트
  await supabase
    .from('shorts_projects')
    .update({ status: 'video_generating' })
    .eq('id', projectId);

  const results: Array<{
    sceneIndex: number;
    success: boolean;
    videoPath?: string;
    error?: string;
  }> = [];

  for (const scene of scenes) {
    console.log(`[shorts][generate-video] 씬 ${scene.scene_index} 생성 시작`);

    // 씬 상태 업데이트
    await supabase
      .from('shorts_scenes')
      .update({ status: 'generating', error_message: null })
      .eq('id', scene.id);

    try {
      if (!scene.start_panel_path) {
        throw new Error('시작 패널 이미지가 없습니다.');
      }

      // video_prompt가 없으면 video_script에서 가져오기
      let videoPrompt = scene.video_prompt;
      if (!videoPrompt) {
        const scriptScene = videoScenePrompts.find(s => s.sceneIndex === scene.scene_index);
        videoPrompt = scriptScene?.veoPrompt || null;
      }

      if (!videoPrompt) {
        throw new Error('영상 프롬프트가 없습니다. 먼저 스크립트를 생성해주세요.');
      }

      console.log('='.repeat(80));
      console.log(`[shorts][generate-video] 씬 ${scene.scene_index} Veo 프롬프트:`);
      console.log('='.repeat(80));
      console.log(videoPrompt);
      console.log('='.repeat(80));

      // 시작 패널 이미지 다운로드 (첫 프레임)
      const startPanelResponse = await fetch(scene.start_panel_path);
      if (!startPanelResponse.ok) {
        throw new Error('시작 패널 이미지를 불러올 수 없습니다.');
      }

      const startPanelBuffer = await startPanelResponse.arrayBuffer();
      const startPanelBase64 = Buffer.from(startPanelBuffer).toString('base64');
      const startPanelMimeType = startPanelResponse.headers.get('content-type') || 'image/png';

      // 끝 패널 이미지 다운로드 (마지막 프레임)
      let endPanelBase64: string | undefined;
      let endPanelMimeType: string | undefined;
      if (scene.end_panel_path) {
        const endPanelResponse = await fetch(scene.end_panel_path);
        if (endPanelResponse.ok) {
          const endPanelBuffer = await endPanelResponse.arrayBuffer();
          endPanelBase64 = Buffer.from(endPanelBuffer).toString('base64');
          endPanelMimeType = endPanelResponse.headers.get('content-type') || 'image/png';
          console.log(`[shorts][generate-video] 씬 ${scene.scene_index} 끝 프레임 로드 완료`);
        }
      }

      // Veo 영상 생성 (시작 프레임 + 끝 프레임)
      const result = await generateVeoVideo({
        prompt: videoPrompt,
        startImageBase64: startPanelBase64,
        startImageMimeType: startPanelMimeType,
        endImageBase64: endPanelBase64,
        endImageMimeType: endPanelMimeType,
        config: {
          aspectRatio: '9:16', // 쇼츠용 세로 비율
        },
        timeoutMs: 600000, // 10분
        pollIntervalMs: 15000, // 15초마다 폴링
      });

      // 영상 저장
      const videoFileName = `${projectId}/video-scene-${scene.scene_index}-${Date.now()}.mp4`;
      const videoBuffer = Buffer.from(result.videoBase64, 'base64');

      const { error: uploadError } = await supabase.storage
        .from('shorts-videos')
        .upload(videoFileName, videoBuffer, {
          contentType: 'video/mp4',
          upsert: true,
        });

      if (uploadError) {
        throw new Error(`영상 저장 실패: ${uploadError.message}`);
      }

      const { data: videoUrlData } = supabase.storage
        .from('shorts-videos')
        .getPublicUrl(videoFileName);

      // 씬 업데이트
      await supabase
        .from('shorts_scenes')
        .update({
          video_path: videoUrlData.publicUrl,
          video_storage_path: videoFileName,
          status: 'completed',
        })
        .eq('id', scene.id);

      results.push({
        sceneIndex: scene.scene_index,
        success: true,
        videoPath: videoUrlData.publicUrl,
      });

      console.log(`[shorts][generate-video] 씬 ${scene.scene_index} 생성 완료`);
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : '영상 생성 실패';
      console.error(`[shorts][generate-video] 씬 ${scene.scene_index} 생성 실패:`, err);

      await supabase
        .from('shorts_scenes')
        .update({
          status: 'error',
          error_message: errorMessage,
        })
        .eq('id', scene.id);

      results.push({
        sceneIndex: scene.scene_index,
        success: false,
        error: errorMessage,
      });
    }
  }

  // 모든 씬이 완료되었는지 확인
  const { data: allScenes } = await supabase
    .from('shorts_scenes')
    .select('status')
    .eq('project_id', projectId);

  const allCompleted = allScenes?.every(s => s.status === 'completed');
  const hasError = allScenes?.some(s => s.status === 'error');

  await supabase
    .from('shorts_projects')
    .update({
      status: allCompleted ? 'completed' : hasError ? 'error' : 'video_generating',
    })
    .eq('id', projectId);

  return NextResponse.json({
    results,
    allCompleted,
    message: allCompleted
      ? '모든 영상이 생성되었습니다.'
      : hasError
        ? '일부 영상 생성에 실패했습니다.'
        : '영상 생성이 진행 중입니다.',
  });
}
