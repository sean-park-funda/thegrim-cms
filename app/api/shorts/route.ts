import { NextRequest, NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';

// shorts_projects 타입 정의
interface ShortsProject {
  id: string;
  title: string | null;
  script: string;
  status: string;
  grid_image_path: string | null;
  video_script: unknown;
  created_at: string;
  updated_at: string;
}

// GET: /api/shorts - 모든 프로젝트 목록 조회
export async function GET() {
  console.log('[shorts][GET] 프로젝트 목록 조회');

  const { data, error } = await supabase
    .from('shorts_projects')
    .select(`
      id,
      title,
      script,
      status,
      grid_image_path,
      video_script,
      created_at,
      updated_at,
      shorts_characters (
        id,
        name,
        image_path
      ),
      shorts_scenes (
        id,
        scene_index,
        status,
        video_path
      )
    `)
    .order('created_at', { ascending: false });

  if (error) {
    console.error('[shorts][GET] 조회 실패:', error);
    return NextResponse.json({ error: '프로젝트 조회에 실패했습니다.' }, { status: 500 });
  }

  return NextResponse.json(data ?? []);
}

// POST: /api/shorts - 새 프로젝트 생성
export async function POST(request: NextRequest) {
  console.log('[shorts][POST] 새 프로젝트 생성');

  const body = await request.json().catch(() => null) as {
    title?: string;
    script?: string;
  } | null;

  const script = body?.script?.trim();
  const title = body?.title?.trim() || null;

  if (!script) {
    return NextResponse.json({ error: '대본(script)이 필요합니다.' }, { status: 400 });
  }

  const { data, error } = await supabase
    .from('shorts_projects')
    .insert({
      title,
      script,
      status: 'draft',
    })
    .select()
    .single();

  if (error) {
    console.error('[shorts][POST] 생성 실패:', error);
    return NextResponse.json({ error: '프로젝트 생성에 실패했습니다.' }, { status: 500 });
  }

  return NextResponse.json(data, { status: 201 });
}
