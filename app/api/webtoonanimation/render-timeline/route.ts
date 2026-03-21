import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

export const maxDuration = 60;

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

const RELAY_URL = process.env.COMFYUI_RELAY_URL;

export async function POST(request: NextRequest) {
  try {
    if (!RELAY_URL) {
      return NextResponse.json({ error: 'COMFYUI_RELAY_URL 환경변수가 설정되지 않았습니다.' }, { status: 500 });
    }

    const { projectId, items } = await request.json();
    if (!projectId || !Array.isArray(items) || items.length === 0) {
      return NextResponse.json({ error: 'projectId와 items가 필요합니다' }, { status: 400 });
    }

    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
    const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
    const storagePath = `webtoonanimation/${projectId}/timeline_${Date.now()}.mp4`;

    // DB의 기존 렌더 URL 초기화 (폴링 시 이전 결과와 혼동 방지)
    await supabase
      .from('webtoonanimation_projects')
      .update({ timeline_rendered_url: null })
      .eq('id', projectId);

    const relayRes = await fetch(`${RELAY_URL}/comfyui/render-timeline`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        project_id: projectId,
        items,
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

    return NextResponse.json({ polling: true, storagePath });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : '렌더링 요청 실패' },
      { status: 500 }
    );
  }
}
