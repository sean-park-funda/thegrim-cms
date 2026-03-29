import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

// GET: 프로젝트 목록 or 특정 프로젝트 + 블록
export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const projectId = searchParams.get('projectId');

  if (projectId) {
    const { data: project, error: pErr } = await supabase
      .from('shortstoon_projects')
      .select('*')
      .eq('id', projectId)
      .single();
    if (pErr) return NextResponse.json({ error: pErr.message }, { status: 404 });

    const { data: blocks, error: bErr } = await supabase
      .from('shortstoon_blocks')
      .select('*')
      .eq('shortstoon_project_id', projectId)
      .order('order_index', { ascending: true });
    if (bErr) return NextResponse.json({ error: bErr.message }, { status: 500 });

    return NextResponse.json({ ...project, blocks: blocks ?? [] });
  }

  // 목록
  const { data, error } = await supabase
    .from('shortstoon_projects')
    .select('*')
    .order('created_at', { ascending: false });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data);
}

// POST: 프로젝트 생성 | 블록 순서 변경 | 블록 삭제
export async function POST(request: NextRequest) {
  const body = await request.json();
  const { action } = body;

  if (action === 'create_project') {
    const { name } = body;
    const { data, error } = await supabase
      .from('shortstoon_projects')
      .insert({ name: name || '새 숏스툰' })
      .select()
      .single();
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json(data, { status: 201 });
  }

  if (action === 'reorder_blocks') {
    const { blockOrders } = body; // [{ id, order_index }]
    for (const { id, order_index } of blockOrders) {
      await supabase
        .from('shortstoon_blocks')
        .update({ order_index, updated_at: new Date().toISOString() })
        .eq('id', id);
    }
    return NextResponse.json({ ok: true });
  }

  return NextResponse.json({ error: '알 수 없는 action' }, { status: 400 });
}

// PATCH: 프로젝트 이름 변경 | 블록 설정 업데이트
export async function PATCH(request: NextRequest) {
  const body = await request.json();
  const { type } = body;

  if (type === 'project') {
    const { id, name } = body;
    const { data, error } = await supabase
      .from('shortstoon_projects')
      .update({ name, updated_at: new Date().toISOString() })
      .eq('id', id)
      .select()
      .single();
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json(data);
  }

  if (type === 'block') {
    const { id, ...fields } = body;
    delete fields.type;
    const { data, error } = await supabase
      .from('shortstoon_blocks')
      .update({ ...fields, updated_at: new Date().toISOString() })
      .eq('id', id)
      .select()
      .single();
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json(data);
  }

  return NextResponse.json({ error: '알 수 없는 type' }, { status: 400 });
}

// DELETE: 프로젝트 or 블록 삭제
export async function DELETE(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const projectId = searchParams.get('projectId');
  const blockId = searchParams.get('blockId');

  if (projectId) {
    const { error } = await supabase
      .from('shortstoon_projects')
      .delete()
      .eq('id', projectId);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ ok: true });
  }

  if (blockId) {
    const { error } = await supabase
      .from('shortstoon_blocks')
      .delete()
      .eq('id', blockId);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ ok: true });
  }

  return NextResponse.json({ error: 'projectId 또는 blockId 필요' }, { status: 400 });
}
