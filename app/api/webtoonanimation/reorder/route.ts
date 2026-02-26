import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

export async function PUT(request: NextRequest) {
  try {
    const body = await request.json();
    const { cutIds } = body as { cutIds: string[] };

    if (!cutIds || !Array.isArray(cutIds)) {
      return NextResponse.json(
        { error: 'cutIds 배열이 필요합니다.' },
        { status: 400 }
      );
    }

    const updates = cutIds.map((id, index) =>
      supabase
        .from('webtoonanimation_cuts')
        .update({ order_index: index })
        .eq('id', id)
    );

    await Promise.all(updates);

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('[webtoonanimation/reorder] 순서 변경 실패:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : '순서 변경 실패' },
      { status: 500 }
    );
  }
}
