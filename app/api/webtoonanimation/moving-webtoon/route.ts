import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

/**
 * GET: 무빙웹툰 프로젝트 조회 (project_id로)
 */
export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const projectId = searchParams.get('projectId');
  const listProjects = searchParams.get('list');

  // 프로젝트 목록 조회 (컷 수 포함)
  if (listProjects === 'true') {
    const { data: projects, error } = await supabase
      .from('moving_webtoon_projects')
      .select('*, moving_webtoon_cuts(count)')
      .order('created_at', { ascending: false })
      .limit(20);

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    const result = (projects || [])
      .map((p) => ({
        ...p,
        cut_count: p.moving_webtoon_cuts?.[0]?.count || 0,
        moving_webtoon_cuts: undefined,
      }))
      .filter((p) => p.cut_count > 0);

    return NextResponse.json({ projects: result });
  }

  if (!projectId) {
    return NextResponse.json({ error: 'projectId 필요' }, { status: 400 });
  }

  // 무빙웹툰 프로젝트 조회
  const { data: mwProject, error: projError } = await supabase
    .from('moving_webtoon_projects')
    .select('*')
    .eq('project_id', projectId)
    .maybeSingle();

  if (projError) {
    return NextResponse.json({ error: projError.message }, { status: 500 });
  }

  if (!mwProject) {
    return NextResponse.json({ project: null, cuts: [] });
  }

  // 무빙웹툰 컷 조회 (원본 컷 정보 포함)
  const { data: mwCuts, error: cutsError } = await supabase
    .from('moving_webtoon_cuts')
    .select('*')
    .eq('moving_project_id', mwProject.id)
    .order('order_index');

  if (cutsError) {
    return NextResponse.json({ error: cutsError.message }, { status: 500 });
  }

  // 원본 컷 이미지 정보 조회
  const cutIds = (mwCuts || []).map((c) => c.cut_id).filter(Boolean);
  let originalCuts: Record<string, { file_path: string; file_name: string }> = {};

  if (cutIds.length > 0) {
    const { data: originals } = await supabase
      .from('webtoonanimation_cuts')
      .select('id, file_path, file_name')
      .in('id', cutIds);

    if (originals) {
      originalCuts = Object.fromEntries(originals.map((c) => [c.id, c]));
    }
  }

  const cutsWithImages = (mwCuts || []).map((c) => ({
    ...c,
    cut: c.cut_id ? originalCuts[c.cut_id] : undefined,
  }));

  return NextResponse.json({ project: mwProject, cuts: cutsWithImages });
}

/**
 * POST: 무빙웹툰 프로젝트 생성 또는 컷 추가
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { action, projectId, cutIds, defaultProvider, defaultMotionType } = body;

    if (action === 'create') {
      const { data, error } = await supabase
        .from('moving_webtoon_projects')
        .insert({
          project_id: projectId,
          name: body.name || '이름없음',
          default_provider: defaultProvider || 'kling-o3-pro',
          default_motion_type: defaultMotionType || 'lip_sync',
        })
        .select()
        .single();

      if (error) throw error;
      return NextResponse.json(data);
    }

    if (action === 'add_cuts') {
      const { movingProjectId, cuts: cutsToAdd } = body;

      if (!movingProjectId || !cutsToAdd?.length) {
        return NextResponse.json({ error: 'movingProjectId, cuts 필요' }, { status: 400 });
      }

      const { data, error } = await supabase
        .from('moving_webtoon_cuts')
        .insert(cutsToAdd.map((c: { cutId: string; orderIndex: number; motionType?: string; prompt?: string }) => ({
          moving_project_id: movingProjectId,
          cut_id: c.cutId,
          order_index: c.orderIndex,
          motion_type: c.motionType || 'lip_sync',
          prompt: c.prompt || null,
        })))
        .select();

      if (error) throw error;
      return NextResponse.json(data);
    }

    return NextResponse.json({ error: 'Unknown action' }, { status: 400 });
  } catch (error) {
    console.error('[moving-webtoon] 실패:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : '요청 실패' },
      { status: 500 }
    );
  }
}

/**
 * PUT: 무빙웹툰 컷 또는 프로젝트 업데이트
 */
export async function PUT(request: NextRequest) {
  try {
    const body = await request.json();

    // 프로젝트 이름 업데이트
    if (body.movingProjectId && body.name !== undefined) {
      const { data, error } = await supabase
        .from('moving_webtoon_projects')
        .update({ name: body.name, updated_at: new Date().toISOString() })
        .eq('id', body.movingProjectId)
        .select()
        .single();

      if (error) throw error;
      return NextResponse.json(data);
    }

    // 컷 업데이트
    const { cutId, ...updates } = body;

    if (!cutId) {
      return NextResponse.json({ error: 'cutId 또는 movingProjectId 필요' }, { status: 400 });
    }

    const allowedFields = ['motion_type', 'prompt', 'provider', 'duration_seconds', 'aspect_ratio', 'order_index'];
    const filtered: Record<string, unknown> = { updated_at: new Date().toISOString() };
    for (const key of allowedFields) {
      if (key in updates) filtered[key] = updates[key];
    }

    const { data, error } = await supabase
      .from('moving_webtoon_cuts')
      .update(filtered)
      .eq('id', cutId)
      .select()
      .single();

    if (error) throw error;
    return NextResponse.json(data);
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : '업데이트 실패' },
      { status: 500 }
    );
  }
}

/**
 * DELETE: 무빙웹툰 컷 삭제
 */
export async function DELETE(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const cutId = searchParams.get('cutId');
  const movingProjectId = searchParams.get('movingProjectId');

  try {
    if (cutId) {
      // 컷의 영상이 있으면 Storage에서도 삭제
      const { data: cut } = await supabase
        .from('moving_webtoon_cuts')
        .select('video_path')
        .eq('id', cutId)
        .single();

      if (cut?.video_path) {
        await supabase.storage.from('webtoon-files').remove([cut.video_path]);
      }

      const { error } = await supabase
        .from('moving_webtoon_cuts')
        .delete()
        .eq('id', cutId);

      if (error) throw error;
      return NextResponse.json({ success: true });
    }

    if (movingProjectId) {
      // 프로젝트 전체 삭제 (cascade로 컷도 삭제됨)
      const { error } = await supabase
        .from('moving_webtoon_projects')
        .delete()
        .eq('id', movingProjectId);

      if (error) throw error;
      return NextResponse.json({ success: true });
    }

    return NextResponse.json({ error: 'cutId 또는 movingProjectId 필요' }, { status: 400 });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : '삭제 실패' },
      { status: 500 }
    );
  }
}
