import { NextRequest, NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';

// GET: /api/shorts/[projectId] - 단일 프로젝트 조회
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ projectId: string }> }
) {
  const { projectId } = await params;
  console.log('[shorts][GET] 프로젝트 조회:', projectId);

  const { data, error } = await supabase
    .from('shorts_projects')
    .select(`
      id,
      title,
      script,
      status,
      grid_image_path,
      grid_image_base64,
      video_script,
      created_at,
      updated_at,
      shorts_characters (
        id,
        name,
        description,
        image_path
      ),
      shorts_scenes (
        id,
        scene_index,
        start_panel_path,
        end_panel_path,
        video_prompt,
        video_path,
        status,
        error_message
      )
    `)
    .eq('id', projectId)
    .single();

  if (error) {
    console.error('[shorts][GET] 조회 실패:', error);
    return NextResponse.json({ error: '프로젝트를 찾을 수 없습니다.' }, { status: 404 });
  }

  return NextResponse.json(data);
}

// PATCH: /api/shorts/[projectId] - 프로젝트 수정
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ projectId: string }> }
) {
  const { projectId } = await params;
  console.log('[shorts][PATCH] 프로젝트 수정:', projectId);

  const body = await request.json().catch(() => null) as {
    title?: string;
    script?: string;
    status?: string;
  } | null;

  if (!body) {
    return NextResponse.json({ error: '수정할 내용이 필요합니다.' }, { status: 400 });
  }

  const updateData: Record<string, unknown> = {};
  if (body.title !== undefined) updateData.title = body.title;
  if (body.script !== undefined) updateData.script = body.script;
  if (body.status !== undefined) updateData.status = body.status;

  const { data, error } = await supabase
    .from('shorts_projects')
    .update(updateData)
    .eq('id', projectId)
    .select()
    .single();

  if (error) {
    console.error('[shorts][PATCH] 수정 실패:', error);
    return NextResponse.json({ error: '프로젝트 수정에 실패했습니다.' }, { status: 500 });
  }

  return NextResponse.json(data);
}

// DELETE: /api/shorts/[projectId] - 프로젝트 삭제
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ projectId: string }> }
) {
  const { projectId } = await params;
  console.log('[shorts][DELETE] 프로젝트 삭제:', projectId);

  const { error } = await supabase
    .from('shorts_projects')
    .delete()
    .eq('id', projectId);

  if (error) {
    console.error('[shorts][DELETE] 삭제 실패:', error);
    return NextResponse.json({ error: '프로젝트 삭제에 실패했습니다.' }, { status: 500 });
  }

  return NextResponse.json({ success: true });
}
