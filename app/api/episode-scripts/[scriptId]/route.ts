import { NextRequest, NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';

// PATCH: 업데이트 (title/content)
// DELETE: 삭제
export async function PATCH(
  request: NextRequest,
  context: { params: Promise<{ scriptId: string }> }
) {
  const { scriptId } = await context.params;
  const body = await request.json().catch(() => null) as {
    title?: string;
    content?: string;
  } | null;

  if (!scriptId) {
    return NextResponse.json({ error: 'scriptId가 필요합니다.' }, { status: 400 });
  }

  if (!body || (!body.title && !body.content)) {
    return NextResponse.json({ error: '수정할 필드가 없습니다.' }, { status: 400 });
  }

  const updates: Record<string, unknown> = {};
  if (typeof body.title === 'string') updates.title = body.title.trim();
  if (typeof body.content === 'string') updates.content = body.content.trim();

  const { data, error } = await supabase
    .from('episode_scripts')
    .update({ ...updates, updated_at: new Date().toISOString() })
    .eq('id', scriptId)
    .select('*, storyboards:episode_script_storyboards(*)')
    .single();

  if (error) {
    console.error('[episode-scripts][PATCH] 수정 실패:', error);
    return NextResponse.json({ error: '스크립트 수정에 실패했습니다.' }, { status: 500 });
  }

  return NextResponse.json(data);
}

export async function DELETE(
  _request: NextRequest,
  context: { params: Promise<{ scriptId: string }> }
) {
  const { scriptId } = await context.params;

  if (!scriptId) {
    return NextResponse.json({ error: 'scriptId가 필요합니다.' }, { status: 400 });
  }

  const { error } = await supabase.from('episode_scripts').delete().eq('id', scriptId);

  if (error) {
    console.error('[episode-scripts][DELETE] 삭제 실패:', error);
    return NextResponse.json({ error: '스크립트 삭제에 실패했습니다.' }, { status: 500 });
  }

  return NextResponse.json({ success: true });
}

