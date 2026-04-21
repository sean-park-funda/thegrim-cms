import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

export const maxDuration = 300; // 5분 (fal.ai 폴링 대기)

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

const FAL_KEY = process.env.FAL_KEY || '';
const FAL_BASE = 'https://queue.fal.run';
const ENDPOINT = 'bytedance/seedance-2.0/image-to-video';

async function falRequest(payload: Record<string, unknown>): Promise<Record<string, unknown>> {
  const log = (msg: string) => console.log(`[seedance2] ${msg}`);

  const submitRes = await fetch(`${FAL_BASE}/${ENDPOINT}`, {
    method: 'POST',
    headers: { 'Authorization': `Key ${FAL_KEY}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });

  if (!submitRes.ok) {
    const err = await submitRes.text();
    throw new Error(`fal.ai submit failed (${submitRes.status}): ${err.slice(0, 500)}`);
  }

  const submitData = await submitRes.json() as Record<string, unknown>;
  const requestId = submitData.request_id as string;
  const initStatus = submitData.status as string;
  const statusUrl = (submitData.status_url as string) || `${FAL_BASE}/${ENDPOINT}/requests/${requestId}/status`;
  const responseUrl = (submitData.response_url as string) || `${FAL_BASE}/${ENDPOINT}/requests/${requestId}`;

  log(`submitted request_id=${requestId}, status=${initStatus}`);

  if (!requestId) throw new Error(`fal.ai: no request_id in response`);

  if (initStatus === 'COMPLETED') {
    const resultRes = await fetch(responseUrl, { headers: { 'Authorization': `Key ${FAL_KEY}` } });
    return resultRes.json();
  }

  // Poll until done
  const timeout = Date.now() + 270000; // 4.5분 (maxDuration 여유)
  let pollCount = 0;
  while (Date.now() < timeout) {
    await new Promise((r) => setTimeout(r, 5000));
    pollCount++;

    const statusRes = await fetch(statusUrl, { headers: { 'Authorization': `Key ${FAL_KEY}` } });
    const statusData = await statusRes.json() as Record<string, unknown>;
    log(`poll #${pollCount}: status=${statusData.status}`);

    if (statusData.status === 'COMPLETED') {
      const resultRes = await fetch(responseUrl, { headers: { 'Authorization': `Key ${FAL_KEY}` } });
      return resultRes.json();
    }
    if (statusData.status === 'FAILED') {
      throw new Error(`fal.ai failed: ${statusData.error || JSON.stringify(statusData).slice(0, 300)}`);
    }
  }

  throw new Error('Seedance 2.0 타임아웃 (4.5분)');
}

/**
 * POST { cutId }
 * → fal.ai Seedance 2.0 I2V 호출 (시작+끝 프레임 보간)
 * → Supabase Storage 업로드 후 comfyui_video_url 업데이트
 */
export async function POST(request: NextRequest) {
  try {
    if (!FAL_KEY) {
      return NextResponse.json({ error: 'FAL_KEY 환경변수가 설정되지 않았습니다.' }, { status: 500 });
    }

    const { cutId } = await request.json();
    if (!cutId) return NextResponse.json({ error: 'cutId 필요' }, { status: 400 });

    const { data: cut, error: cutError } = await supabase
      .from('webtoonanimation_cuts')
      .select('*')
      .eq('id', cutId)
      .single();

    if (cutError || !cut) return NextResponse.json({ error: '컷을 찾을 수 없습니다' }, { status: 404 });
    if (!cut.video_prompt) return NextResponse.json({ error: 'video_prompt를 먼저 작성해주세요' }, { status: 400 });
    if (!cut.start_frame_url) return NextResponse.json({ error: '앵커 프레임을 먼저 생성해주세요' }, { status: 400 });

    const isMidRef = (cut.frame_role || 'end') === 'middle';
    const startUrl: string = cut.start_frame_url;
    const endUrl: string | null = isMidRef ? cut.start_frame_url : (cut.end_frame_url || null);

    if (!isMidRef && !endUrl) {
      return NextResponse.json({ error: '나머지 프레임을 먼저 생성해주세요' }, { status: 400 });
    }

    const duration: number = cut.video_duration || 5;
    // Seedance 2.0 허용값: 'auto', '4'~'15' (숫자 문자열, 's' 없음)
    const clampedDuration = Math.min(15, Math.max(4, duration));
    const seedanceDuration = String(clampedDuration);
    const aspectRatio: string = cut.aspect_ratio || '16:9';

    // 기존 영상 history에 보존
    const prevUrl = cut.comfyui_video_url;
    const prevHistory: string[] = Array.isArray(cut.video_history) ? cut.video_history : [];
    const newHistory = prevUrl ? [prevUrl, ...prevHistory] : prevHistory;
    await supabase
      .from('webtoonanimation_cuts')
      .update({ comfyui_video_url: null, video_history: newHistory })
      .eq('id', cutId);

    // fal.ai 호출
    const payload: Record<string, unknown> = {
      prompt: cut.video_prompt,
      image_url: startUrl,
      duration: seedanceDuration,
      aspect_ratio: aspectRatio,
    };
    if (endUrl && !isMidRef) {
      payload.end_image_url = endUrl;
    }

    console.log(`[seedance2] cut=${cutId}, duration=${seedanceDuration}, aspect=${aspectRatio}`);
    const result = await falRequest(payload) as Record<string, unknown>;

    // fal.ai 에러 응답 처리
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const r = result as any;
    if (r.detail) {
      const detail = r.detail;
      if (typeof detail === 'string') throw new Error(`Seedance 2.0: ${detail}`);
      if (Array.isArray(detail) && detail[0]?.msg) throw new Error(`Seedance 2.0: ${detail[0].msg}`);
      throw new Error(`Seedance 2.0: ${JSON.stringify(detail).slice(0, 300)}`);
    }

    // 영상 URL 추출
    const videoUrl: string | undefined =
      r.video?.url || (Array.isArray(r.video) && r.video[0]?.url) ||
      (Array.isArray(r.videos) && r.videos[0]?.url) || r.url;

    if (!videoUrl) {
      throw new Error(`Seedance 2.0: 영상 URL을 찾을 수 없습니다. Keys: ${Object.keys(result).join(', ')}, Snapshot: ${JSON.stringify(result).slice(0, 300)}`);
    }

    // 영상 다운로드 → Supabase Storage 업로드
    const videoRes = await fetch(videoUrl);
    if (!videoRes.ok) throw new Error(`영상 다운로드 실패: ${videoRes.status}`);
    const videoBuffer = Buffer.from(await videoRes.arrayBuffer());

    const seed = Math.floor(Math.random() * 999999999);
    const storagePath = `webtoonanimation/${cut.project_id}/${cutId}/seedance2_${seed}.mp4`;

    const { error: uploadError } = await supabase.storage
      .from('webtoon-files')
      .upload(storagePath, videoBuffer, { contentType: 'video/mp4', upsert: false });

    if (uploadError) throw uploadError;

    const { data: { publicUrl } } = supabase.storage
      .from('webtoon-files')
      .getPublicUrl(storagePath);

    // DB 업데이트
    await supabase
      .from('webtoonanimation_cuts')
      .update({ comfyui_video_url: publicUrl })
      .eq('id', cutId);

    console.log(`[seedance2] 완료 cut=${cutId}`);
    return NextResponse.json({ video_url: publicUrl });
  } catch (error) {
    console.error('[seedance2] 실패:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : '영상 생성 실패' },
      { status: 500 }
    );
  }
}
