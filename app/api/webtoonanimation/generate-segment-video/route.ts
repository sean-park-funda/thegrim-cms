import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { generateVeoVideo } from '@/lib/video-generation/veo';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

/**
 * POST: 단일 세그먼트의 영상을 Veo API로 생성
 * 입력: { segmentId }
 * 동작: start/end 컷 이미지 다운로드 → Veo API → Supabase Storage 저장
 */
export async function POST(request: NextRequest) {
  try {
    const { segmentId } = await request.json();

    if (!segmentId) {
      return NextResponse.json({ error: 'segmentId 필요' }, { status: 400 });
    }

    // 1. 세그먼트 조회
    const { data: segment, error: segError } = await supabase
      .from('webtoonanimation_video_segments')
      .select('*')
      .eq('id', segmentId)
      .single();

    if (segError) throw segError;
    if (!segment) {
      return NextResponse.json({ error: '세그먼트를 찾을 수 없습니다' }, { status: 404 });
    }

    // 2. 상태를 generating으로 변경
    await supabase
      .from('webtoonanimation_video_segments')
      .update({ status: 'generating', error_message: null })
      .eq('id', segmentId);

    // 3. group에서 project_id 조회
    const { data: group } = await supabase
      .from('webtoonanimation_prompt_groups')
      .select('project_id')
      .eq('id', segment.group_id)
      .single();

    if (!group) {
      throw new Error('그룹을 찾을 수 없습니다');
    }

    // 4. 시작/끝 컷 이미지 다운로드
    const { data: startCut } = await supabase
      .from('webtoonanimation_cuts')
      .select('file_path')
      .eq('project_id', group.project_id)
      .eq('order_index', segment.start_cut_index)
      .single();

    if (!startCut) throw new Error(`시작 컷(${segment.start_cut_index})을 찾을 수 없습니다`);

    const startRes = await fetch(startCut.file_path);
    if (!startRes.ok) throw new Error('시작 이미지 다운로드 실패');
    const startBase64 = Buffer.from(await startRes.arrayBuffer()).toString('base64');

    let endBase64: string | undefined;
    if (segment.end_cut_index !== null) {
      const { data: endCut } = await supabase
        .from('webtoonanimation_cuts')
        .select('file_path')
        .eq('project_id', group.project_id)
        .eq('order_index', segment.end_cut_index)
        .single();

      if (endCut) {
        const endRes = await fetch(endCut.file_path);
        if (endRes.ok) {
          endBase64 = Buffer.from(await endRes.arrayBuffer()).toString('base64');
        }
      }
    }

    // 5. Veo API 호출
    const veoAspect = segment.aspect_ratio === '9:16' ? '9:16' : '16:9';
    const veoDuration = ([4, 6, 8].includes(segment.duration_seconds) ? segment.duration_seconds : 4) as 4 | 6 | 8;

    console.log(`[generate-segment-video] Veo 호출 (seg: ${segment.segment_index}, ${veoDuration}초, ${veoAspect})`);

    const result = await generateVeoVideo({
      prompt: segment.prompt || 'Smooth cinematic transition between keyframes.',
      startImageBase64: startBase64,
      startImageMimeType: 'image/png',
      endImageBase64: endBase64,
      endImageMimeType: 'image/png',
      config: {
        aspectRatio: veoAspect,
        durationSeconds: veoDuration,
        personGeneration: 'allow_adult',
      },
    });

    // 6. 영상을 Supabase Storage에 저장
    const videoBuffer = Buffer.from(result.videoBase64, 'base64');
    const storagePath = `webtoonanimation/${group.project_id}/segment-${segment.group_id}-${segment.segment_index}-${Date.now()}.mp4`;

    const { error: uploadError } = await supabase.storage
      .from('webtoon-files')
      .upload(storagePath, videoBuffer, {
        contentType: 'video/mp4',
        cacheControl: '3600',
        upsert: false,
      });

    if (uploadError) throw uploadError;

    const { data: { publicUrl } } = supabase.storage
      .from('webtoon-files')
      .getPublicUrl(storagePath);

    // 7. 상태 업데이트
    const { data: updated, error: updateError } = await supabase
      .from('webtoonanimation_video_segments')
      .update({
        status: 'completed',
        video_path: storagePath,
        video_url: publicUrl,
      })
      .eq('id', segmentId)
      .select()
      .single();

    if (updateError) throw updateError;

    console.log(`[generate-segment-video] 완료 (seg: ${segment.segment_index}, ${result.elapsedMs}ms)`);

    return NextResponse.json(updated);
  } catch (error) {
    console.error('[generate-segment-video] 실패:', error);

    // 실패 시 상태 업데이트
    const body = await request.clone().json().catch(() => ({}));
    if (body.segmentId) {
      await supabase
        .from('webtoonanimation_video_segments')
        .update({
          status: 'failed',
          error_message: error instanceof Error ? error.message : '영상 생성 실패',
        })
        .eq('id', body.segmentId);
    }

    return NextResponse.json(
      { error: error instanceof Error ? error.message : '영상 생성 실패' },
      { status: 500 }
    );
  }
}
