import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { initProviders, getProvider } from '@/lib/video-generation/registry';

export const maxDuration = 300;

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

/**
 * POST: 무빙웹툰 개별 컷 영상 생성
 */
export async function POST(request: NextRequest) {
  let mwCutId: string | null = null;

  try {
    const { cutId, prompt: customPrompt, provider: customProvider } = await request.json();

    if (!cutId) {
      return NextResponse.json({ error: 'cutId 필요' }, { status: 400 });
    }

    // 1. 무빙웹툰 컷 정보 조회
    const { data: mwCut, error: cutError } = await supabase
      .from('moving_webtoon_cuts')
      .select('*, moving_webtoon_projects(*)')
      .eq('id', cutId)
      .single();

    if (cutError || !mwCut) {
      return NextResponse.json({ error: '컷을 찾을 수 없습니다' }, { status: 404 });
    }

    mwCutId = mwCut.id;
    const project = mwCut.moving_webtoon_projects;
    const providerId = customProvider || mwCut.provider || project.default_provider || 'kling-o3-pro';
    const prompt = customPrompt || mwCut.prompt;

    if (!prompt) {
      return NextResponse.json({ error: '프롬프트가 필요합니다' }, { status: 400 });
    }

    // 2. 원본 컷 이미지 URL 가져오기
    const { data: originalCut, error: origError } = await supabase
      .from('webtoonanimation_cuts')
      .select('file_path')
      .eq('id', mwCut.cut_id)
      .single();

    if (origError || !originalCut) {
      return NextResponse.json({ error: '원본 컷 이미지를 찾을 수 없습니다' }, { status: 404 });
    }

    // 3. 상태 업데이트 → generating
    await supabase
      .from('moving_webtoon_cuts')
      .update({ status: 'generating', error_message: null, updated_at: new Date().toISOString() })
      .eq('id', mwCutId);

    // 4. Provider 호출
    await initProviders();
    const provider = getProvider(providerId);

    const startTime = Date.now();

    const result = await provider.generate({
      provider: providerId,
      prompt,
      inputMode: 'single_image',
      images: [{ url: originalCut.file_path, mimeType: 'image/png', role: 'start' }],
      duration: mwCut.duration_seconds || 3,
      aspectRatio: mwCut.aspect_ratio || '9:16',
    });

    const elapsedMs = Date.now() - startTime;

    // 5. Storage 업로드
    const videoBuffer = Buffer.from(result.videoBase64, 'base64');
    const storagePath = `webtoonanimation/${project.project_id}/mw-${mwCutId}-${Date.now()}.mp4`;

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

    // 6. 상태 업데이트 → completed
    const { data: updated, error: updateError } = await supabase
      .from('moving_webtoon_cuts')
      .update({
        status: 'completed',
        video_path: storagePath,
        video_url: publicUrl,
        elapsed_ms: elapsedMs,
        provider: providerId,
        prompt,
        updated_at: new Date().toISOString(),
      })
      .eq('id', mwCutId)
      .select()
      .single();

    if (updateError) throw updateError;

    console.log(`[moving-webtoon/generate] 완료 (${providerId}, ${elapsedMs}ms)`);
    return NextResponse.json(updated);
  } catch (error) {
    console.error('[moving-webtoon/generate] 실패:', error);

    if (mwCutId) {
      await supabase
        .from('moving_webtoon_cuts')
        .update({
          status: 'failed',
          error_message: error instanceof Error ? error.message : '영상 생성 실패',
          updated_at: new Date().toISOString(),
        })
        .eq('id', mwCutId);
    }

    return NextResponse.json(
      { error: error instanceof Error ? error.message : '영상 생성 실패' },
      { status: 500 }
    );
  }
}
