import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

export const maxDuration = 300;

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

// Lightsail 릴레이: https://api.rewardpang.com/thegrim-cms
const RELAY_URL = process.env.COMFYUI_RELAY_URL;

export async function POST(request: NextRequest) {
  try {
    if (!RELAY_URL) {
      return NextResponse.json({ error: 'COMFYUI_RELAY_URL 환경변수가 설정되지 않았습니다.' }, { status: 500 });
    }

    const { cutId, seed: inputSeed } = await request.json();
    if (!cutId) return NextResponse.json({ error: 'cutId 필요' }, { status: 400 });

    const { data: cut, error: cutError } = await supabase
      .from('webtoonanimation_cuts')
      .select('*')
      .eq('id', cutId)
      .single();

    if (cutError || !cut) return NextResponse.json({ error: '컷을 찾을 수 없습니다' }, { status: 404 });
    if (!cut.video_prompt) return NextResponse.json({ error: 'video_prompt를 먼저 작성해주세요' }, { status: 400 });

    const frameRole: string = cut.frame_role || 'end';
    const isMidRef = frameRole === 'middle';
    const startUrl = cut.start_frame_url;
    const endUrl = isMidRef ? cut.start_frame_url : cut.end_frame_url;

    if (!startUrl) return NextResponse.json({ error: '앵커 프레임을 먼저 생성해주세요' }, { status: 400 });
    if (!isMidRef && !cut.end_frame_url) return NextResponse.json({ error: '나머지 프레임을 먼저 생성해주세요' }, { status: 400 });

    const seed = inputSeed ?? Math.floor(Math.random() * 999999999);
    const prefix = `cut_${cutId.slice(0, 8)}_${seed}`;
    const storagePath = `webtoonanimation/${cut.project_id}/${cutId}/comfyui_${seed}.mp4`;

    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
    const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;

    // Lightsail 릴레이 호출 (snake_case)
    const relayRes = await fetch(`${RELAY_URL}/comfyui/generate-video`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        start_url: startUrl,
        end_url: endUrl!,
        prompt: cut.video_prompt,
        seed,
        prefix,
        storage_path: storagePath,
        supabase_url: supabaseUrl,
        supabase_key: supabaseKey,
      }),
    });

    if (!relayRes.ok) {
      const errData = await relayRes.json().catch(() => ({ detail: '릴레이 오류' }));
      return NextResponse.json(
        { error: (errData as { detail?: string }).detail || '릴레이 서버 오류' },
        { status: 500 }
      );
    }

    const result = await relayRes.json() as { video_url: string; seed: number; prompt_id: string };

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
