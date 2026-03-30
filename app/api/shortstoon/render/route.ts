import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

const RELAY_URL = process.env.COMFYUI_RELAY_URL ?? 'https://api.rewardpang.com/thegrim-cms';

export async function POST(request: NextRequest) {
  const { blockId, aiMotionEnabled, aiMotionType, aiMotionPrompt } = await request.json();
  if (!blockId) return NextResponse.json({ error: 'blockId 필요' }, { status: 400 });

  const { data: block, error: bErr } = await supabase
    .from('shortstoon_blocks')
    .select('*')
    .eq('id', blockId)
    .single();
  if (bErr || !block) return NextResponse.json({ error: '블록 없음' }, { status: 404 });

  // DB status → rendering
  await supabase
    .from('shortstoon_blocks')
    .update({ status: 'rendering', error_message: null, updated_at: new Date().toISOString() })
    .eq('id', blockId);

  // AI 모션 활성 시 effect_type 오버라이드
  const effectType = aiMotionEnabled ? 'ai_motion' : (block.effect_type ?? 'none');
  const effectParams = aiMotionEnabled
    ? {
        motion_type: aiMotionType ?? 'blink',
        prompt: aiMotionPrompt ?? '',
        base_effect: block.effect_type ?? 'none',
        base_effect_params: block.effect_params ?? {},
      }
    : (block.effect_params ?? {});

  // Lightsail에 렌더링 위임 (fire & forget — await 없음)
  fetch(`${RELAY_URL}/ffmpeg/render-cut`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      block_id: blockId,
      image_url: block.image_url,
      viewport: block.viewport,
      effect_type: effectType,
      effect_params: effectParams,
      duration_ms: block.duration_ms ?? 3000,
      project_id: block.shortstoon_project_id,
      supabase_url: process.env.NEXT_PUBLIC_SUPABASE_URL,
      supabase_key: process.env.SUPABASE_SERVICE_ROLE_KEY,
    }),
  }).catch(e => console.error('[render] relay 호출 실패:', e));

  return NextResponse.json({ ...block, status: 'rendering' });
}
