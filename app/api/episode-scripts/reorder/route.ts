import { NextRequest, NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';

// POST: { scriptIds: string[] } => 순서대로 order_index 업데이트
export async function POST(request: NextRequest) {
  const body = await request.json().catch(() => null) as { scriptIds?: string[] } | null;
  const scriptIds = body?.scriptIds;

  if (!scriptIds || !Array.isArray(scriptIds) || scriptIds.length === 0) {
    return NextResponse.json({ error: 'scriptIds 배열이 필요합니다.' }, { status: 400 });
  }

  try {
    const updates = scriptIds.map((id, idx) =>
      supabase.from('episode_scripts').update({ order_index: idx }).eq('id', id)
    );

    const results = await Promise.all(updates);
    const hasError = results.find((r) => r.error);
    if (hasError?.error) {
      console.error('[episode-scripts][reorder] 업데이트 실패:', hasError.error);
      return NextResponse.json({ error: '순서 변경에 실패했습니다.' }, { status: 500 });
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('[episode-scripts][reorder] 오류:', error);
    return NextResponse.json({ error: '순서 변경 중 오류가 발생했습니다.' }, { status: 500 });
  }
}



