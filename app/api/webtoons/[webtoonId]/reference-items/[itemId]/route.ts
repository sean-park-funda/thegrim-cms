import { NextRequest, NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';

type Params = Promise<{ webtoonId: string; itemId: string }> | { webtoonId: string; itemId: string };

// 아이템 삭제
export async function DELETE(_req: NextRequest, { params }: { params: Params }) {
  const { webtoonId, itemId } = await Promise.resolve(params);

  const { data: item, error: fetchError } = await supabase
    .from('reference_items')
    .select('storage_path, webtoon_id')
    .eq('id', itemId)
    .eq('webtoon_id', webtoonId)
    .single();

  if (fetchError || !item) {
    return NextResponse.json({ error: '아이템을 찾을 수 없습니다.' }, { status: 404 });
  }

  // Storage 삭제
  await supabase.storage.from('webtoon-files').remove([item.storage_path]);

  // DB 삭제
  const { error } = await supabase.from('reference_items').delete().eq('id', itemId);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ success: true });
}

// 아이템 수정 (이름/설명/태그)
export async function PATCH(request: NextRequest, { params }: { params: Params }) {
  const { webtoonId, itemId } = await Promise.resolve(params);
  const body = await request.json().catch(() => ({})) as {
    name?: string;
    description?: string;
    tags?: string[];
  };

  const { data, error } = await supabase
    .from('reference_items')
    .update({ ...body })
    .eq('id', itemId)
    .eq('webtoon_id', webtoonId)
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data);
}
