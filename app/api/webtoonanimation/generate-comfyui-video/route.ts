import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

export const maxDuration = 300;

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

// Mac Mini 릴레이 서버 URL (Cloudflare Tunnel로 공개)
const RELAY_URL = process.env.COMFYUI_RELAY_URL;
const RELAY_SECRET = process.env.COMFYUI_RELAY_SECRET;

/**
 * POST: start_frame + end_frame → Mac Mini 릴레이 → 5090 PC Wan 2.2 → 영상
 * { cutId, seed? }
 */
export async function POST(request: NextRequest) {
  try {
    if (!RELAY_URL || !RELAY_SECRET) {
      return NextResponse.json(
        { error: 'COMFYUI_RELAY_URL / COMFYUI_RELAY_SECRET 환경변수가 설정되지 않았습니다.' },
        { status: 500 }
      );
    }

    const { cutId, seed: inputSeed } = await request.json();
    if (!cutId) return NextResponse.json({ error: 'cutId 필요' }, { status: 400 });

    const { data: cut, error: cutError } = await supabase
      .from('webtoonanimation_cuts')
      .select('*')
      .eq('id', cutId)
      .single();

    if (cutError || !cut) return NextResponse.json({ error: '컷을 찾을 수 없습니다' }, { status: 404 });
    if (!cut.video_prompt) {
      return NextResponse.json({ error: 'video_prompt를 먼저 작성해주세요' }, { status: 400 });
    }

    const frameRole: string = cut.frame_role || 'end';
    const isMidRef = frameRole === 'middle';

    const startUrl = cut.start_frame_url;
    const endUrl = isMidRef ? cut.start_frame_url : cut.end_frame_url;

    if (!startUrl) {
      return NextResponse.json({ error: '앵커 프레임을 먼저 생성해주세요' }, { status: 400 });
    }
    if (!isMidRef && !cut.end_frame_url) {
      return NextResponse.json({ error: '나머지 프레임을 먼저 생성해주세요' }, { status: 400 });
    }

    const seed = inputSeed ?? Math.floor(Math.random() * 999999999);
    const prefix = `cut_${cutId.slice(0, 8)}_${seed}`;
    const storagePath = `webtoonanimation/${cut.project_id}/${cutId}/comfyui_${seed}.mp4`;

    // Mac Mini 릴레이에 요청
    const relayRes = await fetch(`${RELAY_URL}/generate-video`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${RELAY_SECRET}`,
      },
      body: JSON.stringify({
        startUrl,
        endUrl: endUrl!,
        prompt: cut.video_prompt,
        seed,
        prefix,
        storagePath,
        supabaseUrl: process.env.NEXT_PUBLIC_SUPABASE_URL!,
        supabaseKey: process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      }),
    });

    if (!relayRes.ok) {
      const errData = await relayRes.json().catch(() => ({ error: '릴레이 오류' }));
      return NextResponse.json(
        { error: (errData as { error?: string }).error || '릴레이 서버 오류' },
        { status: 500 }
      );
    }

    const result = await relayRes.json() as { video_url: string; seed: number; prompt_id: string };

    // DB 저장
    await supabase
      .from('webtoonanimation_cuts')
      .update({ comfyui_video_url: result.video_url })
      .eq('id', cutId);

    return NextResponse.json(result);
  } catch (error) {
    console.error('[generate-comfyui-video] 실패:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : '영상 생성 실패' },
      { status: 500 }
    );
  }
}
