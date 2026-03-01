import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { initProviders, getProvider } from '@/lib/video-generation/registry';
import type { InputMode } from '@/lib/video-generation/providers';

export const maxDuration = 300; // 5분 (fal.ai 폴링 대기)

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

export async function POST(request: NextRequest) {
  let testId: string | null = null;

  try {
    const { projectId, provider: providerId, inputMode, cutIndices, prompt, duration, aspectRatio } = await request.json();

    if (!projectId || !providerId || !cutIndices?.length) {
      return NextResponse.json({ error: 'projectId, provider, cutIndices 필요' }, { status: 400 });
    }

    await initProviders();
    const provider = getProvider(providerId);

    // 1. DB에 테스트 레코드 생성
    const { data: test, error: insertError } = await supabase
      .from('webtoonanimation_video_tests')
      .insert({
        project_id: projectId,
        provider: providerId,
        input_mode: inputMode || 'single_image',
        prompt: prompt || '',
        input_cut_indices: cutIndices,
        duration_seconds: duration || provider.capabilities.durations[0],
        aspect_ratio: aspectRatio || '16:9',
        status: 'generating',
      })
      .select()
      .single();

    if (insertError) throw insertError;
    testId = test.id;

    // 2. 컷 이미지 다운로드
    const { data: cuts, error: cutsError } = await supabase
      .from('webtoonanimation_cuts')
      .select('order_index, file_path')
      .eq('project_id', projectId)
      .in('order_index', cutIndices)
      .order('order_index');

    if (cutsError) throw cutsError;
    if (!cuts?.length) throw new Error('컷 이미지를 찾을 수 없습니다');

    const mode = (inputMode || 'single_image') as InputMode;
    const images: { url: string; mimeType: string; role: 'start' | 'end' | 'reference' }[] = [];

    for (let i = 0; i < cuts.length; i++) {
      let role: 'start' | 'end' | 'reference' = 'reference';
      if (mode === 'start_end_frame') {
        role = i === 0 ? 'start' : i === cuts.length - 1 ? 'end' : 'reference';
      } else if (mode === 'single_image') {
        role = i === 0 ? 'start' : 'reference';
      }

      images.push({ url: cuts[i].file_path, mimeType: 'image/png', role });
    }

    // 3. Provider 호출
    console.log(`[generate-test-video] ${providerId} 호출 (mode: ${mode}, cuts: ${cutIndices.join(',')}, ${duration}s)`);

    const result = await provider.generate({
      provider: providerId,
      prompt: prompt || 'Cinematic animation of the scene with subtle motion.',
      inputMode: mode,
      images,
      duration: duration || provider.capabilities.durations[0],
      aspectRatio: aspectRatio || '16:9',
    });

    // 4. Storage 업로드
    const videoBuffer = Buffer.from(result.videoBase64, 'base64');
    const storagePath = `webtoonanimation/${projectId}/test-${testId}-${Date.now()}.mp4`;

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

    // 5. 상태 업데이트
    const { data: updated, error: updateError } = await supabase
      .from('webtoonanimation_video_tests')
      .update({
        status: 'completed',
        video_path: storagePath,
        video_url: publicUrl,
        elapsed_ms: result.elapsedMs,
      })
      .eq('id', testId)
      .select()
      .single();

    if (updateError) throw updateError;

    console.log(`[generate-test-video] 완료 (${providerId}, ${result.elapsedMs}ms)`);
    return NextResponse.json(updated);
  } catch (error) {
    console.error('[generate-test-video] 실패:', error);

    if (testId) {
      await supabase
        .from('webtoonanimation_video_tests')
        .update({
          status: 'failed',
          error_message: error instanceof Error ? error.message : '영상 생성 실패',
        })
        .eq('id', testId);
    }

    return NextResponse.json(
      { error: error instanceof Error ? error.message : '영상 생성 실패' },
      { status: 500 }
    );
  }
}
