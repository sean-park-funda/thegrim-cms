import { NextRequest, NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';
import { createClient } from '@supabase/supabase-js';

// 서버 사이드에서 사용할 Supabase 클라이언트 (Service Role Key 사용)
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
const supabaseAdmin = createClient(supabaseUrl, supabaseServiceKey);

// GET: /api/movie/[projectId] - 단일 프로젝트 조회
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ projectId: string }> }
) {
  const { projectId } = await params;
  console.log('[movie][GET] 프로젝트 조회:', projectId);

  // 쿼리 파라미터에서 currentUserId 추출
  const { searchParams } = new URL(request.url);
  const currentUserId = searchParams.get('currentUserId');

  // grid_image_base64는 매우 크기 때문에 조회에서 제외 (성능 최적화)
  const { data, error } = await supabaseAdmin
    .from('movie_projects')
    .select(`
      id,
      title,
      script,
      status,
      video_mode,
      grid_size,
      grid_image_path,
      video_script,
      is_public,
      created_by,
      image_style,
      aspect_ratio,
      created_at,
      updated_at,
      movie_characters (
        id,
        name,
        description,
        image_prompt,
        image_path
      ),
      movie_backgrounds (
        id,
        name,
        image_prompt,
        image_path,
        order_index
      ),
      movie_cuts (
        id,
        cut_index,
        camera_shot,
        camera_angle,
        camera_composition,
        image_prompt,
        characters,
        background_id,
        background_name,
        dialogue,
        duration,
        image_path,
        video_path,
        video_status
      ),
      movie_scenes (
        id,
        scene_index,
        start_panel_path,
        end_panel_path,
        video_prompt,
        duration,
        video_path,
        status,
        error_message
      )
    `)
    .eq('id', projectId)
    .single();

  if (error) {
    console.error('[movie][GET] 조회 실패:', error);
    return NextResponse.json({ error: '프로젝트를 찾을 수 없습니다.' }, { status: 404 });
  }

  // 비공개 프로젝트는 소유자만 볼 수 있음
  if (!data.is_public && data.created_by !== currentUserId) {
    return NextResponse.json({ error: '접근 권한이 없습니다.' }, { status: 403 });
  }

  return NextResponse.json(data);
}

// PATCH: /api/movie/[projectId] - 프로젝트 수정
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ projectId: string }> }
) {
  const { projectId } = await params;
  console.log('[movie][PATCH] 프로젝트 수정:', projectId);

  const body = await request.json().catch(() => null) as {
    title?: string;
    script?: string;
    status?: string;
    video_mode?: 'cut-to-cut' | 'per-cut';
    grid_size?: '2x2' | '3x3';
    is_public?: boolean;
    video_script?: Record<string, unknown>;
    image_style?: 'realistic' | 'cartoon';
    aspect_ratio?: '16:9' | '9:16';
  } | null;

  if (!body) {
    return NextResponse.json({ error: '수정할 내용이 필요합니다.' }, { status: 400 });
  }

  const updateData: Record<string, unknown> = {};
  if (body.title !== undefined) updateData.title = body.title;
  if (body.script !== undefined) updateData.script = body.script;
  if (body.status !== undefined) updateData.status = body.status;
  if (body.is_public !== undefined) updateData.is_public = body.is_public;
  if (body.video_script !== undefined) updateData.video_script = body.video_script;
  if (body.image_style !== undefined) updateData.image_style = body.image_style;
  if (body.aspect_ratio !== undefined) updateData.aspect_ratio = body.aspect_ratio;

  // 설정 변경 시 기존 데이터 초기화 여부 확인
  const settingsChanged = body.video_mode !== undefined || body.grid_size !== undefined;

  if (body.video_mode !== undefined) updateData.video_mode = body.video_mode;
  if (body.grid_size !== undefined) updateData.grid_size = body.grid_size;

  // 설정 변경 시 기존 스크립트와 이미지 초기화
  if (settingsChanged) {
    updateData.video_script = null;
    updateData.grid_image_path = null;
    updateData.status = 'draft';

    // 기존 씬 삭제
    await supabaseAdmin
      .from('movie_scenes')
      .delete()
      .eq('project_id', projectId);
  }

  const { data, error } = await supabaseAdmin
    .from('movie_projects')
    .update(updateData)
    .eq('id', projectId)
    .select()
    .single();

  if (error) {
    console.error('[movie][PATCH] 수정 실패:', error);
    return NextResponse.json({ error: '프로젝트 수정에 실패했습니다.' }, { status: 500 });
  }

  return NextResponse.json(data);
}

// DELETE: /api/movie/[projectId] - 프로젝트 삭제
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ projectId: string }> }
) {
  const { projectId } = await params;
  console.log('[movie][DELETE] 프로젝트 삭제:', projectId);

  const { error } = await supabaseAdmin
    .from('movie_projects')
    .delete()
    .eq('id', projectId);

  if (error) {
    console.error('[movie][DELETE] 삭제 실패:', error);
    return NextResponse.json({ error: '프로젝트 삭제에 실패했습니다.' }, { status: 500 });
  }

  return NextResponse.json({ success: true });
}
